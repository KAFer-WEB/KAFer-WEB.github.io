/**
 * Main entry point for the admin settings page.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Authenticate and authorize the user as an admin.
    const user = await checkLoginStatus(true, true);
    if (!user) return;

    // Setup common admin UI elements like header and navigation.
    initializeAdminUI(user, 'settings');

    // Load initial data for both tabs.
    await loadSiteConfig();
    await loadActivityLogs();

    // Attach event listeners for tab navigation.
    document.querySelectorAll('#settings-tab-nav .tab-button').forEach(button => {
        button.addEventListener('click', (e) => {
            showTabContent('settings-tab-nav', e.currentTarget.dataset.target);
        });
    });

    // Attach event listener for the configuration form submission.
    document.getElementById('config-form').addEventListener('submit', (e) => handleConfigFormSubmit(e, user));
});

/**
 * Loads the latest site configuration and lockdown status from the spreadsheet.
 */
async function loadSiteConfig() {
    const records = await fetchSheetData(true); // Fetch as admin
    const statusElement = document.getElementById('site-setting-emergency-lockdown-status');
    
    // --- Load General Config ---
    const configRecords = records.filter(r => r.type === 'config');
    let currentConfig = { 
        email: '', 
        base_monthly_fee_yen: PROJECT_CONFIG.DEFAULT_SYSTEM_CONFIG.base_monthly_fee_yen 
    };
    if (configRecords.length > 0) {
        // Find the most recent config entry
        const latestConfig = configRecords.reduce((prev, current) => 
            new Date(prev.timestamp) > new Date(current.timestamp) ? prev : current
        );
        Object.assign(currentConfig, latestConfig);
    }
    document.getElementById('admin-email').value = currentConfig.email;
    document.getElementById('base-monthly-fee-input').value = currentConfig.base_monthly_fee_yen;

    // --- Load System Config (Emergency Lockdown) ---
    const systemConfig = await getSystemConfig(records);
    if (systemConfig.emergency_lockdown) {
        statusElement.textContent = '有効';
        statusElement.style.color = 'var(--error-color)';
    } else {
        statusElement.textContent = '無効';
        statusElement.style.color = 'var(--success-color)';
    }
}

/**
 * Handles the submission of the site configuration form.
 * @param {Event} e - The form submission event.
 * @param {object} user - The logged-in admin user object.
 */
async function handleConfigFormSubmit(e, user) {
    e.preventDefault();
    hideMessage('message-area');
    
    const adminEmail = document.getElementById('admin-email').value;
    const adminPanelPassword = document.getElementById('admin-panel-password').value;
    const baseMonthlyFeeYen = parseInt(document.getElementById('base-monthly-fee-input').value, 10);

    if (!adminEmail) {
        showMessage('message-area', '管理者Eメールを入力してください。', 'error');
        return;
    }
    if (!adminPanelPassword) {
        showMessage('message-area', '新しい管理者パスワードを入力してください。', 'error');
        return;
    }

    // Confirmation dialog
    if (!confirm('設定と管理者パスワードを更新します。よろしいですか？\n更新後、自動的にログアウトされます。')) {
        return;
    }

    // Write both config and password update records
    const configSuccess = await writeToSheet(user.name, user.kaferId, 'config', { 
        email: adminEmail, 
        base_monthly_fee_yen: baseMonthlyFeeYen 
    });
    const passUpdateSuccess = await writeToSheet(user.name, user.kaferId, 'pass_update', { 
        targetKaferId: PROJECT_CONFIG.ADMIN_ID, 
        pass: adminPanelPassword 
    });

    if (configSuccess && passUpdateSuccess) {
        showMessage('message-area', 'サイト設定と管理者パスワードが更新されました。2秒後にログアウトします。', 'success');
        setTimeout(logoutUser, 2000);
    } else {
        showMessage('message-area', '設定の保存に失敗しました。片方または両方の書き込みに失敗した可能性があります。', 'error');
    }
}

/**
 * Handles the click event for enabling/disabling emergency lockdown mode.
 * This function is called from the onclick attribute in the HTML.
 * @param {boolean} activate - True to activate lockdown, false to deactivate.
 */
async function handleToggleEmergencyLockdown(activate) {
    const user = getLoggedInUser();
    if (!user || !user.isAdmin) {
        showMessage('message-area', 'この操作を実行する権限がありません。', 'error');
        return;
    }
    
    const actionText = activate ? '有効' : '無効';
    if (!confirm(`本当に緊急情報保護モードを「${actionText}」にしますか？`)) {
        return;
    }

    hideMessage('message-area');
    const success = await writeToSheet(user.name, user.kaferId, 'system_config', { emergency_lockdown: activate });

    if (success) {
        showMessage('message-area', `緊急情報保護モードを${actionText}にしました。`, 'success');
        // Reload the config section to reflect the change
        await loadSiteConfig();
    } else {
        showMessage('message-area', '緊急情報保護モードの切り替えに失敗しました。', 'error');
    }
}

/**
 * Fetches all records and displays them as a chronological activity log.
 */
async function loadActivityLogs() {
    const logEntriesDiv = document.getElementById('log-entries');
    logEntriesDiv.innerHTML = '<div class="log-entry">ログを読み込み中...</div>';

    const records = await fetchSheetData(true);
    // Sort by timestamp, newest first
    records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (records.length === 0) {
        logEntriesDiv.innerHTML = '<div class="log-entry"><i class="fas fa-info-circle"></i> アクティビティログはありません。</div>';
        return;
    }

    logEntriesDiv.innerHTML = ''; // Clear loading message
    records.forEach(record => {
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        const timestamp = new Date(record.timestamp).toLocaleString('ja-JP');
        const performedBy = record.name ? ` by ${record.name} (${record.kaferId})` : '';
        let logText = '';

        switch(record.type) {
            case 'register': logText = `新会員登録: ${record.name} (${record.kaferId})`; break;
            case 'payment': logText = `入金${performedBy}: ${record.amount} KAFer`; break;
            case 'remove': logText = `会員削除${performedBy}: 対象ID ${record.targetKaferId}`; break;
            case 'name_update': logText = `ユーザー名変更${performedBy}: 対象ID ${record.targetKaferId} -> ${record.newName}`; break;
            case 'money_code_issue': logText = `コード発行${performedBy}: ...${record.moneyCode.slice(-4)} (${record.amountYen}円)`; break;
            case 'money_code_void': logText = `コード無効化${performedBy}: ...${record.moneyCode.slice(-4)}`; break;
            case 'pass_update': logText = `パスワード変更${performedBy}: 対象ID ${record.targetKaferId}`; break;
            case 'config': logText = `サイト設定更新${performedBy}`; break;
            case 'system_config': logText = `システム設定更新${performedBy}: 緊急モード -> ${record.emergency_lockdown ? '有効' : '無効'}`; break;
            case 'announcement': logText = `お知らせ投稿${performedBy}: "${record.message.substring(0, 20)}..."`; break;
            case 'refund_request': logText = `返金申請${performedBy}: ${record.requestAmountKaf} KAFer`; break;
            case 'refund_approved': logText = `返金承認${performedBy}: 対象ID ${record.targetKaferId}`; break;
            default: logText = `未知のアクティビティ: ${record.type}`;
        }
        
        logEntry.innerHTML = `<span class="log-date">[${timestamp}]</span> <span class="log-message">${logText}</span>`;
        logEntriesDiv.appendChild(logEntry);
    });
}