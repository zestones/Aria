-- ============================================
-- ARIA — KPI System (real-time SQL functions only)
-- Real-time OEE/MTBF/MTTR — no pre-aggregation tables.
-- Kept:
--   - fn_status_durations  (helper)
--   - fn_oee               (real-time OEE)
--   - fn_oee_bucketed      (time-series OEE)
--   - fn_mttr              (mean time to repair)
--   - fn_mtbf              (mean time between failures)
-- ============================================
-- Helper: status durations within an arbitrary time window per cell
CREATE OR REPLACE FUNCTION fn_status_durations(p_cell_ids integer[], p_window_start timestamptz, p_window_end timestamptz)
    RETURNS TABLE(
        cell_id integer,
        status_code integer,
        duration_secs double precision)
    LANGUAGE SQL
    STABLE
    AS $$
    SELECT
        ms.cell_id,
        ms.status_code,
        SUM(EXTRACT(EPOCH FROM(LEAST(COALESCE(ms.end_time, NOW()), p_window_end) - GREATEST(ms.time, p_window_start)))) AS duration_secs
    FROM
        machine_status ms
    WHERE
        ms.cell_id = ANY(p_cell_ids)
        AND ms.time < p_window_end
        AND(ms.end_time IS NULL
            OR ms.end_time > p_window_start)
    GROUP BY
        ms.cell_id,
        ms.status_code;
$$;

-- OEE Full — per-cell then averaged (avoids inflated Performance across mixed cells)
CREATE OR REPLACE FUNCTION fn_oee(p_cell_ids integer[], p_window_start timestamptz, p_window_end timestamptz)
    RETURNS TABLE(
        availability double precision,
        performance double precision,
        quality double precision,
        oee double precision)
    LANGUAGE SQL
    STABLE
    AS $$
    WITH durations AS(
        SELECT
            d.cell_id,
            COALESCE(SUM(d.duration_secs) FILTER(WHERE msc.status_category = 'running'), 0) AS running_secs,
            COALESCE(SUM(d.duration_secs) FILTER(WHERE msc.status_category = 'unplanned_stop'), 0) AS unplanned_secs
        FROM
            fn_status_durations(p_cell_ids, p_window_start, p_window_end) d
            JOIN machine_status_code msc ON d.status_code = msc.status_code
        GROUP BY
            d.cell_id
),
pieces AS(
    SELECT
        pe.cell_id,
        COUNT(*) AS total_pieces,
        COUNT(*) FILTER(WHERE qc.is_conformant = TRUE) AS good_pieces
    FROM
        production_event pe
        JOIN quality_code qc ON pe.piece_quality = qc.quality_code
    WHERE
        pe.cell_id = ANY(p_cell_ids)
        AND pe.time >= p_window_start
        AND pe.time < p_window_end
    GROUP BY
        pe.cell_id
),
per_cell AS(
    SELECT
        d.cell_id,
        CASE WHEN(d.running_secs + d.unplanned_secs) = 0 THEN
            NULL
        ELSE
            d.running_secs /(d.running_secs + d.unplanned_secs)
        END AS a,
        CASE WHEN d.running_secs = 0
            OR c.ideal_cycle_time_seconds IS NULL THEN
            NULL
        ELSE
(COALESCE(p.total_pieces, 0) * c.ideal_cycle_time_seconds) / d.running_secs
        END AS p,
        CASE WHEN COALESCE(p.total_pieces, 0) = 0 THEN
            NULL
        ELSE
            p.good_pieces::double PRECISION / p.total_pieces
        END AS q
    FROM
        durations d
        JOIN cell c ON c.id = d.cell_id
        LEFT JOIN pieces p ON p.cell_id = d.cell_id
)
SELECT
    AVG(pc.a),
    AVG(pc.p),
    AVG(pc.q),
    AVG(pc.a * pc.p * pc.q)
FROM
    per_cell pc;
$$;

-- MTTR (Mean Time To Repair)
CREATE OR REPLACE FUNCTION fn_mttr(p_cell_ids integer[], p_window_start timestamptz, p_window_end timestamptz)
    RETURNS double precision
    LANGUAGE SQL
    STABLE
    AS $$
    SELECT
        AVG(EXTRACT(EPOCH FROM(LEAST(COALESCE(ms.end_time, NOW()), p_window_end) - GREATEST(ms.time, p_window_start))))
    FROM
        machine_status ms
        JOIN machine_status_code msc ON ms.status_code = msc.status_code
    WHERE
        ms.cell_id = ANY(p_cell_ids)
        AND msc.status_category = 'unplanned_stop'
        AND ms.time < p_window_end
        AND(ms.end_time IS NULL
            OR ms.end_time > p_window_start);
$$;

-- MTBF (Mean Time Between Failures)
CREATE OR REPLACE FUNCTION fn_mtbf(p_cell_ids integer[], p_window_start timestamptz, p_window_end timestamptz)
    RETURNS double precision
    LANGUAGE SQL
    STABLE
    AS $$
    WITH run_time AS(
        SELECT
            COALESCE(SUM(d.duration_secs), 0) AS run_secs
        FROM
            fn_status_durations(p_cell_ids, p_window_start, p_window_end) d
            JOIN machine_status_code msc ON d.status_code = msc.status_code
        WHERE
            msc.status_category = 'running'
),
faults AS(
    SELECT
        COUNT(*) AS fault_count
    FROM
        machine_status ms
        JOIN machine_status_code msc ON ms.status_code = msc.status_code
    WHERE
        ms.cell_id = ANY(p_cell_ids)
        AND msc.status_category = 'unplanned_stop'
        AND ms.time >= p_window_start
        AND ms.time < p_window_end
)
SELECT
    CASE WHEN faults.fault_count = 0 THEN
        NULL
    ELSE
        run_time.run_secs / faults.fault_count
    END
FROM
    run_time,
    faults;
$$;

-- OEE Bucketed — time-series for charts
CREATE OR REPLACE FUNCTION fn_oee_bucketed(p_cell_ids integer[], p_window_start timestamptz, p_window_end timestamptz, p_bucket interval DEFAULT '1 hour')
    RETURNS TABLE(
        bucket timestamptz,
        cell_id integer,
        availability double precision,
        performance double precision,
        quality double precision,
        oee double precision)
    LANGUAGE SQL
    STABLE
    AS $$
    WITH status_exploded AS(
        SELECT
            b.bucket,
            ms.cell_id,
            msc.status_category,
            EXTRACT(EPOCH FROM(LEAST(COALESCE(ms.end_time, NOW()), p_window_end, b.bucket + p_bucket) - GREATEST(ms.time, p_window_start, b.bucket))) AS duration_secs
        FROM
            machine_status ms
            JOIN machine_status_code msc ON ms.status_code = msc.status_code
            CROSS JOIN LATERAL generate_series(time_bucket(p_bucket, GREATEST(ms.time, p_window_start)), time_bucket(p_bucket, LEAST(COALESCE(ms.end_time, NOW()), p_window_end) - INTERVAL '1 microsecond'), p_bucket) AS b(bucket)
        WHERE
            ms.cell_id = ANY(p_cell_ids)
            AND ms.time < p_window_end
            AND(ms.end_time IS NULL
                OR ms.end_time > p_window_start)
),
durations AS(
    SELECT
        se.bucket,
        se.cell_id,
        COALESCE(SUM(se.duration_secs) FILTER(WHERE se.status_category = 'running'), 0) AS running_secs,
        COALESCE(SUM(se.duration_secs) FILTER(WHERE se.status_category = 'unplanned_stop'), 0) AS unplanned_secs
    FROM
        status_exploded se
    WHERE
        se.duration_secs > 0
    GROUP BY
        se.bucket,
        se.cell_id
),
pieces_bucketed AS(
    SELECT
        time_bucket(p_bucket, pe.time) AS bucket,
        pe.cell_id,
        COUNT(*) AS total_pieces,
        COUNT(*) FILTER(WHERE qc.is_conformant = TRUE) AS good_pieces
    FROM
        production_event pe
        JOIN quality_code qc ON pe.piece_quality = qc.quality_code
    WHERE
        pe.cell_id = ANY(p_cell_ids)
        AND pe.time >= p_window_start
        AND pe.time < p_window_end
    GROUP BY
        bucket,
        pe.cell_id
),
cyc AS(
    SELECT
        c.id AS cell_id,
        c.ideal_cycle_time_seconds AS ict
    FROM
        cell c
    WHERE
        c.id = ANY(p_cell_ids)
        AND c.ideal_cycle_time_seconds IS NOT NULL
)
SELECT
    d.bucket,
    d.cell_id,
    CASE WHEN(d.running_secs + d.unplanned_secs) = 0 THEN
        NULL
    ELSE
        d.running_secs /(d.running_secs + d.unplanned_secs)
    END AS availability,
    CASE WHEN d.running_secs = 0
        OR cy.ict IS NULL THEN
        NULL
    ELSE
(COALESCE(pb.total_pieces, 0) * cy.ict) / d.running_secs
    END AS performance,
    CASE WHEN COALESCE(pb.total_pieces, 0) = 0 THEN
        NULL
    ELSE
        COALESCE(pb.good_pieces, 0)::double PRECISION / pb.total_pieces
    END AS quality,
    CASE WHEN(d.running_secs + d.unplanned_secs) = 0
        OR d.running_secs = 0
        OR cy.ict IS NULL
        OR COALESCE(pb.total_pieces, 0) = 0 THEN
        NULL
    ELSE
(d.running_secs /(d.running_secs + d.unplanned_secs)) *((COALESCE(pb.total_pieces, 0) * cy.ict) / d.running_secs) *(COALESCE(pb.good_pieces, 0)::double PRECISION / pb.total_pieces)
    END AS oee
FROM
    durations d
    LEFT JOIN pieces_bucketed pb ON d.bucket = pb.bucket
        AND d.cell_id = pb.cell_id
    LEFT JOIN cyc cy ON d.cell_id = cy.cell_id
ORDER BY
    d.bucket,
    d.cell_id;
$$;

