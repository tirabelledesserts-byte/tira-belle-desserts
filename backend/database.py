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

def apply_database_migrations_and_indexes(connection):
    """
    Non-destructive schema migrations and performance index creation.
    Safe to execute idempotently on both SQLite and PostgreSQL.
    """
    from sqlalchemy import text

    statements = [
        "ALTER TABLE settings ADD COLUMN IF NOT EXISTS instagram_url VARCHAR(255) DEFAULT 'https://instagram.com/tirabelle.desserts?obrf=MzhsZG04Ymc3NXBj'",
        "ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT 'flat'",
        "ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_value FLOAT DEFAULT 0.0",
        "ALTER TABLE sales ADD COLUMN IF NOT EXISTS eligible_cups_count INTEGER DEFAULT 0",
        "CREATE INDEX IF NOT EXISTS ix_sales_customer_phone ON sales(customer_phone)",
        "CREATE INDEX IF NOT EXISTS ix_sales_date_timestamp ON sales(date, timestamp DESC)",
        "CREATE INDEX IF NOT EXISTS ix_sales_timestamp ON sales(timestamp DESC)",
        "CREATE INDEX IF NOT EXISTS ix_sales_date ON sales(date)",
        "CREATE INDEX IF NOT EXISTS ix_sale_items_sale_id ON sale_items(sale_id)",
        "CREATE INDEX IF NOT EXISTS ix_sale_items_product_id ON sale_items(product_id)",
        "CREATE INDEX IF NOT EXISTS ix_redemptions_customer_phone ON redemptions(customer_phone)",
        "CREATE INDEX IF NOT EXISTS ix_redemptions_date ON redemptions(date)",
        "CREATE INDEX IF NOT EXISTS ix_redemptions_redeemed_at ON redemptions(redeemed_at DESC)",
        "CREATE INDEX IF NOT EXISTS ix_products_category_id ON products(category_id)",
        "CREATE INDEX IF NOT EXISTS ix_products_is_active ON products(is_active)",
        "CREATE INDEX IF NOT EXISTS ix_reviews_date ON reviews(date)",
        "CREATE INDEX IF NOT EXISTS ix_reviews_timestamp ON reviews(timestamp DESC)",
        "CREATE INDEX IF NOT EXISTS ix_reviews_phone ON reviews(phone)",
        "ALTER TABLE settings NO FORCE ROW LEVEL SECURITY",
        "ALTER TABLE categories NO FORCE ROW LEVEL SECURITY",
        "ALTER TABLE products NO FORCE ROW LEVEL SECURITY",
        "ALTER TABLE customers NO FORCE ROW LEVEL SECURITY",
        "ALTER TABLE sales NO FORCE ROW LEVEL SECURITY",
        "ALTER TABLE sale_items NO FORCE ROW LEVEL SECURITY",
        "ALTER TABLE redemptions NO FORCE ROW LEVEL SECURITY",
        "ALTER TABLE reviews NO FORCE ROW LEVEL SECURITY"
    ]

    is_sqlite = "sqlite" in str(connection.engine.url)

    for stmt in statements:
        sql_stmt = stmt
        if is_sqlite and "ADD COLUMN IF NOT EXISTS" in stmt:
            sql_stmt = stmt.replace("ADD COLUMN IF NOT EXISTS", "ADD COLUMN")
        try:
            connection.execute(text(sql_stmt))
            connection.commit()
        except Exception:
            try:
                connection.rollback()
            except Exception:
                pass

def init_tables_if_needed():
    global _tables_initialized
    if not _tables_initialized:
        try:
            import backend.models  # noqa: F401
            from sqlalchemy import text
            tables_exist = False
            try:
                with engine.connect() as conn:
                    conn.execute(text("SELECT 1 FROM settings LIMIT 1"))
                    tables_exist = True
            except Exception:
                tables_exist = False

            if not tables_exist:
                Base.metadata.create_all(bind=engine)
                from backend.seed import seed_initial_data
                db = SessionLocal()
                try:
                    seed_initial_data(db)
                finally:
                    db.close()

            # Ensure all indexes and non-destructive column additions are applied
            try:
                with engine.connect() as conn:
                    apply_database_migrations_and_indexes(conn)
            except Exception:
                pass

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
    init_tables_if_needed()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
