/**
 * TIRA Belle - Admin Panel Core Script
 * Comprehensive Sales Recording, POS Cart, Real-Time Analytics, Product Management, Loyalty Redemptions, and QR Standee
 */

// Global State
let currentCart = [];
let currentPaymentMode = 'Cash';
let activeSection = 'dashboard';
let isAuthenticated = false;

// ----------------- TOAST SYSTEM -----------------
function showToast(message, type = 'info', title = null) {
    if (window.TiraAlert && typeof window.TiraAlert.toast === 'function') {
        return window.TiraAlert.toast({ message, type, title });
    }
    if (typeof window.showToast === 'function' && window.showToast !== showToast) {
        return window.showToast(message, type, title);
    }
}

// ----------------- MOBILE SIDEBAR TOGGLE -----------------
window.toggleAdminSidebar = function() {
    const sidebar = document.getElementById('adminSidebar');
    const backdrop = document.getElementById('adminSidebarBackdrop');
    if (!sidebar) return;
    sidebar.classList.toggle('mobile-open');
    if (backdrop) backdrop.classList.toggle('active');
};

window.closeAdminSidebar = function() {
    const sidebar = document.getElementById('adminSidebar');
    const backdrop = document.getElementById('adminSidebarBackdrop');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('active');
};

window.toggleAdminMobileNav = window.toggleAdminSidebar;
window.closeAdminMobileNav = window.closeAdminSidebar;

// ----------------- DESKTOP SIDEBAR COLLAPSE / EXPAND -----------------
window.toggleSidebarCollapse = function() {
    const layout = document.getElementById('adminMainLayout');
    const sidebar = document.getElementById('adminSidebar');
    const btn = document.getElementById('sidebarCollapseBtn');
    if (!layout || !sidebar) return;

    const isCollapsed = sidebar.classList.toggle('collapsed');
    layout.classList.toggle('sidebar-collapsed', isCollapsed);

    if (btn) {
        btn.setAttribute('title', isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar');
        btn.setAttribute('aria-label', isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar');
        btn.innerHTML = isCollapsed 
            ? '<i data-lucide="chevron-right" data-size="16"></i>'
            : '<i data-lucide="chevron-left" data-size="16"></i>';
        if (window.lucide) window.lucide.createIcons();
    }

    try {
        localStorage.setItem('TIRA_SIDEBAR_COLLAPSED', isCollapsed ? 'true' : 'false');
    } catch (e) {
        console.warn('Could not save sidebar state to localStorage', e);
    }
};

window.applySavedSidebarState = function() {
    try {
        const saved = localStorage.getItem('TIRA_SIDEBAR_COLLAPSED');
        if (saved === 'true') {
            const layout = document.getElementById('adminMainLayout');
            const sidebar = document.getElementById('adminSidebar');
            const btn = document.getElementById('sidebarCollapseBtn');
            if (layout && sidebar) {
                sidebar.classList.add('collapsed');
                layout.classList.add('sidebar-collapsed');
                if (btn) {
                    btn.setAttribute('title', 'Expand Sidebar');
                    btn.setAttribute('aria-label', 'Expand Sidebar');
                    btn.innerHTML = '<i data-lucide="chevron-right" data-size="16"></i>';
                }
                if (window.lucide) window.lucide.createIcons();
            }
        }
    } catch (e) {}
};

// ----------------- AUTHENTICATION & SECURITY -----------------
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30000; // 30 seconds
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

let loginAttempts = 0;
let lockoutUntil = 0;
let sessionTimer = null;

function resetSessionTimer() {
    if (sessionTimer) clearTimeout(sessionTimer);
    if (isAuthenticated) {
        sessionTimer = setTimeout(() => {
            showToast('Session timed out due to 30 minutes of inactivity.', 'warning');
            window.logoutAdmin();
        }, SESSION_TIMEOUT_MS);
    }
}

// User activity listeners to keep session alive while actively using the counter
['mousedown', 'keydown', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, () => resetSessionTimer(), { passive: true });
});

function checkAdminAuth() {
    const sessionAuth = sessionStorage.getItem('TIRA_ADMIN_AUTH');
    const loginTime = parseInt(sessionStorage.getItem('TIRA_ADMIN_AUTH_TIME') || '0', 10);
    const now = Date.now();

    if (sessionAuth === 'true' && (now - loginTime < SESSION_TIMEOUT_MS)) {
        isAuthenticated = true;
        sessionStorage.setItem('TIRA_ADMIN_AUTH_TIME', now.toString());
        document.body.classList.add('admin-authenticated');
        document.getElementById('adminLoginModal').style.display = 'none';
        document.getElementById('adminMainLayout').style.display = 'grid';
        resetSessionTimer();
        initAdminApp();
    } else {
        sessionStorage.removeItem('TIRA_ADMIN_AUTH');
        sessionStorage.removeItem('TIRA_ADMIN_AUTH_TIME');
        document.body.classList.remove('admin-authenticated');
        document.getElementById('adminLoginModal').style.display = 'flex';
        document.getElementById('adminMainLayout').style.display = 'none';
    }
}

window.handleAdminLogin = async function() {
    const now = Date.now();
    if (now < lockoutUntil) {
        const remainingSec = Math.ceil((lockoutUntil - now) / 1000);
        showToast(`Too many failed login attempts. Please wait ${remainingSec}s before retrying.`, 'error');
        return;
    }

    const user = document.getElementById('loginUsername').value.trim();
    const pass = document.getElementById('loginPassword').value.trim();

    if (!user || !pass) {
        showToast('Please enter both username and password/PIN.', 'warning');
        return;
    }

    const isValid = await window.TiraDB.verifyAdminCredentials(user, pass);

    if (isValid) {
        loginAttempts = 0;
        lockoutUntil = 0;
        sessionStorage.setItem('TIRA_ADMIN_AUTH', 'true');
        sessionStorage.setItem('TIRA_ADMIN_AUTH_TIME', Date.now().toString());
        isAuthenticated = true;
        document.body.classList.add('admin-authenticated');
        document.getElementById('adminLoginModal').style.display = 'none';
        document.getElementById('adminMainLayout').style.display = 'grid';
        showToast('Welcome to TIRA Belle Admin Portal!', 'success');
        resetSessionTimer();
        initAdminApp();
    } else {
        loginAttempts++;
        if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
            lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
            showToast(`Too many failed attempts. Login locked for 30 seconds.`, 'error');
        } else {
            const left = MAX_LOGIN_ATTEMPTS - loginAttempts;
            showToast(`Invalid credentials. ${left} attempt${left > 1 ? 's' : ''} remaining before lockout.`, 'error');
        }
    }
};

window.logoutAdmin = function() {
    if (sessionTimer) clearTimeout(sessionTimer);
    sessionStorage.removeItem('TIRA_ADMIN_AUTH');
    sessionStorage.removeItem('TIRA_ADMIN_AUTH_TIME');
    window.location.reload();
};

// ----------------- PASSWORD VISIBILITY TOGGLE -----------------
window.togglePasswordVisibility = function(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';

    if (btnEl) {
        btnEl.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        btnEl.setAttribute('title', isPassword ? 'Hide password' : 'Show password');
        btnEl.innerHTML = `<i data-lucide="${isPassword ? 'eye-off' : 'eye'}" data-size="18"></i>`;
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }
};

function resetPasswordField(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = '';
    el.type = 'password';
    const btn = el.parentElement ? el.parentElement.querySelector('.password-toggle-btn') : null;
    if (btn) {
        btn.setAttribute('aria-label', 'Show password');
        btn.setAttribute('title', 'Show password');
        btn.innerHTML = '<i data-lucide="eye" data-size="18"></i>';
    }
}

// ----------------- NAVIGATION -----------------
window.switchAdminSection = function(sectionId) {
    activeSection = sectionId;
    closeAdminSidebar();

    // Update nav buttons
    document.querySelectorAll('.admin-nav-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = Array.from(document.querySelectorAll('.admin-nav-item')).find(b => 
        b.getAttribute('onclick') && b.getAttribute('onclick').includes(sectionId)
    );
    if (activeBtn) activeBtn.classList.add('active');

    // Update section visibility
    document.querySelectorAll('.admin-section').forEach(sec => sec.classList.remove('active'));
    const targetSec = document.getElementById(`sec-${sectionId}`);
    if (targetSec) targetSec.classList.add('active');

    // Section specific loaders
    if (sectionId === 'dashboard') loadDashboardMetrics();
    else if (sectionId === 'pos') renderPosCatalog();
    else if (sectionId === 'categories') renderCategoriesSection();
    else if (sectionId === 'products') renderProductsTable();
    else if (sectionId === 'customers') renderCustomersTable();
    else if (sectionId === 'loyalty') {
        renderAdminLoyaltyAudit();
        renderNearRewardCustomers();
    }
    else if (sectionId === 'qr') renderCounterQr();
    else if (sectionId === 'reviews') renderAdminReviews();
    else if (sectionId === 'settings') populateSettingsFields();

    if (window.lucide) window.lucide.createIcons();
};

function initAdminApp(refreshSettings = true) {
    applySavedSidebarState();
    loadDashboardMetrics();
    renderPosCatalog();
    renderCategoriesSection();
    renderProductsTable();
    renderCustomersTable();
    renderCounterQr();
    renderAdminReviews();
    renderAdminLoyaltyAudit();
    renderNearRewardCustomers();

    const activeLoyaltyInput = document.getElementById('adminLoyaltyPhoneInput');
    if (activeLoyaltyInput && activeLoyaltyInput.value && activeLoyaltyInput.value.trim().length >= 4) {
        renderAdminLoyaltyCard(activeLoyaltyInput.value.trim());
    }

    const activeEl = document.activeElement;
    const isEditingSettings = activeEl && activeEl.closest && activeEl.closest('#section-settings');
    if (refreshSettings || !isEditingSettings) {
        populateSettingsFields();
    }
    setupImageDropzones();
    const datePicker = document.getElementById('dashboardDatePicker');
    if (datePicker && !datePicker.value) {
        datePicker.value = getLocalDateString(new Date());
    }
    updateDatePickerDisplay();
    if (window.TiraNotifs && typeof window.TiraNotifs.render === 'function') {
        window.TiraNotifs.render();
    }
    if (window.lucide) window.lucide.createIcons();
}

// ==========================================================================
// REAL-TIME NOTIFICATIONS ENGINE & LIVE ACTIVITY MANAGER
// ==========================================================================
window.TiraNotifs = {
    STORAGE_KEY: 'tira_admin_notifications_v3',
    PROCESSED_KEY: 'tira_processed_events_v3',

    get() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                const list = JSON.parse(raw);
                if (Array.isArray(list)) {
                    // Automatically filter and deduplicate any duplicate items by actionTarget/id
                    const seen = new Set();
                    const deduped = [];
                    for (const item of list) {
                        const key = item.actionTarget || item.id;
                        if (key && seen.has(key)) continue;
                        if (key) seen.add(key);
                        deduped.push(item);
                    }
                    if (deduped.length !== list.length) {
                        this.save(deduped);
                    }
                    return deduped;
                }
            }
        } catch (e) {}
        return []; // Clean empty state on first load
    },

    save(list) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify((list || []).slice(0, 50)));
        } catch (e) {}
    },

    getProcessedSet() {
        try {
            const raw = localStorage.getItem(this.PROCESSED_KEY);
            if (raw) return new Set(JSON.parse(raw));
        } catch (e) {}
        return new Set();
    },

    isProcessed(key) {
        if (!key) return false;
        return this.getProcessedSet().has(String(key));
    },

    markProcessed(key) {
        if (!key) return;
        const set = this.getProcessedSet();
        set.add(String(key));
        const arr = Array.from(set).slice(-200);
        try {
            localStorage.setItem(this.PROCESSED_KEY, JSON.stringify(arr));
        } catch (e) {}
    },

    add(notif, showLiveAlert = true) {
        if (!notif) return null;
        const dedupKey = notif.actionTarget || notif.eventKey || notif.id;
        if (dedupKey && this.isProcessed(dedupKey)) {
            return null; // Already processed! Strictly block duplicate
        }

        const list = this.get();
        // Also guard against existing items in current list with same actionTarget or id
        if (dedupKey && list.some(item => (item.actionTarget === dedupKey || item.id === dedupKey))) {
            if (dedupKey) this.markProcessed(dedupKey);
            return null; // Already exists in list! Strictly block duplicate
        }

        if (dedupKey) {
            this.markProcessed(dedupKey);
        }

        const newNotif = {
            id: notif.id || ('notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6)),
            type: notif.type || 'cash',
            title: notif.title || 'Notification',
            desc: notif.desc || '',
            timestamp: notif.timestamp || new Date().toISOString(),
            unread: true,
            actionType: notif.actionType || '',
            actionTarget: notif.actionTarget || ''
        };

        list.unshift(newNotif);
        this.save(list);
        this.render();

        // Audio chime and toast alert ONLY when genuine live event occurs
        if (showLiveAlert) {
            this.playChime();
            if (typeof showToast === 'function') {
                showToast(`${newNotif.title} — ${newNotif.desc}`, notif.toastType || 'info');
            }
        }
        return newNotif;
    },

    markAllRead() {
        const list = this.get().map(n => ({ ...n, unread: false }));
        this.save(list);
        this.render();
        if (typeof showToast === 'function') {
            showToast('All notifications marked as read', 'info');
        }
    },

    markItemRead(id) {
        const list = this.get().map(n => n.id === id ? { ...n, unread: false } : n);
        this.save(list);
        this.render();
    },

    render() {
        const listContainer = document.getElementById('adminNotifList');
        const badge = document.getElementById('notifUnreadBadge');
        const dot = document.getElementById('adminNotifDot');

        const notifs = this.get();
        const unreadCount = notifs.filter(n => n.unread).length;

        if (dot) {
            if (unreadCount > 0) {
                dot.classList.add('active');
                dot.style.display = 'block';
            } else {
                dot.classList.remove('active');
                dot.style.display = 'none';
            }
        }
        if (badge) {
            badge.textContent = unreadCount > 0 ? `${unreadCount} New` : '0 New';
            badge.className = unreadCount > 0 ? 'badge badge-warning' : 'badge badge-success';
        }

        if (!listContainer) return;

        if (!notifs.length) {
            listContainer.innerHTML = `
                <div class="notif-empty">
                    <i data-lucide="bell-off" data-size="28" style="color: var(--color-border-dark);"></i>
                    <div style="font-weight: 700; color: var(--color-espresso); font-size: 0.88rem; margin-top: 4px;">No notifications yet</div>
                    <div style="font-size: 0.76rem; color: var(--color-text-muted); max-width: 260px; margin: 0 auto; line-height: 1.4;">
                        Real-time alerts for counter sales, customer reviews, and loyalty rewards will appear here as they occur.
                    </div>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        listContainer.innerHTML = '';
        notifs.forEach(notif => {
            const item = document.createElement('div');
            item.className = `notif-item ${notif.unread ? 'unread' : ''}`;
            item.onclick = () => this.handleClick(notif);

            let iconHtml = '<i data-lucide="bell" data-size="16"></i>';
            let iconClass = 'notif-icon-sale';
            if (notif.type === 'cash') {
                iconHtml = '<i data-lucide="banknote" data-size="16"></i>';
                iconClass = 'notif-icon-sale';
            } else if (notif.type === 'online') {
                iconHtml = '<i data-lucide="qr-code" data-size="16"></i>';
                iconClass = 'notif-icon-customer';
            } else if (notif.type === 'rewards') {
                iconHtml = '<i data-lucide="gift" data-size="16"></i>';
                iconClass = 'notif-icon-reward';
            } else if (notif.type === 'review') {
                iconHtml = '<i data-lucide="star" data-size="16"></i>';
                iconClass = 'notif-icon-review';
            }

            const relTime = formatNotifRelativeTime(notif.timestamp);
            const safeTitle = typeof escapeHtml === 'function' ? escapeHtml(notif.title) : notif.title;
            const safeDesc = typeof escapeHtml === 'function' ? escapeHtml(notif.desc) : notif.desc;

            item.innerHTML = `
                <div class="notif-item-icon ${iconClass}">${iconHtml}</div>
                <div class="notif-item-content">
                    <div class="notif-item-title-row">
                        <span class="notif-item-title">${safeTitle}</span>
                        <span class="notif-item-time">${relTime}</span>
                    </div>
                    <div class="notif-item-body">${safeDesc}</div>
                </div>
            `;
            listContainer.appendChild(item);
        });

        if (window.lucide) window.lucide.createIcons();
    },

    handleClick(notif) {
        this.markItemRead(notif.id);
        const dropdown = document.getElementById('adminNotificationDropdown');
        if (dropdown) dropdown.style.display = 'none';

        if (notif.actionType === 'sale' && notif.actionTarget) {
            if (typeof viewReceipt === 'function') {
                viewReceipt(notif.actionTarget);
            }
        } else if (notif.actionType === 'loyalty') {
            if (typeof switchAdminSection === 'function') {
                switchAdminSection('loyalty');
            }
            if (notif.actionTarget && typeof adminQuickTrackCustomer === 'function') {
                setTimeout(() => adminQuickTrackCustomer(notif.actionTarget), 150);
            }
        } else if (notif.actionType === 'review') {
            if (typeof switchAdminSection === 'function') {
                switchAdminSection('reviews');
            }
        } else if (notif.actionType === 'customer') {
            if (typeof switchAdminSection === 'function') {
                switchAdminSection('customers');
            }
        }
    },

    playChime() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            const t = ctx.currentTime;
            osc.frequency.setValueAtTime(587.33, t); // D5
            osc.frequency.exponentialRampToValueAtTime(880, t + 0.08); // A5
            gain.gain.setValueAtTime(0.04, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.26);
        } catch (e) {}
    }
};

window.toggleAdminNotifications = function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const dropdown = document.getElementById('adminNotificationDropdown');
    if (!dropdown) return;
    const isShown = dropdown.style.display === 'block';
    dropdown.style.display = isShown ? 'none' : 'block';
    if (!isShown) {
        window.TiraNotifs.render();
    }
};

window.clearAdminNotifications = function() {
    window.TiraNotifs.markAllRead();
    const dropdown = document.getElementById('adminNotificationDropdown');
    if (dropdown) dropdown.style.display = 'none';
};

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('adminNotificationDropdown');
    const btn = document.getElementById('adminNotificationBtn');
    if (dropdown && dropdown.style.display === 'block') {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    }
});

function formatNotifRelativeTime(isoString) {
    if (!isoString) return 'Just now';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Recently';
    const now = new Date();
    const diffSecs = Math.floor((now - d) / 1000);
    if (diffSecs < 10) return 'Just now';
    if (diffSecs < 60) return `${diffSecs}s ago`;
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ==========================================================================
// REAL-TIME NOTIFICATION ENGINE (GENUINE LIVE EVENTS ONLY)
// ==========================================================================
window.addEventListener('tira-live-event', (e) => {
    const event = e.detail;
    if (!event || event.type !== 'change') return;

    const entity = event.entity;
    const action = event.action;
    const payload = event.payload || {};

    // 1. Genuine Sale Created Over Counter
    if (entity === 'sales' && action === 'created') {
        const saleId = payload.saleId;
        if (!saleId) return;
        const amount = Number(payload.totalAmount || 0);
        const pMode = payload.paymentMode || 'Cash';
        const custName = payload.customerName || 'Valued Guest';
        const items = Array.isArray(payload.items) ? payload.items.join(', ') : 'Tiramisu';

        window.TiraNotifs.add({
            eventKey: `sale_${saleId}`,
            type: pMode === 'Cash' ? 'cash' : 'online',
            title: `New ${pMode} Sale Recorded (₹${amount})`,
            desc: `${saleId}: ${items} • ${custName}`,
            actionType: 'sale',
            actionTarget: saleId,
            toastType: 'success'
        }, true);

        // Check if customer reached loyalty milestone
        const phone = payload.phone;
        if (phone && window.TiraDB) {
            setTimeout(() => {
                const loyalty = window.TiraDB.getCustomerLoyalty(phone);
                if (loyalty && loyalty.isEligible) {
                    window.TiraNotifs.add({
                        eventKey: `milestone_${phone}_${loyalty.currentCycleProgress || 5}`,
                        type: 'rewards',
                        title: `🎉 Free Reward Milestone Unlocked!`,
                        desc: `${custName} (${phone}) reached ${loyalty.threshold} stamps! Free dessert ready to claim.`,
                        actionType: 'loyalty',
                        actionTarget: phone,
                        toastType: 'success'
                    }, true);
                }
            }, 350);
        }
    }

    // 2. Genuine Reward Claimed Over Counter
    else if (entity === 'redemptions' && action === 'created') {
        const rdmId = payload.redemptionId;
        if (!rdmId) return;
        const custName = payload.customerName || 'Customer';
        const phone = payload.phone || '';
        const rewardItem = payload.rewardItem || '1 Free 150g Cup';

        window.TiraNotifs.add({
            eventKey: `rdm_${rdmId}`,
            type: 'rewards',
            title: '🎁 Reward Claimed Over Counter',
            desc: `${custName} (${phone}) redeemed ${rewardItem}`,
            actionType: 'loyalty',
            actionTarget: phone,
            toastType: 'success'
        }, true);
    }

    // 3. Genuine Customer Review Submitted
    else if (entity === 'reviews' && action === 'created') {
        const revName = payload.name;
        const rating = payload.rating;
        const comment = payload.comment || '';
        if (!revName && !rating) return; // Ignore empty / uninitialized calls

        const revKey = payload.reviewId ? `rev_${payload.reviewId}` : `rev_${revName}_${rating}_${comment.slice(0, 20)}`;
        const commentSnippet = comment ? `"${comment.slice(0, 55)}..."` : 'left a 5-star review';

        window.TiraNotifs.add({
            eventKey: revKey,
            type: 'review',
            title: `⭐ New ${rating}★ Review Received!`,
            desc: `${revName || 'Customer'}: ${commentSnippet}`,
            actionType: 'review',
            actionTarget: '',
            toastType: 'info'
        }, true);
    }
});

// ==========================================================================
// SILENT UI DATA SYNCHRONIZATION (Zero notifications, updates tables/cards only)
// ==========================================================================
window.addEventListener('tira-sales-changed', () => {
    loadDashboardMetrics();
    renderCustomersTable();
    if (typeof window.renderNearRewardCustomers === 'function') {
        window.renderNearRewardCustomers();
    }
});

window.addEventListener('tira-redemptions-changed', () => {
    renderAdminLoyaltyAudit();
    renderNearRewardCustomers();
    loadDashboardMetrics();
    renderCustomersTable();
});

window.addEventListener('tira-reviews-changed', () => {
    renderAdminReviews();
});

window.addEventListener('tira-customers-changed', () => {
    renderCustomersTable();
    renderNearRewardCustomers();
});

window.addEventListener('tira-products-changed', () => {
    renderProductsTable();
    renderPosCatalog();
    loadDashboardMetrics();
});

window.addEventListener('tira-categories-changed', () => {
    renderCategoriesSection();
    renderPosCatalog();
});


function getLocalDateString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    return dateStr;
}

window.updateDatePickerDisplay = function(dateStr) {
    const picker = document.getElementById('dashboardDatePicker');
    const display = document.getElementById('datePickerDisplay');
    const resetBtn = document.getElementById('btnResetToday');
    const liveText = document.getElementById('dashLiveCounterText');
    const summaryTag = document.getElementById('dashProductSummaryTag');

    const todayStr = getLocalDateString(new Date());
    const yestDate = new Date();
    yestDate.setDate(yestDate.getDate() - 1);
    const yesterdayStr = getLocalDateString(yestDate);

    const targetDate = dateStr || (picker ? picker.value : todayStr) || todayStr;
    if (picker && picker.value !== targetDate) {
        picker.value = targetDate;
    }

    const formatted = formatDisplayDate(targetDate);

    if (display) {
        if (targetDate === todayStr) {
            display.textContent = `Today • ${formatted}`;
        } else if (targetDate === yesterdayStr) {
            display.textContent = `Yesterday • ${formatted}`;
        } else {
            display.textContent = formatted;
        }
    }

    if (resetBtn) {
        resetBtn.style.display = (targetDate === todayStr) ? 'none' : 'inline-flex';
    }

    if (liveText) {
        liveText.textContent = (targetDate === todayStr) ? 'Live Counter' : formatted;
    }

    if (summaryTag) {
        if (targetDate === todayStr) {
            summaryTag.textContent = "Today's Breakdown";
        } else if (targetDate === yesterdayStr) {
            summaryTag.textContent = "Yesterday's Breakdown";
        } else {
            summaryTag.textContent = `Breakdown • ${formatted}`;
        }
    }
};

window.onDashboardDateSelect = function(selectedDate) {
    if (!selectedDate) return;
    window.updateDatePickerDisplay(selectedDate);
    window.loadDashboardMetrics(selectedDate);
    
    const formatted = formatDisplayDate(selectedDate);
    const todayStr = getLocalDateString(new Date());
    if (selectedDate === todayStr) {
        showToast(`Viewing today's sales (${formatted})`, 'info');
    } else {
        showToast(`Viewing sales for ${formatted}`, 'info');
    }
};

window.resetDashboardToToday = function() {
    const todayStr = getLocalDateString(new Date());
    const picker = document.getElementById('dashboardDatePicker');
    if (picker) picker.value = todayStr;
    window.updateDatePickerDisplay(todayStr);
    window.loadDashboardMetrics(todayStr);
    showToast("Returned to today's sales", 'info');
};

function updateDateFilterLabels() {
    window.updateDatePickerDisplay();
}

function liveSyncAdminView(refreshSettings = false) {
    if (typeof isAuthenticated !== 'undefined' && isAuthenticated) {
        initAdminApp(refreshSettings);
    }
}

window.addEventListener('tira-backend-synced', () => liveSyncAdminView(false));
window.addEventListener('tira-sales-changed', () => liveSyncAdminView(false));
window.addEventListener('tira-products-changed', () => liveSyncAdminView(false));
window.addEventListener('tira-categories-changed', () => liveSyncAdminView(false));
window.addEventListener('tira-customers-changed', () => liveSyncAdminView(false));
window.addEventListener('tira-settings-changed', () => liveSyncAdminView(true));

// ----------------- SECTION 1: DASHBOARD METRICS -----------------
window.loadDashboardMetrics = async function(filterDateParam) {
    const picker = document.getElementById('dashboardDatePicker');
    const todayStr = getLocalDateString(new Date());
    const filter = filterDateParam || (picker ? picker.value : todayStr) || todayStr;

    // Keep display label and buttons in sync
    window.updateDatePickerDisplay(filter);

    const settings = window.TiraDB.getSettings();
    const curr = settings.currency || '₹';

    function renderMetrics(metrics) {
        if (!metrics) return;

        const rev = Number(metrics.totalRevenue ?? metrics.total_revenue ?? 0);
        const txnCount = Number(metrics.transactionCount ?? metrics.transaction_count ?? 0);
        const cash = Number(metrics.cashCollection ?? metrics.cash_collection ?? 0);
        const online = Number(metrics.onlineCollection ?? metrics.online_collection ?? 0);
        const cups = Number(metrics.totalPaidQuantity ?? metrics.total_paid_quantity ?? 0);
        const rewards = Number(metrics.rewardsRedeemedCount ?? metrics.rewards_redeemed_count ?? 0);

        // Update Metric Cards
        const revEl = document.getElementById('dashTotalRevenue');
        if (revEl) revEl.textContent = `${curr}${rev.toLocaleString('en-IN')}`;
        const txnEl = document.getElementById('dashTxnCount');
        if (txnEl) txnEl.textContent = `${txnCount} completed sales`;
        const cashEl = document.getElementById('dashCashCollection');
        if (cashEl) cashEl.textContent = `${curr}${cash.toLocaleString('en-IN')}`;
        const onlineEl = document.getElementById('dashOnlineCollection');
        if (onlineEl) onlineEl.textContent = `${curr}${online.toLocaleString('en-IN')}`;
        const cupsEl = document.getElementById('dashTotalPaidCups');
        if (cupsEl) cupsEl.textContent = cups;
        const rewEl = document.getElementById('dashRewardsClaimed');
        if (rewEl) rewEl.textContent = rewards;

        // Product Summary Table
        const summaryTag = document.getElementById('dashProductSummaryTag');
        if (summaryTag) {
            const yestDate = new Date();
            yestDate.setDate(yestDate.getDate() - 1);
            const yesterdayStr = getLocalDateString(yestDate);
            const formatted = formatDisplayDate(filter);

            if (filter === 'today' || filter === todayStr) {
                summaryTag.textContent = "Today's Breakdown";
            } else if (filter === 'yesterday' || filter === yesterdayStr) {
                summaryTag.textContent = "Yesterday's Breakdown";
            } else if (filter === 'all') {
                summaryTag.textContent = "All Time Breakdown";
            } else {
                summaryTag.textContent = `Breakdown • ${formatted}`;
            }
        }

        const summaryTbody = document.getElementById('dashProductSummaryTbody');
        if (summaryTbody) {
            summaryTbody.innerHTML = '';
            const prodList = metrics.productSummary || metrics.product_summary || [];
            if (!prodList.length) {
                summaryTbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--color-text-muted);">No sales recorded for this period.</td></tr>`;
            } else {
                prodList.forEach(item => {
                    const tr = document.createElement('tr');
                    const itemRev = Number(item.revenue ?? 0);
                    const itemQty = Number(item.quantity ?? 0);
                    tr.innerHTML = `
                        <td><strong>${item.name}</strong></td>
                        <td><span class="badge" style="background: var(--color-bg);">${item.weight || 'Standard'}</span></td>
                        <td>${curr}${item.price}</td>
                        <td><strong style="color: var(--color-espresso);">${itemQty} cups</strong></td>
                        <td><strong style="color: var(--color-caramel);">${curr}${itemRev.toLocaleString('en-IN')}</strong></td>
                    `;
                    summaryTbody.appendChild(tr);
                });
            }
        }

        // Recent Sales Table
        const recentTbody = document.getElementById('dashRecentSalesTbody');
        if (recentTbody) {
            recentTbody.innerHTML = '';
            const salesList = metrics.recentSales || metrics.recent_sales || [];
            if (!salesList.length) {
                recentTbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color: var(--color-text-muted);">No recent transactions found.</td></tr>`;
            } else {
                salesList.forEach(sale => {
                    const tr = document.createElement('tr');
                    const items = Array.isArray(sale.items) ? sale.items : [];
                    const itemsStr = items.map(it => `${it.productName || it.product_name} (x${it.quantity})`).join(', ');
                    const timeStr = new Date(sale.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                    const dateStr = new Date(sale.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                    const safeName = typeof escapeHtml === 'function' ? escapeHtml(sale.customerName || sale.customer_name || 'Guest') : (sale.customerName || sale.customer_name || 'Guest');
                    const safePhone = typeof escapeHtml === 'function' ? escapeHtml(sale.customerPhone || sale.customer_phone || '') : (sale.customerPhone || sale.customer_phone || '');
                    const safeItems = typeof escapeHtml === 'function' ? escapeHtml(itemsStr) : itemsStr;
                    const safeId = typeof escapeHtml === 'function' ? escapeHtml(sale.id) : sale.id;
                    const paidCups = Number(sale.paidCupsCount ?? sale.paid_cups_count ?? 0);
                    const totalCupsInSale = items.reduce((acc, it) => {
                        const isRew = it.isReward ?? it.is_reward ?? false;
                        return isRew ? acc : acc + Number(it.quantity ?? 1);
                    }, 0) || paidCups;
                    const amount = Number(sale.totalAmount ?? sale.total_amount ?? 0);
                    const pMode = sale.paymentMode || sale.payment_mode || 'Cash';

                    tr.innerHTML = `
                        <td><code>${safeId}</code></td>
                        <td>${dateStr}, ${timeStr}</td>
                        <td>
                            <strong>${safeName}</strong>
                            <div style="font-size: 0.78rem; color: var(--color-text-muted);">${safePhone}</div>
                        </td>
                        <td style="max-width: 220px; font-size: 0.85rem;">${safeItems}</td>
                        <td>
                            <strong>${totalCupsInSale} cup${totalCupsInSale !== 1 ? 's' : ''}</strong>
                            <div style="font-size: 0.74rem; color: ${paidCups > 0 ? 'var(--color-caramel)' : 'var(--color-text-muted)'};">
                                ${paidCups > 0 ? `+${paidCups} stamp${paidCups !== 1 ? 's' : ''}` : 'No loyalty stamp'}
                            </div>
                        </td>
                        <td><strong>${curr}${amount.toLocaleString('en-IN')}</strong></td>
                        <td>
                            <span class="badge ${pMode === 'Cash' ? 'badge-cash' : 'badge-online'}">
                                ${pMode}
                            </span>
                        </td>
                        <td>
                            <button class="btn btn-outline btn-sm" onclick="viewReceipt('${safeId}')" style="display: inline-flex; align-items: center; gap: 4px;">
                                <i data-lucide="file-text" data-size="14"></i>
                                <span>Receipt</span>
                            </button>
                        </td>
                    `;
                    recentTbody.appendChild(tr);
                });
            }
        }
        if (window.lucide) window.lucide.createIcons();
    }

    // 1. Immediate local render
    try {
        const localMetrics = window.TiraDB.getDashboardMetrics(filter);
        renderMetrics(localMetrics);
    } catch (e) {
        console.warn('Local metrics calculation error:', e);
    }

    // 2. Fetch fresh live metrics directly from backend
    try {
        const res = await window.TiraDB.apiRequest('/sales/metrics?filter_date=' + encodeURIComponent(filter));
        if (res && res.ok && res.data) {
            renderMetrics(res.data);

            // Keep local DB sales in sync with any returned recent sales
            if (Array.isArray(res.data.recentSales) && res.data.recentSales.length) {
                const existingMap = new Map();
                (window.TiraDB.data.sales || []).forEach(s => existingMap.set(s.id, s));
                res.data.recentSales.forEach(s => {
                    if (s.id && !existingMap.has(s.id)) {
                        existingMap.set(s.id, s);
                    }
                });
                window.TiraDB.data.sales = Array.from(existingMap.values()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                window.TiraDB.save();
            }
        }
    } catch (err) {
        console.warn('Live metrics fetch failed, fallback to local DB:', err);
    }
};

// ----------------- SECTION 2: POS SALES REGISTER -----------------
let activePosCategory = 'all';

window.setPosCategoryFilter = function(catId) {
    activePosCategory = catId;
    renderPosCatalog();
};

window.renderPosCatalog = function() {
    const catalog = document.getElementById('posProductCatalog');
    if (!catalog) return;
    
    // Render Category Filter Pills
    const filterPillsContainer = document.getElementById('posCategoryFilterPills');
    if (filterPillsContainer) {
        const categories = window.TiraDB.getCategories(true);
        let pillsHtml = `
            <button type="button" class="pos-cat-pill ${activePosCategory === 'all' ? 'active' : ''}" onclick="setPosCategoryFilter('all')">
                All Cups
            </button>
        `;
        categories.forEach(c => {
            pillsHtml += `
                <button type="button" class="pos-cat-pill ${activePosCategory === c.id ? 'active' : ''}" onclick="setPosCategoryFilter('${c.id}')">
                    ${c.name}
                </button>
            `;
        });
        filterPillsContainer.innerHTML = pillsHtml;
    }

    let products = window.TiraDB.getProducts(true); // Active products only
    if (activePosCategory !== 'all') {
        products = products.filter(p => p.categoryId === activePosCategory);
    }
    const settings = window.TiraDB.getSettings();
    const curr = settings.currency || '₹';

    catalog.innerHTML = '';
    if (!products.length) {
        catalog.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px 10px; color: var(--color-text-muted);">
                <i data-lucide="package-open" data-size="32" style="margin-bottom: 8px; color: var(--color-caramel);"></i>
                <div>No active products in this category.</div>
            </div>
        `;
    } else {
        products.forEach(p => {
            const card = document.createElement('div');
            card.className = 'pos-item-card';
            card.innerHTML = `
                <img src="${p.image || 'assets/classic/tiramisu-classic-150 g.png'}" alt="${p.name}" class="pos-item-img" onerror="this.src='assets/poster/tiramisu-classic-poster.png'">
                <div class="pos-item-name">${p.name}</div>
                <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: 6px;">Size: ${p.weight}</div>
                <div class="pos-item-price">${curr}${p.price}</div>
                <button class="btn btn-caramel btn-sm" onclick="addToCart('${p.id}')" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                    <i data-lucide="plus" data-size="14"></i>
                    <span>Add to Cart</span>
                </button>
            `;
            catalog.appendChild(card);
        });
    }
    if (window.lucide) window.lucide.createIcons();
};

window.addToCart = function(productId) {
    const product = window.TiraDB.getProductById(productId);
    if (!product) return;

    const existing = currentCart.find(item => item.productId === productId);
    if (existing) {
        existing.quantity += 1;
    } else {
        currentCart.push({
            productId: product.id,
            productName: product.name,
            weight: product.weight,
            price: product.price,
            quantity: 1,
            countsTowardsLoyalty: product.countsTowardsLoyalty
        });
    }
    updateCartUI();
};

window.updateCartQty = function(productId, delta) {
    const index = currentCart.findIndex(item => item.productId === productId);
    if (index === -1) return;

    currentCart[index].quantity += delta;
    if (currentCart[index].quantity <= 0) {
        currentCart.splice(index, 1);
    }
    updateCartUI();
};

window.resetNewSale = async function(skipConfirm = false) {
    if (!skipConfirm) {
        const hasData = (currentCart && currentCart.length > 0) || 
                        (document.getElementById('posCustomerPhone')?.value.trim() !== '') ||
                        (document.getElementById('posCustomerName')?.value.trim() !== '') ||
                        (document.getElementById('posSaleNotes')?.value.trim() !== '');

        if (hasData) {
            const confirmed = window.TiraAlert ? await window.TiraAlert.confirm({
                title: 'Clear Current Sale?',
                message: 'This will remove all items from the cart and clear all entered customer details so you can start a new sale from scratch.',
                type: 'warning',
                confirmText: 'Yes, Clear Sale',
                cancelText: 'Keep Editing',
                icon: 'rotate-ccw'
            }) : window.confirm('Are you sure you want to clear the current sale? This will remove all items from the cart and clear all entered customer details.');

            if (!confirmed) return;
        }
    }

    currentCart = [];
    const phoneInput = document.getElementById('posCustomerPhone');
    const nameInput = document.getElementById('posCustomerName');
    const notesInput = document.getElementById('posSaleNotes');
    if (phoneInput) phoneInput.value = '';
    if (nameInput) nameInput.value = '';
    if (notesInput) notesInput.value = '';

    const suggestEl = document.getElementById('posCustomerSuggestions');
    if (suggestEl) {
        suggestEl.innerHTML = '';
        suggestEl.classList.remove('active');
        suggestEl.style.display = 'none';
    }

    const badge = document.getElementById('posMemberStatusBadge');
    if (badge) badge.style.display = 'none';

    const loyaltyCard = document.getElementById('posDynamicLoyaltyCard');
    if (loyaltyCard) {
        loyaltyCard.style.display = 'none';
        loyaltyCard.innerHTML = '';
    }

    const alertBanner = document.getElementById('posLoyaltyAlert');
    if (alertBanner) alertBanner.classList.remove('active');

    const redeemCheckbox = document.getElementById('posRedeemRewardCheckbox');
    if (redeemCheckbox) redeemCheckbox.checked = false;

    const saveBtn = document.getElementById('btnSaveSale');
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i data-lucide="circle-check" data-size="16"></i> <span>Complete Order & Print Bill</span>';
    }

    if (typeof setPosPaymentMode === 'function') {
        setPosPaymentMode('Cash');
    }

    updateCartUI();

    if (!skipConfirm) {
        showToast('New sale cleared and reset to default.', 'info');
        if (phoneInput) phoneInput.focus();
    }
};

window.clearCart = function() {
    window.resetNewSale(false);
};

function updateCartUI() {
    const itemsList = document.getElementById('cartItemsList');
    const badge = document.getElementById('cartBadgeCount');
    const settings = window.TiraDB.getSettings();
    const curr = settings.currency || '₹';

    if (!itemsList) return;

    let subtotal = 0;
    let totalCups = 0;
    let itemCount = 0;

    if (currentCart.length === 0) {
        itemsList.innerHTML = `
            <div style="text-align: center; padding: 30px 10px; color: var(--color-text-muted); font-size: 0.9rem; display: flex; flex-direction: column; align-items: center; gap: 8px;">
                <i data-lucide="shopping-cart" data-size="28" style="color: var(--color-text-light);"></i>
                <span>Cart is empty. Click on any product to add!</span>
            </div>
        `;
    } else {
        itemsList.innerHTML = '';
        currentCart.forEach(item => {
            const row = document.createElement('div');
            row.className = 'cart-item-row';
            const itemTotal = item.price * item.quantity;
            subtotal += itemTotal;
            if (item.countsTowardsLoyalty) totalCups += item.quantity;
            itemCount += item.quantity;

            row.innerHTML = `
                <div>
                    <div class="cart-item-title">${item.productName}</div>
                    <div class="cart-item-unit">${curr}${item.price} each</div>
                </div>
                <div class="cart-qty-ctrl">
                    <button class="qty-btn" onclick="updateCartQty('${item.productId}', -1)">−</button>
                    <span style="font-weight: 700; min-width: 20px; text-align: center;">${item.quantity}</span>
                    <button class="qty-btn" onclick="updateCartQty('${item.productId}', 1)">+</button>
                    <span style="font-weight: 700; margin-left: 10px; min-width: 48px; text-align: right;">${curr}${itemTotal}</span>
                </div>
            `;
            itemsList.appendChild(row);
        });
    }

    // Check if free reward is selected
    const isFreeRewardSelected = document.getElementById('posRedeemRewardCheckbox')?.checked;
    if (isFreeRewardSelected) {
        const rewardRow = document.createElement('div');
        rewardRow.className = 'cart-item-row';
        rewardRow.style.background = '#f7f0fe';
        rewardRow.style.padding = '8px 12px';
        rewardRow.style.borderRadius = '8px';
        rewardRow.style.border = '1px dashed #b388ff';
        rewardRow.innerHTML = `
            <div>
                <div class="cart-item-title" style="color: #6b21a8; display: flex; align-items: center; gap: 6px; font-weight: 700;">
                    <i data-lucide="gift" data-size="16"></i>
                    <span>1 Free 150g Cup</span>
                </div>
                <div class="cart-item-unit" style="color: #7e22ce;">Loyalty Reward Redemption</div>
            </div>
            <div style="font-weight: 800; color: #27ae60;">₹0 (Free)</div>
        `;
        itemsList.appendChild(rewardRow);
    }

    badge.textContent = `${itemCount} item${itemCount !== 1 ? 's' : ''}`;
    document.getElementById('cartSubtotal').textContent = `${curr}${subtotal}`;
    document.getElementById('cartEligibleCups').textContent = `${totalCups} cup${totalCups !== 1 ? 's' : ''}`;
    document.getElementById('cartGrandTotal').textContent = `${curr}${subtotal}`;
    if (window.lucide) window.lucide.createIcons();
}

window.setPosPaymentMode = function(mode) {
    currentPaymentMode = mode;
    document.getElementById('payModeCash').classList.toggle('active', mode === 'Cash');
    document.getElementById('payModeOnline').classList.toggle('active', mode === 'Online');
};

window.handlePosPhoneInput = function(phoneVal) {
    const rawVal = phoneVal || '';
    const cleanDigits = rawVal.replace(/\D/g, '').slice(0, 10);
    const suggestions = document.getElementById('posCustomerSuggestions');
    const badge = document.getElementById('posMemberStatusBadge');
    const loyaltyCard = document.getElementById('posDynamicLoyaltyCard');
    const rewardCheckbox = document.getElementById('posRedeemRewardCheckbox');

    // 1. Suggestions dropdown for partial numbers (3 to 9 digits)
    if (cleanDigits.length >= 3 && cleanDigits.length < 10) {
        const matches = window.TiraDB.searchCustomer(cleanDigits);
        if (matches.length > 0 && suggestions) {
            suggestions.innerHTML = '';
            matches.slice(0, 5).forEach(c => {
                const item = document.createElement('div');
                item.className = 'customer-suggest-item';
                const loyalty = window.TiraDB.getCustomerLoyalty(c.phone);
                item.innerHTML = `
                    <div><strong>${c.name}</strong> • ${c.phone}</div>
                    <span class="badge ${loyalty.isEligible ? 'badge-success' : 'badge-warning'}">
                        ${loyalty.isEligible ? 'Eligible for Free Cup!' : `${loyalty.currentCycleProgress}/${loyalty.threshold} Purchases`}
                    </span>
                `;
                item.onclick = () => selectPosCustomer(c);
                suggestions.appendChild(item);
            });
            suggestions.classList.add('active');
            suggestions.style.display = 'block';
        } else if (suggestions) {
            suggestions.classList.remove('active');
            suggestions.style.display = 'none';
        }
    } else if (suggestions) {
        suggestions.classList.remove('active');
        suggestions.style.display = 'none';
    }

    // 2. Initial State: Before a valid 10-digit number is entered
    if (cleanDigits.length < 10) {
        if (badge) badge.style.display = 'none';
        if (loyaltyCard) {
            loyaltyCard.style.display = 'none';
            loyaltyCard.innerHTML = '';
        }
        if (rewardCheckbox && rewardCheckbox.checked) {
            rewardCheckbox.checked = false;
            updateCartUI();
        }
        return;
    }

    // 3. Exactly 10 digits entered: Automatically check loyalty status
    const customer = window.TiraDB.findCustomerByPhone(cleanDigits);
    const loyalty = window.TiraDB.getCustomerLoyalty(cleanDigits);
    const isRecognized = !!(customer || (loyalty && loyalty.exists));

    // Recognized Member green badge
    if (badge) {
        badge.style.display = isRecognized ? 'inline-flex' : 'none';
    }

    // Auto-fill customer name if known and input is currently empty
    const nameField = document.getElementById('posCustomerName');
    if (nameField && customer && customer.name && customer.name !== 'Guest' && !nameField.value.trim()) {
        nameField.value = customer.name;
    }

    // Render dynamic loyalty card (Purple eligible card or Progress card)
    renderPosLoyaltyCard(loyalty, cleanDigits);
};

window.renderPosLoyaltyCard = function(loyalty, cleanDigits) {
    const loyaltyCard = document.getElementById('posDynamicLoyaltyCard');
    const rewardCheckbox = document.getElementById('posRedeemRewardCheckbox');
    if (!loyaltyCard) return;

    if (!loyalty || !cleanDigits || cleanDigits.length !== 10) {
        loyaltyCard.style.display = 'none';
        loyaltyCard.innerHTML = '';
        return;
    }

    const threshold = loyalty.threshold || 5;
    const isEligible = !!loyalty.isEligible;
    const isRedeemed = !!(rewardCheckbox && rewardCheckbox.checked);

    if (isEligible) {
        // Customer is Eligible for a Free Cup: Purple Card
        loyaltyCard.innerHTML = `
            <div class="pos-loyalty-card-eligible">
                <div class="pos-loyalty-eligible-info">
                    <div class="pos-loyalty-eligible-icon">
                        <i data-lucide="gift" data-size="20"></i>
                    </div>
                    <div>
                        <div class="pos-loyalty-eligible-title">Eligible for 1 Free 150g Cup! 🎉</div>
                        <div class="pos-loyalty-eligible-sub">Reached ${threshold} cups reward threshold</div>
                    </div>
                </div>
                <button type="button" class="pos-redeem-btn ${isRedeemed ? 'redeemed' : ''}" id="btnPosRedeem" onclick="posToggleRewardRedemption('${cleanDigits}')" title="${isRedeemed ? 'Free reward applied to order' : 'Click to redeem 1 free cup'}">
                    ${isRedeemed ? '<i data-lucide="check" data-size="14"></i> Redeemed' : 'Redeem'}
                </button>
            </div>
        `;
    } else {
        // Customer is Not Yet Eligible: Progress Card
        const currentStamps = loyalty.currentCycleProgress || 0;
        const stampsNeeded = loyalty.cupsRemaining || Math.max(0, threshold - currentStamps);
        const progressPct = Math.min(100, Math.max(0, Math.round((currentStamps / threshold) * 100)));

        loyaltyCard.innerHTML = `
            <div class="pos-loyalty-card-progress">
                <div class="pos-loyalty-progress-header">
                    <span class="pos-loyalty-progress-title">
                        <i data-lucide="award" data-size="15" style="color: #b7793d;"></i>
                        Loyalty Progress
                    </span>
                    <span class="pos-loyalty-progress-stat">
                        ${currentStamps}/${threshold} stamps collected
                    </span>
                </div>
                <div class="pos-loyalty-bar-bg">
                    <div class="pos-loyalty-bar-inner" style="width: ${progressPct}%;"></div>
                </div>
                <div class="pos-loyalty-progress-footer">
                    <span>${stampsNeeded} more stamp${stampsNeeded !== 1 ? 's' : ''} needed for a free cup</span>
                    <span style="font-size: 0.74rem; color: #8e44ad; font-weight: 600;">Reward: Free 150g Cup</span>
                </div>
            </div>
        `;
    }

    loyaltyCard.style.display = 'block';
    if (window.lucide) window.lucide.createIcons();
};

window.posToggleRewardRedemption = function(phone) {
    const cleanDigits = (phone || document.getElementById('posCustomerPhone')?.value || '').replace(/\D/g, '').slice(0, 10);
    const loyalty = window.TiraDB.getCustomerLoyalty(cleanDigits);
    const rewardCheckbox = document.getElementById('posRedeemRewardCheckbox');
    if (!rewardCheckbox) return;

    if (!loyalty.isEligible) {
        showToast('Customer is not eligible for a free reward cup yet.', 'warning');
        rewardCheckbox.checked = false;
        updateCartUI();
        renderPosLoyaltyCard(loyalty, cleanDigits);
        return;
    }

    // Toggle reward redemption
    if (rewardCheckbox.checked) {
        rewardCheckbox.checked = false;
        updateCartUI();
        renderPosLoyaltyCard(loyalty, cleanDigits);
        showToast('Free 150g Cup reward removed from current order.', 'info');
    } else {
        rewardCheckbox.checked = true;
        updateCartUI();
        renderPosLoyaltyCard(loyalty, cleanDigits);
        showToast('Eligible Free 150g Cup added to order (₹0)!', 'success');
    }
};

function selectPosCustomer(customer) {
    const phoneInput = document.getElementById('posCustomerPhone');
    const nameInput = document.getElementById('posCustomerName');
    if (phoneInput) phoneInput.value = customer.phone;
    if (nameInput) nameInput.value = customer.name;
    const suggestions = document.getElementById('posCustomerSuggestions');
    if (suggestions) {
        suggestions.classList.remove('active');
        suggestions.style.display = 'none';
    }
    handlePosPhoneInput(customer.phone);
}

function checkPosLoyaltyEligibility(phone) {
    const cleanDigits = (phone || '').replace(/\D/g, '').slice(0, 10);
    if (cleanDigits.length === 10) {
        const loyalty = window.TiraDB.getCustomerLoyalty(cleanDigits);
        renderPosLoyaltyCard(loyalty, cleanDigits);
    }
}

window.toggleRewardInOrder = function(checked) {
    updateCartUI();
    const phone = document.getElementById('posCustomerPhone')?.value || '';
    const cleanDigits = phone.replace(/\D/g, '').slice(0, 10);
    if (cleanDigits.length === 10) {
        const loyalty = window.TiraDB.getCustomerLoyalty(cleanDigits);
        renderPosLoyaltyCard(loyalty, cleanDigits);
    }
};

window.submitPosSale = async function() {
    const saveBtn = document.getElementById('btnSaveSale');
    const phone = document.getElementById('posCustomerPhone').value.trim();
    const name = document.getElementById('posCustomerName').value.trim();
    const notes = document.getElementById('posSaleNotes').value.trim();
    const redeemReward = document.getElementById('posRedeemRewardCheckbox')?.checked;

    if (!phone) {
        showToast('Please enter the customer\'s phone number to record the sale.', 'warning');
        document.getElementById('posCustomerPhone').focus();
        return;
    }

    if (currentCart.length === 0 && !redeemReward) {
        showToast('Cart is empty. Please add at least one product.', 'warning');
        return;
    }

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i data-lucide="loader" data-size="16"></i> <span>Saving Sale...</span>';
    }

    try {
        const result = await window.TiraDB.createSale({
            customerPhone: phone,
            customerName: name,
            items: currentCart,
            paymentMode: currentPaymentMode,
            notes: notes,
            redeemFreeReward: redeemReward
        });

        if (result.success) {
            showToast(`Sale recorded successfully! Total: ₹${result.sale.totalAmount}`, 'success');
            
            // Open receipt modal
            viewReceipt(result.sale.id);

            // Reset cart and inputs
            resetNewSale(true);

            // Refresh dashboard metrics and customer table
            loadDashboardMetrics();
            renderCustomersTable();
            if (typeof window.renderNearRewardCustomers === 'function') {
                window.renderNearRewardCustomers();
            }
        } else {
            showToast(result.message || 'Error recording sale', 'error');
        }
    } catch (err) {
        console.error('POS Sale submission error:', err);
        showToast('Error saving sale: ' + (err.message || 'Please try again'), 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i data-lucide="circle-check" data-size="16"></i> <span>Complete Order & Print Bill</span>';
            if (window.lucide) window.lucide.createIcons();
        }
    }
};

// ----------------- RECEIPT MODAL & PRINTING -----------------
window.viewReceipt = function(saleId) {
    const sale = window.TiraDB.getSales().find(s => s.id === saleId);
    if (!sale) return;

    const settings = window.TiraDB.getSettings();
    const curr = settings.currency || '₹';
    const custPhone = sale.customerPhone || sale.customer_phone || '';
    const custName = sale.customerName || sale.customer_name || 'Valued Guest';
    const payMode = sale.paymentMode || sale.payment_mode || 'Cash';
    const totalAmt = Number(sale.totalAmount ?? sale.total_amount ?? 0);
    const loyalty = window.TiraDB.getCustomerLoyalty(custPhone);

    document.getElementById('recId').textContent = sale.id;
    document.getElementById('recDate').textContent = new Date(sale.timestamp).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    document.getElementById('recCustName').textContent = custName;
    document.getElementById('recCustPhone').textContent = custPhone;
    document.getElementById('recPayMode').textContent = payMode;
    document.getElementById('recGrandTotal').textContent = `${curr}${totalAmt.toLocaleString('en-IN')}`;

    // Items list
    const itemsContainer = document.getElementById('recItemsList');
    itemsContainer.innerHTML = '';
    const items = Array.isArray(sale.items) ? sale.items : [];
    items.forEach(it => {
        const row = document.createElement('div');
        row.className = 'receipt-item-row';
        const pName = it.productName || it.product_name || 'Tiramisu';
        const isRew = it.isReward ?? it.is_reward ?? false;
        const itPrice = Number(it.price ?? 0);
        const itQty = Number(it.quantity ?? 1);
        const itTotal = Number(it.total ?? (itPrice * itQty));
        row.innerHTML = `
            <span>${pName} x ${itQty}</span>
            <span>${isRew ? 'FREE' : `${curr}${itTotal.toLocaleString('en-IN')}`}</span>
        `;
        itemsContainer.appendChild(row);
    });

    // Loyalty in receipt
    const loyaltyStatus = document.getElementById('recLoyaltyStatus');
    const loyaltyNote = document.getElementById('recLoyaltyNote');
    const rewardName = settings.rewardItemName || '1 Free 150g Tiramisu';
    if (loyalty.isEligible) {
        loyaltyStatus.textContent = `Loyalty Progress: ${loyalty.threshold} / ${loyalty.threshold} Cups (Eligible!)`;
        loyaltyNote.textContent = `Customer is eligible for ${rewardName}!`;
    } else {
        loyaltyStatus.textContent = `Loyalty Progress: ${loyalty.currentCycleProgress} / ${loyalty.threshold} Cups`;
        loyaltyNote.textContent = `${loyalty.cupsRemaining} more cup(s) to unlock your free reward!`;
    }

    // Business branding in receipt
    const recLogo = document.getElementById('recLogo');
    if (recLogo) recLogo.src = settings.logo || 'assets/tira-belle-logo.png';
    const recBizName = document.getElementById('recBizName');
    if (recBizName) recBizName.textContent = settings.businessName || 'TIRA Belle';
    const recTagline = document.getElementById('recTagline');
    if (recTagline) recTagline.textContent = (settings.tagline || 'LITTLE LAYERS • BIG LOVE').toUpperCase();
    const recSlogan = document.getElementById('recSlogan');
    if (recSlogan) recSlogan.textContent = settings.slogan || 'Handcrafted Italian Tiramisu';
    const recAddress = document.getElementById('recAddress');
    if (recAddress) recAddress.textContent = settings.address || 'Physical Dessert Studio & Artisan Counter, Pune';
    const recFooterSlogan = document.getElementById('recFooterSlogan');
    if (recFooterSlogan) recFooterSlogan.textContent = 'Thank you for tasting the love in every spoon!';
    const recFooterContact = document.getElementById('recFooterContact');
    if (recFooterContact) {
        const secPhone = settings.phoneSecondary ? ` / ${settings.phoneSecondary}` : '';
        recFooterContact.textContent = `Owners: ${settings.owner || 'Yash Chauhan & Tejas Chauhan'} • ${settings.phone || '9373484198'}${secPhone}`;
    }

    document.getElementById('receiptModal').classList.add('active');
    if (window.lucide) window.lucide.createIcons();
};

window.closeReceiptModal = function() {
    document.getElementById('receiptModal').classList.remove('active');
};

window.printReceipt = function() {
    window.print();
};

/**
 * Renders the receipt into a high-DPI canvas to produce an actual PNG image file
 * preserving all exact design, layout, branding, items, and loyalty details.
 */
async function createReceiptImageCanvas(data) {
    const canvas = document.createElement('canvas');
    const width = 420;
    
    // Calculate required height based on item rows
    const baseHeight = 520;
    const itemsHeight = Math.max(1, data.items.length) * 26;
    const height = baseHeight + itemsHeight;

    // 2x Retina resolution
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.scale(2, 2);

    // 1. Receipt paper background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Subtle paper border
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#e8dbcb';
    ctx.strokeRect(6, 6, width - 12, height - 12);

    // Decorative top caramel accent bar
    ctx.fillStyle = '#b7793d';
    ctx.fillRect(6, 6, width - 12, 4);

    let y = 26;

    // 2. Logo (if available)
    if (data.logoSrc) {
        try {
            const logoImg = await new Promise(resolve => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = data.logoSrc;
                setTimeout(() => resolve(null), 1200);
            });
            if (logoImg) {
                const logoH = 44;
                const aspect = logoImg.width / logoImg.height;
                const logoW = Math.min(130, logoH * aspect);
                ctx.drawImage(logoImg, (width - logoW) / 2, y, logoW, logoH);
                y += logoH + 8;
            } else {
                y += 6;
            }
        } catch (_) {
            y += 6;
        }
    } else {
        y += 10;
    }

    // 3. Header Branding
    ctx.fillStyle = '#24140e';
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px Georgia, "Playfair Display", serif';
    ctx.fillText(data.bizName || 'TIRA Belle', width / 2, y);

    y += 18;
    ctx.fillStyle = '#b7793d';
    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText((data.tagline || 'LITTLE LAYERS • BIG LOVE').toUpperCase(), width / 2, y);

    y += 16;
    ctx.fillStyle = '#6e584d';
    ctx.font = 'italic 12px Georgia, serif';
    ctx.fillText(data.slogan || 'Layers of Love in Every Spoon', width / 2, y);

    y += 15;
    ctx.fillStyle = '#777777';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(data.address || 'Physical Dessert Studio & Artisan Counter, Pune', width / 2, y);

    y += 17;
    ctx.fillStyle = '#555555';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(data.date, width / 2, y);

    y += 16;
    ctx.fillStyle = '#24140e';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`Receipt: ${data.recId}`, width / 2, y);

    // 4. Dashed divider
    y += 16;
    ctx.strokeStyle = '#cccccc';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(22, y);
    ctx.lineTo(width - 22, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Customer & Payment Details (Left aligned)
    y += 18;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#24140e';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`Customer: ${data.custName}`, 24, y);

    y += 18;
    ctx.fillText(`Phone: ${data.custPhone}`, 24, y);

    y += 18;
    ctx.fillText(`Payment: ${data.payMode}`, 24, y);

    // 6. Dashed divider before items
    y += 16;
    ctx.strokeStyle = '#cccccc';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(22, y);
    ctx.lineTo(width - 22, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 7. Items list
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    data.items.forEach(it => {
        y += 22;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#24140e';
        ctx.fillText(it.name, 24, y);

        ctx.textAlign = 'right';
        ctx.fillStyle = it.price === 'FREE' ? '#27ae60' : '#24140e';
        ctx.fillText(it.price, width - 24, y);
    });

    // 8. Total Section
    y += 16;
    ctx.strokeStyle = '#24140e';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(22, y);
    ctx.lineTo(width - 22, y);
    ctx.stroke();

    y += 24;
    ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#24140e';
    ctx.fillText('TOTAL PAID', 24, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#b7793d';
    ctx.font = 'bold 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(data.grandTotal, width - 24, y);

    // 9. Loyalty Progress Box
    y += 18;
    ctx.fillStyle = '#fdfaf5';
    ctx.fillRect(22, y, width - 44, 52);
    ctx.strokeStyle = '#c59b6d';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(22, y, width - 44, 52);
    ctx.setLineDash([]);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#22120b';
    ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(data.loyaltyStatus, width / 2, y + 21);

    ctx.fillStyle = data.loyaltyNote && data.loyaltyNote.includes('eligible') ? '#27ae60' : '#666666';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(data.loyaltyNote, width / 2, y + 39);

    // 10. Footer Section
    y += 72;
    ctx.fillStyle = '#555555';
    ctx.font = 'italic 11px Georgia, serif';
    ctx.fillText(data.footerSlogan || 'Thank you for tasting the love in every spoon!', width / 2, y);

    y += 16;
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#777777';
    ctx.fillText(data.footerContact, width / 2, y);

    return canvas;
}

/**
 * Feature: Share Receipt Image on WhatsApp
 * Generates the authentic receipt image for the selected transaction, validates
 * and formats the customer's WhatsApp number with country code, and opens WhatsApp
 * with the image prepared/attached for immediate sending.
 */
window.shareReceiptOnWhatsApp = async function() {
    const btn = document.getElementById('btnShareWhatsAppReceipt');
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" data-size="16"></i> <span>Preparing Image...</span>';
        if (window.lucide) window.lucide.createIcons();
    }

    try {
        // 1. Retrieve all current receipt details
        const recId = document.getElementById('recId')?.textContent?.trim() || 'TXN-1001';
        const recDate = document.getElementById('recDate')?.textContent?.trim() || '';
        const custName = document.getElementById('recCustName')?.textContent?.trim() || 'Valued Guest';
        const custPhone = document.getElementById('recCustPhone')?.textContent?.trim() || '';
        const payMode = document.getElementById('recPayMode')?.textContent?.trim() || 'Cash';
        const grandTotal = document.getElementById('recGrandTotal')?.textContent?.trim() || '₹0';
        const loyaltyStatus = document.getElementById('recLoyaltyStatus')?.textContent?.trim() || '';
        const loyaltyNote = document.getElementById('recLoyaltyNote')?.textContent?.trim() || '';
        const bizName = document.getElementById('recBizName')?.textContent?.trim() || 'TIRA Belle';
        const tagline = document.getElementById('recTagline')?.textContent?.trim() || 'LITTLE LAYERS • BIG LOVE';
        const slogan = document.getElementById('recSlogan')?.textContent?.trim() || 'Layers of Love in Every Spoon';
        const address = document.getElementById('recAddress')?.textContent?.trim() || 'Physical Dessert Studio & Artisan Counter, Pune';
        const footerSlogan = document.getElementById('recFooterSlogan')?.textContent?.trim() || 'Thank you for tasting the love in every spoon!';
        const footerContact = document.getElementById('recFooterContact')?.textContent?.trim() || '';
        const logoSrc = document.getElementById('recLogo')?.src || 'assets/tira-belle-logo.png';

        // 2. Validate customer WhatsApp number
        const digitsOnly = custPhone.replace(/\D/g, '');
        if (!digitsOnly || digitsOnly.length < 10) {
            showToast(`Cannot share on WhatsApp: Customer phone number is invalid or missing ("${custPhone || 'empty'}"). Please ensure a valid 10-digit number.`, 'error');
            return;
        }

        // Format with country code (defaults to India 91 for 10-digit numbers)
        let formattedPhone = digitsOnly;
        if (digitsOnly.length === 10) {
            formattedPhone = '91' + digitsOnly;
        }

        // 3. Extract items list
        const items = [];
        document.querySelectorAll('#recItemsList .receipt-item-row').forEach(row => {
            const spans = row.querySelectorAll('span');
            if (spans.length >= 2) {
                items.push({
                    name: spans[0].textContent.trim(),
                    price: spans[1].textContent.trim()
                });
            }
        });

        // 4. Generate the high-resolution receipt Canvas & Image Blob
        const receiptData = {
            recId, date: recDate, custName, custPhone, payMode, grandTotal,
            loyaltyStatus, loyaltyNote, bizName, tagline, slogan, address,
            footerSlogan, footerContact, logoSrc, items
        };

        const canvas = await createReceiptImageCanvas(receiptData);

        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(b => {
                if (b) resolve(b);
                else reject(new Error('Failed to generate receipt image blob from canvas'));
            }, 'image/png');
        });

        const receiptFileName = `tira-belle-receipt-${recId}.png`;
        let receiptFile = null;
        try {
            receiptFile = new File([blob], receiptFileName, { type: 'image/png' });
        } catch (_) {
            receiptFile = null;
        }

        // 5. WhatsApp Message
        const waMessage = `Thank you for your purchase at ${bizName}! Here is your receipt (${recId}).`;
        const encodedMessage = encodeURIComponent(waMessage);

        const isMobile = /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent);
        const waUrlApp = `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
        const waUrlWeb = `https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodedMessage}`;

        // 6. Native Share API with File (Supported on mobile and supporting desktop environments)
        if (navigator.share && receiptFile && navigator.canShare && navigator.canShare({ files: [receiptFile] })) {
            try {
                await navigator.share({
                    title: `${bizName} Receipt #${recId}`,
                    text: waMessage,
                    files: [receiptFile]
                });
                showToast(`Receipt image prepared for sharing with ${custName}!`, 'success');
                return;
            } catch (shareErr) {
                if (shareErr.name === 'AbortError') {
                    // User dismissed share dialog
                    return;
                }
                console.warn('Native share error, continuing with WhatsApp Web flow:', shareErr);
            }
        }

        // 7. Desktop & WhatsApp Web Flow:
        // Copy image directly to Clipboard (PNG Image Item)
        let copiedToClipboard = false;
        if (navigator.clipboard && window.ClipboardItem) {
            try {
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);
                copiedToClipboard = true;
            } catch (clipErr) {
                console.warn('Clipboard image write failed:', clipErr);
            }
        }

        // Download receipt image file so it is readily accessible on device
        try {
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = receiptFileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
        } catch (dlErr) {
            console.warn('Auto-download error:', dlErr);
        }

        // Open WhatsApp directly to the customer's conversation
        const targetUrl = isMobile ? waUrlApp : waUrlWeb;
        window.open(targetUrl, '_blank', 'noopener,noreferrer');

        // Clear, explicit guidance for user confirmation
        if (window.TiraAlert && typeof window.TiraAlert.alert === 'function') {
            window.TiraAlert.alert({
                title: 'WhatsApp Chat Opened',
                message: `Opened WhatsApp chat for <strong>${custName}</strong> (+${formattedPhone}).<br><br>The receipt image has been <strong>copied to your clipboard</strong> and downloaded.<br><br>👉 <strong>Press Ctrl+V (Paste)</strong> in the WhatsApp chat to send the receipt image!`,
                type: 'info',
                buttonText: 'Got it!'
            });
        } else {
            showToast(`Opened WhatsApp for ${custName}! Receipt image copied to clipboard — press Ctrl+V to send image.`, 'info');
        }

    } catch (error) {
        console.error('Error sharing receipt on WhatsApp:', error);
        showToast('Could not share receipt image: ' + (error.message || 'Unknown error'), 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            if (window.lucide) window.lucide.createIcons();
        }
    }
};

// ----------------- SECTION: CATEGORY MANAGEMENT -----------------
window.renderCategoriesSection = function() {
    const container = document.getElementById('adminCategoriesContainer');
    if (!container) return;

    const categories = window.TiraDB.getCategories(false);
    const products = window.TiraDB.getProducts(false);
    const settings = window.TiraDB.getSettings();
    const curr = settings.currency || '₹';

    // Update Overview Metric Counts
    const totalCountEl = document.getElementById('catTotalCount');
    const activeCountEl = document.getElementById('catActiveCount');
    const prodCountEl = document.getElementById('catProductCount');

    if (totalCountEl) totalCountEl.textContent = categories.length;
    if (activeCountEl) activeCountEl.textContent = categories.filter(c => c.isActive).length;
    if (prodCountEl) prodCountEl.textContent = products.filter(p => p.categoryId).length;

    container.innerHTML = '';

    if (!categories.length) {
        container.innerHTML = `
            <div class="card" style="text-align: center; padding: 48px 20px;">
                <div class="upload-icon-circle" style="margin: 0 auto 14px auto;">
                    <i data-lucide="layers" data-size="32"></i>
                </div>
                <h3 style="font-family: var(--font-heading); font-size: 1.3rem; color: var(--color-espresso); margin-bottom: 6px;">No Categories Created Yet</h3>
                <p style="color: var(--color-text-muted); font-size: 0.92rem; margin-bottom: 20px;">Organize your handcrafted desserts into beautiful categories.</p>
                <button class="btn btn-caramel btn-sm" onclick="openCategoryModal()">
                    <i data-lucide="plus" data-size="16"></i>
                    <span>Create First Category</span>
                </button>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    categories.forEach(cat => {
        const catCard = document.createElement('div');
        catCard.className = 'admin-category-card';

        // Filter products associated with this category
        const catProducts = products.filter(p => p.categoryId === cat.id);

        let galleryHtml = '';
        if (catProducts.length > 0) {
            galleryHtml = `
                <div class="admin-cat-gallery-grid">
                    ${catProducts.map(p => `
                        <div class="admin-cat-product-thumb" onclick="editProduct('${p.id}')" title="Click to edit ${escapeHtml(p.name)}">
                            <div class="admin-cat-product-thumb-media">
                                <img src="${p.image || 'assets/classic/tiramisu-classic-150 g.png'}" alt="${escapeHtml(p.name)}" onerror="this.src='assets/poster/tiramisu-classic-poster.png'">
                            </div>
                            <div class="admin-cat-product-thumb-info">
                                <div class="admin-cat-product-thumb-name">${escapeHtml(p.name)}</div>
                                <div class="admin-cat-product-thumb-price">${curr}${p.price} • ${escapeHtml(p.weight || '')}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            galleryHtml = `
                <div class="admin-cat-gallery-empty">
                    <i data-lucide="image" data-size="24" style="margin-bottom: 6px; color: var(--color-caramel); display: inline-block;"></i>
                    <div>No products or images in this category yet.</div>
                </div>
            `;
        }

        catCard.innerHTML = `
            <div class="admin-cat-header">
                <div class="admin-cat-identity">
                    <img src="${cat.image || (catProducts.length && catProducts[0].image ? catProducts[0].image : 'assets/tira-belle-logo.png')}" 
                         alt="${escapeHtml(cat.name)}" class="admin-cat-cover-img" onerror="this.src='assets/tira-belle-logo.png'">
                    <div class="admin-cat-title-group">
                        <h3>${escapeHtml(cat.name)}</h3>
                        <div class="admin-cat-badges">
                            <span class="badge ${cat.isActive ? 'badge-success' : 'badge-warning'}">
                                ${cat.isActive ? 'Active (Live)' : 'Hidden'}
                            </span>
                            <span class="badge" style="background: var(--color-bg); border: 1px solid var(--color-border);">
                                Order: #${cat.displayOrder || 1}
                            </span>
                            <span class="badge" style="background: var(--color-caramel-subtle); color: var(--color-caramel);">
                                ${catProducts.length} Product${catProducts.length === 1 ? '' : 's'}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="admin-cat-actions">
                    <button class="btn btn-outline btn-sm" onclick="openProductModal(null, '${cat.id}')" title="Add Product to this Category" style="display: inline-flex; align-items: center; gap: 4px;">
                        <i data-lucide="plus" data-size="14"></i>
                        <span>Add Product</span>
                    </button>
                    <button class="btn btn-outline btn-sm" onclick="editCategory('${cat.id}')" title="Edit Category" style="display: inline-flex; align-items: center; gap: 4px;">
                        <i data-lucide="pencil" data-size="14"></i>
                        <span>Edit</span>
                    </button>
                    <button class="btn btn-outline btn-sm" style="color: #c0392b;" onclick="deleteCategory('${cat.id}')" title="Delete Category" style="display: inline-flex; align-items: center; gap: 4px;">
                        <i data-lucide="trash-2" data-size="14"></i>
                        <span>Delete</span>
                    </button>
                </div>
            </div>

            ${cat.description ? `<p class="admin-cat-desc">${escapeHtml(cat.description)}</p>` : ''}

            <!-- Associated Images & Products Strip -->
            <div class="admin-cat-gallery-box">
                <div class="admin-cat-gallery-title">
                    <span>Associated Images &amp; Products (${catProducts.length})</span>
                    <button type="button" class="btn btn-outline btn-xs" onclick="openProductModal(null, '${cat.id}')">
                        <i data-lucide="image-plus" data-size="12"></i>
                        <span>Upload New Product</span>
                    </button>
                </div>
                ${galleryHtml}
            </div>
        `;

        container.appendChild(catCard);
    });

    if (window.lucide) window.lucide.createIcons();
};

window.openCategoryModal = function(category = null) {
    const modal = document.getElementById('categoryModal');
    const title = document.getElementById('categoryModalTitle');
    if (!modal) return;

    if (category) {
        title.textContent = 'Edit Category';
        document.getElementById('catEditId').value = category.id;
        document.getElementById('catName').value = category.name || '';
        document.getElementById('catDesc').value = category.description || '';
        document.getElementById('catDisplayOrder').value = category.displayOrder || 1;
        document.getElementById('catActive').checked = !!category.isActive;

        // Image preview
        if (category.image) {
            document.getElementById('catImage').value = category.image;
            document.getElementById('catImagePreviewImg').src = category.image;
            document.getElementById('catImageFilename').textContent = category.image.split('/').pop() || 'Cover Image';
            document.getElementById('catImageFilesize').textContent = 'Saved Image';
            document.getElementById('catImageDropArea').style.display = 'none';
            document.getElementById('catImagePreviewArea').style.display = 'flex';
        } else {
            removeCatImage();
        }
    } else {
        title.textContent = 'Add New Category';
        document.getElementById('catEditId').value = '';
        document.getElementById('categoryForm').reset();
        document.getElementById('catActive').checked = true;
        const currentCats = window.TiraDB.getCategories(false);
        document.getElementById('catDisplayOrder').value = currentCats.length + 1;
        removeCatImage();
    }

    modal.classList.add('active');
    if (window.lucide) window.lucide.createIcons();
};

window.closeCategoryModal = function() {
    const modal = document.getElementById('categoryModal');
    if (modal) modal.classList.remove('active');
};

window.editCategory = function(catId) {
    const cat = window.TiraDB.getCategoryById(catId);
    if (cat) openCategoryModal(cat);
};

window.deleteCategory = async function(catId) {
    const cat = window.TiraDB.getCategoryById(catId);
    const catName = cat ? cat.name : 'this category';
    const confirmed = window.TiraAlert ? await window.TiraAlert.confirm({
        title: 'Delete Category?',
        message: `Are you sure you want to delete the category "${catName}"? Associated products will remain in your catalog but become unlinked.`,
        type: 'danger',
        confirmText: 'Delete Category',
        cancelText: 'Keep Category',
        icon: 'trash-2'
    }) : window.confirm(`Are you sure you want to delete category "${catName}"?`);

    if (confirmed) {
        window.TiraDB.deleteCategory(catId);
        showToast('Category deleted successfully.', 'info');
        renderCategoriesSection();
        renderProductsTable();
        renderPosCatalog();
    }
};

window.saveCategorySubmit = function() {
    const id = document.getElementById('catEditId').value.trim();
    const name = document.getElementById('catName').value.trim();
    const description = document.getElementById('catDesc').value.trim();
    const displayOrder = parseInt(document.getElementById('catDisplayOrder').value, 10) || 1;
    const isActive = document.getElementById('catActive').checked;
    const image = document.getElementById('catImage').value.trim();

    if (!name) {
        if (window.TiraAlert) window.TiraAlert.warning('Please enter a category name.', 'Validation');
        return;
    }

    window.TiraDB.saveCategory({
        id: id || undefined,
        name,
        description,
        displayOrder,
        isActive,
        image
    });

    closeCategoryModal();
    showToast('Category saved successfully!', 'success');
    renderCategoriesSection();
    renderProductsTable();
    renderPosCatalog();
};

// ----------------- IMAGE UPLOAD CLIENT HELPERS -----------------
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

window.handleProductImageFile = async function(file) {
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
        if (window.TiraAlert) {
            window.TiraAlert.error(`The file ".${ext}" is not supported. Please upload a PNG, JPG, WEBP, or GIF image.`, 'Invalid Image Format');
        } else {
            alert('Please upload a valid image file (PNG, JPG, WEBP, GIF).');
        }
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        if (window.TiraAlert) {
            window.TiraAlert.warning(`File is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Maximum allowed size is 5 MB.`, 'File Too Large');
        } else {
            alert('File size exceeds 5 MB limit.');
        }
        return;
    }

    // Show preview area and progress spinner
    const dropArea = document.getElementById('prodImageDropArea');
    const previewArea = document.getElementById('prodImagePreviewArea');
    const previewImg = document.getElementById('prodImagePreviewImg');
    const progressOverlay = document.getElementById('prodImageUploadProgress');
    const filenameEl = document.getElementById('prodImageFilename');
    const filesizeEl = document.getElementById('prodImageFilesize');

    // Instant local preview
    previewImg.src = URL.createObjectURL(file);
    filenameEl.textContent = file.name;
    filesizeEl.textContent = formatBytes(file.size);
    dropArea.style.display = 'none';
    previewArea.style.display = 'flex';
    if (progressOverlay) progressOverlay.style.display = 'flex';

    try {
        const uploadRes = await window.TiraDB.uploadImage(file);
        if (uploadRes && uploadRes.url) {
            document.getElementById('prodImage').value = uploadRes.url;
            previewImg.src = uploadRes.url;
            showToast('Image uploaded successfully!', 'success');
        }
    } catch (err) {
        console.error('Image upload failed:', err);
        if (window.TiraAlert) {
            window.TiraAlert.error(err.message || 'Image upload failed. Please try again.', 'Upload Error');
        } else {
            alert('Image upload failed: ' + err.message);
        }
    } finally {
        if (progressOverlay) progressOverlay.style.display = 'none';
        if (window.lucide) window.lucide.createIcons();
    }
};

window.removeProductImage = function() {
    document.getElementById('prodImage').value = '';
    const fileInput = document.getElementById('prodImageFileInput');
    if (fileInput) fileInput.value = '';
    const dropArea = document.getElementById('prodImageDropArea');
    const previewArea = document.getElementById('prodImagePreviewArea');
    if (dropArea) dropArea.style.display = 'flex';
    if (previewArea) previewArea.style.display = 'none';
    if (window.lucide) window.lucide.createIcons();
};

window.handleCatImageFile = async function(file) {
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
        if (window.TiraAlert) window.TiraAlert.error('Please upload a valid image file (PNG, JPG, WEBP, GIF).', 'Invalid Image Format');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        if (window.TiraAlert) window.TiraAlert.warning('File exceeds 5 MB limit.', 'File Too Large');
        return;
    }

    const dropArea = document.getElementById('catImageDropArea');
    const previewArea = document.getElementById('catImagePreviewArea');
    const previewImg = document.getElementById('catImagePreviewImg');
    const progressOverlay = document.getElementById('catImageUploadProgress');
    const filenameEl = document.getElementById('catImageFilename');
    const filesizeEl = document.getElementById('catImageFilesize');

    previewImg.src = URL.createObjectURL(file);
    filenameEl.textContent = file.name;
    filesizeEl.textContent = formatBytes(file.size);
    dropArea.style.display = 'none';
    previewArea.style.display = 'flex';
    if (progressOverlay) progressOverlay.style.display = 'flex';

    try {
        const uploadRes = await window.TiraDB.uploadImage(file);
        if (uploadRes && uploadRes.url) {
            document.getElementById('catImage').value = uploadRes.url;
            previewImg.src = uploadRes.url;
            showToast('Category image uploaded!', 'success');
        }
    } catch (err) {
        console.error('Category image upload failed:', err);
    } finally {
        if (progressOverlay) progressOverlay.style.display = 'none';
        if (window.lucide) window.lucide.createIcons();
    }
};

window.removeCatImage = function() {
    document.getElementById('catImage').value = '';
    const fileInput = document.getElementById('catImageFileInput');
    if (fileInput) fileInput.value = '';
    const dropArea = document.getElementById('catImageDropArea');
    const previewArea = document.getElementById('catImagePreviewArea');
    if (dropArea) dropArea.style.display = 'flex';
    if (previewArea) previewArea.style.display = 'none';
    if (window.lucide) window.lucide.createIcons();
};

function setupImageDropzones() {
    // Setup Drag and Drop for Product Image
    const prodDrop = document.getElementById('prodImageDropArea');
    if (prodDrop && !prodDrop._dragConfigured) {
        prodDrop._dragConfigured = true;
        ['dragenter', 'dragover'].forEach(name => {
            prodDrop.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                prodDrop.classList.add('dragover');
            });
        });
        ['dragleave', 'drop'].forEach(name => {
            prodDrop.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                prodDrop.classList.remove('dragover');
            });
        });
        prodDrop.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                handleProductImageFile(files[0]);
            }
        });
    }

    // Setup Drag and Drop for Category Image
    const catDrop = document.getElementById('catImageDropArea');
    if (catDrop && !catDrop._dragConfigured) {
        catDrop._dragConfigured = true;
        ['dragenter', 'dragover'].forEach(name => {
            catDrop.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                catDrop.classList.add('dragover');
            });
        });
        ['dragleave', 'drop'].forEach(name => {
            catDrop.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                catDrop.classList.remove('dragover');
            });
        });
        catDrop.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                handleCatImageFile(files[0]);
            }
        });
    }
}

// ----------------- SECTION 3: PRODUCT MANAGEMENT -----------------
window.renderProductsTable = function() {
    const tbody = document.getElementById('adminProductsTableTbody');
    if (!tbody) return;

    const categories = window.TiraDB.getCategories(false);
    const catMap = new Map(categories.map(c => [c.id, c.name]));

    // Populate category filter dropdown if present
    const filterSelect = document.getElementById('adminProductCategoryFilter');
    if (filterSelect) {
        const curVal = filterSelect.value;
        let optHtml = `<option value="all">All Categories (${window.TiraDB.getProducts(false).length})</option>`;
        categories.forEach(c => {
            const count = window.TiraDB.getProducts(false).filter(p => p.categoryId === c.id).length;
            optHtml += `<option value="${c.id}" ${curVal === c.id ? 'selected' : ''}>${escapeHtml(c.name)} (${count})</option>`;
        });
        filterSelect.innerHTML = optHtml;
    }

    let products = window.TiraDB.getProducts(false); // All products
    const filterVal = filterSelect ? filterSelect.value : 'all';
    if (filterVal && filterVal !== 'all') {
        products = products.filter(p => p.categoryId === filterVal);
    }

    const settings = window.TiraDB.getSettings();
    const curr = settings.currency || '₹';

    tbody.innerHTML = '';
    if (!products.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 36px 10px; color: var(--color-text-muted);">
                    <i data-lucide="package-search" data-size="28" style="margin-bottom: 6px; color: var(--color-caramel);"></i>
                    <div>No products found matching the selected category.</div>
                </td>
            </tr>
        `;
    } else {
        products.forEach(p => {
            const tr = document.createElement('tr');
            const categoryName = catMap.get(p.categoryId) || 'Unassigned';
            tr.innerHTML = `
                <td>
                    <img src="${p.image || 'assets/classic/tiramisu-classic-150 g.png'}" alt="${escapeHtml(p.name)}" style="width: 48px; height: 48px; border-radius: 8px; object-fit: cover; border: 1px solid var(--color-border);" onerror="this.src='assets/poster/tiramisu-classic-poster.png'">
                </td>
                <td>
                    <strong>${escapeHtml(p.name)}</strong>
                    <div style="font-size: 0.78rem; color: var(--color-text-muted); max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(p.description || '')}</div>
                </td>
                <td>
                    <span class="badge" style="background: var(--color-caramel-subtle); color: var(--color-caramel); font-weight: 600;">
                        ${escapeHtml(categoryName)}
                    </span>
                </td>
                <td><span class="badge" style="background: var(--color-bg);">${escapeHtml(p.weight || '')}</span></td>
                <td><strong>${curr}${p.price}</strong></td>
                <td>
                    <span class="badge ${p.countsTowardsLoyalty ? 'badge-success' : 'badge-warning'}">
                        ${p.countsTowardsLoyalty ? 'Eligible' : 'Excluded'}
                    </span>
                </td>
                <td>
                    <span class="badge ${p.isActive ? 'badge-success' : 'badge-warning'}">
                        ${p.isActive ? 'Active (Live)' : 'Hidden'}
                    </span>
                </td>
                <td style="text-align: right;">
                    <div style="display: inline-flex; gap: 6px;">
                        <button class="btn btn-outline btn-sm" onclick="editProduct('${p.id}')" title="Edit Product" style="display: inline-flex; align-items: center; gap: 4px;">
                            <i data-lucide="pencil" data-size="14"></i>
                            <span>Edit</span>
                        </button>
                        <button class="btn btn-outline btn-sm" style="color: #c0392b;" onclick="deleteProduct('${p.id}')" title="Delete Product" style="display: inline-flex; align-items: center; gap: 4px;">
                            <i data-lucide="trash-2" data-size="14"></i>
                            <span>Delete</span>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
    if (window.lucide) window.lucide.createIcons();
};

window.openProductModal = function(product = null, defaultCategoryId = null) {
    const modal = document.getElementById('productModal');
    const title = document.getElementById('productModalTitle');
    const catSelect = document.getElementById('prodCategory');

    // Populate category dropdown
    const categories = window.TiraDB.getCategories(false);
    if (catSelect) {
        catSelect.innerHTML = categories.map(c => `
            <option value="${c.id}">${escapeHtml(c.name)}</option>
        `).join('');
    }

    if (product) {
        title.textContent = 'Edit Product';
        document.getElementById('prodEditId').value = product.id;
        document.getElementById('prodName').value = product.name || '';
        document.getElementById('prodWeight').value = product.weight || '';
        document.getElementById('prodPrice').value = product.price || 0;
        document.getElementById('prodDesc').value = product.description || '';
        document.getElementById('prodActive').checked = !!product.isActive;
        document.getElementById('prodCountsLoyalty').checked = !!product.countsTowardsLoyalty;

        if (catSelect && product.categoryId) {
            catSelect.value = product.categoryId;
        }

        // Image state
        if (product.image) {
            document.getElementById('prodImage').value = product.image;
            document.getElementById('prodImagePreviewImg').src = product.image;
            document.getElementById('prodImageFilename').textContent = product.image.split('/').pop() || 'Product Image';
            document.getElementById('prodImageFilesize').textContent = 'Saved Image';
            document.getElementById('prodImageDropArea').style.display = 'none';
            document.getElementById('prodImagePreviewArea').style.display = 'flex';
        } else {
            removeProductImage();
        }
    } else {
        title.textContent = 'Add New Product';
        document.getElementById('prodEditId').value = '';
        document.getElementById('productForm').reset();
        document.getElementById('prodActive').checked = true;
        document.getElementById('prodCountsLoyalty').checked = true;
        if (catSelect) {
            if (defaultCategoryId) {
                catSelect.value = defaultCategoryId;
            } else if (categories.length > 0) {
                catSelect.value = categories[0].id;
            }
        }
        removeProductImage();
    }

    setupImageDropzones();
    modal.classList.add('active');
    if (window.lucide) window.lucide.createIcons();
};

window.closeProductModal = function() {
    document.getElementById('productModal').classList.remove('active');
};

window.editProduct = function(productId) {
    const p = window.TiraDB.getProductById(productId);
    if (p) openProductModal(p);
};

window.deleteProduct = async function(productId) {
    const p = window.TiraDB.getProductById(productId);
    const prodName = p ? p.name : 'this product';
    const confirmed = window.TiraAlert ? await window.TiraAlert.confirm({
        title: 'Delete Product?',
        message: `Are you sure you want to delete "${prodName}"? It will no longer appear on the customer storefront or POS catalog.`,
        type: 'danger',
        confirmText: 'Delete Product',
        cancelText: 'Keep Product',
        icon: 'trash-2'
    }) : window.confirm('Are you sure you want to delete this product?');

    if (confirmed) {
        window.TiraDB.deleteProduct(productId);
        showToast('Product removed.', 'info');
        renderProductsTable();
        renderCategoriesSection();
        renderPosCatalog();
    }
};

window.saveProductSubmit = function() {
    const id = document.getElementById('prodEditId').value;
    const name = document.getElementById('prodName').value.trim();
    const categoryId = document.getElementById('prodCategory') ? document.getElementById('prodCategory').value : null;
    const weight = document.getElementById('prodWeight').value.trim();
    const price = parseFloat(document.getElementById('prodPrice').value) || 0;
    const image = document.getElementById('prodImage').value.trim() || 'assets/classic/tiramisu-classic-150 g.png';
    const description = document.getElementById('prodDesc').value.trim();
    const isActive = document.getElementById('prodActive').checked;
    const countsTowardsLoyalty = document.getElementById('prodCountsLoyalty').checked;

    if (!name) {
        if (window.TiraAlert) window.TiraAlert.warning('Please enter a product name.', 'Validation');
        return;
    }

    window.TiraDB.saveProduct({
        id: id || undefined,
        categoryId: categoryId || undefined,
        name,
        weight,
        price,
        image,
        description,
        isActive,
        countsTowardsLoyalty
    });

    closeProductModal();
    showToast('Product saved successfully!', 'success');
    renderProductsTable();
    renderCategoriesSection();
    renderPosCatalog();
};

// ----------------- SECTION 4: CUSTOMER DETAILS & FILTERS -----------------
let activeCustomerFilter = 'all'; // 'all' | 'cash' | 'online' | '150g' | '350g' | 'claimed'

window.setCustomerFilter = function(filterKey) {
    activeCustomerFilter = filterKey;

    // Update active class on filter buttons
    const filterIds = {
        'all': 'chipFilterAll',
        'cash': 'chipFilterCash',
        'online': 'chipFilterOnline',
        '150g': 'chipFilter150g',
        '350g': 'chipFilter350g',
        'claimed': 'chipFilterClaimed'
    };

    Object.values(filterIds).forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.remove('active');
    });

    const activeBtn = document.getElementById(filterIds[filterKey]);
    if (activeBtn) activeBtn.classList.add('active');

    const resetBtn = document.getElementById('resetCustomerFilterBtn');
    if (resetBtn) {
        resetBtn.style.display = filterKey === 'all' ? 'none' : 'inline-flex';
    }

    renderCustomersTable();
};

window.onCustomerDateSelect = function(selectedDate) {
    const display = document.getElementById('custDatePickerDisplay');
    const resetBtn = document.getElementById('btnCustResetAll');
    const picker = document.getElementById('customerDatePicker');

    if (picker && selectedDate) {
        picker.value = selectedDate;
    }

    if (selectedDate) {
        const formatted = formatDisplayDate(selectedDate);
        const todayStr = getLocalDateString(new Date());
        if (display) {
            display.textContent = (selectedDate === todayStr) ? `Today • ${formatted}` : formatted;
        }
        if (resetBtn) resetBtn.style.display = 'inline-flex';
        showToast(`Filtered customers for ${formatted}`, 'info');
    } else {
        if (display) display.textContent = 'All Time Records';
        if (resetBtn) resetBtn.style.display = 'none';
    }

    window.adminCustCurrentPage = 1;
    renderCustomersTable();
};

window.resetCustomerDateFilter = function() {
    const picker = document.getElementById('customerDatePicker');
    const display = document.getElementById('custDatePickerDisplay');
    const resetBtn = document.getElementById('btnCustResetAll');

    if (picker) picker.value = '';
    if (display) display.textContent = 'All Time Records';
    if (resetBtn) resetBtn.style.display = 'none';

    window.adminCustCurrentPage = 1;
    renderCustomersTable();
    showToast('Showing all registered customers', 'info');
};

window.renderCustomersTable = function() {
    const tbody = document.getElementById('adminCustomersTableTbody');
    if (!tbody) return;
    const query = document.getElementById('customerSearchInput')?.value.trim().toLowerCase() || '';
    const cleanDigits = query.replace(/\D/g, '');
    const customers = window.TiraDB.getCustomers();
    const sales = window.TiraDB.getSales();
    const redemptions = window.TiraDB.getRedemptions();
    const settings = window.TiraDB.getSettings();
    const curr = settings.currency || '₹';

    const datePicker = document.getElementById('customerDatePicker');
    const selectedDate = datePicker?.value || '';

    let customerMetaList = [];

    if (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
        // Filter by selected specific date
        const daySales = sales.filter(s => s.date === selectedDate);
        const dayRedemptions = redemptions.filter(r => r.date === selectedDate);
        const activePhones = new Set([
            ...daySales.map(s => (s.customerPhone || '').replace(/\D/g, '')),
            ...dayRedemptions.map(r => (r.customerPhone || '').replace(/\D/g, ''))
        ]);

        customers.forEach(c => {
            const cleanPhone = (c.phone || '').trim().replace(/\D/g, '');
            if (!activePhones.has(cleanPhone)) return;

            const custDaySales = daySales.filter(s => (s.customerPhone || '').replace(/\D/g, '') === cleanPhone);
            const custDayRedemptions = dayRedemptions.filter(r => (r.customerPhone || '').replace(/\D/g, '') === cleanPhone);
            const loyalty = window.TiraDB.getCustomerLoyalty(c.phone);

            const dateSpend = custDaySales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
            const dateCups = custDaySales.reduce((acc, s) => {
                const sItems = Array.isArray(s.items) ? s.items : [];
                const nonReward = sItems.reduce((sum, it) => (it.isReward || it.is_reward) ? sum : sum + Number(it.quantity || 1), 0);
                return acc + (sItems.length > 0 ? nonReward : Number(s.paidCupsCount || 0));
            }, 0);
            const hasCash = custDaySales.some(s => s.paymentMode === 'Cash');
            const hasOnline = custDaySales.some(s => s.paymentMode === 'Online');

            let has150g = false;
            let has350g = false;
            custDaySales.forEach(s => {
                (s.items || []).forEach(it => {
                    const pid = (it.productId || '').toLowerCase();
                    const pname = (it.productName || '').toLowerCase();
                    const pweight = (it.weight || '').toLowerCase();
                    if (pid.includes('150') || pname.includes('150') || pweight.includes('150')) has150g = true;
                    if (pid.includes('350') || pname.includes('350') || pweight.includes('350')) has350g = true;
                });
            });

            const hasClaimed = custDayRedemptions.length > 0;

            customerMetaList.push({
                customer: c,
                cleanPhone,
                loyalty,
                totalSpend: dateSpend,
                dateSpend,
                dateCups,
                dateOrderCount: custDaySales.length,
                formattedDate: formatDisplayDate(selectedDate),
                isDateFiltered: true,
                hasCash,
                hasOnline,
                has150g,
                has350g,
                hasClaimed
            });
        });
    } else {
        // Lifetime calculation for all registered customers
        customerMetaList = customers.map(c => {
            const cleanPhone = (c.phone || '').trim().replace(/\D/g, '');
            const custSales = sales.filter(s => (s.customerPhone || '').replace(/\D/g, '') === cleanPhone);
            const custRedemptions = redemptions.filter(r => (r.customerPhone || '').replace(/\D/g, '') === cleanPhone);
            const loyalty = window.TiraDB.getCustomerLoyalty(c.phone);
            const totalSpend = custSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
            const totalCups = custSales.reduce((acc, s) => {
                const sItems = Array.isArray(s.items) ? s.items : [];
                const nonReward = sItems.reduce((sum, it) => (it.isReward || it.is_reward) ? sum : sum + Number(it.quantity || 1), 0);
                return acc + (sItems.length > 0 ? nonReward : Number(s.paidCupsCount || 0));
            }, 0);

            // Check payment modes used
            const hasCash = custSales.some(s => s.paymentMode === 'Cash');
            const hasOnline = custSales.some(s => s.paymentMode === 'Online');

            // Check products purchased (150g vs 350g)
            let has150g = false;
            let has350g = false;
            custSales.forEach(s => {
                (s.items || []).forEach(it => {
                    const pid = (it.productId || '').toLowerCase();
                    const pname = (it.productName || '').toLowerCase();
                    const pweight = (it.weight || '').toLowerCase();
                    if (pid.includes('150') || pname.includes('150') || pweight.includes('150')) has150g = true;
                    if (pid.includes('350') || pname.includes('350') || pweight.includes('350')) has350g = true;
                });
            });

            // Check if offer/reward claimed
            const hasClaimed = custRedemptions.length > 0 || (loyalty.claimedCount || 0) > 0;

            return {
                customer: c,
                cleanPhone,
                loyalty,
                totalSpend,
                totalCups,
                dateSpend: totalSpend,
                dateCups: totalCups,
                dateOrderCount: loyalty.completedPurchasesCount,
                isDateFiltered: false,
                hasCash,
                hasOnline,
                has150g,
                has350g,
                hasClaimed
            };
        });
    }

    // Compute badges / counts for each filter chip
    const countAll = customerMetaList.length;
    const countCash = customerMetaList.filter(item => item.hasCash).length;
    const countOnline = customerMetaList.filter(item => item.hasOnline).length;
    const count150g = customerMetaList.filter(item => item.has150g).length;
    const count350g = customerMetaList.filter(item => item.has350g).length;
    const countClaimed = customerMetaList.filter(item => item.hasClaimed).length;

    const elCountAll = document.getElementById('countFilterAll');
    const elCountCash = document.getElementById('countFilterCash');
    const elCountOnline = document.getElementById('countFilterOnline');
    const elCount150g = document.getElementById('countFilter150g');
    const elCount350g = document.getElementById('countFilter350g');
    const elCountClaimed = document.getElementById('countFilterClaimed');

    if (elCountAll) elCountAll.textContent = countAll;
    if (elCountCash) elCountCash.textContent = countCash;
    if (elCountOnline) elCountOnline.textContent = countOnline;
    if (elCount150g) elCount150g.textContent = count150g;
    if (elCount350g) elCount350g.textContent = count350g;
    if (elCountClaimed) elCountClaimed.textContent = countClaimed;

    // Filter by search query + active category filter
    const filtered = customerMetaList.filter(item => {
        // Search text filter
        if (query) {
            const matchName = (item.customer.name || '').toLowerCase().includes(query);
            const matchPhone = cleanDigits.length >= 2 && item.cleanPhone.includes(cleanDigits);
            if (!matchName && !matchPhone) return false;
        }

        // Active criteria filter
        if (activeCustomerFilter === 'cash') return item.hasCash;
        if (activeCustomerFilter === 'online') return item.hasOnline;
        if (activeCustomerFilter === '150g') return item.has150g;
        if (activeCustomerFilter === '350g') return item.has350g;
        if (activeCustomerFilter === 'claimed') return item.hasClaimed;
        return true;
    });

    // Pagination state
    if (typeof window.adminCustCurrentPage === 'undefined') {
        window.adminCustCurrentPage = 1;
    }
    const pageSize = 10;
    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    if (window.adminCustCurrentPage > totalPages) window.adminCustCurrentPage = totalPages;
    if (window.adminCustCurrentPage < 1) window.adminCustCurrentPage = 1;

    const startIdx = (window.adminCustCurrentPage - 1) * pageSize;
    const pageItems = filtered.slice(startIdx, startIdx + pageSize);

    // Update pagination controls
    const pagInfo = document.getElementById('customerPaginationInfo');
    const pagLabel = document.getElementById('custCurrentPageLabel');
    const btnPrev = document.getElementById('btnCustPagePrev');
    const btnNext = document.getElementById('btnCustPageNext');
    if (pagInfo) {
        pagInfo.textContent = totalCount === 0 ? 'No customers to display' : `Showing ${startIdx + 1}–${Math.min(startIdx + pageSize, totalCount)} of ${totalCount} customers`;
    }
    if (pagLabel) {
        pagLabel.textContent = `Page ${window.adminCustCurrentPage} of ${totalPages}`;
    }
    if (btnPrev) btnPrev.disabled = (window.adminCustCurrentPage <= 1);
    if (btnNext) btnNext.disabled = (window.adminCustCurrentPage >= totalPages);

    tbody.innerHTML = '';
    if (!filtered.length) {
        let emptyMsg = 'No customer records found matching search query.';
        if (selectedDate) {
            emptyMsg = `No customer purchases or redemptions recorded for <strong>${formatDisplayDate(selectedDate)}</strong>. <button type="button" class="btn btn-outline btn-sm" onclick="resetCustomerDateFilter()" style="margin-left: 10px;">Show All Customers</button>`;
        } else if (activeCustomerFilter !== 'all') {
            const filterLabelMap = {
                'cash': 'Cash payments',
                'online': 'Online payments',
                '150g': '150 g Tiramisu purchases',
                '350g': '350 g Tiramisu purchases',
                'claimed': 'Claimed Loyalty Offers'
            };
            emptyMsg = `No customers found for filter: <strong>${filterLabelMap[activeCustomerFilter] || activeCustomerFilter}</strong>.`;
        }
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--color-text-muted); padding: 28px;">${emptyMsg}</td></tr>`;
        return;
    }

    pageItems.forEach(item => {
        const c = item.customer;
        const loyalty = item.loyalty;
        const totalSpend = item.totalSpend;
        const safeName = typeof escapeHtml === 'function' ? escapeHtml(c.name) : c.name;
        const safePhone = typeof escapeHtml === 'function' ? escapeHtml(c.phone) : c.phone;

        const cupsHtml = item.isDateFiltered
            ? `<strong>${item.dateCups} cup${item.dateCups !== 1 ? 's' : ''}</strong><div style="font-size: 0.74rem; color: var(--color-caramel);">on ${item.formattedDate}</div>`
            : `<strong>${item.totalCups} cup${item.totalCups !== 1 ? 's' : ''}</strong>${item.totalCups !== loyalty.totalCupsPurchased ? `<div style="font-size: 0.74rem; color: var(--color-text-muted);">${loyalty.totalCupsPurchased} loyalty eligible</div>` : ''}`;


        const ordersHtml = item.isDateFiltered
            ? `<strong>${item.dateOrderCount} order${item.dateOrderCount !== 1 ? 's' : ''}</strong>`
            : `<strong>${loyalty.completedPurchasesCount} orders</strong>`;

        const spendHtml = item.isDateFiltered
            ? `<strong>${curr}${item.dateSpend.toLocaleString('en-IN')}</strong>`
            : `<strong>${curr}${totalSpend.toLocaleString('en-IN')}</strong>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${safeName}</strong></td>
            <td><code>${safePhone}</code></td>
            <td>${cupsHtml}</td>
            <td>${ordersHtml}</td>
            <td>${spendHtml}</td>
            <td>
                <span class="badge ${loyalty.isEligible ? 'badge-success' : 'badge-warning'}">
                    ${loyalty.isEligible ? 'Eligible for Free Reward' : `${loyalty.currentCycleProgress}/${loyalty.threshold} Cups`}
                </span>
            </td>
            <td>
                ${item.hasClaimed 
                    ? `<span class="badge badge-success" style="font-weight: 700;"><i data-lucide="gift" data-size="12"></i> ${item.isDateFiltered ? 'Redeemed on date' : `${loyalty.claimedCount} free cup${loyalty.claimedCount !== 1 ? 's' : ''} claimed`}</span>` 
                    : `<span style="color: var(--color-text-muted); font-size: 0.82rem;">0 claimed</span>`}
            </td>
            <td>
                <button class="btn btn-outline btn-sm" onclick="viewCustomerHistory('${safePhone}')" style="display: inline-flex; align-items: center; gap: 4px;">
                    <i data-lucide="history" data-size="14"></i>
                    <span>History</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    if (window.lucide) window.lucide.createIcons();
};

window.changeCustomerPage = function(delta) {
    window.adminCustCurrentPage = (window.adminCustCurrentPage || 1) + delta;
    renderCustomersTable();
};

window.viewCustomerHistory = function(phone) {
    const loyalty = window.TiraDB.getCustomerLoyalty(phone);
    const settings = window.TiraDB.getSettings();
    const curr = settings.currency || '₹';

    document.getElementById('custModalName').textContent = loyalty.customer.name;
    document.getElementById('custModalPhone').textContent = `Phone: ${loyalty.customer.phone}`;

    const totalSpend = loyalty.salesHistory.reduce((acc, s) => acc + s.totalAmount, 0);
    document.getElementById('custModalTotalSpend').textContent = `${curr}${totalSpend.toLocaleString('en-IN')}`;
    document.getElementById('custModalPaidCups').textContent = `${loyalty.totalCupsPurchased} Cups`;
    const purchasesElem = document.getElementById('custModalPurchases');
    if (purchasesElem) purchasesElem.textContent = `${loyalty.completedPurchasesCount} Orders`;
    document.getElementById('custModalStatus').textContent = loyalty.isEligible ? 'ELIGIBLE (Free Cup)' : `${loyalty.currentCycleProgress}/${loyalty.threshold} Cups`;

    const list = document.getElementById('custModalTxnList');
    list.innerHTML = '';
    if (loyalty.salesHistory.length === 0) {
        list.innerHTML = `<p style="color: var(--color-text-muted); font-size: 0.9rem;">No transactions recorded for this customer yet.</p>`;
    } else {
        loyalty.salesHistory.forEach(s => {
            const dateStr = new Date(s.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            const itemNames = s.items.map(it => `${it.productName} (x${it.quantity})`).join(', ');
            const card = document.createElement('div');
            card.className = 'history-item';
            card.innerHTML = `
                <div>
                    <div><strong>${s.id}</strong> • <span style="font-size: 0.8rem; color: var(--color-text-muted);">${dateStr}</span></div>
                    <div style="font-size: 0.85rem; color: var(--color-text-main); margin-top: 2px;">${itemNames}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: 800; color: var(--color-espresso);">${curr}${s.totalAmount}</div>
                    <span class="badge ${s.paymentMode === 'Cash' ? 'badge-cash' : 'badge-online'}" style="font-size: 0.7rem;">${s.paymentMode}</span>
                </div>
            `;
            list.appendChild(card);
        });
    }

    document.getElementById('customerHistoryModal').classList.add('active');
};

window.closeCustomerModal = function() {
    document.getElementById('customerHistoryModal').classList.remove('active');
};

window.exportCustomersCSV = function() {
    const dateInput = document.getElementById('customerDatePicker');
    const selectedDate = dateInput ? dateInput.value : '';
    const customers = window.TiraDB.getCustomers();
    const sales = window.TiraDB.getSales();
    const redemptions = window.TiraDB.getRedemptions();

    if (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
        // Export ONLY data for the selected date!
        const dateSales = sales.filter(s => s.date === selectedDate);
        const dateRedemptions = redemptions.filter(r => r.date === selectedDate);
        
        const activePhones = new Set([
            ...dateSales.map(s => (s.customerPhone || '').replace(/\D/g, '')),
            ...dateRedemptions.map(r => (r.customerPhone || '').replace(/\D/g, ''))
        ]);

        const filteredCustomers = customers.filter(c => {
            const clean = (c.phone || '').replace(/\D/g, '');
            return activePhones.has(clean);
        });

        if (!filteredCustomers.length) {
            showToast(`No customer transactions found for ${formatDisplayDate(selectedDate)} to export.`, 'warning');
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Customer Name,Phone,Date,Cups Purchased On Date,Orders On Date,Total Spend On Date (INR),Payment Modes,Items Purchased,Lifetime Cups,Current Cycle Progress,Eligible For Free Reward,Offer Claimed On Date\n";

        filteredCustomers.forEach(c => {
            const cleanPhone = (c.phone || '').replace(/\D/g, '');
            const custDaySales = dateSales.filter(s => (s.customerPhone || '').replace(/\D/g, '') === cleanPhone);
            const custDayRedemptions = dateRedemptions.filter(r => (r.customerPhone || '').replace(/\D/g, '') === cleanPhone);
            const dayCups = custDaySales.reduce((acc, s) => {
                const sItems = Array.isArray(s.items) ? s.items : [];
                const nonReward = sItems.reduce((sum, it) => (it.isReward || it.is_reward) ? sum : sum + Number(it.quantity || 1), 0);
                return acc + (sItems.length > 0 ? nonReward : Number(s.paidCupsCount || 0));
            }, 0);
            const daySpend = custDaySales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
            const paymentModes = Array.from(new Set(custDaySales.map(s => s.paymentMode || 'Cash'))).join('; ');
            
            const itemsList = [];
            custDaySales.forEach(s => {
                (s.items || []).forEach(it => {
                    itemsList.push(`${it.productName || it.product_name} (x${it.quantity || 1})`);
                });
            });
            const itemsStr = itemsList.join('; ');

            const loyalty = window.TiraDB.getCustomerLoyalty(c.phone);
            const claimedOnDate = custDayRedemptions.length > 0 ? 'YES' : 'NO';

            csvContent += `"${c.name}","${c.phone}","${selectedDate}",${dayCups},${custDaySales.length},${daySpend},"${paymentModes}","${itemsStr}",${loyalty.totalCupsPurchased},"${loyalty.currentCycleProgress}/${loyalty.threshold}",${loyalty.isEligible ? 'YES' : 'NO'},${claimedOnDate}\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `tira_belle_customers_${selectedDate}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        showToast(`Exported ${filteredCustomers.length} customer records for ${formatDisplayDate(selectedDate)} to CSV.`, 'success');
        return;
    }

    // Default: Lifetime export for all registered customers
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Customer Name,Phone,Total Cups Purchased,Loyalty Eligible Cups,Completed Purchases,Total Spend (INR),Current Cycle Progress,Threshold,Eligible For Free Reward,Total Rewards Claimed\n";

    customers.forEach(c => {
        const loyalty = window.TiraDB.getCustomerLoyalty(c.phone);
        const custSales = sales.filter(s => (s.customerPhone || '').replace(/\D/g, '') === (c.phone || '').replace(/\D/g, ''));
        const totalSpend = custSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0);
        const totalCups = custSales.reduce((acc, s) => {
            const sItems = Array.isArray(s.items) ? s.items : [];
            const nonReward = sItems.reduce((sum, it) => (it.isReward || it.is_reward) ? sum : sum + Number(it.quantity || 1), 0);
            return acc + (sItems.length > 0 ? nonReward : Number(s.paidCupsCount || 0));
        }, 0);
        csvContent += `"${c.name}","${c.phone}",${totalCups},${loyalty.totalCupsPurchased},${loyalty.completedPurchasesCount},${totalSpend},"${loyalty.currentCycleProgress}",${loyalty.threshold},${loyalty.isEligible ? 'YES' : 'NO'},${loyalty.claimedCount}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `tira_belle_customers_all_time_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('All-time customer records exported to CSV.', 'success');
};

// ----------------- SECTION 5: CUSTOMER LOYALTY TRACKER (ADMIN) -----------------
window.adminTrackLoyalty = function() {
    const query = document.getElementById('adminLoyaltySearchInput').value.trim();
    if (!query) {
        showToast('Please enter a phone number or customer name.', 'warning');
        return;
    }

    let customer = null;
    const cleanDigits = query.replace(/\D/g, '');
    if (cleanDigits.length >= 10) {
        customer = window.TiraDB.findCustomerByPhone(cleanDigits);
    } else {
        const matches = window.TiraDB.searchCustomer(query);
        if (matches.length > 0) customer = matches[0];
    }

    if (!customer) {
        showToast('Customer record not found.', 'warning');
        return;
    }

    renderAdminLoyaltyCard(customer.phone);
};

window.adminClearLoyaltyTracker = function() {
    const input = document.getElementById('adminLoyaltySearchInput');
    const resultBox = document.getElementById('adminLoyaltyResult');
    if (input) input.value = '';
    if (resultBox) resultBox.style.display = 'none';
    if (input) input.focus();
    showToast('Customer loyalty tracker cleared.', 'info');
};

function renderAdminLoyaltyCard(phone) {
    const resultBox = document.getElementById('adminLoyaltyResult');
    const loyalty = window.TiraDB.getCustomerLoyalty(phone);

    document.getElementById('admResCustName').textContent = loyalty.customer.name;
    document.getElementById('admResCustPhone').textContent = `Phone: ${loyalty.customer.phone}`;

    // Redeem Action Button
    const actionContainer = document.getElementById('admResRedeemAction');
    if (loyalty.isEligible) {
        actionContainer.innerHTML = `
            <button class="btn btn-caramel btn-lg" onclick="triggerAdminRedemption('${loyalty.customer.phone}')" style="display: inline-flex; align-items: center; gap: 8px;">
                <i data-lucide="gift" data-size="18"></i>
                <span>Redeem 1 Free 150g Tiramisu Now</span>
            </button>
        `;
    } else {
        actionContainer.innerHTML = `
            <button class="btn btn-outline" disabled style="opacity: 0.6; cursor: not-allowed; display: inline-flex; align-items: center; gap: 8px;">
                <i data-lucide="lock" data-size="16"></i>
                <span>Not Eligible (Needs ${loyalty.cupsRemaining} more cup${loyalty.cupsRemaining !== 1 ? 's' : ''})</span>
            </button>
        `;
    }

    // Status Alert Box
    const statusBox = document.getElementById('admResStatusBox');
    const icon = document.getElementById('admResIcon');
    const title = document.getElementById('admResTitle');
    const desc = document.getElementById('admResDesc');

    if (loyalty.isEligible) {
        statusBox.className = 'loyalty-status-banner status-eligible';
        icon.innerHTML = '<i data-lucide="award" data-size="28"></i>';
        title.textContent = `Eligible for ${window.TiraDB.getSettings().rewardItemName || 'Free 150g Tiramisu'}!`;
        desc.textContent = `Customer bought ${loyalty.totalCupsPurchased} cups (reached ${loyalty.threshold} required)! Click the button above to record the free dessert redemption.`;
    } else {
        statusBox.className = 'loyalty-status-banner status-in-progress';
        icon.innerHTML = '<i data-lucide="coffee" data-size="28"></i>';
        title.textContent = `${loyalty.cupsRemaining} Cup${loyalty.cupsRemaining !== 1 ? 's' : ''} Remaining`;
        desc.textContent = `Customer has bought ${loyalty.currentCycleProgress} out of ${loyalty.threshold} eligible cups in the current reward cycle (${loyalty.totalCupsPurchased} cups bought total).`;
    }

    // Stamps Visual: [threshold] Paid Slots + 1 Separate Reward Slot
    const stampsGrid = document.getElementById('admResStampsGrid');
    stampsGrid.innerHTML = '';
    const threshold = Math.max(1, loyalty.threshold || 5);
    const current = loyalty.currentCycleProgress;
    const totalSlots = threshold + 1;
    const gridCols = totalSlots <= 7 ? totalSlots : Math.ceil(totalSlots / 2);
    stampsGrid.style.setProperty('--stamp-cols', gridCols);

    // Paid Stamp Slots: 1 to threshold
    for (let i = 1; i <= threshold; i++) {
        const isStamped = i <= current;
        const box = document.createElement('div');
        box.className = `stamp-box-large ${isStamped ? 'filled' : ''}`;
        
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
            <div class="stamp-num-badge">Cup #${i}</div>
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

    // Stats
    document.getElementById('admResTotalCups').textContent = loyalty.totalCupsPurchased;
    const admResPurchases = document.getElementById('admResCompletedPurchases');
    if (admResPurchases) admResPurchases.textContent = loyalty.completedPurchasesCount;
    document.getElementById('admResNeededCups').textContent = loyalty.cupsRemaining;
    document.getElementById('admResClaimedCount').textContent = loyalty.claimedCount;

    // Redemptions History
    const list = document.getElementById('admResRedemptionsList');
    list.innerHTML = '';
    if (loyalty.redemptions.length === 0) {
        list.innerHTML = `<div style="font-size: 0.85rem; color: var(--color-text-muted);">No rewards redeemed yet.</div>`;
    } else {
        loyalty.redemptions.forEach(r => {
            const dateStr = new Date(r.redeemedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `
                <div>
                    <strong>${r.rewardItem}</strong> • <span style="font-size: 0.8rem; color: var(--color-text-muted);">${dateStr}</span>
                    <div style="font-size: 0.75rem; color: var(--color-text-light);">Staff: ${r.adminUser} • ${r.notes || 'In-store'}</div>
                </div>
                <span class="badge badge-success">Claimed</span>
            `;
            list.appendChild(item);
        });
    }

    resultBox.style.display = 'block';
    if (window.lucide) window.lucide.createIcons();
}

window.triggerAdminRedemption = async function(phone) {
    const loyalty = window.TiraDB.getCustomerLoyalty(phone);
    const custName = loyalty?.customer?.name || 'this customer';
    const confirmed = window.TiraAlert ? await window.TiraAlert.confirm({
        title: 'Redeem Free Tiramisu Cup?',
        message: `Confirm redemption of 1 Free 150g Tiramisu Cup for ${custName} (${phone})? This will deduct 5 stamps from their available rewards.`,
        type: 'success',
        confirmText: 'Confirm Redemption',
        cancelText: 'Cancel',
        icon: 'gift'
    }) : window.confirm('Confirm redemption of 1 Free 150g Tiramisu Cup for this customer?');

    if (confirmed) {
        const res = await window.TiraDB.redeemReward(phone, 'admin', 'Counter Claim');
        if (res.success) {
            showToast(res.message, 'success');
            renderAdminLoyaltyCard(phone);
            renderAdminLoyaltyAudit();
            renderNearRewardCustomers();
            loadDashboardMetrics();
        } else {
            showToast(res.message, 'error');
        }
    }
};

window.renderAdminLoyaltyAudit = function() {
    const tbody = document.getElementById('adminAllRedemptionsTbody');
    if (!tbody) return;
    const redemptions = window.TiraDB.getRedemptions();

    tbody.innerHTML = '';
    if (!redemptions.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--color-text-muted);">No reward redemptions recorded yet.</td></tr>`;
        return;
    }

    redemptions.forEach(r => {
        const dateStr = new Date(r.redeemedAt).toLocaleString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const safeId = typeof escapeHtml === 'function' ? escapeHtml(r.id) : r.id;
        const safeName = typeof escapeHtml === 'function' ? escapeHtml(r.customerName) : r.customerName;
        const safePhone = typeof escapeHtml === 'function' ? escapeHtml(r.customerPhone) : r.customerPhone;
        const safeItem = typeof escapeHtml === 'function' ? escapeHtml(r.rewardItem) : r.rewardItem;
        const safeNotes = typeof escapeHtml === 'function' ? escapeHtml(r.notes || 'Counter Claim') : (r.notes || 'Counter Claim');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><code>${safeId}</code></td>
            <td>${dateStr}</td>
            <td><strong>${safeName}</strong></td>
            <td>${safePhone}</td>
            <td><strong style="color: #27ae60;">${safeItem}</strong></td>
            <td>${r.adminUser}</td>
            <td>${safeNotes}</td>
        `;
        tbody.appendChild(tr);
    });
};

// ----------------- CUSTOMERS NEAR REWARD COMPONENT -----------------
window.renderNearRewardCustomers = function() {
    const container = document.getElementById('nearRewardList');
    const badgeEl = document.getElementById('nearRewardCountBadge');
    if (!container) return;

    const customers = window.TiraDB.getCustomers();
    if (!customers || !customers.length) {
        container.innerHTML = `
            <div class="near-reward-empty">
                <i data-lucide="coffee" data-size="28" style="color: #d8cbb8;"></i>
                <span>No registered customers found yet.</span>
            </div>
        `;
        if (badgeEl) badgeEl.textContent = '0 Customers';
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const settings = window.TiraDB.getSettings();
    const threshold = Math.max(1, parseInt(settings.loyaltyThreshold, 10) || 5);

    // Filter and compute status
    const candidates = [];
    customers.forEach(c => {
        const phone = (c.phone || '').trim();
        if (!phone) return;
        const loyalty = window.TiraDB.getCustomerLoyalty(phone);

        // Excluded products do NOT count: loyalty.totalCupsPurchased and currentCycleProgress strictly count eligible cups
        const isEligible = !!loyalty.isEligible;
        const currentStamps = loyalty.currentCycleProgress || 0;
        const cupsRemaining = loyalty.cupsRemaining !== undefined ? loyalty.cupsRemaining : Math.max(0, threshold - currentStamps);

        // Include customers who are either Eligible for a reward OR have active stamps towards reward
        if (isEligible || currentStamps > 0) {
            candidates.push({
                customer: c,
                phone,
                name: c.name || 'Valued Guest',
                loyalty,
                isEligible,
                currentStamps,
                threshold,
                cupsRemaining,
                availableRewards: loyalty.availableRewards || 0
            });
        }
    });

    // Sort order:
    // 1. Eligible customers (ready to redeem) at the very top
    // 2. Customers closest to reward (least cups remaining, most stamps completed)
    candidates.sort((a, b) => {
        if (a.isEligible && !b.isEligible) return -1;
        if (!a.isEligible && b.isEligible) return 1;
        if (a.cupsRemaining !== b.cupsRemaining) return a.cupsRemaining - b.cupsRemaining;
        return b.currentStamps - a.currentStamps;
    });

    if (badgeEl) {
        const count = candidates.length;
        badgeEl.textContent = `${count} Customer${count !== 1 ? 's' : ''}`;
        if (candidates.some(c => c.isEligible)) {
            badgeEl.style.background = 'rgba(39, 174, 96, 0.15)';
            badgeEl.style.color = '#27ae60';
        } else {
            badgeEl.style.background = 'rgba(183, 121, 61, 0.12)';
            badgeEl.style.color = 'var(--color-caramel)';
        }
    }

    if (!candidates.length) {
        container.innerHTML = `
            <div class="near-reward-empty">
                <i data-lucide="coffee" data-size="28" style="color: #d8cbb8;"></i>
                <span>No customers currently near reward. New eligible purchases will appear here!</span>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    container.innerHTML = '';
    candidates.forEach(cand => {
        const item = document.createElement('div');
        const isEligible = cand.isEligible;
        item.className = `near-reward-item ${isEligible ? 'eligible' : ''}`;
        item.onclick = () => window.adminQuickTrackCustomer(cand.phone);
        item.setAttribute('title', `Click to view loyalty stamp card for ${cand.name}`);

        const pct = isEligible ? 100 : Math.min(100, Math.round((cand.currentStamps / cand.threshold) * 100));
        const statusBadge = isEligible
            ? `<span class="near-reward-badge badge-ready"><i data-lucide="gift" data-size="12"></i> Ready to Claim!</span>`
            : `<span class="near-reward-badge badge-near"><i data-lucide="award" data-size="12"></i> ${cand.cupsRemaining} cup${cand.cupsRemaining !== 1 ? 's' : ''} left</span>`;

        const progressText = isEligible
            ? `<strong>${cand.threshold}/${cand.threshold} Stamps Completed</strong> (Reward Unlocked)`
            : `<strong>${cand.currentStamps}/${cand.threshold} Stamps Completed</strong> (${cand.cupsRemaining} stamp${cand.cupsRemaining !== 1 ? 's' : ''} remaining)`;

        const safeName = typeof escapeHtml === 'function' ? escapeHtml(cand.name) : cand.name;
        const safePhone = typeof escapeHtml === 'function' ? escapeHtml(cand.phone) : cand.phone;

        item.innerHTML = `
            <div class="near-reward-item-top">
                <div>
                    <div class="near-reward-name">
                        <span>${safeName}</span>
                        ${isEligible ? '<i data-lucide="sparkles" data-size="13" style="color: #27ae60;"></i>' : ''}
                    </div>
                    <div class="near-reward-phone">${safePhone}</div>
                </div>
                ${statusBadge}
            </div>
            <div class="near-reward-progress-bar-wrap">
                <div class="near-reward-progress-track">
                    <div class="near-reward-progress-fill ${isEligible ? 'fill-ready' : 'fill-near'}" style="width: ${pct}%;"></div>
                </div>
                <div class="near-reward-progress-text">${pct}%</div>
            </div>
            <div style="font-size: 0.74rem; color: var(--color-text-muted); display: flex; align-items: center; justify-content: space-between;">
                <span>${progressText}</span>
                <span style="color: var(--color-caramel); font-weight: 700; display: inline-flex; align-items: center; gap: 2px;">
                    Track <i data-lucide="chevron-right" data-size="12"></i>
                </span>
            </div>
        `;
        container.appendChild(item);
    });

    if (window.lucide) window.lucide.createIcons();
};

window.adminQuickTrackCustomer = function(phone) {
    const input = document.getElementById('adminLoyaltySearchInput');
    if (input) input.value = phone;
    renderAdminLoyaltyCard(phone);
    const resultBox = document.getElementById('adminLoyaltyResult');
    if (resultBox) {
        resultBox.style.display = 'block';
        resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};



// ----------------- SECTION 6: COUNTER QR STANDEE -----------------
window.renderCounterQr = function() {
    const qrContainer = document.getElementById('standeeQrContainer');
    if (!qrContainer) return;

    // Target URL: main homepage (https://tirabelledesserts-byte-mubd.vercel.app/)
    let homepageUrl = 'https://tirabelledesserts-byte-mubd.vercel.app/';
    if (typeof window !== 'undefined' && window.location) {
        const hostname = window.location.hostname;
        // When running on a live domain (e.g. Vercel deployment or custom domain) and not local test/file
        if (window.location.protocol.startsWith('http') && hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
            homepageUrl = window.location.origin + '/';
        }
    }

    qrContainer.innerHTML = '';
    qrContainer.title = homepageUrl;
    qrContainer.setAttribute('data-target-url', homepageUrl);
    if (window.QRCode) {
        new window.QRCode(qrContainer, {
            text: homepageUrl,
            width: 200,
            height: 200,
            colorDark: "#24140e",
            colorLight: "#ffffff"
        });
    }
};

window.printStandee = function() {
    window.print();
};

// ----------------- SECTION 7: SETTINGS -----------------
let currentSettingsLogo = '';

window.handleLogoFileSelect = function(input) {
    const file = input.files && input.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('Please select a valid image file (PNG, JPG, WebP, SVG).', 'warning');
        return;
    }

    // Process & resize image to safe dimensions (< 500x500) to keep localStorage fast & clean
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const maxDimension = 500;
            let width = img.width;
            let height = img.height;
            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                } else {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            const format = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg';
            const dataUrl = canvas.toDataURL(format, 0.92);
            
            currentSettingsLogo = dataUrl;
            const preview = document.getElementById('setLogoPreview');
            if (preview) preview.src = dataUrl;
            const urlInput = document.getElementById('setLogoUrl');
            if (urlInput) urlInput.value = file.name ? file.name : 'custom-uploaded-logo.png';
            showToast('Logo image loaded! Click "Save Business Information" to apply.', 'info');
        };
        img.onerror = function() {
            showToast('Could not process selected image file.', 'error');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
};

window.handleLogoUrlInput = function(val) {
    const trimmed = (val || '').trim();
    if (trimmed) {
        currentSettingsLogo = trimmed;
        const preview = document.getElementById('setLogoPreview');
        if (preview) preview.src = trimmed;
    } else {
        const s = window.TiraDB.getSettings();
        currentSettingsLogo = s.logo || 'assets/tira-belle-logo.png';
        const preview = document.getElementById('setLogoPreview');
        if (preview) preview.src = currentSettingsLogo;
    }
};

window.resetLogoToDefault = function() {
    currentSettingsLogo = 'assets/tira-belle-logo.png';
    const preview = document.getElementById('setLogoPreview');
    if (preview) preview.src = currentSettingsLogo;
    const urlInput = document.getElementById('setLogoUrl');
    if (urlInput) urlInput.value = 'assets/tira-belle-logo.png';
    const fileInput = document.getElementById('setLogoFileInput');
    if (fileInput) fileInput.value = '';
    showToast('Logo reset to default. Click "Save Business Information" to commit.', 'info');
};

function updateStandeeAndHelpTexts(threshold, rewardItem) {
    const standeeTitle = document.getElementById('standeeOfferTitle');
    if (standeeTitle) {
        standeeTitle.innerHTML = `Buy ${threshold} Tiramisu Cups,<br>Get ${rewardItem}!`;
    }
    const helpEl = document.getElementById('setLoyaltyRuleHelp');
    if (helpEl) {
        helpEl.textContent = `Current rule: ${threshold} cups earns ${rewardItem}`;
    }
}

function populateSettingsFields() {
    const s = window.TiraDB.getSettings();
    currentSettingsLogo = s.logo || 'assets/tira-belle-logo.png';

    const preview = document.getElementById('setLogoPreview');
    if (preview) preview.src = currentSettingsLogo;
    const urlInput = document.getElementById('setLogoUrl');
    if (urlInput) {
        urlInput.value = s.logo && !s.logo.startsWith('data:') ? s.logo : (s.logo && s.logo.startsWith('data:') ? 'custom-uploaded-logo.png' : 'assets/tira-belle-logo.png');
    }

    document.getElementById('setBusinessName').value = s.businessName || 'TIRA Belle';
    document.getElementById('setTagline').value = s.tagline || '';
    const sloganEl = document.getElementById('setSlogan');
    if (sloganEl) sloganEl.value = s.slogan || '';
    document.getElementById('setOwnerName').value = s.owner || 'Yash Chauhan & Tejas Chauhan';
    document.getElementById('setPhone').value = s.phone || '9373484198';
    const secPhoneEl = document.getElementById('setPhoneSecondary');
    if (secPhoneEl) secPhoneEl.value = s.phoneSecondary || '';
    const emailEl = document.getElementById('setEmail');
    if (emailEl) emailEl.value = s.email || '';
    const instaEl = document.getElementById('setInstagram');
    if (instaEl) instaEl.value = s.instagram || 'tirabelle.desserts';
    const instaUrlEl = document.getElementById('setInstagramUrl');
    if (instaUrlEl) instaUrlEl.value = s.instagramUrl || 'https://instagram.com/tirabelle.desserts?obrf=MzhsZG04Ymc3NXBj';
    const addrEl = document.getElementById('setAddress');
    if (addrEl) addrEl.value = s.address || '';
    document.getElementById('setUpiId').value = s.upiId || '9373484198@upi';
    const currEl = document.getElementById('setCurrency');
    if (currEl) currEl.value = s.currency || '₹';

    const threshold = s.loyaltyThreshold || 5;
    const rewardItem = s.rewardItemName || '1 Free 150g Tiramisu Cup';
    document.getElementById('setLoyaltyThreshold').value = threshold;
    document.getElementById('setRewardItemName').value = rewardItem;

    document.getElementById('setAdminUser').value = s.adminUsername || 'tirabelle.desserts@gmail.com';
    resetPasswordField('setAdminOldPass');
    resetPasswordField('setAdminNewPass');
    resetPasswordField('setAdminConfirmPass');
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }

    updateStandeeAndHelpTexts(threshold, rewardItem);
}

window.saveBusinessSettings = async function() {
    const bizName = document.getElementById('setBusinessName').value.trim();
    if (!bizName) {
        showToast('Business name cannot be empty.', 'warning');
        return;
    }

    const s = window.TiraDB.getSettings();
    const logoToSave = currentSettingsLogo || s.logo || 'assets/tira-belle-logo.png';

    const rawInsta = document.getElementById('setInstagram') ? document.getElementById('setInstagram').value.trim() : (s.instagram || '');
    let rawInstaUrl = document.getElementById('setInstagramUrl') ? document.getElementById('setInstagramUrl').value.trim() : (s.instagramUrl || '');

    // Validate Instagram URL if provided
    if (rawInstaUrl) {
        if (!/^https?:\/\//i.test(rawInstaUrl)) {
            showToast('Instagram profile URL must start with https:// or http://', 'warning');
            return;
        }
        try {
            new URL(rawInstaUrl);
        } catch (e) {
            showToast('Please enter a valid Instagram profile URL.', 'warning');
            return;
        }
    } else if (rawInsta) {
        // Auto-construct Instagram URL from handle if URL was left empty
        const clean = rawInsta.replace(/^@/, '');
        rawInstaUrl = `https://instagram.com/${clean}`;
    }

    const updated = await window.TiraDB.updateSettings({
        businessName: bizName,
        tagline: document.getElementById('setTagline').value.trim(),
        slogan: document.getElementById('setSlogan') ? document.getElementById('setSlogan').value.trim() : (s.slogan || ''),
        owner: document.getElementById('setOwnerName').value.trim(),
        phone: document.getElementById('setPhone').value.trim(),
        phoneSecondary: document.getElementById('setPhoneSecondary') ? document.getElementById('setPhoneSecondary').value.trim() : (s.phoneSecondary || ''),
        whatsapp: document.getElementById('setPhone').value.trim(),
        email: document.getElementById('setEmail') ? document.getElementById('setEmail').value.trim() : (s.email || ''),
        instagram: rawInsta,
        instagramUrl: rawInstaUrl,
        address: document.getElementById('setAddress') ? document.getElementById('setAddress').value.trim() : (s.address || ''),
        upiId: document.getElementById('setUpiId').value.trim(),
        currency: document.getElementById('setCurrency') ? (document.getElementById('setCurrency').value.trim() || '₹') : (s.currency || '₹'),
        logo: logoToSave
    });

    // Update standee QR & elements
    renderCounterQr();
    showToast('Business details & logo updated! Centrally synchronized across application.', 'success');
};

window.saveLoyaltySettings = async function() {
    const rawThreshold = document.getElementById('setLoyaltyThreshold').value;
    const threshold = parseInt(rawThreshold, 10);
    if (isNaN(threshold) || threshold < 1 || threshold > 50) {
        showToast('Please enter a valid threshold between 1 and 50 cups.', 'warning');
        return;
    }
    const rewardItem = document.getElementById('setRewardItemName').value.trim();
    if (!rewardItem) {
        showToast('Please enter a free reward item name.', 'warning');
        return;
    }

    await window.TiraDB.updateSettings({
        loyaltyThreshold: threshold,
        rewardItemName: rewardItem
    });
    updateStandeeAndHelpTexts(threshold, rewardItem);
    renderCustomersTable();
    loadDashboardMetrics();

    // Re-render admin loyalty tracker card if currently displayed
    const currentPhoneEl = document.getElementById('admResCustPhone');
    if (currentPhoneEl && currentPhoneEl.textContent) {
        const phone = currentPhoneEl.textContent.replace(/\D/g, '');
        if (phone) renderAdminLoyaltyCard(phone);
    }

    showToast('Loyalty program rules saved! Updated across system.', 'success');
};

window.saveCredentialsSettings = async function() {
    const userEl = document.getElementById('setAdminUser');
    const oldPassEl = document.getElementById('setAdminOldPass');
    const newPassEl = document.getElementById('setAdminNewPass');
    const confirmPassEl = document.getElementById('setAdminConfirmPass');

    const user = userEl ? userEl.value.trim() : '';
    const oldPass = oldPassEl ? oldPassEl.value.trim() : '';
    const newPass = newPassEl ? newPassEl.value.trim() : '';
    const confirmPass = confirmPassEl ? confirmPassEl.value.trim() : '';

    if (!user) {
        showToast('Admin username cannot be blank.', 'warning');
        if (userEl) userEl.focus();
        return;
    }
    if (!oldPass) {
        showToast('Please enter your old password.', 'warning');
        if (oldPassEl) oldPassEl.focus();
        return;
    }
    if (!newPass) {
        showToast('Please enter your new password.', 'warning');
        if (newPassEl) newPassEl.focus();
        return;
    }
    if (!confirmPass) {
        showToast('Please confirm your new password.', 'warning');
        if (confirmPassEl) confirmPassEl.focus();
        return;
    }
    if (newPass !== confirmPass) {
        showToast('New password and Confirm password do not match.', 'error');
        if (confirmPassEl) confirmPassEl.focus();
        return;
    }

    const btn = document.getElementById('btnUpdateCredentials');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>Updating...</span>';
    }

    try {
        const res = await window.TiraDB.changeAdminCredentials({
            username: user,
            oldPassword: oldPass,
            newPassword: newPass
        });

        if (res && res.success) {
            showToast('Admin credentials updated successfully!', 'success');
            resetPasswordField('setAdminOldPass');
            resetPasswordField('setAdminNewPass');
            resetPasswordField('setAdminConfirmPass');
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons();
            }
        } else {
            showToast(res.message || 'Failed to update credentials. Please verify your old password.', 'error');
        }
    } catch (err) {
        console.error('Error updating credentials:', err);
        showToast('An error occurred while updating credentials.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="shield-check" data-size="16"></i> <span>Update Credentials</span>';
            if (window.lucide) window.lucide.createIcons();
        }
    }
};

window.switchSettingsTab = function(tabKey) {
    const pills = document.querySelectorAll('.settings-tab-pill');
    pills.forEach(p => p.classList.remove('active'));

    const clickedPill = Array.from(pills).find(p => p.getAttribute('onclick') && p.getAttribute('onclick').includes(`'${tabKey}'`));
    if (clickedPill) clickedPill.classList.add('active');

    const paneMap = {
        'branding': ['paneSettingsBranding'],
        'loyalty': ['paneSettingsLoyalty'],
        'security': ['paneSettingsSecurity'],
        'install': ['paneSettingsInstall']
    };

    const allPanes = document.querySelectorAll('.settings-card-pane');
    if (tabKey === 'all') {
        allPanes.forEach(pane => {
            pane.classList.remove('settings-pane-hidden');
        });
    } else {
        const allowedIds = paneMap[tabKey] || [];
        allPanes.forEach(pane => {
            if (allowedIds.includes(pane.id)) {
                pane.classList.remove('settings-pane-hidden');
                // Smooth scroll into view on mobile
                if (window.innerWidth <= 991) {
                    setTimeout(() => {
                        pane.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 50);
                }
            } else {
                pane.classList.add('settings-pane-hidden');
            }
        });
    }
    if (window.lucide) window.lucide.createIcons();
};

// ==========================================================================
// CUSTOMER REVIEWS MANAGEMENT
// ==========================================================================
window.renderAdminReviews = function() {
    if (!window.TiraDB) return;
    const allReviews = window.TiraDB.getReviews() || [];
    
    // Update summary metrics
    const totalCountEl = document.getElementById('adminReviewTotalCount');
    const avgRatingEl = document.getElementById('adminReviewAvgRating');
    const fiveStarCountEl = document.getElementById('adminReview5StarCount');
    const fiveStarPctEl = document.getElementById('adminReview5StarPercent');
    const verifiedCountEl = document.getElementById('adminReviewVerifiedCount');

    const total = allReviews.length;
    let sumRating = 0;
    let fiveStarCount = 0;
    let verifiedCount = 0;

    allReviews.forEach(r => {
        const rating = parseInt(r.rating, 10) || 5;
        sumRating += rating;
        if (rating === 5) fiveStarCount++;
        if (r.verified) verifiedCount++;
    });

    const avg = total > 0 ? (sumRating / total).toFixed(1) : '5.0';
    const fiveStarPct = total > 0 ? Math.round((fiveStarCount / total) * 100) : 100;

    if (totalCountEl) totalCountEl.textContent = total;
    if (avgRatingEl) avgRatingEl.textContent = `${avg} ★`;
    if (fiveStarCountEl) fiveStarCountEl.textContent = fiveStarCount;
    if (fiveStarPctEl) fiveStarPctEl.textContent = `${fiveStarPct}% of all ratings`;
    if (verifiedCountEl) verifiedCountEl.textContent = verifiedCount;

    // Filters
    const searchVal = (document.getElementById('adminReviewSearch')?.value || '').toLowerCase().trim();
    const filterRating = document.getElementById('adminReviewFilterRating')?.value || 'all';

    let filtered = allReviews.filter(r => {
        // Rating filter
        if (filterRating !== 'all') {
            const targetRating = parseInt(filterRating, 10);
            if (parseInt(r.rating, 10) !== targetRating) return false;
        }
        // Search query filter
        if (searchVal) {
            const nameMatch = (r.name || '').toLowerCase().includes(searchVal);
            const phoneMatch = (r.phone || '').includes(searchVal);
            const commentMatch = (r.comment || '').toLowerCase().includes(searchVal);
            const itemMatch = (r.favoriteItem || '').toLowerCase().includes(searchVal);
            if (!nameMatch && !phoneMatch && !commentMatch && !itemMatch) return false;
        }
        return true;
    });

    const tbody = document.getElementById('adminReviewsTableTbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px 10px; color: var(--color-text-muted);">
                    <i data-lucide="message-square-off" data-size="32" style="margin-bottom: 8px; color: var(--color-caramel);"></i>
                    <div>No customer reviews match your filter criteria.</div>
                </td>
            </tr>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    filtered.forEach(r => {
        const tr = document.createElement('tr');
        const rating = Math.max(1, Math.min(5, parseInt(r.rating, 10) || 5));
        
        let starsHtml = '';
        for (let s = 1; s <= 5; s++) {
            if (s <= rating) {
                starsHtml += `<span style="color: #f39c12; font-size: 1rem;">★</span>`;
            } else {
                starsHtml += `<span style="color: #d5dbdb; font-size: 1rem;">☆</span>`;
            }
        }

        const safeName = typeof escapeHtml === 'function' ? escapeHtml(r.name) : r.name;
        const safePhone = r.phone ? (typeof escapeHtml === 'function' ? escapeHtml(r.phone) : r.phone) : '—';
        const safeComment = typeof escapeHtml === 'function' ? escapeHtml(r.comment) : r.comment;
        const safeFav = typeof escapeHtml === 'function' ? escapeHtml(r.favoriteItem || 'Classic Cup') : (r.favoriteItem || 'Classic Cup');

        tr.innerHTML = `
            <td>
                <div style="font-weight: 700; color: var(--color-espresso); display: flex; align-items: center; gap: 6px;">
                    <span>${safeName}</span>
                    ${r.verified ? `<span class="badge badge-success" style="font-size: 0.68rem; padding: 1px 6px;"><i data-lucide="check" data-size="10"></i> Verified</span>` : ''}
                </div>
                <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-top: 2px;">
                    <i data-lucide="phone" data-size="11"></i> ${safePhone}
                </div>
            </td>
            <td>
                <div style="display: flex; align-items: center; gap: 2px;">
                    ${starsHtml}
                </div>
                <span style="font-size: 0.75rem; color: var(--color-text-muted); font-weight: 600;">${rating}.0 / 5.0</span>
            </td>
            <td>
                <span class="counter-tag" style="background: var(--color-caramel-subtle); color: var(--color-caramel); font-size: 0.78rem;">
                    ${safeFav}
                </span>
            </td>
            <td>
                <div style="max-width: 380px; font-size: 0.88rem; color: var(--color-text-main); line-height: 1.45; word-break: break-word;">
                    “${safeComment}”
                </div>
            </td>
            <td style="font-size: 0.82rem; color: var(--color-text-muted); white-space: nowrap;">
                ${r.date || '—'}
            </td>
            <td style="text-align: right; white-space: nowrap;">
                <button type="button" class="btn btn-outline btn-sm" style="color: #c0392b; border-color: #f5b7b1; padding: 4px 10px;" onclick="deleteCustomerReview('${r.id}')" title="Delete Review">
                    <i data-lucide="trash-2" data-size="14"></i>
                    <span>Delete</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
};

window.deleteCustomerReview = async function(reviewId) {
    if (!reviewId) return;

    const confirmed = window.TiraAlert ? await window.TiraAlert.confirm({
        title: 'Delete Customer Review?',
        message: 'Are you sure you want to delete this customer review? It will be permanently removed and disappear from the website homepage carousel immediately.',
        type: 'danger',
        confirmText: 'Yes, Delete Review',
        cancelText: 'Keep Review',
        icon: 'trash-2'
    }) : window.confirm('Are you sure you want to delete this customer review?');

    if (confirmed) {
        const res = window.TiraDB.deleteReview(reviewId);
        if (res && res.success) {
            showToast('Customer review deleted successfully.', 'success');
            renderAdminReviews();
        } else {
            showToast(res.message || 'Error deleting review', 'error');
        }
    }
};

window.addEventListener('tira-reviews-changed', () => {
    if (activeSection === 'reviews') {
        renderAdminReviews();
    }
});

// ----------------- STARTUP -----------------
document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();
    const dateWrapper = document.getElementById('dateSelectorWrapper');
    const dateInput = document.getElementById('dashboardDatePicker');
    if (dateWrapper && dateInput) {
        dateWrapper.addEventListener('click', (e) => {
            if (e.target !== dateInput && typeof dateInput.showPicker === 'function') {
                try { dateInput.showPicker(); } catch(err) {}
            }
        });
    }

    const custDateWrapper = document.getElementById('custDateSelectorWrapper');
    const custDateInput = document.getElementById('customerDatePicker');
    if (custDateWrapper && custDateInput) {
        custDateWrapper.addEventListener('click', (e) => {
            if (e.target !== custDateInput && typeof custDateInput.showPicker === 'function') {
                try { custDateInput.showPicker(); } catch(err) {}
            }
        });
    }
});
