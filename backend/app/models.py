"""
SQLAlchemy models for UC-05 SaaS.
Matches migrations/001_runs_dailyusage.sql.
"""
from datetime import datetime, timezone
import json
from sqlalchemy import (
    Column,
    String,
    Integer,
    DateTime,
    Date,
    Text,
    UniqueConstraint,
    PrimaryKeyConstraint,
    Index,
)
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class SubscriptionModel(Base):
    """
    Subscription details per tenant.
    """
    __tablename__ = "subscriptions"

    tenant_id = Column(String(64), primary_key=True)
    plan = Column(String(16), nullable=False, default="Basic")       # "Basic" | "Pro"
    status = Column(String(16), nullable=False, default="Active")     # "Active" | "Suspended"


class DailyUsageModel(Base):
    """
    Daily quota usage counter per tenant for each UTC day.
    Primary key: (tenant_id, usage_date).
    """
    __tablename__ = "DailyUsage"

    tenant_id = Column(String(64), primary_key=True)
    usage_date = Column(Date, primary_key=True)
    count = Column(Integer, default=0, nullable=False)

    __table_args__ = (
        PrimaryKeyConstraint("tenant_id", "usage_date", name="pk_tenant_DailyUsage"),
    )


class RunModel(Base):
    """
    Persisted runs and terminal results.
    Uniqueness on (tenant_id, idempotency_key).
    """
    __tablename__ = "Runs"

    id = Column(String(36), primary_key=True)
    tenant_id = Column(String(64), nullable=False, index=True)
    idempotency_key = Column(String(128), nullable=False)
    operation = Column(String(16), nullable=False)
    input_fingerprint = Column(String(64), nullable=False)
    status = Column(String(16), nullable=False)  # "Running" | "Succeeded" | "Failed"
    result_json = Column(Text, nullable=True)     # JSON-encoded result
    error = Column(Text, nullable=True)          # Recorded error for Failed status
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    finished_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "idempotency_key", name="uq_Runs_tenant_idempotency_key"),
        Index("ix_Runs_tenant_created", "tenant_id", "created_at"),
    )

    def to_dict(self):
        parsed_result = None
        if self.result_json:
            try:
                parsed_result = json.loads(self.result_json)
            except Exception:
                parsed_result = self.result_json

        return {
            "run_id": self.id,
            "status": self.status,
            "operation": self.operation,
            "result": parsed_result,
            "error": self.error,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
        }
