/**
 * Main entry point for the admin dashboard page.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Authenticate and authorize the user as an admin.
    const user = await checkLoginStatus(true, true);
    if (!user) return;

    // Setup common admin UI elements.
    initializeAdminUI(user, 'dashboard');

    // Load initial data for the dashboard metrics and announcements.
    await updateAdminDashboard();
    await loadLatestAnnouncements();

    // Attach event listener for the announcement form submission.
    document.getElementById('announcement-form').addEventListener('submit', (e) => handleAnnouncementSubmit(e, user));
});

/**
 * Fetches data and updates all the metric cards on the admin dashboard.
 */
async function updateAdminDashboard() {
    const records = await fetchSheetData(true); // Fetch as admin

    // --- Metric 1: Total Members ---
    const removedUserIds = new Set(records.filter(r => r.type === 'remove').map(r => r.targetKaferId));
    const activeMembers = records.filter(r => r.type === 'register' && !removedUserIds.has(r.kaferId));
    document.getElementById('total-members').textContent = activeMembers.length;

    // --- Metric 2: Monthly Fee (Placeholder) ---
    // This requires a more complex calculation based on monthly billing logic.
    // For now, we'll use a placeholder value.
    const currentMonthlyTotalDue = await calculateCurrentMonthlyFee(records); // Assuming this function exists and is accurate
    document.getElementById('monthly-due').textContent = `${currentMonthlyTotalDue} KAFer`;

    // --- Metric 3: Active Money Codes ---
    const issuedCodes = records.filter(r => r.type === 'money_code_issue');
    const usedOrVoidedCodes = new Set([
        ...records.filter(r => r.type === 'payment').map(r => r.paymentCode),
        ...records.filter(r => r.type === 'money_code_void').map(r => r.moneyCode)
    ]);
    const activeMoneyCodes = issuedCodes.filter(code => !usedOrVoidedCodes.has(code.moneyCode));
    document.getElementById('active-money-codes').textContent = activeMoneyCodes.length;

    // --- System Status: Emergency Lockdown ---
    const systemConfig = await getSystemConfig(records);
    const statusElement = document.getElementById('emergency-lockdown-status');
    if (systemConfig.emergency_lockdown) {
        statusElement.textContent = '有効';
        statusElement.style.color = 'var(--error-color)';
    } else {
        statusElement.textContent = '無効';
        statusElement.style.color = 'var(--success-color)';
    }
}

/**
 * Fetches and displays the 5 most recent announcements.
 */
async function loadLatestAnnouncements() {
    const announcementsDiv = document.getElementById('latest-announcements');
    announcementsDiv.innerHTML = '<div class="log-entry">お知らせを読み込み中...</div>';
    
    const records = await fetchSheetData(true);
    const announcements = records.filter(r => r.type === 'announcement')
                                 .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (announcements.length === 0) {
        announcementsDiv.innerHTML = '<div class="log-entry"><i class="fas fa-info-circle"></i> 投稿されたお知らせはありません。</div>';
        return;
    }

    announcementsDiv.innerHTML = ''; // Clear loading message
    announcements.slice(0, 5).forEach(announcement => {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `
            <i class="fas fa-bullhorn"></i> 
            <span class="log-date">[${new Date(announcement.timestamp).toLocaleDateString('ja-JP')}]</span> 
            <span class="log-message">${announcement.message}</span>`;
        announcementsDiv.appendChild(entry);
    });
}

/**
 * Handles the submission of the new announcement form.
 * @param {Event} e - The form submission event.
 * @param {object} user - The logged-in admin user object.
 */
async function handleAnnouncementSubmit(e, user) {
    e.preventDefault();
    hideMessage('message-area');
    const messageInput = document.getElementById('announcement-message');
    const message = messageInput.value.trim();

    if (!message) {
        showMessage('message-area', 'お知らせ内容を入力してください。', 'error');
        return;
    }

    const success = await writeToSheet(user.name, user.kaferId, 'announcement', { message });
    if (success) {
        showMessage('message-area', 'お知らせを投稿しました。', 'success');
        messageInput.value = ''; // Clear the textarea
        await loadLatestAnnouncements(); // Refresh the list
    } else {
        showMessage('message-area', 'お知らせの投稿に失敗しました。', 'error');
    }
}

/**
 * Handles the click event for toggling emergency lockdown mode.
 * This function is called from the onclick attribute in the HTML.
 * It is a wrapper for the more detailed function in settings.js,
 * kept here for convenience on the dashboard.
 */
async function handleDashboardToggleEmergencyLockdown() {
    const user = getLoggedInUser();
    if (!user || !user.isAdmin) {
        showMessage('message-area', '管理者権限がありません。', 'error');
        return;
    }

    hideMessage('message-area');
    const records = await fetchSheetData(true);
    const currentSystemConfig = await getSystemConfig(records);
    const newLockdownStatus = !currentSystemConfig.emergency_lockdown;
    
    const actionText = newLockdownStatus ? '有効' : '無効';
    if (!confirm(`緊急情報保護モードを「${actionText}」に切り替えますか？`)) {
        return;
    }
    
    const success = await writeToSheet(user.name, user.kaferId, 'system_config', { emergency_lockdown: newLockdownStatus });
    if (success) {
        showMessage('message-area', `緊急情報保護モードを${actionText}にしました。`, 'success');
        await updateAdminDashboard(); // Refresh the dashboard status display
    } else {
        showMessage('message-area', 'モードの切り替えに失敗しました。', 'error');
    }
}