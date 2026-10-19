import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
try:
    DATA_DIR = BASE_DIR / "data"
    DATA_DIR.mkdir(parents=True, exist_ok=True)
except (OSError, PermissionError):
    DATA_DIR = Path("/tmp") / "data"
    DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = (DATA_DIR / "tirabelle.db").as_posix()

# Database
raw_db_url = os.getenv("DATABASE_URL", "")
if not raw_db_url:
    raw_db_url = f"sqlite:///{DB_PATH}"

if raw_db_url.startswith("postgres://"):
    raw_db_url = raw_db_url.replace("postgres://", "postgresql://", 1)

DATABASE_URL = raw_db_url

# Security
SECRET_KEY = os.getenv("SECRET_KEY", "tirabelle_super_secret_jwt_key_2026_artisan_desserts")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# Credential salt matching existing frontend sha-256 hashing
CREDENTIAL_SALT = os.getenv("CREDENTIAL_SALT", "TIRABELLE_SALT_2026")

# Server Config
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8001"))
CORS_ORIGINS = [
    "http://localhost:8001",
    "http://127.0.0.1:8001",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:3000",
    "http://localhost:5500",
    "*"
]

# Supabase Storage Integration (for persistent cloud uploads)
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "tiramisu-uploads")

# Local Upload Configuration (fallback when Supabase Storage is not set)
try:
    UPLOAD_DIR = BASE_DIR / "assets" / "uploads"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
except (OSError, PermissionError):
    UPLOAD_DIR = Path("/tmp") / "uploads"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}
ALLOWED_IMAGE_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
}
