# TIRA Belle • Artisan Tiramisu & Counter POS

> **Little Layers • Big Love**  
> Complete Physical Dessert Studio Counter POS, Dynamic Customer Loyalty Engine, and Public Storefront.

---

## 📌 Overview

**TIRA Belle** is a production-grade, zero-dependency commercial web application designed specifically for artisan dessert businesses, tiramisu counters, and boutique bakeries. It provides an end-to-end operational suite that functions seamlessly both online and on in-store offline hardware.

### Key Features

1. **Artisan Public Storefront (`index.html`)**
   - High-conversion responsive design featuring handcrafted 150g single-serve cups and 350g sharing tubs.
   - Interactive tasting notes, brand storytelling, and direct WhatsApp / counter ordering.
   - Live Customer Loyalty Checker with real-time visual stamp card.
   - Enterprise Technical SEO: Schema.org `Bakery` & `Product` structured data, Open Graph, and Twitter Cards.

2. **Counter Sales & POS Management (`tira-desk.html`)**
   - Instant POS order entry for rapid physical counter service.
   - Supports Cash and UPI/Online payment reconciliation.
   - Dynamic real-time revenue analytics (Today, Yesterday, All Time).
   - Printable 80mm thermal receipt generator.
   - Collapsible desktop sidebar with persistent layout memory and full mobile navigation drawer.

3. **Dynamic Customer Loyalty Engine (`js/db.js`)**
   - Configurable purchase threshold (default: Buy 5 Cups, Get 1 Free 150g Cup).
   - Multi-cycle loyalty progress tracking with automatic reward eligibility detection.
   - In-store reward redemption verification and audit logging.
   - One-click customer directory CSV export.

4. **In-Store QR Standee Generator**
   - Auto-generates counter QR codes routing customers directly to `tracker.html` for checking their stamp balance on their own smartphones.

5. **Security Hardening**
   - Cryptographic credential storage via SHA-256 with cryptographic salt (no plaintext passwords).
   - Failed login attempt rate-limiting and automatic lockout protection.
   - 30-minute inactivity session expiration.
   - Strict XSS escaping (`escapeHtml`) on all dynamic customer and order rendering.
   - Content Security Policy (CSP), frame protection (`X-Frame-Options: DENY`), and `noindex` headers on administrative endpoints.

---

## 🛠️ Technology Stack

- **Backend Framework:** FastAPI (Python 3.10+) with Uvicorn ASGI server.
- **Database & ORM:** SQLite (ACID compliant, zero configuration) with SQLAlchemy 2.0.
- **API Architecture:** RESTful JSON endpoints with Pydantic schemas, Swagger UI (`/docs`), and CORS middleware.
- **Frontend:** Semantic HTML5, CSS3 Custom Properties (Vanilla CSS with custom design system), Vanilla JavaScript (ES6+).
- **Data Integration:** Hybrid API Client (`js/db.js`) with automatic real-time server sync and offline PWA LocalStorage fallback.
- **Icons & QR:** Modular Lucide SVG Icons, qrcode.js, and canvas-confetti.
- **PWA Ready:** Web App Manifest (`manifest.json`) and Service Worker (`sw.js`).
- **Security:** Salted SHA-256 password hashing, HMAC-SHA256 JWT tokens, rate limiting, and HTTP security headers.
- **Testing:** Automated unit testing suite in Python (25 test cases).
- **CI/CD:** GitHub Actions workflow (`.github/workflows/ci.yml`).

---

## 🚀 Quick Start & Local Setup

### Running the Application

#### Option 1: Double Click (Windows)
Double-click `Start-Tira-Belle.bat` in the project root. This launches the FastAPI + SQLite backend server on port 8001 and opens the browser automatically.

#### Option 2: Command Line
```powershell
# Install dependencies (if not already installed)
pip install -r backend/requirements.txt

# Start the FastAPI server
python run_server.py
```
- **Storefront:** [http://localhost:8001/index.html](http://localhost:8001/index.html)
- **Loyalty Tracker:** [http://localhost:8001/tracker.html](http://localhost:8001/tracker.html)
- **Staff POS Desk:** [http://localhost:8001/tira-desk.html](http://localhost:8001/tira-desk.html)
- **Interactive Swagger Docs:** [http://localhost:8001/docs](http://localhost:8001/docs)

---

## 📡 REST API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health status and database connectivity check |
| `POST` | `/api/auth/login` | Admin login issuing JWT bearer token |
| `GET` | `/api/auth/me` | Current authenticated admin session profile |
| `POST` | `/api/auth/credentials` | Update admin username, password, or PIN |
| `GET` | `/api/customers` | Search & list registered customers |
| `GET` | `/api/customers/{phone}` | Fetch live customer profile and loyalty stamp progress |
| `POST` | `/api/customers` | Upsert customer record |
| `GET` | `/api/products` | Retrieve active products for catalog/storefront |
| `POST` | `/api/products` | Create a new artisan product item |
| `PUT` | `/api/products/{id}` | Update product pricing, weights, or loyalty eligibility |
| `DELETE` | `/api/products/{id}` | Remove a product |
| `GET` | `/api/sales` | List recorded POS sale transactions |
| `POST` | `/api/sales` | Record new physical/online sale and calculate stamp progress |
| `GET` | `/api/sales/metrics` | Dashboard revenue metrics (today, yesterday, all-time, custom) |
| `GET` | `/api/redemptions` | Audit log of free loyalty reward cups claimed |
| `POST` | `/api/redemptions` | Claim eligible free reward cup |
| `GET` | `/api/reviews` | Retrieve approved customer reviews |
| `POST` | `/api/reviews` | Submit new customer review (auto-verifies past purchasers) |
| `GET` | `/api/settings` | Store configuration, WhatsApp, and loyalty thresholds |
| `PUT` | `/api/settings` | Update store settings |

---

## 🔒 Security Configuration

### Environment Variables & Credentials
Configure your environment secrets in a `.env` file (see `.env.example`). Never commit credentials to source control:
- `SECRET_KEY`: High-entropy random secret key used for signing administrative JWT tokens.
- `INITIAL_ADMIN_USERNAME`: Administrative account username (e.g. `admin@yourdomain.com`).
- `INITIAL_ADMIN_PASSWORD`: Strong initial administrative password (must be rotated upon deployment).
- `SUPABASE_DATABASE_URL`: Connection string to PostgreSQL / Supabase pooler with SSL.
- `SUPABASE_URL` & `SUPABASE_KEY`: Supabase project URL and service-role key for backend operations.

---

## 🧪 Automated Testing

Run the automated test suite to verify business rules, loyalty calculations, and database integrations:

```powershell
python -m unittest discover tests -v
```

All **25 tests** will execute and confirm:
1. Cryptographic hashing consistency (SHA-256 + salt).
2. XSS sanitizer escaping across all edge-cases.
3. Multi-cycle loyalty progress calculations and dynamic threshold changes.
4. Cash vs. Online revenue splits and cart subtotals.
5. In-memory SQLite relational database operations (CRUD).
6. JWT token creation, signature verification, and expiration.
7. Sales transaction creation and automatic reward eligibility unlocks.
8. Essential frontend and backend file integrity.
- SHA-256 credential hashing with cryptographic salt and lockout enforcement.
- XSS prevention and HTML entity sanitization.
- Loyalty reward eligibility edge cases across multiple cycles (0 cups, 3/5, 5/5, 7/5 with 1 claimed, etc.).
- Dynamic threshold recalculations and cup progress formatting.
- POS financial math, subtotals, and Cash/Online collection splits.
- Multi-criteria customer directory filtering (Cash, Online, 150g, 350g, Claimed).
- Central business profile and branding synchronization.

---

## 🌐 Production Deployment

TIRA Belle is 100% static-ready and can be deployed with HTTPS in under 2 minutes:

### Deploying to Vercel
1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in the project root.
3. The included `vercel.json` will automatically configure security headers, CSP, caching, and clean URLs.

### Deploying to Cloudflare Pages / Netlify
1. Connect your GitHub repository to Cloudflare Pages or Netlify.
2. Set Build Command to blank / None.
3. Set Output Directory to root (`/` or `.`).
4. The included `_headers` file automatically applies production HTTP security headers.

---

## 👥 Ownership & Business Contacts

- **Yash Chauhan:** +91-9373484198
- **Tejas Chauhan:** +91-8484870543
- **UPI ID:** `9373484198@upi`

---

© 2026 TIRA Belle • Handcrafted with love by Yash Chauhan & Tejas Chauhan. All rights reserved.
