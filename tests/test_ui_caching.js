/**
 * Test Suite for Intelligent Caching, Skeletons, Optimistic Rollbacks, and Tooltips
 */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

// Mock browser environment for headless Node.js testing
global.window = {
    innerWidth: 1200,
    innerHeight: 800,
    addEventListener: () => {},
    dispatchEvent: () => {},
    CustomEvent: function(name, opts) { this.name = name; this.opts = opts; }
};
global.document = {
    readyState: 'complete',
    addEventListener: () => {},
    createElement: (tag) => ({
        tagName: tag.toUpperCase(),
        className: '',
        setAttribute: function(k, v) { this[k] = v; },
        getAttribute: function(k) { return this[k]; },
        removeAttribute: function(k) { delete this[k]; },
        hasAttribute: function(k) { return k in this; },
        classList: {
            add: function(c) { this.classes.add(c); },
            remove: function(c) { this.classes.delete(c); },
            classes: new Set()
        },
        style: {},
        innerHTML: '',
        textContent: ''
    }),
    body: {
        appendChild: () => {}
    }
};

console.log('==================================================');
console.log('🧪 TESTING INTELLIGENT CACHING & OPTIMISTIC ENGINE');
console.log('==================================================');

// Run db.js code up to class TiraBelleDB in global context
const dbCode = fs.readFileSync('js/db.js', 'utf8');
const cacheManagerCode = dbCode.slice(dbCode.indexOf('class TiraCacheManager'), dbCode.indexOf('class TiraBelleDB'));
vm.runInThisContext(cacheManagerCode);

let passed = 0;
function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(e);
        process.exit(1);
    }
}

// 1. TiraCacheManager Tests
const cache = new TiraCacheManager();

test('Cache set and immediate get (fresh data)', () => {
    cache.set('/sales/metrics?filter_date=today', { totalRevenue: 1500 });
    const cached = cache.get('/sales/metrics?filter_date=today');
    assert(cached !== null, 'Cache entry should exist');
    assert.strictEqual(cached.data.totalRevenue, 1500);
    assert.strictEqual(cached.isStale, false);
});

test('Cache pattern invalidation', () => {
    cache.set('/sales/metrics?filter_date=today', { totalRevenue: 1500 });
    cache.set('/sales/metrics?filter_date=yesterday', { totalRevenue: 800 });
    cache.set('/products', [{ id: 'p1', name: 'Tiramisu' }]);

    cache.invalidate('/sales');
    assert.strictEqual(cache.get('/sales/metrics?filter_date=today'), null, 'Sales metrics today should be cleared');
    assert.strictEqual(cache.get('/sales/metrics?filter_date=yesterday'), null, 'Sales metrics yesterday should be cleared');
    assert.notStrictEqual(cache.get('/products'), null, 'Products cache should remain intact');
});

test('Cache Stale-While-Revalidate (SWR) detection', () => {
    cache.set('/test/swr', { count: 42 });
    // Manually age the cache entry beyond fresh TTL (45s) but within stale TTL (120s)
    const entry = cache.cache.get('/test/swr');
    entry.timestamp = Date.now() - 50000; // 50 seconds old

    const res = cache.get('/test/swr');
    assert(res !== null, 'Stale entry should still return data');
    assert.strictEqual(res.isStale, true, 'isStale flag must be true');
    assert.strictEqual(res.data.count, 42);
});

test('Cache full expiration (eviction after stale TTL)', () => {
    cache.set('/test/expired', { count: 99 });
    const entry = cache.cache.get('/test/expired');
    entry.timestamp = Date.now() - 200000; // 200 seconds old (beyond 120s staleTtl)

    const res = cache.get('/test/expired');
    assert.strictEqual(res, null, 'Expired entry must be evicted');
    assert.strictEqual(cache.cache.has('/test/expired'), false, 'Key must be deleted from Map');
});

// 2. Optimistic UI Rollback Logic Tests
test('Optimistic delete and rollback for products', () => {
    const mockDb = {
        data: {
            products: [
                { id: 'p1', name: 'Classic 150g' },
                { id: 'p2', name: 'Classic 350g' },
                { id: 'p3', name: 'Choco 150g' }
            ]
        },
        save: () => {},
        invalidateCache: () => {}
    };

    // Attach prototype methods
    mockDb.optimisticDeleteProduct = function(id) {
        const snapshot = this.data.products.find(p => p.id === id);
        if (!snapshot) return null;
        const index = this.data.products.findIndex(p => p.id === id);
        this.data.products = this.data.products.filter(p => p.id !== id);
        return { snapshot: JSON.parse(JSON.stringify(snapshot)), index };
    };

    mockDb.rollbackProduct = function(snapshot, index) {
        if (!snapshot) return;
        if (!this.data.products.some(p => p.id === snapshot.id)) {
            if (typeof index === 'number' && index >= 0 && index <= this.data.products.length) {
                this.data.products.splice(index, 0, snapshot);
            } else {
                this.data.products.push(snapshot);
            }
        }
    };

    // 1. Optimistic delete
    const result = mockDb.optimisticDeleteProduct('p2');
    assert.strictEqual(mockDb.data.products.length, 2, 'Product should be removed immediately');
    assert.strictEqual(mockDb.data.products.some(p => p.id === 'p2'), false);
    assert.strictEqual(result.index, 1, 'Original index was 1');

    // 2. Rollback
    mockDb.rollbackProduct(result.snapshot, result.index);
    assert.strictEqual(mockDb.data.products.length, 3, 'Product should be restored on rollback');
    assert.strictEqual(mockDb.data.products[1].id, 'p2', 'Product restored at exact original index');
    assert.strictEqual(mockDb.data.products[1].name, 'Classic 350g');
});

// 3. TiraUI Skeleton & Empty State Tests
const adminCode = fs.readFileSync('js/admin.js', 'utf8');
const tiraUiCode = adminCode.slice(adminCode.indexOf('window.TiraUI = {'), adminCode.indexOf('window.TiraTooltip ='));
vm.runInThisContext(tiraUiCode);

test('TiraUI.showTableSkeleton generates expected shimmer rows and columns', () => {
    const mockTbody = { innerHTML: '' };
    window.TiraUI.showTableSkeleton(mockTbody, 5, 3);
    assert(mockTbody.innerHTML.includes('skeleton-table-row'), 'Should contain skeleton-table-row');
    assert(mockTbody.innerHTML.includes('skeleton-shimmer'), 'Should contain skeleton-shimmer');
    const rowCount = (mockTbody.innerHTML.match(/<tr/g) || []).length;
    assert.strictEqual(rowCount, 3, 'Should generate exactly 3 rows');
    const cellCount = (mockTbody.innerHTML.match(/<td/g) || []).length;
    assert.strictEqual(cellCount, 15, 'Should generate exactly 15 cells (3 rows x 5 cols)');
});

test('TiraUI.renderTableEmptyState generates contextual empty message with action', () => {
    const mockTbody = { innerHTML: '' };
    window.TiraUI.renderTableEmptyState(mockTbody, 8, {
        icon: 'package-search',
        title: 'No products found',
        desc: 'Please add a product',
        actionText: 'Add Product',
        actionClick: 'openProductModal()'
    });
    assert(mockTbody.innerHTML.includes('No products found'));
    assert(mockTbody.innerHTML.includes('Please add a product'));
    assert(mockTbody.innerHTML.includes('Add Product'));
    assert(mockTbody.innerHTML.includes('openProductModal()'));
    assert(mockTbody.innerHTML.includes('colspan="8"'));
});

test('TiraUI.renderTableErrorState generates retry button with action', () => {
    const mockTbody = { innerHTML: '' };
    window.TiraUI.renderTableErrorState(mockTbody, 8, 'Network timeout', "loadDashboardMetrics('today')");
    assert(mockTbody.innerHTML.includes('Unable to load data'));
    assert(mockTbody.innerHTML.includes('Network timeout'));
    assert(mockTbody.innerHTML.includes('Retry'));
    assert(mockTbody.innerHTML.includes("loadDashboardMetrics('today')"));
});

console.log('==================================================');
console.log(`🏁 UI & CACHING TESTS: ${passed} PASSED | 0 FAILED`);
console.log('==================================================');
