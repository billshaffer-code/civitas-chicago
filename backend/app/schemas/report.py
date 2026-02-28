"""
CIVITAS – Report Pydantic models.
"""

from __future__ import annotations
from typing import Any, List, Optional
from datetime import datetime
from pydantic import BaseModel


class ReportRequest(BaseModel):
    location_sk: int
    address: str


class FlagResult(BaseModel):
    flag_code: str
    category: str
    description: str
    severity_score: int
    supporting_count: int


class ViolationRecord(BaseModel):
    violation_date: Optional[str]
    violation_code: Optional[str]
    violation_status: Optional[str]
    violation_description: Optional[str]
    inspection_status: Optional[str]


class InspectionRecord(BaseModel):
    inspection_date: Optional[str]
    dba_name: Optional[str]
    facility_type: Optional[str]
    risk_level: Optional[str]
    inspection_type: Optional[str]
    results: Optional[str]


class PermitRecord(BaseModel):
    permit_number: Optional[str]
    permit_type: Optional[str]
    permit_status: Optional[str]
    application_start_date: Optional[str]
    issue_date: Optional[str]
    processing_time: Optional[int]


class TaxLienRecord(BaseModel):
    tax_sale_year: Optional[int]
    lien_type: Optional[str]
    sold_at_sale: Optional[bool]
    total_amount_offered: Optional[float]
    buyer_name: Optional[str]


class DataFreshness(BaseModel):
    violations_as_of: Optional[str]
    inspections_as_of: Optional[str]
    permits_as_of: Optional[str]
    tax_liens_as_of: Optional[str]
    report_generated_at: str


class ReportHistoryItem(BaseModel):
    report_id: str
    query_address: str
    risk_score: int
    risk_tier: str
    generated_at: str


class ReportResponse(BaseModel):
    report_id: str
    generated_at: str
    property: dict
    match_confidence: str
    risk_score: int
    risk_tier: str                  # LOW | MODERATE | ELEVATED | HIGH
    triggered_flags: List[FlagResult]
    supporting_records: dict
    ai_summary: str
    data_freshness: DataFreshness
    pdf_url: Optional[str]
    disclaimer: str = (
        "This report does not constitute legal advice or a title examination. "
        "It is based solely on structured municipal data as of the dates noted "
        "and must not be used as a substitute for formal title review."
    )
