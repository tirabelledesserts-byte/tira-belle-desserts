import re
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Customer, Sale, Redemption, StoreSetting, Product
from backend.schemas import CustomerCreate, CustomerResponse, CustomerLoyaltyResponse
from backend.security import (
    require_admin,
    get_optional_admin,
    mask_phone_number,
    rate_limit_tracker
)

router = APIRouter(prefix="/api/customers", tags=["Customers & Loyalty"])

def clean_phone_number(phone: str) -> str:
    raw = re.sub(r"\D", "", phone or "").strip()
    # Normalize Indian 10-digit mobile numbers with +91 or 0 prefix
    if len(raw) == 12 and raw.startswith("91"):
        return raw[2:]
    if len(raw) == 11 and raw.startswith("0"):
        return raw[1:]
    return raw

def calculate_customer_loyalty(phone: str, db: Session, is_admin: bool = False) -> dict:
    clean_phone = clean_phone_number(phone)
    customer = db.query(Customer).filter(Customer.phone == clean_phone).first()
    settings = db.query(StoreSetting).filter(StoreSetting.id == 1).first()
    if not settings:
        from backend.seed import seed_initial_data
        seed_initial_data(db)
        settings = db.query(StoreSetting).filter(StoreSetting.id == 1).first()

    threshold = max(1, settings.loyalty_threshold if settings else 5)
    sales = db.query(Sale).filter(Sale.customer_phone == clean_phone).all()
    redemptions = db.query(Redemption).filter(Redemption.customer_phone == clean_phone).all()

    total_cups_purchased = 0
    total_eligible_cups = 0
    completed_purchases_count = 0

    # Look up products to check loyalty eligibility
    all_product_ids = set()
    for s in sales:
        if s.items:
            for it in s.items:
                if not it.is_reward and it.product_id:
                    all_product_ids.add(it.product_id)
    prods_map = {p.id: p for p in db.query(Product).filter(Product.id.in_(all_product_ids)).all()} if all_product_ids else {}

    for s in sales:
        sale_total_cups = 0
        sale_eligible_cups = 0

        if s.items:
            for it in s.items:
                if not it.is_reward:
                    qty = it.quantity or 1
                    # Total cup count includes ALL purchased cups (both eligible and excluded)
                    sale_total_cups += qty
                    prod = prods_map.get(it.product_id)
                    # Excluded products do NOT count towards loyalty points
                    if prod is None or prod.counts_towards_loyalty:
                        sale_eligible_cups += qty
        else:
            sale_total_cups = s.paid_cups_count or 0
            sale_eligible_cups = getattr(s, "eligible_cups_count", None)
            if not sale_eligible_cups and sale_total_cups > 0:
                sale_eligible_cups = sale_total_cups
        total_cups_purchased += sale_total_cups
        total_eligible_cups += sale_eligible_cups

        if sale_total_cups > 0:
            completed_purchases_count += 1

    claimed_count = len(redemptions)
    # Loyalty points and rewards are calculated solely from eligible cups
    total_earned_rewards = total_eligible_cups // threshold
    available_rewards = max(0, total_earned_rewards - claimed_count)
    is_eligible = available_rewards > 0
    cups_since_claimed = max(0, total_eligible_cups - (claimed_count * threshold))
    current_cycle_progress = threshold if is_eligible else (cups_since_claimed % threshold)
    cups_remaining = 0 if is_eligible else (threshold - current_cycle_progress)

    phone_display = clean_phone if is_admin else mask_phone_number(clean_phone)

    redemptions_data = [
        {
            "id": r.id if is_admin else f"RDM-{r.id[-4:]}",
            "customerPhone": phone_display,
            "customerName": r.customer_name,
            "rewardItem": r.reward_item,
            "redeemedAt": r.redeemed_at,
            "date": r.date,
            "adminUser": r.admin_user if is_admin else "staff",
            "notes": r.notes if is_admin else "Redeemed over counter"
        }
        for r in sorted(redemptions, key=lambda x: x.redeemed_at, reverse=True)
    ]

    sales_data = [
        {
            "id": s.id if is_admin else f"TXN-{s.id[-4:]}",
            "customerPhone": phone_display,
            "customerName": s.customer_name,
            "totalAmount": s.total_amount,
            "paymentMode": s.payment_mode,
            "paidCupsCount": s.paid_cups_count,
            "timestamp": s.timestamp,
            "date": s.date,
            "notes": s.notes if is_admin else "",
            "items": [
                {
                    "productId": it.product_id,
                    "productName": it.product_name,
                    "weight": it.weight,
                    "price": it.price,
                    "quantity": it.quantity,
                    "total": it.total,
                    "isReward": it.is_reward
                }
                for it in s.items
            ]
        }
        for s in sorted(sales, key=lambda x: x.timestamp, reverse=True)
    ]

    cust_dict = {
        "phone": phone_display,
        "name": customer.name if customer else "Guest",
        "createdAt": customer.created_at if (customer and is_admin) else None,
        "updatedAt": customer.updated_at if (customer and is_admin) else None
    }

    return {
        "customer": cust_dict,
        "threshold": threshold,
        "totalCupsPurchased": total_cups_purchased,
        "totalEligibleCups": total_eligible_cups,
        "completedPurchasesCount": completed_purchases_count,
        "totalEarnedRewards": total_earned_rewards,
        "claimedCount": claimed_count,
        "availableRewards": available_rewards,
        "isEligible": is_eligible,
        "currentCycleProgress": current_cycle_progress,
        "cupsRemaining": cups_remaining,
        "purchasesRemaining": cups_remaining,
        "redemptions": redemptions_data,
        "salesHistory": sales_data
    }

@router.get("", response_model=List[CustomerResponse])
def get_customers(
    search: Optional[str] = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):
    query = db.query(Customer)
    if search:
        clean = search.strip().lower()
        digits = clean_phone_number(search)
        query = query.filter(
            (Customer.name.ilike(f"%{clean}%")) | (Customer.phone.contains(digits if digits else clean))
        )
    return query.order_by(Customer.created_at.desc()).offset(offset).limit(limit).all()

@router.get("/{phone}", response_model=CustomerLoyaltyResponse)
def get_customer_loyalty(
    phone: str,
    request: Request = None,
    _rate: bool = Depends(rate_limit_tracker),
    admin: Optional[dict] = Depends(get_optional_admin),
    db: Session = Depends(get_db)
):
    clean_phone = clean_phone_number(phone)
    if not clean_phone or len(clean_phone) < 7:
        raise HTTPException(status_code=400, detail="Invalid phone number provided")

    customer = db.query(Customer).filter(Customer.phone == clean_phone).first()
    sales_count = db.query(Sale).filter(Sale.customer_phone == clean_phone).count()
    if not customer and sales_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")

    is_admin = isinstance(admin, dict) and bool(admin.get("sub"))
    loyalty_data = calculate_customer_loyalty(clean_phone, db, is_admin=is_admin)
    return loyalty_data

@router.post("", response_model=CustomerResponse)
def upsert_customer(
    cust_in: CustomerCreate,
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):
    clean_phone = clean_phone_number(cust_in.phone)
    if not clean_phone or len(clean_phone) < 7:
        raise HTTPException(status_code=400, detail="Valid phone number with at least 7 digits is required")

    customer = db.query(Customer).filter(Customer.phone == clean_phone).first()
    name = (cust_in.name or "Valued Guest").strip()

    if customer:
        if name and customer.name != name:
            customer.name = name
            from backend.models import utcnow_iso
            customer.updated_at = utcnow_iso()
            db.commit()
            db.refresh(customer)
            from backend.routers.realtime import notify_change
            notify_change("customers", "updated")
        return customer
    else:
        new_cust = Customer(phone=clean_phone, name=name)
        db.add(new_cust)
        db.commit()
        db.refresh(new_cust)
        from backend.routers.realtime import notify_change
        notify_change("customers", "created")
        return new_cust
