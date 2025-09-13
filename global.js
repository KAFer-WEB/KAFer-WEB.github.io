const PROJECT_CONFIG = {
    SHEET_ID: '1lfDRRlo6aYsjW5rEj3ZoL-bpO0ZG2PiLzZVu4A0Ypdg',
    SHEET_NAME: 'v3.0',
    ADMIN_ID: '2025',
    ADMIN_PASSCODE_SPECIAL: '@ichijik',
    OPENSHEET_BASE_URL: 'https://opensheet.elk.sh/',
    FORM_BASE_URL: 'https://docs.google.com/forms/d/e/1FAIpQLScPv4SVheBCYy1yu8iDPQs5MlJjRkhltzDN6KN2df5NJJ42NA/formResponse',
    SITE_URL: 'https://KAFer-WEB.github.io',
    DEVELOPER_INFO: {
        name: "GitHub @ichijik",
        repo: "https://github.com/ichijik/KAFer-WEB"
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

function decryptData(encryptedPayload) {
    try {
        return decodeURIComponent(escape(atob(encryptedPayload)));
    } catch (error) {
        console.error('Base64 decoding failed:', error);
        return '';
    }
}

async function fetchSheetData(isAdminFetch = false) {
    const user = getLoggedInUser();
    const recordsForConfig = await fetchRawSheetData();

    const systemConfigRecordsRaw = recordsForConfig.filter(r => {
        try {
            if (r.DATA) {
                const encryptedPayload = JSON.parse(r.DATA);
                const decryptedJsonString = decryptData(encryptedPayload);
                const decryptedContent = JSON.parse(decryptedJsonString);
                return decryptedContent.type === 'system_config';
            }
            return false;
        } catch (e) {
            return false;
        }
    }).map(r => {
        if (r.DATA) {
            const encryptedPayload = JSON.parse(r.DATA);
            const decryptedJsonString = decryptData(encryptedPayload);
            return JSON.parse(decryptedJsonString);
        }
        return null;
    }).filter(content => content !== null);

    let currentSystemConfig = { ...PROJECT_CONFIG.DEFAULT_SYSTEM_CONFIG };
    if (systemConfigRecordsRaw.length > 0) {
        const latestConfig = systemConfigRecordsRaw.reduce((prev, current) => {
            const prevTime = new Date(prev.timestamp);
            const currentTime = new Date(current.timestamp);
            return (prevTime > currentTime) ? prev : current;
        }, systemConfigRecordsRaw[0]);
        Object.assign(currentConfig, latestConfig);
    }

    if (currentSystemConfig.emergency_lockdown && !(user && user.isAdmin) && !isAdminFetch) {
        alert('現在、システムは緊急情報保護モードです。データは読み込めません。');
        return [];
    }

    try {
        const url = `${PROJECT_CONFIG.OPENSHEET_BASE_URL}${PROJECT_CONFIG.SHEET_ID}/${PROJECT_CONFIG.SHEET_NAME}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        let data = await response.json();

        data = data.map(record => {
            const newRecord = { ...record };
            if (newRecord.DATA) {
                try {
                    const encryptedPayload = JSON.parse(newRecord.DATA);
                    const decryptedJsonString = decryptData(encryptedPayload);
                    const decryptedContent = JSON.parse(decryptedJsonString);
                    if (decryptedContent) {
                        Object.assign(newRecord, decryptedContent);
                    }
                } catch (e) {
                    console.warn('Could not decrypt or parse DATA for record:', newRecord, e);
                }
            }
            return newRecord;
        });
        return data;
    } catch (error) {
        console.error('Error fetching sheet data:', error);
        alert('データ取得中にエラーが発生しました。管理者にお問い合わせください。');
        return [];
    }
}

async function fetchRawSheetData() {
    try {
        const url = `${PROJECT_CONFIG.OPENSHEET_BASE_URL}${PROJECT_CONFIG.SHEET_ID}/${PROJECT_CONFIG.SHEET_NAME}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching raw sheet data:', error);
        return [];
    }
}

async function writeToSheet(name, kaferId, type, additionalData) {
    const formData = new FormData();

    const dataToEncrypt = {
        name: name,
        kaferId: kaferId,
        type: type,
        timestamp: new Date().toISOString(),
        ...additionalData
    };
    const encryptedResult = encryptData(JSON.stringify(dataToEncrypt));

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
        console.log('Form submission initiated (DATA encrypted by Client).');
        return true;
    } catch (error) {
        console.error('Error submitting form:', error);
        alert('データ送信中にエラーが発生しました。管理者にお問い合わせください。');
        return false;
    }
}

async function authenticateUser(kaferId, password) {
    const records = await fetchSheetData();
    const systemConfig = await getSystemConfig(records);

    if (kaferId !== PROJECT_CONFIG.ADMIN_ID && systemConfig.emergency_lockdown) {
        alert('現在、システムは緊急情報保護モードです。ログインできません。');
        return null;
    }

    const userRecords = records.filter(r => r.kaferId === kaferId && r.type === 'register');

    if (userRecords.length === 0) {
        return null;
    }

    const latestRegister = userRecords.reduce((prev, current) => {
        const prevTime = new Date(prev.timestamp);
        const currentTime = new Date(current.timestamp);
        return (prevTime > currentTime) ? prev : current;
    }, userRecords[0]);

    if (!latestRegister || !latestRegister.pass) {
        return null;
    }

    try {
        if (CryptoJS.SHA256(password).toString() === latestRegister.pass) {
            localStorage.setItem('loggedInUser', JSON.stringify({
                kaferId: kaferId,
                name: latestRegister.name,
                version: 'v3.0',
                isAdmin: (kaferId === PROJECT_CONFIG.ADMIN_ID)
            }));
            return {
                kaferId: kaferId,
                name: latestRegister.name,
                version: 'v3.0',
                isAdmin: (kaferId === PROJECT_CONFIG.ADMIN_ID)
            };
        }
    } catch (e) {
        console.error('Error during authentication or parsing user data:', e);
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
    const recordsRaw = await fetchRawSheetData();
    const systemConfig = await getSystemConfig(recordsRaw);

    if (systemConfig.emergency_lockdown && user && user.kaferId !== PROJECT_CONFIG.ADMIN_ID) {
        alert('現在、システムは緊急情報保護モードです。ログインユーザーはログアウトされます。');
        logoutUser();
        return;
    }

    if (currentPath === 'index.html') {
        if (user) {
            if (user.isAdmin) {
                if (!window.location.pathname.endsWith('admin.html')) {
                    window.location.href = 'admin.html';
                }
            } else {
                if (!window.location.pathname.endsWith('menu.html')) {
                    window.location.href = 'menu.html';
                }
            }
            return;
        }
        return;
    }

    if (requireLogin && !user) {
        alert('ログインが必要です。');
        window.location.href = 'index.html';
        return;
    }
    if (user) {
        if (requireAdmin && !user.isAdmin) {
            alert('管理者権限が必要です。');
            window.location.href = 'index.html';
            return;
        }
    }
}

async function getSystemConfig(allRecords) {
    const configRecords = allRecords.filter(r => {
        try {
            if (r.type === 'system_config') {
                return true;
            } else if (r.DATA) {
                const encryptedPayload = JSON.parse(r.DATA);
                const decryptedJsonString = decryptData(encryptedPayload);
                const decryptedContent = JSON.parse(decryptedJsonString);
                return decryptedContent.type === 'system_config';
            }
            return false;
        } catch (e) {
            return false;
        }
    }).map(r => {
        if (r.type === 'system_config') {
            return r;
        } else {
            const encryptedPayload = JSON.parse(r.DATA);
            const decryptedJsonString = decryptData(encryptedPayload);
            return JSON.parse(decryptedJsonString);
        }
    });

    let currentConfig = { ...PROJECT_CONFIG.DEFAULT_SYSTEM_CONFIG };

    if (configRecords.length > 0) {
        const latestConfig = configRecords.reduce((prev, current) => {
            const prevTime = new Date(prev.timestamp);
            const currentTime = new Date(current.timestamp);
            return (prevTime > currentTime) ? prev : current;
        }, configRecords[0]);
        Object.assign(currentConfig, latestConfig);
    }
    return currentConfig;
}

async function calculateCurrentMonthlyFee(allRecords) {
    const systemConfig = await getSystemConfig(allRecords);
    const baseFeeYen = systemConfig.base_monthly_fee_yen;
    const baseFeeKaf = baseFeeYenToKaf(baseFeeYen);

    const allRegisters = allRecords.filter(r => r.type === 'register');
    const activeMembers = [];
    allRegisters.forEach(register => {
        const isRemoved = allRecords.some(rem => rem.type === 'remove' && rem.targetKaferId === register.kaferId);
        if (!isRemoved) {
            activeMembers.push(register);
        }
    });

    let totalMonthlyFeeSumKaf = 0;

    for (const member of activeMembers) {
        const userPaymentStatus = await calculateUserPaymentStatus(member.kaferId, allRecords);
        totalMonthlyFeeSumKaf += userPaymentStatus.monthlyDue;
    }

    return totalMonthlyFeeSumKaf;
}

function calculateKAFerMoneyBalance(kaferId, allRecords) {
    let balance = 0;

    const issuedMoney = allRecords.filter(r =>
        r.type === 'money_code_issue' &&
        !allRecords.some(v => v.type === 'money_code_void' && v.moneyCode === r.moneyCode)
    );
    issuedMoney.forEach(issue => {
        const isUsed = allRecords.some(p => p.type === 'payment' && p.paymentCode === issue.moneyCode && p.kaferId === kaferId);
        if (!isUsed && issue.amount) {
            balance += issue.amount;
        }
    });

    const usedMoney = allRecords.filter(r => r.kaferId === kaferId && r.type === 'payment');
    usedMoney.forEach(payment => {
        if (payment.paymentCode && payment.amount) {
            balance -= payment.amount;
        }
    });

    const approvedRefunds = allRecords.filter(r => r.targetKaferId === kaferId && r.type === 'refund_approved');
    approvedRefunds.forEach(refund => {
        if (refund.refundAmountAfterFeeKaf) {
            balance -= refund.refundAmountAfterFeeKaf;
        }
    });

    return balance;
}

async function calculateUserPaymentStatus(kaferId, allRecords) {
    const systemConfig = await getSystemConfig(allRecords);
    const baseFeeYen = systemConfig.base_monthly_fee_yen;
    const baseFeeKaf = baseFeeYenToKaf(baseFeeYen);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let cumulativeMonthlyDueKaf = 0;

    const registerRecord = allRecords.find(r => r.kaferId === kaferId && r.type === 'register');
    if (!registerRecord) {
        return { monthlyDue: baseFeeKaf, kaferMoneyBalance: 0, outstanding: baseFeeKaf, excess: 0 };
    }
    const registerDate = new Date(registerRecord.timestamp);
    const registerYear = registerDate.getFullYear();
    const registerMonth = registerDate.getMonth();

    let cumulativePaidKaf = 0;
    const userPayments = allRecords.filter(r => r.kaferId === kaferId && r.type === 'payment');
    userPayments.forEach(p => {
        cumulativePaidKaf += p.amount || 0;
    });

    for (let y = registerYear; y <= currentYear; y++) {
        const startM = (y === registerYear) ? registerMonth : 0;
        const endM = (y === currentYear) ? currentMonth : 11;

        for (let m = startM; m <= endM; m++) {
            cumulativeMonthlyDueKaf += baseFeeKaf;
        }
    }

    const kaferMoneyBalance = calculateKAFerMoneyBalance(kaferId, allRecords);

    let effectiveArrearsKaf = cumulativeMonthlyDueKaf - cumulativePaidKaf;
    if (effectiveArrearsKaf < 0) {
        effectiveArrearsKaf = 0;
    }

    const monthlyDueKaf = baseFeeKaf + effectiveArrearsKaf;

    let outstanding = 0;
    let excess = 0;

    if (kaferMoneyBalance < monthlyDueKaf) {
        outstanding = monthlyDueKaf - kaferMoneyBalance;
    } else {
        excess = kaferMoneyBalance - monthlyDueKaf;
    }

    return {
        monthlyDue: monthlyDueKaf,
        kaferMoneyBalance: kaferMoneyBalance,
        outstanding: outstanding,
        excess: excess,
    };
}

function yenToKaf(yenAmount) {
    return Math.ceil(yenAmount * PROJECT_CONFIG.KAF_MONEY_PER_YEN);
}

function kafToYen(kafAmount) {
    const yen = kafAmount / PROJECT_CONFIG.KAF_MONEY_PER_YEN;
    return Math.ceil(yen * 100) / 100;
}

function baseFeeYenToKaf(baseFeeYen) {
    return baseFeeYen * PROJECT_CONFIG.KAF_MONEY_PER_YEN;
}

function generateRandomMoneyCode() {
    let result = '';
    for (let i = 0; i < 16; i++) {
        result += Math.floor(Math.random() * 10).toString();
    }
    return result;
}

function generateRandomRefundCode(length = 12) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
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
    document.querySelectorAll(`#${tabContainerId} .tab-button`).forEach(button => {
        button.classList.remove('active');
    });
    const targetButton = document.querySelector(`#${tabContainerId} button[data-target="${contentId}"]`);
    if (targetButton) {
        targetButton.classList.add('active');
    }

    const contentWrapperId = tabContainerId.replace('-nav', '-content-wrapper');
    document.querySelectorAll(`#${contentWrapperId} .tab-content`).forEach(content => {
        content.style.display = 'none';
    });
    const targetContent = document.getElementById(contentId);
    if (targetContent) {
        targetContent.style.display = 'block';
    }
}

function initializePwaAndDarkMode() {
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
                .then(registration => {
                    console.log('Service Worker registered with scope:', registration.scope);
                })
                .catch(error => {
                    console.error('Service Worker registration failed:', error);
                });
        });
    }
}

function showInstallPromptButton() {
    const installAppButton = document.getElementById('installAppButton');
    if (installAppButton && deferredPrompt) {
        installAppButton.style.display = 'block';
        installAppButton.classList.add('pulse-animation');
        installAppButton.setAttribute('aria-label', 'KAFerアプリをインストール');
        console.log('PWA installation prompt is ready.');
    } else {
        hideInstallPromptButton();
    }
}

function hideInstallPromptButton() {
    const installAppButton = document.getElementById('installAppButton');
    if (installAppButton) {
        installAppButton.style.display = 'none';
        installAppButton.classList.remove('pulse-animation');
    }
}