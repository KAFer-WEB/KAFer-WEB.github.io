// Global variable to hold the install prompt event
let deferredPrompt = null;

/**
 * Main entry point, runs when the page content is loaded.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Basic PWA setup
    initializePwaAndDarkMode();
    
    // Check PWA status and handle redirection or message display
    await checkPwaStatusAndRedirect();
    
    // Handle any messages passed via URL parameters (e.g., from a forced logout)
    const urlParams = new URLSearchParams(window.location.search);
    const redirectMessage = urlParams.get('redirect_message');
    if (redirectMessage) {
        handleRedirectMessage(redirectMessage);
    }

    // Set up PWA installation prompt handlers
    setupInstallHandlers();

    // If a 'code' is in the URL, pre-fill the KAFer ID field (useful for QR code scans)
    const initialCode = urlParams.get('code');
    if (initialCode) {
        document.getElementById('login-kaferId').value = initialCode;
    }
    
    // Attach event listeners for forms and UI elements
    setupEventListeners();
});

/**
 * Checks if the app is running in standalone (PWA) mode.
 * If logged in and not in PWA mode, it shows a message instead of redirecting.
 * If not logged in, it proceeds normally.
 */
async function checkPwaStatusAndRedirect() {
    const user = getLoggedInUser();
    const isPwa = window.matchMedia('(display-mode: standalone)').matches;

    if (user) {
        // User is logged in
        if (isPwa) {
            // Logged in and in PWA mode -> redirect to the correct dashboard
            window.location.href = user.isAdmin ? '/admin/dashboard.html' : '/app/menu.html';
        } else {
            // Logged in but NOT in PWA mode -> show message and hide forms
            showMessage('pwa-message-area', 'PWAモードで開いてください。', 'info');
            document.getElementById('pwa-message-area').style.display = 'block';
            document.getElementById('auth-forms-wrapper').style.display = 'none'; // Hide login/register forms
        }
    } else {
        // User is not logged in, no action needed regarding redirection.
        // The checkLoginStatus function will handle PWA enforcement on protected pages.
    }
}

/**
 * Sets up all event listeners for the page.
 */
function setupEventListeners() {
    // Login form submission
    document.getElementById('login-form').addEventListener('submit', handleLogin);

    // Registration form submission
    document.getElementById('register-form').addEventListener('submit', handleRegister);

    // Toggle button for showing/hiding the registration form
    const toggleRegisterBtn = document.getElementById('toggle-register-form-btn');
    toggleRegisterBtn.addEventListener('click', () => {
        const wrapper = document.getElementById('register-form-wrapper');
        const isHidden = wrapper.style.display === 'none' || wrapper.style.display === '';
        wrapper.style.display = isHidden ? 'block' : 'none';
        toggleRegisterBtn.innerHTML = isHidden ? '<i class="fas fa-minus"></i> 閉じる' : '<i class="fas fa-plus"></i> 開く';
    });
}

/**
 * Handles the login form submission.
 * @param {Event} e - The form submission event.
 */
async function handleLogin(e) {
    e.preventDefault();
    hideMessage('message-area');
    const kaferId = document.getElementById('login-kaferId').value;
    const password = document.getElementById('login-password').value;

    if (!kaferId || !password) {
        showMessage('message-area', 'KAFer IDとパスワードを入力してください。', 'error');
        return;
    }
    
    // The actual authentication logic is in global.js
    const loggedInUser = await authenticateUser(kaferId, password);
    
    if (loggedInUser) {
        showMessage('message-area', 'ログイン成功！ページを移動します...', 'success');
        // Redirect after a short delay to allow the user to see the success message
        setTimeout(() => {
            window.location.href = loggedInUser.isAdmin ? '/admin/dashboard.html' : '/app/menu.html';
        }, 1000);
    } else {
        showMessage('message-area', 'KAFer IDまたはパスワードが間違っているか、アカウントが存在しません。', 'error');
    }
}

/**
 * Handles the new user registration form submission.
 * @param {Event} e - The form submission event.
 */
async function handleRegister(e) {
    e.preventDefault();
    hideMessage('message-area');
    const name = document.getElementById('register-name').value;
    const kaferId = document.getElementById('register-kaferId').value;
    const password = document.getElementById('register-password').value;

    if (!name || !kaferId || !password) {
        showMessage('message-area', 'すべての必須フィールドを入力してください。', 'error');
        return;
    }

    // Check if the KAFer ID already exists before attempting to register
    const records = await fetchSheetData();
    if (records.find(r => r.kaferId === kaferId && r.type === 'register')) {
        showMessage('message-area', `このKAFer ID「${kaferId}」は既に使用されています。`, 'error');
        return;
    }
    
    // The logic to write to the sheet is in global.js
    const success = await writeToSheet(name, kaferId, 'register', { pass: password });
    if (success) {
        showMessage('message-area', '新規登録が完了しました！上のフォームからログインしてください。', 'success');
        document.getElementById('register-form').reset();
        document.getElementById('register-form-wrapper').style.display = 'none';
        document.getElementById('toggle-register-form-btn').innerHTML = '<i class="fas fa-plus"></i> 開く';
    } else {
        showMessage('message-area', '登録に失敗しました。時間をおいて再度お試しください。', 'error');
    }
}

/**
 * Displays messages based on URL query parameters.
 * @param {string} messageType - The type of message to display.
 */
function handleRedirectMessage(messageType) {
    switch (messageType) {
        case 'login_required':
            showMessage('message-area', 'このページにアクセスするにはログインが必要です。', 'info');
            break;
        case 'admin_required':
            showMessage('message-area', 'このページへのアクセスには管理者権限が必要です。', 'error');
            break;
        case 'pwa_required':
            showMessage('message-area', 'このサイトはアプリとしてホーム画面に追加してからご利用ください。', 'info');
            break;
        case 'logged_out':
            showMessage('message-area', '正常にログアウトしました。', 'success');
            break;
    }
}

/**
 * Sets up event listeners for the PWA installation flow.
 */
function setupInstallHandlers() {
    const installAppButton = document.getElementById('installAppButton');
    const iosInstallPrompt = document.getElementById('ios-install-prompt');

    // Detect if the device is iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS && !navigator.standalone) {
        iosInstallPrompt.style.display = 'block';
    }

    // Listener for the 'beforeinstallprompt' event (for Android/Desktop)
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        showInstallPromptButton();
    });

    // Listener for the install button click
    installAppButton.addEventListener('click', () => {
        if (!deferredPrompt) return;
        hideInstallPromptButton();
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => {
            deferredPrompt = null;
        });
    });

    // Listener for closing the iOS install prompt
    document.getElementById('close-ios-prompt').addEventListener('click', () => {
        iosInstallPrompt.style.display = 'none';
    });
}