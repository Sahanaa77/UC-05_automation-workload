"""
Database connection and session factory for UC-05 SaaS.
Defaults to SQLite fallback if DATABASE_URL is not set or empty.
"""
import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.models import Base

# Anchor default SQLite location canonically to project root so different CWDs share the same DB
_default_db = Path(__file__).resolve().parent.parent.parent / "automation_preview.db"
DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{_default_db.as_posix()}"

# SQLite needs check_same_thread=False
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Create tables if they do not exist."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI dependency for DB session."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
