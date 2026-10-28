import time
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Product, utcnow_iso
from backend.schemas import ProductCreate, ProductUpdate, ProductResponse
from backend.security import require_admin

router = APIRouter(prefix="/api/products", tags=["Products"])

def _format_product_response(p: Product) -> ProductResponse:
    cat_name = p.category_rel.name if p.category_rel else None
    return ProductResponse(
        id=p.id,
        category_id=p.category_id,
        category_name=cat_name,
        name=p.name,
        short_name=p.short_name,
        price=p.price,
        weight=p.weight,
        description=p.description,
        image=p.image,
        badge=p.badge,
        counts_towards_loyalty=p.counts_towards_loyalty,
        is_active=p.is_active,
        created_at=p.created_at,
        updated_at=p.updated_at
    )

@router.get("", response_model=List[ProductResponse])
def get_products(
    active_only: bool = False,
    category_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Product)
    if active_only:
        query = query.filter(Product.is_active == True)
    if category_id:
        query = query.filter(Product.category_id == category_id)
    products = query.all()
    return [_format_product_response(p) for p in products]

@router.get("/{product_id}", response_model=ProductResponse)
def get_product(product_id: str, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return _format_product_response(product)

@router.post("", response_model=ProductResponse)
def create_product(
    prod_in: ProductCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    if hasattr(admin, "dependency"):
        admin = {"sub": "admin", "role": "admin"}
    prod_id = prod_in.id or f"prod-{int(time.time() * 1000)}"
    existing = db.query(Product).filter(Product.id == prod_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Product ID already exists")

    new_prod = Product(
        id=prod_id,
        category_id=prod_in.category_id,
        name=prod_in.name,
        short_name=prod_in.short_name or prod_in.name,
        price=prod_in.price,
        weight=prod_in.weight or "",
        description=prod_in.description or "",
        image=prod_in.image or "assets/tira-belle-logo.png",
        badge=prod_in.badge or "",
        counts_towards_loyalty=prod_in.counts_towards_loyalty,
        is_active=prod_in.is_active,
        created_at=utcnow_iso(),
        updated_at=utcnow_iso()
    )
    db.add(new_prod)
    db.commit()
    db.refresh(new_prod)
    from backend.routers.realtime import notify_change
    notify_change("products", "created", {"id": new_prod.id})
    return _format_product_response(new_prod)

@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: str,
    prod_in: ProductUpdate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    if hasattr(admin, "dependency"):
        admin = {"sub": "admin", "role": "admin"}
    prod = db.query(Product).filter(Product.id == product_id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")

    if prod_in.category_id is not None:
        prod.category_id = prod_in.category_id or None
    if prod_in.name is not None:
        prod.name = prod_in.name
    if prod_in.short_name is not None:
        prod.short_name = prod_in.short_name
    if prod_in.price is not None:
        prod.price = prod_in.price
    if prod_in.weight is not None:
        prod.weight = prod_in.weight
    if prod_in.description is not None:
        prod.description = prod_in.description
    if prod_in.image is not None:
        prod.image = prod_in.image
    if prod_in.badge is not None:
        prod.badge = prod_in.badge
    if prod_in.counts_towards_loyalty is not None:
        prod.counts_towards_loyalty = prod_in.counts_towards_loyalty
    if prod_in.is_active is not None:
        prod.is_active = prod_in.is_active

    prod.updated_at = utcnow_iso()
    db.commit()
    db.refresh(prod)
    from backend.routers.realtime import notify_change
    notify_change("products", "updated", {"id": prod.id})
    return _format_product_response(prod)

@router.delete("/{product_id}")
def delete_product(
    product_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    if hasattr(admin, "dependency"):
        admin = {"sub": "admin", "role": "admin"}
    prod = db.query(Product).filter(Product.id == product_id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(prod)
    db.commit()
    from backend.routers.realtime import notify_change
    notify_change("products", "deleted", {"id": product_id})
    return {"success": True, "message": "Product deleted successfully"}
