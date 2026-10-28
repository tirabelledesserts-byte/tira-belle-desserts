from typing import List, Optional, Any
from pydantic import BaseModel, Field, ConfigDict

class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

# ---------------- Auth Schemas ----------------
class LoginRequest(BaseModel):
    username: str
    secret: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str

class UpdateCredentialsRequest(BaseModel):
    username: Optional[str] = None
    old_password: Optional[str] = Field(default=None, alias="oldPassword")
    password: Optional[str] = None
    pin: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)

# ---------------- Category Schemas ----------------
class CategoryBase(CamelModel):
    id: Optional[str] = None
    name: str
    slug: Optional[str] = None
    description: Optional[str] = ""
    image: Optional[str] = ""
    display_order: int = Field(default=0, alias="displayOrder")
    is_active: bool = Field(default=True, alias="isActive")

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    display_order: Optional[int] = Field(default=None, alias="displayOrder")
    is_active: Optional[bool] = Field(default=None, alias="isActive")

    model_config = ConfigDict(populate_by_name=True)

class CategoryResponse(CategoryBase):
    created_at: Optional[str] = Field(default=None, alias="createdAt")
    updated_at: Optional[str] = Field(default=None, alias="updatedAt")
    product_count: Optional[int] = Field(default=0, alias="productCount")
    images: Optional[List[str]] = []

# ---------------- Product Schemas ----------------
class ProductBase(CamelModel):
    id: Optional[str] = None
    category_id: Optional[str] = Field(default=None, alias="categoryId")
    name: str
    short_name: Optional[str] = Field(default=None, alias="shortName")
    price: float
    weight: Optional[str] = ""
    description: Optional[str] = ""
    image: Optional[str] = "assets/tira-belle-logo.png"
    badge: Optional[str] = ""
    counts_towards_loyalty: bool = Field(default=True, alias="countsTowardsLoyalty")
    is_active: bool = Field(default=True, alias="isActive")

class ProductCreate(ProductBase):
    pass

class ProductUpdate(BaseModel):
    category_id: Optional[str] = Field(default=None, alias="categoryId")
    name: Optional[str] = None
    short_name: Optional[str] = Field(default=None, alias="shortName")
    price: Optional[float] = None
    weight: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None
    badge: Optional[str] = None
    counts_towards_loyalty: Optional[bool] = Field(default=None, alias="countsTowardsLoyalty")
    is_active: Optional[bool] = Field(default=None, alias="isActive")

    model_config = ConfigDict(populate_by_name=True)

class ProductResponse(ProductBase):
    category_name: Optional[str] = Field(default=None, alias="categoryName")
    created_at: Optional[str] = Field(default=None, alias="createdAt")
    updated_at: Optional[str] = Field(default=None, alias="updatedAt")

# ---------------- Customer Schemas ----------------
class CustomerBase(CamelModel):
    phone: str
    name: str = "Valued Guest"

class CustomerCreate(CustomerBase):
    pass

class CustomerResponse(CustomerBase):
    created_at: Optional[str] = Field(default=None, alias="createdAt")
    updated_at: Optional[str] = Field(default=None, alias="updatedAt")

# ---------------- Loyalty Schemas ----------------
class CustomerLoyaltyResponse(CamelModel):
    customer: CustomerResponse
    threshold: int
    total_cups_purchased: int = Field(alias="totalCupsPurchased")
    total_eligible_cups: int = Field(alias="totalEligibleCups")
    completed_purchases_count: int = Field(alias="completedPurchasesCount")
    total_earned_rewards: int = Field(alias="totalEarnedRewards")
    claimed_count: int = Field(alias="claimedCount")
    available_rewards: int = Field(alias="availableRewards")
    is_eligible: bool = Field(alias="isEligible")
    current_cycle_progress: int = Field(alias="currentCycleProgress")
    cups_remaining: int = Field(alias="cupsRemaining")
    purchases_remaining: int = Field(alias="purchasesRemaining")
    redemptions: List[Any] = []
    sales_history: List[Any] = Field(default=[], alias="salesHistory")

# ---------------- Sale Schemas ----------------
class SaleItemSchema(CamelModel):
    product_id: str = Field(alias="productId")
    product_name: str = Field(alias="productName")
    weight: Optional[str] = ""
    price: float = 0.0
    quantity: int = 1
    total: float = 0.0
    is_reward: bool = Field(default=False, alias="isReward")

class SaleCreate(CamelModel):
    customer_phone: str = Field(alias="customerPhone")
    customer_name: Optional[str] = Field(default="Valued Guest", alias="customerName")
    items: List[SaleItemSchema]
    payment_mode: str = Field(default="Cash", alias="paymentMode")
    notes: Optional[str] = ""
    redeem_free_reward: bool = Field(default=False, alias="redeemFreeReward")

class SalePatchCustomer(CamelModel):
    customer_phone: str = Field(alias="customerPhone")
    customer_name: Optional[str] = Field(default=None, alias="customerName")

class SaleResponse(CamelModel):
    id: str
    customer_phone: str = Field(alias="customerPhone")
    customer_name: Optional[str] = Field(alias="customerName")
    subtotal: float
    discount: float
    total_amount: float = Field(alias="totalAmount")
    payment_mode: str = Field(alias="paymentMode")
    paid_cups_count: int = Field(alias="paidCupsCount")
    timestamp: str
    date: str
    notes: Optional[str] = ""
    reward_redeemed_in_sale: bool = Field(alias="rewardRedeemedInSale")
    items: List[SaleItemSchema] = []

# ---------------- Redemption Schemas ----------------
class RedemptionCreate(CamelModel):
    customer_phone: str = Field(alias="customerPhone")
    admin_user: Optional[str] = Field(default="admin", alias="adminUser")
    notes: Optional[str] = ""

class RedemptionResponse(CamelModel):
    id: str
    customer_phone: str = Field(alias="customerPhone")
    customer_name: Optional[str] = Field(alias="customerName")
    reward_item: str = Field(alias="rewardItem")
    redeemed_at: str = Field(alias="redeemedAt")
    date: str
    admin_user: str = Field(alias="adminUser")
    notes: Optional[str] = ""

# ---------------- Review Schemas ----------------
class ReviewCreate(CamelModel):
    name: str
    phone: Optional[str] = ""
    rating: int = 5
    favorite_item: Optional[str] = Field(default="Classic – 150 g", alias="favoriteItem")
    comment: str

class ReviewResponse(CamelModel):
    id: str
    name: str
    phone: Optional[str] = ""
    rating: int
    favorite_item: str = Field(alias="favoriteItem")
    comment: str
    date: str
    timestamp: str
    verified: bool

# ---------------- Settings Schemas ----------------
class SettingsSchema(CamelModel):
    business_name: Optional[str] = Field(default=None, alias="businessName")
    tagline: Optional[str] = None
    slogan: Optional[str] = None
    owner: Optional[str] = None
    phone: Optional[str] = None
    phone_secondary: Optional[str] = Field(default=None, alias="phoneSecondary")
    whatsapp: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    instagram: Optional[str] = None
    instagram_url: Optional[str] = Field(default=None, alias="instagramUrl")
    upi_id: Optional[str] = Field(default=None, alias="upiId")
    currency: Optional[str] = "₹"
    loyalty_threshold: Optional[int] = Field(default=5, alias="loyaltyThreshold")
    reward_item_name: Optional[str] = Field(default="1 Free 150g Tiramisu Cup", alias="rewardItemName")
    logo: Optional[str] = "assets/tira-belle-logo.png"
    admin_username: Optional[str] = Field(default="admin", alias="adminUsername")

class DashboardMetricsResponse(CamelModel):
    total_revenue: float = Field(alias="totalRevenue")
    cash_collection: float = Field(alias="cashCollection")
    online_collection: float = Field(alias="onlineCollection")
    total_paid_quantity: int = Field(alias="totalPaidQuantity")
    transaction_count: int = Field(alias="transactionCount")
    rewards_redeemed_count: int = Field(alias="rewardsRedeemedCount")
    product_summary: List[Any] = Field(alias="productSummary")
    recent_sales: List[Any] = Field(alias="recentSales")
    filter_date: str = Field(alias="filterDate")
