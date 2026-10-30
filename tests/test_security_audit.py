import unittest
import os
import json
import asyncio
from typing import Optional, Dict, Any
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.main import app
from backend.database import Base, get_db
from backend.models import Customer, Sale, SaleItem, Redemption, StoreSetting, Product, Review
from backend.security import hash_credential, create_access_token, SlidingWindowRateLimiter

# File-based SQLite test DB to ensure tables persist across connections during tests
TEST_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "test_sec_audit.db")
SQLALCHEMY_TEST_DATABASE_URL = f"sqlite:///{os.path.abspath(TEST_DB_PATH)}"

class SimpleAsgiResponse:
    def __init__(self, status_code: int, headers: list, body: bytes):
        self.status_code = status_code
        self.headers = {k.lower(): v for k, v in headers}
        self.body = body

    def json(self) -> Any:
        if not self.body:
            return {}
        return json.loads(self.body.decode("utf-8"))

class AsgiTestClient:
    def __init__(self, app_instance):
        self.app = app_instance

    def request(self, method: str, url: str, headers: Optional[Dict[str, str]] = None, json_body: Optional[Any] = None) -> SimpleAsgiResponse:
        path = url
        query_string = b""
        if "?" in url:
            path, qs = url.split("?", 1)
            query_string = qs.encode("ascii")

        body_bytes = b""
        req_headers = dict(headers or {})
        if json_body is not None:
            body_bytes = json.dumps(json_body).encode("utf-8")
            if "content-type" not in [k.lower() for k in req_headers]:
                req_headers["content-type"] = "application/json"

        headers_list = [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in req_headers.items()]

        scope = {
            "type": "http",
            "http_version": "1.1",
            "method": method.upper(),
            "path": path,
            "raw_path": path.encode("ascii"),
            "query_string": query_string,
            "headers": headers_list,
            "client": ("127.0.0.1", 54321),
            "server": ("127.0.0.1", 80)
        }

        response_body = []
        status_code = None
        response_headers = []

        async def receive():
            return {"type": "http.request", "body": body_bytes, "more_body": False}

        async def send(message):
            nonlocal status_code, response_headers
            if message["type"] == "http.response.start":
                status_code = message["status"]
                response_headers = [(k.decode("latin-1"), v.decode("latin-1")) for k, v in message.get("headers", [])]
            elif message["type"] == "http.response.body":
                response_body.append(message.get("body", b""))

        asyncio.run(self.app(scope, receive, send))
        return SimpleAsgiResponse(status_code, response_headers, b"".join(response_body))

    def get(self, url: str, headers: Optional[Dict[str, str]] = None) -> SimpleAsgiResponse:
        return self.request("GET", url, headers=headers)

    def post(self, url: str, json: Optional[Any] = None, headers: Optional[Dict[str, str]] = None) -> SimpleAsgiResponse:
        return self.request("POST", url, headers=headers, json_body=json)

    def put(self, url: str, json: Optional[Any] = None, headers: Optional[Dict[str, str]] = None) -> SimpleAsgiResponse:
        return self.request("PUT", url, headers=headers, json_body=json)

    def patch(self, url: str, json: Optional[Any] = None, headers: Optional[Dict[str, str]] = None) -> SimpleAsgiResponse:
        return self.request("PATCH", url, headers=headers, json_body=json)

    def delete(self, url: str, headers: Optional[Dict[str, str]] = None) -> SimpleAsgiResponse:
        return self.request("DELETE", url, headers=headers)


class SecurityAuditTestSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            SQLALCHEMY_TEST_DATABASE_URL,
            connect_args={"check_same_thread": False}
        )
        cls.TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)

        def override_get_db():
            db = cls.TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        cls.client = AsgiTestClient(app)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.clear()
        cls.engine.dispose()
        if os.path.exists(TEST_DB_PATH):
            try:
                os.remove(TEST_DB_PATH)
            except Exception:
                pass

    def setUp(self):
        Base.metadata.drop_all(bind=self.engine)
        Base.metadata.create_all(bind=self.engine)
        self.db = self.TestingSessionLocal()

        # Seed initial test settings
        self.settings = StoreSetting(
            id=1,
            business_name="TIRA Belle Test",
            admin_username="admin@tirabelle.test",
            admin_password_hash=hash_credential("SecretAdminPass2026!"),
            loyalty_threshold=5,
            reward_item_name="Free Tiramisu Test"
        )
        self.db.add(self.settings)

        # Seed Customer A (Alice)
        self.customer_a = Customer(phone="9876543210", name="Alice Customer")
        self.db.add(self.customer_a)

        # Seed Customer B (Bob)
        self.customer_b = Customer(phone="9822012345", name="Bob Customer")
        self.db.add(self.customer_b)

        # Seed Sale for Customer A
        self.sale_a = Sale(
            id="TXN-TEST-1001",
            customer_phone="9876543210",
            customer_name="Alice Customer",
            subtotal=200.0,
            discount=0.0,
            total_amount=200.0,
            payment_mode="Cash",
            paid_cups_count=2,
            eligible_cups_count=2,
            timestamp="2026-10-30T10:00:00Z",
            date="2026-10-30",
            notes="Confidential Cashier Note for Alice"
        )
        self.db.add(self.sale_a)

        # Seed Sale Item
        self.sale_item_a = SaleItem(
            sale_id="TXN-TEST-1001",
            product_id="prod-150",
            product_name="Classic – 150 g",
            weight="150 g",
            price=100.0,
            quantity=2,
            total=200.0
        )
        self.db.add(self.sale_item_a)

        # Seed Redemption for Customer A
        self.redemption_a = Redemption(
            id="RDM-TEST-5001",
            customer_phone="9876543210",
            customer_name="Alice Customer",
            reward_item="Free Tiramisu Test",
            redeemed_at="2026-10-30T11:00:00Z",
            date="2026-10-30",
            admin_user="privileged_admin_root",
            notes="Privileged Internal Redemption Note"
        )
        self.db.add(self.redemption_a)

        # Seed Review
        self.review = Review(
            id="rev-test-1",
            name="Alice",
            phone="9876543210",
            rating=5,
            favorite_item="Classic – 150 g",
            comment="Artisanal perfection!",
            date="2026-10-30",
            timestamp="2026-10-30T10:00:00Z",
            verified=True
        )
        self.db.add(self.review)

        self.db.commit()

        # Generate valid Admin Bearer JWT
        self.admin_token = create_access_token({"sub": "admin@tirabelle.test", "role": "admin"})
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)

    # ---------------- 01. BROKEN ACCESS CONTROL & UNPROTECTED ROUTES ----------------

    def test_anonymous_cannot_access_sales_list(self):
        """Verify unauthenticated user cannot dump all store sales."""
        res = self.client.get("/api/sales")
        self.assertEqual(res.status_code, 401)
        self.assertIn("Admin authentication required", res.json()["detail"])

    def test_anonymous_cannot_create_sales(self):
        """Verify unauthenticated user cannot inject orders via POST /api/sales."""
        payload = {
            "customerPhone": "9876543210",
            "customerName": "Attacker",
            "items": [{"productId": "prod-150", "productName": "Classic", "price": 100, "quantity": 1, "total": 100}],
            "paymentMode": "Cash"
        }
        res = self.client.post("/api/sales", json=payload)
        self.assertEqual(res.status_code, 401)

    def test_anonymous_cannot_access_dashboard_metrics(self):
        """Verify unauthenticated user cannot view business revenue and collection metrics."""
        res = self.client.get("/api/sales/metrics")
        self.assertEqual(res.status_code, 401)

    def test_anonymous_cannot_access_customer_list(self):
        """Verify unauthenticated user cannot enumerate all customers."""
        res = self.client.get("/api/customers")
        self.assertEqual(res.status_code, 401)

    def test_anonymous_cannot_upsert_customer(self):
        """Verify unauthenticated user cannot modify or create customer profiles."""
        res = self.client.post("/api/customers", json={"phone": "9999999999", "name": "Fake"})
        self.assertEqual(res.status_code, 401)

    def test_anonymous_cannot_access_redemptions(self):
        """Verify unauthenticated user cannot list reward redemptions."""
        res = self.client.get("/api/redemptions")
        self.assertEqual(res.status_code, 401)

    def test_anonymous_cannot_claim_redemption(self):
        """Verify unauthenticated user cannot trigger reward redemptions."""
        res = self.client.post("/api/redemptions", json={"customerPhone": "9876543210"})
        self.assertEqual(res.status_code, 401)

    def test_anonymous_cannot_update_store_settings(self):
        """Verify unauthenticated user cannot overwrite store configuration."""
        res = self.client.put("/api/settings", json={"businessName": "Hacked Store"})
        self.assertEqual(res.status_code, 401)

    def test_anonymous_cannot_mutate_categories(self):
        """Verify category creation requires admin authentication."""
        res = self.client.post("/api/categories", json={"name": "Hacked Category"})
        self.assertEqual(res.status_code, 401)

    def test_anonymous_cannot_mutate_products(self):
        """Verify product creation requires admin authentication."""
        res = self.client.post("/api/products", json={"name": "Free Cake", "price": 0.0})
        self.assertEqual(res.status_code, 401)

    def test_anonymous_cannot_delete_reviews(self):
        """Verify review deletion requires admin authentication."""
        res = self.client.delete("/api/reviews/rev-test-1")
        self.assertEqual(res.status_code, 401)

    # ---------------- 02. IDOR & SENSITIVE DATA EXPOSURE ----------------

    def test_public_receipt_masks_phone_and_hides_private_notes(self):
        """IDOR Prevention: Receipt lookup hides customer phone number and cashier notes from anonymous viewers."""
        res = self.client.get("/api/sales/TXN-TEST-1001")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["customerPhone"], "98765 •••• 10")
        self.assertEqual(data["notes"], "")
        if data.get("loyalty"):
            self.assertEqual(data["loyalty"]["salesHistory"], [])
            self.assertEqual(data["loyalty"]["redemptions"], [])

    def test_admin_receipt_retains_full_details(self):
        """Admin viewing receipt sees full customer phone and notes."""
        res = self.client.get("/api/sales/TXN-TEST-1001", headers=self.admin_headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["customerPhone"], "9876543210")
        self.assertEqual(data["notes"], "Confidential Cashier Note for Alice")

    def test_loyalty_tracker_masks_phone_and_omits_internal_notes(self):
        """IDOR Prevention: Checking loyalty stamps by phone masks PII and omits internal cashier & admin notes."""
        res = self.client.get("/api/customers/9876543210")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["customer"]["phone"], "98765 •••• 10")
        for s in data["salesHistory"]:
            self.assertEqual(s["customerPhone"], "98765 •••• 10")
            self.assertEqual(s["notes"], "")
        for r in data["redemptions"]:
            self.assertEqual(r["customerPhone"], "98765 •••• 10")
            self.assertEqual(r["adminUser"], "staff")
            self.assertEqual(r["notes"], "Redeemed over counter")

    def test_reviews_endpoint_does_not_leak_customer_phone_numbers(self):
        """Verify public review feed strips reviewer phone numbers."""
        res = self.client.get("/api/reviews")
        self.assertEqual(res.status_code, 200)
        reviews = res.json()
        self.assertGreaterEqual(len(reviews), 1)
        for rev in reviews:
            self.assertNotIn("phone", rev)

    def test_settings_endpoint_does_not_leak_admin_credentials(self):
        """Verify public store settings do not expose adminUsername, password hashes, or pin hashes."""
        res = self.client.get("/api/settings")
        self.assertEqual(res.status_code, 200)
        sett = res.json()
        self.assertNotIn("adminUsername", sett)
        self.assertNotIn("admin_username", sett)
        self.assertNotIn("adminPasswordHash", sett)
        self.assertNotIn("admin_password_hash", sett)
        self.assertNotIn("adminPinHash", sett)

    # ---------------- 03. AUTHENTICATION & ADMIN PERMISSIONS ----------------

    def test_admin_can_access_protected_resources(self):
        """Verify valid admin token allows access to sales, customers, and metrics."""
        res_sales = self.client.get("/api/sales", headers=self.admin_headers)
        self.assertEqual(res_sales.status_code, 200)
        self.assertEqual(len(res_sales.json()), 1)

        res_cust = self.client.get("/api/customers", headers=self.admin_headers)
        self.assertEqual(res_cust.status_code, 200)
        self.assertGreaterEqual(len(res_cust.json()), 2)

        res_metrics = self.client.get("/api/sales/metrics", headers=self.admin_headers)
        self.assertEqual(res_metrics.status_code, 200)
        self.assertEqual(res_metrics.json()["totalRevenue"], 200.0)

    def test_login_endpoint_validation_and_jwt_generation(self):
        """Verify login endpoint returns valid JWT on correct credentials and rejects incorrect credentials."""
        # Bad credentials
        bad_res = self.client.post("/api/auth/login", json={
            "username": "admin@tirabelle.test",
            "secret": "WrongPassword!"
        })
        self.assertEqual(bad_res.status_code, 401)

        # Correct credentials
        good_res = self.client.post("/api/auth/login", json={
            "username": "admin@tirabelle.test",
            "secret": "SecretAdminPass2026!"
        })
        self.assertEqual(good_res.status_code, 200)
        token_data = good_res.json()
        self.assertIn("access_token", token_data)
        self.assertEqual(token_data["username"], "admin@tirabelle.test")

    # ---------------- 04. RATE LIMITING & ABUSE PROTECTION ----------------

    def test_rate_limiter_blocks_abuse(self):
        """Verify sliding window rate limiter raises 429 Too Many Requests when threshold exceeded."""
        limiter = SlidingWindowRateLimiter(limit=3, window_seconds=60, name="test_limiter")
        class MockRequest:
            client = type("Client", (), {"host": "192.168.1.50"})()
            headers = {}

        req = MockRequest()
        self.assertTrue(limiter(req))
        self.assertTrue(limiter(req))
        self.assertTrue(limiter(req))

        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as ctx:
            limiter(req)
        self.assertEqual(ctx.exception.status_code, 429)
        self.assertIn("Rate limit exceeded", ctx.exception.detail)
        self.assertIn("Retry-After", ctx.exception.headers)

if __name__ == "__main__":
    unittest.main()
