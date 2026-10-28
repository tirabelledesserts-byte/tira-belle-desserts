import hashlib
import time
from typing import Optional
import hmac
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from backend.config import SECRET_KEY, CREDENTIAL_SALT, ACCESS_TOKEN_EXPIRE_MINUTES

# Bearer security scheme (auto_error=False to allow optional authentication endpoints)
security_scheme = HTTPBearer(auto_error=False)

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

def hash_credential(value: str, salt: str = CREDENTIAL_SALT) -> str:
    """
    Computes SHA-256(value + salt) to match the frontend Web Crypto hashing.
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

def require_admin(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme)):
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
