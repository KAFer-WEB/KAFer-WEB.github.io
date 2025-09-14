const PROJECT_CONFIG = {
    SHEET_ID: '1lfDRRlo6aYsjW5rEj3ZoL-bpO0ZG2PiLzZVu4A0Ypdg',
    SHEET_NAME: 'v3.0',
    ADMIN_ID: '2025',
    ADMIN_PASSCODE_SPECIAL: '@ichijik',
    OPENSHEET_BASE_URL: 'https://opensheet.elk.sh/',
    FORM_BASE_URL: 'https://docs.google.com/forms/d/e/1FAIpQLScPv4SVheBCYy1yu8iDPQs5MlJjRkhltnDN6KN2df5NJJ42NA/formResponse',
    SITE_URL: 'https://KAFer-WEB.github.io',
    DEVELOPER_INFO: {
        name: "GitHub @ichijik",
        repo: "https://github.com/ichijik"
    },
    DEFAULT_SYSTEM_CONFIG: {
        emergency_lockdown: false,
        base_monthly_fee_yen: 1000,
    },
    KAF_MONEY_PER_YEN: 100,
    REFUND_FEE_YEN: 100,
    REFUND_FEE_KAF: 10000,
    REFUND_UNIT_KAF: 10000,
};

const ENTRY_MAP = {
    data: '1922513785'
};

function encryptData(data) {
    try {
        return btoa(unescape(encodeURIComponent(data)));
    } catch (error) {
        console.error('Base64 encoding failed:', error);
        return '';
    }
}

function decryptData(encryptedData) {
    try {
        return decodeURIComponent(escape(atob(encryptedData)));
    } catch (error) {
        console.error('Base64 decoding failed:', error);
        return '';
    }
}

async function fetchSheetData(isAdminFetch = false) {
    const user = getLoggedInUser();
    const recordsForConfig = await fetchRawSheetData();
    const systemConfigRecordsRaw = recordsForConfig.map(r => {
        try {
            if (r.DATA) return JSON.parse(decryptData(r.DATA));
        } catch (e) {}
        return null;
    }).filter(r => r && r.type === 'system_config');

    let currentSystemConfig = { ...PROJECT_CONFIG.DEFAULT_SYSTEM_CONFIG };
    if (systemConfigRecordsRaw.length > 0) {
        const latestConfig = systemConfigRecordsRaw.reduce((prev, current) => new Date(prev.timestamp) > new Date(current.timestamp) ? prev : current);
        Object.assign(currentSystemConfig, latestConfig);
    }

    if (currentSystemConfig.emergency_lockdown && !(user && user.isAdmin) && !isAdminFetch) {
        alert('現在、システムは緊急情報保護モードです。');
        return [];
    }

    try {
        const url = `${PROJECT_CONFIG.OPENSHEET_BASE_URL}${PROJECT_CONFIG.SHEET_ID}/${PROJECT_CONFIG.SHEET_NAME}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return data.map(record => {
            if (record.DATA) {
                try {
                    const decryptedContent = JSON.parse(decryptData(record.DATA));
                    return { ...record, ...decryptedContent };
                } catch (e) {
                    console.warn('Could not parse DATA for record:', record, e);
                }
            }
            return record;
        });
    } catch (error) {
        console.error('Error fetching sheet data:', error);
        alert('データ取得中にエラーが発生しました。');
        return [];
    }
}

async function fetchRawSheetData() {
    try {
        const url = `${PROJECT_CONFIG.OPENSHEET_BASE_URL}${PROJECT_CONFIG.SHEET_ID}/${PROJECT_CONFIG.SHEET_NAME}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching raw sheet data:', error);
        return [];
    }
}

async function writeToSheet(name, kaferId, type, additionalData) {
    const formData = new FormData();
    const dataToEncrypt = JSON.stringify({ name, kaferId, type, timestamp: new Date().toISOString(), ...additionalData });
    const encryptedResult = encryptData(dataToEncrypt);

    if (!encryptedResult) {
        console.error('Encryption failed.');
        return false;
    }
    formData.append(`entry.${ENTRY_MAP.data}`, encryptedResult);

    try {
        await fetch(PROJECT_CONFIG.FORM_BASE_URL, {
            method: 'POST',
            body: formData,
            mode: 'no-cors'
        });
        return true;
    } catch (error) {
        console.error('Error submitting form:', error);
        alert('データ送信中にエラーが発生しました。');
        return false;
    }
}

async function authenticateUser(kaferId, password) {
    const records = await fetchSheetData();
    const userRecords = records.filter(r => r.kaferId === kaferId && r.type === 'register');
    if (userRecords.length === 0) return null;

    const latestRegister = userRecords.reduce((prev, current) => new Date(prev.timestamp) > new Date(current.timestamp) ? prev : current);
    
    if (latestRegister && latestRegister.pass === password) {
        const user = { kaferId, name: latestRegister.name, version: 'v3.0', isAdmin: (kaferId === PROJECT_CONFIG.ADMIN_ID) };
        localStorage.setItem('loggedInUser', JSON.stringify(user));
        return user;
    }
    return null;
}

function logoutUser() {
    localStorage.removeItem('loggedInUser');
    window.location.href = 'index.html';
}

function getLoggedInUser() {
    const user = localStorage.getItem('loggedInUser');
    return user ? JSON.parse(user) : null;
}

async function checkLoginStatus(requireLogin = true, requireAdmin = false, currentPath = '') {
    const user = getLoggedInUser();
    if (user && currentPath === 'index.html') {
        window.location.href = user.isAdmin ? 'admin.html' : 'menu.html';
        return;
    }
    if (!user && requireLogin) {
        alert('ログインが必要です。');
        window.location.href = 'index.html';
        return;
    }
    if (user && requireAdmin && !user.isAdmin) {
        alert('管理者権限が必要です。');
        window.location.href = 'index.html';
    }
}

function yenToKaf(yenAmount) {
    return Math.ceil(yenAmount * PROJECT_CONFIG.KAF_MONEY_PER_YEN);
}

function kafToYen(kafAmount) {
    const yen = kafAmount / PROJECT_CONFIG.KAF_MONEY_PER_YEN;
    return Math.ceil(yen * 100) / 100;
}

function generateRandomMoneyCode() {
    let result = '';
    for (let i = 0; i < 16; i++) {
        result += Math.floor(Math.random() * 10);
    }
    return result;
}

function showMessage(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = `message ${type}`;
        element.style.display = 'block';
    }
}

function hideMessage(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = 'none';
        element.textContent = '';
        element.className = '';
    }
}

function showTabContent(tabContainerId, contentId) {
    document.querySelectorAll(`#${tabContainerId} .tab-button`).forEach(button => button.classList.remove('active'));
    const targetButton = document.querySelector(`#${tabContainerId} button[data-target="${contentId}"]`);
    if (targetButton) targetButton.classList.add('active');

    const contentWrapperId = tabContainerId.replace('-nav', '-content-wrapper');
    document.querySelectorAll(`#${contentWrapperId} .tab-content`).forEach(content => content.style.display = 'none');
    const targetContent = document.getElementById(contentId);
    if (targetContent) targetContent.style.display = 'block';
}

function initializePwaAndDarkMode() {
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
                .then(registration => console.log('Service Worker registered:', registration.scope))
                .catch(error => console.error('Service Worker registration failed:', error));
        });
    }
}

function showInstallPromptButton() {
    const installAppButton = document.getElementById('installAppButton');
    if (installAppButton && deferredPrompt) {
        installAppButton.style.display = 'block';
        installAppButton.classList.add('pulse-animation');
    }
}

function hideInstallPromptButton() {
    const installAppButton = document.getElementById('installAppButton');
    if (installAppButton) {
        installAppButton.style.display = 'none';
        installAppButton.classList.remove('pulse-animation');
    }
}