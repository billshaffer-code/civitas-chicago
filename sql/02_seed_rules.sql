-- CIVITAS – Rule Config Seed Data
-- Run after 00_schema.sql

INSERT INTO rule_config (rule_code, category, description, severity_score, is_active, version, updated_at) VALUES
-- Category A: Active Enforcement Risk
('ACTIVE_MUNICIPAL_VIOLATION',     'A', 'One or more open building violations',                                    25, true, 1, NOW()),
('AGED_ENFORCEMENT_RISK',          'A', 'Open violation older than 180 days',                                      30, true, 1, NOW()),
('SEVERE_ENFORCEMENT_ACTION',      'A', 'Inspection FAILED with critical violation category',                      35, true, 1, NOW()),
-- Category B: Recurring Compliance Risk
('REPEAT_COMPLIANCE_ISSUE',        'B', '3 or more violations at this address',                                    20, true, 1, NOW()),
('ABOVE_NORMAL_INSPECTION_FAIL',   'B', '2+ failed food inspections in past 24 months',                           15, true, 1, NOW()),
-- Category C: Regulatory Friction
('PERMIT_PROCESSING_DELAY',        'C', 'Permit processing time exceeded 90 days',                                 10, true, 1, NOW()),
('ELEVATED_DISTRESS_SIGNALS',      'C', '5+ 311 service requests in past 12 months',                              10, true, 1, NOW()),
('ENFORCEMENT_INTENSITY_INCREASE', 'C', 'Violation count increased year-over-year',                               15, true, 1, NOW()),
-- Category D: Tax & Financial Risk
('ACTIVE_TAX_LIEN',                'D', 'Property offered at tax sale in current or prior year',                  40, true, 1, NOW()),
('AGED_TAX_LIEN',                  'D', 'Tax lien event older than 3 years with no resolution',                   30, true, 1, NOW()),
('MULTIPLE_LIEN_EVENTS',           'D', 'Property appeared at tax sale 2 or more times',                          35, true, 1, NOW()),
('HIGH_VALUE_LIEN',                'D', 'Total tax amount offered exceeds $10,000',                                25, true, 1, NOW())
ON CONFLICT (rule_code) DO NOTHING;
