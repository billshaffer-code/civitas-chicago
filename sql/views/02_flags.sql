-- CIVITAS – Layer 2: VIEW_PROPERTY_FLAGS
-- One row per triggered flag per location_sk.
-- Joins to rule_config for severity_score and description.
-- Run after 01_summary.sql view exists.

CREATE OR REPLACE VIEW view_property_flags AS

-- ─────────────────────────────────────────────────────────────────────────────
-- Category A: Active Enforcement Risk
-- ─────────────────────────────────────────────────────────────────────────────

-- A1: ACTIVE_MUNICIPAL_VIOLATION – any open violation
SELECT
    s.location_sk,
    'ACTIVE_MUNICIPAL_VIOLATION'                    AS flag_code,
    rc.category,
    rc.description,
    rc.severity_score,
    s.active_violation_count                        AS supporting_count
FROM view_property_summary s
JOIN rule_config rc
    ON rc.rule_code = 'ACTIVE_MUNICIPAL_VIOLATION' AND rc.is_active = TRUE
WHERE s.active_violation_count > 0

UNION ALL

-- A2: AGED_ENFORCEMENT_RISK – open violation older than 180 days
SELECT
    s.location_sk,
    'AGED_ENFORCEMENT_RISK',
    rc.category,
    rc.description,
    rc.severity_score,
    -- count of specifically aged-open violations
    (
        SELECT COUNT(*)
        FROM fact_violation fv2
        WHERE fv2.location_sk    = s.location_sk
          AND UPPER(fv2.violation_status) = 'OPEN'
          AND fv2.violation_date  < NOW() - INTERVAL '180 days'
    )                                               AS supporting_count
FROM view_property_summary s
JOIN rule_config rc
    ON rc.rule_code = 'AGED_ENFORCEMENT_RISK' AND rc.is_active = TRUE
WHERE s.oldest_open_violation_days > 180

UNION ALL

-- A3: SEVERE_ENFORCEMENT_ACTION – violation where inspection_status indicates failure
SELECT
    s.location_sk,
    'SEVERE_ENFORCEMENT_ACTION',
    rc.category,
    rc.description,
    rc.severity_score,
    s.failed_violation_count                        AS supporting_count
FROM view_property_summary s
JOIN rule_config rc
    ON rc.rule_code = 'SEVERE_ENFORCEMENT_ACTION' AND rc.is_active = TRUE
WHERE s.failed_violation_count > 0

UNION ALL

-- ─────────────────────────────────────────────────────────────────────────────
-- Category B: Recurring Compliance Risk
-- ─────────────────────────────────────────────────────────────────────────────

-- B1: REPEAT_COMPLIANCE_ISSUE – 3+ total violations at address
SELECT
    s.location_sk,
    'REPEAT_COMPLIANCE_ISSUE',
    rc.category,
    rc.description,
    rc.severity_score,
    s.total_violations                              AS supporting_count
FROM view_property_summary s
JOIN rule_config rc
    ON rc.rule_code = 'REPEAT_COMPLIANCE_ISSUE' AND rc.is_active = TRUE
WHERE s.total_violations >= 3

UNION ALL

-- B2: ABOVE_NORMAL_INSPECTION_FAIL – 2+ failed food inspections in 24 months
SELECT
    s.location_sk,
    'ABOVE_NORMAL_INSPECTION_FAIL',
    rc.category,
    rc.description,
    rc.severity_score,
    s.failed_inspection_count_24mo                  AS supporting_count
FROM view_property_summary s
JOIN rule_config rc
    ON rc.rule_code = 'ABOVE_NORMAL_INSPECTION_FAIL' AND rc.is_active = TRUE
WHERE s.failed_inspection_count_24mo >= 2

UNION ALL

-- ─────────────────────────────────────────────────────────────────────────────
-- Category C: Regulatory Friction
-- ─────────────────────────────────────────────────────────────────────────────

-- C1: PERMIT_PROCESSING_DELAY – avg processing time > 90 days
SELECT
    s.location_sk,
    'PERMIT_PROCESSING_DELAY',
    rc.category,
    rc.description,
    rc.severity_score,
    s.delayed_permit_count                          AS supporting_count
FROM view_property_summary s
JOIN rule_config rc
    ON rc.rule_code = 'PERMIT_PROCESSING_DELAY' AND rc.is_active = TRUE
WHERE s.delayed_permit_count > 0

UNION ALL

-- C2: ELEVATED_DISTRESS_SIGNALS – 5+ 311 requests in last 12 months
SELECT
    s.location_sk,
    'ELEVATED_DISTRESS_SIGNALS',
    rc.category,
    rc.description,
    rc.severity_score,
    s.sr_count_12mo                                 AS supporting_count
FROM view_property_summary s
JOIN rule_config rc
    ON rc.rule_code = 'ELEVATED_DISTRESS_SIGNALS' AND rc.is_active = TRUE
WHERE s.sr_count_12mo >= 5

UNION ALL

-- C3: ENFORCEMENT_INTENSITY_INCREASE – violation count rose year-over-year
SELECT
    s.location_sk,
    'ENFORCEMENT_INTENSITY_INCREASE',
    rc.category,
    rc.description,
    rc.severity_score,
    s.violations_this_year                          AS supporting_count
FROM view_property_summary s
JOIN rule_config rc
    ON rc.rule_code = 'ENFORCEMENT_INTENSITY_INCREASE' AND rc.is_active = TRUE
WHERE s.violations_prev_year > 0
  AND s.violations_this_year > s.violations_prev_year

UNION ALL

-- ─────────────────────────────────────────────────────────────────────────────
-- Category D: Tax & Financial Risk
-- ─────────────────────────────────────────────────────────────────────────────

-- D1: ACTIVE_TAX_LIEN – offered at tax sale in current or prior year
SELECT
    s.location_sk,
    'ACTIVE_TAX_LIEN',
    rc.category,
    rc.description,
    rc.severity_score,
    s.total_lien_events                             AS supporting_count
FROM view_property_summary s
JOIN rule_config rc
    ON rc.rule_code = 'ACTIVE_TAX_LIEN' AND rc.is_active = TRUE
WHERE s.latest_lien_year >= EXTRACT(YEAR FROM NOW()) - 1

UNION ALL

-- D2: AGED_TAX_LIEN – lien event older than 3 years with no resolution
SELECT
    s.location_sk,
    'AGED_TAX_LIEN',
    rc.category,
    rc.description,
    rc.severity_score,
    s.total_lien_events                             AS supporting_count
FROM view_property_summary s
JOIN rule_config rc
    ON rc.rule_code = 'AGED_TAX_LIEN' AND rc.is_active = TRUE
WHERE s.total_lien_events > 0
  AND s.latest_lien_year <= EXTRACT(YEAR FROM NOW()) - 3

UNION ALL

-- D3: MULTIPLE_LIEN_EVENTS – appeared at tax sale 2+ times
SELECT
    s.location_sk,
    'MULTIPLE_LIEN_EVENTS',
    rc.category,
    rc.description,
    rc.severity_score,
    s.total_lien_events                             AS supporting_count
FROM view_property_summary s
JOIN rule_config rc
    ON rc.rule_code = 'MULTIPLE_LIEN_EVENTS' AND rc.is_active = TRUE
WHERE s.total_lien_events >= 2

UNION ALL

-- D4: HIGH_VALUE_LIEN – total lien amount > $10,000
SELECT
    s.location_sk,
    'HIGH_VALUE_LIEN',
    rc.category,
    rc.description,
    rc.severity_score,
    s.total_lien_events                             AS supporting_count
FROM view_property_summary s
JOIN rule_config rc
    ON rc.rule_code = 'HIGH_VALUE_LIEN' AND rc.is_active = TRUE
WHERE s.total_lien_amount > 10000;
