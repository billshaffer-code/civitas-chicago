-- CIVITAS – Layer 3: VIEW_PROPERTY_SCORE
-- Aggregates triggered flags into a single risk score and tier per location.
-- Run after 02_flags.sql view exists.

CREATE OR REPLACE VIEW view_property_score AS
SELECT
    vpf.location_sk,
    SUM(vpf.severity_score)                         AS raw_score,
    CASE
        WHEN SUM(vpf.severity_score) >= 75 THEN 'HIGH'
        WHEN SUM(vpf.severity_score) >= 50 THEN 'ELEVATED'
        WHEN SUM(vpf.severity_score) >= 25 THEN 'MODERATE'
        ELSE                                     'LOW'
    END                                             AS risk_tier,
    COUNT(*)                                        AS flag_count,
    ARRAY_AGG(vpf.flag_code ORDER BY vpf.category, vpf.severity_score DESC)
                                                    AS triggered_flags
FROM view_property_flags vpf
GROUP BY vpf.location_sk;
