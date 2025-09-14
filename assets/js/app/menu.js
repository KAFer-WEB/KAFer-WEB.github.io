// Global variable for the QR code scanner instance
let html5QrCode = null;

/**
 * Main entry point, runs when the page content is loaded.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Basic setup: PWA initialization and login checks
    initializePwaAndDarkMode();
    const user = await checkLoginStatus(true, false); // Expects logged-in user, not admin
    if (!user) return; // Stop execution if no user is found

    // Populate common elements like header and navigation
    document.getElementById('header-user-info').textContent = `${user.name} (${user.kaferId})`;
    createBottomNav(user);

    // Determine which page is currently active and run its specific initialization logic
    const currentPage = window.location.pathname.split('/').pop();
    if (currentPage === 'menu.html') {
        initializeMenuPage(user);
    } else if (currentPage === 'meet.html') {
        initializeMeetPage();
    }
});

/**
 * Initializes all functionalities for menu.html.
 * @param {object} user - The logged-in user object.
 */
async function initializeMenuPage(user) {
    await updateDashboard(user);
    
    // Set up event listeners for forms
    document.getElementById('payment-form').addEventListener('submit', (e) => handlePaymentSubmit(e, user));
    document.getElementById('pass-update-form').addEventListener('submit', (e) => handlePasswordUpdate(e, user));
    document.getElementById('refund-request-form').addEventListener('submit', (e) => handleRefundRequest(e, user));

    // Set up event listeners for QR scanner buttons
    document.getElementById('start-scanner-btn').addEventListener('click', startQrScanner);
    document.getElementById('stop-scanner-btn').addEventListener('click', stopQrScanner);
}

/**
 * Initializes functionalities for meet.html.
 */
function initializeMeetPage() {
    const copyBtn = document.getElementById('copy-paypay-id-btn');
    copyBtn.addEventListener('click', () => {
        const paypayId = document.getElementById('paypay-id').value;
        navigator.clipboard.writeText(paypayId).then(() => {
            showMessage('message-area', 'PayPay IDをコピーしました！', 'success');
            setTimeout(() => hideMessage('message-area'), 2000);
        }).catch(err => {
            showMessage('message-area', 'コピーに失敗しました。', 'error');
            console.error('Copy failed:', err);
        });
    });
}

/**
 * Creates and injects the bottom navigation bar into the page.
 * @param {object} user - The logged-in user object.
 */
function createBottomNav(user) {
    const navContainer = document.getElementById('bottom-nav-bar');
    if (!navContainer) return;

    const navItems = `
        <nav>
            <ul>
                <li><a href="/app/menu.html" data-page="menu.html" data-section="dashboard-section"><i class="fas fa-home"></i><span>ホーム</span></a></li>
                <li><a href="#" data-page="menu.html" data-section="announcements-section"><i class="fas fa-bullhorn"></i><span>お知らせ</span></a></li>
                <li><a href="#" data-page="menu.html" data-section="payment-section"><i class="fas fa-wallet"></i><span>入金</span></a></li>
                <li><a href="#" data-page="menu.html" data-section="history-section"><i class="fas fa-history"></i><span>履歴</span></a></li>
                <li><a href="#" data-page="menu.html" data-section="settings-section"><i class="fas fa-cog"></i><span>設定</span></a></li>
                ${user.isAdmin ? `<li><a href="/admin/dashboard.html"><i class="fas fa-user-cog"></i><span>管理</span></a></li>` : ''}
            </ul>
        </nav>
    `;
    navContainer.innerHTML = navItems;

    const currentPage = window.location.pathname.split('/').pop();
    
    // Set active state for page-level navigation (Home vs. Meet)
    document.querySelectorAll('.bottom-nav a[href]').forEach(link => {
        if (link.getAttribute('href').includes(currentPage)) {
            link.classList.add('active-page');
        }
    });

    // Add click handlers for section switching within menu.html
    document.querySelectorAll('.bottom-nav a[data-section]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showSection(link.dataset.section);
        });
    });
    
    // Initially activate the dashboard section link if on menu.html
    if(currentPage === 'menu.html'){
        document.querySelector('.bottom-nav a[data-section="dashboard-section"]').classList.add('active');
    }
}

/**
 * Displays a specific content section and hides others.
 * @param {string} sectionId - The ID of the section to show.
 */
function showSection(sectionId) {
    // Hide all main content sections
    document.querySelectorAll('main .content-section').forEach(section => {
        section.style.display = 'none';
    });

    // Show the target section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.style.display = 'block';
    }

    // Update active class on bottom navigation
    document.querySelectorAll('.bottom-nav a[data-section]').forEach(link => {
        link.classList.toggle('active', link.dataset.section === sectionId);
    });

    // Stop QR scanner if it's running and we're leaving the payment section
    if (sectionId !== 'payment-section' && html5QrCode && html5QrCode.isScanning) {
        stopQrScanner();
    }

    // Lazy-load content for sections when they are first shown
    if (sectionId === 'announcements-section' && !document.getElementById('announcements-list').hasChildNodes()) {
        loadAnnouncements();
    }
    if (sectionId === 'history-section' && !document.getElementById('history-list').hasChildNodes()) {
        loadHistory(getLoggedInUser());
    }
}

// ===================================================================================
// ASYNCHRONOUS DATA HANDLING AND FEATURE LOGIC
// ===================================================================================

/**
 * Fetches data and updates the user's dashboard metrics.
 * @param {object} user - The logged-in user object.
 */
async function updateDashboard(user) {
    document.getElementById('dashboard-name').textContent = user.name;
    
    const records = await fetchSheetData();
    const balance = calculateKAFerMoneyBalance(user.kaferId, records);
    const paymentStatus = await calculateUserPaymentStatus(user.kaferId, records);

    document.getElementById('dashboard-kafer-money').textContent = `${balance} KAFer`;
    document.getElementById('outstanding-amount-display').textContent = `${paymentStatus.outstanding} KAFer`;
    document.getElementById('current-money-balance-refund').textContent = `${balance} KAFer`;
}

/**
 * Loads and displays announcements from the spreadsheet.
 */
async function loadAnnouncements() {
    const listElement = document.getElementById('announcements-list');
    listElement.innerHTML = '<p>読み込み中...</p>';
    const records = await fetchSheetData();
    const announcements = records.filter(r => r.type === 'announcement').sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (announcements.length === 0) {
        listElement.innerHTML = '<div class="log-entry"><i class="fas fa-info-circle"></i> お知らせはまだありません。</div>';
        return;
    }

    listElement.innerHTML = ''; // Clear loading message
    announcements.forEach(item => {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `
            <span class="log-date">[${new Date(item.timestamp).toLocaleDateString('ja-JP')}]</span>
            <p class="log-message">${item.message}</p>
        `;
        listElement.appendChild(entry);
    });
}

/**
 * Loads and displays the user's transaction history.
 * @param {object} user - The logged-in user object.
 */
async function loadHistory(user) {
    const listBody = document.getElementById('history-list');
    listBody.innerHTML = '<tr><td colspan="4">読み込み中...</td></tr>';
    const records = await fetchSheetData();
    const userHistory = records
        .filter(r => (r.kaferId === user.kaferId) || (r.type === 'refund_approved' && r.targetKaferId === user.kaferId))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (userHistory.length === 0) {
        listBody.innerHTML = '<tr><td colspan="4">利用履歴はありません。</td></tr>';
        return;
    }
    
    listBody.innerHTML = '';
    for (const record of userHistory) {
        let typeText = 'その他';
        let amountText = '-';
        let detailText = '';

        switch(record.type) {
            case 'payment':
                typeText = '入金';
                amountText = `+${record.amount}`;
                detailText = `コード: ...${record.paymentCode.slice(-4)}`;
                break;
            case 'refund_request':
                typeText = '返金申請';
                amountText = `-${record.requestAmountKaf}`;
                detailText = `申請額: ${kafToYen(record.requestAmountKaf)}円`;
                break;
            case 'refund_approved':
                typeText = '返金完了';
                amountText = ''; // Balance adjustment is implicit
                detailText = `返金額: ${kafToYen(record.refundAmountAfterFeeKaf)}円`;
                break;
        }

        if (typeText !== 'その他') {
             const row = listBody.insertRow();
             row.innerHTML = `
                <td>${new Date(record.timestamp).toLocaleDateString('ja-JP')}</td>
                <td>${typeText}</td>
                <td>${amountText}</td>
                <td>${detailText}</td>
             `;
        }
    }
}

/**
 * Handles the submission of the KAFer money deposit form.
 * @param {Event} e - The form submission event.
 * @param {object} user - The logged-in user object.
 */
async function handlePaymentSubmit(e, user) {
    e.preventDefault();
    hideMessage('message-area');
    const moneyCode = document.getElementById('payment-code').value;

    if (!/^[0-9]{16}$/.test(moneyCode)) {
        showMessage('message-area', '16桁のKAFerマネーコードを入力してください。', 'error');
        return;
    }

    const records = await fetchSheetData();
    const codeRecord = records.find(r => r.type === 'money_code_issue' && r.moneyCode === moneyCode);

    // Validate the code
    if (!codeRecord) {
        showMessage('message-area', 'このKAFerマネーコードは存在しません。', 'error');
        return;
    }
    const isUsed = records.some(r => r.type === 'payment' && r.paymentCode === moneyCode);
    if (isUsed) {
        showMessage('message-area', 'このKAFerマネーコードは既に使用済みです。', 'error');
        return;
    }
     const isVoided = records.some(r => r.type === 'money_code_void' && r.moneyCode === moneyCode);
    if (isVoided) {
        showMessage('message-area', 'このKAFerマネーコードは無効化されています。', 'error');
        return;
    }

    // Process the payment
    const success = await writeToSheet(user.name, user.kaferId, 'payment', { paymentCode: moneyCode, amount: codeRecord.amount });
    if (success) {
        showMessage('message-area', `${codeRecord.amount} KAFerを入金しました。`, 'success');
        document.getElementById('payment-form').reset();
        await updateDashboard(user);
        showSection('dashboard-section');
    } else {
        showMessage('message-area', '入金処理に失敗しました。', 'error');
    }
}

/**
 * Handles the password update form submission.
 */
async function handlePasswordUpdate(e, user) {
    e.preventDefault();
    hideMessage('message-area');
    // Implement password change logic here if needed
    showMessage('message-area', 'この機能は現在開発中です。', 'info');
}

/**
 * Handles the refund request form submission.
 */
async function handleRefundRequest(e, user) {
     e.preventDefault();
    hideMessage('message-area');
    // Implement refund logic here if needed
    showMessage('message-area', 'この機能は現在開発中です。', 'info');
}


// ===================================================================================
// QR CODE SCANNER LOGIC
// ===================================================================================

/**
 * Starts the QR code scanner.
 */
async function startQrScanner() {
    const startBtn = document.getElementById('start-scanner-btn');
    const stopBtn = document.getElementById('stop-scanner-btn');
    
    if (window.location.protocol !== 'https:') {
        showMessage('message-area', 'QRコードスキャナーはHTTPS接続でのみ動作します。', 'error');
        return;
    }
    
    html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 }, supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA] };
    
    try {
        await html5QrCode.start({ facingMode: "environment" }, config, (decodedText) => {
            stopQrScanner();
            try {
                // Try to parse as URL to extract 'code' parameter
                const url = new URL(decodedText);
                const code = url.searchParams.get('code');
                if (code && /^[0-9]{16}$/.test(code)) {
                    document.getElementById('payment-code').value = code;
                    showMessage('message-area', 'QRコードからコードを読み取りました。', 'success');
                } else {
                    document.getElementById('payment-code').value = decodedText;
                }
            } catch (_) {
                // If it's not a URL, just use the decoded text
                document.getElementById('payment-code').value = decodedText;
            }
        });
        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
    } catch (err) {
        showMessage('message-area', `QRスキャナーの起動に失敗しました。カメラのアクセスを許可してください。`, 'error');
        console.error("QR Scanner Error:", err);
    }
}

/**
 * Stops the QR code scanner.
 */
function stopQrScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => {
            document.getElementById('start-scanner-btn').style.display = 'block';
            document.getElementById('stop-scanner-btn').style.display = 'none';
        }).catch(err => console.error("Error stopping scanner:", err));
    }
}