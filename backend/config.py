import os
from pathlib import Path

_this_file = Path(__file__).resolve()
if _this_file.parent.name == "backend":
    BASE_DIR = _this_file.parent.parent
else:
    BASE_DIR = _this_file.parent

try:
    DATA_DIR = BASE_DIR / "data"
    DATA_DIR.mkdir(parents=True, exist_ok=True)
except (OSError, PermissionError):
    DATA_DIR = Path("/tmp") / "data"
    DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = (DATA_DIR / "tirabelle.db").as_posix()

# Database - Support all common Supabase and PostgreSQL environment variable keys
raw_db_url = (
    os.getenv("DATABASE_URL")
    or os.getenv("SUPABASE_DATABASE_URL")
    or os.getenv("POSTGRES_URL")
    or os.getenv("SUPABASE_DB_URL")
    or os.getenv("POSTGRES_PRISMA_URL")
    or os.getenv("POSTGRES_URL_NON_POOLING")
    or ""
).strip()

if not raw_db_url:
    raw_db_url = f"sqlite:///{DB_PATH}"

def normalize_database_url(url: str) -> str:
    if not url or url.startswith("sqlite"):
        return url

    import urllib.parse
    import re

    url = url.strip().strip("\"'")

    match = re.match(r"^(postgres(?:ql)?(?:\+[a-zA-Z0-9_-]+)?):\/\/(.*)$", url)
    if not match:
        return url

    proto_prefix, body = match.groups()

    # Split query parameters if any
    query_params = ""
    if "?" in body:
        body, query_params = body.split("?", 1)
        query_params = "?" + query_params

    # Split database path
    path = ""
    if "/" in body:
        auth_host, path = body.split("/", 1)
        path = "/" + path
    else:
        auth_host = body

    # auth_host is user:password@host:port
    # A valid hostname can NEVER contain '@'. So the LAST '@' separates user:password from host:port
    if "@" in auth_host:
        user_pass, host_port = auth_host.rsplit("@", 1)
        if ":" in user_pass:
            user, password = user_pass.split(":", 1)
            # Unquote first to avoid double encoding, then quote
            user = urllib.parse.unquote(user)
            password = urllib.parse.unquote(password)
            quoted_user = urllib.parse.quote(user, safe="")
            quoted_pass = urllib.parse.quote(password, safe="")
            auth_host = f"{quoted_user}:{quoted_pass}@{host_port}"
        else:
            user = urllib.parse.unquote(user_pass)
            quoted_user = urllib.parse.quote(user, safe="")
            auth_host = f"{quoted_user}@{host_port}"

    # Detect available postgres driver in current Python runtime
    driver = None
    for d in ["psycopg2", "psycopg", "pg8000"]:
        try:
            __import__(d)
            driver = d
            break
        except ImportError:
            pass

    if driver:
        final_proto = f"postgresql+{driver}"
    else:
        final_proto = "postgresql"

    final_url = f"{final_proto}://{auth_host}{path}{query_params}"

    # Ensure sslmode=require for Supabase / remote cloud connections
    if ("supabase" in final_url or "pooler" in final_url or "aws" in final_url) and "sslmode" not in final_url:
        sep = "&" if "?" in final_url else "?"
        final_url = f"{final_url}{sep}sslmode=require"

    return final_url

DATABASE_URL = normalize_database_url(raw_db_url)

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
