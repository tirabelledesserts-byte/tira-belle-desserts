/**
 * TIRA Belle - Universal Alerts & Pop-up Notification Engine
 * Provides customizable, accessible, and theme-harmonized modals,
 * confirmation dialogs, prompt dialogs, and toast notifications.
 * Works seamlessly across Admin Panel, Storefront, and Public Tracker.
 */
(function() {
    'use strict';

    // SVG icon fallbacks if Lucide is not ready
    const ICON_SVGS = {
        'success': '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
        'error': '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
        'warning': '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>',
        'danger': '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
        'info': '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
        'question': '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>',
        'gift': '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 4 0 0 1 12 8a4.8 4 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></svg>',
        'trash-2': '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>',
        'rotate-ccw': '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
        'bell': '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>'
    };

    function getIconHtml(type, customIcon = null) {
        if (customIcon && ICON_SVGS[customIcon]) {
            return ICON_SVGS[customIcon];
        }
        if (window.lucide && customIcon) {
            return `<i data-lucide="${customIcon}" data-size="28"></i>`;
        }
        return ICON_SVGS[type] || ICON_SVGS['info'];
    }

    function ensureToastContainer() {
        let container = document.getElementById('tiraToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'tiraToastContainer';
            container.className = 'tira-toast-container';
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('aria-atomic', 'true');
            container.setAttribute('role', 'region');
            container.setAttribute('aria-label', 'System notifications');
            document.body.appendChild(container);
        }
        return container;
    }

    const TiraAlert = {
        /**
         * Toast notification (Auto-dismissing, non-blocking)
         * @param {Object} options { message, title, type = 'info', duration = 3800, action }
         */
        toast: function(options) {
            if (typeof options === 'string') {
                options = { message: options, type: arguments[1] || 'info', title: arguments[2] || null };
            }
            const type = options.type || 'info';
            const message = options.message || '';
            const title = options.title || null;
            const duration = typeof options.duration === 'number' ? options.duration : 3800;
            const action = options.action || null;

            // Subtle tactile haptic response on supported mobile devices
            if ('vibrate' in navigator) {
                try {
                    navigator.vibrate(type === 'error' || type === 'danger' ? [30, 50, 30] : 12);
                } catch (_) {}
            }

            const container = ensureToastContainer();

            // Stack cap
            while (container.children.length >= 4) {
                container.firstElementChild.remove();
            }

            const toast = document.createElement('div');
            toast.className = `tira-toast-card tira-toast-${type}`;
            toast.setAttribute('role', 'alert');

            const iconSvg = getIconHtml(type, options.icon);

            let actionHtml = '';
            if (action && action.label) {
                actionHtml = `<button type="button" class="tira-toast-action-btn">${action.label}</button>`;
            }

            toast.innerHTML = `
                <div class="tira-toast-icon-wrap">${iconSvg}</div>
                <div class="tira-toast-content">
                    ${title ? `<div class="tira-toast-title">${title}</div>` : ''}
                    <div class="tira-toast-msg">${message}</div>
                </div>
                ${actionHtml}
                <button type="button" class="tira-toast-close-btn" aria-label="Close notification">&times;</button>
                <div class="tira-toast-progress"><div class="tira-toast-progress-bar"></div></div>
            `;

            container.appendChild(toast);
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons();
            }

            const progressBar = toast.querySelector('.tira-toast-progress-bar');
            let remaining = duration;
            let startTime = Date.now();
            let timer = null;
            let isPaused = false;

            function startTimer() {
                if (duration <= 0) return;
                startTime = Date.now();
                if (progressBar) {
                    progressBar.style.transition = `width ${remaining}ms linear`;
                    progressBar.style.width = '0%';
                }
                timer = setTimeout(() => {
                    dismiss();
                }, remaining);
            }

            function pauseTimer() {
                if (duration <= 0 || isPaused) return;
                isPaused = true;
                clearTimeout(timer);
                const elapsed = Date.now() - startTime;
                remaining = Math.max(0, remaining - elapsed);
                if (progressBar) {
                    const currentWidth = (remaining / duration) * 100;
                    progressBar.style.transition = 'none';
                    progressBar.style.width = `${currentWidth}%`;
                }
            }

            function resumeTimer() {
                if (duration <= 0 || !isPaused) return;
                isPaused = false;
                startTimer();
            }

            function dismiss() {
                clearTimeout(timer);
                toast.classList.add('tira-toast-closing');
                setTimeout(() => {
                    if (toast.parentNode) toast.remove();
                }, 260);
            }

            toast.addEventListener('mouseenter', pauseTimer);
            toast.addEventListener('mouseleave', resumeTimer);

            const closeBtn = toast.querySelector('.tira-toast-close-btn');
            if (closeBtn) closeBtn.onclick = (e) => { e.stopPropagation(); dismiss(); };

            if (action && action.onClick) {
                const actionBtn = toast.querySelector('.tira-toast-action-btn');
                if (actionBtn) {
                    actionBtn.onclick = (e) => {
                        e.stopPropagation();
                        action.onClick();
                        dismiss();
                    };
                }
            }

            startTimer();
            return { dismiss };
        },

        success: function(msg, title, duration) {
            return this.toast({ message: msg, title: title, type: 'success', duration: duration });
        },
        error: function(msg, title, duration) {
            return this.toast({ message: msg, title: title, type: 'error', duration: duration || 4500 });
        },
        warning: function(msg, title, duration) {
            return this.toast({ message: msg, title: title, type: 'warning', duration: duration || 4200 });
        },
        info: function(msg, title, duration) {
            return this.toast({ message: msg, title: title, type: 'info', duration: duration });
        },

        /**
         * Beautiful Custom Confirmation Modal (Promise-based)
         * @param {Object} options { title, message, type = 'warning', confirmText, cancelText, icon, confirmBtnClass }
         * @returns {Promise<boolean>}
         */
        confirm: function(options) {
            if (typeof options === 'string') {
                options = { message: options, title: 'Confirmation Required' };
            }
            const title = options.title || 'Are you sure?';
            const message = options.message || '';
            const type = options.type || 'warning'; // 'warning' | 'danger' | 'info' | 'success'
            const confirmText = options.confirmText || (type === 'danger' ? 'Yes, Delete' : 'Confirm');
            const cancelText = options.cancelText || 'Cancel';
            const iconKey = options.icon || (type === 'danger' ? 'trash-2' : (type === 'success' ? 'circle-check' : 'triangle-alert'));
            const isDanger = type === 'danger';

            return new Promise((resolve) => {
                const activeElBefore = document.activeElement;

                const overlay = document.createElement('div');
                overlay.className = 'tira-popup-overlay';
                overlay.setAttribute('role', 'dialog');
                overlay.setAttribute('aria-modal', 'true');
                overlay.setAttribute('aria-labelledby', 'tiraPopupTitle');
                overlay.setAttribute('aria-describedby', 'tiraPopupMsg');

                const iconSvg = getIconHtml(type, iconKey);

                overlay.innerHTML = `
                    <div class="tira-popup-card tira-popup-${type}">
                        <div class="tira-popup-badge tira-badge-${type}">
                            ${iconSvg}
                        </div>
                        <h2 class="tira-popup-title" id="tiraPopupTitle">${title}</h2>
                        <div class="tira-popup-msg" id="tiraPopupMsg">${message}</div>
                        <div class="tira-popup-actions">
                            <button type="button" class="btn btn-outline tira-popup-cancel-btn" id="tiraPopupCancel">
                                <span>${cancelText}</span>
                            </button>
                            <button type="button" class="btn ${isDanger ? 'btn-danger' : 'btn-caramel'} tira-popup-confirm-btn" id="tiraPopupConfirm">
                                <span>${confirmText}</span>
                            </button>
                        </div>
                    </div>
                `;

                function cleanup(result) {
                    overlay.classList.add('tira-popup-closing');
                    document.removeEventListener('keydown', handleKeydown);
                    setTimeout(() => {
                        if (overlay.parentNode) overlay.remove();
                        if (activeElBefore && typeof activeElBefore.focus === 'function') {
                            activeElBefore.focus();
                        }
                        resolve(result);
                    }, 220);
                }

                function handleKeydown(e) {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        cleanup(false);
                    } else if (e.key === 'Enter') {
                        // Confirm if enter pressed on non-cancel
                        if (document.activeElement && document.activeElement.id === 'tiraPopupCancel') {
                            cleanup(false);
                        } else {
                            e.preventDefault();
                            cleanup(true);
                        }
                    }
                }

                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) {
                        cleanup(false);
                    }
                });

                document.body.appendChild(overlay);
                if (window.lucide && typeof window.lucide.createIcons === 'function') {
                    window.lucide.createIcons();
                }

                const confirmBtn = overlay.querySelector('#tiraPopupConfirm');
                const cancelBtn = overlay.querySelector('#tiraPopupCancel');

                if (confirmBtn) confirmBtn.onclick = () => cleanup(true);
                if (cancelBtn) cancelBtn.onclick = () => cleanup(false);

                document.addEventListener('keydown', handleKeydown);
                // Auto focus confirm or cancel
                setTimeout(() => {
                    if (isDanger && cancelBtn) {
                        cancelBtn.focus();
                    } else if (confirmBtn) {
                        confirmBtn.focus();
                    }
                }, 50);
            });
        },

        /**
         * Beautiful Custom Alert Modal (Promise-based)
         * @param {Object} options { title, message, type = 'info', buttonText, icon }
         * @returns {Promise<void>}
         */
        alert: function(options) {
            if (typeof options === 'string') {
                options = { message: options, title: arguments[1] || 'Notice' };
            }
            const title = options.title || 'Notice';
            const message = options.message || '';
            const type = options.type || 'info';
            const buttonText = options.buttonText || 'Got It';
            const iconKey = options.icon || (type === 'success' ? 'circle-check' : (type === 'error' ? 'circle-x' : (type === 'warning' ? 'triangle-alert' : 'info')));

            return new Promise((resolve) => {
                const activeElBefore = document.activeElement;

                const overlay = document.createElement('div');
                overlay.className = 'tira-popup-overlay';
                overlay.setAttribute('role', 'dialog');
                overlay.setAttribute('aria-modal', 'true');

                const iconSvg = getIconHtml(type, iconKey);

                overlay.innerHTML = `
                    <div class="tira-popup-card tira-popup-${type}">
                        <div class="tira-popup-badge tira-badge-${type}">
                            ${iconSvg}
                        </div>
                        <h2 class="tira-popup-title">${title}</h2>
                        <div class="tira-popup-msg">${message}</div>
                        <div class="tira-popup-actions" style="justify-content: center;">
                            <button type="button" class="btn btn-caramel btn-lg tira-popup-confirm-btn" id="tiraPopupAlertOk" style="min-width: 150px;">
                                <span>${buttonText}</span>
                            </button>
                        </div>
                    </div>
                `;

                function cleanup() {
                    overlay.classList.add('tira-popup-closing');
                    document.removeEventListener('keydown', handleKeydown);
                    setTimeout(() => {
                        if (overlay.parentNode) overlay.remove();
                        if (activeElBefore && typeof activeElBefore.focus === 'function') {
                            activeElBefore.focus();
                        }
                        resolve();
                    }, 220);
                }

                function handleKeydown(e) {
                    if (e.key === 'Escape' || e.key === 'Enter') {
                        e.preventDefault();
                        cleanup();
                    }
                }

                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) cleanup();
                });

                document.body.appendChild(overlay);
                if (window.lucide && typeof window.lucide.createIcons === 'function') {
                    window.lucide.createIcons();
                }

                const okBtn = overlay.querySelector('#tiraPopupAlertOk');
                if (okBtn) okBtn.onclick = cleanup;

                document.addEventListener('keydown', handleKeydown);
                setTimeout(() => { if (okBtn) okBtn.focus(); }, 50);
            });
        },

        /**
         * Beautiful Custom Prompt Modal (Promise-based)
         * @param {Object} options { title, message, placeholder, defaultValue, inputType, confirmText, cancelText }
         * @returns {Promise<string|null>}
         */
        prompt: function(options) {
            if (typeof options === 'string') {
                options = { message: options, title: 'Input Required' };
            }
            const title = options.title || 'Please Enter Details';
            const message = options.message || '';
            const placeholder = options.placeholder || '';
            const defaultValue = options.defaultValue || '';
            const inputType = options.inputType || 'text';
            const confirmText = options.confirmText || 'Submit';
            const cancelText = options.cancelText || 'Cancel';

            return new Promise((resolve) => {
                const activeElBefore = document.activeElement;

                const overlay = document.createElement('div');
                overlay.className = 'tira-popup-overlay';
                overlay.setAttribute('role', 'dialog');
                overlay.setAttribute('aria-modal', 'true');

                overlay.innerHTML = `
                    <div class="tira-popup-card tira-popup-info">
                        <div class="tira-popup-badge tira-badge-info">
                            ${ICON_SVGS['question']}
                        </div>
                        <h2 class="tira-popup-title">${title}</h2>
                        ${message ? `<div class="tira-popup-msg">${message}</div>` : ''}
                        <div style="margin: 16px 0 24px;">
                            <input type="${inputType}" id="tiraPromptInput" class="form-input" style="width: 100%; text-align: center; font-size: 1.05rem;" placeholder="${placeholder}" value="${defaultValue}">
                        </div>
                        <div class="tira-popup-actions">
                            <button type="button" class="btn btn-outline" id="tiraPromptCancel">
                                <span>${cancelText}</span>
                            </button>
                            <button type="button" class="btn btn-caramel" id="tiraPromptConfirm">
                                <span>${confirmText}</span>
                            </button>
                        </div>
                    </div>
                `;

                const inputEl = overlay.querySelector('#tiraPromptInput');

                function cleanup(value) {
                    overlay.classList.add('tira-popup-closing');
                    document.removeEventListener('keydown', handleKeydown);
                    setTimeout(() => {
                        if (overlay.parentNode) overlay.remove();
                        if (activeElBefore && typeof activeElBefore.focus === 'function') {
                            activeElBefore.focus();
                        }
                        resolve(value);
                    }, 220);
                }

                function handleKeydown(e) {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        cleanup(null);
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        cleanup(inputEl ? inputEl.value : '');
                    }
                }

                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) cleanup(null);
                });

                document.body.appendChild(overlay);

                const confirmBtn = overlay.querySelector('#tiraPromptConfirm');
                const cancelBtn = overlay.querySelector('#tiraPromptCancel');

                if (confirmBtn) confirmBtn.onclick = () => cleanup(inputEl ? inputEl.value : '');
                if (cancelBtn) cancelBtn.onclick = () => cleanup(null);

                document.addEventListener('keydown', handleKeydown);
                setTimeout(() => {
                    if (inputEl) {
                        inputEl.focus();
                        inputEl.select();
                    }
                }, 50);
            });
        }
    };

    // Attach to global window
    window.TiraAlert = TiraAlert;

    // Backward-compatibility aliases
    window.showToast = function(message, type = 'info', title = null) {
        return TiraAlert.toast({ message: message, type: type, title: title });
    };

})();
