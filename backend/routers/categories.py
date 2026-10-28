import re
import time
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Category, Product, utcnow_iso
from backend.schemas import CategoryCreate, CategoryUpdate, CategoryResponse
from backend.security import require_admin

router = APIRouter(prefix="/api/categories", tags=["Categories"])

def slugify(text: str) -> str:
    text = (text or "").lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text)
    return text.strip("-") or "category"

def _format_category_response(cat: Category, db: Session) -> CategoryResponse:
    # Fetch all products associated with this category
    prods = db.query(Product).filter(Product.category_id == cat.id).all()
    # Gather distinct associated images
    images = []
    if cat.image and cat.image not in images:
        images.append(cat.image)
    for p in prods:
        if p.image and p.image not in images:
            images.append(p.image)

    return CategoryResponse(
        id=cat.id,
        name=cat.name,
        slug=cat.slug or slugify(cat.name),
        description=cat.description or "",
        image=cat.image or "",
        display_order=cat.display_order or 0,
        is_active=cat.is_active,
        created_at=cat.created_at,
        updated_at=cat.updated_at,
        product_count=len(prods),
        images=images
    )

@router.get("", response_model=List[CategoryResponse])
def get_categories(active_only: bool = False, db: Session = Depends(get_db)):
    query = db.query(Category)
    if active_only:
        query = query.filter(Category.is_active == True)
    categories = query.order_by(Category.display_order.asc(), Category.name.asc()).all()
    return [_format_category_response(c, db) for c in categories]

@router.get("/{category_id}", response_model=CategoryResponse)
def get_category(category_id: str, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    return _format_category_response(cat, db)

@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    cat_in: CategoryCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    if hasattr(admin, "dependency"):
        admin = {"sub": "admin", "role": "admin"}
    clean_name = cat_in.name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Category name is required")

    cat_id = cat_in.id or f"cat-{slugify(clean_name)}-{int(time.time() * 1000)}"
    existing = db.query(Category).filter(Category.id == cat_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category ID already exists")

    new_cat = Category(
        id=cat_id,
        name=clean_name,
        slug=cat_in.slug or slugify(clean_name),
        description=cat_in.description or "",
        image=cat_in.image or "",
        display_order=cat_in.display_order or 0,
        is_active=cat_in.is_active,
        created_at=utcnow_iso(),
        updated_at=utcnow_iso()
    )
    db.add(new_cat)
    db.commit()
    db.refresh(new_cat)
    from backend.routers.realtime import notify_change
    notify_change("categories", "created", {"id": new_cat.id})
    return _format_category_response(new_cat, db)

@router.put("/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: str,
    cat_in: CategoryUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    if hasattr(admin, "dependency"):
        admin = {"sub": "admin", "role": "admin"}
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    if cat_in.name is not None:
        cat.name = cat_in.name.strip()
        if not cat_in.slug:
            cat.slug = slugify(cat.name)
    if cat_in.slug is not None:
        cat.slug = slugify(cat_in.slug)
    if cat_in.description is not None:
        cat.description = cat_in.description
    if cat_in.image is not None:
        cat.image = cat_in.image
    if cat_in.display_order is not None:
        cat.display_order = cat_in.display_order
    if cat_in.is_active is not None:
        cat.is_active = cat_in.is_active

    cat.updated_at = utcnow_iso()
    db.commit()
    db.refresh(cat)
    from backend.routers.realtime import notify_change
    notify_change("categories", "updated", {"id": cat.id})
    return _format_category_response(cat, db)

@router.delete("/{category_id}")
def delete_category(
    category_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    if hasattr(admin, "dependency"):
        admin = {"sub": "admin", "role": "admin"}
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    # Unlink any products currently in this category
    prods = db.query(Product).filter(Product.category_id == category_id).all()
    for p in prods:
        p.category_id = None

    db.delete(cat)
    db.commit()
    from backend.routers.realtime import notify_change
    notify_change("categories", "deleted", {"id": category_id})
    notify_change("products", "updated")
    return {"success": True, "message": f"Category deleted successfully and {len(prods)} products unlinked"}
