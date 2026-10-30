import hashlib
import time
import collections
import re
from typing import Optional
import hmac
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from backend.config import SECRET_KEY, CREDENTIAL_SALT, ACCESS_TOKEN_EXPIRE_MINUTES

# Bearer security scheme (auto_error=False to allow optional authentication endpoints)
security_scheme = HTTPBearer(auto_error=False)

# In-memory sliding window rate limiter
class SlidingWindowRateLimiter:
    """
    Sliding window rate limiter tracking request timestamps per client IP.
    Returns HTTP 429 with standard Retry-After header upon violation.
    """
    def __init__(self, limit: int, window_seconds: int, name: str = "resource"):
        self.limit = limit
        self.window_seconds = window_seconds
        self.name = name
        self.requests = collections.defaultdict(list)

    def __call__(self, request: Request = None) -> bool:
        client_ip = "127.0.0.1"
        if request and request.client and request.client.host:
            client_ip = request.client.host
            # Check forwarded header if behind trusted reverse proxy
            x_forwarded = request.headers.get("x-forwarded-for")
            if x_forwarded:
                client_ip = x_forwarded.split(",")[0].strip()

        now = time.time()
        window_start = now - self.window_seconds

        # Prune expired timestamps
        timestamps = [t for t in self.requests[client_ip] if t > window_start]
        if len(timestamps) >= self.limit:
            retry_after = int(self.window_seconds - (now - timestamps[0]))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded for {self.name}. Please wait {max(1, retry_after)} seconds before trying again.",
                headers={"Retry-After": str(max(1, retry_after))}
            )

        timestamps.append(now)
        self.requests[client_ip] = timestamps
        return True

# Pre-configured endpoint rate limiters
rate_limit_login = SlidingWindowRateLimiter(limit=10, window_seconds=60, name="login")
rate_limit_tracker = SlidingWindowRateLimiter(limit=30, window_seconds=60, name="loyalty tracker")
rate_limit_reviews = SlidingWindowRateLimiter(limit=5, window_seconds=60, name="review submissions")
rate_limit_receipts = SlidingWindowRateLimiter(limit=40, window_seconds=60, name="receipt lookup")
rate_limit_uploads = SlidingWindowRateLimiter(limit=15, window_seconds=60, name="image uploads")

# In-memory rate limiter for failed login attempts to prevent brute-force attacks (CWE-307)
_login_failures = {}
MAX_FAILED_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION_SECONDS = 300  # 5 minutes lockout

def check_login_rate_limit(client_ip: str):
    if not client_ip:
        return
    now = time.time()
    attempts = [t for t in _login_failures.get(client_ip, []) if now - t < LOCKOUT_DURATION_SECONDS]
    _login_failures[client_ip] = attempts
    if len(attempts) >= MAX_FAILED_LOGIN_ATTEMPTS:
        retry_after = int(LOCKOUT_DURATION_SECONDS - (now - attempts[0]))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Please wait {max(1, retry_after)} seconds before trying again.",
            headers={"Retry-After": str(max(1, retry_after))}
        )

def record_login_failure(client_ip: str):
    if not client_ip:
        return
    now = time.time()
    if client_ip not in _login_failures:
        _login_failures[client_ip] = []
    _login_failures[client_ip].append(now)

def reset_login_failures(client_ip: str):
    if client_ip in _login_failures:
        del _login_failures[client_ip]

def mask_phone_number(phone: str) -> str:
    """
    Masks a phone number for privacy preservation (e.g. 9876543210 -> 98765 •••• 10)
    """
    if not phone:
        return ""
    digits = re.sub(r"\D", "", str(phone))
    if len(digits) < 6:
        return "••••"
    return f"{digits[:5]} •••• {digits[-2:]}"

def hash_credential(value: str, salt: str = CREDENTIAL_SALT) -> str:
    """
    Computes SHA-256(value + salt) for secure password verification.
    """
    if not value:
        return ""
    data = f"{str(value)}{salt}".encode("utf-8")
    return hashlib.sha256(data).hexdigest()

def verify_hash(value: str, target_hash: str, salt: str = CREDENTIAL_SALT) -> bool:
    if not value or not target_hash:
        return False
    computed = hash_credential(value, salt)
    return hmac.compare_digest(computed.lower(), target_hash.lower())

def create_access_token(data: dict, expires_in_seconds: Optional[int] = None) -> str:
    """
    Generates a secure HMAC-SHA256 signature token payload.
    Format: payload_base64.signature_hex
    """
    import base64
    import json
    to_encode = data.copy()
    now = int(time.time())
    exp = now + (expires_in_seconds or (ACCESS_TOKEN_EXPIRE_MINUTES * 60))
    to_encode.update({"iat": now, "exp": exp})

    payload_bytes = json.dumps(to_encode, sort_keys=True).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(payload_bytes).decode("utf-8").rstrip("=")

    signature = hmac.new(SECRET_KEY.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{signature}"

def verify_access_token(token: str) -> Optional[dict]:
    import base64
    import json
    if not token or not isinstance(token, str):
        return None
    try:
        parts = token.split(".")
        if len(parts) != 2:
            return None
        payload_b64, signature = parts
        expected_sig = hmac.new(SECRET_KEY.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            return None

        # Add padding back if missing
        padding = "=" * (-len(payload_b64) % 4)
        payload_bytes = base64.urlsafe_b64decode(payload_b64 + padding)
        payload = json.loads(payload_bytes.decode("utf-8"))

        if payload.get("exp", 0) < int(time.time()):
            return None  # Expired
        return payload
    except Exception:
        return None

def require_admin(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme)) -> dict:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = verify_access_token(credentials.credentials)
    if not payload or not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload

def get_optional_admin(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme)) -> Optional[dict]:
    """
    Returns verified admin payload if present and valid, otherwise None without throwing 401.
    Used for endpoints that provide public views with masked PII and elevated views for admins.
    """
    if not credentials or not credentials.credentials:
        return None
    try:
        payload = verify_access_token(credentials.credentials)
        if payload and payload.get("sub"):
            return payload
    except Exception:
        pass
    return None
