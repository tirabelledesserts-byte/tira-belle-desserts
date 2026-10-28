import os
import uuid
import re
import requests
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from backend.security import require_admin
from backend.config import (
    UPLOAD_DIR,
    MAX_UPLOAD_SIZE,
    ALLOWED_IMAGE_EXTENSIONS,
    ALLOWED_IMAGE_MIME_TYPES,
    SUPABASE_URL,
    SUPABASE_KEY,
    SUPABASE_BUCKET
)

router = APIRouter(prefix="/api/upload", tags=["Uploads"])

# Magic bytes signature check for common image types
IMAGE_MAGIC_BYTES = {
    b"\xff\xd8\xff": "jpeg",
    b"\x89PNG\r\n\x1a\n": "png",
    b"GIF87a": "gif",
    b"GIF89a": "gif",
    b"RIFF": "webp"  # WEBP starts with RIFF....WEBP
}

def is_valid_image_bytes(first_bytes: bytes) -> bool:
    if len(first_bytes) < 4:
        return False
    for magic, fmt in IMAGE_MAGIC_BYTES.items():
        if first_bytes.startswith(magic):
            return True
        if magic == b"RIFF" and len(first_bytes) >= 12 and first_bytes[:4] == b"RIFF" and first_bytes[8:12] == b"WEBP":
            return True
    return False

def sanitize_filename(name: str) -> str:
    # Remove directory paths and illegal characters
    base = os.path.basename(name)
    clean = re.sub(r"[^\w\.-]", "_", base)
    return clean[:80]

@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: UploadFile = File(...),
    admin: dict = Depends(require_admin)
):
    if hasattr(admin, "dependency"):
        admin = {"sub": "admin", "role": "admin"}
    """
    Secure Image Upload Handler:
    1. Validates content-type header
    2. Validates file extension
    3. Enforces file size limit (< 5 MB)
    4. Validates initial magic bytes to ensure genuine image payload
    5. Generates collision-proof, path-traversal-free unique filename
    6. Stores file into assets/uploads/
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    # 1. Check extension
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '.{ext}'. Allowed formats: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}"
        )

    # 2. Check MIME type
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_IMAGE_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid MIME type '{content_type}'. Must be a valid image."
        )

    # 3. Read content with size guard
    contents = await file.read()
    file_size = len(contents)
    if file_size > MAX_UPLOAD_SIZE:
        max_mb = MAX_UPLOAD_SIZE / (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds maximum size of {max_mb:.0f}MB. Selected size: {file_size / (1024 * 1024):.2f}MB"
        )
    if file_size == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    # 4. Verify magic bytes
    if not is_valid_image_bytes(contents[:16]):
        raise HTTPException(status_code=400, detail="Corrupted or invalid image file structure")

    # 5. Generate secure unique filename
    safe_base = sanitize_filename(file.filename.rsplit(".", 1)[0])
    unique_suffix = uuid.uuid4().hex[:10]
    final_filename = f"{safe_base}_{unique_suffix}.{ext}"

    # 6. Upload to Supabase Storage if configured
    if SUPABASE_URL and SUPABASE_KEY:
        try:
            upload_endpoint = f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{final_filename}"
            supabase_headers = {
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "apikey": SUPABASE_KEY,
                "Content-Type": content_type
            }
            resp = requests.post(upload_endpoint, data=contents, headers=supabase_headers, timeout=12)
            if resp.status_code in (200, 201):
                public_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{final_filename}"
                return {
                    "success": True,
                    "url": public_url,
                    "filename": final_filename,
                    "size": file_size,
                    "content_type": content_type
                }
            else:
                print(f"[Supabase Storage] Upload status {resp.status_code}: {resp.text}, using local fallback")
        except Exception as e:
            print(f"[Supabase Storage] Upload exception: {e}, using local fallback")

    # Local fallback
    destination_path = UPLOAD_DIR / final_filename
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    with open(destination_path, "wb") as f:
        f.write(contents)

    relative_url = f"assets/uploads/{final_filename}"

    return {
        "success": True,
        "url": relative_url,
        "filename": final_filename,
        "size": file_size,
        "content_type": content_type
    }

@router.get("/gallery")
def list_uploaded_images(admin: dict = Depends(require_admin)):
    """
    Returns list of all uploaded images in assets/uploads/
    """
    if hasattr(admin, "dependency"):
        admin = {"sub": "admin", "role": "admin"}
    if not UPLOAD_DIR.exists():
        return []
    
    files = []
    for f in UPLOAD_DIR.iterdir():
        if f.is_file() and f.suffix.lstrip(".").lower() in ALLOWED_IMAGE_EXTENSIONS:
            files.append({
                "filename": f.name,
                "url": f"assets/uploads/{f.name}",
                "size": f.stat().st_size,
                "created_at": f.stat().st_mtime
            })
    files.sort(key=lambda x: x["created_at"], reverse=True)
    return files
