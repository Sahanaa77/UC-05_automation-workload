import os
import uuid
from datetime import datetime, timezone
from typing import Generator

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    create_engine,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import declarative_base, relationship, sessionmaker, Session
from sqlalchemy.types import TypeDecorator, CHAR

from pathlib import Path

# DB: use DATABASE_URL if set (Postgres, JSONB), otherwise default to SQLite file backend/entitlesim.db
_default_sqlite_path = Path(__file__).resolve().parent.parent / "entitlesim.db"
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    DATABASE_URL = f"sqlite:///{_default_sqlite_path.as_posix()}"
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Platform-independent UUID and JSON types
class GUID(TypeDecorator):
    """Platform-independent GUID/UUID type.
    Uses PostgreSQL's UUID type, otherwise uses CHAR(36), storing as stringified hex values.
    """
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if dialect.name == "postgresql":
            return str(value)
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if isinstance(value, uuid.UUID):
            return str(value)
        return str(value)


JSONType = JSON().with_variant(JSONB, "postgresql")


class ModelRecord(Base):
    __tablename__ = "models"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    definition = Column(JSONType, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    runs = relationship("RunRecord", back_populates="model", cascade="all, delete-orphan")


class RunRecord(Base):
    __tablename__ = "runs"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    model_id = Column(GUID, ForeignKey("models.id"), nullable=True)
    bounds = Column(JSONType, nullable=True)
    fixed = Column(Boolean, default=False, nullable=True)
    stats = Column(JSONType, nullable=True)
    status = Column(String(50), default="running", nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # WorkloadLens UC-05 specific fields
    tenant_id = Column(String(100), nullable=True, index=True)
    idempotency_key = Column(String(100), nullable=True)
    operation = Column(String(50), nullable=True)
    input_fingerprint = Column(String(64), nullable=True)
    result = Column(JSONType, nullable=True)
    error = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("tenant_id", "idempotency_key", name="uq_runs_tenant_idempotency"),
    )

    model = relationship("ModelRecord", back_populates="runs")
    counterexamples = relationship("CounterexampleRecord", back_populates="run", cascade="all, delete-orphan")


class DailyUsageRecord(Base):
    __tablename__ = "daily_usage"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(100), nullable=False, index=True)
    utc_date = Column(String(10), nullable=False, index=True)
    count = Column(Integer, default=0, nullable=False)

    __table_args__ = (
        UniqueConstraint("tenant_id", "utc_date", name="uq_daily_usage_tenant_date"),
    )


class CounterexampleRecord(Base):
    __tablename__ = "counterexamples"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id = Column(GUID, ForeignKey("runs.id"), nullable=False)
    invariant_id = Column(String(50), nullable=False)
    original_trace = Column(JSONType, nullable=False)
    minimal_trace = Column(JSONType, nullable=True)
    state_diffs = Column(JSONType, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    run = relationship("RunRecord", back_populates="counterexamples")
    regression_tests = relationship("RegressionTestRecord", back_populates="counterexample", cascade="all, delete-orphan")


class RegressionTestRecord(Base):
    __tablename__ = "regression_tests"

    id = Column(GUID, primary_key=True, default=lambda: str(uuid.uuid4()))
    counterexample_id = Column(GUID, ForeignKey("counterexamples.id"), nullable=False)
    format = Column(String(50), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    counterexample = relationship("CounterexampleRecord", back_populates="regression_tests")


def init_db() -> None:
    """Create all database tables."""
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Dependency for obtaining a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
