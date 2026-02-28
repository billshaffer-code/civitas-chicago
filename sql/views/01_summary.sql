-- CIVITAS – Layer 1: VIEW_PROPERTY_SUMMARY
-- Aggregates all fact table metrics per location_sk.
-- Run after schema and data load.

CREATE OR REPLACE VIEW view_property_summary AS
SELECT
    l.location_sk,
    l.full_address_standardized,
    l.house_number,
    l.street_direction,
    l.street_name,
    l.street_type,
    l.zip,
    l.lat,
    l.lon,

    -- ── Violation aggregates ──────────────────────────────────────
    COUNT(DISTINCT v.violation_sk)                                                  AS total_violations,

    COUNT(DISTINCT v.violation_sk)
        FILTER (WHERE UPPER(v.violation_status) = 'OPEN')                           AS active_violation_count,

    COALESCE(
        MAX(NOW()::DATE - v.violation_date)
            FILTER (WHERE UPPER(v.violation_status) = 'OPEN'),
        0
    )                                                                               AS oldest_open_violation_days,

    -- violations in the prior calendar year
    COUNT(DISTINCT v.violation_sk)
        FILTER (WHERE v.violation_date >= DATE_TRUNC('year', NOW()) - INTERVAL '1 year'
                  AND v.violation_date  < DATE_TRUNC('year', NOW()))                AS violations_prev_year,

    -- violations in the current calendar year
    COUNT(DISTINCT v.violation_sk)
        FILTER (WHERE v.violation_date >= DATE_TRUNC('year', NOW()))                AS violations_this_year,

    -- failed inspections linked to violations
    COUNT(DISTINCT v.violation_sk)
        FILTER (WHERE UPPER(v.inspection_status) LIKE '%FAIL%')                     AS failed_violation_count,

    -- ── Inspection aggregates (food_inspections) ──────────────────
    COUNT(DISTINCT i.inspection_sk)
        FILTER (WHERE i.results ILIKE '%fail%'
                  AND i.inspection_date >= NOW() - INTERVAL '24 months')            AS failed_inspection_count_24mo,

    -- ── Permit aggregates ─────────────────────────────────────────
    ROUND(AVG(p.processing_time))                                                   AS avg_permit_processing_days,

    COUNT(DISTINCT p.permit_sk)
        FILTER (WHERE p.processing_time > 90)                                       AS delayed_permit_count,

    -- ── 311 aggregates ────────────────────────────────────────────
    COUNT(DISTINCT sr.sr_sk)
        FILTER (WHERE sr.created_date >= NOW() - INTERVAL '12 months')              AS sr_count_12mo,

    -- ── Tax lien aggregates ───────────────────────────────────────
    COUNT(DISTINCT tl.lien_sk)                                                      AS total_lien_events,

    MAX(tl.tax_sale_year)                                                           AS latest_lien_year,

    COALESCE(SUM(tl.total_amount_offered), 0)                                       AS total_lien_amount,

    -- data freshness helpers
    MAX(v.updated_at)                                                               AS violations_updated_at,
    MAX(p.updated_at)                                                               AS permits_updated_at,
    MAX(i.updated_at)                                                               AS inspections_updated_at,
    MAX(sr.updated_at)                                                              AS sr_updated_at,
    MAX(tl.updated_at)                                                              AS liens_updated_at

FROM dim_location l
LEFT JOIN fact_violation  v  ON v.location_sk  = l.location_sk
LEFT JOIN fact_inspection i  ON i.location_sk  = l.location_sk
LEFT JOIN fact_permit     p  ON p.location_sk  = l.location_sk
LEFT JOIN fact_311        sr ON sr.location_sk = l.location_sk
LEFT JOIN fact_tax_lien   tl ON tl.location_sk = l.location_sk

GROUP BY
    l.location_sk,
    l.full_address_standardized,
    l.house_number,
    l.street_direction,
    l.street_name,
    l.street_type,
    l.zip,
    l.lat,
    l.lon;
