import unittest
import hashlib
import math
import os
import json

class TestTiraBelleBusinessLogic(unittest.TestCase):

    def test_credential_hashing(self):
        salt = 'TIRABELLE_SALT_2026'
        h = lambda s: hashlib.sha256((s + salt).encode('utf-8')).hexdigest()
        
        # Test known vector
        self.assertEqual(h('tirabelle123'), 'f2af6949747f4753b33ecc567ba642802ae0e95556ba8f865598d2c7e04cb630')
        self.assertEqual(h('1234'), '155f412e269b4f6d0d8a32c70e51824a482f2fce558d1b5b2175368ab2611af0')
        self.assertNotEqual(h('wrongpass'), h('tirabelle123'))

    def test_xss_escaping(self):
        def escape_html(s):
            if s is None:
                return ''
            return (str(s)
                    .replace('&', '&amp;')
                    .replace('<', '&lt;')
                    .replace('>', '&gt;')
                    .replace('"', '&quot;')
                    .replace("'", '&#39;'))

        self.assertEqual(escape_html('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;')
        self.assertEqual(escape_html('" onerror="exploit()'), '&quot; onerror=&quot;exploit()')
        self.assertEqual(escape_html("Tom & Jerry's"), 'Tom &amp; Jerry&#39;s')

    def calculate_loyalty(self, total_cups, claimed_rewards=0, threshold=5, completed_purchases=1):
        total_earned = total_cups // threshold
        available = max(0, total_earned - claimed_rewards)
        is_eligible = available > 0
        cups_since_claimed = max(0, total_cups - (claimed_rewards * threshold))
        progress = threshold if is_eligible else (cups_since_claimed % threshold)
        remaining = 0 if is_eligible else (threshold - progress)
        return {
            'threshold': threshold,
            'total_cups': total_cups,
            'completed_purchases': completed_purchases,
            'total_earned': total_earned,
            'claimed': claimed_rewards,
            'available': available,
            'is_eligible': is_eligible,
            'progress': progress,
            'remaining': remaining
        }

    def test_loyalty_cycle_0_cups(self):
        res = self.calculate_loyalty(0, 0, 5)
        self.assertFalse(res['is_eligible'])
        self.assertEqual(res['progress'], 0)
        self.assertEqual(res['remaining'], 5)

    def test_loyalty_cycle_3_cups_displays_3_of_5(self):
        # User requirement: Customer purchased 3 cups across 2 orders -> Loyalty Progress must display 3/5, NOT 2/5
        res = self.calculate_loyalty(total_cups=3, claimed_rewards=0, threshold=5, completed_purchases=2)
        self.assertEqual(res['total_cups'], 3)
        self.assertEqual(res['completed_purchases'], 2)
        self.assertFalse(res['is_eligible'])
        self.assertEqual(res['progress'], 3)
        self.assertEqual(res['remaining'], 2)

    def test_loyalty_cycle_5_cups_eligible(self):
        # 5 cups purchased, 0 claimed -> Eligible for free reward
        res = self.calculate_loyalty(total_cups=5, claimed_rewards=0, threshold=5, completed_purchases=3)
        self.assertTrue(res['is_eligible'])
        self.assertEqual(res['available'], 1)
        self.assertEqual(res['claimed'], 0)
        self.assertEqual(res['remaining'], 0)
        self.assertEqual(res['progress'], 5)

    def test_loyalty_cycle_5_cups_claimed(self):
        # 5 cups purchased, 1 claimed -> Progress resets to 0/5
        res = self.calculate_loyalty(total_cups=5, claimed_rewards=1, threshold=5, completed_purchases=3)
        self.assertFalse(res['is_eligible'])
        self.assertEqual(res['available'], 0)
        self.assertEqual(res['claimed'], 1)
        self.assertEqual(res['progress'], 0)
        self.assertEqual(res['remaining'], 5)

    def test_loyalty_cycle_7_cups_1_claimed(self):
        # 7 cups purchased, 1 claimed -> 7 - 5 = 2 cups in current cycle -> 2/5 progress
        res = self.calculate_loyalty(total_cups=7, claimed_rewards=1, threshold=5, completed_purchases=4)
        self.assertFalse(res['is_eligible'])
        self.assertEqual(res['claimed'], 1)
        self.assertEqual(res['progress'], 2)
        self.assertEqual(res['remaining'], 3)

    def generate_card_slots(self, threshold, progress, is_eligible):
        threshold = max(1, threshold or 5)
        paid_slots = [
            {'index': i, 'type': 'paid', 'stamped': i <= progress}
            for i in range(1, threshold + 1)
        ]
        reward_slot = {
            'index': threshold + 1,
            'type': 'reward',
            'unlocked': is_eligible
        }
        return {
            'threshold': threshold,
            'paid_slots_count': len(paid_slots),
            'has_separate_reward_slot': True,
            'total_slots_count': len(paid_slots) + 1,
            'paid_slots': paid_slots,
            'reward_slot': reward_slot
        }

    def test_dynamic_card_slots_threshold_5(self):
        # Admin sets threshold to 5: displays 5 paid-stamp slots and 1 separate reward slot (total 6)
        card = self.generate_card_slots(threshold=5, progress=3, is_eligible=False)
        self.assertEqual(card['paid_slots_count'], 5)
        self.assertEqual(card['total_slots_count'], 6)
        self.assertTrue(card['has_separate_reward_slot'])
        self.assertFalse(card['reward_slot']['unlocked'])
        stamped_count = sum(1 for s in card['paid_slots'] if s['stamped'])
        self.assertEqual(stamped_count, 3)

    def test_dynamic_card_slots_threshold_6(self):
        # Admin sets threshold to 6: displays 6 paid-stamp slots and 1 separate reward slot (total 7)
        card = self.generate_card_slots(threshold=6, progress=6, is_eligible=True)
        self.assertEqual(card['paid_slots_count'], 6)
        self.assertEqual(card['total_slots_count'], 7)
        self.assertTrue(card['reward_slot']['unlocked'])
        stamped_count = sum(1 for s in card['paid_slots'] if s['stamped'])
        self.assertEqual(stamped_count, 6)

    def test_dynamic_card_slots_threshold_4(self):
        # Admin sets threshold to 4: displays 4 paid-stamp slots and 1 separate reward slot (total 5)
        card = self.generate_card_slots(threshold=4, progress=0, is_eligible=False)
        self.assertEqual(card['paid_slots_count'], 4)
        self.assertEqual(card['total_slots_count'], 5)
        self.assertFalse(card['reward_slot']['unlocked'])
        stamped_count = sum(1 for s in card['paid_slots'] if s['stamped'])
        self.assertEqual(stamped_count, 0)

    def test_customer_zero_stamps(self):
        # Customer with zero stamps sees correct empty progress state
        loyalty = self.calculate_loyalty(total_cups=0, claimed_rewards=0, threshold=5)
        self.assertEqual(loyalty['progress'], 0)
        self.assertEqual(loyalty['remaining'], 5)
        self.assertFalse(loyalty['is_eligible'])
        card = self.generate_card_slots(loyalty['threshold'], loyalty['progress'], loyalty['is_eligible'])
        self.assertEqual(sum(1 for s in card['paid_slots'] if s['stamped']), 0)
        self.assertFalse(card['reward_slot']['unlocked'])

    def test_customer_fewer_than_required_stamps(self):
        # Customer with 3 cups at threshold 5 sees 3/5 progress and 2 remaining
        loyalty = self.calculate_loyalty(total_cups=3, claimed_rewards=0, threshold=5)
        self.assertEqual(loyalty['progress'], 3)
        self.assertEqual(loyalty['remaining'], 2)
        self.assertFalse(loyalty['is_eligible'])

    def test_customer_exact_threshold_eligible(self):
        # Customer reaching exact threshold 5 becomes eligible for 1 free reward
        loyalty = self.calculate_loyalty(total_cups=5, claimed_rewards=0, threshold=5)
        self.assertEqual(loyalty['progress'], 5)
        self.assertEqual(loyalty['remaining'], 0)
        self.assertTrue(loyalty['is_eligible'])
        self.assertEqual(loyalty['available'], 1)
        card = self.generate_card_slots(loyalty['threshold'], loyalty['progress'], loyalty['is_eligible'])
        self.assertEqual(sum(1 for s in card['paid_slots'] if s['stamped']), 5)
        self.assertTrue(card['reward_slot']['unlocked'])

    def test_cannot_claim_same_reward_twice(self):
        # Claiming the reward reduces available rewards and resets cycle
        loyalty = self.calculate_loyalty(total_cups=5, claimed_rewards=1, threshold=5)
        self.assertEqual(loyalty['available'], 0)
        self.assertFalse(loyalty['is_eligible'])
        self.assertEqual(loyalty['progress'], 0)
        self.assertEqual(loyalty['remaining'], 5)

    def test_subsequent_purchases_and_rollover(self):
        # Customer bought 8 cups, claimed 1 at threshold 5:
        # 8 - 5 = 3 active cups in new cycle -> 3/5 progress, 2 remaining, not eligible
        loyalty = self.calculate_loyalty(total_cups=8, claimed_rewards=1, threshold=5)
        self.assertEqual(loyalty['progress'], 3)
        self.assertEqual(loyalty['remaining'], 2)
        self.assertFalse(loyalty['is_eligible'])

        # Customer bought 10 cups, claimed 1 at threshold 5:
        # 10 - 5 = 5 active cups in new cycle -> 5/5 progress, eligible for 2nd reward!
        loyalty2 = self.calculate_loyalty(total_cups=10, claimed_rewards=1, threshold=5)
        self.assertEqual(loyalty2['available'], 1)
        self.assertTrue(loyalty2['is_eligible'])
        self.assertEqual(loyalty2['progress'], 5)
        self.assertEqual(loyalty2['remaining'], 0)

    def test_loyalty_threshold_change(self):
        # Changing threshold to 6: 5 cups is no longer eligible (needs 1 more)
        res6 = self.calculate_loyalty(total_cups=5, claimed_rewards=0, threshold=6, completed_purchases=2)
        self.assertFalse(res6['is_eligible'])
        self.assertEqual(res6['threshold'], 6)
        self.assertEqual(res6['progress'], 5)
        self.assertEqual(res6['remaining'], 1)

        # 7 cups with 1 claimed at threshold 6 -> 7 - 6 = 1 -> 1/6 progress
        res7 = self.calculate_loyalty(total_cups=7, claimed_rewards=1, threshold=6, completed_purchases=3)
        self.assertEqual(res7['progress'], 1)
        self.assertEqual(res7['remaining'], 5)

    def test_pos_financial_math(self):
        items = [
            {'price': 150, 'qty': 2}, # 300
            {'price': 220, 'qty': 2}  # 440
        ]
        subtotal = sum(i['price'] * i['qty'] for i in items)
        paid_cups = sum(i['qty'] for i in items)
        self.assertEqual(subtotal, 740)
        self.assertEqual(paid_cups, 4)

        # Cash vs Online tracking
        sales = [
            {'amount': 300, 'mode': 'Cash'},
            {'amount': 440, 'mode': 'Online'}
        ]
        cash = sum(s['amount'] for s in sales if s['mode'] == 'Cash')
        online = sum(s['amount'] for s in sales if s['mode'] == 'Online')
        total = sum(s['amount'] for s in sales)
        self.assertEqual(cash, 300)
        self.assertEqual(online, 440)
        self.assertEqual(total, 740)
        self.assertEqual(cash + online, total)

    def test_customer_filtering(self):
        # Sample customers and their transactions
        customers = [
            {'phone': '111', 'name': 'Jay'},
            {'phone': '222', 'name': 'Priya'},
            {'phone': '333', 'name': 'Rahul'},
            {'phone': '444', 'name': 'Aisha'}
        ]
        sales = [
            {'customerPhone': '111', 'paymentMode': 'Cash', 'items': [{'productName': 'Tiramisu 150g'}]},
            {'customerPhone': '111', 'paymentMode': 'Online', 'items': [{'productName': 'Tiramisu 350g'}]},
            {'customerPhone': '222', 'paymentMode': 'Online', 'items': [{'productName': 'Tiramisu 150g'}, {'productName': 'Tiramisu 350g'}]},
            {'customerPhone': '333', 'paymentMode': 'Cash', 'items': [{'productName': 'Tiramisu 150g'}]},
            {'customerPhone': '444', 'paymentMode': 'Cash', 'items': [{'productName': 'Tiramisu 150g'}]}
        ]
        redemptions = [
            {'customerPhone': '333', 'rewardItem': '1 Free 150g Tiramisu'}
        ]

        # Test Cash filter
        cash_phones = {s['customerPhone'] for s in sales if s['paymentMode'] == 'Cash'}
        self.assertEqual(cash_phones, {'111', '333', '444'})

        # Test Online filter
        online_phones = {s['customerPhone'] for s in sales if s['paymentMode'] == 'Online'}
        self.assertEqual(online_phones, {'111', '222'})

        # Test 150g filter
        p150_phones = {s['customerPhone'] for s in sales if any('150' in it['productName'] for it in s['items'])}
        self.assertEqual(p150_phones, {'111', '222', '333', '444'})

        # Test 350g filter
        p350_phones = {s['customerPhone'] for s in sales if any('350' in it['productName'] for it in s['items'])}
        self.assertEqual(p350_phones, {'111', '222'})

        # Test Offer Claimed filter
        claimed_phones = {r['customerPhone'] for r in redemptions}
        self.assertEqual(claimed_phones, {'333'})

    def test_business_settings_defaults(self):
        default_settings = {
            'businessName': 'TIRA Belle',
            'tagline': 'Little Layers • Big Love',
            'slogan': 'Layers of Love in Every Spoon',
            'owner': 'Yash Chauhan & Tejas Chauhan',
            'phone': '9373484198',
            'phoneSecondary': '8484870543',
            'whatsapp': '9373484198',
            'address': 'Physical Dessert Studio & Artisan Counter, Pune',
            'email': 'tirabelle.desserts@gmail.com',
            'instagram': 'tirabelle.desserts',
            'instagramUrl': 'https://instagram.com/tirabelle.desserts?obrf=MzhsZG04Ymc3NXBj',
            'upiId': '9373484198@upi',
            'currency': '₹',
            'loyaltyThreshold': 5,
            'rewardItemName': '1 Free 150g Tiramisu Cup',
            'logo': 'assets/tira-belle-logo.png'
        }
        self.assertIn('logo', default_settings)
        self.assertIn('owner', default_settings)
        self.assertIn('phoneSecondary', default_settings)
        self.assertIn('email', default_settings)
        self.assertIn('instagram', default_settings)
        self.assertIn('instagramUrl', default_settings)
        self.assertTrue(default_settings['logo'].endswith('.png'))

    def test_business_settings_update_and_merge(self):
        initial = {
            'businessName': 'TIRA Belle',
            'logo': 'assets/tira-belle-logo.png',
            'phone': '9373484198'
        }
        updates = {
            'businessName': 'TIRA Belle Artisanal',
            'logo': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            'phoneSecondary': '8484870543'
        }
        merged = {**initial, **updates}
        self.assertEqual(merged['businessName'], 'TIRA Belle Artisanal')
        self.assertTrue(merged['logo'].startswith('data:image/png;base64,'))
        self.assertEqual(merged['phone'], '9373484198')
        self.assertEqual(merged['phoneSecondary'], '8484870543')

    def test_essential_files_and_assets_integrity(self):
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        essential_files = [
            'index.html',
            'admin.html',
            'tracker.html',
            'css/style.css',
            'manifest.json',
            'robots.txt',
            'sitemap.xml',
            'sw.js',
            'assets/tira-belle-logo.png',
            'assets/poster/tiramisu-classic-poster.png',
            'assets/tiramisu-150g.jpg',
            'assets/tiramisu-350g.jpg',
            'assets/cup-empty.png',
            'assets/cup-filled.png',
            'assets/icon-192.png',
            'assets/icon-512.png',
            'js/db.js',
            'js/app.js',
            'js/admin.js',
            'js/tracker.js',
            'js/alerts.js',
            'js/icons.js',
            'js/pwa.js',
            'js/qrcode.min.js'
        ]
        for f in essential_files:
            full_path = os.path.join(root_dir, f)
            self.assertTrue(os.path.exists(full_path), f"Essential file missing: {f}")
            self.assertGreater(os.path.getsize(full_path), 0, f"Essential file is empty: {f}")

        # Verify manifest.json is valid JSON
        with open(os.path.join(root_dir, 'manifest.json'), 'r', encoding='utf-8') as mf:
            m_data = json.load(mf)
            self.assertEqual(m_data['short_name'], 'TIRA Belle')

class TestFastAPIBackendSuite(unittest.TestCase):

    def setUp(self):
        # Create an in-memory SQLite database for isolated unit testing
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from backend.models import Base, Customer, Product, Sale, SaleItem, Redemption, Review, StoreSetting
        from backend.seed import seed_initial_data

        self.engine = create_engine("sqlite:///:memory:", echo=False)
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        seed_initial_data(self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_backend_file_structure(self):
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        backend_files = [
            'backend/__init__.py',
            'backend/config.py',
            'backend/database.py',
            'backend/models.py',
            'backend/schemas.py',
            'backend/security.py',
            'backend/seed.py',
            'backend/main.py',
            'backend/requirements.txt',
            'backend/routers/__init__.py',
            'backend/routers/auth.py',
            'backend/routers/customers.py',
            'backend/routers/products.py',
            'backend/routers/sales.py',
            'backend/routers/redemptions.py',
            'backend/routers/reviews.py',
            'backend/routers/settings.py',
            'run_server.py',
            '.env.example'
        ]
        for f in backend_files:
            p = os.path.join(root_dir, f)
            self.assertTrue(os.path.exists(p), f"Backend file missing: {f}")
            self.assertGreater(os.path.getsize(p), 0, f"Backend file empty: {f}")

    def test_security_jwt_token(self):
        from backend.security import create_access_token, verify_access_token, hash_credential, verify_hash
        token = create_access_token({"sub": "admin", "role": "admin"})
        self.assertTrue(isinstance(token, str))
        self.assertIn(".", token)

        payload = verify_access_token(token)
        self.assertIsNotNone(payload)
        self.assertEqual(payload.get("sub"), "admin")
        self.assertEqual(payload.get("role"), "admin")

        # Expired or tampered token check
        tampered = token[:-4] + "abcd"
        self.assertIsNone(verify_access_token(tampered))

        # Credential hashing check
        h = hash_credential("tirabelle123")
        self.assertEqual(h, 'f2af6949747f4753b33ecc567ba642802ae0e95556ba8f865598d2c7e04cb630')
        self.assertTrue(verify_hash("tirabelle123", h))
        self.assertFalse(verify_hash("wrongpass", h))

    def test_database_seeded_products_and_settings(self):
        from backend.models import Product, StoreSetting, Review
        products = self.db.query(Product).all()
        self.assertEqual(len(products), 4)
        prod_names = [p.name for p in products]
        self.assertTrue(any("150" in name for name in prod_names))

        settings = self.db.query(StoreSetting).filter(StoreSetting.id == 1).first()
        self.assertIsNotNone(settings)
        self.assertEqual(settings.business_name, "TIRA Belle")
        self.assertEqual(settings.loyalty_threshold, 5)

        reviews = self.db.query(Review).all()
        self.assertEqual(len(reviews), 0)

    def test_sales_and_loyalty_flow(self):
        from backend.routers.customers import calculate_customer_loyalty, upsert_customer
        from backend.schemas import CustomerCreate, SaleCreate, SaleItemSchema, RedemptionCreate
        from backend.routers.sales import create_sale
        from backend.routers.redemptions import redeem_reward

        phone = "9999900001"
        upsert_customer(CustomerCreate(phone=phone, name="New Customer Test"), db=self.db)

        # 1. Customer initial loyalty
        loyalty = calculate_customer_loyalty(phone, self.db)
        self.assertEqual(loyalty["totalCupsPurchased"], 0)
        self.assertFalse(loyalty["isEligible"])
        self.assertEqual(loyalty["cupsRemaining"], 5)

        # 2. Add Sale of 3 cups
        sale1 = create_sale(SaleCreate(
            customerPhone=phone,
            customerName="New Customer Test",
            items=[SaleItemSchema(productId="prod-150", productName="Tiramisu 150g", price=150.0, quantity=3, isReward=False)],
            paymentMode="Online"
        ), db=self.db)
        self.assertTrue(sale1["success"])

        loyalty1 = calculate_customer_loyalty(phone, self.db)
        self.assertEqual(loyalty1["totalCupsPurchased"], 3)
        self.assertEqual(loyalty1["currentCycleProgress"], 3)
        self.assertEqual(loyalty1["cupsRemaining"], 2)
        self.assertFalse(loyalty1["isEligible"])

        # 3. Add Sale of 2 more cups -> Total 5 cups -> Customer now eligible!
        sale2 = create_sale(SaleCreate(
            customerPhone=phone,
            customerName="New Customer Test",
            items=[SaleItemSchema(productId="prod-150", productName="Tiramisu 150g", price=150.0, quantity=2, isReward=False)],
            paymentMode="Cash"
        ), db=self.db)
        self.assertTrue(sale2["success"])

        loyalty2 = calculate_customer_loyalty(phone, self.db)
        self.assertEqual(loyalty2["totalCupsPurchased"], 5)
        self.assertTrue(loyalty2["isEligible"])
        self.assertEqual(loyalty2["availableRewards"], 1)
        self.assertEqual(loyalty2["cupsRemaining"], 0)

        # 4. Redeem Reward
        redemption_res = redeem_reward(RedemptionCreate(customerPhone=phone, adminUser="admin"), db=self.db)
        self.assertTrue(redemption_res["success"])

        # 5. After redemption: Cycle resets to 0/5, 0 available rewards
        loyalty3 = calculate_customer_loyalty(phone, self.db)
        self.assertEqual(loyalty3["totalCupsPurchased"], 5)
        self.assertEqual(loyalty3["claimedCount"], 1)
        self.assertEqual(loyalty3["availableRewards"], 0)
        self.assertFalse(loyalty3["isEligible"])
        self.assertEqual(loyalty3["currentCycleProgress"], 0)
        self.assertEqual(loyalty3["cupsRemaining"], 5)

    def test_customer_multi_cycle_loyalty_calculation(self):
        from backend.routers.customers import calculate_customer_loyalty
        from backend.models import Customer, Sale, SaleItem, Redemption

        # Test fixture 1: Customer with 8 cups purchased, 0 claimed -> Eligible!
        c1 = Customer(phone="9876543210", name="Jay")
        self.db.add(c1)
        s1 = Sale(id="T-1", customer_phone="9876543210", customer_name="Jay", total_amount=1200, paid_cups_count=8, payment_mode="Cash")
        self.db.add(s1)

        # Test fixture 2: Customer with 3 cups purchased -> 2 remaining (3/5)
        c2 = Customer(phone="9822012345", name="Priya Sharma")
        self.db.add(c2)
        s2 = Sale(id="T-2", customer_phone="9822012345", customer_name="Priya Sharma", total_amount=450, paid_cups_count=3, payment_mode="Online")
        self.db.add(s2)

        # Test fixture 3: Customer with 12 cups, 1 claimed redemption -> Eligible for 2nd reward!
        c3 = Customer(phone="9845098765", name="Rahul Verma")
        self.db.add(c3)
        s3 = Sale(id="T-3", customer_phone="9845098765", customer_name="Rahul Verma", total_amount=1800, paid_cups_count=12, payment_mode="Cash")
        self.db.add(s3)
        r3 = Redemption(id="R-1", customer_phone="9845098765", customer_name="Rahul Verma", reward_item="1 Free 150g Tiramisu Cup", admin_user="admin")
        self.db.add(r3)

        self.db.commit()

        jay = calculate_customer_loyalty("9876543210", self.db)
        self.assertEqual(jay["customer"]["name"], "Jay")
        self.assertEqual(jay["totalCupsPurchased"], 8)
        self.assertTrue(jay["isEligible"])
        self.assertGreaterEqual(jay["availableRewards"], 1)

        priya = calculate_customer_loyalty("9822012345", self.db)
        self.assertEqual(priya["customer"]["name"], "Priya Sharma")
        self.assertEqual(priya["totalCupsPurchased"], 3)
        self.assertFalse(priya["isEligible"])
        self.assertEqual(priya["cupsRemaining"], 2)

        rahul = calculate_customer_loyalty("9845098765", self.db)
        self.assertEqual(rahul["customer"]["name"], "Rahul Verma")
        self.assertEqual(rahul["totalCupsPurchased"], 12)
        self.assertEqual(rahul["claimedCount"], 1)
        self.assertTrue(rahul["isEligible"])

    def test_essential_data_retention_only(self):
        from backend.models import Customer, Sale, Redemption, Product, StoreSetting
        from backend.seed import seed_initial_data

        # Ensure seed only retains essential baseline:
        seed_initial_data(self.db)
        self.assertEqual(self.db.query(Product).count(), 4)
        settings = self.db.query(StoreSetting).filter(StoreSetting.id == 1).first()
        self.assertIsNotNone(settings)
        self.assertEqual(settings.business_name, "TIRA Belle")
        self.assertTrue(len(settings.admin_password_hash) > 20)

    def test_category_crud_and_product_relationships(self):
        from backend.models import Category, Product
        from backend.routers.categories import _format_category_response, slugify

        self.assertEqual(slugify("Classic Tiramisu & Coffee!"), "classic-tiramisu-coffee")

        # 1. Create a category
        cat = Category(
            id="cat-test-specials",
            name="Seasonal Specials",
            slug="seasonal-specials",
            description="Limited holiday handcrafted batches",
            display_order=3,
            is_active=True
        )
        self.db.add(cat)
        self.db.commit()

        # 2. Add product under this category
        prod = Product(
            id="prod-special-1",
            category_id="cat-test-specials",
            name="Pistachio Tiramisu",
            price=280.0,
            weight="200 g",
            image="assets/uploads/pistachio.png",
            is_active=True
        )
        self.db.add(prod)
        self.db.commit()

        # 3. Test formatted response includes productCount and associated images
        resp = _format_category_response(cat, self.db)
        self.assertEqual(resp.name, "Seasonal Specials")
        self.assertEqual(resp.product_count, 1)
        self.assertIn("assets/uploads/pistachio.png", resp.images)

        # 4. Unlink on category delete
        self.db.delete(cat)
        self.db.commit()
        refreshed_prod = self.db.query(Product).filter(Product.id == "prod-special-1").first()
        self.assertIsNotNone(refreshed_prod)

    def test_image_upload_security_and_validation(self):
        from backend.routers.upload import is_valid_image_bytes, sanitize_filename

        # Test Magic bytes detection
        png_magic = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
        jpg_magic = b"\xff\xd8\xff\xe0\x00\x10JFIF"
        gif_magic = b"GIF89a\x01\x00\x01\x00"
        webp_magic = b"RIFF\x1a\x00\x00\x00WEBPVP8 "
        malicious = b"<?php echo 'hacked'; ?>\r\n"

        self.assertTrue(is_valid_image_bytes(png_magic))
        self.assertTrue(is_valid_image_bytes(jpg_magic))
        self.assertTrue(is_valid_image_bytes(gif_magic))
        self.assertTrue(is_valid_image_bytes(webp_magic))
        self.assertFalse(is_valid_image_bytes(malicious))
        self.assertFalse(is_valid_image_bytes(b"bad"))

        # Test Path traversal prevention in filename sanitization
        self.assertNotIn("/", sanitize_filename("../../etc/passwd.png"))
        self.assertNotIn("\\", sanitize_filename("..\\..\\windows\\system32\\cmd.jpg"))
        self.assertEqual(sanitize_filename("my tiramisu photo #1.png"), "my_tiramisu_photo__1.png")

    def test_realtime_version_tracking(self):
        from backend.routers.realtime import get_current_version, notify_change, get_last_updated
        v1 = get_current_version()
        notify_change("sales", "created", {"test": True})
        v2 = get_current_version()
        self.assertGreater(v2, v1)
        self.assertIsNotNone(get_last_updated())


    def test_phone_number_normalization_indian_formats(self):
        from backend.routers.customers import clean_phone_number
        self.assertEqual(clean_phone_number('+91 98765 43210'), '9876543210')
        self.assertEqual(clean_phone_number('+919876543210'), '9876543210')
        self.assertEqual(clean_phone_number('09876543210'), '9876543210')
        self.assertEqual(clean_phone_number('9876543210'), '9876543210')

    def test_sales_phone_validation_and_atomicity(self):
        from backend.schemas import SaleCreate, SaleItemSchema
        from backend.routers.sales import create_sale
        from fastapi import HTTPException

        # Phone with fewer than 7 digits should be rejected
        with self.assertRaises(HTTPException) as ctx:
            create_sale(SaleCreate(
                customerPhone='123',
                customerName='Invalid Phone',
                items=[SaleItemSchema(productId='prod-150', productName='Tiramisu 150g', price=150.0, quantity=1)]
            ), db=self.db)
        self.assertEqual(ctx.exception.status_code, 400)

    def test_pydantic_schema_boundary_validation(self):
        from backend.schemas import ProductCreate, ReviewCreate, SaleItemSchema
        from pydantic import ValidationError

        # Negative price should fail
        with self.assertRaises(ValidationError):
            ProductCreate(name='Negative Price Cup', price=-50.0)

        # Rating out of range (1-5) should fail
        with self.assertRaises(ValidationError):
            ReviewCreate(name='Tester', rating=6, comment='Great')
        with self.assertRaises(ValidationError):
            ReviewCreate(name='Tester', rating=0, comment='Bad')

        # SaleItem quantity < 1 should fail
        with self.assertRaises(ValidationError):
            SaleItemSchema(productId='prod-1', productName='Cup', price=100.0, quantity=0)

    def test_pin_authentication_and_update(self):
        from backend.schemas import LoginRequest, UpdateCredentialsRequest
        from backend.routers.auth import login, update_credentials
        from backend.security import hash_credential
        from backend.models import StoreSetting

        # Update PIN to 1234
        update_credentials(UpdateCredentialsRequest(pin='1234'), admin_payload={'sub': 'admin'}, db=self.db)
        settings = self.db.query(StoreSetting).filter(StoreSetting.id == 1).first()
        self.assertEqual(settings.admin_pin_hash, hash_credential('1234'))

        # Login with PIN
        res = login(LoginRequest(username=settings.admin_username, secret='1234'), db=self.db)
        self.assertIsNotNone(res.access_token)

    def test_timezone_ist_calculation(self):
        from backend.models import ist_now, today_date_str
        now_ist = ist_now()
        self.assertEqual(today_date_str(), now_ist.strftime('%Y-%m-%d'))

    def test_sale_with_flat_and_percentage_discounts(self):
        from backend.schemas import SaleCreate, SaleItemSchema
        from backend.routers.sales import create_sale, get_sales, get_sale_by_id

        phone = "9876543210"

        # 1. Flat discount (e.g. 50 off on 300 subtotal)
        sale_flat = create_sale(SaleCreate(
            customerPhone=phone,
            customerName="Discount Guest",
            items=[SaleItemSchema(productId="prod-150", productName="Tiramisu 150g", price=150.0, quantity=2)],
            paymentMode="UPI",
            discount=50.0,
            discountType="flat",
            discountValue=50.0
        ), db=self.db)
        self.assertTrue(sale_flat["success"])

        record1 = get_sale_by_id(sale_flat["saleId"], db=self.db)
        self.assertEqual(record1["subtotal"], 200.0)
        self.assertEqual(record1["discount"], 50.0)
        self.assertEqual(record1["totalAmount"], 150.0)
        self.assertEqual(record1["paymentMode"], "UPI")
        self.assertEqual(record1["discountType"], "flat")
        self.assertEqual(record1["discountValue"], 50.0)

        # 2. Percentage discount (e.g. 10% off on 200 subtotal)
        sale_pct = create_sale(SaleCreate(
            customerPhone=phone,
            customerName="Discount Guest",
            items=[SaleItemSchema(productId="prod-150", productName="Tiramisu 150g", price=150.0, quantity=2)],
            paymentMode="Card",
            discountType="percent",
            discountValue=10.0
        ), db=self.db)
        self.assertTrue(sale_pct["success"])

        record2 = get_sale_by_id(sale_pct["saleId"], db=self.db)
        self.assertEqual(record2["subtotal"], 200.0)
        self.assertEqual(record2["discount"], 20.0)
        self.assertEqual(record2["totalAmount"], 180.0)
        self.assertEqual(record2["paymentMode"], "Card")
        self.assertEqual(record2["discountType"], "percent")
        self.assertEqual(record2["discountValue"], 10.0)

        # 3. Discount capped at subtotal
        sale_capped = create_sale(SaleCreate(
            customerPhone=phone,
            customerName="Discount Guest",
            items=[SaleItemSchema(productId="prod-150", productName="Tiramisu 150g", price=150.0, quantity=2)],
            paymentMode="Cash",
            discount=500.0,
            discountType="flat",
            discountValue=500.0
        ), db=self.db)
        self.assertTrue(sale_capped["success"])

        record3 = get_sale_by_id(sale_capped["saleId"], db=self.db)
        self.assertEqual(record3["subtotal"], 200.0)
        self.assertEqual(record3["discount"], 200.0)
        self.assertEqual(record3["totalAmount"], 0.0)

    def test_excluded_product_in_total_cups_not_in_loyalty_points(self):
        from backend.models import Product
        from backend.schemas import CustomerCreate, SaleCreate, SaleItemSchema
        from backend.routers.customers import calculate_customer_loyalty, upsert_customer
        from backend.routers.sales import create_sale, get_sale_by_id

        # Ensure prod-150 is eligible and prod-350 is excluded
        p150 = self.db.query(Product).filter(Product.id == "prod-150").first()
        if p150:
            p150.counts_towards_loyalty = True
        p350 = self.db.query(Product).filter(Product.id == "prod-350").first()
        if p350:
            p350.counts_towards_loyalty = False
        self.db.commit()

        phone = "9876549999"
        upsert_customer(CustomerCreate(phone=phone, name="Excluded Test Customer"), db=self.db)

        # Buy 1x prod-150 (eligible) + 2x prod-350 (excluded)
        res = create_sale(SaleCreate(
            customerPhone=phone,
            customerName="Excluded Test Customer",
            items=[
                SaleItemSchema(productId="prod-150", productName="Tiramisu 150g", price=100.0, quantity=1),
                SaleItemSchema(productId="prod-350", productName="Tiramisu 350g", price=200.0, quantity=2)
            ],
            paymentMode="Cash"
        ), db=self.db)
        self.assertTrue(res["success"])

        # Check Sale record
        sale = get_sale_by_id(res["saleId"], db=self.db)
        self.assertEqual(sale["paidCupsCount"], 3)      # Total cup count includes excluded cups!
        self.assertEqual(sale["eligibleCupsCount"], 1)  # Only 1 cup eligible for loyalty points

        # Check Customer Loyalty calculation
        loyalty = calculate_customer_loyalty(phone, self.db)
        self.assertEqual(loyalty["totalCupsPurchased"], 3)  # Quantity included in total cup count
        self.assertEqual(loyalty["totalEligibleCups"], 1)   # Only eligible product counts toward points
        self.assertEqual(loyalty["currentCycleProgress"], 1) # 1 stamp out of 5
        self.assertEqual(loyalty["cupsRemaining"], 4)        # 4 more cups to reach reward
        self.assertFalse(loyalty["isEligible"])

class TestDatabaseArchitectureAndIntegrity(unittest.TestCase):

    def setUp(self):
        from sqlalchemy import create_engine, event, text
        from sqlalchemy.orm import sessionmaker
        from backend.models import Base
        from backend.database import apply_database_migrations_and_indexes
        from backend.seed import seed_initial_data

        self.engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})

        @event.listens_for(self.engine, 'connect')
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute('PRAGMA foreign_keys=ON')
            cursor.close()

        Base.metadata.create_all(bind=self.engine)
        with self.engine.connect() as conn:
            apply_database_migrations_and_indexes(conn)

        self.Session = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.db = self.Session()
        seed_initial_data(self.db)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_database_indexes_applied(self):
        from sqlalchemy import text
        with self.engine.connect() as conn:
            sales_indexes = [r[1] for r in conn.execute(text("PRAGMA index_list('sales')")).fetchall()]
            self.assertIn('ix_sales_customer_phone', sales_indexes)
            self.assertIn('ix_sales_date_timestamp', sales_indexes)

            items_indexes = [r[1] for r in conn.execute(text("PRAGMA index_list('sale_items')")).fetchall()]
            self.assertIn('ix_sale_items_sale_id', items_indexes)
            self.assertIn('ix_sale_items_product_id', items_indexes)

            rdm_indexes = [r[1] for r in conn.execute(text("PRAGMA index_list('redemptions')")).fetchall()]
            self.assertIn('ix_redemptions_customer_phone', rdm_indexes)
            self.assertIn('ix_redemptions_date', rdm_indexes)

    def test_foreign_key_enforcement(self):
        from backend.models import Sale
        from sqlalchemy.exc import IntegrityError
        # Attempting to insert a sale for a non-existent customer must fail
        with self.assertRaises(IntegrityError):
            bad_sale = Sale(id='TXN-ORPHAN-1', customer_phone='0000000000', total_amount=100.0)
            self.db.add(bad_sale)
            self.db.commit()
        self.db.rollback()

    def test_cascade_delete_integrity(self):
        from backend.models import Customer, Sale
        cust = Customer(phone='9111222333', name='Cascade Tester')
        self.db.add(cust)
        self.db.commit()

        sale = Sale(id='TXN-CASC-1', customer_phone=cust.phone, total_amount=150.0)
        self.db.add(sale)
        self.db.commit()

        self.assertEqual(self.db.query(Sale).filter(Sale.customer_phone == cust.phone).count(), 1)
        self.db.delete(cust)
        self.db.commit()

        self.assertEqual(self.db.query(Sale).filter(Sale.customer_phone == cust.phone).count(), 0)

    def test_loyalty_double_redemption_protection(self):
        from backend.schemas import SaleCreate, SaleItemSchema, RedemptionCreate
        from backend.routers.sales import create_sale
        from backend.routers.redemptions import redeem_reward
        from fastapi import HTTPException

        phone = '9888777666'
        create_sale(SaleCreate(
            customerPhone=phone,
            customerName='Loyal Guest',
            items=[SaleItemSchema(productId='prod-150', productName='Classic 150g', price=100.0, quantity=5)]
        ), db=self.db)

        # First redemption succeeds
        res1 = redeem_reward(RedemptionCreate(customerPhone=phone, adminUser='admin'), db=self.db)
        self.assertTrue(res1['success'])

        # Immediate second redemption attempt must be rejected (0 available rewards)
        with self.assertRaises(HTTPException) as ctx:
            redeem_reward(RedemptionCreate(customerPhone=phone, adminUser='admin'), db=self.db)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn('not eligible', ctx.exception.detail.lower())

    def test_database_pragmas_and_integrity_check(self):
        from sqlalchemy import text
        with self.engine.connect() as conn:
            fk_check = conn.execute(text("PRAGMA foreign_keys")).scalar()
            self.assertEqual(fk_check, 1)

            integrity = conn.execute(text("PRAGMA integrity_check")).fetchall()
            self.assertEqual(integrity, [('ok',)])


class TestSecurityAuditSuite(unittest.TestCase):

    def test_require_admin_guard_blocks_unauthenticated(self):
        from backend.security import require_admin
        from fastapi import HTTPException
        # Missing credentials -> 401
        with self.assertRaises(HTTPException) as ctx:
            require_admin(None)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_require_admin_guard_blocks_invalid_token(self):
        from backend.security import require_admin
        from fastapi.security import HTTPAuthorizationCredentials
        from fastapi import HTTPException
        # Fake / tampered token -> 401
        fake_creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad.signature")
        with self.assertRaises(HTTPException) as ctx:
            require_admin(fake_creds)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_require_admin_guard_accepts_valid_token(self):
        from backend.security import require_admin, create_access_token
        from fastapi.security import HTTPAuthorizationCredentials
        token = create_access_token({"sub": "admin", "role": "admin"})
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        payload = require_admin(creds)
        self.assertEqual(payload["sub"], "admin")
        self.assertEqual(payload["role"], "admin")

    def test_login_brute_force_rate_limiting(self):
        from backend.security import check_login_rate_limit, record_login_failure, reset_login_failures
        from fastapi import HTTPException
        test_ip = "192.168.1.100"
        reset_login_failures(test_ip)

        # 4 failed attempts should still be allowed
        for _ in range(4):
            record_login_failure(test_ip)
            check_login_rate_limit(test_ip)

        # 5th failed attempt triggers 429 Too Many Requests
        record_login_failure(test_ip)
        with self.assertRaises(HTTPException) as ctx:
            check_login_rate_limit(test_ip)
        self.assertEqual(ctx.exception.status_code, 429)
        self.assertIn("Retry-After", ctx.exception.headers)

        # Resetting failures clears lockout
        reset_login_failures(test_ip)
        check_login_rate_limit(test_ip)

    def test_health_check_information_leakage_prevented(self):
        from backend.main import health_check
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        engine = create_engine("sqlite:///:memory:")
        Session = sessionmaker(bind=engine)
        db = Session()
        res = health_check(db=db)
        db.close()
        engine.dispose()
        self.assertEqual(res["status"], "ok")
        self.assertNotIn("db_host", res)
        self.assertNotIn("db_user", res)




if __name__ == '__main__':
    unittest.main()
