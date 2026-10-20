"""
Pydantic schemas for UC-05 Automation Workload Preview SaaS.
"""
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, ConfigDict, Field


class JobRecordSchema(BaseModel):
    record_id: str
    tool: str
    record_count: int
    environment: str

    model_config = ConfigDict(extra="forbid")


class RunRequestSchema(BaseModel):
    operation: Literal["validate", "process"]
    records: List[Dict[str, Any]] = Field(..., min_length=1, max_length=10)

    model_config = ConfigDict(extra="forbid")


class ValidationIssue(BaseModel):
    row_index: int
    field: str
    rule_id: str


class ValidateResult(BaseModel):
    valid_rows: int
    invalid_rows: int
    issues: List[ValidationIssue]


class ProcessSummary(BaseModel):
    input_rows: int
    total_records: int
    total_estimated_ms: int


class ProcessRow(BaseModel):
    record_id: str
    estimated_ms: int


class ProcessResult(BaseModel):
    summary: ProcessSummary
    rows: List[ProcessRow]
    issues: List[ValidationIssue] = []


class RunResponse(BaseModel):
    run_id: str
    status: str
    operation: str
    result: Optional[Any] = None
    error: Optional[str] = None
    created_at: Optional[str] = None


class RunSummaryItem(BaseModel):
    run_id: str
    status: str
    operation: str
    created_at: Optional[str] = None


class SubscriptionResponse(BaseModel):
    tenant_id: str
    plan: str
    status: str
    daily_limit: int
    daily_quota: int
    used_today: int
    remaining: int
    remaining_quota: int



class ToolItem(BaseModel):
    name: str
    description: str
    environments: List[str]


class ToolsResponse(BaseModel):
    tools: List[ToolItem]
    allowed_operations: List[str]
    rate_ms_per_record: int = 10
