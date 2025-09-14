/**
 * ==============================================================================
 * PROJECT CONFIGURATION
 * All core settings for the KAFer application.
 * ==============================================================================
 */
const PROJECT_CONFIG = {
    SHEET_ID: '1lfDRRlo6aYsjW5rEj3ZoL-bpO0ZG2PiLzZVu4A0Ypdg', // Your Google Sheet ID
    SHEET_NAME: 'v3.0',
    ADMIN_ID: '2025',
    OPENSHEET_BASE_URL: 'https://opensheet.elk.sh/',
    FORM_BASE_URL: 'https://docs.google.com/forms/d/e/1FAIpQLScPv4SVheBCYy1yu8iDPQs5MlJjRkhltnDN6KN2df5NJJ42NA/formResponse',
    SITE_URL: 'https://kafer-web.github.io', // Your site's root URL
    DEFAULT_SYSTEM_CONFIG: {
        emergency_lockdown: false,
        base_monthly_fee_yen: 1000,
    },
    KAF_MONEY_PER_YEN: 100, // 1 JPY = 100 KAFer
    REFUND_FEE_YEN: 100,
};

// Entry mapping for Google Form submission
const ENTRY_MAP = {
    data: '1922513785'
};


/**
 * ==============================================================================
 * DATA ENCRYPTION / DECRYPTION
 * Simple Base64 encoding/decoding to obfuscate data in the spreadsheet.
 * ==============================================================================
 */
const encryptData = (data) => btoa(unescape(encodeURIComponent(data)));
const decryptData = (encryptedData) => decodeURIComponent(escape(atob(encryptedData)));


/**
 * ==============================================================================
 * GOOGLE SHEET API INTERACTION (READ)
 * Functions for fetching and parsing data from the spreadsheet.
 * ==============================================================================
 */

/**
 * Fetches and decrypts all records from the Google Sheet.
 * @param {boolean} [isAdminFetch=false] - If true, bypasses emergency lockdown check.
 * @returns {Promise<Array<object>>} - A promise that resolves to an array of record objects.
 */
async function fetchSheetData(isAdminFetch = false) {
    const user = getLoggedInUser();
    // Fetch raw data first to check system status
    const rawRecords = await fetchRawSheetData();
    const systemConfig = await getSystemConfig(rawRecords.map(r => parseRecord(r)).filter(Boolean));

    // Enforce emergency lockdown if active
    if (systemConfig.emergency_lockdown && !(user && user.isAdmin) && !isAdminFetch) {
        alert('現在、システムは緊急情報保護モードのため、操作できません。');
        return [];
    }

    try {
        // Map over raw records and parse/decrypt them
        return rawRecords.map(record => parseRecord(record)).filter(Boolean); // Filter out any nulls from parsing errors
    } catch (error) {
        console.error('Error processing sheet data:', error);
        alert('データ処理中にエラーが発生しました。');
        return [];
    }
}

/**
 * Fetches the raw data from the OpenSheet API without parsing the DATA field.
 * @returns {Promise<Array<object>>} Raw records from the sheet.
 */
async function fetchRawSheetData() {
    try {
        const url = `${PROJECT_CONFIG.OPENSHEET_BASE_URL}${PROJECT_CONFIG.SHEET_ID}/${PROJECT_CONFIG.SHEET_NAME}`;
        const response = await fetch(url, { cache: 'no-store' }); // Disable cache to get latest data
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching raw sheet data:', error);
        return [];
    }
}

/**
 * Decrypts and parses the 'DATA' field of a single record.
 * @param {object} record - The raw record object from the sheet.
 * @returns {object|null} The parsed record with decrypted data, or null if parsing fails.
 */
function parseRecord(record) {
    if (record.DATA) {
        try {
            const decryptedContent = JSON.parse(decryptData(record.DATA));
            return { ...record, ...decryptedContent };
        } catch (e) {
            console.warn('Could not parse DATA for record:', record, e);
            return null;
        }
    }
    return record;
}


/**
 * ==============================================================================
 * GOOGLE SHEET API INTERACTION (WRITE)
 * Function for writing data via a Google Form.
 * ==============================================================================
 */

/**
 * Encrypts and sends data to the Google Form endpoint.
 * @param {string} name - The name of the user performing the action.
 * @param {string} kaferId - The KAFer ID of the user.
 * @param {string} type - The type of action (e.g., 'register', 'payment').
 * @param {object} additionalData - An object containing any other relevant data.
 * @returns {Promise<boolean>} - True if the submission was successful, false otherwise.
 */
async function writeToSheet(name, kaferId, type, additionalData) {
    const formData = new FormData();
    const dataToEncrypt = JSON.stringify({
        name,
        kaferId,
        type,
        timestamp: new Date().toISOString(),
        ...additionalData
    });
    const encryptedResult = encryptData(dataToEncrypt);

    if (!encryptedResult) {
        console.error('Encryption failed.');
        return false;
    }
    formData.append(`entry.${ENTRY_MAP.data}`, encryptedResult);
    
    // For debugging purposes
    console.log('Submitting to Google Form:', JSON.parse(dataToEncrypt));

    try {
        // Using 'no-cors' mode means we won't get a response, but the request is sent.
        await fetch(PROJECT_CONFIG.FORM_BASE_URL, {
            method: 'POST',
            body: formData,
            mode: 'no-cors'
        });
        // A small delay to allow the spreadsheet to potentially update before the next read.
        await new Promise(resolve => setTimeout(resolve, 1500));
        return true;
    } catch (error) {
        console.error('Error submitting form:', error);
        alert('データ送信中にエラーが発生しました。');
        return false;
    }
}


/**
 * ==============================================================================
 * AUTHENTICATION & SESSION MANAGEMENT
 * Handles user login, logout, and session state.
 * ==============================================================================
 */

/**
 * Authenticates a user against the data from the spreadsheet.
 * @param {string} kaferId - The KAFer ID to authenticate.
 * @param {string} password - The password to check.
 * @returns {Promise<object|null>} The user object if successful, otherwise null.
 */
async function authenticateUser(kaferId, password) {
    const records = await fetchSheetData();
    const registerRecords = records.filter(r => r.kaferId === kaferId && r.type === 'register');
    if (registerRecords.length === 0) return null; // User does not exist

    // Get the latest registration record for the user
    const latestRegister = registerRecords.reduce((prev, current) => new Date(prev.timestamp) > new Date(current.timestamp) ? prev : current);
    let currentPassword = latestRegister.pass;
    let currentName = latestRegister.name;
    
    // Check for subsequent password or name updates
    const updates = records.filter(r => r.targetKaferId === kaferId && (r.type === 'pass_update' || r.type === 'name_update'))
                           .sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

    updates.forEach(update => {
        if (update.type === 'pass_update' && new Date(update.timestamp) > new Date(latestRegister.timestamp)) {
            currentPassword = update.pass;
        }
        if (update.type === 'name_update' && new Date(update.timestamp) > new Date(latestRegister.timestamp)) {
            currentName = update.newName;
        }
    });

    if (currentPassword === password) {
        const user = { kaferId, name: currentName, isAdmin: (kaferId === PROJECT_CONFIG.ADMIN_ID) };
        localStorage.setItem('loggedInUser', JSON.stringify(user));
        return user;
    }
    return null;
}

/**
 * Logs the current user out.
 */
function logoutUser() {
    localStorage.removeItem('loggedInUser');
    window.location.href = '/index.html?redirect_message=logged_out';
}

/**
 * Retrieves the logged-in user's data from local storage.
 * @returns {object|null} The user object or null if not logged in.
 */
function getLoggedInUser() {
    const user = localStorage.getItem('loggedInUser');
    return user ? JSON.parse(user) : null;
}

/**
 * Checks login and PWA status, redirecting if necessary. This is the primary gatekeeper for protected pages.
 * @param {boolean} requireLogin - If true, user must be logged in.
 * @param {boolean} requireAdmin - If true, user must be an admin.
 * @returns {Promise<object|null>} The user object if all checks pass, otherwise null.
 */
async function checkLoginStatus(requireLogin = true, requireAdmin = false) {
    const user = getLoggedInUser();
    const currentPage = window.location.pathname;
    
    // Enforce PWA mode for all pages except the index page.
    if (currentPage !== '/index.html' && !window.matchMedia('(display-mode: standalone)').matches) {
        // Add a check for Lighthouse to prevent redirection during performance audits.
        if (!navigator.userAgent.includes("Chrome-Lighthouse")) {
            window.location.href = `/index.html?redirect_message=pwa_required`;
            return null;
        }
    }

    if (requireLogin && !user) {
        window.location.href = `/index.html?redirect_message=login_required`;
        return null;
    }
    if (requireAdmin && (!user || !user.isAdmin)) {
        window.location.href = `/index.html?redirect_message=admin_required`;
        return null;
    }
    
    return user;
}


/**
 * ==============================================================================
 * UI HELPER FUNCTIONS
 * Common functions for manipulating the DOM.
 * ==============================================================================
 */

/**
 * Displays a styled message to the user.
 * @param {string} elementId - The ID of the message container element.
 * @param {string} message - The text to display.
 * @param {'info'|'success'|'error'} type - The type of message.
 */
function showMessage(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = `message ${type}`;
        element.style.display = 'block';
    }
}

/**
 * Hides a message container.
 * @param {string} elementId - The ID of the message container element.
 */
function hideMessage(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = 'none';
    }
}

/**
 * Manages tabbed content visibility.
 * @param {string} tabContainerId - The ID of the tab navigation container.
 * @param {string} contentId - The ID of the content div to show.
 */
function showTabContent(tabContainerId, contentId) {
    const tabContainer = document.getElementById(tabContainerId);
    const contentContainer = document.getElementById(tabContainerId.replace('-nav', ''));
    
    if (tabContainer) {
        tabContainer.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));
        const targetButton = tabContainer.querySelector(`button[data-target="${contentId}"]`);
        if (targetButton) targetButton.classList.add('active');
    }

    if (contentContainer) {
        contentContainer.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
        const targetContent = document.getElementById(contentId);
        if (targetContent) targetContent.style.display = 'block';
    }
}


/**
 * ==============================================================================
 * PWA & DARK MODE INITIALIZATION
 * ==============================================================================
 */

function initializePwaAndDarkMode() {
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
                .then(reg => console.log('Service Worker registered:', reg.scope))
                .catch(err => console.error('Service Worker registration failed:', err));
        });
    }
    // Dark mode logic can be added here if needed in the future.
}

function showInstallPromptButton() {
    const btn = document.getElementById('installAppButton');
    if (btn && deferredPrompt) {
        btn.style.display = 'block';
        btn.classList.add('pulse-animation');
    }
}

function hideInstallPromptButton() {
    const btn = document.getElementById('installAppButton');
    if (btn) {
        btn.style.display = 'none';
        btn.classList.remove('pulse-animation');
    }
}


/**
 * ==============================================================================
 * ADMIN-SPECIFIC UI INITIALIZATION
 * ==============================================================================
 */

/**
 * Populates common UI elements for all admin pages (header, sidebar).
 * @param {object} user - The logged-in admin user object.
 * @param {string} currentPageKey - A key identifying the current page (e.g., 'dashboard', 'members').
 */
function initializeAdminUI(user, currentPageKey) {
    // Set header info
    document.getElementById('header-user-info').textContent = `${user.name} (Admin)`;

    // Define sidebar links
    const pages = {
        dashboard: { href: '/admin/dashboard.html', icon: 'fa-tools', text: '管理者ダッシュボード' },
        members: { href: '/admin/members.html', icon: 'fa-users', text: '会員管理' },
        money: { href: '/admin/money.html', icon: 'fa-money-check-alt', text: 'KAFerマネー' },
        settings: { href: '/admin/settings.html', icon: 'fa-cogs', text: 'サイト設定' },
    };

    const sidebarNav = document.getElementById('admin-sidebar-nav');
    if (sidebarNav) {
        let navHtml = '<ul>';
        for (const [key, page] of Object.entries(pages)) {
            const isActive = key === currentPageKey ? 'class="active"' : '';
            navHtml += `<li><a href="${page.href}" ${isActive}><i class="fas ${page.icon}"></i> ${page.text}</a></li>`;
        }
        navHtml += '<li><a href="/app/menu.html"><i class="fas fa-arrow-alt-circle-left"></i> ユーザーメニューへ</a></li>';
        navHtml += '</ul>';
        sidebarNav.innerHTML = navHtml;
    }
}


/**
 * ==============================================================================
 * BUSINESS LOGIC & CALCULATION HELPERS
 * ==============================================================================
 */
const yenToKaf = (yen) => yen * PROJECT_CONFIG.KAF_MONEY_PER_YEN;
const kafToYen = (kaf) => kaf / PROJECT_CONFIG.KAF_MONEY_PER_YEN;

/**
 * Calculates a user's current KAFer Money balance.
 * @param {string} kaferId - The user's KAFer ID.
 * @param {Array<object>} allRecords - The complete dataset from the sheet.
 * @returns {number} The calculated balance.
 */
function calculateKAFerMoneyBalance(kaferId, allRecords) {
    let balance = 0;
    allRecords.forEach(r => {
        if (r.type === 'payment' && r.kaferId === kaferId) {
            balance += r.amount || 0;
        } else if (r.type === 'refund_approved' && r.targetKaferId === kaferId) {
            // When a refund is approved, the requested amount is deducted from their balance.
            balance -= r.requestAmountKaf || 0;
        }
        // Note: Monthly fee deductions would also be subtracted here if implemented.
    });
    return balance;
}

/**
 * Retrieves the latest system configuration object.
 * @param {Array<object>} allRecords - The complete dataset from the sheet.
 * @returns {object} The latest system configuration.
 */
async function getSystemConfig(allRecords) {
    let config = { ...PROJECT_CONFIG.DEFAULT_SYSTEM_CONFIG };
    const systemConfigs = allRecords.filter(r => r.type === 'system_config');
    if (systemConfigs.length > 0) {
        const latestConfig = systemConfigs.reduce((prev, current) => 
            new Date(prev.timestamp) > new Date(current.timestamp) ? prev : current
        );
        Object.assign(config, latestConfig);
    }
    return config;
}

// Placeholder for a more complex payment status calculation.
async function calculateUserPaymentStatus(kaferId, allRecords) {
    // This function would need to calculate total fees due vs. total money paid.
    // For now, it's a simplified placeholder.
    return { outstanding: 0, status: 'Paid' };
}

// Placeholder for monthly fee calculation.
async function calculateCurrentMonthlyFee(allRecords) {
    // This function would calculate the total expected revenue for the current month.
    // For now, it's a simplified placeholder.
    return 0;
}