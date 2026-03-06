"""
CIVITAS – Batch/Portfolio Pydantic models.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel


class BatchUploadResponse(BaseModel):
    batch_id: str
    batch_name: Optional[str]
    total_count: int


class BatchItemStatus(BaseModel):
    row_index: int
    input_address: str
    status: str
    report_id: Optional[str] = None
    activity_score: Optional[int] = None
    activity_level: Optional[str] = None
    flag_count: Optional[int] = None
    error_message: Optional[str] = None


class BatchSummary(BaseModel):
    batch_id: str
    batch_name: Optional[str]
    total_count: int
    completed_count: int
    failed_count: int
    status: str
    created_at: str
    completed_at: Optional[str] = None
    items: List[BatchItemStatus]
    avg_activity_score: Optional[float] = None
    level_distribution: Dict[str, int] = {}


class BatchListItem(BaseModel):
    batch_id: str
    batch_name: Optional[str]
    total_count: int
    completed_count: int
    failed_count: int
    status: str
    created_at: str
