#!/usr/bin/env python3
"""M3.2 — PDF upload + Opus vision extraction smoke test.

Requires:
  1. Stack running:        docker compose up -d
  2. P-02 KB seeded:       make db.seed.p02
  3. Anthropic key set:    ANTHROPIC_API_KEY in .env (real key, not the placeholder)

Run (uses the fixture PDF automatically):
    make backend.smoke.kb_upload

Or with a custom PDF:
    python backend/tests/e2e/kb_upload_smoke.py path/to/manual.pdf [--cell-id 2]

Skip without error when ANTHROPIC_API_KEY is absent or still the placeholder
("sk-ant-replace-me") — remove the key from .env to skip token-burning runs.

The script:
  - Logs in as admin (admin / admin123) to get the access_token cookie.
  - POSTs the PDF to /api/v1/kb/equipment/{cell_id}/upload.
  - Asserts the response is HTTP 200 with EquipmentKbOut shape.
  - Checks at least 3 thresholds returned (Opus extracted something).
  - Checks all P-02 required kb_threshold_key values are present
    (vibration_mm_s, bearing_temp_c, flow_l_min, pressure_bar) — either
    from Opus extraction or bootstrap_thresholds null-stubs.
  - Checks calibration_log has a new entry with source="pdf_extraction".
  - Checks kb_meta.version incremented since before the upload.
  - Prints a summary table, exits 0 on pass, 1 on first failure.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

# Load the project-root .env so ANTHROPIC_API_KEY is visible to this script
# (pydantic-settings only loads it inside the FastAPI app process). Search
# upward from this file for the first .env we find.
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(_PROJECT_ROOT / ".env", override=False)

HOST = os.environ.get("BACKEND_URL", "http://localhost:8000")
CELL_ID_DEFAULT = 1  # P-02 cell in the canonical seed

# Default fixture — committed alongside the test.
_FIXTURE_PDF = Path(__file__).parent.parent / "fixtures" / "GrundfosSFS.pdf"

# Placeholder value written in .env.example — presence means key not configured.
_API_KEY_PLACEHOLDER = "sk-ant-replace-me"

# Keys that must exist in structured_data.thresholds after upload
# (null-alert stubs are acceptable — bootstrap_thresholds fills them).
REQUIRED_THRESHOLD_KEYS = {
    "vibration_mm_s",
    "bearing_temp_c",
    "flow_l_min",
    "pressure_bar",
}

PASS = "\033[32mOK\033[0m  "
FAIL = "\033[31mFAIL\033[0m"


def _ok(label: str) -> None:
    print(f"  {PASS} {label}")


def _fail(label: str, detail: str = "") -> None:
    suffix = f": {detail}" if detail else ""
    print(f"  {FAIL} {label}{suffix}")
    sys.exit(1)


def _check(condition: bool, label: str, detail: str = "") -> None:
    if condition:
        _ok(label)
    else:
        _fail(label, detail)


def main(pdf_path: Path, cell_id: int) -> None:
    # ── API key guard — skip gracefully when key is absent or placeholder ─────
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key or api_key == _API_KEY_PLACEHOLDER:
        print(
            "\n[SKIP] ANTHROPIC_API_KEY not set or is the placeholder value.\n"
            "       Set a real key in .env to run the PDF extraction smoke test.\n"
        )
        sys.exit(0)

    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}")
        sys.exit(1)

    print(f"\n=== M3.2 PDF upload smoke — cell_id={cell_id} — {pdf_path.name} ===\n")

    with httpx.Client(base_url=HOST, follow_redirects=False) as client:

        # ── 1. Login as admin (cookie auto-stored on the client) ──────────────
        print("--- auth ---")
        login_r = client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "admin123"},
        )
        _check(login_r.status_code == 200, "POST /auth/login → 200")
        access_token: str | None = login_r.cookies.get("access_token")
        _check(bool(access_token), "access_token cookie present")

        # ── 2. Read current kb_meta.version before upload ─────────────────────
        print("\n--- pre-upload state ---")
        pre = client.get(f"/api/v1/kb/equipment/{cell_id}")
        if pre.status_code == 404:
            _fail(
                f"GET /kb/equipment/{cell_id} → 404 — is the stack running and P-02 seeded?",
                "make db.seed.p02",
            )
        _check(pre.status_code == 200, f"GET /kb/equipment/{cell_id} → 200")
        pre_data = pre.json()["data"]
        pre_version: int = (
            (pre_data.get("structured_data") or {}).get("kb_meta", {}).get("version", 0)
        )
        pre_log_len: int = len((pre_data.get("structured_data") or {}).get("calibration_log") or [])
        print(f"       pre-version={pre_version}  pre-log-entries={pre_log_len}")

        # ── 3. Upload PDF ──────────────────────────────────────────────────────
        print(f"\n--- upload ({pdf_path.stat().st_size // 1024} KB) ---")
        print("    (Opus vision call in progress — this may take 15-60 seconds)")
        pdf_bytes = pdf_path.read_bytes()
        upload_r = client.post(
            f"/api/v1/kb/equipment/{cell_id}/upload",
            files={"file": (pdf_path.name, pdf_bytes, "application/pdf")},
            cookies={"access_token": access_token} if access_token else {},
            timeout=120.0,  # Opus vision can take up to ~60s on a large PDF
        )

        if upload_r.status_code == 413:
            _fail(
                "POST /kb/equipment/{cell_id}/upload → 413",
                upload_r.json().get("message", ""),
            )
        if upload_r.status_code == 422:
            _fail(
                f"POST /kb/equipment/{cell_id}/upload → 422 (extraction failed)",
                upload_r.json().get("message", ""),
            )
        _check(
            upload_r.status_code == 200,
            f"POST /kb/equipment/{cell_id}/upload → 200",
            f"got {upload_r.status_code}: {upload_r.text[:200]}",
        )

        data = upload_r.json()["data"]
        structured = data.get("structured_data") or {}

        # ── 4. Shape assertions ────────────────────────────────────────────────
        print("\n--- response assertions ---")
        _check("id" in data and "cell_id" in data, "EquipmentKbOut shape (id + cell_id present)")

        thresholds: dict = structured.get("thresholds") or {}
        _check(
            len(thresholds) >= 3,
            f">= 3 thresholds extracted (got {len(thresholds)})",
            str(list(thresholds.keys())[:5]),
        )

        # ── 5. Required P-02 keys (stubs count) ───────────────────────────────
        print("\n--- P-02 required threshold keys ---")
        for key in sorted(REQUIRED_THRESHOLD_KEYS):
            present = key in thresholds
            val = thresholds.get(key, {})
            stub = present and val.get("source") == "pending_calibration"
            label = f"{key} present" + (" (null-stub from bootstrap)" if stub else " (extracted)")
            _check(present, label, "missing — bootstrap_thresholds did not fill it")

        # ── 6. calibration_log ────────────────────────────────────────────────
        print("\n--- calibration_log ---")
        cal_log: list = structured.get("calibration_log") or []
        _check(
            len(cal_log) == pre_log_len + 1,
            f"calibration_log grew by 1 (now {len(cal_log)} entries)",
            f"pre={pre_log_len} post={len(cal_log)}",
        )
        if cal_log:
            last = cal_log[-1]
            _check(
                last.get("source") == "pdf_extraction",
                'last entry source="pdf_extraction"',
                str(last.get("source")),
            )
            _check(
                last.get("calibrated_by") == "kb_builder_agent",
                'last entry calibrated_by="kb_builder_agent"',
                str(last.get("calibrated_by")),
            )

        # ── 7. Version bump ────────────────────────────────────────────────────
        print("\n--- kb_meta ---")
        post_version: int = structured.get("kb_meta", {}).get("version", 0)
        _check(
            post_version == pre_version + 1,
            f"kb_meta.version incremented ({pre_version} → {post_version})",
            f"pre={pre_version} post={post_version}",
        )

        # ── 8. raw_markdown stored ─────────────────────────────────────────────
        print("\n--- raw_markdown ---")
        _check(
            bool(data.get("raw_markdown")),
            "raw_markdown stored in equipment_kb row",
        )

        # ── 9. 413 guard: build a tiny over-limit PDF and check the error ──────
        print("\n--- 51-page guard (no LLM call) ---")
        try:
            from io import BytesIO

            from pypdf import PdfWriter

            writer = PdfWriter()
            for _ in range(51):
                writer.add_blank_page(width=72, height=72)
            buf = BytesIO()
            writer.write(buf)
            oversize = buf.getvalue()
            r413 = client.post(
                f"/api/v1/kb/equipment/{cell_id}/upload",
                files={"file": ("big.pdf", oversize, "application/pdf")},
                cookies={"access_token": access_token} if access_token else {},
                timeout=10.0,
            )
            _check(
                r413.status_code == 413,
                "51-page PDF → 413",
                f"got {r413.status_code}: {r413.text[:100]}",
            )
        except ImportError:
            print("       (skipped — pypdf not installed in test env)")

        # ── 10. 403 guard: unauthenticated upload (fresh client, no cookie jar) ─
        print("\n--- 403 guard (no auth cookie) ---")
        with httpx.Client(base_url=HOST, follow_redirects=False) as anon:
            r403 = anon.post(
                f"/api/v1/kb/equipment/{cell_id}/upload",
                files={"file": (pdf_path.name, b"%PDF-1.4", "application/pdf")},
                timeout=10.0,
            )
        _check(
            r403.status_code in (401, 403),
            f"upload without auth cookie → 401/403 (got {r403.status_code})",
        )

    print(f"\n{'=' * 50}")
    print("ALL CHECKS PASSED")
    print(f"{'=' * 50}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="M3.2 PDF upload smoke test")
    parser.add_argument(
        "pdf",
        type=Path,
        nargs="?",
        default=_FIXTURE_PDF,
        help="Path to a PDF equipment manual (<= 50 pages, default: tests/fixtures/GrundfosSFS.pdf)",
    )
    parser.add_argument(
        "--cell-id",
        type=int,
        default=CELL_ID_DEFAULT,
        help=f"Target cell_id (default: {CELL_ID_DEFAULT})",
    )
    args = parser.parse_args()
    main(args.pdf, args.cell_id)
