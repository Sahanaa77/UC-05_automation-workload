from __future__ import annotations
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class RecordItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    record_id: Any
    tool: Any
    record_count: Any
    environment: Any


class RunCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operation: Literal["validate", "process"]
    records: List[RecordItem]


class ValidationIssue(BaseModel):
    row_index: int
    field: str
    rule_id: str


class ValidationSummary(BaseModel):
    valid_rows: int
    invalid_rows: int
    issues: List[ValidationIssue]


class ProcessRowResult(BaseModel):
    record_id: str
    tool: str
    record_count: int
    environment: str
    estimated_ms: int


class ProcessSummary(BaseModel):
    input_rows: int
    total_records: int
    total_estimated_ms: int


class ProcessResult(BaseModel):
    summary: ProcessSummary
    rows: List[ProcessRowResult]
    issues: List[ValidationIssue] = Field(default_factory=list)


class WorkloadRunResponse(BaseModel):
    run_id: str
    status: str
    operation: str
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: Optional[str] = None


class ToolMetadata(BaseModel):
    name: str
    description: str
    rate_ms_per_record: int


class ToolsResponse(BaseModel):
    tools: List[ToolMetadata]


class SubscriptionResponse(BaseModel):
    tenant_id: str
    plan: str
    status: str
    daily_quota: int
    used_today: int
    remaining_quota: int
