// ==UserScript==
// @name         Jiji AI Marketplace Haggler (Universal Engine)
// @namespace    http://useazza.com/
// @version      8.6
// @description  Fully autonomous end-to-end Jiji negotiator: Focused Active-Chat Negotiator, Zero-Loop Switchboard, Gemini 3.5 Turbo Live AI, Deadlock Advisory to Telegram, Location Prioritization, Smart Nationwide Fallback, and Exact Listing URL Lock
// @author       Azza Team
// @match        https://jiji.ng/*
// @match        https://jiji.co.ke/*
// @match        http://localhost:5000/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

(function() {
    'use strict';

    const API_BASE = 'http://localhost:5000/api';
    let isAutoPilot = true;
    let isProcessing = false;
    let currentHunt = { query: 'google pixel 6 pro', max_budget: 250000 };
    const lastHandledSellerByDialog = {};
    let lastSentReply = '';
    let lastSentTimestamp = 0;
    let autoOpenDebounce = 0;
    let lastUserNavigatedTime = 0;
    let activeChatObserver = null;
    let currentRouteMode = '';
    let lastRoutedUrl = '';
    let activeInterval = null;

    // --- API HELPER ---
    function apiCall(endpoint, method = 'GET', data = null) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: method,
                url: `${API_BASE}${endpoint}`,
                headers: { 'Content-Type': 'application/json' },
                timeout: 25000,
                data: data ? JSON.stringify(data) : null,
                onload: (res) => {
                    try {
                        const parsed = JSON.parse(res.responseText);
                        if (parsed.error) {
                            logHUD(`⚠️ Backend: ${parsed.error}`);
                            setStatus('API ERROR', '#ef4444');
                        }
                        resolve(parsed);
                    } catch (e) {
                        resolve({ raw: res.responseText });
                    }
                },
                ontimeout: () => {
                    logHUD(`⚠️ Request to http://localhost:5000 timed out (25s)`);
                    setStatus('TIMEOUT', '#ef4444');
                    resolve(null);
                },
                onerror: () => {
                    logHUD(`⚠️ Cannot reach server at http://localhost:5000`);
                    setStatus('OFFLINE', '#ef4444');
                    resolve(null);
                }
            });
        });
    }

    // --- UNIVERSAL INPUT SETTER (WORKS FOR BOTH TEXTAREA & CONTENTEDITABLE DIVS) ---
    function setUniversalInputValue(element, value) {
        if (!element) return;
        element.focus();

        if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
            const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
            const prototype = Object.getPrototypeOf(element);
            const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

            if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
                prototypeValueSetter.call(element, value);
            } else if (valueSetter) {
                valueSetter.call(element, value);
            } else {
                element.value = value;
            }

            try {
                element.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }));
            } catch (e) {}
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
            element.innerHTML = '';

            let inserted = false;
            try {
                document.execCommand('selectAll', false, null);
                inserted = document.execCommand('insertText', false, value);
            } catch (e) {}

            if (!inserted || element.innerText.trim() !== value.trim()) {
                element.innerText = value;
                element.textContent = value;
            }

            element.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: value
            }));
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    // --- COMPREHENSIVE CLICK DISPATCHER (WORKS FOR VUE GESTURES, LINKS & LONG-TAP WRAPPERS) ---
    function triggerClick(el) {
        if (!el) return;
        try {
            const opts = { bubbles: true, cancelable: true, view: window, button: 0 };
            el.dispatchEvent(new PointerEvent('pointerdown', opts));
            el.dispatchEvent(new MouseEvent('mousedown', opts));
            el.dispatchEvent(new PointerEvent('pointerup', opts));
            el.dispatchEvent(new MouseEvent('mouseup', opts));
            if (typeof el.click === 'function') {
                el.click();
            }
            el.dispatchEvent(new MouseEvent('click', opts));
        } catch (e) {
            try {
                if (typeof el.click === 'function') el.click();
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, button: 0 }));
            } catch (err) {}
        }
    }

    // --- UNIVERSAL SEND TRIGGER (WORKS FOR BUTTON & SVG SEND ICON) ---
    function triggerUniversalSend(activeInput, sendTarget) {
        if (sendTarget) {
            sendTarget.removeAttribute('disabled');
            if (sendTarget.disabled !== undefined) sendTarget.disabled = false;
            triggerClick(sendTarget);

            const iconWrapper = sendTarget.closest('.b-messenger-input__icon-wrapper, [class*="icon-wrapper"]');
            if (iconWrapper && iconWrapper !== sendTarget) {
                triggerClick(iconWrapper);
            }
        }

        if (activeInput) {
            ['keydown', 'keypress', 'keyup'].forEach(evtType => {
                activeInput.dispatchEvent(new KeyboardEvent(evtType, {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true
                }));
            });
        }
    }

    // --- SAFE CURRENCY TOKEN EXTRACTOR ---
    function extractSafeCurrency(rawStr) {
        if (!rawStr) return 0;
        const match = rawStr.match(/₦?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{2,8})/);
        const digits = match ? match[1].replace(/,/g, '') : rawStr.replace(/[^0-9]/g, '');
        let price = parseInt(digits, 10) || 0;
        if (price > 50000000) {
            const str = price.toString();
            const sanitized = parseInt(str.slice(0, 6), 10);
            if (sanitized > 1000) price = sanitized;
        }
        return price;
    }

    // --- DRAGGABLE FLOATING HUD ---
    function injectHUD() {
        if (document.getElementById('azza-haggler-hud')) {
            renderDeals();
            return;
        }

        const hud = document.createElement('div');
        hud.id = 'azza-haggler-hud';
        hud.innerHTML = `
            <div id="azza-hud-header" style="font-family: monospace; font-size: 13px; font-weight: bold; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 8px; margin-bottom: 8px; cursor: grab; user-select: none;">
                <span style="color: #00b53f; display: flex; align-items: center; gap: 6px; pointer-events: none;">
                    <span style="display:inline-block; width:8px; height:8px; background:#00b53f; border-radius:50%; box-shadow: 0 0 8px #00b53f;"></span>
                    AZZA HAGGLER ⠿
                </span>
                <span id="azza-status-pill" style="font-size: 10px; background: #222; color: #888; padding: 2px 6px; border-radius: 4px; pointer-events: none;">STANDBY</span>
            </div>
            <div id="azza-hud-body" style="display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; gap: 4px;">
                    <input id="azza-hunt-query" type="text" placeholder="Item name" style="flex: 2; background: #161616; border: 1px solid #333; color: #fff; padding: 5px 8px; border-radius: 4px; font-size: 11px;">
                    <input id="azza-hunt-budget" type="number" placeholder="Budget (₦)" style="flex: 1.2; background: #161616; border: 1px solid #333; color: #fff; padding: 5px 8px; border-radius: 4px; font-size: 11px;">
                    <select id="azza-hunt-sellers" title="Number of sellers to contact in parallel" style="flex: 0.9; background: #161616; border: 1px solid #333; color: #afffd0; padding: 4px; border-radius: 4px; font-size: 11px; cursor: pointer;">
                        <option value="1">1 Seller</option>
                        <option value="2">2 Sellers</option>
                        <option value="3" selected>3 Sellers</option>
                    </select>
                </div>
                <div style="display: flex; gap: 4px; align-items: center;">
                    <button id="azza-btn-hunt" style="flex: 1.4; background: #00b53f; color: #000; border: none; font-weight: bold; padding: 6px; border-radius: 4px; cursor: pointer; font-size: 11px;">🔍 SEARCH & HAGGLE</button>
                    <button id="azza-btn-force-reply" style="flex: 1; background: #222; color: #00b53f; border: 1px solid #00b53f; font-weight: bold; padding: 6px; border-radius: 4px; cursor: pointer; font-size: 11px;" title="Force AI reply check">⚡ REPLY NOW</button>
                    <label style="font-size: 10px; color: #aaa; display: flex; align-items: center; gap: 4px; cursor: pointer;">
                        <input id="azza-toggle-auto" type="checkbox" checked> Auto
                    </label>
                </div>
                <div style="display: flex; gap: 4px; align-items: center; background: #161616; border: 1px solid #333; border-radius: 4px; padding: 3px 6px;">
                    <span style="font-size: 10px; color: #888;">📍 Base Location:</span>
                    <input id="azza-user-location" type="text" placeholder="e.g. Lagos, Ikeja" style="flex: 1; background: transparent; border: none; color: #afffd0; font-size: 10px; outline: none;">
                </div>
                <div id="azza-candidate-box" style="display: none; background: #181822; border: 1px solid #3b3b4f; border-radius: 4px; padding: 6px; font-size: 11px;">
                    <div id="azza-candidate-text" style="color: #afffd0; margin-bottom: 4px;"></div>
                    <button id="azza-candidate-act-btn" style="width: 100%; background: #00b53f; color: #000; font-weight: bold; border: none; padding: 4px; border-radius: 3px; cursor: pointer; font-size: 10px;">PROCEED TO HAGGLE</button>
                </div>
                
                <!-- DYNAMIC DEALS REVIEW CONTAINER (HUMAN APPROVAL GATE) -->
                <div id="azza-deals-container" style="display: flex; flex-direction: column; gap: 6px;"></div>

                <!-- DEADLOCK ALERT BANNER -->
                <div id="azza-deadlock-banner" style="display: none; background: #261b00; border: 1px solid #ffb703; border-radius: 4px; padding: 6px; font-size: 11px; color: #ffdd88;"></div>

                <div id="azza-live-log" style="font-size: 10px; color: #aaa; background: #0c0c0c; border: 1px solid #222; border-radius: 4px; padding: 6px; height: 75px; overflow-y: auto; margin-top: 4px; line-height: 1.4;">
                    Universal Engine v8.6 Ready. Active on Jiji.
                </div>
            </div>
            <div id="azza-deal-modal" style="display: none; margin-top: 8px; background: #052610; border: 1px solid #00b53f; border-radius: 6px; padding: 8px; text-align: center;">
                <div style="color: #00b53f; font-weight: bold; font-size: 12px; margin-bottom: 4px;">DEAL AGREED & VERIFIED! 🤝</div>
                <div id="azza-deal-desc" style="font-size: 11px; color: #ddd; margin-bottom: 6px;"></div>
                <a id="azza-pay-btn" href="#" target="_blank" style="display: block; background: #25D366; color: #000; text-decoration: none; font-weight: bold; padding: 6px; border-radius: 4px; font-size: 11px;">
                    PAY WITH AZZA (WHATSAPP)
                </a>
            </div>
        `;

        const savedPos = localStorage.getItem('azza_hud_position');
        let initialTop = window.innerHeight - 260;
        let initialLeft = window.innerWidth - 350;

        if (savedPos) {
            try {
                const pos = JSON.parse(savedPos);
                initialTop = Math.min(Math.max(10, pos.top), window.innerHeight - 150);
                initialLeft = Math.min(Math.max(10, pos.left), window.innerWidth - 340);
            } catch (e) {}
        }

        Object.assign(hud.style, {
            position: 'fixed',
            top: `${initialTop}px`,
            left: `${initialLeft}px`,
            width: '330px',
            background: '#111',
            color: '#fff',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '12px',
            zIndex: '999999',
            boxShadow: '0 8px 30px rgba(0,0,0,0.85)',
            fontSize: '12px'
        });

        document.body.appendChild(hud);

        // Drag handlers
        const header = document.getElementById('azza-hud-header');
        let isDragging = false, startX, startY, startLeft, startTop;

        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            header.style.cursor = 'grabbing';
            startX = e.clientX;
            startY = e.clientY;
            startLeft = hud.offsetLeft;
            startTop = hud.offsetTop;
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            hud.style.left = `${startLeft + (e.clientX - startX)}px`;
            hud.style.top = `${startTop + (e.clientY - startY)}px`;
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                header.style.cursor = 'grab';
                localStorage.setItem('azza_hud_position', JSON.stringify({ top: hud.offsetTop, left: hud.offsetLeft }));
            }
        });

        // Search & Haggle Button (With Multi-Seller Cohort Initialization)
        document.getElementById('azza-btn-hunt').addEventListener('click', () => {
            const query = document.getElementById('azza-hunt-query').value.trim();
            const budget = Number(document.getElementById('azza-hunt-budget').value.trim());
            const sellers = Number(document.getElementById('azza-hunt-sellers')?.value || 3);
            if (!query) return alert('Please enter an item to search.');

            const huntId = 'hunt_' + Date.now();
            sessionStorage.setItem('azza_current_hunt_id', huntId);
            sessionStorage.removeItem('azza_seller_queue');
            sessionStorage.removeItem('azza_seller_index');
            sessionStorage.removeItem('azza_proposed_deals');
            localStorage.setItem('azza_sellers_count', sellers.toString());

            currentHunt = { query, max_budget: budget || 80000, hunt_id: huntId };
            apiCall('/hunt', 'POST', currentHunt).then(() => {
                logHUD(`Searching for "${query}" (Budget: ₦${currentHunt.max_budget.toLocaleString()}, Target: ${sellers} sellers, Hunt: ${huntId})...`);
                sessionStorage.setItem('azza_active_hunt', JSON.stringify(currentHunt));
                window.location.href = `https://jiji.ng/search?query=${encodeURIComponent(query)}`;
            });
        });

        renderDeals();

        // Force Manual Reply Button
        document.getElementById('azza-btn-force-reply').addEventListener('click', () => {
            const activeChat = findActiveChat();
            if (activeChat) {
                logHUD('⚡ Checking active chat status...');
                checkActiveChatReply(true);
            } else {
                logHUD('⚡ No chat open. Opening top conversation...');
                const cards = Array.from(document.querySelectorAll(
                    'div.b-long-tap-wrapper, div.b-room-label-wrapper, a.qa-room-label-link, div.qa-room-label, div.b-room-label, a[href*="profile-messages/"]'
                ));
                if (cards.length > 0) {
                    const topCard = cards[0];
                    const link = topCard.tagName === 'A' ? topCard : (topCard.querySelector('a[href*="profile-messages/"]') || topCard.querySelector('a') || topCard);
                    const href = link?.getAttribute('href') || link?.href || '';
                    const m = href.match(/profile-messages\/(\d+)/);
                    triggerClick(topCard);
                    if (link && link !== topCard) triggerClick(link);
                    if (m) {
                        setTimeout(() => {
                            const curMatch = window.location.pathname.match(/profile-messages\/(\d+)/);
                            if (!curMatch || curMatch[1] !== m[1]) {
                                window.location.href = `https://jiji.ng/profile-messages/${m[1]}`;
                            }
                        }, 500);
                    }
                    setTimeout(() => { checkActiveChatReply(true); }, 1200);
                }
            }
        });

        document.getElementById('azza-toggle-auto').addEventListener('change', (e) => {
            isAutoPilot = e.target.checked;
            logHUD(`Auto-pilot: ${isAutoPilot ? 'ON' : 'OFF'}`);
        });

        const savedHunt = sessionStorage.getItem('azza_active_hunt');
        if (savedHunt) {
            try {
                currentHunt = JSON.parse(savedHunt);
                document.getElementById('azza-hunt-query').value = currentHunt.query || '';
                document.getElementById('azza-hunt-budget').value = currentHunt.max_budget || '';
            } catch (e) {}
        } else {
            document.getElementById('azza-hunt-query').value = currentHunt.query;
            document.getElementById('azza-hunt-budget').value = currentHunt.max_budget;
        }

        const savedSellers = localStorage.getItem('azza_sellers_count');
        if (savedSellers && document.getElementById('azza-hunt-sellers')) {
            document.getElementById('azza-hunt-sellers').value = savedSellers;
        }

        const savedLoc = localStorage.getItem('azza_user_location') || 'Lagos';
        const locInput = document.getElementById('azza-user-location');
        if (locInput) {
            locInput.value = savedLoc;
            locInput.addEventListener('change', (e) => {
                const val = e.target.value.trim() || 'Lagos';
                localStorage.setItem('azza_user_location', val);
                logHUD(`📍 Base Location set to: ${val}`);
                apiCall('/control/location', 'POST', { user_location: val });
            });
        }

        // Auto-sync with Telegram and Control Centre state
        apiCall('/control/status', 'GET').then(statusRes => {
            if (statusRes?.active_hunt?.query) {
                currentHunt = statusRes.active_hunt;
                const queryEl = document.getElementById('azza-hunt-query');
                const budgetEl = document.getElementById('azza-hunt-budget');
                if (queryEl && currentHunt.query) queryEl.value = currentHunt.query;
                if (budgetEl && currentHunt.max_budget) budgetEl.value = currentHunt.max_budget;
                if (statusRes.active_hunt.force_nationwide) {
                    sessionStorage.setItem('azza_force_nationwide', 'true');
                    apiCall('/hunt/clear-nationwide-override', 'POST', {}).catch(() => {});
                    if (window.location.pathname.includes('profile-messages') || window.location.pathname.includes('/advert/')) {
                        logHUD('🌐 Search expanded to All Nigeria! Redirecting to search catalog...');
                        setTimeout(() => {
                            window.location.href = `https://jiji.ng/search?query=${encodeURIComponent(currentHunt.query || '')}`;
                        }, 800);
                    }
                }
            }
            if (statusRes && statusRes.bot_active !== undefined) {
                isAutoPilot = statusRes.bot_active;
                const autoToggle = document.getElementById('azza-toggle-auto');
                if (autoToggle) autoToggle.checked = isAutoPilot;
            }
            if (statusRes?.user_location) {
                localStorage.setItem('azza_user_location', statusRes.user_location);
                if (locInput && locInput.value !== statusRes.user_location) {
                    locInput.value = statusRes.user_location;
                }
            }
        }).catch(() => {});
    }

    function logHUD(msg) {
        console.log('[Azza Haggler]', msg);
        const logBox = document.getElementById('azza-live-log');
        if (logBox) {
            logBox.innerHTML = `<div>&gt; ${msg}</div>` + logBox.innerHTML;
        }
    }

    function setStatus(text, color = '#888') {
        const pill = document.getElementById('azza-status-pill');
        if (pill) {
            pill.textContent = text;
            pill.style.color = color;
        }
    }

    function showAzzaDealModal(azzaQuote) {
        const modal = document.getElementById('azza-deal-modal');
        const desc = document.getElementById('azza-deal-desc');
        const payBtn = document.getElementById('azza-pay-btn');

        if (modal && desc && payBtn) {
            desc.innerHTML = `Agreed: <strong>₦${azzaQuote.amountFiat.toLocaleString()}</strong><br>Azza Crypto: <strong>$${azzaQuote.usdtAmount} USDT</strong>`;
            payBtn.href = azzaQuote.whatsappUrl;
            modal.style.display = 'block';
            setStatus('DEAL WON!', '#25D366');
        }
    }

    // ==========================================
    // HUMAN APPROVAL GATE & DEAL REVIEW CONTROLLERS
    // ==========================================
    function renderDeals() {
        const container = document.getElementById('azza-deals-container');
        if (!container) return;

        let rawDeals = sessionStorage.getItem('azza_proposed_deals');
        let deals = {};
        if (rawDeals) {
            try { deals = JSON.parse(rawDeals); } catch(e) {}
        }

        const dealList = Object.values(deals).filter(d => d && d.status !== 'REJECTED' && d.status !== 'STAND_DOWN');
        if (dealList.length === 0) {
            container.innerHTML = '';
            return;
        }

        let html = '';
        dealList.forEach((deal, idx) => {
            const isRefused = deal.status === 'BLUFF_REFUSED';
            const isApproved = deal.status === 'APPROVED';
            const isBluffing = deal.status === 'BLUFFING_LOWER';

            const isInspection = deal.payment_details?.deal_type === 'IN_PERSON_INSPECTION';
            const isWaybill = deal.payment_details?.deal_type === 'INTERSTATE_WAYBILL' || Boolean(deal.payment_details?.waybill_method);
            const typeLabel = isWaybill ? '🚚 Interstate Waybill' : (isInspection ? '🤝 In-Shop Inspection' : '🏦 Bank Transfer');
            const targetListingUrl = (deal.listing_url && deal.listing_url.includes('.html')) 
                ? deal.listing_url 
                : (deal.listing_url && deal.listing_url.startsWith('http') && !deal.listing_url.endsWith('jiji.ng') ? deal.listing_url : `https://jiji.ng/search?query=${encodeURIComponent(deal.item_title || '')}`);

            html += `
                <div class="azza-deal-card" style="background: ${isApproved ? '#052610' : '#14141c'}; border: 1px solid ${isApproved ? '#00b53f' : (isRefused ? '#ef4444' : '#3b3b55')}; border-radius: 6px; padding: 8px; font-size: 11px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="font-weight: bold; color: ${isApproved ? '#00b53f' : '#afffd0'}; font-size: 11px;">
                            ${isApproved ? '🏆 WINNER CROWNED!' : `🤝 DEAL #${idx + 1}: ${deal.seller_name || 'Seller'}`}
                        </span>
                        <span style="font-weight: bold; color: #fff; background: #222; padding: 1px 6px; border-radius: 3px; font-size: 11px;">
                            ₦${Number(deal.agreed_price || 0).toLocaleString()}
                        </span>
                    </div>
                    <div style="color: #bbb; margin-bottom: 2px; font-size: 10px;">Item: <strong>${deal.item_title}</strong></div>
                    <div style="color: #afffd0; margin-bottom: 2px; font-size: 10px;">Deal Type: <strong>${typeLabel}</strong></div>
                    <div style="color: #bbb; margin-bottom: 2px; font-size: 10px;">Details: <strong>${isWaybill ? (deal.payment_details?.waybill_method || 'Waybill') + ' | ' + (deal.payment_details?.seller_city || 'Interstate') : (deal.payment_details?.pickup_address || deal.payment_details?.pickup_location || 'Inquired')}</strong></div>
                    <div style="color: #bbb; margin-bottom: 4px; font-size: 10px;">Contact/Payment: <strong>${deal.payment_details?.phone_number || deal.payment_details?.bank || 'Verified'} ${deal.payment_details?.account_number ? `(${deal.payment_details.account_number})` : ''}</strong></div>
                    <div style="margin-bottom: 6px;">
                        <a href="${targetListingUrl}" target="_blank" style="color: #00b53f; text-decoration: underline; font-size: 10px;">🔗 Inspect Exact Listing in New Tab</a>
                    </div>
            `;

            if (isApproved) {
                html += `
                    <div style="color: #00b53f; font-weight: bold; font-size: 11px; text-align: center; margin-top: 4px;">
                        ✅ Winner locked in. Other sellers stood down.
                    </div>
                `;
            } else if (isRefused) {
                html += `
                    <div style="background: #330d0d; border: 1px solid #ef4444; color: #ffb4b4; padding: 5px; border-radius: 4px; font-size: 10px; margin-bottom: 6px; line-height: 1.3;">
                        ⚠️ Seller refused lower offer. They insist on <strong>₦${Number(deal.agreed_price).toLocaleString()}</strong>.<br>
                        Should we accept & pay, or leave this seller?
                    </div>
                    <div style="display: flex; gap: 4px;">
                        <button class="azza-btn-accept-refused" data-id="${deal.dialog_id}" data-price="${deal.agreed_price}" style="flex: 1.2; background: #00b53f; color: #000; font-weight: bold; border: none; padding: 6px 4px; border-radius: 4px; cursor: pointer; font-size: 10px;">✅ PAY ₦${Number(deal.agreed_price).toLocaleString()}</button>
                        <button class="azza-btn-leave-refused" data-id="${deal.dialog_id}" style="flex: 0.8; background: #222; color: #ff6b6b; border: 1px solid #ef4444; font-weight: bold; padding: 6px 4px; border-radius: 4px; cursor: pointer; font-size: 10px;">❌ LEAVE & DROP</button>
                    </div>
                `;
            } else if (isBluffing) {
                html += `
                    <div style="background: #2b2205; border: 1px solid #ffb703; color: #ffdd88; padding: 4px; border-radius: 4px; font-size: 10px; margin-bottom: 4px; text-align: center;">
                        ⚡ Bluffed with ₦${Number(deal.bluff_price || deal.agreed_price).toLocaleString()}. Awaiting seller response...
                    </div>
                    <button class="azza-btn-reject-deal" data-id="${deal.dialog_id}" style="width: 100%; background: #222; color: #ff6b6b; border: 1px solid #555; padding: 4px; border-radius: 3px; cursor: pointer; font-size: 10px;">❌ PASS & DROP SELLER</button>
                `;
            } else {
                html += `
                    <div style="display: flex; gap: 4px;">
                        <button class="azza-btn-approve-deal" data-id="${deal.dialog_id}" style="flex: 1.2; background: #00b53f; color: #000; font-weight: bold; border: none; padding: 6px 4px; border-radius: 3px; cursor: pointer; font-size: 10px;">✅ APPROVE & PAY</button>
                        <button class="azza-btn-bluff-deal" data-id="${deal.dialog_id}" data-price="${deal.agreed_price}" style="flex: 1.1; background: #222; color: #ffb703; border: 1px solid #ffb703; font-weight: bold; padding: 6px 4px; border-radius: 3px; cursor: pointer; font-size: 10px;">⚡ PUSH LOWER</button>
                        <button class="azza-btn-reject-deal" data-id="${deal.dialog_id}" style="flex: 0.7; background: #222; color: #ff6b6b; border: 1px solid #555; padding: 6px 4px; border-radius: 3px; cursor: pointer; font-size: 10px;">❌ PASS</button>
                    </div>
                `;
            }

            html += `</div>`;
        });

        container.innerHTML = html;
        bindDealCardButtons();
    }

    function bindDealCardButtons() {
        const huntId = sessionStorage.getItem('azza_current_hunt_id') || '';

        // Approve Deal
        document.querySelectorAll('.azza-btn-approve-deal, .azza-btn-accept-refused').forEach(btn => {
            btn.onclick = async () => {
                const dialogId = btn.getAttribute('data-id');
                btn.disabled = true;
                btn.innerText = 'APPROVING...';
                logHUD(`Approving deal with seller (${dialogId})...`);

                const res = await apiCall('/deal/approve', 'POST', { hunt_id: huntId, dialog_id: dialogId });
                if (res?.success) {
                    logHUD(`🏆 Deal APPROVED! Winner Crowned. Other sellers stood down.`);
                    setStatus('DEAL WON!', '#25D366');

                    let rawDeals = sessionStorage.getItem('azza_proposed_deals');
                    let deals = rawDeals ? JSON.parse(rawDeals) : {};
                    if (deals[dialogId]) {
                        deals[dialogId].status = 'APPROVED';
                    }
                    sessionStorage.setItem('azza_deal_won_' + dialogId, 'true');
                    Object.keys(deals).forEach(id => {
                        if (id !== dialogId) {
                            deals[id].status = 'STAND_DOWN';
                            sessionStorage.setItem('azza_stood_down_' + id, 'true');
                        }
                    });
                    sessionStorage.setItem('azza_proposed_deals', JSON.stringify(deals));
                    renderDeals();

                    if (res.azza) {
                        showAzzaDealModal(res.azza);
                        window.open(res.azza.whatsappUrl, '_blank');
                    }
                }
            };
        });

        // Bluff Lower
        document.querySelectorAll('.azza-btn-bluff-deal').forEach(btn => {
            btn.onclick = async () => {
                const dialogId = btn.getAttribute('data-id');
                const currentPrice = Number(btn.getAttribute('data-price')) || 50000;
                const suggestedBluff = Math.round((currentPrice * 0.9) / 1000) * 1000;

                const inputVal = prompt(`Enter lower cash bluff amount in ₦ (Default: ₦${suggestedBluff.toLocaleString()}):`, suggestedBluff);
                if (!inputVal) return;
                const bluffPrice = Number(inputVal.replace(/[^0-9]/g, '')) || suggestedBluff;

                btn.disabled = true;
                btn.innerText = 'BLUFFING...';
                logHUD(`Sending lower bluff ₦${bluffPrice.toLocaleString()} to seller...`);

                const res = await apiCall('/deal/bluff-lower', 'POST', { hunt_id: huntId, dialog_id: dialogId, bluff_price: bluffPrice });
                if (res?.success) {
                    logHUD(`⚡ Lower bluff sent!`);
                    let rawDeals = sessionStorage.getItem('azza_proposed_deals');
                    let deals = rawDeals ? JSON.parse(rawDeals) : {};
                    if (deals[dialogId]) {
                        deals[dialogId].status = 'BLUFFING_LOWER';
                        deals[dialogId].bluff_price = bluffPrice;
                    }
                    sessionStorage.setItem('azza_proposed_deals', JSON.stringify(deals));
                    renderDeals();

                    const chat = findActiveChat();
                    if (chat && res.reply_text) {
                        setUniversalInputValue(chat.input, res.reply_text);
                        setTimeout(() => { triggerUniversalSend(chat.input, chat.sendTarget); }, 600);
                    }
                }
            };
        });

        // Pass / Reject Deal
        document.querySelectorAll('.azza-btn-reject-deal, .azza-btn-leave-refused').forEach(btn => {
            btn.onclick = async () => {
                const dialogId = btn.getAttribute('data-id');
                if (!confirm('Are you sure you want to drop this seller? The bot will continue negotiating with other sellers.')) return;

                btn.disabled = true;
                btn.innerText = 'PASSING...';
                logHUD(`Dropping seller (${dialogId})...`);

                const res = await apiCall('/deal/reject', 'POST', { hunt_id: huntId, dialog_id: dialogId, send_exit: true });
                if (res?.success) {
                    sessionStorage.setItem('azza_stood_down_' + dialogId, 'true');
                    sessionStorage.setItem('azza_rejected_' + dialogId, 'true');
                    logHUD(`❌ Dropped seller (${dialogId}). Continuing with remaining sellers.`);
                    setStatus('SELLER DROPPED', '#888');

                    let rawDeals = sessionStorage.getItem('azza_proposed_deals');
                    let deals = rawDeals ? JSON.parse(rawDeals) : {};
                    delete deals[dialogId];
                    sessionStorage.setItem('azza_proposed_deals', JSON.stringify(deals));
                    renderDeals();

                    const chat = findActiveChat();
                    if (chat && res.reply_text) {
                        setUniversalInputValue(chat.input, res.reply_text);
                        setTimeout(() => { triggerUniversalSend(chat.input, chat.sendTarget); }, 600);
                    }
                }
            };
        });
    }

    function showDeadlockBanner(lowestOffered = 0, isLocal = false, localCity = '') {
        const banner = document.getElementById('azza-deadlock-banner');
        if (!banner) return;
        const lowestText = lowestOffered > 0 ? ` | Lowest Found: ₦${lowestOffered.toLocaleString()}` : '';
        const titleText = isLocal ? `📍 No sellers in ${localCity || 'your area'} within budget!` : `⚠️ Budget too low for genuine items across Nigeria!`;

        banner.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px;">${titleText}</div>
            <div style="font-size: 10px; margin-bottom: 6px;">Budget: ₦${(currentHunt.max_budget || 0).toLocaleString()}${lowestText}</div>
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                <button id="azza-btn-bump-budget" style="flex: 1; background: #ffb703; color: #000; font-weight: bold; border: none; padding: 5px; border-radius: 3px; cursor: pointer; font-size: 10px;">📈 BUMP BUDGET</button>
                ${isLocal ? `<button id="azza-btn-search-all-ng" style="flex: 1.2; background: #00b53f; color: #000; font-weight: bold; border: none; padding: 5px; border-radius: 3px; cursor: pointer; font-size: 10px;">🌐 SEARCH ALL NIGERIA</button>` : ''}
                <button id="azza-btn-scan-more" style="flex: 0.8; background: #222; color: #afffd0; border: 1px solid #afffd0; padding: 5px; border-radius: 3px; cursor: pointer; font-size: 10px;">🔄 SCAN MORE</button>
            </div>
        `;
        banner.style.display = 'block';

        const bumpBtn = document.getElementById('azza-btn-bump-budget');
        if (bumpBtn) {
            bumpBtn.onclick = () => {
                const defaultBump = lowestOffered > 0 ? lowestOffered : Math.round((currentHunt.max_budget || 50000) * 1.15);
                const newBudget = prompt('Enter new budget in ₦:', defaultBump);
                if (newBudget) {
                    currentHunt.max_budget = Number(newBudget);
                    const bInput = document.getElementById('azza-hunt-budget');
                    if (bInput) bInput.value = currentHunt.max_budget;
                    banner.style.display = 'none';
                    logHUD(`Budget bumped to ₦${currentHunt.max_budget.toLocaleString()}. Re-scanning catalog...`);
                    handleSearchPage();
                }
            };
        }

        const ngBtn = document.getElementById('azza-btn-search-all-ng');
        if (ngBtn) {
            ngBtn.onclick = () => {
                banner.style.display = 'none';
                sessionStorage.setItem('azza_force_nationwide', 'true');
                logHUD(`🌐 Expanding search to All Nigeria...`);
                handleSearchPage();
            };
        }

        const scanBtn = document.getElementById('azza-btn-scan-more');
        if (scanBtn) {
            scanBtn.onclick = () => {
                banner.style.display = 'none';
                logHUD(`Scanning catalog for more sellers...`);
                window.location.href = `https://jiji.ng/search?query=${encodeURIComponent(currentHunt.query)}`;
            };
        }
    }

    // ==========================================
    // SEARCH PROOFING & MULTI-CATEGORY ENGINE
    // ==========================================
    const GENERAL_ACCESSORY_STOPWORDS = [
        'screen', 'oled', 'amoled', 'lcd', 'display', 'touchscreen', 'digitizer', 'glass only',
        'motherboard', 'mainboard', 'logic board', 'board only',
        'charging port', 'charging flex', 'flex cable', 'camera lens',
        'housing', 'chassis', 'replacement part', 'spare part',
        'charger', 'adapter', 'power cable', 'power cord',
        'screen guard', 'tempered glass',
        'pouch', 'cover', 'back cover', 'bumper', 'sleeve',
        'carton only', 'box only', 'empty box', 'pack only',
        'repair', 'fixing', 'screen replacement'
    ];

    function extractNormalizedTokens(str) {
        if (!str) return [];
        let s = str.toLowerCase();
        s = s.replace(/([0-9]+)([a-z]+)/gi, '$1 $2');
        s = s.replace(/([a-z]+)([0-9]+)/gi, '$1 $2');
        s = s.replace(/\b([a-z]+)(promax|ultra|plus|lite|mini)\b/gi, '$1 $2');
        s = s.replace(/\b(pro)(max)\b/gi, '$1 $2');
        s = s.replace(/[^a-z0-9]/gi, ' ');
        const noise = new Set(['for', 'with', 'the', 'and', 'in', 'at', 'by', 'of', 'a', 'an']);
        return s.split(/\s+/).filter(w => w.length > 0 && !noise.has(w));
    }

    function matchesNormalizedKeywords(title, query) {
        if (!query) return true;
        const queryTokens = extractNormalizedTokens(query);
        if (queryTokens.length === 0) return true;

        const titleTokens = new Set(extractNormalizedTokens(title));
        let matched = 0;
        for (const qt of queryTokens) {
            if (titleTokens.has(qt)) {
                matched++;
            }
        }
        return queryTokens.length <= 2 ? (matched >= 1) : ((matched / queryTokens.length) >= 0.5);
    }

    function isAccessoryOrPart(title, query) {
        const lowerTitle = (title || '').toLowerCase();
        const lowerQuery = (query || '').toLowerCase();

        for (const stopword of GENERAL_ACCESSORY_STOPWORDS) {
            if (!lowerQuery.includes(stopword)) {
                const regex = new RegExp(`(^|[^a-z0-9])${stopword}([^a-z0-9]|$)`, 'i');
                if (regex.test(lowerTitle)) {
                    return stopword;
                }
            }
        }
        return false;
    }

    // Helper: Intelligent Nigerian City/State location matcher
    function isLocationMatch(userLoc, regionText, href) {
        if (!userLoc) return false;
        const cleanUser = userLoc.toLowerCase().trim();
        if (!cleanUser || cleanUser === 'nigeria' || cleanUser === 'all nigeria') return false;

        const userTokens = cleanUser.split(/[\s,/-]+/).filter(t => t.length > 2);
        const regLower = (regionText || '').toLowerCase();
        const hrefLower = (href || '').toLowerCase();

        const aliases = {
            'abuja': ['fct', 'abuja', 'garki', 'wuse', 'maitama', 'kubwa', 'jabi', 'utako', 'asokoro', 'apo', 'gwarinpa'],
            'fct': ['fct', 'abuja'],
            'port harcourt': ['rivers', 'port harcourt', 'ph', 'rumuokoro', 'trans amadi'],
            'rivers': ['rivers', 'port harcourt', 'ph'],
            'ibadan': ['oyo', 'ibadan', 'bodija', 'dugbe', 'iwo'],
            'oyo': ['oyo', 'ibadan'],
            'lagos': ['lagos', 'ikeja', 'lekki', 'surulere', 'yaba', 'vi', 'victoria island', 'ikoyi', 'festac', 'mushin', 'ojuelegba', 'maryland', 'alaba', 'ojota', 'agege', 'oshodi'],
            'enugu': ['enugu', 'nsukka', 'otigba'],
            'delta': ['delta', 'asaba', 'warri', 'ughelli'],
            'ogun': ['ogun', 'abeokuta', 'sagamu', 'ijebu'],
            'anambra': ['anambra', 'onitsha', 'awka', 'nnewi'],
            'edo': ['edo', 'benin', 'ring road'],
            'kano': ['kano', 'fagge', 'nasarawa']
        };

        if (regLower && regLower.includes(cleanUser)) return true;
        if (hrefLower && hrefLower.includes(cleanUser.replace(/\s+/g, '-'))) return true;

        for (const token of userTokens) {
            if (regLower.includes(token)) return true;
            if (hrefLower.includes('/' + token)) return true;

            if (aliases[token]) {
                for (const alias of aliases[token]) {
                    if (regLower.includes(alias) || hrefLower.includes('/' + alias)) return true;
                }
            }
        }

        return false;
    }

    // ==========================================
    // FLOW 1: SEARCH & CATALOG SCANNER
    // ==========================================
    function handleSearchPage() {
        logHUD('Scanning catalog with Search-Proofing active...');
        setStatus('SCANNING', '#FFB703');

        // Sync query from search URL if available
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const searchParam = urlParams.get('query');
            if (searchParam) {
                const decoded = decodeURIComponent(searchParam).replace(/\+/g, ' ').trim();
                if (decoded && (!currentHunt.query || currentHunt.query !== decoded)) {
                    currentHunt.query = decoded;
                    const qInput = document.getElementById('azza-hunt-query');
                    if (qInput && !qInput.value) qInput.value = decoded;
                }
            }
        } catch(e) {}

        let attempts = 0;
        if (activeInterval) clearInterval(activeInterval);

        activeInterval = setInterval(() => {
            attempts++;
            const cards = document.querySelectorAll(
                'a.qa-advert-list-item, .b-list-advert-base, div.qa-advert-list-item, div.js-advert-list-item, div.b-advert-card-wrapper, div[class*="advert-item"], div[class*="advert-card"]'
            );
            
            if (cards.length > 0) {
                clearInterval(activeInterval);
                processSearchResults(cards);
            } else if (attempts > 25) {
                clearInterval(activeInterval);
                logHUD('No listing cards found on this page.');
                setStatus('NO ITEMS FOUND', '#ef4444');
            }
        }, 600);
    }

    function processSearchResults(cards) {
        const budget = currentHunt.max_budget || 80000;
        const userLocation = localStorage.getItem('azza_user_location') || 'Lagos';
        const isForceNationwide = sessionStorage.getItem('azza_force_nationwide') === 'true';
        if (isForceNationwide) {
            sessionStorage.removeItem('azza_force_nationwide');
            logHUD(`🌐 Nationwide override active: Searching All Nigeria...`);
        }

        logHUD(`Found ${cards.length} items. Filtering with universal sanity checks (Location: ${userLocation})...`);
        setStatus('FILTERING', '#00b53f');

        let candidates = [];
        let lowestPriceFound = Infinity;
        let lowestLocalPrice = Infinity;

        cards.forEach((card) => {
            const priceEl = card.querySelector('.qa-advert-price, [qa-advert-price], [class*="price"]');
            const titleEl = card.querySelector('.qa-advert-title, [qa-advert-title], [class*="title"], h3, h2');
            const linkEl = card.tagName === 'A' ? card : (card.querySelector('a[href*="/"]') || card.closest('a'));
            const href = linkEl ? linkEl.getAttribute('href') : null;

            // Extract location/region of this listing card
            const regionEl = card.querySelector('.b-list-advert__region__text, .b-list-advert__region, [class*="region__text"], [class*="region"]');
            const region = (regionEl ? (regionEl.innerText || regionEl.textContent || '') : '').trim();

            if (priceEl && href) {
                const price = extractSafeCurrency(priceEl.textContent);
                const title = titleEl ? titleEl.textContent.trim() : 'Item';

                if (price > 0) {
                    // 1. Anti-Accessory / Screen Stopword Filter
                    const partMatched = isAccessoryOrPart(title, currentHunt.query);
                    if (partMatched) return;

                    // 2. Normalized Keyword Matcher (e.g. "pixel 6pro" vs "pixel 6 pro")
                    if (!matchesNormalizedKeywords(title, currentHunt.query)) return;

                    // Check if seller is in user's location
                    const isLocal = !isForceNationwide && isLocationMatch(userLocation, region, href);

                    // Track genuine item lowest price
                    if (price < lowestPriceFound) lowestPriceFound = price;
                    if (isLocal && price < lowestLocalPrice) lowestLocalPrice = price;

                    // 3. Universal Adaptive Price Floor (35% sanity floor across all budgets)
                    const minPercentFloor = Math.round(budget * 0.35);
                    const absoluteFloor = budget >= 5000 ? 1500 : (budget >= 1000 ? 300 : 50);
                    const priceFloor = Math.max(minPercentFloor, absoluteFloor);

                    if (price < priceFloor) return;

                    // 4. Budget ceiling (up to 1.35x budget for candidate pool)
                    const maxAllowed = Math.max(budget * 1.35, budget + 5000);
                    if (price <= maxAllowed) {
                        candidates.push({ card, title, price, href, region, isLocal, diff: Math.abs(price - budget) });
                    }
                }
            }
        });

        // Graceful fallback for test listings or custom titles
        if (candidates.length === 0) {
            cards.forEach((card) => {
                const priceEl = card.querySelector('.qa-advert-price, [qa-advert-price], [class*="price"]');
                const titleEl = card.querySelector('.qa-advert-title, [qa-advert-title], [class*="title"], h3, h2');
                const linkEl = card.tagName === 'A' ? card : (card.querySelector('a[href*="/"]') || card.closest('a'));
                const href = linkEl ? linkEl.getAttribute('href') : null;
                const regionEl = card.querySelector('.b-list-advert__region__text, .b-list-advert__region, [class*="region__text"], [class*="region"]');
                const region = (regionEl ? (regionEl.innerText || regionEl.textContent || '') : '').trim();

                if (priceEl && href) {
                    const price = extractSafeCurrency(priceEl.textContent);
                    const title = titleEl ? titleEl.textContent.trim() : 'Item';
                    const isLocal = !isForceNationwide && isLocationMatch(userLocation, region, href);
                    if (price > 0 && price <= (budget * 1.5)) {
                        candidates.push({ card, title, price, href, region, isLocal, diff: Math.abs(price - budget) });
                        if (price < lowestPriceFound) lowestPriceFound = price;
                        if (isLocal && price < lowestLocalPrice) lowestLocalPrice = price;
                    }
                }
            });
        }

        // Deduplicate candidates by clean URL
        const uniqueCandidates = [];
        const seenUrls = new Set();
        for (const c of candidates) {
            const cleanUrl = c.href.startsWith('http') ? c.href : `https://jiji.ng${c.href.startsWith('/') ? '' : '/'}${c.href}`;
            const urlKey = cleanUrl.split('?')[0];
            if (!seenUrls.has(urlKey)) {
                seenUrls.add(urlKey);
                uniqueCandidates.push({
                    title: c.title,
                    price: c.price,
                    url: cleanUrl,
                    region: c.region,
                    isLocal: c.isLocal
                });
            }
        }

        const maxSellers = parseInt(localStorage.getItem('azza_sellers_count') || '3', 10);

        // Separate local vs nationwide candidate pools
        const localCandidates = uniqueCandidates.filter(c => c.isLocal);
        const localWithinBudget = localCandidates.filter(c => c.price <= budget);
        const nationwideWithinBudget = uniqueCandidates.filter(c => c.price <= budget);

        // Check if genuine local sellers exist for a baseline / budget increase (e.g. up to 1.35x budget)
        const hasLocalBumpSellers = lowestLocalPrice !== Infinity && lowestLocalPrice > budget && lowestLocalPrice <= Math.max(budget * 1.35, budget + 50000);

        let topCandidates = [];

        if (!isForceNationwide && userLocation && userLocation.toLowerCase() !== 'all nigeria' && userLocation.toLowerCase() !== 'nigeria') {
            // Priority 1: Check your location first
            if (localWithinBudget.length >= maxSellers) {
                // We have >= 3 local sellers within budget!
                localWithinBudget.sort((a, b) => a.price - b.price);
                topCandidates = localWithinBudget.slice(0, maxSellers);
                logHUD(`🎯 Local Priority: Found ${topCandidates.length} seller(s) in ${userLocation} within budget! (Best: ₦${topCandidates[0].price.toLocaleString()})`);
            } else if (localWithinBudget.length > 0) {
                // Found 1 or 2 local sellers within budget -> Take local first, then fill remaining spots from nationwide!
                localWithinBudget.sort((a, b) => a.price - b.price);
                nationwideWithinBudget.sort((a, b) => a.price - b.price);
                const localUrls = new Set(localWithinBudget.map(l => l.url));
                const remainingNationwide = nationwideWithinBudget.filter(n => !localUrls.has(n.url));
                const needed = maxSellers - localWithinBudget.length;
                topCandidates = [...localWithinBudget, ...remainingNationwide.slice(0, needed)];
                logHUD(`🎯 Local Priority: Queued ${localWithinBudget.length} local seller(s) in ${userLocation} + ${topCandidates.length - localWithinBudget.length} nationwide seller(s) to reach ${maxSellers} sellers.`);
            } else if (hasLocalBumpSellers) {
                // 0 local sellers within budget, BUT local has genuine sellers for a baseline/budget increase!
                // Trigger local baseline increase alert so user can bump budget to buy locally
                const displayLocalLowest = `₦${lowestLocalPrice.toLocaleString()}`;
                logHUD(`⚠️ No genuine items found within budget in ${userLocation}. Lowest in ${userLocation}: ${displayLocalLowest}.`);
                setStatus('LOCAL BUDGET TOO LOW', '#ef4444');
                showDeadlockBanner(lowestLocalPrice, true, userLocation);

                const alertKey = `azza_alerted_local_low_${currentHunt.hunt_id || currentHunt.query || 'active'}_${lowestLocalPrice}`;
                if (!sessionStorage.getItem(alertKey)) {
                    sessionStorage.setItem(alertKey, 'true');
                    apiCall('/hunt/budget-too-low', 'POST', {
                        hunt_id: currentHunt.hunt_id,
                        query: currentHunt.query,
                        budget: budget,
                        lowest_price: lowestLocalPrice,
                        location: userLocation,
                        is_local: true
                    });
                    logHUD(`📢 Sent local budget bump alert to Telegram! Lowest in ${userLocation}: ${displayLocalLowest}`);
                }
                return;
            } else {
                // Can't find up to 3 people within budget in location AND doesn't see sellers for a baseline increase in location!
                // "it then searches the whole nigeria like usual"
                logHUD(`🌐 No sellers in ${userLocation} within budget or baseline bump. Searching the whole Nigeria like usual...`);
                nationwideWithinBudget.sort((a, b) => a.price - b.price);
                if (nationwideWithinBudget.length > 0) {
                    topCandidates = nationwideWithinBudget.slice(0, maxSellers);
                    logHUD(`🌐 Nationwide Hunt: Found ${topCandidates.length} seller(s) across Nigeria within budget! (Best: ₦${topCandidates[0].price.toLocaleString()})`);
                }
            }
        } else {
            // Already in nationwide search mode
            nationwideWithinBudget.sort((a, b) => a.price - b.price);
            if (nationwideWithinBudget.length > 0) {
                topCandidates = nationwideWithinBudget.slice(0, maxSellers);
            }
        }

        // If even nationwide has 0 sellers within budget
        if (topCandidates.length === 0) {
            const hasLowest = lowestPriceFound !== Infinity && lowestPriceFound > 0;
            const displayLowest = hasLowest ? `₦${lowestPriceFound.toLocaleString()}` : 'N/A';
            logHUD(`⚠️ No genuine items found within budget across Nigeria. Lowest price: ${displayLowest}.`);
            setStatus('BUDGET TOO LOW', '#ef4444');
            showDeadlockBanner(hasLowest ? lowestPriceFound : Math.round(budget * 1.2), false, 'Nigeria');

            if (hasLowest && lowestPriceFound > budget) {
                const alertKey = `azza_alerted_low_${currentHunt.hunt_id || currentHunt.query || 'active'}_${lowestPriceFound}`;
                if (!sessionStorage.getItem(alertKey)) {
                    sessionStorage.setItem(alertKey, 'true');
                    apiCall('/hunt/budget-too-low', 'POST', {
                        hunt_id: currentHunt.hunt_id,
                        query: currentHunt.query,
                        budget: budget,
                        lowest_price: lowestPriceFound,
                        location: 'Nigeria',
                        is_local: false
                    });
                    logHUD(`📢 Sent nationwide budget bump alert to Telegram! Lowest genuine item: ${displayLowest}`);
                }
            }
            return;
        }

        setStatus(`FOUND ${topCandidates.length} SELLERS`, '#00b53f');

        // Store candidate queue in sessionStorage for parallel outreach
        sessionStorage.setItem('azza_seller_queue', JSON.stringify(topCandidates));
        sessionStorage.setItem('azza_seller_index', '0');
        sessionStorage.setItem('azza_target_listing', JSON.stringify({
            title: topCandidates[0].title,
            asking_price: topCandidates[0].price,
            url: topCandidates[0].url
        }));

        const box = document.getElementById('azza-candidate-box');
        const text = document.getElementById('azza-candidate-text');
        const actBtn = document.getElementById('azza-candidate-act-btn');

        if (box && text && actBtn) {
            const firstLoc = topCandidates[0].region ? ` (${topCandidates[0].region})` : '';
            text.innerHTML = `<strong>${topCandidates.length} Sellers Queued</strong><br>1st: ${topCandidates[0].title.slice(0, 20)}... (₦${topCandidates[0].price.toLocaleString()}${firstLoc})`;
            box.style.display = 'block';

            actBtn.onclick = () => {
                logHUD(`Navigating to seller 1 of ${topCandidates.length}...`);
                window.location.href = topCandidates[0].url;
            };

            if (isAutoPilot) {
                logHUD(`Auto-Pilot: Opening seller 1 of ${topCandidates.length} in 1.5s...`);
                setTimeout(() => { actBtn.click(); }, 1500);
            }
        }
    }

    // ==========================================
    // FLOW 2: LISTING PAGE OUTREACH (STRICT "START CHAT" TRIGGER)
    // ==========================================
    function findListingChatButton() {
        // Priority 1: Exact span/element with .qa-start-chat or [qa-start-chat]
        const qaBtn = document.querySelector('.qa-start-chat, [qa-start-chat]');
        if (qaBtn) return qaBtn;

        // Priority 2: Direct wrapper for start chat icon
        const iconBtn = document.querySelector('.b-start-chat-icon, .b-start-chat');
        if (iconBtn) {
            const inner = iconBtn.querySelector('.qa-start-chat, span, button') || iconBtn;
            return inner;
        }

        // Priority 3: Search clickable elements by exact text "Start chat"
        // (STRICTLY ignores "Make an offer", "Show contact", "Request call back")
        const candidates = document.querySelectorAll(
            '.b-advert-contact-buttons span, .b-advert-contact-buttons button, .b-button, button, span, a'
        );
        for (const el of candidates) {
            if (el.closest('#azza-haggler-hud')) continue;
            const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
            if (
                (txt.includes('start chat') || txt === 'chat' || txt.includes('chat with seller') || txt.includes('write to seller')) &&
                !txt.includes('offer') && !txt.includes('contact') && !txt.includes('call')
            ) {
                return el;
            }
        }

        return null;
    }

    function findListingChatInput() {
        const inputs = document.querySelectorAll(
            'textarea.qa-quick-chat-text-area, [qa-quick-chat-text-area], .b-quick-chat__textarea, .b-start-chat__form textarea, textarea.fw-textarea, textarea.qa-chat-input, textarea[placeholder*="message" i], textarea:not(#azza-haggler-hud textarea), div.b-messenger-input[contenteditable="true"]'
        );
        for (const inp of inputs) {
            if (inp.closest('#azza-haggler-hud')) continue;
            const rect = inp.getBoundingClientRect();
            if (rect.width > 30 && rect.height > 15) {
                return inp;
            }
        }
        return null;
    }

    function handleListingPage() {
        const rawQueue = sessionStorage.getItem('azza_seller_queue');
        const rawIndex = sessionStorage.getItem('azza_seller_index');
        let progressPrefix = '';
        if (rawQueue) {
            try {
                const q = JSON.parse(rawQueue);
                const idx = parseInt(rawIndex || '0', 10);
                progressPrefix = `[Seller ${idx + 1}/${q.length}] `;
            } catch(e) {}
        }

        logHUD(`${progressPrefix}On listing page. Locating "Start chat" button...`);
        setStatus(progressPrefix ? `OUTREACH ${progressPrefix.trim()}` : 'ANALYZING ITEM', '#FFB703');

        let attempts = 0;
        if (activeInterval) clearInterval(activeInterval);

        activeInterval = setInterval(() => {
            attempts++;

            const activeInput = findListingChatInput();
            const chatBtn = findListingChatButton();

            if (activeInput || chatBtn) {
                clearInterval(activeInterval);
                setupOutreachOnListing(chatBtn, activeInput);
            } else if (attempts > 20) {
                clearInterval(activeInterval);
                logHUD('Could not find "Start chat" button on this page.');
                setStatus('NO CHAT FOUND', '#ef4444');
                if (sessionStorage.getItem('azza_seller_queue')) {
                    logHUD('⚠️ Moving to next seller in queue in 2s...');
                    setTimeout(handlePostPitchTransition, 2000);
                }
            }
        }, 400);
    }

    async function setupOutreachOnListing(chatBtn, alreadyOpenInput = null) {
        const priceEl = document.querySelector('.qa-advert-price-view-value, .qa-advert-price, [itemprop="price"], .b-alt-advert-price, .b-advert-card__head-price');
        let askingPrice = 0;

        if (priceEl) {
            askingPrice = extractSafeCurrency(priceEl.textContent);
        }

        if (!askingPrice) {
            const titleMatch = document.title.match(/Price:\s*₦\s*([\d,]+)/i);
            if (titleMatch) {
                askingPrice = extractSafeCurrency(titleMatch[1]);
            }
        }

        const titleEl = document.querySelector('.qa-advert-title, h1');
        const title = titleEl ? titleEl.textContent.trim() : document.title.split('-')[0].trim();
        const sellerName = document.querySelector('.b-seller-block__name, .b-seller-advert-info__name, .qa-seller-title, .b-seller-block__title, [class*="seller-title"]')?.textContent?.trim() || 'Seller';

        logHUD(`Listing: "${title.slice(0, 22)}..." Price: ₦${askingPrice.toLocaleString()}`);

        if (window.location.href.includes('.html') || window.location.href.includes('/advert/')) {
            localStorage.setItem('azza_last_listing_url', window.location.href);
            if (sellerName) localStorage.setItem('azza_listing_seller_' + sellerName.toLowerCase().trim(), window.location.href);
            if (title) localStorage.setItem('azza_listing_item_' + title.toLowerCase().trim(), window.location.href);
        }

        async function triggerPitch() {
            logHUD('Formulating AI opening pitch...');
            setStatus('GENERATING PITCH', '#FFB703');

            // Calibrate budget if user directly navigated to an item where asking price exceeds current budget
            let effectiveBudget = currentHunt.max_budget || 80000;
            if (askingPrice >= 10000 && effectiveBudget < askingPrice * 0.4) {
                effectiveBudget = Math.round(askingPrice * 0.9);
                currentHunt.max_budget = effectiveBudget;
                const bInput = document.getElementById('azza-hunt-budget');
                if (bInput) bInput.value = effectiveBudget;
                logHUD(`Calibrated budget to ₦${effectiveBudget.toLocaleString()} based on listing price.`);
            }

            const currentHuntId = sessionStorage.getItem('azza_current_hunt_id') || ('hunt_' + Date.now());
            const dialogId = 'listing_' + Math.random().toString(36).substring(7);
            const res = await apiCall('/opener', 'POST', {
                dialog_id: dialogId,
                hunt_id: currentHuntId,
                seller_name: sellerName,
                item_title: title,
                asking_price: askingPrice,
                budget: effectiveBudget,
                listing_url: window.location.href,
                user_location: localStorage.getItem('azza_user_location') || 'Lagos'
            });

            const openerMsg = res?.opener || res?.pitch?.reply_text || res?.reply_text;
            if (!openerMsg) {
                logHUD('⚠️ Failed to generate opening pitch.');
                if (sessionStorage.getItem('azza_seller_queue')) {
                    logHUD('⚠️ Moving to next seller in queue in 2s...');
                    setTimeout(handlePostPitchTransition, 2000);
                }
                return;
            }

            logHUD(`AI Opener: "${openerMsg.slice(0, 35)}..."`);

            // Case A: Small text box is ALREADY visible right now on screen
            if (alreadyOpenInput || findListingChatInput()) {
                waitForListingTextareaAndSend(openerMsg);
                return;
            }

            // Case B: Click the "Start chat" button to reveal the small text box on screen
            if (chatBtn) {
                logHUD('Clicking "Start chat" button on listing...');
                triggerClick(chatBtn);

                // Wait for the small text box to open right on this screen
                waitForListingTextareaAndSend(openerMsg);
            }
        }

        if (isAutoPilot) {
            logHUD('Auto-Pilot: Opening chat in 1.5s...');
            setTimeout(triggerPitch, 1500);
        }
    }

    // --- ACCURATE LISTING SUBMIT BUTTON LOCATOR ---
    function findListingSubmitButton(input) {
        if (!input) return null;

        // 1. Locate the container holding this textarea (drawer / quick-chat box)
        const container = input.closest('form, div[class*="input"], div[class*="chat"], div[class*="drawer"], div[class*="footer"]')
            || input.parentElement?.parentElement?.parentElement 
            || document.body;

        // A. Priority 1: Exact QA class inside container
        let btn = container.querySelector('button.qa-send-message-submit-button, [qa-send-message-submit-button], .qa-send-message-submit-button');
        if (btn && !btn.closest('#azza-haggler-hud')) return btn;

        // B. Priority 2: Orange bloated-warning button inside container (Jiji's exact submit button style)
        btn = container.querySelector('button.fw-button--type-bloated-warning, button[class*="bloated-warning"]');
        if (btn && !btn.closest('#azza-haggler-hud')) return btn;

        // C. Priority 3: Button by text inside container ("Start chat" or "Send")
        const containerBtns = container.querySelectorAll('button, [role="button"], span.b-button');
        for (const b of containerBtns) {
            if (b.closest('#azza-haggler-hud')) continue;
            if (b.classList.contains('qa-start-chat')) continue; // Skip initial opener button
            const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
            if (txt === 'start chat' || txt === 'send' || txt === 'send message') {
                return b;
            }
        }

        // 2. Global search: exact QA class on document (never generic .fw-button!)
        btn = document.querySelector('button.qa-send-message-submit-button, [qa-send-message-submit-button], .qa-send-message-submit-button');
        if (btn && !btn.closest('#azza-haggler-hud')) return btn;

        // 3. Global search: orange bloated-warning button with text "Start chat" (never search/sell header buttons)
        const allWarningBtns = document.querySelectorAll('button.fw-button--type-bloated-warning');
        for (const b of allWarningBtns) {
            if (b.closest('#azza-haggler-hud')) continue;
            if (b.classList.contains('qa-header-sell') || b.querySelector('.qa-header-sell')) continue;
            const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
            if (txt === 'start chat' || txt === 'send') {
                return b;
            }
        }

        // 4. Global search: any button whose text is "Start chat" that is not in the contact block
        const allBtns = document.querySelectorAll('button:not(#azza-haggler-hud *), div[role="button"]:not(#azza-haggler-hud *)');
        for (const b of allBtns) {
            if (b.closest('.b-advert-contact-buttons') || b.classList.contains('qa-start-chat')) continue;
            const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
            if (txt === 'start chat') {
                return b;
            }
        }

        return null;
    }

    let hasSentListingPitch = false;

    // --- MULTI-SELLER & BATCH OUTREACH TRANSITION CONTROLLER ---
    function handlePostPitchTransition() {
        const rawQueue = sessionStorage.getItem('azza_seller_queue');
        const rawIndex = sessionStorage.getItem('azza_seller_index');

        if (rawQueue) {
            try {
                const queue = JSON.parse(rawQueue);
                const currentIndex = parseInt(rawIndex || '0', 10);
                const nextIndex = currentIndex + 1;

                if (nextIndex < queue.length) {
                    logHUD(`Multi-Seller: Pitched seller ${currentIndex + 1}/${queue.length}. Waiting 5s cooldown to prevent Jiji WebSocket rate-limits...`);
                    setStatus(`NEXT SELLER (${nextIndex + 1}/${queue.length})`, '#FFB703');
                    sessionStorage.setItem('azza_seller_index', nextIndex.toString());
                    sessionStorage.setItem('azza_target_listing', JSON.stringify({
                        title: queue[nextIndex].title,
                        asking_price: queue[nextIndex].price,
                        url: queue[nextIndex].url
                    }));
                    setTimeout(() => {
                        window.location.href = queue[nextIndex].url;
                    }, 5000);
                    return;
                } else {
                    logHUD(`🎉 Multi-Seller: Outreach complete! Contacted all ${queue.length} candidate sellers.`);
                    sessionStorage.removeItem('azza_seller_queue');
                    sessionStorage.removeItem('azza_seller_index');
                }
            } catch (e) {
                console.error('Error handling seller queue transition:', e);
                sessionStorage.removeItem('azza_seller_queue');
                sessionStorage.removeItem('azza_seller_index');
            }
        }

        // Final transition: All sellers pitched -> open chat switchboard to monitor responses
        logHUD('Opening chat window in 2s to monitor conversations...');
        setStatus('OPENING INBOX', '#00b53f');
        setTimeout(() => {
            window.location.href = 'https://jiji.ng/profile-messages';
        }, 2000);
    }

    function waitForListingTextareaAndSend(openerMsg) {
        if (hasSentListingPitch) return;
        logHUD('Waiting for chat text box to appear on listing...');
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            const input = findListingChatInput();

            if (input && !hasSentListingPitch) {
                clearInterval(interval);
                logHUD('Typing opening pitch into chat text box...');
                setUniversalInputValue(input, openerMsg);

                // Give Vue's reactive state 500ms to register value & enable submit button
                setTimeout(() => {
                    if (hasSentListingPitch) return;
                    const sendBtn = findListingSubmitButton(input);

                    if (sendBtn) {
                        hasSentListingPitch = true;
                        const btnDesc = sendBtn.className ? sendBtn.className.slice(0, 30) : 'submit-button';
                        logHUD(`Clicking orange "Start chat" button (${btnDesc}...)...`);
                        sendBtn.removeAttribute('disabled');
                        sendBtn.disabled = false;
                        triggerClick(sendBtn);

                        logHUD('🚀 Sent AI opening pitch to seller!');
                        setStatus('PITCH SENT', '#00b53f');
                        sessionStorage.removeItem('azza_target_listing');
                        sessionStorage.removeItem('azza_pending_pitch');

                        handlePostPitchTransition();
                    } else {
                        hasSentListingPitch = true;
                        logHUD('⚠️ Submit button not found, falling back to Enter...');
                        triggerUniversalSend(input, null);
                        setStatus('PITCH SENT', '#00b53f');
                        sessionStorage.removeItem('azza_target_listing');
                        sessionStorage.removeItem('azza_pending_pitch');

                        handlePostPitchTransition();
                    }
                }, 500);
            } else if (attempts > 30) {
                clearInterval(interval);
                logHUD('⚠️ Chat text box did not appear.');
                setStatus('INPUT TIMEOUT', '#ef4444');
                if (sessionStorage.getItem('azza_seller_queue')) {
                    logHUD('⚠️ Moving to next seller in queue in 2s...');
                    setTimeout(handlePostPitchTransition, 2000);
                }
            }
        }, 300);
    }

    // Helper: Checks if a conversation room has PASSED (Won) or FAILED (Rejected / Stood Down)
    function isFinalizedRoom(roomId) {
        if (!roomId) return false;
        if (sessionStorage.getItem('azza_stood_down_' + roomId) === 'true') return true;
        if (sessionStorage.getItem('azza_rejected_' + roomId) === 'true') return true;
        if (sessionStorage.getItem('azza_deal_won_' + roomId) === 'true') return true;
        try {
            const rawDeals = sessionStorage.getItem('azza_proposed_deals');
            if (rawDeals) {
                const deals = JSON.parse(rawDeals);
                if (deals[roomId]) {
                    const s = deals[roomId].status;
                    if (s === 'APPROVED' || s === 'REJECTED' || s === 'STAND_DOWN' || deals[roomId].deal_closed) {
                        return true;
                    }
                }
            }
        } catch(e) {}
        return false;
    }

    // Helper: Checks if a card has a genuine non-zero unread badge
    function hasGenuineUnreadBadge(card) {
        if (!card) return false;
        const badge = card.querySelector('.b-room-label-new-messages, .unread-badge:not([class*="hide"]), [class*="counter"], [class*="badge"]');
        if (!badge) return false;
        if (badge.classList.contains('unread-badge--hide') || badge.classList.contains('hide')) return false;
        const txt = (badge.innerText || badge.textContent || '').trim();
        if (txt.length === 0) return true; // dot indicator
        const count = parseInt(txt.replace(/[^0-9]/g, ''), 10);
        return isNaN(count) || count > 0;
    }

    // Helper: Determines if a sidebar conversation needs our attention (replied by seller)
    function cardNeedsReply(card, activeChat, currentRoomId) {
        if (!card) return false;
        if (isCardCurrentlyActive(card, activeChat, currentRoomId)) return false;
        if (isCardFinalized(card)) return false;

        // 1. Genuine unread badge
        if (hasGenuineUnreadBadge(card)) return true;

        // 2. Check if the preview snippet in the sidebar was sent by the seller (not by us)
        const snippetEl = card.querySelector('.b-room-label__text-wrapper span, .b-room-label__text-wrapper, [class*="text-wrapper"]');
        const snippet = (snippetEl?.innerText || snippetEl?.textContent || '').trim();
        if (!snippet) return false;

        const myPrefixes = [
            'make i quickly arrange',
            'deal boss',
            'i dey lagos too',
            'senior man, i salute',
            'my oga, i salute',
            'good day, is this still available',
            'got your number boss',
            'i go drop am once'
        ];

        const snipLower = snippet.toLowerCase();
        const isMyMessage = myPrefixes.some(p => snipLower.startsWith(p)) ||
                            (lastSentReply && snipLower.startsWith(lastSentReply.toLowerCase().slice(0, 20)));

        return !isMyMessage;
    }

    // Helper: Checks if a card corresponds to the currently open chat room
    function isCardCurrentlyActive(card, activeChat, currentRoomId) {
        if (!card) return false;
        // 1. Explicit active BEM classes from Jiji's Vue component
        if (
            card.classList.contains('b-room-label-wrapper--active') ||
            card.classList.contains('active') ||
            card.querySelector('.b-room-label-wrapper--active, .active') !== null
        ) {
            return true;
        }
        // 2. Room ID match in href or attributes or HTML
        if (currentRoomId) {
            const link = card.tagName === 'A' ? card : (card.querySelector('a[href*="profile-messages/"]') || card.querySelector('a'));
            const href = link?.getAttribute('href') || link?.href || '';
            if (href.includes(`/profile-messages/${currentRoomId}`)) return true;
            if (card.dataset?.id === currentRoomId || card.getAttribute('data-room-id') === currentRoomId) return true;
            if (card.innerHTML.includes(`/profile-messages/${currentRoomId}`)) return true;
        }
        // 3. Seller name match with active room on screen
        const activeSeller = activeChat?.sellerName || document.querySelector('.b-messenger-room-header-user-name, [qa-messenger-room-user-name]')?.innerText?.trim();
        if (activeSeller && activeSeller !== 'Seller') {
            const cardSeller = card.querySelector('.qa-room-label-link-name, .b-room-label__user-name, [class*="user-name"], [class*="name"]')?.innerText?.trim();
            if (cardSeller && cardSeller.toLowerCase() === activeSeller.toLowerCase()) {
                return true;
            }
        }
        return false;
    }

    // ==========================================
    // FLOW 3: MESSAGES SWITCHBOARD & DYNAMIC MULTI-CHAT NEGOTIATOR
    // ==========================================
    let lastRoomMountedTime = 0;
    let lastHandledRoomId = null;

    function handleMessagesInbox() {
        logHUD('Inbox Switchboard active! Monitoring conversations...');
        setStatus('WATCHING INBOX', '#00b53f');

        setupChatObserver();

        if (activeInterval) clearInterval(activeInterval);

        activeInterval = setInterval(() => {
            if (isProcessing) return;

            const now = Date.now();
            const currentRoomMatch = window.location.pathname.match(/profile-messages\/(\d+)/);
            const currentRoomId = currentRoomMatch ? currentRoomMatch[1] : null;

            if (currentRoomId && currentRoomId !== lastHandledRoomId) {
                lastHandledRoomId = currentRoomId;
                lastRoomMountedTime = now;
            }

            // ========================================================
            // SCENARIO 1: A ROOM IS CURRENTLY OPEN OR MOUNTING
            // ========================================================
            const activeChat = findActiveChat();
            if (activeChat) {
                if (activeChat.isLoading) {
                    setStatus('LOADING CHAT...', '#FFB703');
                    return; // NEVER SWITCH AWAY WHILE MESSAGES ARE MOUNTING!
                }

                // Check if this active room already has a deal proposed awaiting approval
                const isDealProposedForActive = Boolean(
                    sessionStorage.getItem('azza_deal_won_' + activeChat.dialogId) ||
                    sessionStorage.getItem('azza_deal_agreed_' + activeChat.dialogId)
                );

                // GOLDEN RULE: If seller spoke last, STAY IN THIS ROOM AND COMPLETE THE REPLY!
                if (!activeChat.isWaitingForSeller) {
                    if (isDealProposedForActive) {
                        const sellerTxt = (activeChat.sellerText || '').trim().toLowerCase();
                        const isSimpleAck = /^(?:okay|ok|k|alright|cool|noted|no problem|no wahala|i dey wait|i will wait|fine|seen|thanks|thank you)$/i.test(sellerTxt);
                        if (isSimpleAck) {
                            setStatus('AWAITING YOUR APPROVAL', '#FFB703');
                            activeChat.isWaitingForSeller = true; // Mark waiting so switchboard can check other sellers!
                        } else {
                            setStatus('SELLER SPOKE LAST', '#FFB703');
                            if (isAutoPilot) {
                                checkActiveChatReply();
                                checkPendingTelegramAction();
                            }
                            return; // Wait for response
                        }
                    } else {
                        setStatus('SELLER SPOKE LAST', '#FFB703');
                        if (isAutoPilot) {
                            checkActiveChatReply();
                            checkPendingTelegramAction();
                        }
                        return; // LOCKED IN THIS ROOM! DO NOT SWITCH AWAY UNDER ANY CIRCUMSTANCES!
                    }
                }

                // We are waiting for seller in this room (or awaiting human approval on holding deal)
                if (isDealProposedForActive) {
                    setStatus('AWAITING YOUR APPROVAL', '#FFB703');
                } else {
                    setStatus('WAITING FOR SELLER', '#00b53f');
                }
                checkPendingTelegramAction();
            }

            // ========================================================
            // SCENARIO 2: SCAN SIDEBAR TO SWITCH OR OPEN CONVERSATIONS
            // ========================================================
            // Strictly query room cards in the messenger sidebar/room list
            const rawCards = Array.from(document.querySelectorAll(
                '.b-messenger-sidebar .b-room-label-wrapper, .b-messenger-room-list .b-room-label-wrapper, .b-messenger-sidebar div.qa-room-label-link, .b-messenger-room-list div.qa-room-label-link, .b-room-label-wrapper'
            )).filter(el => {
                return !el.closest('.b-messenger-room-output, .b-messenger-room-messages, .b-messenger-room-wrapper, .b-messenger-main-frame');
            });
            const cards = rawCards.filter(el => !rawCards.some(parent => parent !== el && parent.contains(el)));
            if (cards.length === 0) return;

            let targetSwitchCard = null;

            if (activeChat && !activeChat.isLoading) {
                // When an active room is open (and we are waiting for seller reply or deal is in holding):
                // Check if another conversation NEEDS A REPLY!
                for (const c of cards) {
                    if (cardNeedsReply(c, activeChat, currentRoomId)) {
                        targetSwitchCard = c;
                        break;
                    }
                }
            } else if (!currentRoomId && !activeChat) {
                // When NO room is open on screen ("Select a chat to start messaging"):
                const needingReply = cards.find(c => cardNeedsReply(c, null, null));
                targetSwitchCard = needingReply || cards.find(c => !isCardFinalized(c)) || cards[0];
            }

            // Open or switch conversation
            if (targetSwitchCard) {
                if (isCardCurrentlyActive(targetSwitchCard, activeChat, currentRoomId)) return;

                const cooldownPassed = (now - autoOpenDebounce > 3500);
                if (!cooldownPassed) return;

                const targetSellerName = targetSwitchCard.querySelector('.qa-room-label-link-name, .b-room-label__user-name, [class*="user-name"], [class*="name"]')?.innerText?.trim() || 'Seller';
                const hasUnread = hasGenuineUnreadBadge(targetSwitchCard);
                const switchReason = hasUnread ? 'unread badge' : 'seller replied';
                logHUD(`Switchboard: Switching to ${targetSellerName} (${switchReason})...`);
                autoOpenDebounce = now;
                lastRoomMountedTime = now;

                triggerClick(targetSwitchCard);
                const inner = targetSwitchCard.querySelector('.b-room-label, .qa-room-label-link, div[fw-menu-trigger]');
                if (inner) triggerClick(inner);
            }
        }, 1500);
    }

    let isDispatchingPendingAction = false;
    async function checkPendingTelegramAction() {
        if (isDispatchingPendingAction) return;

        const dialogMatch = window.location.pathname.match(/profile-messages\/(\d+)/);
        const dialogId = dialogMatch ? dialogMatch[1] : (window.location.pathname.split('/').pop() || 'live_chat');
        if (!dialogId || dialogId === 'live_chat' || dialogId === 'messages') return;

        const res = await apiCall(`/session/${dialogId}/pending-action`, 'GET');
        if (res?.pending_action?.text) {
            isDispatchingPendingAction = true;
            const actionText = res.pending_action.text;
            const actionType = res.pending_action.action || 'action';

            // Immediately ACK to prevent repeat fetch on next 1.5s interval
            apiCall(`/session/${dialogId}/ack-pending`, 'POST');

            if (actionType === 'reject' || actionType === 'stand_down') {
                sessionStorage.setItem('azza_stood_down_' + dialogId, 'true');
                sessionStorage.setItem('azza_rejected_' + dialogId, 'true');
            }

            const chat = findActiveChat();
            if (chat && chat.input) {
                logHUD(`⚡ Executing Telegram command (${actionType}): "${actionText.slice(0, 30)}..."`);
                setUniversalInputValue(chat.input, actionText);
                setTimeout(() => {
                    triggerUniversalSend(chat.input, chat.sendTarget);
                    logHUD(`✅ Dispatched Telegram action to seller!`);
                    isDispatchingPendingAction = false;
                }, 800);
            } else {
                isDispatchingPendingAction = false;
            }
        }
    }

    // --- REAL-TIME LIVE MUTATION OBSERVER ---
    function setupChatObserver() {
        if (activeChatObserver) {
            activeChatObserver.disconnect();
            activeChatObserver = null;
        }

        activeChatObserver = new MutationObserver((mutations) => {
            if (isProcessing || !isAutoPilot) return;

            let hasNewMessage = false;
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType === 1) {
                        if (
                            node.classList?.contains('b-messenger-room-message-wrapper') ||
                            node.classList?.contains('qa-message-wrapper') ||
                            node.classList?.contains('b-room-label-new-messages') ||
                            node.querySelector?.('.b-messenger-room-message-wrapper, .qa-message-text, .b-room-label-new-messages')
                        ) {
                            hasNewMessage = true;
                            break;
                        }
                    }
                }
                if (hasNewMessage) break;
            }

            if (hasNewMessage) {
                setTimeout(() => {
                    handleMessagesInbox();
                    checkActiveChatReply();
                }, 300);
            }
        });

        activeChatObserver.observe(document.body, { childList: true, subtree: true });
        console.log('[Observer] Real-time chat observer attached.');
    }

    // --- ACCURATE PRODUCTION ACTIVE CHAT INSPECTOR ---
    function findActiveChat() {
        const dialogMatch = window.location.pathname.match(/profile-messages\/(\d+)/);
        const dialogId = dialogMatch ? dialogMatch[1] : (window.location.pathname.split('/').pop() || 'live_chat');

        const inputs = document.querySelectorAll(
            '.qa-messenger-send-message-textarea, [qa-messenger-send-message-textarea], textarea.qa-quick-chat-text-area, [qa-quick-chat-text-area], div.b-messenger-input[contenteditable="true"], textarea:not(#azza-haggler-hud textarea), div[contenteditable="true"]:not(#azza-haggler-hud *)'
        );

        let activeInput = null;
        for (const el of inputs) {
            if (el.closest('#azza-haggler-hud')) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width > 40 && rect.height > 15) {
                activeInput = el;
                break;
            }
        }

        const sellerNameEl = document.querySelector(
            '.b-messenger-room-header-user-name, [qa-messenger-room-user-name], .qa-room-label-link-name, .qa-seller-title, h2'
        );
        const sellerName = sellerNameEl ? sellerNameEl.innerText.trim() : 'Seller';

        const titleEl = document.querySelector(
            '.b-messenger-room-advert-info-title-link, .b-messenger-room-advert-info-title, .qa-room-label-link-title, [qa-advert-title], h1'
        );
        const itemTitle = titleEl ? titleEl.innerText.trim() : (currentHunt.query || 'Item');

        const priceEl = document.querySelector(
            '.b-messenger-room-advert-info-price, [qa-advert-price], [class*="advert-info-price"]'
        );
        let askingPrice = 0;
        if (priceEl) {
            askingPrice = extractSafeCurrency(priceEl.innerText);
        }

        let sendTarget = document.querySelector(
            '.qa-messenger-send-message, [qa-messenger-send-message], button.qa-send-message-submit-button, [qa-send-message-submit-button], .b-messenger-input__icons-wrapper--message svg, button.qa-chat-send, button[type="submit"]'
        );

        if (!sendTarget && activeInput) {
            const container = activeInput.closest('form, div[class*="input"], div[class*="footer"], div[class*="room"], div[class*="drawer"], div[class*="bottom"]') || activeInput.parentElement;
            sendTarget = container?.querySelector('svg, button, [role="button"]');
        }

        // Query message wrappers across the messenger main frame, strictly excluding sidebar
        const messageWrappers = Array.from(document.querySelectorAll(
            '.b-messenger-room-message-wrapper:not(.b-messenger-room-message--alert-wrapper)'
        )).filter(el => !el.closest('.b-messenger-sidebar, .b-messenger-room-list'));

        const isRoomOpen = Boolean(dialogMatch || activeInput || (sellerName && sellerName !== 'Seller'));

        if (isRoomOpen && messageWrappers.length === 0) {
            const timeSinceMount = Date.now() - (lastRoomMountedTime || Date.now());
            // Allow up to 4.5 seconds for Jiji Vue SPA to render message history
            if (timeSinceMount < 4500) {
                return {
                    isLoading: true,
                    sellerName: sellerName,
                    itemTitle: itemTitle,
                    dialogId: dialogId
                };
            }
            // Truly empty chat room
            return {
                input: activeInput,
                sendTarget: sendTarget,
                sellerText: null,
                chatHistory: [],
                isWaitingForSeller: true,
                sellerName: sellerName,
                itemTitle: itemTitle,
                askingPrice: askingPrice,
                listingUrl: '',
                dialogId: dialogId
            };
        }

        if (messageWrappers.length === 0) {
            return null;
        }

        // Deterministic turn-taking from the absolute newest bubble
        const absoluteLastMsg = messageWrappers[messageWrappers.length - 1];
        
        let isLastMsgMine = absoluteLastMsg && (
            absoluteLastMsg.classList.contains('b-messenger-room-message-owner') || 
            absoluteLastMsg.classList.contains('b-messenger-room-message--owner') || 
            absoluteLastMsg.closest('.b-messenger-room-message-owner, .b-messenger-room-message--owner') !== null ||
            absoluteLastMsg.querySelector('.b-messenger-room-message-owner, .b-messenger-room-message--owner') !== null
        );

        const newestBubbleText = (absoluteLastMsg.innerText || absoluteLastMsg.textContent || '').trim();
        if (lastSentReply && newestBubbleText && (newestBubbleText === lastSentReply || lastSentReply.includes(newestBubbleText.slice(0, 30)))) {
            isLastMsgMine = true;
        }

        // Extract advert listing URL
        let listingUrl = '';
        const linkEl = document.querySelector(
            'a.b-messenger-room-advert-info-title-link, .b-messenger-room-advert-info a[href*=".html"], [qa-advert-title] a[href*=".html"], a.qa-room-label-link-title[href*=".html"], .b-messenger-room-advert-info a[href*="/advert/"]'
        ) || (titleEl?.tagName === 'A' ? titleEl : titleEl?.querySelector?.('a') || titleEl?.closest?.('a'));

        if (linkEl && linkEl.getAttribute) {
            const h = linkEl.getAttribute('href');
            if (h && (h.includes('.html') || h.includes('/advert/')) && !h.includes('profile-messages') && !h.includes('search')) {
                listingUrl = h.startsWith('http') ? h : `https://jiji.ng${h.startsWith('/') ? '' : '/'}${h}`;
            }
        }

        if (!listingUrl) {
            const cleanSellerKey = (sellerName || '').toLowerCase().trim();
            const cleanItemKey = (itemTitle || '').toLowerCase().trim();

            listingUrl = sessionStorage.getItem('azza_listing_url_' + dialogId) ||
                localStorage.getItem('azza_listing_seller_' + cleanSellerKey) ||
                localStorage.getItem('azza_listing_item_' + cleanItemKey) ||
                '';

            if (!listingUrl) {
                try {
                    const rawQueue = sessionStorage.getItem('azza_seller_queue');
                    if (rawQueue) {
                        const queue = JSON.parse(rawQueue);
                        const match = queue.find(q => 
                            (q.title && cleanItemKey && q.title.toLowerCase().includes(cleanItemKey)) ||
                            (cleanItemKey && cleanItemKey.includes(q.title.toLowerCase()))
                        );
                        if (match?.url) listingUrl = match.url;
                    }
                } catch(e) {}
            }

            if (!listingUrl) {
                try {
                    const rawTarget = sessionStorage.getItem('azza_target_listing');
                    if (rawTarget) {
                        const parsed = JSON.parse(rawTarget);
                        if (parsed?.url && parsed.url.includes('.html')) listingUrl = parsed.url;
                    }
                } catch(e) {}
            }

            if (!listingUrl && window.location.href.includes('.html')) {
                listingUrl = window.location.href;
            }

            if (!listingUrl) {
                listingUrl = localStorage.getItem('azza_last_listing_url') || '';
            }
        }

        if (listingUrl && listingUrl.includes('.html')) {
            sessionStorage.setItem('azza_listing_url_' + dialogId, listingUrl);
            if (sellerName) localStorage.setItem('azza_listing_seller_' + sellerName.toLowerCase().trim(), listingUrl);
            if (itemTitle) localStorage.setItem('azza_listing_item_' + itemTitle.toLowerCase().trim(), listingUrl);
        }

        // Extract full conversation history from all rendered bubbles in the chat
        const chatHistory = [];
        for (const w of messageWrappers) {
            const isOwner = w.classList.contains('b-messenger-room-message-owner') || 
                w.classList.contains('b-messenger-room-message--owner') || 
                w.closest('.b-messenger-room-message-owner, .b-messenger-room-message--owner') !== null ||
                w.querySelector('.b-messenger-room-message-owner, .b-messenger-room-message--owner') !== null;
            const txtEl = w.querySelector('.qa-message-text, .b-messenger-room-message-text') || w;
            let txt = (txtEl.innerText || txtEl.textContent || '').trim();
            const hasAudio = Boolean(w.querySelector('.b-audio-player, audio, [class*="audio"], [class*="voice"]'));
            if (hasAudio || /^\d{1,2}:\d{2}$/.test(txt) || txt.toLowerCase().includes('voice message')) {
                txt = '[VOICE_NOTE]';
            }
            if (txt && txt.length > 0) {
                chatHistory.push({
                    sender: isOwner ? 'me' : 'seller',
                    text: txt
                });
            }
        }

        if (isLastMsgMine) {
            return {
                input: activeInput,
                sendTarget: sendTarget,
                sellerText: null,
                chatHistory: chatHistory,
                isWaitingForSeller: true,
                sellerName: sellerName,
                itemTitle: itemTitle,
                askingPrice: askingPrice,
                listingUrl: listingUrl,
                dialogId: dialogId
            };
        }

        const textEl = absoluteLastMsg.querySelector('.qa-message-text, .b-messenger-room-message-text') || absoluteLastMsg;
        let sellerText = (textEl.innerText || textEl.textContent || '').trim();

        // Audio voice note detection (Jiji audio player elements or duration format e.g. "00:14")
        const hasAudioPlayer = Boolean(
            absoluteLastMsg.querySelector('.b-audio-player, audio, [class*="audio"], [class*="voice"]') ||
            absoluteLastMsg.matches('.b-audio-player, [class*="audio"], [class*="voice"]')
        );
        if (hasAudioPlayer || /^\d{1,2}:\d{2}$/.test(sellerText) || sellerText.toLowerCase().includes('voice message')) {
            sellerText = '[VOICE_NOTE]';
        }

        return {
            input: activeInput,
            sendTarget: sendTarget,
            sellerText: sellerText,
            chatHistory: chatHistory,
            isWaitingForSeller: false,
            sellerName: sellerName,
            itemTitle: itemTitle,
            askingPrice: askingPrice,
            listingUrl: listingUrl,
            dialogId: dialogId
        };
    }

    async function checkActiveChatReply(isManualForce = false) {
        if (isProcessing) return;

        const chat = findActiveChat();
        if (!chat || chat.isLoading) return;

        if (chat.isWaitingForSeller) {
            setStatus('WAITING FOR SELLER', '#00b53f');
            if (isManualForce) {
                logHUD(`Already sent reply to ${chat.sellerName}. Waiting for response...`);
            }
            return;
        }

        const dialogMatch = window.location.pathname.match(/profile-messages\/(\d+)/);
        let dialogId = dialogMatch ? dialogMatch[1] : null;
        if (!dialogId) {
            const activeCard = document.querySelector('.b-room-label-wrapper--active, [class*="active"] a.qa-room-label-link, a.qa-room-label-link.active');
            if (activeCard) {
                const cardHref = activeCard.getAttribute('href') || activeCard.querySelector('a')?.getAttribute('href') || '';
                const m = cardHref.match(/profile-messages\/(\d+)/);
                if (m) dialogId = m[1];
            }
        }
        if (!dialogId) {
            dialogId = window.location.pathname.split('/').pop() || 'live_chat';
        }

        // GUARD: Stood down or rejected sessions must NEVER be evaluated or replied to!
        if (sessionStorage.getItem('azza_stood_down_' + dialogId) || sessionStorage.getItem('azza_rejected_' + dialogId)) {
            setStatus('SELLER DROPPED / STOOD DOWN', '#888');
            return;
        }

        if (!isManualForce && chat.sellerText === lastHandledSellerByDialog[dialogId]) {
            setStatus('WAITING FOR SELLER', '#00b53f');
            return;
        }

        const now = Date.now();
        if (!isManualForce && (now - lastSentTimestamp < 6000)) {
            return;
        }

        clearActiveOfferTime(dialogId);

        lastHandledSellerByDialog[dialogId] = chat.sellerText;
        isProcessing = true;

        logHUD(`Seller (${chat.sellerName}): "${chat.sellerText.slice(0, 30)}..."`);
        setStatus('GEMINI THINKING', '#FFB703');

        // Cache history in browser memory
        if (chat.chatHistory && chat.chatHistory.length > 0) {
            sessionStorage.setItem('azza_chat_history_' + dialogId, JSON.stringify(chat.chatHistory));
        }

        const currentHuntId = sessionStorage.getItem('azza_current_hunt_id');
        const userLocation = localStorage.getItem('azza_user_location') || 'Lagos';
        let res;
        try {
            res = await apiCall('/chat-turn', 'POST', {
                dialog_id: dialogId,
                hunt_id: currentHuntId,
                message: chat.sellerText,
                chat_history: chat.chatHistory,
                seller_name: chat.sellerName,
                item_title: chat.itemTitle,
                asking_price: chat.askingPrice,
                budget: currentHunt.max_budget || 80000,
                user_location: userLocation,
                listing_url: chat.listingUrl,
                force: isManualForce
            });
        } catch (err) {
            logHUD(`⚠️ Chat turn error: ${err.message}. Retrying...`);
            delete lastHandledSellerByDialog[dialogId];
            isProcessing = false;
            return;
        }

        if (!res) {
            logHUD('⚠️ Backend did not return decision. Will retry...');
            delete lastHandledSellerByDialog[dialogId];
            isProcessing = false;
            return;
        }

        if (res?.already_handled) {
            logHUD('Server Turn Guard: already answered this message.');
            setStatus('WAITING FOR SELLER', '#00b53f');
            isProcessing = false;
            return;
        }

        // 1. COMPETITOR STAND-DOWN (Another seller already won this hunt)
        if (res?.stand_down && res.decision?.reply_text) {
            sessionStorage.setItem('azza_stood_down_' + dialogId, 'true');
            lastSentReply = res.decision.reply_text;
            lastSentTimestamp = Date.now();
            logHUD(`Stand-Down: Sent polite dismissal to ${chat.sellerName}.`);
            setUniversalInputValue(chat.input, res.decision.reply_text);
            setTimeout(() => {
                triggerUniversalSend(chat.input, chat.sendTarget);
                setStatus('SELLER STOOD DOWN', '#888');
                isProcessing = false;
            }, 800);
            return;
        }

        // 2. DEAL PROPOSED & 4-POINT VERIFIED (HUMAN APPROVAL GATE)
        if (res?.deal_proposed && res.proposed_deal) {
            logHUD(`🤝 Deal Proposed with ${chat.sellerName} for ₦${Number(res.proposed_deal.agreed_price).toLocaleString()}! Holding message sent.`);
            setStatus('AWAITING YOUR APPROVAL', '#FFB703');

            let rawDeals = sessionStorage.getItem('azza_proposed_deals');
            let deals = rawDeals ? JSON.parse(rawDeals) : {};
            deals[dialogId] = res.proposed_deal;
            sessionStorage.setItem('azza_proposed_deals', JSON.stringify(deals));
            sessionStorage.setItem('azza_deal_won_' + dialogId, 'true');
            sessionStorage.setItem('azza_deal_agreed_' + dialogId, 'true');
            renderDeals();

            // Send exact holding phrase to seller
            if (res.decision?.reply_text) {
                lastSentReply = res.decision.reply_text;
                lastSentTimestamp = Date.now();
                setUniversalInputValue(chat.input, res.decision.reply_text);
                setTimeout(() => {
                    triggerUniversalSend(chat.input, chat.sendTarget);
                    logHUD('Sent holding note to seller. Review listing in HUD!');
                    recordActiveOfferTime(dialogId, chat.sellerName, chat.askingPrice, res.proposed_deal.agreed_price, true);
                    isProcessing = false;
                }, 800);
            } else {
                isProcessing = false;
            }
            return;
        }

        // 3. SELLER REFUSED LOWER BLUFF
        if (res?.bluff_refused) {
            logHUD(`⚠️ ${chat.sellerName} refused lower offer. They insist on ₦${Number(res.original_price).toLocaleString()}.`);
            setStatus('BLUFF REFUSED', '#ef4444');

            let rawDeals = sessionStorage.getItem('azza_proposed_deals');
            let deals = rawDeals ? JSON.parse(rawDeals) : {};
            if (deals[dialogId]) {
                deals[dialogId].status = 'BLUFF_REFUSED';
                deals[dialogId].agreed_price = res.original_price;
            }
            sessionStorage.setItem('azza_proposed_deals', JSON.stringify(deals));
            renderDeals();
            isProcessing = false;
            return;
        }

        // 4. ALL SELLERS DEADLOCKED / IMPASSE
        if (res?.all_deadlocked) {
            logHUD(`⚠️ All candidate sellers have deadlocked above budget!`);
            setStatus('ALL DEADLOCKED', '#ef4444');
            showDeadlockBanner();
        }

        if (res?.decision?.is_impasse) {
            sessionStorage.setItem('azza_stood_down_' + dialogId, 'true');
            sessionStorage.setItem('azza_rejected_' + dialogId, 'true');
        }

        // 5. STANDARD ONGOING NEGOTIATION TURN (WITH HUMAN TYPING DELAY & SEND VERIFICATION)
        if (res?.decision?.reply_text) {
            lastSentReply = res.decision.reply_text;
            lastSentTimestamp = Date.now();

            logHUD(`Gemini counter: "${res.decision.reply_text.slice(0, 35)}..."`);
            setUniversalInputValue(chat.input, res.decision.reply_text);

            // Natural human pacing delay (4.5 to 7.0 seconds) so it doesn't look like an automated bot
            const pacingSec = (Math.random() * 2.5 + 4.5).toFixed(1);
            logHUD(`Pacing counter (${pacingSec}s typing delay to look human)...`);
            setStatus(`TYPING (${pacingSec}s)`, '#FFB703');

            setTimeout(() => {
                triggerUniversalSend(chat.input, chat.sendTarget);
                logHUD('🚀 Sent AI counter to seller!');
                setStatus('WAITING FOR SELLER', '#00b53f');
                isProcessing = false;

                // Record offer timestamp for inactivity/ghosting tracking
                const isAgreedTurn = Boolean(res.decision?.reply_text && (
                    res.decision.reply_text.includes('agreed!') ||
                    res.decision.reply_text.includes('Agreed') ||
                    res.decision.stance === 'AGREED' ||
                    res.decision.stance === 'VERIFYING_DETAILS'
                ));
                if (isAgreedTurn) {
                    sessionStorage.setItem('azza_deal_agreed_' + dialogId, 'true');
                }
                recordActiveOfferTime(dialogId, chat.sellerName, chat.askingPrice, res.decision.counter_offer || currentHunt.max_budget, isAgreedTurn);

                // Delivery verification check after 1.5s
                setTimeout(() => {
                    verifyDeliveryAndRetry(chat, res.decision.reply_text);
                }, 1500);
            }, parseFloat(pacingSec) * 1000);
        } else {
            isProcessing = false;
            setStatus('WAITING FOR SELLER', '#00b53f');
        }
    }

    // --- DELIVERY VERIFICATION & RETRY PROTOCOL ---
    function verifyDeliveryAndRetry(chat, expectedText) {
        if (!chat) return;
        const errorEl = document.querySelector('.b-messenger-room-message--error, .qa-message-error, .qa-retry-send, [class*="error-icon"], .fw-toast--error');
        const inputHasText = chat.input && chat.input.value && chat.input.value.trim().length > 5;

        if (errorEl || inputHasText) {
            logHUD('⚠️ Send check: Jiji WebSocket or delivery error detected. Backing off 4s to retry...');
            setStatus('RETRYING SEND', '#FFB703');
            setTimeout(() => {
                if (chat.input && chat.sendTarget) {
                    triggerUniversalSend(chat.input, chat.sendTarget);
                    logHUD('🔄 Retried sending message to seller.');
                }
            }, 4000);
        } else {
            logHUD('✅ Message verified delivered in chat!');
        }
    }

    // --- INACTIVITY & GHOSTING STATE TRACKER ---
    function recordActiveOfferTime(dialogId, sellerName, askingPrice, currentOffer, isDealAgreed = false) {
        let raw = sessionStorage.getItem('azza_chat_inactivity') || '{}';
        let data = {};
        try { data = JSON.parse(raw); } catch(e) {}
        data[dialogId] = {
            dialog_id: dialogId,
            seller_name: sellerName || 'Seller',
            asking_price: askingPrice || 0,
            current_offer: currentOffer || 0,
            is_deal_agreed: Boolean(isDealAgreed),
            offer_time: Date.now(),
            nudged: false,
            stalled_reported: false
        };
        sessionStorage.setItem('azza_chat_inactivity', JSON.stringify(data));
    }

    function clearActiveOfferTime(dialogId) {
        let raw = sessionStorage.getItem('azza_chat_inactivity') || '{}';
        let data = {};
        try { data = JSON.parse(raw); } catch(e) {}
        delete data[dialogId];
        sessionStorage.setItem('azza_chat_inactivity', JSON.stringify(data));
    }

    // Street Nudges pool (Natural, non-disruptive follow-ups that NEVER reopen or renegotiate agreed prices)
    const STREET_NUDGES = [
        "My oga, how we go run am? Make we do this business today na, money dey ground sharp sharp.",
        "Senior man, I dey wait you o. If we fit agree, make I come pick am sharp sharp today.",
        "Boss you dey? Let me know if my offer works make I arrange payment today."
    ];

    async function checkInactivityAndGhosting() {
        if (isProcessing) return;
        let raw = sessionStorage.getItem('azza_chat_inactivity') || '{}';
        let data = {};
        try { data = JSON.parse(raw); } catch(e) {}

        const now = Date.now();
        const NUDGE_THRESHOLD = 5 * 60 * 1000; // 5 minutes of silence
        const STALLED_THRESHOLD = 12 * 60 * 1000; // 12 minutes of silence

        for (const [dialogId, entry] of Object.entries(data)) {
            const elapsed = now - entry.offer_time;

            // STAGE 1: Nudge at 5 mins of silence
            if (elapsed >= NUDGE_THRESHOLD && !entry.nudged) {
                const isDealAgreed = entry.is_deal_agreed ||
                    sessionStorage.getItem('azza_deal_won_' + dialogId) === 'true' ||
                    sessionStorage.getItem('azza_deal_agreed_' + dialogId) === 'true';

                const chat = findActiveChat();
                const currentDialogMatch = window.location.pathname.match(/profile-messages\/(\d+)/);
                const currentDialogId = currentDialogMatch ? currentDialogMatch[1] : null;

                if (currentDialogId === dialogId && chat && chat.input) {
                    let nudgeText;
                    if (isDealAgreed) {
                        nudgeText = "Boss you dey? Just following up on the shop address / bank details make I verify and conclude.";
                        logHUD(`⏰ 5 mins silence from ${entry.seller_name} on agreed deal. Sending payment/pickup reminder...`);
                    } else {
                        nudgeText = STREET_NUDGES[Math.floor(Math.random() * STREET_NUDGES.length)];
                        logHUD(`⏰ 5 mins silence from ${entry.seller_name}. Sending gentle follow-up nudge...`);
                    }
                    setStatus('NUDGING SELLER', '#FFB703');
                    setUniversalInputValue(chat.input, nudgeText);
                    setTimeout(() => {
                        triggerUniversalSend(chat.input, chat.sendTarget);
                        apiCall('/seller/nudged', 'POST', { dialog_id: dialogId, seller_name: entry.seller_name, text: nudgeText });
                        logHUD(`✅ Sent follow-up nudge to ${entry.seller_name}!`);
                    }, 800);
                } else {
                    apiCall('/seller/nudged', 'POST', { dialog_id: dialogId, seller_name: entry.seller_name, text: 'Quiet for 5m' });
                }
                entry.nudged = true;
                sessionStorage.setItem('azza_chat_inactivity', JSON.stringify(data));
                return;
            }

            // STAGE 2: Stalled / Ghosting at 12 mins of silence
            if (elapsed >= STALLED_THRESHOLD && entry.nudged && !entry.stalled_reported) {
                entry.stalled_reported = true;
                sessionStorage.setItem('azza_chat_inactivity', JSON.stringify(data));
                const currentHuntId = sessionStorage.getItem('azza_current_hunt_id');
                logHUD(`⏳ ${entry.seller_name} has stalled for 12 mins. Alerting Telegram and expanding hunt...`);
                setStatus('SELLER STALLED', '#ef4444');

                await apiCall('/seller/stalled', 'POST', {
                    dialog_id: dialogId,
                    hunt_id: currentHuntId,
                    seller_name: entry.seller_name,
                    asking_price: entry.asking_price,
                    current_offer: entry.current_offer,
                    wait_minutes: 12
                });
                return;
            }
        }
    }

    // ==========================================
    // INSTANT SPA ROUTER & NAVIGATION HOOK
    // ==========================================
    function routePage() {
        injectHUD();

        const url = window.location.href;
        const path = window.location.pathname;

        let newMode = '';

        // Priority 1: Explicit Inbox Mode (Conversations & Switchboard)
        if (path.includes('profile-messages') || path.startsWith('/messages') || path.includes('/chat') || path.includes('/im')) {
            newMode = 'inbox';
        }
        // Priority 2: Explicit Search / Catalog Mode (Must take priority over listing elements so cards are not mistaken for a listing!)
        else if (path.includes('search') || url.includes('query=') || url.includes('filter_attr') || (path.length > 2 && !path.endsWith('.html') && !path.includes('/advert/'))) {
            newMode = 'search';
        }
        // Priority 3: Explicit Listing Page Mode (Jiji listings strictly end in .html or contain /advert/)
        else if (path.endsWith('.html') || path.includes('/advert/') || (!path.includes('search') && !url.includes('query=') && !!document.querySelector('.b-advert-contact-buttons, [qa-start-chat]'))) {
            newMode = 'listing';
        }
        // Priority 4: Homepage
        else if (path === '/' || path === '') {
            newMode = 'home';
        }

        if (newMode === currentRouteMode && url === lastRoutedUrl) return;
        currentRouteMode = newMode;
        lastRoutedUrl = url;
        lastUserNavigatedTime = Date.now();

        console.log(`[Router] Switching to mode: ${newMode} (${path})`);

        if (newMode === 'listing') {
            hasSentListingPitch = false;
            handleListingPage();
        } else if (newMode === 'inbox') {
            handleMessagesInbox();
        } else if (newMode === 'home') {
            setStatus('READY TO HUNT', '#00b53f');
            logHUD('Universal Engine v7.0 Ready on Homepage.');
        } else if (newMode === 'search') {
            handleSearchPage();
        }
    }

    // ==========================================
    // PERIODIC SAFETY REFRESH (EVERY 30 MINUTES)
    // ==========================================
    const SAFETY_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

    function schedulePeriodicSafetyRefresh() {
        setInterval(() => {
            if (isProcessing) {
                console.log('[Safety Refresh] AI action currently in progress. Postponing refresh...');
                return;
            }

            sessionStorage.setItem('azza_active_hunt', JSON.stringify(currentHunt));
            logHUD('⏰ 30-minute safety refresh executing to keep Jiji session alive...');
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        }, SAFETY_REFRESH_INTERVAL);
    }

    // Monkey-patch History API for INSTANT zero-delay SPA navigation detection
    (function hookHistory() {
        const pushState = history.pushState;
        history.pushState = function(...args) {
            const ret = pushState.apply(this, args);
            window.dispatchEvent(new Event('spa-navigated'));
            return ret;
        };

        const replaceState = history.replaceState;
        history.replaceState = function(...args) {
            const ret = replaceState.apply(this, args);
            window.dispatchEvent(new Event('spa-navigated'));
            return ret;
        };

        window.addEventListener('popstate', () => window.dispatchEvent(new Event('spa-navigated')));
        window.addEventListener('spa-navigated', () => {
            setTimeout(routePage, 100);
        });
    })();

    window.addEventListener('load', routePage);
    schedulePeriodicSafetyRefresh();

    let lastDispatchedHuntId = '';

    async function syncLiveHuntFromTelegram() {
        const statusRes = await apiCall('/control/status', 'GET');
        if (!statusRes) return;

        if (statusRes.bot_active !== undefined) {
            isAutoPilot = statusRes.bot_active;
            const autoToggle = document.getElementById('azza-toggle-auto');
            if (autoToggle) autoToggle.checked = isAutoPilot;
        }

        if (statusRes.user_location) {
            localStorage.setItem('azza_user_location', statusRes.user_location);
            const locInput = document.getElementById('azza-user-location');
            if (locInput && locInput.value !== statusRes.user_location) {
                locInput.value = statusRes.user_location;
            }
        }

        if (statusRes.mode === 'LIVE' && statusRes.active_hunt?.status === 'PENDING_DISPATCH') {
            const hunt = statusRes.active_hunt;
            if (hunt.hunt_id && hunt.hunt_id !== lastDispatchedHuntId && sessionStorage.getItem('azza_handled_hunt') !== hunt.hunt_id) {
                lastDispatchedHuntId = hunt.hunt_id;
                sessionStorage.setItem('azza_handled_hunt', hunt.hunt_id);
                sessionStorage.setItem('azza_current_hunt_id', hunt.hunt_id);
                sessionStorage.removeItem('azza_seller_queue');
                sessionStorage.removeItem('azza_seller_index');
                sessionStorage.removeItem('azza_proposed_deals');
                currentHunt = hunt;
                sessionStorage.setItem('azza_active_hunt', JSON.stringify(currentHunt));

                // Mark dispatched on backend
                await apiCall('/hunt/dispatched', 'POST', { hunt_id: hunt.hunt_id });
                logHUD(`🚀 Live Hunt instruction received from Telegram: "${hunt.query}" (Budget: ₦${Number(hunt.max_budget).toLocaleString()})`);
                
                // Redirect to Jiji search
                const targetUrl = `https://jiji.ng/search?query=${encodeURIComponent(hunt.query)}`;
                if (!window.location.href.includes(encodeURIComponent(hunt.query))) {
                    window.location.href = targetUrl;
                }
            }
        }
    }

    setInterval(syncLiveHuntFromTelegram, 2500);
    setInterval(checkInactivityAndGhosting, 10000);

    let currentUrl = location.href;
    setInterval(() => {
        if (location.href !== currentUrl) {
            currentUrl = location.href;
            logHUD(`Page: ${currentUrl.split('?')[0]}`);
            setTimeout(routePage, 200);
        }
    }, 800);

    setInterval(injectHUD, 2000);

})();
