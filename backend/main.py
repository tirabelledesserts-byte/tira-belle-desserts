import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Ensure both package root and backend directory are in sys.path
_this_dir = Path(__file__).resolve().parent
_pkg_root = _this_dir.parent

if str(_pkg_root) not in sys.path:
    sys.path.insert(0, str(_pkg_root))
if str(_this_dir) not in sys.path:
    sys.path.insert(0, str(_this_dir))

# Ensure 'backend' module is always resolvable even if runtime root is 'backend'
if "backend" not in sys.modules:
    import types
    _backend_pkg = types.ModuleType("backend")
    _backend_pkg.__path__ = [str(_this_dir)]
    _backend_pkg.__file__ = str(_this_dir / "__init__.py")
    sys.modules["backend"] = _backend_pkg

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from backend.config import CORS_ORIGINS, BASE_DIR
from backend.database import engine, Base, get_db, SessionLocal
from backend.seed import seed_initial_data
from backend.models import utcnow_iso

from backend.routers import (
    auth,
    customers,
    sales,
    redemptions,
    products,
    categories,
    upload,
    reviews,
    settings,
    realtime
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure tables exist and initial seeds are present
    try:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            seed_initial_data(db)
        finally:
            db.close()
    except Exception as e:
        print(f"[Warning] Database auto-initialization deferred or failed: {e}")
    yield
    # Shutdown: clean up connection pool
    try:
        engine.dispose()
    except Exception:
        pass

app = FastAPI(
    title="TIRA Belle REST API",
    description="High-performance backend API and loyalty engine for TIRA Belle Handcrafted Tiramisu.",
    version="2.0.0",
    lifespan=lifespan
)

# CORS Middleware: sanitize origins to prevent wildcard with credentials
cors_origins = [o for o in CORS_ORIGINS if o != "*"] or ["http://localhost:8001", "http://127.0.0.1:8001"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

from fastapi.responses import JSONResponse
from fastapi import Request, HTTPException, Response
from starlette.exceptions import HTTPException as StarletteHTTPException
import logging

logger = logging.getLogger("tirabelle.backend")

# Global Security Headers Middleware (OWASP Secure Headers Recommendation)
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, (HTTPException, StarletteHTTPException)):
        headers = getattr(exc, "headers", None)
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=headers
        )
    logger.error(f"Unhandled Exception at {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again or contact support."}
    )

# Mount API Routers
app.include_router(auth.router)
app.include_router(customers.router)
app.include_router(sales.router)
app.include_router(redemptions.router)
app.include_router(categories.router)
app.include_router(products.router)
app.include_router(upload.router)
app.include_router(reviews.router)
app.include_router(settings.router)
app.include_router(realtime.router)

@app.get("/api/health", tags=["Health"])
def health_check(db: Session = Depends(get_db)):
    db_status = "connected"
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {
        "status": "ok",
        "app": "TIRA Belle",
        "version": "2.0.4",
        "database": db_status,
        "database_engine": engine.name,
        "database_driver": getattr(engine.dialect, "driver", None),
        "timestamp": utcnow_iso()
    }

# Mount Static Directories
assets_path = BASE_DIR / "assets"
css_path = BASE_DIR / "css"
js_path = BASE_DIR / "js"

if assets_path.exists():
    app.mount("/assets", StaticFiles(directory=str(assets_path)), name="assets")
if css_path.exists():
    app.mount("/css", StaticFiles(directory=str(css_path)), name="css")
if js_path.exists():
    app.mount("/js", StaticFiles(directory=str(js_path)), name="js")

# Mount Root Static HTML Pages
@app.get("/")
def get_root():
    return FileResponse(BASE_DIR / "index.html")

@app.get("/index.html")
def get_index():
    return FileResponse(BASE_DIR / "index.html")

@app.get("/tracker.html")
def get_tracker():
    return FileResponse(BASE_DIR / "tracker.html")

@app.get("/tira-desk.html")
def get_tira_desk():
    return FileResponse(BASE_DIR / "tira-desk.html")

@app.get("/admin.html")
def get_admin_disabled():
    raise HTTPException(status_code=404, detail="Page not found")

@app.get("/receipt.html")
def get_receipt():
    return FileResponse(BASE_DIR / "receipt.html")

@app.get("/receipt")
def get_receipt_direct():
    return FileResponse(BASE_DIR / "receipt.html")

@app.get("/manifest.json")
def get_manifest():
    return FileResponse(BASE_DIR / "manifest.json", media_type="application/manifest+json")

@app.get("/sw.js")
def get_sw():
    return FileResponse(BASE_DIR / "sw.js", media_type="application/javascript")

@app.get("/robots.txt")
def get_robots():
    return FileResponse(BASE_DIR / "robots.txt")

@app.get("/sitemap.xml")
def get_sitemap():
    return FileResponse(BASE_DIR / "sitemap.xml", media_type="application/xml")
