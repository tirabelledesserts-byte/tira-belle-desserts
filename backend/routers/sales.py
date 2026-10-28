import time
import secrets
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models import Sale, SaleItem, Customer, Product, Redemption, StoreSetting, utcnow_iso, today_date_str
from backend.schemas import SaleCreate, SalePatchCustomer, SaleResponse, DashboardMetricsResponse
from backend.routers.customers import clean_phone_number, calculate_customer_loyalty

router = APIRouter(prefix="/api/sales", tags=["Sales & POS"])

@router.get("", response_model=List[SaleResponse])
def get_sales(limit: int = 200, db: Session = Depends(get_db)):
    sales = db.query(Sale).order_by(Sale.timestamp.desc()).limit(limit).all()
    results = []
    for s in sales:
        results.append({
            "id": s.id,
            "customerPhone": s.customer_phone,
            "customerName": s.customer_name,
            "subtotal": s.subtotal,
            "discount": s.discount,
            "totalAmount": s.total_amount,
            "paymentMode": s.payment_mode,
            "paidCupsCount": s.paid_cups_count,
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
def create_sale(sale_in: SaleCreate, db: Session = Depends(get_db)):
    clean_phone = clean_phone_number(sale_in.customer_phone)
    if not clean_phone:
        raise HTTPException(status_code=400, detail="Valid customer phone number is required")

    if not sale_in.items:
        raise HTTPException(status_code=400, detail="Cart cannot be empty")

    # Upsert customer
    cust_name = (sale_in.customer_name or "Valued Guest").strip()
    customer = db.query(Customer).filter(Customer.phone == clean_phone).first()
    if not customer:
        customer = Customer(phone=clean_phone, name=cust_name)
        db.add(customer)
        db.commit()
    elif cust_name and customer.name != cust_name:
        customer.name = cust_name
        customer.updated_at = utcnow_iso()
        db.commit()

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

    # Process cart items
    subtotal = 0.0
    paid_cups_count = 0
    db_items = []

    for item in sale_in.items:
        prod = db.query(Product).filter(Product.id == item.product_id).first()
        price = prod.price if prod else item.price
        qty = max(1, item.quantity)
        item_total = price * qty
        subtotal += item_total

        if not item.is_reward and (prod.counts_towards_loyalty if prod else True):
            paid_cups_count += qty

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

    sale_id = f"TXN-{int(time.time() * 1000)}-{secrets.token_hex(2).upper()}"
    sale = Sale(
        id=sale_id,
        customer_phone=clean_phone,
        customer_name=customer.name,
        subtotal=subtotal,
        discount=0.0,
        total_amount=subtotal,
        payment_mode=sale_in.payment_mode or "Cash",
        paid_cups_count=paid_cups_count,
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

    db.commit()

    from backend.routers.realtime import notify_change
    notify_change("sales", "created", {
        "saleId": sale.id,
        "phone": clean_phone,
        "customerName": customer.name,
        "totalAmount": sale.total_amount,
        "paymentMode": sale.payment_mode,
        "paidCupsCount": sale.paid_cups_count,
        "items": [it.product_name for it in sale.items]
    })
    notify_change("customers", "updated", {"phone": clean_phone})

    updated_loyalty = calculate_customer_loyalty(clean_phone, db)

    return {
        "success": True,
        "message": "Sale recorded successfully!",
        "saleId": sale.id,
        "totalAmount": sale.total_amount,
        "loyalty": updated_loyalty
    }

@router.patch("/{sale_id}/customer", response_model=dict)
def patch_sale_customer(sale_id: str, data: SalePatchCustomer, db: Session = Depends(get_db)):
    clean_phone = clean_phone_number(data.customer_phone)
    if not clean_phone:
        raise HTTPException(status_code=400, detail="Valid customer phone number is required")

    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    cust_name = (data.customer_name or sale.customer_name or "Valued Guest").strip()
    customer = db.query(Customer).filter(Customer.phone == clean_phone).first()
    if not customer:
        customer = Customer(phone=clean_phone, name=cust_name)
        db.add(customer)
        db.commit()
    elif data.customer_name and customer.name != cust_name:
        customer.name = cust_name
        customer.updated_at = utcnow_iso()
        db.commit()

    sale.customer_phone = clean_phone
    sale.customer_name = cust_name
    db.commit()

    from backend.routers.realtime import notify_change
    notify_change("sales", "updated", {
        "saleId": sale.id,
        "phone": clean_phone,
        "customerName": cust_name
    })
    notify_change("customers", "updated", {"phone": clean_phone})

    return {
        "success": True,
        "saleId": sale.id,
        "customerPhone": clean_phone,
        "customerName": cust_name
    }

@router.get("/metrics", response_model=DashboardMetricsResponse)
def get_metrics(filter_date: str = "today", db: Session = Depends(get_db)):
    today_str = today_date_str()
    sales_query = db.query(Sale)
    redemptions_query = db.query(Redemption)

    if filter_date == "today":
        sales_query = sales_query.filter(Sale.date == today_str)
        redemptions_query = redemptions_query.filter(Redemption.date == today_str)
    elif filter_date == "yesterday":
        yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
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
    product_summary_dict = {}

    all_products = db.query(Product).all()
    for p in all_products:
        product_summary_dict[p.id] = {
            "id": p.id,
            "name": p.name,
            "weight": p.weight,
            "price": p.price,
            "quantity": 0,
            "revenue": 0.0
        }

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
                if pid not in product_summary_dict:
                    product_summary_dict[pid] = {
                        "id": pid,
                        "name": it.product_name,
                        "weight": it.weight or "",
                        "price": it.price,
                        "quantity": 0,
                        "revenue": 0.0
                    }
                product_summary_dict[pid]["quantity"] += it.quantity
                product_summary_dict[pid]["revenue"] += it.total

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
def get_sale_by_id(sale_id: str, db: Session = Depends(get_db)):
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Receipt not found")

    settings = db.query(StoreSetting).filter(StoreSetting.id == 1).first()
    loyalty = calculate_customer_loyalty(sale.customer_phone, db) if sale.customer_phone else None

    return {
        "id": sale.id,
        "customerPhone": sale.customer_phone,
        "customerName": sale.customer_name,
        "subtotal": sale.subtotal,
        "discount": sale.discount,
        "totalAmount": sale.total_amount,
        "paymentMode": sale.payment_mode,
        "paidCupsCount": sale.paid_cups_count,
        "timestamp": sale.timestamp,
        "date": sale.date,
        "notes": sale.notes,
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
