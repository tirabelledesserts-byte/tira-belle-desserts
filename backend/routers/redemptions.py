import time
import secrets
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Redemption, StoreSetting, Customer, utcnow_iso, today_date_str
from backend.schemas import RedemptionCreate, RedemptionResponse
from backend.routers.customers import clean_phone_number, calculate_customer_loyalty
from backend.security import require_admin

router = APIRouter(prefix="/api/redemptions", tags=["Reward Redemptions"])

@router.get("", response_model=List[RedemptionResponse])
def get_redemptions(
    limit: int = 200,
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):
    redemptions = db.query(Redemption).order_by(Redemption.redeemed_at.desc()).limit(limit).all()
    return [
        {
            "id": r.id,
            "customerPhone": r.customer_phone,
            "customerName": r.customer_name,
            "rewardItem": r.reward_item,
            "redeemedAt": r.redeemed_at,
            "date": r.date,
            "adminUser": r.admin_user,
            "notes": r.notes
        }
        for r in redemptions
    ]

@router.post("", response_model=dict)
def redeem_reward(
    redemption_in: RedemptionCreate,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    clean_phone = clean_phone_number(redemption_in.customer_phone)
    if not clean_phone:
        raise HTTPException(status_code=400, detail="Valid customer phone number required")

    try:
        # In PostgreSQL, with_for_update() serializes concurrent redemption requests for the same customer
        if db.bind and db.bind.dialect.name == "postgresql":
            db.query(Customer).filter(Customer.phone == clean_phone).with_for_update().first()

        loyalty = calculate_customer_loyalty(clean_phone, db, is_admin=True)
        if not loyalty["isEligible"]:
            raise HTTPException(
                status_code=400,
                detail=f"Customer is not eligible for a free reward yet ({loyalty['cupsRemaining']} cups remaining)."
            )

        settings = db.query(StoreSetting).filter(StoreSetting.id == 1).first()
        reward_name = settings.reward_item_name if settings else "1 Free 150g Tiramisu Cup"

        customer = db.query(Customer).filter(Customer.phone == clean_phone).first()
        cust_name = customer.name if customer else "Valued Guest"

        redemption_id = f"RDM-{int(time.time() * 1000)}-{secrets.token_hex(2).upper()}"
        redemption = Redemption(
            id=redemption_id,
            customer_phone=clean_phone,
            customer_name=cust_name,
            reward_item=reward_name,
            redeemed_at=utcnow_iso(),
            date=today_date_str(),
            admin_user=redemption_in.admin_user or "admin",
            notes=redemption_in.notes or "Redeemed over counter"
        )
        db.add(redemption)
        db.commit()
    except Exception as e:
        db.rollback()
        raise e

    from backend.routers.realtime import notify_change
    notify_change("redemptions", "created")
    notify_change("customers", "updated")

    updated_loyalty = calculate_customer_loyalty(clean_phone, db, is_admin=True)

    return {
        "success": True,
        "message": f"Successfully redeemed 1 free reward for {cust_name}!",
        "redemption": {
            "id": redemption.id,
            "customerPhone": redemption.customer_phone,
            "customerName": redemption.customer_name,
            "rewardItem": redemption.reward_item,
            "redeemedAt": redemption.redeemed_at,
            "date": redemption.date,
            "adminUser": redemption.admin_user,
            "notes": redemption.notes
        },
        "updatedLoyalty": updated_loyalty
    }
