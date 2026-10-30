import time
import secrets
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Sale, SaleItem, Customer, Product, Redemption, StoreSetting, utcnow_iso, today_date_str, ist_now
from backend.schemas import SaleCreate, SalePatchCustomer, SaleResponse, DashboardMetricsResponse
from backend.routers.customers import clean_phone_number, calculate_customer_loyalty
from backend.security import require_admin, get_optional_admin, mask_phone_number, rate_limit_receipts

router = APIRouter(prefix="/api/sales", tags=["Sales & POS"])

@router.get("", response_model=List[SaleResponse])
def get_sales(
    limit: int = Query(500, ge=1, le=2000),
    date: Optional[str] = Query(None, description="Filter sales by YYYY-MM-DD"),
    phone: Optional[str] = Query(None, description="Filter sales by customer phone"),
    payment_mode: Optional[str] = Query(None, description="Filter sales by Cash or Online"),
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):
    query = db.query(Sale)
    if date:
        query = query.filter(Sale.date == date)
    if phone:
        clean = clean_phone_number(phone)
        if clean:
            query = query.filter(Sale.customer_phone == clean)
    if payment_mode and payment_mode.lower() != "all":
        query = query.filter(Sale.payment_mode.ilike(payment_mode))
    sales = query.order_by(Sale.timestamp.desc()).limit(limit).all()
    results = []
    for s in sales:
        results.append({
            "id": s.id,
            "customerPhone": s.customer_phone,
            "customerName": s.customer_name,
            "subtotal": s.subtotal,
            "discount": s.discount,
            "discountType": getattr(s, "discount_type", "flat") or "flat",
            "discountValue": getattr(s, "discount_value", 0.0) or 0.0,
            "totalAmount": s.total_amount,
            "paymentMode": s.payment_mode,
            "paidCupsCount": s.paid_cups_count,
            "eligibleCupsCount": getattr(s, "eligible_cups_count", None) if getattr(s, "eligible_cups_count", None) is not None else s.paid_cups_count,
            "timestamp": s.timestamp,
            "date": s.date,
            "notes": s.notes,
            "rewardRedeemedInSale": s.reward_redeemed_in_sale,
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
        })
    return results

@router.post("", response_model=dict)
def create_sale(
    sale_in: SaleCreate,
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):
    clean_phone = clean_phone_number(sale_in.customer_phone)
    if not clean_phone or len(clean_phone) < 7:
        raise HTTPException(status_code=400, detail="Valid customer phone number with at least 7 digits is required")

    if not sale_in.items:
        raise HTTPException(status_code=400, detail="Cart cannot be empty")

    try:
        # Upsert customer
        cust_name = (sale_in.customer_name or "Valued Guest").strip()
        customer = db.query(Customer).filter(Customer.phone == clean_phone).first()
        if not customer:
            customer = Customer(phone=clean_phone, name=cust_name)
            db.add(customer)
            db.flush()
        elif cust_name and customer.name != cust_name:
            customer.name = cust_name
            customer.updated_at = utcnow_iso()

        # Handle simultaneous loyalty reward redemption if requested
        reward_redeemed = False
        settings = db.query(StoreSetting).filter(StoreSetting.id == 1).first()
        reward_item_name = settings.reward_item_name if settings else "1 Free 150g Tiramisu Cup"

        if sale_in.redeem_free_reward:
            loyalty = calculate_customer_loyalty(clean_phone, db)
            if loyalty["isEligible"]:
                redemption_id = f"RDM-{int(time.time() * 1000)}-{secrets.token_hex(2).upper()}"
                redemption = Redemption(
                    id=redemption_id,
                    customer_phone=clean_phone,
                    customer_name=customer.name,
                    reward_item=reward_item_name,
                    redeemed_at=utcnow_iso(),
                    date=today_date_str(),
                    admin_user="admin",
                    notes="Redeemed together with Sale POS"
                )
                db.add(redemption)
                reward_redeemed = True

        # Batch-fetch all products referenced in cart to prevent N+1 queries
        product_ids = [it.product_id for it in sale_in.items if it.product_id]
        products_map = {}
        if product_ids:
            found_prods = db.query(Product).filter(Product.id.in_(product_ids)).all()
            products_map = {p.id: p for p in found_prods}

        # Process cart items
        subtotal = 0.0
        total_cups_count = 0
        eligible_cups_count = 0
        db_items = []

        for item in sale_in.items:
            prod = products_map.get(item.product_id)
            price = prod.price if prod else max(0.0, float(item.price))
            qty = max(1, int(item.quantity))
            item_total = price * qty
            subtotal += item_total

            if not item.is_reward:
                # Total cup count includes ALL purchased cups (both eligible and excluded)
                total_cups_count += qty
                # Loyalty points only count eligible products
                if (prod.counts_towards_loyalty if prod else True):
                    eligible_cups_count += qty

            db_items.append(SaleItem(
                product_id=item.product_id,
                product_name=item.product_name or (prod.name if prod else "Tiramisu"),
                weight=prod.weight if prod else (item.weight or ""),
                price=price,
                quantity=qty,
                total=item_total,
                is_reward=item.is_reward
            ))

        if reward_redeemed:
            db_items.append(SaleItem(
                product_id="reward-150",
                product_name=f"{reward_item_name} (Loyalty Reward)",
                weight="150 g",
                price=0.0,
                quantity=1,
                total=0.0,
                is_reward=True
            ))

        # Compute discount
        discount_type = (sale_in.discount_type or "flat").lower()
        discount_value = max(0.0, float(sale_in.discount_value or 0.0))
        final_discount = max(0.0, float(sale_in.discount or 0.0))

        if discount_type == "percent" and discount_value > 0:
            pct = min(100.0, discount_value)
            final_discount = round((subtotal * pct) / 100.0, 2)
        elif final_discount == 0.0 and discount_value > 0 and discount_type == "flat":
            final_discount = min(subtotal, discount_value)

        final_discount = min(subtotal, final_discount)
        total_amount = max(0.0, round(subtotal - final_discount, 2))

        sale_id = f"TXN-{int(time.time() * 1000)}-{secrets.token_hex(2).upper()}"
        sale = Sale(
            id=sale_id,
            customer_phone=clean_phone,
            customer_name=customer.name,
            subtotal=subtotal,
            discount=final_discount,
            discount_type=discount_type,
            discount_value=discount_value,
            total_amount=total_amount,
            payment_mode=sale_in.payment_mode or "Cash",
            paid_cups_count=total_cups_count,
            eligible_cups_count=eligible_cups_count,
            timestamp=utcnow_iso(),
            date=today_date_str(),
            notes=sale_in.notes or "",
            reward_redeemed_in_sale=reward_redeemed
        )
        db.add(sale)
        db.flush()

        for it in db_items:
            it.sale_id = sale.id
            db.add(it)

        # Single atomic commit for customer, redemption, sale, and items
        db.commit()
    except Exception as e:
        db.rollback()
        raise e

    from backend.routers.realtime import notify_change
    notify_change("sales", "created")
    notify_change("customers", "updated")

    updated_loyalty = calculate_customer_loyalty(clean_phone, db, is_admin=True)

    return {
        "success": True,
        "message": "Sale recorded successfully!",
        "saleId": sale.id,
        "totalAmount": sale.total_amount,
        "loyalty": updated_loyalty
    }

@router.patch("/{sale_id}/customer", response_model=dict)
def patch_sale_customer(
    sale_id: str,
    data: SalePatchCustomer,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin)
):
    clean_phone = clean_phone_number(data.customer_phone)
    if not clean_phone or len(clean_phone) < 7:
        raise HTTPException(status_code=400, detail="Valid customer phone number with at least 7 digits is required")

    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    try:
        cust_name = (data.customer_name or sale.customer_name or "Valued Guest").strip()
        customer = db.query(Customer).filter(Customer.phone == clean_phone).first()
        if not customer:
            customer = Customer(phone=clean_phone, name=cust_name)
            db.add(customer)
            db.flush()
        elif data.customer_name and customer.name != cust_name:
            customer.name = cust_name
            customer.updated_at = utcnow_iso()

        sale.customer_phone = clean_phone
        sale.customer_name = cust_name
        db.commit()
    except Exception as e:
        db.rollback()
        raise e

    from backend.routers.realtime import notify_change
    notify_change("sales", "updated")
    notify_change("customers", "updated")

    return {
        "success": True,
        "saleId": sale.id,
        "customerPhone": clean_phone,
        "customerName": cust_name
    }

@router.get("/metrics", response_model=DashboardMetricsResponse)
def get_metrics(
    filter_date: str = "today",
    admin: dict = Depends(require_admin),
    db: Session = Depends(get_db)
):
    today_str = today_date_str()
    sales_query = db.query(Sale)
    redemptions_query = db.query(Redemption)

    if filter_date == "today":
        sales_query = sales_query.filter(Sale.date == today_str)
        redemptions_query = redemptions_query.filter(Redemption.date == today_str)
    elif filter_date == "yesterday":
        yesterday_str = (ist_now() - timedelta(days=1)).strftime("%Y-%m-%d")
        sales_query = sales_query.filter(Sale.date == yesterday_str)
        redemptions_query = redemptions_query.filter(Redemption.date == yesterday_str)
    elif filter_date == "all":
        pass
    elif filter_date.startswith("custom:"):
        custom = filter_date.replace("custom:", "").strip()
        sales_query = sales_query.filter(Sale.date == custom)
        redemptions_query = redemptions_query.filter(Redemption.date == custom)
    elif len(filter_date) == 10 and filter_date.count("-") == 2:
        sales_query = sales_query.filter(Sale.date == filter_date)
        redemptions_query = redemptions_query.filter(Redemption.date == filter_date)

    sales = sales_query.order_by(Sale.timestamp.desc()).all()
    redemptions = redemptions_query.all()

    total_revenue = 0.0
    cash_collection = 0.0
    online_collection = 0.0
    total_paid_quantity = 0
    def norm_key(name: str, weight: str = "") -> str:
        clean_name = (name or "").replace("–", "-").replace("—", "-").replace("\ufffd", "-")
        clean_name = " ".join(clean_name.split()).lower()
        clean_weight = (weight or "").replace(" ", "").lower()
        return f"{clean_name}::{clean_weight}"

    product_summary_dict = {}
    norm_to_pid = {}

    all_products = db.query(Product).all()
    for p in all_products:
        entry = {
            "id": p.id,
            "name": p.name,
            "weight": p.weight or "",
            "price": p.price,
            "quantity": 0,
            "revenue": 0.0
        }
        product_summary_dict[p.id] = entry
        nk = norm_key(p.name, p.weight)
        norm_to_pid[nk] = p.id

    for s in sales:
        total_revenue += s.total_amount
        if s.payment_mode == "Cash":
            cash_collection += s.total_amount
        else:
            online_collection += s.total_amount

        # Total cups sold includes all purchased products (both loyalty-eligible and excluded sizes)
        sale_cups = sum(it.quantity for it in s.items if not it.is_reward) if s.items else (s.paid_cups_count or 0)
        total_paid_quantity += sale_cups

        for it in s.items:
            if not it.is_reward:
                pid = it.product_id
                target_entry = None

                # 1. Match by exact product_id in catalog
                if pid and pid in product_summary_dict:
                    target_entry = product_summary_dict[pid]
                else:
                    # 2. Match by normalized product name and weight
                    nk = norm_key(it.product_name, it.weight)
                    if nk in norm_to_pid:
                        target_entry = product_summary_dict[norm_to_pid[nk]]
                    else:
                        # 3. Custom / standalone product
                        new_id = pid or f"custom-{len(product_summary_dict) + 1}"
                        target_entry = {
                            "id": new_id,
                            "name": it.product_name,
                            "weight": it.weight or "",
                            "price": it.price,
                            "quantity": 0,
                            "revenue": 0.0
                        }
                        product_summary_dict[new_id] = target_entry
                        norm_to_pid[nk] = new_id

                target_entry["quantity"] += it.quantity
                target_entry["revenue"] += it.total

    recent_sales_data = [
        {
            "id": s.id,
            "customerPhone": s.customer_phone,
            "customerName": s.customer_name,
            "totalAmount": s.total_amount,
            "paymentMode": s.payment_mode,
            "paidCupsCount": s.paid_cups_count,
            "timestamp": s.timestamp,
            "date": s.date,
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
        for s in sales[:10]
    ]

    return {
        "totalRevenue": total_revenue,
        "cashCollection": cash_collection,
        "onlineCollection": online_collection,
        "totalPaidQuantity": total_paid_quantity,
        "transactionCount": len(sales),
        "rewardsRedeemedCount": len(redemptions),
        "productSummary": list(product_summary_dict.values()),
        "recentSales": recent_sales_data,
        "filterDate": filter_date
    }

@router.get("/{sale_id}", response_model=dict)
def get_sale_by_id(
    sale_id: str,
    _rate: bool = Depends(rate_limit_receipts),
    admin: Optional[dict] = Depends(get_optional_admin),
    db: Session = Depends(get_db)
):
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Receipt not found")

    settings = db.query(StoreSetting).filter(StoreSetting.id == 1).first()
    is_admin = isinstance(admin, dict) and bool(admin.get("sub"))
    phone_display = sale.customer_phone if is_admin else mask_phone_number(sale.customer_phone)

    loyalty = None
    if sale.customer_phone:
        loyalty = calculate_customer_loyalty(sale.customer_phone, db, is_admin=is_admin)
        if not is_admin and loyalty:
            # Privacy guard: do not leak customer's historical orders on a single receipt view
            loyalty["salesHistory"] = []
            loyalty["redemptions"] = []

    return {
        "id": sale.id,
        "customerPhone": phone_display,
        "customerName": sale.customer_name,
        "subtotal": sale.subtotal,
        "discount": sale.discount,
        "discountType": getattr(sale, "discount_type", "flat") or "flat",
        "discountValue": getattr(sale, "discount_value", 0.0) or 0.0,
        "totalAmount": sale.total_amount,
        "paymentMode": sale.payment_mode,
        "paidCupsCount": sale.paid_cups_count,
        "eligibleCupsCount": getattr(sale, "eligible_cups_count", None) if getattr(sale, "eligible_cups_count", None) is not None else sale.paid_cups_count,
        "timestamp": sale.timestamp,
        "date": sale.date,
        "notes": sale.notes if is_admin else "",
        "rewardRedeemedInSale": sale.reward_redeemed_in_sale,
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
            for it in sale.items
        ],
        "loyalty": loyalty,
        "store": {
            "businessName": settings.business_name if settings else "TIRA Belle",
            "tagline": settings.tagline if settings else "LITTLE LAYERS • BIG LOVE",
            "slogan": settings.slogan if settings else "Handcrafted Italian Tiramisu",
            "address": settings.address if settings else "Physical Dessert Studio & Artisan Counter, Pune",
            "owners": settings.owner if settings else "Yash Chauhan & Tejas Chauhan",
            "phone": settings.phone if settings else "9373484198",
            "phoneSecondary": settings.phone_secondary if settings else "8484870543",
            "currency": settings.currency if settings else "₹",
            "logo": settings.logo if settings else "assets/tira-belle-logo.png"
        }
    }
