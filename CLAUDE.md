CLAUDE.md
Project: CIVITAS – Municipal & Tax Risk Agent

Chicago v1 | Real Estate Transaction Intelligence

Purpose

CIVITAS is a deterministic municipal and tax risk intelligence system designed for small real estate law firms and title companies.

It generates structured, explainable property risk reports for use in real estate transactions.

The system:

Aggregates municipal and tax datasets

Applies deterministic red-flag rules

Computes transparent risk scores

Uses Claude only for structured narrative explanation

Produces legally cautious, citation-backed reports

This system does NOT provide legal advice and does NOT replace formal title examination.

Architectural Principles
1. Deterministic First

All risk logic must be:

SQL-based

Rule-driven

Transparent

Auditable

Versioned

Claude must never invent risk factors or compute scores independently.

Claude only interprets structured findings returned by the rule engine.

2. Canonical Data Model (Chicago v1)
Identity Layer

DIM_LOCATION

LOCATION_SK

FULL_ADDRESS_STANDARDIZED

HOUSE_NUMBER

STREET_NAME

STREET_TYPE

UNIT

ZIP

LAT

LON

SOURCE_ADDRESS_RAW

CITY_ID

DIM_PARCEL

PARCEL_SK

PARCEL_ID (PIN)

LOCATION_SK

PROPERTY_CLASS

LOT_SIZE

ASSESSED_VALUE

Operational Fact Tables

FACT_VIOLATION
FACT_INSPECTION
FACT_PERMIT
FACT_311
FACT_TAX_LIEN

All fact tables must include:

LOCATION_SK or PARCEL_SK

SOURCE_DATASET

INGESTION_BATCH_ID

CREATED_AT

UPDATED_AT

Address & Parcel Resolution Requirements

Address matching hierarchy:

Exact Parcel ID match (preferred)

Exact standardized FULL_ADDRESS match

Exact HOUSE_NUMBER + STREET_NAME + ZIP match

Geospatial fallback (within defined radius)

If match confidence is below threshold:
System must return:
"Address match uncertain – manual verification recommended."

No silent fuzzy matches allowed.

Deterministic Red-Flag Rules

Rules must be implemented as SQL views.

Category A – Active Enforcement Risk

ACTIVE_MUNICIPAL_VIOLATION

AGED_ENFORCEMENT_RISK (> 180 days open)

SEVERE_ENFORCEMENT_ACTION

Category B – Recurring Compliance Risk

REPEAT_COMPLIANCE_ISSUE

ABOVE_NORMAL_INSPECTION_FAILURE

Category C – Regulatory Friction

PERMIT_PROCESSING_DELAY

ELEVATED_DISTRESS_SIGNALS

ENFORCEMENT_INTENSITY_INCREASE

Category D – Tax & Financial Risk

ACTIVE_TAX_LIEN

AGED_TAX_LIEN

MULTIPLE_LIEN_EVENTS

HIGH_VALUE_LIEN

All rules must:

Be explainable

Have fixed scoring weights

Be configurable via parameter table

Return structured FLAG_CODE, DESCRIPTION, SEVERITY_SCORE

Risk Scoring Model

Risk scoring must be:

Weighted additive

Fully transparent

Deterministic

Risk tiers:

LOW
MODERATE
ELEVATED
HIGH

Score and triggered flags must always be returned together.

Score without explanation is prohibited.

Rule Engine Architecture

Layer 1 – Aggregation View
VIEW_PROPERTY_SUMMARY

Layer 2 – Flag View
VIEW_PROPERTY_FLAGS

Layer 3 – Scoring View
VIEW_PROPERTY_SCORE

All logic resides in SQL.
No risk computation in AI layer.

AI Integration Contract

Claude receives structured JSON containing:

Property metadata

Triggered flags

Risk score

Supporting records

Data timestamps

Match confidence level

Claude must:

Generate professional, legally cautious summary

Avoid speculation

Avoid predictions

Avoid legal advice

Cite structured findings only

Claude must not:

Invent missing records

Recalculate scores

Override flags

Provide closing recommendations

Report Structure

PDF output must contain:

Page 1 – Executive Summary

Address

Risk Score

Risk Tier

Triggered Flags

AI-generated summary

Disclaimer

Page 2 – Detailed Findings

Violations table

Inspection summary

Permit summary

Tax lien summary

Page 3 – Methodology Appendix

Rule definitions

Data sources

Scoring explanation

Timestamp of data freshness

Governance & Compliance

All ingestion must be versioned

No destructive updates

All rule changes must be version-controlled

Data freshness timestamp must be displayed

All reports must include legal disclaimer

Constraints

Claude must never:

Replace title examination

Offer legal advice

Suggest transaction decisions

Make probabilistic risk claims

Modify deterministic rule outputs

All AI output must be grounded in structured input.

MVP Scope

City: Chicago only
Datasets required:

Violations

Inspections

Permits

311

Tax liens

UI:

Simple property input form

Deterministic report generation

PDF output

No multi-city support in v1.

Long-Term Objective

CIVITAS becomes a transaction-adjacent municipal intelligence layer for:

Real estate law firms

Title companies

Acquisition teams

Future expansion:

Multi-city support

Portfolio batch analysis

API access

Enterprise integration