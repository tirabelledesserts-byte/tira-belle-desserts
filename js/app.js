/**
 * TIRA Belle - Public Website Script
 * Loads active products dynamically from central DB, handles menu interactions, and on-page quick offer tracking.
 */

document.addEventListener('DOMContentLoaded', () => {
    initMobileNav();
    initHeroSlider();
    initWordRotator();
    initProcessDrawObserver();
    renderStorefrontBranding();
    renderPublicProducts();
    renderPublicLoyaltyInfo();
    renderPublicReviews();
    initScrollToTop();
    initScrollProgressBar();
    initNavigationPrefetch();

    // Auto-scroll smoothly to review section if redirected with #reviews hash
    if (window.location.hash === '#reviews') {
        setTimeout(() => {
            const reviewsEl = document.getElementById('reviews');
            if (reviewsEl) {
                reviewsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 200);
    }
});

/**
 * Hero Dual-Flavor Presentation Slideshow
 * Automatically and continuously crossfades between Classic and Chocolate Tiramisu posters every 3.5 seconds.
 */
function initHeroSlider() {
    const slider = document.getElementById('heroSlider');
    if (!slider) return;

    const slides = slider.querySelectorAll('.hero-slide');
    if (slides.length <= 1) return;

    let currentIndex = 0;
    let autoplayTimer = null;
    const AUTOPLAY_INTERVAL = 3000; // 3 seconds continuous loop

    function goToSlide(index) {
        if (index < 0) {
            currentIndex = slides.length - 1;
        } else if (index >= slides.length) {
            currentIndex = 0;
        } else {
            currentIndex = index;
        }

        slides.forEach((slide, idx) => {
            const isActive = idx === currentIndex;
            slide.classList.toggle('active', isActive);
            slide.setAttribute('aria-hidden', !isActive);
        });
    }

    function nextSlide() {
        goToSlide(currentIndex + 1);
    }

    function startAutoplay() {
        if (autoplayTimer) clearInterval(autoplayTimer);
        autoplayTimer = setInterval(nextSlide, AUTOPLAY_INTERVAL);
    }

    function stopAutoplay() {
        if (autoplayTimer) {
            clearInterval(autoplayTimer);
            autoplayTimer = null;
        }
    }

    // Pause autoplay on mouse enter, resume on mouse leave
    slider.addEventListener('mouseenter', stopAutoplay);
    slider.addEventListener('mouseleave', startAutoplay);

    // Touch swipe support for mobile devices
    const card = document.getElementById('heroSliderCard') || slider;
    if (card) {
        let touchStartX = 0;
        card.addEventListener('touchstart', (e) => {
            stopAutoplay();
            if (e.touches && e.touches.length > 0) {
                touchStartX = e.touches[0].clientX;
            }
        }, { passive: true });

        card.addEventListener('touchend', (e) => {
            if (e.changedTouches && e.changedTouches.length > 0) {
                const diff = e.changedTouches[0].clientX - touchStartX;
                if (Math.abs(diff) > 40) {
                    goToSlide(diff > 0 ? currentIndex - 1 : currentIndex + 1);
                }
            }
            startAutoplay();
        }, { passive: true });
    }

    // Start continuous automatic loop
    startAutoplay();
}

// Re-render when business settings change centrally or cross-tab
window.addEventListener('tira-settings-changed', () => {
    renderStorefrontBranding();
    renderPublicProducts();
    renderPublicLoyaltyInfo();
});

// Re-render when categories or products change
window.addEventListener('tira-categories-changed', () => {
    renderPublicProducts();
});

window.addEventListener('tira-products-changed', () => {
    renderPublicProducts();
});

// Re-render when customer reviews are added or deleted
window.addEventListener('tira-reviews-changed', () => {
    renderPublicReviews();
});

// Re-render when backend finishes synchronizing dynamic database data
window.addEventListener('tira-backend-synced', () => {
    renderStorefrontBranding();
    renderPublicProducts();
    renderPublicLoyaltyInfo();
    renderPublicReviews();
});

function initMobileNav() {
    const toggle = document.getElementById('mobileNavToggle');
    const drawer = document.getElementById('navDrawer');
    const backdrop = document.getElementById('mobileNavBackdrop');
    const closeBtn = document.getElementById('mobileNavClose');
    const links = document.getElementById('primaryNavLinks');

    function openDrawer() {
        if (drawer) drawer.classList.add('mobile-open');
        if (backdrop) backdrop.classList.add('active');
        document.body.classList.add('mobile-nav-active');
        if (toggle) {
            toggle.classList.add('active');
            toggle.setAttribute('aria-expanded', 'true');
            toggle.setAttribute('aria-label', 'Close navigation menu');
            toggle.innerHTML = '<i data-lucide="x" data-size="22"></i>';
        }
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    function closeDrawer() {
        if (drawer) drawer.classList.remove('mobile-open');
        if (backdrop) backdrop.classList.remove('active');
        document.body.classList.remove('mobile-nav-active');
        if (toggle) {
            toggle.classList.remove('active');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', 'Open navigation menu');
            toggle.innerHTML = '<i data-lucide="menu" data-size="22"></i>';
        }
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    // Expose closeMobileNav globally for inline onclick and external callers
    window.closeMobileNav = closeDrawer;
    window.openMobileNav = openDrawer;

    if (toggle) {
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (drawer && drawer.classList.contains('mobile-open')) {
                closeDrawer();
            } else {
                openDrawer();
            }
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeDrawer();
        });
    }

    if (backdrop) {
        backdrop.addEventListener('click', (e) => {
            e.preventDefault();
            closeDrawer();
        });
        backdrop.addEventListener('touchend', (e) => {
            e.preventDefault();
            closeDrawer();
        });
    }

    // Automatically close drawer when clicking or tapping anywhere outside the drawer
    document.addEventListener('click', (e) => {
        if (!drawer || !drawer.classList.contains('mobile-open')) return;
        if (!drawer.contains(e.target) && (!toggle || !toggle.contains(e.target))) {
            closeDrawer();
        }
    });

    document.addEventListener('touchend', (e) => {
        if (!drawer || !drawer.classList.contains('mobile-open')) return;
        if (!drawer.contains(e.target) && (!toggle || !toggle.contains(e.target))) {
            closeDrawer();
        }
    }, { passive: true });

    if (drawer) {
        drawer.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', () => {
                closeDrawer();
            });
        });
    }

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawer && drawer.classList.contains('mobile-open')) {
            closeDrawer();
        }
    });

    // Scrollspy for Mobile Floating Bottom Bar
    const bottomBar = document.getElementById('mobileBottomBar');
    if (bottomBar) {
        const sections = [
            { id: 'menu', linkId: 'mbItemMenu' },
            { id: 'experience', linkId: 'mbItemMenu' },
            { id: 'loyalty', linkId: 'mbItemRewards' },
            { id: 'contact', linkId: 'mbItemContact' }
        ];

        window.addEventListener('scroll', () => {
            const scrollPos = window.scrollY + 200;
            let currentSec = null;
            sections.forEach(sec => {
                const el = document.getElementById(sec.id);
                if (el && el.offsetTop <= scrollPos) {
                    currentSec = sec.linkId;
                }
            });

            if (currentSec) {
                bottomBar.querySelectorAll('.mobile-bottom-item').forEach(item => {
                    if (item.id === currentSec) {
                        item.classList.add('active');
                    } else if (item.id !== 'mbItemRewards' && item.id !== 'mbItemWhatsapp') {
                        item.classList.remove('active');
                    }
                });
            }
        }, { passive: true });
    }
}

function renderPublicLoyaltyInfo() {
    if (!window.TiraDB) return;
    const settings = window.TiraDB.getSettings();
    const threshold = parseInt(settings.loyaltyThreshold, 10) || 5;
    const rewardItem = settings.rewardItemName || '1 Free 150g Tiramisu';

    // 1. Hero floating badge
    const heroTitle = document.getElementById('heroOfferTitle');
    if (heroTitle) {
        heroTitle.textContent = `Buy ${threshold} Cups, Get 1 Free!`;
    }

    // 2. Loyalty Section Title
    const loyaltyTitle = document.getElementById('loyaltyOfferTitle');
    if (loyaltyTitle) {
        loyaltyTitle.textContent = `Buy ${threshold} Cups, Get 1 Free!`;
    }

    // 3. Step 2
    const step2Title = document.getElementById('loyaltyStep2Title');
    if (step2Title) {
        step2Title.textContent = `Collect ${threshold} Stamps`;
    }
    const step2Desc = document.getElementById('loyaltyStep2Desc');
    if (step2Desc) {
        step2Desc.textContent = `Each cup adds 1 stamp. Buy ${threshold} eligible cups across any dates or visits — they all count!`;
    }

    // 4. Step 3
    const step3Title = document.getElementById('loyaltyStep3Title');
    if (step3Title) {
        step3Title.textContent = `Claim ${rewardItem}!`;
    }

    // 5. Preview card badge
    const cardBadge = document.getElementById('loyaltyCardBadge');
    if (cardBadge) {
        cardBadge.textContent = `${threshold} Stamps = 1 Free Cup`;
    }

    // 6. Preview Stamp Row: [threshold] Paid Slots + 1 Separate Reward Slot
    const stampsRow = document.getElementById('loyaltyPreviewStampsRow');
    if (stampsRow) {
        stampsRow.innerHTML = '';
        const totalSlots = threshold + 1;
        const gridCols = totalSlots <= 7 ? totalSlots : Math.ceil(totalSlots / 2);
        stampsRow.style.setProperty('--stamp-cols', gridCols);

        // Paid Stamp Slots: 1 to threshold
        for (let i = 1; i <= threshold; i++) {
            const slot = document.createElement('div');
            slot.className = 'stamp-slot stamped';
            slot.innerHTML = `
                <div class="loyalty-cup-container preview-cup">
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
                <span class="stamp-number">#${i}</span>
            `;
            stampsRow.appendChild(slot);
        }

        // Separate Reward Slot (distinct green styling)
        const rewardSlot = document.createElement('div');
        rewardSlot.className = 'stamp-slot reward-slot stamped';
        rewardSlot.innerHTML = `
            <div class="loyalty-cup-container preview-cup">
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
                <div class="cup-reward-badge" style="background: #27ae60;">FREE</div>
            </div>
            <span class="stamp-number" style="color: #27ae60; font-weight: 800;">FREE</span>
        `;
        stampsRow.appendChild(rewardSlot);
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

let activeStorefrontCategory = 'all';

window.setStorefrontCategory = function(catId) {
    activeStorefrontCategory = catId;
    renderPublicProducts();
};

function renderPublicProducts() {
    const container = document.getElementById('publicProductsGrid');
    const navContainer = document.getElementById('storefrontCategoryNav');
    if (!container) return;

    const allActiveProducts = window.TiraDB.getProducts(true); // Active products only
    const categories = window.TiraDB.getCategories(true); // Active categories only
    const settings = window.TiraDB.getSettings();
    const curr = settings.currency || '₹';

    // 1. Render Category Navigation Tabs
    if (navContainer) {
        let navHtml = `
            <button type="button" class="category-nav-pill ${activeStorefrontCategory === 'all' ? 'active' : ''}" onclick="setStorefrontCategory('all')">
                <span>All Tiramisu</span>
                <span class="cat-count-badge">${allActiveProducts.length}</span>
            </button>
        `;
        categories.forEach(cat => {
            const count = allActiveProducts.filter(p => p.categoryId === cat.id).length;
            navHtml += `
                <button type="button" class="category-nav-pill ${activeStorefrontCategory === cat.id ? 'active' : ''}" onclick="setStorefrontCategory('${cat.id}')">
                    <span>${escapeHtml(cat.name)}</span>
                    <span class="cat-count-badge">${count}</span>
                </button>
            `;
        });
        navContainer.innerHTML = navHtml;
    }

    // Helper to render an individual product card
    const renderCard = (p) => {
        let badgeText = p.badge || '';
        if (!badgeText) {
            const isChoco = (p.categoryId === 'cat-chocolate') || (p.name || '').toLowerCase().includes('choco');
            const is350 = (p.weight || '').includes('350') || (p.name || '').includes('350');
            badgeText = isChoco 
                ? (is350 ? 'Best Value • Sharing Tub' : 'Chocolate Single Serve')
                : (is350 ? 'Best Value • Sharing Tub' : 'Classic Single Serve');
        }

        return `
        <div class="product-card">
            <div class="product-media">
                <img src="${p.image || 'assets/classic/tiramisu-classic-150 g.png'}" alt="${escapeHtml(p.name)}" width="300" height="220" loading="lazy" decoding="async" onerror="this.src='assets/poster/tiramisu-classic-poster.png'">
                <span class="product-weight-tag">${escapeHtml(p.weight || '')}</span>
                ${badgeText ? `<span class="product-badge">${escapeHtml(badgeText)}</span>` : ''}
            </div>
            <div class="product-content">
                <h3 class="product-name">${escapeHtml(p.name)}</h3>
                <p class="product-desc">${escapeHtml(p.description || '')}</p>
                <div class="product-footer">
                    <div class="product-price-box">
                        <span class="price-label">Counter Price</span>
                        <span class="product-price">${curr}${p.price}</span>
                    </div>
                    <div>
                        <span class="counter-tag"><i data-lucide="check" data-size="13"></i> Fresh at Counter</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    };

    container.innerHTML = '';

    if (!allActiveProducts.length) {
        container.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: var(--color-text-muted);">
                <i data-lucide="coffee" data-size="36" style="margin-bottom: 10px; color: var(--color-caramel);"></i>
                <h3 style="font-family: var(--font-heading); color: var(--color-espresso); margin-bottom: 6px;">Fresh Batch In The Making</h3>
                <p>Our artisan chefs are whipping fresh mascarpone cream! Please check back in a few moments.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    // 2. Render Category-Wise Showcase Groups
    if (activeStorefrontCategory === 'all') {
        let hasAnyGroup = false;

        // Render each category in defined order
        categories.forEach(cat => {
            const prodsInCat = allActiveProducts.filter(p => p.categoryId === cat.id);
            if (prodsInCat.length > 0) {
                hasAnyGroup = true;
                const groupEl = document.createElement('div');
                groupEl.className = 'category-showcase-group';
                groupEl.id = `cat-group-${cat.id}`;
                groupEl.innerHTML = `
                    <div class="category-showcase-header">
                        <div>
                            <div class="category-header-main">
                                <h3 class="category-header-title">${escapeHtml(cat.name)}</h3>
                                <span class="category-header-badge">${prodsInCat.length} Size${prodsInCat.length === 1 ? '' : 's'}</span>
                            </div>
                            ${cat.description ? `<p class="category-header-desc">${escapeHtml(cat.description)}</p>` : ''}
                        </div>
                    </div>
                    <div class="products-grid">
                        ${prodsInCat.map(renderCard).join('')}
                    </div>
                `;
                container.appendChild(groupEl);
            }
        });

        // Any active products unassigned to a category
        const uncategorized = allActiveProducts.filter(p => !p.categoryId || !categories.some(c => c.id === p.categoryId));
        if (uncategorized.length > 0) {
            const groupEl = document.createElement('div');
            groupEl.className = 'category-showcase-group';
            groupEl.innerHTML = `
                <div class="category-showcase-header">
                    <div>
                        <div class="category-header-main">
                            <h3 class="category-header-title">Artisan Dessert Specials</h3>
                            <span class="category-header-badge">${uncategorized.length} Item${uncategorized.length === 1 ? '' : 's'}</span>
                        </div>
                    </div>
                </div>
                <div class="products-grid">
                    ${uncategorized.map(renderCard).join('')}
                </div>
            `;
            container.appendChild(groupEl);
        }
    } else {
        // Filtered view for a single selected category
        const selectedCat = categories.find(c => c.id === activeStorefrontCategory);
        const filteredProds = allActiveProducts.filter(p => p.categoryId === activeStorefrontCategory);

        if (selectedCat) {
            const groupEl = document.createElement('div');
            groupEl.className = 'category-showcase-group';
            groupEl.innerHTML = `
                <div class="category-showcase-header">
                    <div>
                        <div class="category-header-main">
                            <h3 class="category-header-title">${escapeHtml(selectedCat.name)}</h3>
                            <span class="category-header-badge">${filteredProds.length} Size${filteredProds.length === 1 ? '' : 's'}</span>
                        </div>
                        ${selectedCat.description ? `<p class="category-header-desc">${escapeHtml(selectedCat.description)}</p>` : ''}
                    </div>
                </div>
                <div class="products-grid">
                    ${filteredProds.length > 0 
                        ? filteredProds.map(renderCard).join('') 
                        : '<div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--color-text-muted);">No products currently available in this category.</div>'}
                </div>
            `;
            container.appendChild(groupEl);
        }
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// Handle quick tracker input on home page
window.handleQuickTrack = function() {
    const input = document.getElementById('quickTrackerInput');
    const val = input ? input.value.trim() : '';
    if (!val) {
        if (window.TiraAlert) {
            window.TiraAlert.warning('Please enter your mobile phone number or name to look up your tiramisu loyalty stamps.', 'Loyalty Tracker');
        } else {
            alert('Please enter your phone number or name to track your loyalty progress.');
        }
        if (input) input.focus();
        return;
    }
    // Redirect to tracker.html with query parameter
    window.location.href = `tracker.html?phone=${encodeURIComponent(val)}`;
};

function renderStorefrontBranding() {
    if (!window.TiraDB) return;
    const settings = window.TiraDB.getSettings();
    window.TiraDB.applyGlobalBranding(settings);

    // Dynamic WhatsApp contact items in Visit Our Dessert Studio section
    const contactsContainer = document.getElementById('publicStorefrontContactLinks');
    if (contactsContainer) {
        const phone1 = settings.phone || '9373484198';
        const phone2 = settings.phoneSecondary || '';
        const owner = settings.owner || 'Yash Chauhan & Tejas Chauhan';
        const bizName = settings.businessName || 'TIRA Belle';

        let owner1 = 'Yash Chauhan';
        let owner2 = 'Tejas Chauhan';
        if (owner && owner.includes('&')) {
            const parts = owner.split('&').map(s => s.trim());
            if (parts[0]) owner1 = parts[0];
            if (parts[1]) owner2 = parts[1];
        }

        let html = `
            <div class="contact-card-title">WhatsApp &amp; Direct Orders</div>
            <div class="contact-phones-row">
                <a href="https://wa.me/91${phone1.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello ${owner1}! I would like to order ${bizName} tiramisu`)}" target="_blank" rel="noopener noreferrer" class="contact-phone-chip" title="Chat on WhatsApp with ${owner1}">
                    <span class="chip-owner">${owner1}:</span>
                    <span class="chip-number">${phone1}</span>
                </a>
        `;
        if (phone2) {
            html += `
                <a href="https://wa.me/91${phone2.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello ${owner2}! I would like to order ${bizName} tiramisu`)}" target="_blank" rel="noopener noreferrer" class="contact-phone-chip" title="Chat on WhatsApp with ${owner2}">
                    <span class="chip-owner">${owner2}:</span>
                    <span class="chip-number">${phone2}</span>
                </a>
            `;
        }
        html += `
            </div>
            <div class="contact-card-subtext">Direct artisan response for pre-orders &amp; special tubs</div>
        `;
        contactsContainer.innerHTML = html;
    }

    // Dynamic Action CTA buttons
    const btnContainer = document.getElementById('publicStorefrontActionButtons');
    if (btnContainer) {
        const phone1 = settings.phone || '9373484198';
        const phone2 = settings.phoneSecondary || '';
        const bizName = settings.businessName || 'TIRA Belle';
        const rawInsta = (settings.instagram || 'tirabelle.desserts').trim();
        const cleanHandle = rawInsta.replace(/^@/, '');
        const instaUrl = (settings.instagramUrl || settings.instagram_url || `https://instagram.com/${cleanHandle}?obrf=MzhsZG04Ymc3NXBj`).trim();
        const instaDisplay = cleanHandle ? `@${cleanHandle}` : '@tirabelle.desserts';

        let btnsHtml = `
            <a href="https://wa.me/91${phone1.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello! I would like to order ${bizName} tiramisu`)}" target="_blank" class="btn btn-caramel btn-icon-circle" title="Order via WhatsApp (${phone1})" aria-label="Order via WhatsApp (${phone1})"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></a>
        `;
        if (phone2) {
            btnsHtml += `
                <a href="https://wa.me/91${phone2.replace(/\D/g, '')}?text=${encodeURIComponent(`Hello! I would like to order ${bizName} tiramisu`)}" target="_blank" class="btn btn-caramel btn-icon-circle" title="Contact (${phone2})" aria-label="Contact (${phone2})"><i data-lucide="phone" data-size="24"></i></a>
            `;
        }
        btnsHtml += `
            <a href="${instaUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-caramel btn-icon-circle btn-icon-instagram" data-brand="instagram-link" title="Follow ${bizName} on Instagram (${instaDisplay})" aria-label="Follow ${bizName} on Instagram"><i data-lucide="instagram" data-size="24"></i></a>
            <a href="tracker.html" class="btn btn-loyalty-cta" title="Check Loyalty Status" aria-label="Check Loyalty Status"><i data-lucide="loyalty-award" data-size="24"></i></a>
        `;
        btnContainer.innerHTML = btnsHtml;
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// ==========================================================================
// Customer Reviews Horizontal Scrolling Carousel
// ==========================================================================
let reviewsAutoPlayTimer = null;

function renderPublicReviews() {
    const track = document.getElementById('reviewsCarouselTrack');
    const dotsContainer = document.getElementById('reviewsCarouselDots');

    if (!track) return;
    if (!window.TiraDB) return;

    const reviews = window.TiraDB.getReviews();
    track.innerHTML = '';
    if (dotsContainer) dotsContainer.innerHTML = '';

    if (!reviews || reviews.length === 0) {
        track.innerHTML = `
            <div class="review-empty-state">
                <i data-lucide="sparkles" data-size="36" style="color: var(--color-caramel); margin-bottom: 10px;"></i>
                <h4 style="font-family: var(--font-heading); color: var(--color-espresso); margin-bottom: 6px;">Be the First to Review!</h4>
                <p style="color: var(--color-text-muted); font-size: 0.9rem; max-width: 380px; margin: 0 auto 16px;">
                    Have you tasted our handcrafted tiramisu? Leave a review and let others know about your experience.
                </p>
                <a href="tracker.html#reviewSection" class="btn btn-caramel btn-sm">
                    <i data-lucide="star" data-size="14"></i>
                    <span>Leave a Review</span>
                </a>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    // Pastel gradient avatars for variety
    const AVATAR_GRADIENTS = [
        'linear-gradient(135deg, #b7793d, #824f21)',
        'linear-gradient(135deg, #24140e, #4a2818)',
        'linear-gradient(135deg, #935116, #b7793d)',
        'linear-gradient(135deg, #512e1e, #824f21)',
        'linear-gradient(135deg, #784212, #a05a1c)'
    ];

    reviews.forEach((rev, idx) => {
        const rating = Math.max(1, Math.min(5, rev.rating || 5));
        let starsHtml = '';
        for (let s = 1; s <= 5; s++) {
            if (s <= rating) {
                starsHtml += `<span class="star-icon filled">★</span>`;
            } else {
                starsHtml += `<span class="star-icon empty">☆</span>`;
            }
        }

        // Initials avatar
        const initials = rev.name
            ? rev.name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
            : 'TB';
        const grad = AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length];

        // Format Date
        let dateDisplay = '';
        if (rev.date) {
            try {
                const parts = rev.date.split('-');
                if (parts.length === 3) {
                    const d = new Date(parts[0], parts[1] - 1, parts[2]);
                    dateDisplay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                } else {
                    dateDisplay = rev.date;
                }
            } catch (e) {
                dateDisplay = rev.date;
            }
        }

        const safeName = typeof escapeHtml === 'function' ? escapeHtml(rev.name) : rev.name;
        const safeComment = typeof escapeHtml === 'function' ? escapeHtml(rev.comment) : rev.comment;
        const safeFav = typeof escapeHtml === 'function' ? escapeHtml(rev.favoriteItem || 'Classic Cup') : (rev.favoriteItem || 'Classic Cup');

        const card = document.createElement('div');
        card.className = 'review-card';
        card.setAttribute('data-index', idx);
        let favIcon = 'cake-slice';
        if (safeFav.includes('Chocolate – 350') || safeFav.includes('Chocolate - 350')) favIcon = 'ice-cream-bowl';
        else if (safeFav.includes('Chocolate')) favIcon = 'cookie';
        else if (safeFav.includes('350')) favIcon = 'cake';

        card.innerHTML = `
            <div class="review-card-top">
                <div class="review-stars-wrap">${starsHtml}</div>
                <div class="review-quote-mark">“</div>
            </div>
            
            <p class="review-comment-text">${safeComment}</p>
            
            <div class="review-card-footer">
                <div class="review-avatar" style="background: ${grad};">${initials}</div>
                <div class="review-author-meta">
                    <div class="review-author-name">
                        <span>${safeName}</span>
                        ${rev.verified ? `<span class="review-verified-badge" title="Verified Customer"><i data-lucide="badge-check" data-size="13"></i> Verified Guest</span>` : ''}
                    </div>
                    <div class="review-extra-tags">
                        <span class="review-cup-tag"><i data-lucide="${favIcon}" data-size="12"></i> ${safeFav}</span>
                        ${dateDisplay ? `<span class="review-date-tag">${dateDisplay}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
        track.appendChild(card);

        // Dot for navigation
        if (dotsContainer) {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = `carousel-dot ${idx === 0 ? 'active' : ''}`;
            dot.setAttribute('aria-label', `Go to review ${idx + 1}`);
            dot.onclick = () => {
                scrollToReviewCard(idx);
            };
            dotsContainer.appendChild(dot);
        }
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }

    // Attach Carousel Navigation Event Listeners
    setupReviewsCarouselInteractions(track, dotsContainer);
}

function setupReviewsCarouselInteractions(track, dotsContainer) {
    if (!track) return;

    function getCardWidth() {
        const firstCard = track.querySelector('.review-card');
        if (firstCard) {
            return firstCard.offsetWidth + 24; // card width + gap
        }
        return 384;
    }

    function scrollNext() {
        const step = getCardWidth();
        const maxScroll = track.scrollWidth - track.clientWidth;
        if (track.scrollLeft >= maxScroll - 10) {
            // Loop back to start smoothly
            track.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
            track.scrollBy({ left: step, behavior: 'smooth' });
        }
    }

    function scrollPrev() {
        const step = getCardWidth();
        if (track.scrollLeft <= 10) {
            // Loop to end smoothly
            track.scrollTo({ left: track.scrollWidth, behavior: 'smooth' });
        } else {
            track.scrollBy({ left: -step, behavior: 'smooth' });
        }
    }

    // ==========================================
    // Mouse Drag-to-Scroll (Desktop)
    // ==========================================
    let isDown = false;
    let startX = 0;
    let initialScrollLeft = 0;

    track.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Only primary left mouse click
        isDown = true;
        track.classList.add('is-dragging');
        startX = e.pageX - track.offsetLeft;
        initialScrollLeft = track.scrollLeft;
        stopReviewsAutoPlay();
    });

    const stopDragging = () => {
        if (!isDown) return;
        isDown = false;
        track.classList.remove('is-dragging');
        track.style.scrollSnapType = 'x mandatory';
        track.style.scrollBehavior = 'smooth';
        startReviewsAutoPlay(scrollNext);
    };

    window.addEventListener('mouseup', stopDragging);

    track.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const currentX = e.pageX - track.offsetLeft;
        const walk = (currentX - startX) * 1.35;
        track.scrollLeft = initialScrollLeft - walk;
    });

    // ==========================================
    // Mouse Wheel / Trackpad Smooth Horizontal Scroll
    // ==========================================
    track.addEventListener('wheel', (e) => {
        // Redirect vertical wheel scroll to horizontal smoothly
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && Math.abs(e.deltaY) > 4) {
            e.preventDefault();
            stopReviewsAutoPlay();
            track.scrollBy({
                left: e.deltaY * 1.25,
                behavior: 'smooth'
            });
            clearTimeout(track._wheelTimeout);
            track._wheelTimeout = setTimeout(() => {
                startReviewsAutoPlay(scrollNext);
            }, 3000);
        }
    }, { passive: false });

    // Update active dot based on current scroll position
    track.addEventListener('scroll', () => {
        if (!dotsContainer) return;
        const step = getCardWidth();
        const activeIdx = Math.round(track.scrollLeft / step);
        const dots = dotsContainer.querySelectorAll('.carousel-dot');
        dots.forEach((dot, i) => {
            if (i === activeIdx) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        });
    }, { passive: true });

    // Keyboard navigation when track is focused
    track.setAttribute('tabindex', '0');
    track.setAttribute('role', 'region');
    track.setAttribute('aria-label', 'Customer Reviews Carousel');
    track.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            scrollPrev();
        } else if (e.key === 'ArrowRight') {
            scrollNext();
        }
    });

    // Auto-play timer (advances smoothly, pauses on interaction)
    startReviewsAutoPlay(scrollNext);

    track.addEventListener('mouseenter', stopReviewsAutoPlay);
    track.addEventListener('mouseleave', () => {
        if (!isDown) startReviewsAutoPlay(scrollNext);
    });
    track.addEventListener('touchstart', stopReviewsAutoPlay, { passive: true });
    track.addEventListener('touchend', () => startReviewsAutoPlay(scrollNext), { passive: true });
}

function scrollToReviewCard(index) {
    const track = document.getElementById('reviewsCarouselTrack');
    if (!track) return;
    const cards = track.querySelectorAll('.review-card');
    if (cards[index]) {
        cards[index].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
}

function startReviewsAutoPlay(scrollFn) {
    stopReviewsAutoPlay();
    const track = document.getElementById('reviewsCarouselTrack');
    if (!track) return;
    // Don't auto-scroll if only 1 card or screen width shows all cards
    if (track.scrollWidth <= track.clientWidth) return;

    reviewsAutoPlayTimer = setInterval(() => {
        if (typeof scrollFn === 'function') {
            scrollFn();
        }
    }, 4500);
}

function stopReviewsAutoPlay() {
    if (reviewsAutoPlayTimer) {
        clearInterval(reviewsAutoPlayTimer);
        reviewsAutoPlayTimer = null;
    }
}

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

    // Initial check
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
 * Navigation Prefetch Optimizer
 * Prefetches key destinations (tracker.html, admin.html) on idle or link hover.
 */
function initNavigationPrefetch() {
    const prefetchUrl = (url) => {
        if (!url || document.querySelector(`link[rel="prefetch"][href="${url}"]`)) return;
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url;
        document.head.appendChild(link);
    };

    document.querySelectorAll('a[href$=".html"]').forEach(a => {
        a.addEventListener('mouseenter', () => prefetchUrl(a.getAttribute('href')), { once: true, passive: true });
        a.addEventListener('touchstart', () => prefetchUrl(a.getAttribute('href')), { once: true, passive: true });
    });
}

/**
 * 02 Word Rotator Controller
 * Smoothly cycles through the four brand promises:
 * Love -> Pure Mascarpone -> Dark Espresso -> Belgian Cocoa
 */
function initWordRotator() {
    const container = document.querySelector('.word-rotator-container');
    if (!container) return;

    const words = container.querySelectorAll('.rotator-word');
    if (words.length <= 1) return;

    let currentIndex = 0;
    let rotatorInterval = null;

    function rotateNext() {
        const currentWord = words[currentIndex];
        currentIndex = (currentIndex + 1) % words.length;
        const nextWord = words[currentIndex];

        // Animate out current
        currentWord.classList.remove('active');
        currentWord.classList.add('exit-up');

        // Animate in next
        nextWord.classList.remove('exit-up');
        nextWord.classList.add('active');

        setTimeout(() => {
            currentWord.classList.remove('exit-up');
        }, 500);
    }

    rotatorInterval = setInterval(rotateNext, 3200);

    // Pause on hover or when page is backgrounded
    container.addEventListener('mouseenter', () => clearInterval(rotatorInterval));
    container.addEventListener('mouseleave', () => {
        clearInterval(rotatorInterval);
        rotatorInterval = setInterval(rotateNext, 3200);
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearInterval(rotatorInterval);
        } else {
            clearInterval(rotatorInterval);
            rotatorInterval = setInterval(rotateNext, 3200);
        }
    });
}

/**
 * 08 Process Draw & Loyalty Celebration Observer
 * Draws an illuminated connecting path between loyalty steps and triggers a subtle celebration
 * animation on the Loyalty section when the visitor scrolls to it.
 */
function initProcessDrawObserver() {
    const loyaltySection = document.getElementById('loyalty');
    const stepsContainer = document.getElementById('loyaltyProcessSteps');
    if (!loyaltySection && !stepsContainer) return;

    const targetEl = loyaltySection || stepsContainer;

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                if (loyaltySection) {
                    loyaltySection.classList.add('celebration-active');
                }
                if (stepsContainer) {
                    stepsContainer.classList.add('draw-active');
                }
                // Once triggered, unobserve to maintain maximum performance
                obs.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.18,
        rootMargin: '0px 0px -40px 0px'
    });

    observer.observe(targetEl);
}

