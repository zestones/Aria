"""
ARIA — Simulator runtime.

Loads a scenario, instantiates MachineSimulator + SignalSet + ProductionCounter,
and writes ticks into TimescaleDB (machine_status, production_event, process_signal_data).

Resolves cell_id, status mapping, quality mapping, and signal_def_ids by name
from the database (seeded by the canonical demo seed).
"""

from __future__ import annotations

import asyncio
import importlib
import logging
import os
import signal as os_signal
from datetime import datetime, timezone

import asyncpg

from engine.machine import MachineSimulator
from engine.production import ProductionCounter
from engine.signals import SignalSet

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("aria.simulator")


# ── Config from env ──────────────────────────────────────
PG_HOST = os.environ.get("POSTGRES_HOST", "timescaledb")
PG_PORT = int(os.environ.get("POSTGRES_PORT", "5432"))
PG_USER = os.environ["POSTGRES_USER"]
PG_PASS = os.environ["POSTGRES_PASSWORD"]
PG_DB = os.environ["POSTGRES_DB"]

CELL_NAME = os.environ.get("CELL_NAME", "Bottle Filler")
SCENARIO = os.environ.get("SIMULATOR_SCENARIO", "bottle_filler")
MODE = os.environ.get("SIMULATOR_MODE", "demo")
TICK_INTERVAL_S = float(os.environ.get("SIMULATOR_TICK_INTERVAL_S", "1.0"))


async def _connect() -> asyncpg.Pool:
    log.info("connecting to postgres %s:%s/%s", PG_HOST, PG_PORT, PG_DB)
    for attempt in range(30):
        try:
            return await asyncpg.create_pool(
                host=PG_HOST,
                port=PG_PORT,
                user=PG_USER,
                password=PG_PASS,
                database=PG_DB,
                min_size=1,
                max_size=4,
            )
        except (OSError, asyncpg.PostgresError) as exc:
            log.warning("db not ready (%s), retrying...", exc)
            await asyncio.sleep(2)
    raise RuntimeError("could not connect to postgres after 60s")


async def _resolve_cell(pool: asyncpg.Pool, cell_name: str) -> dict:
    """Resolve cell_id, status mapping (raw → status_code), quality mapping, signal_def_ids."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT id FROM cell WHERE name = $1", cell_name)
        if row is None:
            raise RuntimeError(
                f"cell '{cell_name}' not found — was the seed migration applied?"
            )
        cell_id = row["id"]

        status_rows = await conn.fetch(
            "SELECT plc_raw_value, status_code FROM cell_status_mapping WHERE cell_id = $1",
            cell_id,
        )
        status_map = {r["plc_raw_value"]: r["status_code"] for r in status_rows}

        quality_rows = await conn.fetch(
            "SELECT plc_raw_value, quality_code FROM cell_quality_mapping WHERE cell_id = $1",
            cell_id,
        )
        quality_map = {r["plc_raw_value"]: r["quality_code"] for r in quality_rows}

        sig_rows = await conn.fetch(
            """
            SELECT psd.id AS signal_def_id, st.tag_name
            FROM process_signal_definition psd
            JOIN signal_tag st ON st.id = psd.signal_tag_id
            WHERE psd.cell_id = $1
            """,
            cell_id,
        )
        signal_def_by_name = {r["tag_name"]: r["signal_def_id"] for r in sig_rows}

    log.info(
        "resolved cell '%s' id=%d, status_map=%s, signals=%s",
        cell_name,
        cell_id,
        status_map,
        list(signal_def_by_name),
    )
    return {
        "cell_id": cell_id,
        "status_map": status_map,
        "quality_map": quality_map,
        "signal_def_by_name": signal_def_by_name,
    }


async def _close_open_status(pool: asyncpg.Pool, cell_id: int, now: datetime) -> None:
    """End any previously-open machine_status row at startup."""
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE machine_status SET end_time = $1 WHERE cell_id = $2 AND end_time IS NULL",
            now,
            cell_id,
        )


async def _insert_status(
    pool: asyncpg.Pool,
    cell_id: int,
    raw: int,
    status_code: int,
    ts: datetime,
    prev_ts: datetime | None,
) -> None:
    async with pool.acquire() as conn:
        async with conn.transaction():
            if prev_ts is not None:
                await conn.execute(
                    "UPDATE machine_status SET end_time = $1 WHERE cell_id = $2 AND time = $3 AND end_time IS NULL",
                    ts,
                    cell_id,
                    prev_ts,
                )
            await conn.execute(
                """
                INSERT INTO machine_status (time, cell_id, plc_status_raw, status_code, end_time)
                VALUES ($1, $2, $3, $4, NULL)
                ON CONFLICT (time, cell_id) DO NOTHING
                """,
                ts,
                cell_id,
                raw,
                status_code,
            )


async def _insert_production(
    pool: asyncpg.Pool,
    cell_id: int,
    counter: int,
    raw_q: int,
    q_code: int,
    status_code: int,
    ts: datetime,
) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO production_event (time, cell_id, piece_counter, plc_quality_raw, piece_quality, status_code)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (time, cell_id) DO NOTHING
            """,
            ts,
            cell_id,
            counter,
            raw_q,
            q_code,
            status_code,
        )


async def _insert_signals(
    pool: asyncpg.Pool,
    cell_id: int,
    values: dict[str, float],
    signal_def_by_name: dict[str, int],
    ts: datetime,
) -> None:
    rows = [
        (ts, cell_id, signal_def_by_name[name], float(val))
        for name, val in values.items()
        if name in signal_def_by_name
    ]
    if not rows:
        return
    async with pool.acquire() as conn:
        await conn.executemany(
            """
            INSERT INTO process_signal_data (time, cell_id, signal_def_id, raw_value)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (time, signal_def_id) DO NOTHING
            """,
            rows,
        )


async def run() -> None:
    log.info(
        "ARIA simulator starting — cell=%s scenario=%s mode=%s tick=%.2fs",
        CELL_NAME,
        SCENARIO,
        MODE,
        TICK_INTERVAL_S,
    )

    scenario_module = importlib.import_module(f"scenarios.{SCENARIO}")
    config = scenario_module.build(mode=MODE)

    machine = MachineSimulator(config["machine"])
    signals = SignalSet(config["signals"])
    production = ProductionCounter(config["production"])

    pool = await _connect()
    try:
        meta = await _resolve_cell(pool, CELL_NAME)
        cell_id = meta["cell_id"]
        status_map = meta["status_map"]
        quality_map = meta["quality_map"]
        signal_def_by_name = meta["signal_def_by_name"]

        # Reverse mapping for quality: bad_code (1) → first plc_raw_value mapped to it
        quality_raw_for = {sc: raw for raw, sc in quality_map.items()}

        now = datetime.now(timezone.utc)
        await _close_open_status(pool, cell_id, now)

        prev_status_raw: int | None = None
        prev_status_ts: datetime | None = None
        stop_event = asyncio.Event()

        loop = asyncio.get_running_loop()
        for sig in (os_signal.SIGTERM, os_signal.SIGINT):
            loop.add_signal_handler(sig, stop_event.set)

        log.info("entering tick loop (cell_id=%d)", cell_id)
        tick_count = 0
        while not stop_event.is_set():
            ts = datetime.now(timezone.utc)
            tick_count += 1

            # 1. Step machine state
            machine_out = machine.step()
            raw_status = machine_out["status"]
            mapped_status_code = status_map.get(raw_status)
            if mapped_status_code is None:
                log.warning(
                    "raw_status=%d has no cell_status_mapping — skipping", raw_status
                )
                await asyncio.sleep(TICK_INTERVAL_S)
                continue

            # 2. Step signals (may inject a fault code via fault_trigger)
            sig_values, fault_from_signals = signals.tick(
                machine.is_running, machine.tick
            )
            if fault_from_signals is not None:
                # Force machine into FAULT with that specific code
                if fault_from_signals in status_map:
                    raw_status = fault_from_signals
                    mapped_status_code = status_map[raw_status]

            # 3. Status row on transition
            if raw_status != prev_status_raw:
                await _insert_status(
                    pool, cell_id, raw_status, mapped_status_code, ts, prev_status_ts
                )
                prev_status_raw = raw_status
                prev_status_ts = ts

            # 4. Step production
            produced, q_code = production.tick(
                TICK_INTERVAL_S, machine.is_running, sig_values
            )
            if produced:
                raw_q = quality_raw_for.get(q_code, 0)
                await _insert_production(
                    pool,
                    cell_id,
                    production.counter,
                    raw_q,
                    q_code,
                    mapped_status_code,
                    ts,
                )

            # 5. Process signals (every tick — TimescaleDB handles the volume)
            await _insert_signals(pool, cell_id, sig_values, signal_def_by_name, ts)

            if tick_count % 30 == 0:
                log.info(
                    "tick=%d state=%s vib=%.2f temp=%.1f flow=%.0f counter=%d",
                    tick_count,
                    machine.macro_state_name,
                    sig_values.get("vibration_refoulement", 0),
                    sig_values.get("temperature_palier", 0),
                    sig_values.get("debit_refoulement", 0),
                    production.counter,
                )

            try:
                await asyncio.wait_for(stop_event.wait(), timeout=TICK_INTERVAL_S)
            except asyncio.TimeoutError:
                pass

        log.info("stop signal received — shutting down (ticks=%d)", tick_count)
        # Close the final open status row
        if prev_status_ts is not None:
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE machine_status SET end_time = $1 WHERE cell_id = $2 AND time = $3 AND end_time IS NULL",
                    datetime.now(timezone.utc),
                    cell_id,
                    prev_status_ts,
                )
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(run())
