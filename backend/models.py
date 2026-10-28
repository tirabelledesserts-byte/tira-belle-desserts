from datetime import datetime, timezone, timedelta
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, Text, DateTime, ForeignKey, Index
)
from sqlalchemy.orm import relationship
from backend.database import Base

# India Standard Time (IST) offset: UTC + 5:30 for physical bakery operations in Pune
IST = timezone(timedelta(hours=5, minutes=30))

def ist_now() -> datetime:
    return datetime.now(IST)

def utcnow_iso():
    return datetime.now(timezone.utc).isoformat()

def today_date_str():
    return ist_now().strftime("%Y-%m-%d")

class StoreSetting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, default=1)
    business_name = Column(String(100), default="TIRA Belle")
    tagline = Column(String(200), default="Little Layers • Big Love")
    slogan = Column(String(200), default="Layers of Love in Every Spoon")
    owner = Column(String(150), default="Yash Chauhan & Tejas Chauhan")
    phone = Column(String(20), default="9373484198")
    phone_secondary = Column(String(20), default="8484870543")
    whatsapp = Column(String(20), default="9373484198")
    address = Column(String(255), default="Physical Dessert Studio & Artisan Counter, Pune")
    email = Column(String(100), default="tirabelle.desserts@gmail.com")
    instagram = Column(String(100), default="tirabelle.desserts")
    instagram_url = Column(String(255), default="https://instagram.com/tirabelle.desserts?obrf=MzhsZG04Ymc3NXBj")
    upi_id = Column(String(50), default="9373484198@upi")
    currency = Column(String(10), default="₹")
    loyalty_threshold = Column(Integer, default=5)
    reward_item_name = Column(String(100), default="1 Free 150g Tiramisu Cup")
    logo = Column(String(255), default="assets/tira-belle-logo.png")
    admin_username = Column(String(100), default="tirabelle.desserts@gmail.com")
    # SHA-256('tira-123' + 'TIRABELLE_SALT_2026')
    admin_password_hash = Column(String(128), default="2dbedb0613a00450077568d21baa5661ae3fba47257723b15627ba46b7cff28a")
    admin_pin_hash = Column(String(128), default=None, nullable=True)

class Category(Base):
    __tablename__ = "categories"

    id = Column(String(50), primary_key=True)
    name = Column(String(100), nullable=False)
    slug = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(Text, default="")
    image = Column(String(255), default="")
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(String(50), default=utcnow_iso)
    updated_at = Column(String(50), default=utcnow_iso)

    products = relationship("Product", back_populates="category_rel")

class Product(Base):
    __tablename__ = "products"

    id = Column(String(50), primary_key=True)
    category_id = Column(String(50), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String(100), nullable=False)
    short_name = Column(String(100))
    price = Column(Float, nullable=False, default=0.0)
    weight = Column(String(50))
    description = Column(Text)
    image = Column(String(255))
    badge = Column(String(100))
    counts_towards_loyalty = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(String(50), default=utcnow_iso)
    updated_at = Column(String(50), default=utcnow_iso)

    category_rel = relationship("Category", back_populates="products")

class Customer(Base):
    __tablename__ = "customers"

    phone = Column(String(20), primary_key=True)
    name = Column(String(100), nullable=False, default="Valued Guest")
    created_at = Column(String(50), default=utcnow_iso)
    updated_at = Column(String(50), default=utcnow_iso)

    sales = relationship("Sale", back_populates="customer", cascade="all, delete-orphan")
    redemptions = relationship("Redemption", back_populates="customer", cascade="all, delete-orphan")

class Sale(Base):
    __tablename__ = "sales"

    id = Column(String(50), primary_key=True)
    customer_phone = Column(String(20), ForeignKey("customers.phone"), nullable=False, index=True)
    customer_name = Column(String(100))
    subtotal = Column(Float, default=0.0)
    discount = Column(Float, default=0.0)
    total_amount = Column(Float, default=0.0)
    payment_mode = Column(String(20), default="Cash")  # "Cash" | "Online"
    paid_cups_count = Column(Integer, default=0)
    timestamp = Column(String(50), default=utcnow_iso, index=True)
    date = Column(String(20), default=today_date_str, index=True)
    notes = Column(Text, default="")
    reward_redeemed_in_sale = Column(Boolean, default=False)

    __table_args__ = (
        Index("ix_sales_date_timestamp", "date", "timestamp"),
    )

    customer = relationship("Customer", back_populates="sales")
    items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan", lazy="selectin")

class SaleItem(Base):
    __tablename__ = "sale_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sale_id = Column(String(50), ForeignKey("sales.id"), nullable=False, index=True)
    product_id = Column(String(50), nullable=False, index=True)
    product_name = Column(String(100), nullable=False)
    weight = Column(String(50), default="")
    price = Column(Float, default=0.0)
    quantity = Column(Integer, default=1)
    total = Column(Float, default=0.0)
    is_reward = Column(Boolean, default=False)

    sale = relationship("Sale", back_populates="items")

class Redemption(Base):
    __tablename__ = "redemptions"

    id = Column(String(50), primary_key=True)
    customer_phone = Column(String(20), ForeignKey("customers.phone"), nullable=False, index=True)
    customer_name = Column(String(100))
    reward_item = Column(String(100), default="1 Free 150g Tiramisu Cup")
    redeemed_at = Column(String(50), default=utcnow_iso, index=True)
    date = Column(String(20), default=today_date_str, index=True)
    admin_user = Column(String(50), default="admin")
    notes = Column(Text, default="Redeemed over counter")

    customer = relationship("Customer", back_populates="redemptions")

class Review(Base):
    __tablename__ = "reviews"

    id = Column(String(50), primary_key=True)
    name = Column(String(100), nullable=False)
    phone = Column(String(20), default="", index=True)
    rating = Column(Integer, nullable=False, default=5)
    favorite_item = Column(String(100), default="Tiramisu – 150 g")
    comment = Column(Text, nullable=False)
    date = Column(String(20), default=today_date_str, index=True)
    timestamp = Column(String(50), default=utcnow_iso, index=True)
    verified = Column(Boolean, default=False)
