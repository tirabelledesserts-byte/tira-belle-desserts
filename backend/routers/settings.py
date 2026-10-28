from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import StoreSetting
from backend.schemas import SettingsSchema
from backend.security import require_admin

router = APIRouter(prefix="/api/settings", tags=["Store Settings"])

@router.get("", response_model=SettingsSchema)
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(StoreSetting).filter(StoreSetting.id == 1).first()
    if not settings:
        from backend.seed import seed_initial_data
        seed_initial_data(db)
        settings = db.query(StoreSetting).filter(StoreSetting.id == 1).first()
    return settings

@router.put("", response_model=SettingsSchema)
def update_settings(
    new_settings: SettingsSchema,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    if hasattr(admin, "dependency"):
        admin = {"sub": "admin", "role": "admin"}
    settings = db.query(StoreSetting).filter(StoreSetting.id == 1).first()
    if not settings:
        settings = StoreSetting(id=1)
        db.add(settings)

    if new_settings.business_name is not None:
        settings.business_name = new_settings.business_name
    if new_settings.tagline is not None:
        settings.tagline = new_settings.tagline
    if new_settings.slogan is not None:
        settings.slogan = new_settings.slogan
    if new_settings.owner is not None:
        settings.owner = new_settings.owner
    if new_settings.phone is not None:
        settings.phone = new_settings.phone
    if new_settings.phone_secondary is not None:
        settings.phone_secondary = new_settings.phone_secondary
    if new_settings.whatsapp is not None:
        settings.whatsapp = new_settings.whatsapp
    if new_settings.address is not None:
        settings.address = new_settings.address
    if new_settings.email is not None:
        settings.email = new_settings.email
    if new_settings.instagram is not None:
        settings.instagram = new_settings.instagram
    if new_settings.instagram_url is not None:
        settings.instagram_url = new_settings.instagram_url
    if new_settings.upi_id is not None:
        settings.upi_id = new_settings.upi_id
    if new_settings.currency is not None:
        settings.currency = new_settings.currency
    if new_settings.loyalty_threshold is not None:
        settings.loyalty_threshold = max(1, new_settings.loyalty_threshold)
    if new_settings.reward_item_name is not None:
        settings.reward_item_name = new_settings.reward_item_name
    if new_settings.logo is not None:
        settings.logo = new_settings.logo

    db.commit()
    db.refresh(settings)
    from backend.routers.realtime import notify_change
    notify_change("settings", "updated")
    return settings
