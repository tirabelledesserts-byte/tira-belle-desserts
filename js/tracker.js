/**
 * TIRA Belle - Customer Offer Tracker Logic
 * Handles customer search by phone/name, stamp card rendering, privacy masking, and claim history.
 */

document.addEventListener('DOMContentLoaded', () => {
    if (window.TiraDB) {
        window.TiraDB.applyGlobalBranding();
    }
    updateTrackerRuleText();
    initScrollToTop();
    initScrollProgressBar();

    // Mobile input quick clear handler
    const trackerInput = document.getElementById('trackerInput');
    const clearInputBtn = document.getElementById('btnTrackerClearInput');
    if (trackerInput && clearInputBtn) {
        trackerInput.addEventListener('input', () => {
            clearInputBtn.style.display = trackerInput.value.trim().length > 0 ? 'inline-flex' : 'none';
        });
        clearInputBtn.addEventListener('click', () => {
            trackerInput.value = '';
            clearInputBtn.style.display = 'none';
            trackerInput.focus();
        });
    }
});

let lastTrackedPhone = null;

function refreshTrackerLoyalty() {
    if (window.TiraDB) {
        window.TiraDB.applyGlobalBranding();
    }
    updateTrackerRuleText();
    if (lastTrackedPhone && window.TiraDB) {
        const loyalty = window.TiraDB.getCustomerLoyalty(lastTrackedPhone);
        if (loyalty) renderLoyaltyResult(loyalty);
    }
}

window.addEventListener('tira-settings-changed', refreshTrackerLoyalty);
window.addEventListener('tira-sales-changed', refreshTrackerLoyalty);
window.addEventListener('tira-backend-synced', refreshTrackerLoyalty);

function updateTrackerRuleText() {
    if (!window.TiraDB) return;
    const settings = window.TiraDB.getSettings();
    const threshold = parseInt(settings.loyaltyThreshold, 10) || 5;
    const rewardItem = settings.rewardItemName || '1 Free 150g Tiramisu';
    const threshEl = document.getElementById('trackerRuleThreshold');
    const rewardEl = document.getElementById('trackerRuleReward');
    if (threshEl) threshEl.textContent = threshold;
    if (rewardEl) rewardEl.textContent = rewardItem;
}

// Helper to mask phone number for customer privacy (e.g. 9876543210 -> 98765 •••• 10)
function maskPhone(phone) {
    if (!phone) return '';
    const clean = phone.replace(/\D/g, '');
    if (clean.length < 6) return clean;
    const start = clean.substring(0, 5);
    const end = clean.substring(clean.length - 2);
    return `${start} •••• ${end}`;
}

// Show Toast notification
function showToast(message, type = 'info', title = null) {
    if (window.TiraAlert && typeof window.TiraAlert.toast === 'function') {
        return window.TiraAlert.toast({ message, type, title });
    }
    if (typeof window.showToast === 'function' && window.showToast !== showToast) {
        return window.showToast(message, type, title);
    }
}

// Main search loyalty function
window.searchLoyalty = async function(specifiedPhone = null) {
    const input = document.getElementById('trackerInput');
    const query = specifiedPhone || (input ? input.value.trim() : '');

    const ambiguousContainer = document.getElementById('ambiguousCustomersList');
    const ambiguousCards = document.getElementById('ambiguousCardsContainer');
    const notFoundBox = document.getElementById('trackerNotFound');
    const resultPanel = document.getElementById('trackerResultPanel');

    const skeleton = document.getElementById('trackerLoadingSkeleton');

    // Reset visibility
    if (ambiguousContainer) ambiguousContainer.style.display = 'none';
    if (notFoundBox) notFoundBox.style.display = 'none';
    if (resultPanel) resultPanel.classList.remove('active');
    if (skeleton) skeleton.style.display = 'block';

    if (!query) {
        if (skeleton) skeleton.style.display = 'none';
        showToast('Please enter a phone number or name to track your offer.', 'warning');
        return;
    }

    const cleanDigits = query.replace(/\D/g, '');
    let matchedPhone = null;
    let loyalty = null;

    if (specifiedPhone) {
        matchedPhone = specifiedPhone.replace(/\D/g, '');
    } else if (cleanDigits.length >= 10) {
        // Direct phone lookup (Read-only check - NEVER auto-register!)
        if (window.TiraDB) {
            // Check server directly for live loyalty
            const remoteLoyalty = await window.TiraDB.apiRequest(`/customers/${cleanDigits}`);
            if (remoteLoyalty.ok && remoteLoyalty.data && remoteLoyalty.data.customer) {
                matchedPhone = cleanDigits;
                loyalty = remoteLoyalty.data;
            }
        }
        if (!matchedPhone && window.TiraDB) {
            const localCust = window.TiraDB.findCustomerByPhone(cleanDigits);
            if (localCust) {
                matchedPhone = localCust.phone;
            }
        }
    } else {
        // Search by name or partial phone
        let matches = [];
        // 1. Search remote backend if available
        if (window.TiraDB) {
            const remoteSearch = await window.TiraDB.apiRequest(`/customers?search=${encodeURIComponent(query.trim())}`);
            if (remoteSearch.ok && Array.isArray(remoteSearch.data) && remoteSearch.data.length > 0) {
                matches = remoteSearch.data;
            }
        }
        // 2. Fall back to local search if remote returned nothing
        if (matches.length === 0 && window.TiraDB) {
            matches = window.TiraDB.searchCustomer(query.trim());
        }

        if (matches.length === 1) {
            matchedPhone = matches[0].phone;
        } else if (matches.length > 1) {
            // Multiple customers found with this name -> Show prompt to select phone
            if (ambiguousContainer && ambiguousCards) {
                ambiguousCards.innerHTML = '';
                matches.forEach(c => {
                    const cLoyalty = window.TiraDB ? window.TiraDB.getCustomerLoyalty(c.phone) : null;
                    const safeName = typeof escapeHtml === 'function' ? escapeHtml(c.name) : c.name;
                    const safePhone = typeof escapeHtml === 'function' ? escapeHtml(maskPhone(c.phone)) : maskPhone(c.phone);
                    const btn = document.createElement('div');
                    btn.className = 'history-item';
                    btn.style.cursor = 'pointer';
                    btn.style.border = '1px solid var(--color-border)';
                    const isElig = cLoyalty ? cLoyalty.isEligible : false;
                    const prog = cLoyalty ? `${cLoyalty.currentCycleProgress}/${cLoyalty.threshold} Cups` : 'Registered';
                    btn.innerHTML = `
                        <div>
                            <strong>${safeName}</strong> • 
                            <span style="color: var(--color-text-muted); font-size: 0.85rem;">${safePhone}</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="badge ${isElig ? 'badge-success' : 'badge-warning'}">
                                ${isElig ? 'Eligible for Free Reward' : prog}
                            </span>
                            <span class="btn btn-sm btn-outline">Select</span>
                        </div>
                    `;
                    btn.onclick = () => window.searchLoyalty(c.phone);
                    ambiguousCards.appendChild(btn);
                });
                if (skeleton) skeleton.style.display = 'none';
                ambiguousContainer.style.display = 'block';
                return;
            }
        }
    }

    if (!matchedPhone) {
        if (skeleton) skeleton.style.display = 'none';
        if (notFoundBox) notFoundBox.style.display = 'block';
        if (resultPanel) resultPanel.classList.remove('active');
        return;
    }

    // Retrieve full loyalty details if not already fetched
    if (!loyalty) {
        if (window.TiraDB) {
            const remoteRes = await window.TiraDB.apiRequest(`/customers/${matchedPhone}`);
            if (remoteRes.ok && remoteRes.data) {
                loyalty = remoteRes.data;
            }
        }
        if (!loyalty && window.TiraDB) {
            const localLoyalty = window.TiraDB.getCustomerLoyalty(matchedPhone);
            if (localLoyalty && localLoyalty.exists) {
                loyalty = localLoyalty;
            }
        }
    }

    // Ensure customer genuinely exists in the system
    const customerExists = loyalty && (
        (loyalty.exists) ||
        (loyalty.customer && loyalty.customer.createdAt) ||
        (loyalty.totalCupsPurchased > 0) ||
        (loyalty.completedPurchasesCount > 0) ||
        (window.TiraDB && window.TiraDB.findCustomerByPhone(matchedPhone))
    );

    if (skeleton) skeleton.style.display = 'none';

    if (!customerExists) {
        if (notFoundBox) notFoundBox.style.display = 'block';
        if (resultPanel) resultPanel.classList.remove('active');
        return;
    }

    renderLoyaltyResult(loyalty);
};

// Render the detailed result panel
function renderLoyaltyResult(loyalty) {
    const skeleton = document.getElementById('trackerLoadingSkeleton');
    if (skeleton) skeleton.style.display = 'none';
    const resultPanel = document.getElementById('trackerResultPanel');
    if (!resultPanel) return;
    lastTrackedPhone = loyalty.customer.phone;

    // Header info
    const safeCustomerName = typeof escapeHtml === 'function' ? escapeHtml(loyalty.customer.name || 'Valued Guest') : (loyalty.customer.name || 'Valued Guest');
    document.getElementById('resCustomerName').textContent = safeCustomerName;
    document.getElementById('resCustomerPhone').innerHTML = `<i data-lucide="phone" data-size="14"></i> <span>${maskPhone(loyalty.customer.phone)}</span>`;

    // Status Banner
    const banner = document.getElementById('resStatusBanner');
    const icon = document.getElementById('resStatusIcon');
    const title = document.getElementById('resStatusTitle');
    const desc = document.getElementById('resStatusDesc');

    const settings = window.TiraDB ? window.TiraDB.getSettings() : {};
    const rewardItem = settings.rewardItemName || '1 Free 150g Tiramisu';
    const safeRewardItem = typeof escapeHtml === 'function' ? escapeHtml(rewardItem) : rewardItem;

    if (loyalty.isEligible) {
        banner.className = 'loyalty-status-banner status-eligible';
        icon.innerHTML = `<i data-lucide="award" data-size="32"></i>`;
        title.innerHTML = `🎉 Congratulations! You've Earned ${safeRewardItem}!`;
        desc.innerHTML = `You have purchased all <strong>${loyalty.threshold} eligible cups</strong>. Visit the TIRA Belle counter anytime to claim your handcrafted free dessert!<br><button type="button" class="btn btn-sm celebration-party-btn" onclick="window.triggerRewardParty(event)" style="margin-top: 10px; background: #27ae60; color: #fff; border: none; font-weight: 700; border-radius: var(--radius-pill); padding: 6px 16px; cursor: pointer; box-shadow: 0 4px 14px rgba(39, 174, 96, 0.35); display: inline-flex; align-items: center; gap: 6px;"><span>🎉 Celebrate &amp; Replay Party</span></button>`;
        setTimeout(() => {
            if (typeof window.launchRewardCelebration === 'function') {
                window.launchRewardCelebration();
            }
        }, 350);
    } else {
        banner.className = 'loyalty-status-banner status-in-progress';
        icon.innerHTML = `<i data-lucide="coffee" data-size="32"></i>`;
        const remaining = loyalty.cupsRemaining !== undefined ? loyalty.cupsRemaining : loyalty.purchasesRemaining;
        title.textContent = `${remaining} More Cup${remaining > 1 ? 's' : ''} To Go!`;
        desc.innerHTML = `You have purchased <strong>${loyalty.currentCycleProgress} out of ${loyalty.threshold}</strong> eligible cups in this cycle. Buy ${remaining} more to claim your free reward!`;
    }

    // Stamp Fraction text & Progress Bar
    const fraction = document.getElementById('resStampFraction');
    const progressBar = document.getElementById('resTrackerProgressBar');
    const thresholdVal = Math.max(1, loyalty.threshold || 5);
    const progressVal = Math.min(thresholdVal, loyalty.currentCycleProgress || 0);
    const progressPct = loyalty.isEligible ? 100 : Math.round((progressVal / thresholdVal) * 100);

    if (progressBar) {
        progressBar.style.width = `${progressPct}%`;
        if (loyalty.isEligible) {
            progressBar.classList.add('completed');
        } else {
            progressBar.classList.remove('completed');
        }
    }

    if (fraction) {
        if (loyalty.isEligible) {
            fraction.textContent = `${loyalty.threshold} / ${loyalty.threshold} Cups • READY!`;
            fraction.style.color = '#27ae60';
        } else {
            fraction.textContent = `${loyalty.currentCycleProgress} / ${loyalty.threshold} Cups`;
            fraction.style.color = 'var(--color-caramel)';
        }
    }

    // Render Stamps Grid: [threshold] Paid Slots + 1 Separate Reward Slot
    const stampsGrid = document.getElementById('resStampsGrid');
    if (stampsGrid) {
        stampsGrid.innerHTML = '';
        const threshold = Math.max(1, loyalty.threshold || 5);
        const currentStamps = loyalty.currentCycleProgress;
        const totalSlots = threshold + 1;
        const gridCols = totalSlots <= 7 ? totalSlots : Math.ceil(totalSlots / 2);
        stampsGrid.style.setProperty('--stamp-cols', gridCols);

        // Paid Stamp Slots: 1 to threshold
        for (let i = 1; i <= threshold; i++) {
            const isStamped = i <= currentStamps;
            const isNextTarget = !loyalty.isEligible && (i === currentStamps + 1);
            const box = document.createElement('div');
            box.className = `stamp-box-large ${isStamped ? 'filled' : ''} ${isNextTarget ? 'next-target-pulse' : ''}`;
            
            box.innerHTML = `
                <div class="loyalty-cup-container">
                    <img src="assets/cup-empty.png" 
                         alt="Cup #${i} Empty" 
                         class="cup-img cup-empty" 
                         width="110" height="110" 
                         loading="eager" draggable="false">
                    <img src="assets/cup-filled.png" 
                         alt="Cup #${i} Filled" 
                         class="cup-img cup-filled" 
                         width="110" height="110" 
                         loading="eager" draggable="false">
                </div>
                <div class="stamp-num-badge">${isNextTarget ? 'Next Cup!' : `Cup #${i}`}</div>
            `;
            stampsGrid.appendChild(box);
        }

        // Separate Reward Slot (distinct reward slot)
        const isRewardUnlocked = !!loyalty.isEligible;
        const rewardBox = document.createElement('div');
        rewardBox.className = `stamp-box-large reward-slot ${isRewardUnlocked ? 'filled-reward' : ''}`;
        rewardBox.innerHTML = `
            <div class="loyalty-cup-container">
                <img src="assets/cup-empty.png" 
                     alt="Free Reward Cup Empty" 
                     class="cup-img cup-empty" 
                     width="110" height="110" 
                     loading="eager" draggable="false">
                <img src="assets/cup-filled.png" 
                     alt="Free Reward Cup Filled" 
                     class="cup-img cup-filled" 
                     width="110" height="110" 
                     loading="eager" draggable="false">
                <div class="cup-reward-badge" ${isRewardUnlocked ? 'style="background: #27ae60;"' : ''}>${isRewardUnlocked ? 'FREE' : 'GIFT'}</div>
            </div>
            <div class="stamp-num-badge" ${isRewardUnlocked ? 'style="color: #27ae60; font-weight: 800;"' : 'style="color: #27ae60; font-weight: 700;"'}>FREE CUP</div>
        `;
        stampsGrid.appendChild(rewardBox);
    }

    // Numbers & Stats
    document.getElementById('resTotalCups').textContent = loyalty.totalCupsPurchased;
    const purchasesElem = document.getElementById('resPurchasesMade');
    if (purchasesElem) purchasesElem.textContent = loyalty.completedPurchasesCount;
    document.getElementById('resRemainingCups').textContent = loyalty.purchasesRemaining;
    document.getElementById('resClaimedRewards').textContent = loyalty.claimedCount;

    // Render Previous In-Store Visits & Purchases
    const purchasesSection = document.getElementById('resPurchasesSection');
    const purchasesList = document.getElementById('resPurchasesList');
    const currency = settings.currency || '₹';

    if (purchasesSection && purchasesList) {
        if (loyalty.salesHistory && loyalty.salesHistory.length > 0) {
            purchasesSection.style.display = 'block';
            purchasesList.innerHTML = '';
            loyalty.salesHistory.forEach(s => {
                const item = document.createElement('div');
                item.className = 'history-item history-purchase-item';
                let dateDisplay = '';
                try {
                    const d = s.timestamp ? new Date(s.timestamp) : (s.date ? new Date(s.date) : null);
                    dateDisplay = d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : (s.date || '');
                } catch(e) {
                    dateDisplay = s.date || '';
                }

                const itemsSummary = (s.items && s.items.length > 0)
                    ? s.items.map(it => `${it.quantity}x ${it.productName}${it.isReward ? ' (FREE Reward)' : ''}`).join(', ')
                    : `${s.paidCupsCount || 0} Cups`;

                item.innerHTML = `
                    <div class="history-item-left">
                        <div class="history-item-title">
                            <span class="history-date-chip"><i data-lucide="calendar" data-size="12"></i> ${dateDisplay}</span>
                            <span class="history-pay-badge badge-${(s.paymentMode || 'cash').toLowerCase()}">${escapeHtml(s.paymentMode || 'Cash')}</span>
                        </div>
                        <div class="history-item-summary">${escapeHtml(itemsSummary)}</div>
                    </div>
                    <div class="history-item-right">
                        <div class="history-amount">${currency}${Number(s.totalAmount || 0).toLocaleString('en-IN')}</div>
                        <div class="history-stamps-earned">+${s.paidCupsCount || 0} Stamp${(s.paidCupsCount || 0) === 1 ? '' : 's'}</div>
                    </div>
                `;
                purchasesList.appendChild(item);
            });
        } else {
            purchasesSection.style.display = 'none';
        }
    }

    // Previous Redemptions History
    const redemptionsSection = document.getElementById('resRedemptionSection');
    const redemptionsList = document.getElementById('resRedemptionsList');

    if (loyalty.redemptions && loyalty.redemptions.length > 0) {
        redemptionsSection.style.display = 'block';
        redemptionsList.innerHTML = '';
        loyalty.redemptions.forEach(r => {
            const item = document.createElement('div');
            item.className = 'history-item';
            const dateStr = new Date(r.redeemedAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
            const safeRdmItem = typeof escapeHtml === 'function' ? escapeHtml(r.rewardItem) : r.rewardItem;
            const safeRdmNotes = typeof escapeHtml === 'function' ? escapeHtml(r.notes || 'Redeemed over counter') : (r.notes || 'Redeemed over counter');
            item.innerHTML = `
                <div>
                    <strong>${safeRdmItem}</strong>
                    <div style="font-size: 0.78rem; color: var(--color-text-muted);">${safeRdmNotes}</div>
                </div>
                <div style="text-align: right;">
                    <span class="history-badge"><i data-lucide="check" data-size="12"></i> Claimed</span>
                    <div style="font-size: 0.75rem; color: var(--color-text-light); margin-top: 3px;">${dateStr}</div>
                </div>
            `;
            redemptionsList.appendChild(item);
        });
    } else {
        redemptionsSection.style.display = 'none';
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }

    // Show Result Panel smoothly
    resultPanel.classList.add('active');
    // Scroll smoothly to customer results with space for sticky navbar
    setTimeout(() => {
        resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
}

window.clearLoyaltyTracker = function() {
    lastTrackedPhone = null;
    const input = document.getElementById('trackerInput');
    const clearInputBtn = document.getElementById('btnTrackerClearInput');
    const resultPanel = document.getElementById('trackerResultPanel');
    const notFound = document.getElementById('trackerNotFound');
    const ambiguous = document.getElementById('ambiguousCustomersList');

    if (input) input.value = '';
    if (clearInputBtn) clearInputBtn.style.display = 'none';
    if (resultPanel) resultPanel.classList.remove('active');
    if (notFound) notFound.style.display = 'none';
    const skeleton = document.getElementById('trackerLoadingSkeleton');
    if (skeleton) skeleton.style.display = 'none';
    if (ambiguous) ambiguous.style.display = 'none';
    const progressBar = document.getElementById('resTrackerProgressBar');
    if (progressBar) {
        progressBar.style.width = '0%';
        progressBar.classList.remove('completed');
    }
    if (input) input.focus();
    showToast('Loyalty tracker cleared.', 'info');
};

// ==========================================================================
// Customer Review Submission Logic
// ==========================================================================
const RATING_LABELS = {
    1: '1 Slice • Needs Improvement',
    2: '2 Slices • Fair',
    3: '3 Slices • Good & Enjoyable',
    4: '4 Slices • Very Good!',
    5: '5 Slices • Exceptional!'
};

function initReviewForm() {
    const starRow = document.getElementById('starRatingRow');
    const ratingInput = document.getElementById('reviewRatingVal');
    const ratingText = document.getElementById('starRatingText');
    const commentEl = document.getElementById('reviewComment');
    const charCountEl = document.getElementById('reviewCharCount');

    if (starRow && ratingInput) {
        const starBtns = starRow.querySelectorAll('.star-pick-btn');
        starBtns.forEach(btn => {
            const val = parseInt(btn.getAttribute('data-val'), 10);

            btn.addEventListener('click', () => {
                ratingInput.value = val;
                updateStarDisplay(val);
                if (ratingText) {
                    ratingText.textContent = RATING_LABELS[val] || `${val} Slices`;
                    ratingText.classList.remove('unselected');
                    ratingText.style.color = 'var(--color-espresso)';
                }
            });

            btn.addEventListener('mouseenter', () => {
                highlightStarsUpTo(val);
            });
        });

        starRow.addEventListener('mouseleave', () => {
            const currentVal = parseInt(ratingInput.value, 10) || 0;
            updateStarDisplay(currentVal);
        });
    }

    if (commentEl && charCountEl) {
        commentEl.addEventListener('input', () => {
            charCountEl.textContent = `${commentEl.value.length} / 500`;
        });
    }

    const form = document.getElementById('customerReviewForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            window.submitCustomerReview();
        });
    }
}

function updateStarDisplay(rating) {
    const starRow = document.getElementById('starRatingRow');
    if (!starRow) return;
    const starBtns = starRow.querySelectorAll('.star-pick-btn');
    starBtns.forEach(btn => {
        btn.classList.remove('hover-active');
        const val = parseInt(btn.getAttribute('data-val'), 10);
        if (rating > 0 && val <= rating) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function highlightStarsUpTo(rating) {
    const starRow = document.getElementById('starRatingRow');
    if (!starRow) return;
    const starBtns = starRow.querySelectorAll('.star-pick-btn');
    starBtns.forEach(btn => {
        const val = parseInt(btn.getAttribute('data-val'), 10);
        if (val <= rating) {
            btn.classList.add('hover-active');
        } else {
            btn.classList.remove('hover-active');
        }
    });
}

// Reset all review form fields
window.resetCustomerReviewForm = function() {
    const form = document.getElementById('customerReviewForm');
    if (form) {
        form.reset();
    }
    const nameInput = document.getElementById('reviewName');
    if (nameInput) nameInput.value = '';

    const phoneInput = document.getElementById('reviewPhone');
    if (phoneInput) phoneInput.value = '';

    const ratingInput = document.getElementById('reviewRatingVal');
    if (ratingInput) ratingInput.value = '';

    updateStarDisplay(0);
    const ratingText = document.getElementById('starRatingText');
    if (ratingText) {
        ratingText.textContent = 'Select a rating';
        ratingText.classList.add('unselected');
        ratingText.style.color = 'var(--color-text-muted)';
    }

    const defaultFav = document.querySelector('input[name="reviewFavorite"][value="Classic – 150 g"]');
    if (defaultFav) defaultFav.checked = true;

    const commentInput = document.getElementById('reviewComment');
    if (commentInput) commentInput.value = '';

    const charCountEl = document.getElementById('reviewCharCount');
    if (charCountEl) charCountEl.textContent = '0 / 500';
};

let isSubmittingReview = false;

window.submitCustomerReview = async function() {
    if (isSubmittingReview) {
        return;
    }

    const nameInput = document.getElementById('reviewName');
    const phoneInput = document.getElementById('reviewPhone');
    const ratingInput = document.getElementById('reviewRatingVal');
    const commentInput = document.getElementById('reviewComment');
    const favRadio = document.querySelector('input[name="reviewFavorite"]:checked');
    const submitBtn = document.getElementById('btnSubmitReview');

    const name = nameInput ? nameInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const rating = ratingInput && ratingInput.value ? parseInt(ratingInput.value, 10) : 0;
    const comment = commentInput ? commentInput.value.trim() : '';
    const favoriteItem = favRadio ? favRadio.value : 'Classic – 150 g';

    if (!name) {
        showToast('Please enter your name.', 'warning');
        if (nameInput) nameInput.focus();
        return;
    }

    if (!rating || rating < 1 || rating > 5) {
        showToast('Please select a rating for your experience.', 'warning');
        const starRow = document.getElementById('starRatingRow');
        if (starRow) starRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    if (!comment) {
        showToast('Please write a short review about your experience.', 'warning');
        if (commentInput) commentInput.focus();
        return;
    }

    if (!window.TiraDB) {
        showToast('Database is not initialized. Please refresh the page.', 'error');
        return;
    }

    isSubmittingReview = true;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>Submitting...</span>`;
    }

    try {
        const res = await window.TiraDB.addReview({
            name: name,
            phone: phone,
            rating: rating,
            favoriteItem: favoriteItem,
            comment: comment
        });

        if (res && res.success) {
            // Completely reset the review form
            window.resetCustomerReviewForm();

            let redirected = false;
            const redirectToReviews = () => {
                if (!redirected) {
                    redirected = true;
                    window.location.href = 'index.html#reviews';
                }
            };

            // Fallback timer: automatically redirect after 3.5s if modal is left open
            const autoRedirectTimer = setTimeout(redirectToReviews, 3500);

            if (window.TiraAlert && typeof window.TiraAlert.alert === 'function') {
                try {
                    const safeName = typeof window.escapeHtml === 'function' ? window.escapeHtml(name) : (typeof escapeHtml === 'function' ? escapeHtml(name) : name);
                    await window.TiraAlert.alert({
                        title: 'Review Published with Love! ❤️',
                        message: `Thank you, <strong>${safeName}</strong>! Your review has been added and will appear on our homepage carousel immediately.`,
                        type: 'success',
                        buttonText: 'Awesome!'
                    });
                } catch (_) {}
                clearTimeout(autoRedirectTimer);
                redirectToReviews();
            } else {
                showToast('Thank you! Your review has been published to our homepage.', 'success', 'Review Submitted');
                setTimeout(redirectToReviews, 1500);
            }
        } else {
            showToast(res.message || 'Error submitting review.', 'error');
        }
    } catch (e) {
        console.error('Error submitting review:', e);
        showToast('An unexpected error occurred while saving your review.', 'error');
    } finally {
        isSubmittingReview = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i data-lucide="send" data-size="16"></i> <span>Submit Review</span>`;
            if (window.lucide) window.lucide.createIcons();
        }
    }
};

// Initialize review form and scroll-to-top when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initReviewForm();
});

/**
 * Floating "Scroll to Top" Controller
 * Appears dynamically when scrolling down past 280px, smoothly scrolls back to the top when clicked.
 */
function initScrollToTop() {
    const scrollBtn = document.getElementById('scrollToTopBtn');
    if (!scrollBtn) return;

    let ticking = false;

    const checkScroll = () => {
        if (window.scrollY > 280) {
            scrollBtn.classList.add('visible');
        } else {
            scrollBtn.classList.remove('visible');
        }
        ticking = false;
    };

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(checkScroll);
            ticking = true;
        }
    }, { passive: true });

    checkScroll();

    scrollBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

window.scrollToTop = function() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
};

/**
 * Scroll Reading Progress Bar Controller
 * Tracks how far the user has scrolled through the page and updates top progress indicator.
 */
function initScrollProgressBar() {
    const bar = document.getElementById('scrollProgressBar');
    if (!bar) return;

    let ticking = false;
    const updateProgress = () => {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
        bar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
        ticking = false;
    };

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(updateProgress);
            ticking = true;
        }
    }, { passive: true });

    updateProgress();
}

/**
 * 12 Click -> Success: TIRA Belle Artisan Reward Celebration FX
 * Spawns confetti particles in cocoa, caramel gold, mascarpone cream, and reward green.
 */
window.launchRewardCelebration = function(originX = null, originY = null) {
    // 1. Tactile haptic feedback
    if ('vibrate' in navigator) {
        try { navigator.vibrate([40, 60, 40, 60, 100]); } catch (_) {}
    }

    // 2. Confetti canvas overlay
    const canvas = document.createElement('canvas');
    canvas.className = 'celebration-confetti-canvas';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        canvas.remove();
        return;
    }

    const colors = ['#dfa264', '#b7793d', '#27ae60', '#5a3525', '#fcf8f3', '#f39c12'];
    const particles = [];
    const particleCount = 75;
    const startX = originX !== null ? originX : window.innerWidth / 2;
    const startY = originY !== null ? originY : window.innerHeight * 0.38;

    for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const velocity = 4 + Math.random() * 8;
        particles.push({
            x: startX,
            y: startY,
            vx: Math.cos(angle) * velocity,
            vy: Math.sin(angle) * velocity - 2.5,
            size: 4 + Math.random() * 6,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 12,
            opacity: 1,
            gravity: 0.22,
            drag: 0.96
        });
    }

    let animationFrame = null;
    const startTime = Date.now();
    const duration = 2800; // 2.8s total duration

    function renderParticles() {
        const elapsed = Date.now() - startTime;
        if (elapsed > duration) {
            cancelAnimationFrame(animationFrame);
            canvas.remove();
            return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles.forEach(p => {
            p.vx *= p.drag;
            p.vy *= p.drag;
            p.vy += p.gravity;
            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.rotationSpeed;
            p.opacity = Math.max(0, 1 - (elapsed / duration));

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.opacity;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
            ctx.restore();
        });

        animationFrame = requestAnimationFrame(renderParticles);
    }

    animationFrame = requestAnimationFrame(renderParticles);
};

window.triggerRewardParty = function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget ? e.currentTarget.getBoundingClientRect() : null;
        if (rect) {
            window.launchRewardCelebration(rect.left + rect.width / 2, rect.top + rect.height / 2);
            return;
        }
    }
    window.launchRewardCelebration();
};

