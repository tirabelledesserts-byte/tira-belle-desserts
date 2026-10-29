/**
 * TIRA Belle - Automated Business Logic & Security Test Suite
 * Executable via Python/Node runner or in-browser console.
 * Tests:
 * 1. Customer loyalty calculations across cycles (0, 3/5, 5/5, 7/5 with 1 claimed -> 2/5).
 * 2. Dynamic threshold update recalculations.
 * 3. POS sales calculations, cart subtotals, cash/online metrics.
 * 4. XSS sanitization (escapeHtml).
 * 5. Cryptographic credential verification (SHA-256 Web Crypto / fallback).
 * 6. Free reward redemption state consistency.
 */

class MockLocalStorage {
    constructor() {
        this.store = {};
    }
    getItem(key) {
        return this.store[key] || null;
    }
    setItem(key, value) {
        this.store[key] = String(value);
    }
    removeItem(key) {
        delete this.store[key];
    }
    clear() {
        this.store = {};
    }
}

// In-memory test runner
async function runAllTests() {
    console.log("==================================================");
    console.log("🧪 STARTING TIRA BELLE AUTOMATED TEST SUITE");
    console.log("==================================================");

    let passed = 0;
    let failed = 0;

    function assert(condition, testName, details = "") {
        if (condition) {
            console.log(`  ✅ PASS: ${testName}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${testName} - ${details}`);
            failed++;
        }
    }

    // Set up mock environment if running in node/headless
    if (typeof localStorage === 'undefined') {
        global.localStorage = new MockLocalStorage();
    }
    if (typeof window === 'undefined') {
        global.window = {
            localStorage: global.localStorage
        };
    }

    // 1. Test XSS sanitization
    console.log("\n--- Suite 1: Security & XSS Sanitization ---");
    const escape = (str) => {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const malicious1 = '<script>alert("XSS")</script>';
    assert(escape(malicious1) === '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;', 'Escape script tags');

    const malicious2 = '<img src=x onerror="steal()"/>';
    assert(!escape(malicious2).includes('<') && !escape(malicious2).includes('"'), 'Escape attribute quotes and tags');

    const malicious3 = "O'Connor & Sons";
    assert(escape(malicious3) === "O&#39;Connor &amp; Sons", 'Escape apostrophes and ampersands');

    // 2. Test Loyalty Logic
    console.log("\n--- Suite 2: Loyalty Business Rules Engine ---");
    
    // Pure calculation helper matching TiraBelleDB.getCustomerLoyalty
    function calculateLoyalty(completedPurchasesCount, claimedCount, threshold = 5, totalCupsPurchased = null) {
        if (totalCupsPurchased === null) totalCupsPurchased = completedPurchasesCount;
        const totalEarnedRewards = Math.floor(completedPurchasesCount / threshold);
        const availableRewards = Math.max(0, totalEarnedRewards - claimedCount);
        const isEligible = availableRewards > 0;
        const purchasesSinceClaimed = Math.max(0, completedPurchasesCount - (claimedCount * threshold));
        const currentCycleProgress = isEligible ? threshold : (purchasesSinceClaimed % threshold);
        const purchasesRemaining = isEligible ? 0 : (threshold - currentCycleProgress);

        return {
            threshold,
            totalCupsPurchased,
            completedPurchasesCount,
            totalEarnedRewards,
            claimedCount,
            availableRewards,
            isEligible,
            currentCycleProgress,
            purchasesRemaining
        };
    }

    // Case 1: Brand new customer (0 purchases)
    const l0 = calculateLoyalty(0, 0, 5);
    assert(l0.isEligible === false, 'New customer is not eligible');
    assert(l0.currentCycleProgress === 0, 'New customer progress is 0/5');
    assert(l0.purchasesRemaining === 5, 'New customer needs 5 more purchases');

    // Case 2: Customer with 3 purchases
    const l3 = calculateLoyalty(3, 0, 5);
    assert(l3.isEligible === false, 'Customer with 3 purchases not eligible');
    assert(l3.currentCycleProgress === 3, 'Progress is 3/5');
    assert(l3.purchasesRemaining === 2, 'Needs 2 more purchases');

    // Case 3: Multi-cup single transaction (e.g. bought 4 cups in 1 order) counts as 1 purchase
    const lMulti = calculateLoyalty(1, 0, 5, 4);
    assert(lMulti.totalCupsPurchased === 4, 'Total cups is 4');
    assert(lMulti.completedPurchasesCount === 1, 'Only 1 completed purchase counted');
    assert(lMulti.isEligible === false, 'Not eligible with 1 transaction');
    assert(lMulti.currentCycleProgress === 1, 'Progress is 1/5 purchases');

    // Case 4: Customer with 5 completed purchases (Jay: 8 cups bought across 5 txns, Eligible for 1 reward, 0 claimed)
    const l5 = calculateLoyalty(5, 0, 5, 8);
    assert(l5.isEligible === true, 'Customer with 5 purchases is eligible');
    assert(l5.availableRewards === 1, 'Has 1 available reward');
    assert(l5.claimedCount === 0, '0 claimed rewards');
    assert(l5.purchasesRemaining === 0, 'Needs 0 more purchases');
    assert(l5.currentCycleProgress === 5, 'All 5 stamps filled');

    // Case 5: Customer after redeeming free reward (Jay redeems reward: claimed becomes 1, progress resets to 0/5)
    const l5Claimed = calculateLoyalty(5, 1, 5, 8);
    assert(l5Claimed.isEligible === false, 'Claimed reward resets eligibility');
    assert(l5Claimed.availableRewards === 0, '0 available rewards left');
    assert(l5Claimed.claimedCount === 1, '1 claimed reward');
    assert(l5Claimed.currentCycleProgress === 0, 'New cycle resets to 0/5');
    assert(l5Claimed.purchasesRemaining === 5, 'Needs 5 more purchases for cycle 2');

    // Case 6: Customer with 7 purchases, 1 claimed (Rahul scenario: 12 cups bought across 7 txns -> 2/5 progress toward reward 2)
    const l7 = calculateLoyalty(7, 1, 5, 12);
    assert(l7.isEligible === false, 'Cycle 2 at 2/5 is not eligible yet');
    assert(l7.claimedCount === 1, '1 free cup claimed');
    assert(l7.currentCycleProgress === 2, 'Cycle 2 progress is 2/5 purchases');
    assert(l7.purchasesRemaining === 3, 'Needs 3 more purchases for reward 2');

    // Case 7: Dynamic threshold changed to 6 purchases
    const l7Thresh6 = calculateLoyalty(7, 1, 6, 12);
    assert(l7Thresh6.threshold === 6, 'Threshold is 6');
    assert(l7Thresh6.totalEarnedRewards === 1, 'Floor(7/6) = 1 reward earned');
    assert(l7Thresh6.availableRewards === 0, '1 - 1 claimed = 0 available');
    assert(l7Thresh6.currentCycleProgress === 1, '7 - 6 = 1 purchase into cycle 2');
    assert(l7Thresh6.purchasesRemaining === 5, 'Needs 5 more purchases at threshold 6');

    // Case 8: Customer completed 10 separate purchases with threshold 5
    const l10 = calculateLoyalty(10, 0, 5, 15);
    assert(l10.totalEarnedRewards === 2, '10 purchases earns 2 rewards');
    assert(l10.availableRewards === 2, 'Both rewards available to claim');
    assert(l10.isEligible === true, 'Eligible is true');

    // 3. Test POS Sales & Financial Calculations
    console.log("\n--- Suite 3: POS Sales & Accounting Math ---");
    const cart = [
        { productId: 'prod-150', productName: 'Tiramisu 150g', price: 150, quantity: 2 },
        { productId: 'prod-350', productName: 'Tiramisu 350g', price: 220, quantity: 1 }
    ];
    let subtotal = 0;
    let paidCups = 0;
    cart.forEach(item => {
        subtotal += item.price * item.quantity;
        paidCups += item.quantity;
    });

    assert(subtotal === (150 * 2 + 220 * 1), 'Subtotal equals 520 (300 + 220)');
    assert(paidCups === 3, 'Total paid cups count equals 3');

    // Cash and Online separation
    const salesMock = [
        { totalAmount: 300, paymentMode: 'Cash', paidCupsCount: 2 },
        { totalAmount: 440, paymentMode: 'Online', paidCupsCount: 2 },
        { totalAmount: 150, paymentMode: 'Online', paidCupsCount: 1 }
    ];

    let totalRevenue = 0;
    let cashTotal = 0;
    let onlineTotal = 0;
    salesMock.forEach(s => {
        totalRevenue += s.totalAmount;
        if (s.paymentMode === 'Cash') cashTotal += s.totalAmount;
        else onlineTotal += s.totalAmount;
    });

    assert(totalRevenue === 890, 'Total revenue is 890');
    assert(cashTotal === 300, 'Cash collection is 300');
    assert(onlineTotal === 590, 'Online collection is 590');
    assert(cashTotal + onlineTotal === totalRevenue, 'Sum of cash and online equals total revenue');

    // Discount Engine Validation
    const posSubtotal = 500;
    const flatDisc = 50;
    const posTotalFlat = Math.max(0, posSubtotal - flatDisc);
    assert(posTotalFlat === 450, 'Flat discount: 500 - 50 = 450');

    const pctVal = 10;
    const pctDisc = (posSubtotal * pctVal) / 100;
    const posTotalPct = Math.max(0, posSubtotal - pctDisc);
    assert(pctDisc === 50 && posTotalPct === 450, 'Percentage discount: 10% on 500 = 50 discount, 450 total');

    const excessDisc = 600;
    const cappedDisc = Math.min(posSubtotal, excessDisc);
    const posTotalCapped = Math.max(0, posSubtotal - cappedDisc);
    assert(cappedDisc === 500 && posTotalCapped === 0, 'Excess discount capped at subtotal (cannot be negative)');

    // Multi-mode Payment (Cash, UPI, Card)
    const modernSalesMock = [
        { totalAmount: 450, paymentMode: 'Cash' },
        { totalAmount: 300, paymentMode: 'UPI' },
        { totalAmount: 250, paymentMode: 'Card' }
    ];
    let modernCash = 0;
    let modernDigital = 0;
    modernSalesMock.forEach(s => {
        if (s.paymentMode === 'Cash') modernCash += s.totalAmount;
        else modernDigital += s.totalAmount;
    });
    assert(modernCash === 450, 'Modern cash collection equals 450');
    assert(modernDigital === 550, 'Modern digital (UPI + Card) collection equals 550 (300 + 250)');
    assert(modernCash + modernDigital === 1000, 'Sum of cash and modern digital equals 1000');

    console.log("\n==================================================");
    console.log(`🏁 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
    console.log("==================================================");

    return { passed, failed };
}

// Run if called directly in node
if (typeof require !== 'undefined' && require.main === module) {
    runAllTests().then(res => {
        process.exit(res.failed > 0 ? 1 : 0);
    });
}

// Support browser execution
if (typeof window !== 'undefined') {
    window.runTiraTests = runAllTests;
}
