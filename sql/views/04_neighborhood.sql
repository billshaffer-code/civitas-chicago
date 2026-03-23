-- CIVITAS – Layer 4: VIEW_COMMUNITY_AREA_SUMMARY (Materialized)
-- Aggregates property-level metrics to community area level.
-- Depends on: view_property_summary, view_property_score, dim_community_area

DROP MATERIALIZED VIEW IF EXISTS view_community_area_summary;

CREATE MATERIALIZED VIEW view_community_area_summary AS
SELECT
    ca.community_area_id,
    ca.name                                                        AS community_area_name,

    -- ── Property counts ─────────────────────────────────────────
    COUNT(DISTINCT vps.location_sk)                                AS property_count,

    -- ── Activity score ──────────────────────────────────────────
    ROUND(AVG(sc.raw_score), 1)                                    AS avg_activity_score,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sc.raw_score)      AS median_activity_score,

    -- ── Level distribution ──────────────────────────────────────
    COUNT(*) FILTER (WHERE sc.activity_level = 'QUIET')            AS quiet_count,
    COUNT(*) FILTER (WHERE sc.activity_level = 'TYPICAL')          AS typical_count,
    COUNT(*) FILTER (WHERE sc.activity_level = 'ACTIVE')           AS active_count,
    COUNT(*) FILTER (WHERE sc.activity_level = 'COMPLEX')          AS complex_count,

    -- ── Per-property averages ───────────────────────────────────
    ROUND(AVG(vps.total_violations), 1)                            AS avg_violations,
    ROUND(AVG(vps.active_violation_count), 1)                      AS avg_active_violations,
    ROUND(AVG(vps.sr_count_12mo), 1)                               AS avg_311_12mo,
    ROUND(AVG(vps.total_lien_events), 1)                           AS avg_lien_events,
    ROUND(AVG(vps.avg_permit_processing_days))                     AS avg_permit_processing_days,
    ROUND(AVG(vps.failed_inspection_count_24mo), 1)                AS avg_failed_inspections_24mo,

    -- ── Totals ──────────────────────────────────────────────────
    SUM(vps.total_violations)                                      AS total_violations,
    SUM(vps.sr_count_12mo)                                         AS total_311_12mo,
    SUM(vps.total_lien_events)                                     AS total_lien_events,
    COALESCE(SUM(vps.total_lien_amount), 0)                        AS total_lien_amount,
    SUM(vps.vacant_violation_count)                                AS total_vacant_violations

FROM dim_community_area ca
JOIN dim_location dl ON dl.community_area_id = ca.community_area_id
JOIN view_property_summary vps ON vps.location_sk = dl.location_sk
LEFT JOIN view_property_score sc ON sc.location_sk = dl.location_sk

GROUP BY ca.community_area_id, ca.name;

-- Unique index for fast lookups and CONCURRENTLY refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_matview_ca_summary
    ON view_community_area_summary(community_area_id);
