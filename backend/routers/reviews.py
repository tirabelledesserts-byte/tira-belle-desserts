import time
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Review, Customer, utcnow_iso, today_date_str
from backend.schemas import ReviewCreate, ReviewResponse
from backend.security import require_admin
from backend.routers.customers import clean_phone_number

router = APIRouter(prefix="/api/reviews", tags=["Reviews"])

@router.get("", response_model=List[ReviewResponse])
def get_reviews(db: Session = Depends(get_db)):
    reviews = db.query(Review).order_by(Review.timestamp.desc()).all()
    # Deduplicate reviews by content signature for display
    seen = set()
    unique_reviews = []
    for r in reviews:
        sig = (r.name.strip().lower(), r.comment.strip().lower(), r.date)
        if sig in seen:
            continue
        seen.add(sig)
        unique_reviews.append(r)
    return unique_reviews

@router.post("", response_model=ReviewResponse)
def submit_review(rev_in: ReviewCreate, db: Session = Depends(get_db)):
    name_clean = rev_in.name.strip()
    comment_clean = rev_in.comment.strip()
    if not name_clean or not comment_clean:
        raise HTTPException(status_code=400, detail="Name and review comment are required")

    clean_phone = clean_phone_number(rev_in.phone)
    today_str = today_date_str()

    # Deduplication check: if an identical review was submitted today, return it idempotently
    existing = db.query(Review).filter(
        Review.name == name_clean,
        Review.comment == comment_clean,
        Review.date == today_str
    ).first()
    if existing:
        return existing

    # Check if verified: review submitted with an eligible phone number (e.g. >= 7 digits)
    verified = False
    if clean_phone and len(clean_phone) >= 7:
        verified = True
    elif clean_phone:
        cust = db.query(Customer).filter(Customer.phone == clean_phone).first()
        if cust:
            verified = True

    rev_id = f"rev-{int(time.time() * 1000)}"
    new_rev = Review(
        id=rev_id,
        name=name_clean,
        phone=clean_phone,
        rating=max(1, min(5, rev_in.rating)),
        favorite_item=rev_in.favorite_item or "Classic – 150 g",
        comment=comment_clean,
        date=today_str,
        timestamp=utcnow_iso(),
        verified=verified
    )
    db.add(new_rev)
    db.commit()
    db.refresh(new_rev)
    from backend.routers.realtime import notify_change
    notify_change("reviews", "created", {
        "reviewId": new_rev.id,
        "name": new_rev.name,
        "rating": new_rev.rating,
        "comment": new_rev.comment
    })
    return new_rev

@router.delete("/{review_id}")
def delete_review(
    review_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    rev = db.query(Review).filter(Review.id == review_id).first()
    if not rev:
        raise HTTPException(status_code=404, detail="Review not found")
    try:
        db.delete(rev)
        db.commit()
    except Exception as e:
        db.rollback()
        raise e
    return {"success": True, "message": "Review removed successfully"}
