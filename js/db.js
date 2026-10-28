/**
 * TIRA Belle - Central Database & Business Rules Engine
 * Handles Data Persistence via Supabase APIs, Real-Time Multi-Device Sync (SSE & Polling),
 * Transactions, Customers, Loyalty Calculations, and Settings.
 */

const STORAGE_KEY = 'TIRA_BELLE_DATA_V1';
const SETTINGS_CACHE_KEY = 'tira_settings_cache';
const LOCAL_API_BASE = 'http://localhost:8001/api';
const CLOUD_API_BASE = 'https://tirabelledesserts-byte-mubd.vercel.app/api';

// Cryptographic Salt & Default Credential Hashes
const CREDENTIAL_SALT = 'TIRABELLE_SALT_2026';

/**
 * Robust HTML escaping to prevent XSS across template renderings
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * SHA-256 Web Crypto hashing for credentials with salt
 */
async function hashCredential(value, salt = CREDENTIAL_SALT) {
    if (!value) return '';
    const input = String(value) + salt;
    if (window.crypto && window.crypto.subtle) {
        const enc = new TextEncoder();
        const data = enc.encode(input);
        const hashBuf = await window.crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuf));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback simple numeric hash if Web Crypto unavailable (offline legacy fallback)
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) - hash) + input.charCodeAt(i);
        hash |= 0;
    }
    return 'fallback_' + Math.abs(hash).toString(16);
}

const DEFAULT_SETTINGS = {
    businessName: 'TIRA Belle',
    tagline: 'Little Layers • Big Love',
    slogan: 'Layers of Love in Every Spoon',
    owner: 'Yash Chauhan & Tejas Chauhan',
    phone: '9373484198',
    phoneSecondary: '8484870543',
    whatsapp: '9373484198',
    address: 'Physical Dessert Studio & Artisan Counter, Pune',
    email: 'tirabelle.desserts@gmail.com',
    instagram: 'tirabelle.desserts',
    instagramUrl: 'https://instagram.com/tirabelle.desserts?obrf=MzhsZG04Ymc3NXBj',
    upiId: '9373484198@upi',
    currency: '₹',
    loyaltyThreshold: 5,
    rewardItemName: '1 Free 150g Tiramisu Cup',
    logo: 'assets/tira-belle-logo.png',
    adminUsername: 'tirabelle.desserts@gmail.com',
    // SHA-256('tira-123' + 'TIRABELLE_SALT_2026')
    adminPasswordHash: '2dbedb0613a00450077568d21baa5661ae3fba47257723b15627ba46b7cff28a'
};

const DEFAULT_CATEGORIES = [
    {
        id: 'cat-classic',
        name: 'Classic Tiramisu',
        slug: 'classic',
        description: 'Authentic Italian recipe with espresso-soaked savoiardi ladyfingers and whipped velvety mascarpone cream.',
        image: 'assets/classic/tiramisu-classic-150 g.png',
        displayOrder: 1,
        isActive: true,
        createdAt: '2026-10-01T10:00:00.000Z'
    },
    {
        id: 'cat-chocolate',
        name: 'Chocolate Tiramisu',
        slug: 'chocolate',
        description: 'Rich artisanal indulgence with double Belgian cocoa layers, dark chocolate curls, and airy mascarpone mousse.',
        image: 'assets/chocolate/tiramisu-chocolate-150 g.png',
        displayOrder: 2,
        isActive: true,
        createdAt: '2026-10-01T10:00:00.000Z'
    }
];

const DEFAULT_PRODUCTS = [
    {
        id: 'prod-150',
        categoryId: 'cat-classic',
        name: 'Classic – 150 g',
        shortName: '150 g Cup',
        price: 100,
        weight: '150 g',
        description: 'Handcrafted espresso-soaked savoiardi ladyfingers, velvety mascarpone cream, finished with rich Belgian cocoa dust.',
        image: 'assets/classic/tiramisu-classic-150 g.png',
        badge: 'Classic Single Serve',
        countsTowardsLoyalty: true,
        isActive: true,
        createdAt: '2026-10-01T10:00:00.000Z'
    },
    {
        id: 'prod-350',
        categoryId: 'cat-classic',
        name: 'Classic – 350 g',
        shortName: '350 g Sharing Tub',
        price: 200,
        weight: '350 g',
        description: 'Generous sharing tub layered with double mascarpone cream, dark chocolate curls, and rich espresso goodness.',
        image: 'assets/classic/tiramisu-classic-350 g.png',
        badge: 'Best Value • Sharing Tub',
        countsTowardsLoyalty: true,
        isActive: true,
        createdAt: '2026-10-01T10:00:00.000Z'
    },
    {
        id: 'prod-choco-150',
        categoryId: 'cat-chocolate',
        name: 'Chocolate – 150 g',
        shortName: '150 g Choco Cup',
        price: 120,
        weight: '150 g',
        description: 'Rich artisanal indulgence with double Belgian cocoa layers, dark chocolate curls, and airy mascarpone mousse.',
        image: 'assets/chocolate/tiramisu-chocolate-150 g.png',
        badge: 'Chocolate Single Serve',
        countsTowardsLoyalty: true,
        isActive: true,
        createdAt: '2026-10-01T10:00:00.000Z'
    },
    {
        id: 'prod-choco-350',
        categoryId: 'cat-chocolate',
        name: 'Chocolate – 350 g',
        shortName: '350 g Choco Tub',
        price: 220,
        weight: '350 g',
        description: 'Generous sharing tub layered with double mascarpone cream, dark chocolate curls, and rich espresso goodness.',
        image: 'assets/chocolate/tiramisu-chocolate-350 g.png',
        badge: 'Best Value • Sharing Tub',
        countsTowardsLoyalty: true,
        isActive: true,
        createdAt: '2026-10-01T10:00:00.000Z'
    }
];

// Helper to format date to Local Indian Time (YYYY-MM-DD)
function getTodayDateString(offsetDays = 0) {
    const d = new Date();
    if (offsetDays) {
        d.setDate(d.getDate() - offsetDays);
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const DEFAULT_CUSTOMERS = [];
const DEFAULT_SALES = [];
const DEFAULT_REDEMPTIONS = [];


// Initial authentic customer reviews
const DEFAULT_REVIEWS = [];

class TiraBelleDB {
    constructor() {
        this.isBackendOnline = false;
        this.localVersion = 0;
        this.isSyncing = false;
        this.pollTimer = null;
        this.sseSource = null;
        this.data = this.getDefaultState();

        // Cross-tab broadcast channel for instant real-time settings synchronization
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
            try {
                this.syncChannel = new BroadcastChannel('tira_belle_sync_channel');
                this.syncChannel.onmessage = (event) => {
                    if (event.data && event.data.type === 'settings-updated') {
                        this.data.settings = { ...this.data.settings, ...event.data.settings };
                        try {
                            if (typeof localStorage !== 'undefined') {
                                localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(this.data.settings));
                            }
                        } catch (e) {}
                        this.applyGlobalBranding(this.data.settings);
                        window.dispatchEvent(new CustomEvent('tira-settings-changed', { detail: this.data.settings }));
                    }
                };
            } catch (e) {}
        }

        // Cross-tab storage event listener for instant sync across tabs on same origin
        if (typeof window !== 'undefined') {
            window.addEventListener('storage', (e) => {
                if (e.key === SETTINGS_CACHE_KEY && e.newValue) {
                    try {
                        const parsed = JSON.parse(e.newValue);
                        if (parsed && typeof parsed === 'object') {
                            this.data.settings = { ...this.data.settings, ...parsed };
                            this.applyGlobalBranding(this.data.settings);
                            window.dispatchEvent(new CustomEvent('tira-settings-changed', { detail: this.data.settings }));
                        }
                    } catch (err) {}
                }
            });
        }

        if (typeof document !== 'undefined') {
            const onReady = () => {
                this.applyGlobalBranding();
                this.syncWithBackend().then(() => {
                    this.migrateLegacyLocalStorageData();
                });
                this.initRealtimeSync();
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', onReady);
            } else {
                onReady();
            }
        }
    }

    getDefaultState() {
        let cachedSettings = null;
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem(SETTINGS_CACHE_KEY);
                if (raw) cachedSettings = JSON.parse(raw);
            }
        } catch (e) {}
        if (!cachedSettings) {
            try {
                if (typeof sessionStorage !== 'undefined') {
                    const raw = sessionStorage.getItem(SETTINGS_CACHE_KEY);
                    if (raw) cachedSettings = JSON.parse(raw);
                }
            } catch (e) {}
        }

        return {
            settings: { ...DEFAULT_SETTINGS, ...(cachedSettings || {}) },
            categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
            products: JSON.parse(JSON.stringify(DEFAULT_PRODUCTS)),
            customers: [],
            sales: [],
            redemptions: [],
            reviews: []
        };
    }

    getApiBase() {
        if (typeof window !== 'undefined' && window.TIRA_API_BASE) {
            return window.TIRA_API_BASE;
        }
        if (this.preferredApiBase) {
            return this.preferredApiBase;
        }
        if (typeof window !== 'undefined' && window.location) {
            // When opened directly via file:// or non-backend dev ports (e.g. Live Server :5500)
            if (window.location.protocol === 'file:' || (window.location.hostname === 'localhost' && window.location.port !== '8001' && window.location.port !== '')) {
                try {
                    const cachedBase = sessionStorage.getItem('tira_preferred_api');
                    if (cachedBase) return cachedBase;
                } catch (e) {}
                return LOCAL_API_BASE;
            }
        }
        return '/api';
    }

    // ----------------- HYBRID REST API CLIENT -----------------
    async apiRequest(endpoint, options = {}) {
        let currentBase = this.getApiBase();
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };
        const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('TIRA_ADMIN_TOKEN') : null;
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const executeFetch = async (base) => {
            const url = base + endpoint;
            const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            const timeoutId = controller ? setTimeout(() => controller.abort(), options.timeout || 4000) : null;
            try {
                const resp = await fetch(url, {
                    ...options,
                    headers,
                    signal: controller ? controller.signal : undefined
                });
                if (timeoutId) clearTimeout(timeoutId);
                if (!resp.ok) {
                    const errData = await resp.json().catch(() => ({}));
                    return { ok: false, status: resp.status, data: errData };
                }
                const data = await resp.json().catch(() => ({}));
                return { ok: true, status: resp.status, data };
            } catch (e) {
                if (timeoutId) clearTimeout(timeoutId);
                return { ok: false, error: e.message || 'Network error' };
            }
        };

        let result = await executeFetch(currentBase);

        // Transparent failover for file:// or dev ports when local port 8001 is offline
        const isFileOrDev = typeof window !== 'undefined' && window.location && (window.location.protocol === 'file:' || (window.location.hostname === 'localhost' && window.location.port !== '8001' && window.location.port !== ''));
        if (!result.ok && isFileOrDev && currentBase === LOCAL_API_BASE) {
            const cloudResult = await executeFetch(CLOUD_API_BASE);
            if (cloudResult.ok) {
                this.preferredApiBase = CLOUD_API_BASE;
                this.isBackendOnline = true;
                try { sessionStorage.setItem('tira_preferred_api', CLOUD_API_BASE); } catch (e) {}
                return cloudResult;
            }
        }

        return result;
    }

    async checkBackendOnline() {
        const isFileOrDev = typeof window !== 'undefined' && window.location && (window.location.protocol === 'file:' || (window.location.hostname === 'localhost' && window.location.port !== '8001' && window.location.port !== ''));

        if (isFileOrDev) {
            // Probe local dev server first
            const localRes = await this.apiRequest('/health', { timeout: 1200 });
            if (localRes.ok && localRes.data && localRes.data.status === 'ok') {
                this.preferredApiBase = LOCAL_API_BASE;
                this.isBackendOnline = true;
                return true;
            }

            // Fallback probe to cloud backend
            try {
                const cloudRes = await fetch(CLOUD_API_BASE + '/health', { method: 'GET' });
                if (cloudRes.ok) {
                    const d = await cloudRes.json().catch(() => ({}));
                    if (d.status === 'ok') {
                        this.preferredApiBase = CLOUD_API_BASE;
                        this.isBackendOnline = true;
                        try { sessionStorage.setItem('tira_preferred_api', CLOUD_API_BASE); } catch (e) {}
                        return true;
                    }
                }
            } catch (e) {}

            this.isBackendOnline = false;
            return false;
        }

        try {
            const res = await this.apiRequest('/health', { timeout: 2500 });
            this.isBackendOnline = !!(res.ok && res.data && res.data.status === 'ok');
            return this.isBackendOnline;
        } catch (e) {
            this.isBackendOnline = false;
            return false;
        }
    }

    // ----------------- REAL-TIME MULTI-DEVICE SYNC ENGINE -----------------
    initRealtimeSync() {
        if (typeof window === 'undefined') return;

        // 1. Establish Server-Sent Events (SSE) connection for instant push updates
        this.connectEventSource();

        // 2. Setup periodic lightweight version polling (2.5s active) for platforms/serverless where SSE might drop
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = setInterval(() => {
            this.checkVersionAndSync();
        }, 2500);

        // 3. Sync on tab focus or visibility change only if remote version has incremented
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    this.checkVersionAndSync(false);
                    if (!this.sseSource || this.sseSource.readyState === EventSource.CLOSED) {
                        this.connectEventSource();
                    }
                }
            });
        }
        window.addEventListener('focus', () => {
            this.checkVersionAndSync(false);
        });
    }

    connectEventSource() {
        if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
        try {
            if (this.sseSource) {
                try { this.sseSource.close(); } catch (e) {}
            }
            const sseUrl = this.getApiBase() + '/realtime/stream';
            this.sseSource = new EventSource(sseUrl);

            this.sseSource.onmessage = (event) => {
                try {
                    if (!event.data || event.data.trim().startsWith(':')) return; // Heartbeat ping comment
                    const data = JSON.parse(event.data);
                    if (data.type === 'connected') {
                        this.isBackendOnline = true;
                        if (data.version && data.version > this.localVersion) {
                            this.localVersion = data.version;
                            this.syncWithBackend();
                        }
                    } else if (data.type === 'change') {
                        this.isBackendOnline = true;
                        if (data.version) {
                            this.localVersion = Math.max(this.localVersion, data.version);
                        }
                        this.handleRealtimeChange(data);
                    }
                } catch (err) {
                    console.debug('[TIRA Belle Realtime] Parse error:', err);
                }
            };

            this.sseSource.onerror = () => {
                // EventSource will automatically attempt reconnection
            };
        } catch (err) {
            console.debug('[TIRA Belle Realtime] SSE setup error:', err);
        }
    }

    async checkVersionAndSync(force = false) {
        if (this.isSyncing) return;
        try {
            const res = await this.apiRequest('/realtime/version', { timeout: 2000 });
            if (res.ok && res.data && typeof res.data.version === 'number') {
                this.isBackendOnline = true;
                if (res.data.version > this.localVersion || force) {
                    this.localVersion = res.data.version;
                    await this.syncWithBackend();
                }
            }
        } catch (e) {}
    }

    async handleRealtimeChange(changeData) {
        if (!changeData) return;

        // 1. Dispatch dedicated live event for real-time notification engine (genuine live actions only)
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tira-live-event', { detail: changeData }));
        }

        // 2. Re-synchronize data from backend silently
        await this.syncWithBackend();

        // 3. Dispatch entity data update events so UI views update their tables
        if (typeof window !== 'undefined') {
            const entity = changeData.entity;
            const payload = changeData.payload;
            if (entity === 'sales') {
                window.dispatchEvent(new CustomEvent('tira-sales-changed', { detail: payload }));
            } else if (entity === 'products') {
                window.dispatchEvent(new CustomEvent('tira-products-changed', { detail: payload }));
            } else if (entity === 'categories') {
                window.dispatchEvent(new CustomEvent('tira-categories-changed', { detail: payload }));
            } else if (entity === 'reviews') {
                window.dispatchEvent(new CustomEvent('tira-reviews-changed', { detail: payload }));
            } else if (entity === 'settings') {
                window.dispatchEvent(new CustomEvent('tira-settings-changed', { detail: payload }));
            } else if (entity === 'customers') {
                window.dispatchEvent(new CustomEvent('tira-customers-changed', { detail: payload }));
            } else if (entity === 'redemptions') {
                window.dispatchEvent(new CustomEvent('tira-redemptions-changed', { detail: payload }));
            }
        }
    }

    async syncWithBackend() {
        if (this.isSyncing) return false;
        this.isSyncing = true;
        try {
            const isOnline = await this.checkBackendOnline();
            if (!isOnline) {
                return false;
            }

            const [settRes, prodRes, catRes, revRes, custRes, salesRes, rdmRes] = await Promise.all([
                this.apiRequest('/settings'),
                this.apiRequest('/products'),
                this.apiRequest('/categories'),
                this.apiRequest('/reviews'),
                this.apiRequest('/customers'),
                this.apiRequest('/sales'),
                this.apiRequest('/redemptions')
            ]);

            let changed = false;

            if (settRes.ok && settRes.data) {
                this.data.settings = { ...this.data.settings, ...settRes.data };
                try {
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(this.data.settings));
                    }
                } catch (e) {}
                changed = true;
            }
            if (catRes.ok && Array.isArray(catRes.data) && catRes.data.length) {
                this.data.categories = catRes.data;
                changed = true;
            }
            if (prodRes.ok && Array.isArray(prodRes.data) && prodRes.data.length) {
                this.data.products = prodRes.data;
                changed = true;
            }
            if (revRes.ok && Array.isArray(revRes.data)) {
                this.data.reviews = revRes.data.map(r => {
                    const cleanP = r.phone ? String(r.phone).replace(/\D/g, '') : '';
                    if (cleanP.length >= 7) r.verified = true;
                    return r;
                });
                changed = true;
            }
            if (custRes.ok && Array.isArray(custRes.data)) {
                this.data.customers = custRes.data;
                changed = true;
            }
            if (salesRes.ok && Array.isArray(salesRes.data)) {
                this.data.sales = salesRes.data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                changed = true;
            }
            if (rdmRes.ok && Array.isArray(rdmRes.data)) {
                this.data.redemptions = rdmRes.data.sort((a, b) => new Date(b.redeemedAt) - new Date(a.redeemedAt));
                changed = true;
            }

            if (changed) {
                this.applyGlobalBranding();
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('tira-backend-synced', { detail: this.data }));
                    window.dispatchEvent(new CustomEvent('tira-settings-changed', { detail: this.data.settings }));
                    window.dispatchEvent(new CustomEvent('tira-categories-changed', { detail: this.data.categories }));
                    window.dispatchEvent(new CustomEvent('tira-products-changed', { detail: this.data.products }));
                    window.dispatchEvent(new CustomEvent('tira-reviews-changed', { detail: this.data.reviews }));
                    window.dispatchEvent(new CustomEvent('tira-sales-changed', { detail: this.data.sales }));
                    window.dispatchEvent(new CustomEvent('tira-customers-changed', { detail: this.data.customers }));
                }
            }
            return true;
        } catch (e) {
            console.warn('[TIRA Belle] Background sync error:', e);
            return false;
        } finally {
            this.isSyncing = false;
        }
    }

    // ----------------- DATA PERSISTENCE & MIGRATION -----------------
    /**
     * Data is held in-memory and persisted exclusively to the Supabase backend database via API.
     * localStorage is intentionally NOT used for data persistence.
     */
    load() {
        return this.getDefaultState();
    }

    save(data = this.data) {
        this.data = data;
        // Data persistence is handled via Supabase API calls.
        // localStorage is deliberately not used for business data.
        return this.data;
    }

    /**
     * Seamlessly migrates any legacy localStorage data to Supabase if the database is fresh,
     * then permanently removes the legacy key from localStorage.
     */
    async migrateLegacyLocalStorageData() {
        if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                const isOnline = await this.checkBackendOnline();
                if (isOnline) {
                    // Check if backend database already contains data
                    const [catRes, prodRes, salesRes] = await Promise.all([
                        this.apiRequest('/categories'),
                        this.apiRequest('/products'),
                        this.apiRequest('/sales')
                    ]);
                    const hasCategories = catRes.ok && Array.isArray(catRes.data) && catRes.data.length > 0;
                    const hasProducts = prodRes.ok && Array.isArray(prodRes.data) && prodRes.data.length > 0;
                    const hasSales = salesRes.ok && Array.isArray(salesRes.data) && salesRes.data.length > 0;

                    // Migrate categories if needed
                    if (!hasCategories && Array.isArray(parsed.categories)) {
                        for (const cat of parsed.categories) {
                            await this.apiRequest('/categories', { method: 'POST', body: JSON.stringify(cat) }).catch(() => {});
                        }
                    }
                    // Migrate products if needed
                    if (!hasProducts && Array.isArray(parsed.products)) {
                        for (const prod of parsed.products) {
                            await this.apiRequest('/products', { method: 'POST', body: JSON.stringify(prod) }).catch(() => {});
                        }
                    }
                    // Migrate sales if needed
                    if (!hasSales && Array.isArray(parsed.sales)) {
                        for (const sale of parsed.sales) {
                            await this.apiRequest('/sales', {
                                method: 'POST',
                                body: JSON.stringify({
                                    customerPhone: sale.customerPhone,
                                    customerName: sale.customerName,
                                    items: sale.items,
                                    paymentMode: sale.paymentMode || 'Cash',
                                    notes: sale.notes || ''
                                })
                            }).catch(() => {});
                        }
                    }
                    // Migrate reviews if needed
                    if (Array.isArray(parsed.reviews) && parsed.reviews.length > 0) {
                        const revRes = await this.apiRequest('/reviews');
                        if (revRes.ok && Array.isArray(revRes.data) && revRes.data.length === 0) {
                            for (const r of parsed.reviews) {
                                await this.apiRequest('/reviews', { method: 'POST', body: JSON.stringify(r) }).catch(() => {});
                            }
                        }
                    }
                }
            }
            // Permanently clear legacy key from localStorage
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            console.warn('[TIRA Belle] Legacy localStorage cleanup error:', e);
            try { localStorage.removeItem(STORAGE_KEY); } catch (err) {}
        }
    }

    getSettings() {
        if (!this.data.settings) {
            this.data.settings = { ...DEFAULT_SETTINGS };
        }
        // Normalize default Instagram details if legacy placeholder or missing
        if (!this.data.settings.instagram || this.data.settings.instagram === '@tirabelle') {
            this.data.settings.instagram = 'tirabelle.desserts';
        }
        if (!this.data.settings.instagramUrl) {
            this.data.settings.instagramUrl = 'https://instagram.com/tirabelle.desserts?obrf=MzhsZG04Ymc3NXBj';
        }
        return this.data.settings;
    }

    async updateSettings(newSettings) {
        if (newSettings && newSettings.loyaltyThreshold !== undefined) {
            newSettings.loyaltyThreshold = Math.max(1, parseInt(newSettings.loyaltyThreshold, 10) || 5);
        }
        this.data.settings = { ...this.data.settings, ...newSettings };

        // Cache settings synchronously in localStorage and sessionStorage for instant offline & reload persistence
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(this.data.settings));
            }
        } catch (e) {}
        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(this.data.settings));
            }
        } catch (e) {}

        this.save();
        this.applyGlobalBranding();
        try {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('tira-settings-changed', { detail: this.data.settings }));
            }
            if (this.syncChannel) {
                this.syncChannel.postMessage({ type: 'settings-updated', settings: this.data.settings });
            }
        } catch (e) {}

        // Always sync with active backend API (local server or cloud fallback)
        try {
            const apiRes = await this.apiRequest('/settings', {
                method: 'PUT',
                body: JSON.stringify(this.data.settings)
            });
            if (apiRes.ok && apiRes.data) {
                this.data.settings = { ...this.data.settings, ...apiRes.data };
                try {
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(this.data.settings));
                    }
                } catch (e) {}
            }
        } catch (e) {
            console.warn('Background settings sync error:', e);
        }

        return this.data.settings;
    }

    applyGlobalBranding(settings = this.getSettings()) {
        if (typeof document === 'undefined') return;
        const bizName = settings.businessName || 'TIRA Belle';
        const logo = settings.logo || 'assets/tira-belle-logo.png';
        const tagline = settings.tagline || 'Little Layers • Big Love';
        const slogan = settings.slogan || 'Layers of Love in Every Spoon';
        const owner = settings.owner || 'Yash Chauhan & Tejas Chauhan';
        const phone = settings.phone || '9373484198';
        const phoneSec = settings.phoneSecondary || '';
        const whatsapp = settings.whatsapp || phone;
        const address = settings.address || 'Physical Dessert Studio & Artisan Counter, Pune';
        const email = settings.email || '';
        const instagram = settings.instagram || '';
        const upiId = settings.upiId || '';

        // 1. Logos
        document.querySelectorAll('[data-brand="logo"], .tira-brand-logo').forEach(el => {
            if (el.tagName === 'IMG') {
                el.src = logo;
                el.alt = `${bizName} Logo`;
            }
        });
        document.querySelectorAll('[data-brand="logo-footer"]').forEach(el => {
            if (el.tagName === 'IMG') {
                el.src = logo;
                el.alt = `${bizName} Logo`;
            }
        });

        // 2. Business Name
        document.querySelectorAll('[data-brand="name"]').forEach(el => {
            el.textContent = bizName;
        });

        // 3. Tagline
        document.querySelectorAll('[data-brand="tagline"]').forEach(el => {
            el.textContent = tagline;
        });

        // 4. Slogan
        document.querySelectorAll('[data-brand="slogan"]').forEach(el => {
            el.textContent = slogan;
        });

        // 5. Owner
        document.querySelectorAll('[data-brand="owner"]').forEach(el => {
            el.textContent = owner;
        });

        // 6. Address
        document.querySelectorAll('[data-brand="address"]').forEach(el => {
            el.textContent = address;
        });

        // 7. Phone
        document.querySelectorAll('[data-brand="phone"]').forEach(el => {
            if (el.tagName === 'A') {
                el.href = `tel:${phone}`;
            }
            el.textContent = phone;
        });

        // 8. Secondary Phone
        document.querySelectorAll('[data-brand="phone-secondary"]').forEach(el => {
            if (el.tagName === 'A') {
                el.href = `tel:${phoneSec}`;
            }
            el.textContent = phoneSec;
        });

        // 9. Email
        document.querySelectorAll('[data-brand="email"]').forEach(el => {
            if (el.tagName === 'A') {
                el.href = `mailto:${email}`;
            }
            el.textContent = email;
            const parentRow = el.closest('#footerEmailRow');
            if (parentRow) parentRow.style.display = email ? 'flex' : 'none';
        });

        // 10. Instagram (100% Dynamic from Admin Settings)
        const rawHandle = (settings.instagram || '').trim();
        let rawUrl = (settings.instagramUrl || settings.instagram_url || '').trim();
        const cleanHandle = rawHandle.replace(/^@/, '');

        // If URL is missing, derive it from handle
        if (!rawUrl && cleanHandle) {
            rawUrl = `https://instagram.com/${cleanHandle}`;
        }

        // Format display text as @handle
        let displayHandle = '';
        if (cleanHandle) {
            displayHandle = `@${cleanHandle}`;
        } else if (rawUrl) {
            try {
                const parsed = new URL(rawUrl);
                const pathParts = parsed.pathname.split('/').filter(Boolean);
                if (pathParts.length > 0) {
                    displayHandle = `@${pathParts[0]}`;
                }
            } catch (e) {}
        }

        // Update clickable Instagram links (e.g. #footerInstaRow or elements with data-brand="instagram-link")
        document.querySelectorAll('[data-brand="instagram-link"]').forEach(el => {
            if (rawUrl) {
                el.href = rawUrl;
                el.target = '_blank';
                el.rel = 'noopener noreferrer';
                el.style.display = 'inline-flex';
                el.setAttribute('aria-label', `Visit ${displayHandle || 'TIRA Belle'} on Instagram`);
            } else {
                el.href = '#';
                el.style.display = 'none';
            }
        });

        // Update handle text and any direct Instagram anchor elements
        document.querySelectorAll('[data-brand="instagram"]').forEach(el => {
            if (el.tagName === 'A') {
                el.href = rawUrl || '#';
                el.target = '_blank';
                el.rel = 'noopener noreferrer';
            }
            el.textContent = displayHandle;
            const parentRow = el.closest('#footerInstaRow');
            if (parentRow && !parentRow.matches('[data-brand="instagram-link"]')) {
                parentRow.style.display = (displayHandle || rawUrl) ? 'flex' : 'none';
            }
        });

        // 11. UPI ID
        document.querySelectorAll('[data-brand="upi"]').forEach(el => {
            el.textContent = upiId;
        });

        // 12. WhatsApp Links
        document.querySelectorAll('[data-brand="whatsapp-link"]').forEach(el => {
            if (el.tagName === 'A') {
                const cleanNum = (whatsapp || phone).replace(/\D/g, '');
                el.href = `https://wa.me/91${cleanNum}?text=${encodeURIComponent(`Hello! I would like to order ${bizName} tiramisu`)}`;
            }
        });

        // 13. Contact Summary / Combined WhatsApp
        document.querySelectorAll('[data-brand="contact-summary"]').forEach(el => {
            const secPart = phoneSec ? ` / ${phoneSec}` : '';
            el.textContent = `Counter Service: ${owner} • WhatsApp: ${phone}${secPart}`;
        });

        // 14. Footer Contact Phone Line
        document.querySelectorAll('[data-brand="contact-phones"]').forEach(el => {
            const secPart = phoneSec ? ` / ${phoneSec}` : '';
            el.textContent = `WhatsApp: ${phone}${secPart}`;
        });

        // 15. Footer Copyright
        document.querySelectorAll('[data-brand="copyright"]').forEach(el => {
            el.textContent = `© ${new Date().getFullYear()} ${bizName} • Handcrafted with love by ${owner}. All rights reserved.`;
        });

        // 16. Claim Notice (Tracker)
        document.querySelectorAll('[data-brand="claim-notice"]').forEach(el => {
            el.textContent = `Simply show this screen or provide your phone number at the ${bizName} physical counter (${address}). The staff will verify and hand you your freshly crafted 150g cup!`;
        });
    }

    async changeAdminCredentials({ username, oldPassword, newPassword }) {
        const cleanUser = String(username || '').trim();
        const cleanOld = String(oldPassword || '').trim();
        const cleanNew = String(newPassword || '').trim();

        if (!cleanUser) {
            return { success: false, message: 'Admin username cannot be blank.' };
        }
        if (!cleanOld) {
            return { success: false, message: 'Please enter your old password.' };
        }
        if (!cleanNew) {
            return { success: false, message: 'Please enter your new password.' };
        }

        // 1. Verify old password locally
        const oldHash = await hashCredential(cleanOld);
        const currentHash = this.data.settings.adminPasswordHash;
        if (currentHash && oldHash !== currentHash) {
            return { success: false, message: 'Incorrect old password.' };
        }

        // 2. Try remote API update if online
        if (this.isBackendOnline) {
            try {
                const apiRes = await this.apiRequest('/auth/credentials', {
                    method: 'POST',
                    body: JSON.stringify({
                        username: cleanUser,
                        oldPassword: cleanOld,
                        password: cleanNew
                    })
                });
                if (!apiRes.ok) {
                    const detail = (apiRes.data && apiRes.data.detail) ? apiRes.data.detail : 'Failed to update remote credentials';
                    return { success: false, message: detail };
                }
            } catch (e) {
                console.warn('[TIRA Belle] Remote credential update error:', e);
            }
        }

        // 3. Update local settings
        this.data.settings.adminUsername = cleanUser;
        this.data.settings.adminPasswordHash = await hashCredential(cleanNew);
        this.save();

        return { success: true, message: 'Admin credentials updated successfully' };
    }

    async updateCredentials({ username, password, pin }) {
        if (username) {
            this.data.settings.adminUsername = username.trim();
        }
        if (password) {
            this.data.settings.adminPasswordHash = await hashCredential(password.trim());
            delete this.data.settings.adminPassword;
        }
        if (pin) {
            this.data.settings.adminPinHash = await hashCredential(pin.trim());
            delete this.data.settings.adminPin;
        }
        this.save();

        if (this.isBackendOnline) {
            this.apiRequest('/auth/credentials', {
                method: 'POST',
                body: JSON.stringify({
                    username: username ? username.trim() : undefined,
                    password: password ? password.trim() : undefined,
                    pin: pin ? pin.trim() : undefined
                })
            }).catch(e => console.warn('[TIRA Belle] Remote credential sync error:', e));
        }

        return { success: true };
    }

    async verifyAdminCredentials(user, secret) {
        if (!user || !secret) return false;
        const cleanUser = user.trim();
        const cleanSecret = secret.trim();

        // 1. Try Backend Authentication if online
        try {
            const apiRes = await this.apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username: cleanUser, secret: cleanSecret }),
                timeout: 3000
            });
            if (apiRes.ok && apiRes.data && apiRes.data.access_token) {
                if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.setItem('TIRA_ADMIN_TOKEN', apiRes.data.access_token);
                }
                this.isBackendOnline = true;
                return true;
            }
        } catch (e) {
            console.warn('[TIRA Belle] Remote auth failed or offline, falling back to local credentials');
        }

        // 2. Fallback to local cryptographic hash comparison
        const settings = this.getSettings();
        const currentAdminUser = (settings.adminUsername || 'tirabelle.desserts@gmail.com').toLowerCase();
        const isUserMatch = (cleanUser.toLowerCase() === currentAdminUser);
        if (!isUserMatch) return false;

        const secretHash = await hashCredential(cleanSecret);

        // Check strictly against the currently configured admin password hash only
        const isPassMatch = !!(settings.adminPasswordHash && secretHash === settings.adminPasswordHash);
        return isPassMatch;
    }

    // ----------------- CATEGORIES -----------------
    getCategories(activeOnly = false) {
        if (!this.data.categories || !this.data.categories.length) {
            this.data.categories = [...DEFAULT_CATEGORIES];
            this.save();
        }
        let cats = [...this.data.categories];
        if (activeOnly) {
            cats = cats.filter(c => c.isActive);
        }
        cats.sort((a, b) => (Number(a.displayOrder) || 0) - (Number(b.displayOrder) || 0) || a.name.localeCompare(b.name));

        const products = this.data.products || [];
        return cats.map(cat => {
            const prods = products.filter(p => p.categoryId === cat.id && (!activeOnly || p.isActive));
            const images = [];
            if (cat.image && !images.includes(cat.image)) images.push(cat.image);
            prods.forEach(p => {
                if (p.image && !images.includes(p.image)) images.push(p.image);
            });
            return {
                ...cat,
                productCount: prods.length,
                images,
                products: prods
            };
        });
    }

    getCategoryById(id) {
        return this.getCategories(false).find(c => c.id === id);
    }

    saveCategory(categoryData) {
        if (!this.data.categories) {
            this.data.categories = [...DEFAULT_CATEGORIES];
        }
        let savedCat = null;
        if (categoryData.id) {
            const index = this.data.categories.findIndex(c => c.id === categoryData.id);
            if (index !== -1) {
                this.data.categories[index] = {
                    ...this.data.categories[index],
                    ...categoryData,
                    updatedAt: new Date().toISOString()
                };
                savedCat = this.data.categories[index];
            } else {
                savedCat = { ...categoryData, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
                this.data.categories.push(savedCat);
            }
        } else {
            const slug = (categoryData.name || 'cat').toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-');
            const newId = `cat-${slug}-${Date.now()}`;
            savedCat = {
                ...categoryData,
                id: newId,
                slug: categoryData.slug || slug,
                isActive: categoryData.isActive !== undefined ? categoryData.isActive : true,
                displayOrder: categoryData.displayOrder !== undefined ? parseInt(categoryData.displayOrder, 10) : (this.data.categories.length + 1),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            this.data.categories.push(savedCat);
        }
        this.save();

        if (this.isBackendOnline && savedCat) {
            if (categoryData.id) {
                this.apiRequest(`/categories/${savedCat.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(savedCat)
                }).catch(e => console.warn('Category sync error:', e));
            } else {
                this.apiRequest('/categories', {
                    method: 'POST',
                    body: JSON.stringify(savedCat)
                }).catch(e => console.warn('Category sync error:', e));
            }
        }

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tira-categories-changed', { detail: this.data.categories }));
        }

        return savedCat;
    }

    deleteCategory(id) {
        if (!this.data.categories) return [];
        this.data.categories = this.data.categories.filter(c => c.id !== id);
        // Unlink products belonging to this category
        if (this.data.products) {
            this.data.products.forEach(p => {
                if (p.categoryId === id) {
                    p.categoryId = null;
                }
            });
        }
        this.save();

        if (this.isBackendOnline) {
            this.apiRequest(`/categories/${id}`, { method: 'DELETE' })
                .catch(e => console.warn('Category delete sync error:', e));
        }

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tira-categories-changed', { detail: this.data.categories }));
            window.dispatchEvent(new CustomEvent('tira-products-changed', { detail: this.data.products }));
        }
        return this.data.categories;
    }

    // ----------------- IMAGE UPLOAD -----------------
    async uploadImage(file) {
        if (!file) {
            throw new Error('No image file selected.');
        }

        // Validate file type
        const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
        const ext = (file.name || '').split('.').pop().toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            throw new Error(`Unsupported image format ".${ext}". Please upload a JPG, PNG, WEBP, or GIF.`);
        }

        // Validate file size (max 5 MB)
        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) {
            throw new Error(`Image size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds 5 MB limit. Please choose a smaller image.`);
        }

        // Attempt direct upload to backend API
        const isOnline = await this.checkBackendOnline();
        if (isOnline) {
            try {
                const url = this.getApiBase() + '/upload';
                const formData = new FormData();
                formData.append('file', file);

                const headers = {};
                const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('TIRA_ADMIN_TOKEN') : null;
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }

                const resp = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: formData
                });

                if (resp.ok) {
                    const resData = await resp.json();
                    return {
                        success: true,
                        url: resData.url,
                        filename: resData.filename,
                        size: resData.size
                    };
                } else {
                    const errJson = await resp.json().catch(() => ({}));
                    throw new Error(errJson.detail || `Server upload error: ${resp.status}`);
                }
            } catch (err) {
                console.warn('[TiraDB] Backend upload failed, falling back to local storage preview:', err);
                // Fall back to local data URL below
            }
        }

        // Offline / fallback data URL
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve({
                    success: true,
                    url: e.target.result,
                    filename: file.name,
                    size: file.size,
                    isLocalFallback: true
                });
            };
            reader.onerror = () => reject(new Error('Failed to read image locally.'));
            reader.readAsDataURL(file);
        });
    }

    // ----------------- PRODUCTS -----------------
    getProducts(activeOnly = false, categoryId = null) {
        let prods = [...this.data.products];
        if (activeOnly) {
            prods = prods.filter(p => p.isActive);
        }
        if (categoryId) {
            prods = prods.filter(p => p.categoryId === categoryId);
        }
        return prods;
    }

    getProductById(id) {
        return this.data.products.find(p => p.id === id);
    }

    saveProduct(productData) {
        let savedProd = null;
        if (productData.id) {
            const index = this.data.products.findIndex(p => p.id === productData.id);
            if (index !== -1) {
                this.data.products[index] = { ...this.data.products[index], ...productData, updatedAt: new Date().toISOString() };
                savedProd = this.data.products[index];
            } else {
                this.data.products.push({ ...productData, createdAt: new Date().toISOString() });
                savedProd = this.data.products[this.data.products.length - 1];
            }
        } else {
            const newId = 'prod-' + Date.now();
            savedProd = {
                ...productData,
                id: newId,
                isActive: productData.isActive !== undefined ? productData.isActive : true,
                createdAt: new Date().toISOString()
            };
            this.data.products.push(savedProd);
        }
        this.save();

        if (this.isBackendOnline && savedProd) {
            if (productData.id) {
                this.apiRequest(`/products/${savedProd.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(savedProd)
                }).catch(e => console.warn('Product sync error:', e));
            } else {
                this.apiRequest('/products', {
                    method: 'POST',
                    body: JSON.stringify(savedProd)
                }).catch(e => console.warn('Product sync error:', e));
            }
        }

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tira-products-changed', { detail: this.data.products }));
        }

        return this.data.products;
    }

    deleteProduct(id) {
        this.data.products = this.data.products.filter(p => p.id !== id);
        this.save();
        if (this.isBackendOnline) {
            this.apiRequest(`/products/${id}`, { method: 'DELETE' })
                .catch(e => console.warn('Product delete sync error:', e));
        }
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tira-products-changed', { detail: this.data.products }));
        }
        return this.data.products;
    }

    // ----------------- CUSTOMERS -----------------
    getCustomers() {
        return [...this.data.customers];
    }

    findCustomerByPhone(phone) {
        const cleanPhone = (phone || '').trim().replace(/\D/g, '');
        return this.data.customers.find(c => c.phone.replace(/\D/g, '') === cleanPhone);
    }

    findCustomersByName(name) {
        const clean = (name || '').trim().toLowerCase();
        if (!clean) return [];
        return this.data.customers.filter(c => c.name.toLowerCase().includes(clean));
    }

    searchCustomer(query) {
        if (!query) return [];
        const clean = query.trim().toLowerCase();
        const cleanDigits = query.trim().replace(/\D/g, '');
        return this.data.customers.filter(c => {
            const matchName = c.name.toLowerCase().includes(clean);
            const matchPhone = cleanDigits.length >= 3 && c.phone.replace(/\D/g, '').includes(cleanDigits);
            return matchName || matchPhone;
        });
    }

    upsertCustomer(phone, name) {
        const cleanPhone = (phone || '').trim().replace(/\D/g, '');
        if (!cleanPhone) return null;
        let customer = this.findCustomerByPhone(cleanPhone);
        if (customer) {
            if (name && name.trim() && customer.name !== name.trim()) {
                customer.name = name.trim();
                customer.updatedAt = new Date().toISOString();
                this.save();
            }
        } else {
            customer = {
                phone: cleanPhone,
                name: (name || 'Valued Guest').trim(),
                createdAt: new Date().toISOString()
            };
            this.data.customers.push(customer);
            this.save();
        }

        if (this.isBackendOnline && customer) {
            this.apiRequest('/customers', {
                method: 'POST',
                body: JSON.stringify({ phone: cleanPhone, name: customer.name })
            }).catch(e => console.warn('Customer sync error:', e));
        }

        return customer;
    }

    // ----------------- LOYALTY ENGINE -----------------
    getCustomerLoyalty(phone) {
        const cleanPhone = (phone || '').trim().replace(/\D/g, '');
        const customer = this.findCustomerByPhone(cleanPhone);
        const threshold = Math.max(1, parseInt(this.data.settings.loyaltyThreshold, 10) || 5);

        // Customer's sales
        const customerSales = this.data.sales.filter(s => (s.customerPhone || '').replace(/\D/g, '') === cleanPhone);

        // Separate Metrics:
        // 1. Total Paid Cups Purchased (quantity across all orders)
        let totalCupsPurchased = 0;
        // 2. Completed Eligible Purchase Transactions (each transaction with at least 1 paid item counts as 1 purchase)
        let completedPurchasesCount = 0;

        customerSales.forEach(sale => {
            const cupsInSale = (sale.paidCupsCount || 0);
            totalCupsPurchased += cupsInSale;
            if (cupsInSale > 0 || (sale.items && sale.items.some(it => !it.isReward))) {
                completedPurchasesCount += 1;
            }
        });

        // Total rewards claimed
        const customerRedemptions = this.data.redemptions.filter(r => (r.customerPhone || '').replace(/\D/g, '') === cleanPhone);
        const claimedCount = customerRedemptions.length;

        // Total lifetime rewards earned based on eligible cups purchased
        const totalEarnedRewards = Math.floor(totalCupsPurchased / threshold);

        // Available rewards that can be redeemed right now
        const availableRewards = Math.max(0, totalEarnedRewards - claimedCount);
        const isEligible = availableRewards > 0;

        // Effective cups active in the current cycle after accounting for claimed rewards
        const cupsSinceClaimed = Math.max(0, totalCupsPurchased - (claimedCount * threshold));
        // Current cycle progress (if eligible, customer reached the threshold; otherwise remainder of active cups)
        const currentCycleProgress = isEligible ? threshold : (cupsSinceClaimed % threshold);
        const cupsRemaining = isEligible ? 0 : (threshold - currentCycleProgress);

        return {
            exists: !!(customer || customerSales.length > 0),
            customer: customer || { phone: cleanPhone, name: 'Guest' },
            threshold,
            totalCupsPurchased,       // Total cups bought across all transactions
            totalEligibleCups: totalCupsPurchased, // Backward compatibility for any legacy callers
            completedPurchasesCount,  // Total separate completed purchase transactions
            totalEarnedRewards,
            claimedCount,
            availableRewards,
            isEligible,
            currentCycleProgress,
            cupsRemaining,
            purchasesRemaining: cupsRemaining, // Backward compatibility for UI bindings
            redemptions: customerRedemptions.sort((a, b) => new Date(b.redeemedAt) - new Date(a.redeemedAt)),
            salesHistory: customerSales.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        };
    }

    // ----------------- REDEEM REWARD -----------------
    async redeemReward(phone, adminUser = 'admin', notes = '') {
        const loyalty = this.getCustomerLoyalty(phone);
        if (!loyalty.isEligible) {
            return { success: false, message: 'Customer is not eligible for a free reward yet.' };
        }

        const redemption = {
            id: 'RDM-' + Date.now().toString().slice(-6),
            customerPhone: loyalty.customer.phone,
            customerName: loyalty.customer.name,
            rewardItem: this.data.settings.rewardItemName || '1 Free 150g Tiramisu Cup',
            redeemedAt: new Date().toISOString(),
            date: getTodayDateString(0),
            adminUser: adminUser,
            notes: notes || 'Redeemed over counter'
        };

        let apiError = null;
        try {
            const apiRes = await this.apiRequest('/redemptions', {
                method: 'POST',
                body: JSON.stringify({
                    customerPhone: loyalty.customer.phone,
                    adminUser: adminUser || 'admin',
                    notes: notes || 'Redeemed over counter'
                })
            });
            if (apiRes && apiRes.ok && apiRes.data && apiRes.data.redemptionId) {
                redemption.id = apiRes.data.redemptionId;
                this.isBackendOnline = true;
            } else {
                apiError = (apiRes && apiRes.data && apiRes.data.detail) || (apiRes && apiRes.error) || 'Failed to save redemption to database.';
            }
        } catch (e) {
            apiError = e.message || 'Network error saving redemption to database.';
        }

        if (apiError) {
            console.error('[TIRA Belle] Redemption database error:', apiError);
            return {
                success: false,
                message: `Database Error: ${apiError}`
            };
        }

        this.data.redemptions.push(redemption);
        this.save();

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tira-sales-changed', { detail: this.data.sales }));
            window.dispatchEvent(new CustomEvent('tira-backend-synced', { detail: this.data }));
        }

        return {
            success: true,
            redemption,
            updatedLoyalty: this.getCustomerLoyalty(phone),
            message: `Successfully redeemed 1 free reward for ${loyalty.customer.name}!`
        };
    }

    // ----------------- SALES & TRANSACTIONS -----------------
    async createSale({ customerPhone, customerName, items, paymentMode, notes = '', redeemFreeReward = false }) {
        const cleanPhone = (customerPhone || '').trim().replace(/\D/g, '');
        if (!cleanPhone) {
            return { success: false, message: 'Valid customer phone number is required.' };
        }

        if (!items || !items.length) {
            return { success: false, message: 'Cart cannot be empty.' };
        }

        // Upsert customer
        const customer = this.upsertCustomer(cleanPhone, customerName);

        // Check if customer wants to redeem reward with this order
        let redeemedItem = null;
        if (redeemFreeReward) {
            const currentLoyalty = this.getCustomerLoyalty(cleanPhone);
            if (currentLoyalty.isEligible) {
                const rdmResult = await this.redeemReward(cleanPhone, 'admin', 'Redeemed together with Sale POS');
                if (rdmResult.success) {
                    redeemedItem = {
                        productId: 'prod-150',
                        productName: this.data.settings.rewardItemName + ' (Loyalty Reward)',
                        price: 0,
                        quantity: 1,
                        isReward: true
                    };
                }
            }
        }

        // Calculate paid items and total amount
        let subtotal = 0;
        let paidCupsCount = 0;
        const processedItems = items.map(item => {
            const product = this.getProductById(item.productId);
            const price = product ? product.price : (item.price || 0);
            const qty = parseInt(item.quantity, 10) || 1;
            const itemTotal = price * qty;
            subtotal += itemTotal;

            // Rule: Each eligible product cup counts as one purchase
            if (!item.isReward && (product ? product.countsTowardsLoyalty : true)) {
                paidCupsCount += qty;
            }

            return {
                productId: item.productId,
                productName: item.productName || (product ? product.name : 'Tiramisu'),
                weight: product ? product.weight : '',
                price: price,
                quantity: qty,
                total: itemTotal,
                isReward: !!item.isReward
            };
        });

        // Add reward item to invoice display if redeemed
        if (redeemedItem) {
            processedItems.push({
                productId: 'reward-150',
                productName: redeemedItem.productName,
                weight: '150 g',
                price: 0,
                quantity: 1,
                total: 0,
                isReward: true
            });
        }

        const saleRecord = {
            id: 'TXN-' + Date.now().toString().slice(-6),
            customerPhone: cleanPhone,
            customerName: customer.name,
            items: processedItems,
            subtotal: subtotal,
            discount: 0,
            totalAmount: subtotal, // Paid sales total excludes free rewards
            paymentMode: paymentMode || 'Cash', // Cash / Online
            paidCupsCount: paidCupsCount,
            timestamp: new Date().toISOString(),
            date: getTodayDateString(0),
            notes: notes || '',
            rewardRedeemedInSale: !!redeemedItem
        };

        // Persist directly to Supabase via backend REST API
        let apiError = null;
        try {
            const apiRes = await this.apiRequest('/sales', {
                method: 'POST',
                body: JSON.stringify({
                    customerPhone: cleanPhone,
                    customerName: customer.name,
                    items: processedItems,
                    paymentMode: paymentMode || 'Cash',
                    notes: notes || '',
                    redeemFreeReward: !!redeemFreeReward
                })
            });
            if (apiRes && apiRes.ok && apiRes.data && apiRes.data.saleId) {
                saleRecord.id = apiRes.data.saleId;
                this.isBackendOnline = true;
            } else {
                apiError = (apiRes && apiRes.data && apiRes.data.detail) || (apiRes && apiRes.error) || 'Failed to save transaction to database.';
            }
        } catch (e) {
            apiError = e.message || 'Network error saving transaction to database.';
        }

        if (apiError) {
            console.error('[TIRA Belle] Sale database error:', apiError);
            return {
                success: false,
                message: `Database Error: ${apiError}`
            };
        }

        this.data.sales.push(saleRecord);
        this.save();

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tira-sales-changed', { detail: this.data.sales }));
            window.dispatchEvent(new CustomEvent('tira-backend-synced', { detail: this.data }));
        }

        const updatedLoyalty = this.getCustomerLoyalty(cleanPhone);

        return {
            success: true,
            sale: saleRecord,
            loyalty: updatedLoyalty,
            message: 'Sale recorded and persisted successfully!'
        };
    }

    async patchSaleCustomer(saleId, customerPhone, customerName) {
        const cleanPhone = (customerPhone || '').trim().replace(/\D/g, '');
        if (!cleanPhone) {
            return { success: false, message: 'Valid customer phone number is required.' };
        }

        const sale = this.data.sales.find(s => s.id === saleId);
        if (!sale) {
            return { success: false, message: 'Sale transaction not found.' };
        }

        const custName = (customerName || sale.customerName || sale.customer_name || 'Valued Guest').trim();
        this.upsertCustomer(cleanPhone, custName);

        sale.customerPhone = cleanPhone;
        sale.customerName = custName;
        this.save();

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('tira-sales-changed', { detail: this.data.sales }));
            window.dispatchEvent(new CustomEvent('tira-backend-synced', { detail: this.data }));
        }

        // Attempt backend sync
        try {
            await this.apiRequest(`/sales/${encodeURIComponent(saleId)}/customer`, {
                method: 'PATCH',
                body: JSON.stringify({
                    customerPhone: cleanPhone,
                    customerName: custName
                })
            });
        } catch (e) {
            console.warn('[TiraDB] Backend patch sale customer warning:', e);
        }

        return {
            success: true,
            sale,
            customerPhone: cleanPhone,
            customerName: custName
        };
    }

    getSales() {
        return [...this.data.sales].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    getRedemptions() {
        return [...this.data.redemptions].sort((a, b) => new Date(b.redeemedAt) - new Date(a.redeemedAt));
    }

    // ----------------- DASHBOARD ANALYTICS -----------------
    getDashboardMetrics(filterDate = 'today') {
        let targetDate = getTodayDateString(0);
        let filterFn;

        if (filterDate === 'today') {
            filterFn = sale => sale.date === targetDate;
        } else if (filterDate === 'yesterday') {
            const yesterday = getTodayDateString(1);
            filterFn = sale => sale.date === yesterday;
        } else if (filterDate === 'all') {
            filterFn = () => true;
        } else if (filterDate.startsWith('custom:')) {
            const customDate = filterDate.replace('custom:', '').trim();
            filterFn = sale => sale.date === customDate;
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(filterDate)) {
            filterFn = sale => sale.date === filterDate;
        } else {
            filterFn = sale => sale.date === targetDate;
        }

        const filteredSales = this.data.sales.filter(filterFn);
        
        // Filter redemptions
        let redemptionFilterFn;
        if (filterDate === 'today') {
            redemptionFilterFn = r => r.date === targetDate;
        } else if (filterDate === 'yesterday') {
            redemptionFilterFn = r => r.date === getTodayDateString(1);
        } else if (filterDate === 'all') {
            redemptionFilterFn = () => true;
        } else if (filterDate.startsWith('custom:')) {
            const customDate = filterDate.replace('custom:', '').trim();
            redemptionFilterFn = r => r.date === customDate;
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(filterDate)) {
            redemptionFilterFn = r => r.date === filterDate;
        } else {
            redemptionFilterFn = r => r.date === targetDate;
        }
        const filteredRedemptions = this.data.redemptions.filter(redemptionFilterFn);

        let totalRevenue = 0;
        let cashCollection = 0;
        let onlineCollection = 0;
        let totalPaidQuantity = 0;
        const productSummary = {};

        // Pre-populate product summary with current products
        this.data.products.forEach(p => {
            productSummary[p.id] = {
                id: p.id,
                name: p.name,
                weight: p.weight,
                price: p.price,
                quantity: 0,
                revenue: 0
            };
        });

        filteredSales.forEach(sale => {
            const saleAmount = Number(sale.totalAmount ?? sale.total_amount ?? 0);
            totalRevenue += saleAmount;
            const pMode = sale.paymentMode || sale.payment_mode || 'Cash';
            if (pMode === 'Cash') {
                cashCollection += saleAmount;
            } else {
                onlineCollection += saleAmount;
            }
            const items = Array.isArray(sale.items) ? sale.items : [];
            const nonRewardCups = items.reduce((sum, it) => {
                const isRew = it.isReward ?? it.is_reward ?? false;
                return isRew ? sum : sum + Number(it.quantity ?? 1);
            }, 0);
            totalPaidQuantity += (items.length > 0 ? nonRewardCups : Number(sale.paidCupsCount ?? sale.paid_cups_count ?? 0));

            items.forEach(item => {
                const isRew = item.isReward ?? item.is_reward ?? false;
                if (!isRew) {
                    const pid = item.productId || item.product_id || 'custom';
                    const pPrice = Number(item.price ?? 0);
                    const pQty = Number(item.quantity ?? 1);
                    const pTotal = Number(item.total ?? (pPrice * pQty));
                    if (!productSummary[pid]) {
                        productSummary[pid] = {
                            id: pid,
                            name: item.productName || item.product_name || 'Tiramisu',
                            weight: item.weight || '',
                            price: pPrice,
                            quantity: 0,
                            revenue: 0
                        };
                    }
                    productSummary[pid].quantity += pQty;
                    productSummary[pid].revenue += pTotal;
                }
            });
        });

        return {
            totalRevenue,
            cashCollection,
            onlineCollection,
            totalPaidQuantity,
            transactionCount: filteredSales.length,
            rewardsRedeemedCount: filteredRedemptions.length,
            productSummary: Object.values(productSummary),
            recentSales: filteredSales.slice(0, 10),
            filterDate: filterDate
        };
    }

    // ----------------- CUSTOMER REVIEWS MANAGEMENT -----------------
    getReviews() {
        if (!Array.isArray(this.data.reviews)) {
            this.data.reviews = [...DEFAULT_REVIEWS];
            this.save();
        }
        // Deduplicate reviews by ID and content signature (name + comment + date)
        const seenIds = new Set();
        const seenSignatures = new Set();
        const unique = [];

        const sorted = [...this.data.reviews].sort((a, b) => {
            const timeA = new Date(a.timestamp || a.date).getTime() || 0;
            const timeB = new Date(b.timestamp || b.date).getTime() || 0;
            return timeB - timeA;
        });

        for (const rev of sorted) {
            if (!rev || !rev.name) continue;
            // Ensure verified flag is true if an eligible phone number is present
            const cleanP = rev.phone ? String(rev.phone).replace(/\D/g, '') : '';
            if (cleanP.length >= 7) {
                rev.verified = true;
            }
            const idKey = rev.id ? String(rev.id) : null;
            const sigKey = `${String(rev.name).trim().toLowerCase()}|${String(rev.comment).trim().toLowerCase()}|${rev.date || ''}`;
            if (idKey && seenIds.has(idKey)) continue;
            if (seenSignatures.has(sigKey)) continue;
            if (idKey) seenIds.add(idKey);
            seenSignatures.add(sigKey);
            unique.push(rev);
        }

        return unique;
    }

    async addReview(review) {
        if (!review || !review.name || !review.comment) {
            return { success: false, message: 'Please provide both your name and review message.' };
        }
        if (!Array.isArray(this.data.reviews)) {
            this.data.reviews = [];
        }

        let newRev = {
            id: 'rev-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            name: String(review.name).trim(),
            phone: String(review.phone || '').trim(),
            rating: Math.max(1, Math.min(5, parseInt(review.rating, 10) || 5)),
            favoriteItem: review.favoriteItem || 'Classic – 150 g',
            comment: String(review.comment).trim(),
            date: getTodayDateString(0),
            timestamp: new Date().toISOString(),
            verified: this.isVerifiedCustomer(review.phone, review.name)
        };

        // Submit to backend database API
        try {
            const apiRes = await this.apiRequest('/reviews', {
                method: 'POST',
                body: JSON.stringify({
                    name: newRev.name,
                    phone: newRev.phone,
                    rating: newRev.rating,
                    favoriteItem: newRev.favoriteItem,
                    comment: newRev.comment
                })
            });
            if (apiRes && apiRes.ok && apiRes.data) {
                newRev = { ...newRev, ...apiRes.data };
                if (this.isVerifiedCustomer(newRev.phone, newRev.name)) {
                    newRev.verified = true;
                }
                this.isBackendOnline = true;
            }
        } catch (e) {
            console.warn('Backend review sync warning:', e);
        }

        // Add or update in local cache (deduplicating by ID or identical content signature)
        const existingIdx = this.data.reviews.findIndex(r => 
            (r.id === newRev.id) || 
            (String(r.name).trim().toLowerCase() === newRev.name.toLowerCase() &&
             String(r.comment).trim().toLowerCase() === newRev.comment.toLowerCase() &&
             r.date === newRev.date)
        );

        if (existingIdx !== -1) {
            this.data.reviews[existingIdx] = newRev;
        } else {
            this.data.reviews.unshift(newRev);
        }

        this.save();
        this.broadcastReviewsChanged();

        return { success: true, review: newRev };
    }

    deleteReview(reviewId) {
        if (!Array.isArray(this.data.reviews)) {
            return { success: false, message: 'No reviews found.' };
        }
        const initialCount = this.data.reviews.length;
        this.data.reviews = this.data.reviews.filter(r => r.id !== reviewId);
        if (this.data.reviews.length === initialCount) {
            return { success: false, message: 'Review not found.' };
        }
        this.save();
        this.broadcastReviewsChanged();

        if (this.isBackendOnline) {
            this.apiRequest(`/reviews/${reviewId}`, { method: 'DELETE' })
                .catch(e => console.warn('Review delete sync error:', e));
        }

        return { success: true, message: 'Review deleted successfully.' };
    }

    isVerifiedCustomer(phone, name) {
        if (!phone) return false;
        const cleanPhone = String(phone).replace(/\D/g, '');
        if (cleanPhone.length < 7) return false;
        return true;
    }

    broadcastReviewsChanged() {
        try {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('tira-reviews-changed', { detail: this.data.reviews }));
            }
        } catch (e) {}
    }
}

// Global utilities & singleton instance
if (typeof window !== 'undefined') {
    window.escapeHtml = escapeHtml;
    window.hashCredential = hashCredential;
    window.TiraDB = new TiraBelleDB();
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TiraBelleDB,
        DEFAULT_SETTINGS,
        DEFAULT_PRODUCTS,
        DEFAULT_REVIEWS,
        escapeHtml,
        hashCredential
    };
}
