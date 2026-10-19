from typing import Generator
from contextlib import contextmanager
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from backend.config import DATABASE_URL

engine_kwargs = {
    "pool_pre_ping": True,
    "echo": False
}

if "sqlite" in DATABASE_URL:
    engine_kwargs["connect_args"] = {
        "check_same_thread": False,
        "timeout": 30
    }
else:
    # Serverless PostgreSQL settings: NullPool prevents connection leaks across Lambda instances
    from sqlalchemy.pool import NullPool
    engine_kwargs["poolclass"] = NullPool
    engine_kwargs["connect_args"] = {"connect_timeout": 10}

engine = create_engine(
    DATABASE_URL,
    **engine_kwargs
)

# Enable SQLite Write-Ahead Logging (WAL) and enforce foreign key constraints
if "sqlite" in DATABASE_URL:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

_tables_initialized = False

def init_tables_if_needed():
    global _tables_initialized
    if not _tables_initialized:
        try:
            import backend.models  # noqa: F401
            Base.metadata.create_all(bind=engine)
            from backend.seed import seed_initial_data
            db = SessionLocal()
            try:
                seed_initial_data(db)
            finally:
                db.close()
            _tables_initialized = True
        except Exception as e:
            print(f"[Warning] Failed to auto-init tables: {e}")

def get_db() -> Generator[Session, None, None]:
    """
    FastAPI Dependency that provides an isolated database session per request.
    Automatically closes the session when the request completes.
    """
    init_tables_if_needed()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@contextmanager
def get_db_context() -> Generator[Session, None, None]:
    """
    Context manager for background jobs, test harnesses, and CLI operations.
    Usage:
        with get_db_context() as db:
            db.query(...)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
