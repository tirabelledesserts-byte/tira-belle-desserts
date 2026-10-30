import os
from sqlalchemy.orm import Session
from backend.models import StoreSetting, Product
from backend.security import hash_credential

_initial_pass = os.getenv("INITIAL_ADMIN_PASSWORD", "tira-123")
if not os.getenv("INITIAL_ADMIN_PASSWORD"):
    import logging
    logging.getLogger("tirabelle.seed").warning(
        "[SECURITY WARNING] INITIAL_ADMIN_PASSWORD not set. Ensure you rotate admin credentials immediately!"
    )

DEFAULT_SETTINGS = {
    "id": 1,
    "business_name": "TIRA Belle",
    "tagline": "Little Layers • Big Love",
    "slogan": "Layers of Love in Every Spoon",
    "owner": "Yash Chauhan & Tejas Chauhan",
    "phone": "9373484198",
    "phone_secondary": "8484870543",
    "whatsapp": "9373484198",
    "address": "Physical Dessert Studio & Artisan Counter, Pune",
    "email": "tirabelle.desserts@gmail.com",
    "instagram": "tirabelle.desserts",
    "instagram_url": "https://instagram.com/tirabelle.desserts?obrf=MzhsZG04Ymc3NXBj",
    "upi_id": "9373484198@upi",
    "currency": "₹",
    "loyalty_threshold": 5,
    "reward_item_name": "1 Free 150g Tiramisu Cup",
    "logo": "assets/tira-belle-logo.png",
    "admin_username": os.getenv("INITIAL_ADMIN_USERNAME", "tirabelle.desserts@gmail.com"),
    "admin_password_hash": hash_credential(_initial_pass),
    "admin_pin_hash": None
}

DEFAULT_CATEGORIES = [
    {
        "id": "cat-classic",
        "name": "Classic Tiramisu",
        "slug": "classic",
        "description": "Authentic Italian recipe with espresso-soaked savoiardi ladyfingers and whipped velvety mascarpone cream.",
        "image": "assets/classic/tiramisu-classic-150 g.png",
        "display_order": 1,
        "is_active": True
    },
    {
        "id": "cat-chocolate",
        "name": "Chocolate Tiramisu",
        "slug": "chocolate",
        "description": "Rich artisanal indulgence with double Belgian cocoa layers, dark chocolate curls, and airy mascarpone mousse.",
        "image": "assets/chocolate/tiramisu-chocolate-150 g.png",
        "display_order": 2,
        "is_active": True
    }
]

DEFAULT_PRODUCTS = [
    {
        "id": "prod-150",
        "category_id": "cat-classic",
        "name": "Classic – 150 g",
        "short_name": "150 g Cup",
        "price": 100.0,
        "weight": "150 g",
        "description": "Handcrafted espresso-soaked savoiardi ladyfingers, velvety mascarpone cream, finished with rich Belgian cocoa dust.",
        "image": "assets/classic/tiramisu-classic-150 g.png",
        "badge": "Classic Single Serve",
        "counts_towards_loyalty": True,
        "is_active": True
    },
    {
        "id": "prod-350",
        "category_id": "cat-classic",
        "name": "Classic – 350 g",
        "short_name": "350 g Sharing Tub",
        "price": 200.0,
        "weight": "350 g",
        "description": "Generous sharing tub layered with double mascarpone cream, dark chocolate curls, and rich espresso goodness.",
        "image": "assets/classic/tiramisu-classic-350 g.png",
        "badge": "Best Value • Sharing Tub",
        "counts_towards_loyalty": True,
        "is_active": True
    },
    {
        "id": "prod-choco-150",
        "category_id": "cat-chocolate",
        "name": "Chocolate – 150 g",
        "short_name": "150 g Choco Cup",
        "price": 120.0,
        "weight": "150 g",
        "description": "Rich artisanal indulgence with double Belgian cocoa layers, dark chocolate curls, and airy mascarpone mousse.",
        "image": "assets/chocolate/tiramisu-chocolate-150 g.png",
        "badge": "Chocolate Single Serve",
        "counts_towards_loyalty": True,
        "is_active": True
    },
    {
        "id": "prod-choco-350",
        "category_id": "cat-chocolate",
        "name": "Chocolate – 350 g",
        "short_name": "350 g Choco Tub",
        "price": 220.0,
        "weight": "350 g",
        "description": "Generous sharing tub layered with double mascarpone cream, dark chocolate curls, and rich espresso goodness.",
        "image": "assets/chocolate/tiramisu-chocolate-350 g.png",
        "badge": "Best Value • Sharing Tub",
        "counts_towards_loyalty": True,
        "is_active": True
    }
]

def migrate_database_schema(db: Session):
    """
    Safely runs SQLite non-destructive schema migrations.
    Adds category_id column to products if not yet present.
    """
    from sqlalchemy import text
    try:
        if db.bind and db.bind.dialect.name == "sqlite":
            cols = [row[1] for row in db.execute(text("PRAGMA table_info(products)")).fetchall()]
            if "category_id" not in cols:
                db.execute(text("ALTER TABLE products ADD COLUMN category_id VARCHAR(50) REFERENCES categories(id)"))
                db.commit()
    except Exception as e:
        db.rollback()
        print(f"[MIGRATION WARNING] {e}")

def seed_initial_data(db: Session):
    """
    Seeds essential baseline data:
    1. Business Information & Branding Settings
    2. Default categories (Classic & Chocolate)
    3. Essential core products assigned to their respective categories
    """
    from backend.models import Category
    from sqlalchemy import text

    # Ensure schema is up to date
    migrate_database_schema(db)

    # 1. Business Information, Branding & Admin Credentials
    existing_settings = db.query(StoreSetting).filter(StoreSetting.id == 1).first()
    if not existing_settings:
        db.add(StoreSetting(**DEFAULT_SETTINGS))

    # 2. Categories
    category_count = db.query(Category).count()
    if category_count == 0:
        for c in DEFAULT_CATEGORIES:
            db.add(Category(**c))
        db.commit()

    # 3. Products
    product_count = db.query(Product).count()
    if product_count == 0:
        for p in DEFAULT_PRODUCTS:
            db.add(Product(**p))
        db.commit()
    else:
        # Backfill category_id for existing products if unassigned
        existing_prods = db.query(Product).all()
        for prod in existing_prods:
            if not prod.category_id:
                name_lower = (prod.name or "").lower()
                img_lower = (prod.image or "").lower()
                if "choco" in name_lower or "choco" in img_lower:
                    prod.category_id = "cat-chocolate"
                else:
                    prod.category_id = "cat-classic"
        db.commit()
