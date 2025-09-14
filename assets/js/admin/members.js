/**
 * Main entry point for the admin members management page.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Authenticate and authorize the user as an admin.
    const user = await checkLoginStatus(true, true);
    if (!user) return;

    // Setup common admin UI elements.
    initializeAdminUI(user, 'members');

    // Load the initial list of members.
    await loadMembers();

    // Check for a URL hash (e.g., #register) to open a specific tab on page load.
    if (window.location.hash === '#register') {
        showTabContent('member-management-tab-nav', 'admin-register-tab');
    }

    // --- Event Listeners Setup ---
    
    // Tab navigation
    document.querySelectorAll('#member-management-tab-nav .tab-button').forEach(button => {
        button.addEventListener('click', (e) => {
            showTabContent('member-management-tab-nav', e.currentTarget.dataset.target);
        });
    });

    // Form submissions
    document.getElementById('admin-register-form').addEventListener('submit', (e) => handleAdminRegisterSubmit(e, user));
    document.getElementById('user-modify-form').addEventListener('submit', (e) => handleUserModifySubmit(e, user));
    document.getElementById('remove-member-form').addEventListener('submit', (e) => handleRemoveMemberSubmit(e, user));
});

/**
 * Fetches and displays the list of all active members.
 * This function has been revised to correctly handle name updates and removals.
 */
async function loadMembers() {
    const memberListBody = document.getElementById('member-list');
    memberListBody.innerHTML = '<tr><td colspan="5">会員リストを読み込み中...</td></tr>';

    const records = await fetchSheetData(true);
    
    // Create a set of removed user IDs for efficient lookup.
    const removedUserIds = new Set(
        records.filter(r => r.type === 'remove').map(r => r.targetKaferId)
    );

    // Get the latest registration and name update records for each user.
    const memberData = {};
    records.forEach(r => {
        if (r.type === 'register') {
            const kaferId = r.kaferId;
            if (!removedUserIds.has(kaferId)) {
                if (!memberData[kaferId] || new Date(r.timestamp) > new Date(memberData[kaferId].timestamp)) {
                    memberData[kaferId] = { ...r };
                }
            }
        } else if (r.type === 'name_update') {
            const kaferId = r.targetKaferId;
            if (memberData[kaferId] && new Date(r.timestamp) > new Date(memberData[kaferId].timestamp)) {
                memberData[kaferId].name = r.newName;
                memberData[kaferId].timestamp = r.timestamp; // Update timestamp to reflect latest change
            }
        }
    });

    // Convert the processed member data object to an array and sort by KAFer ID.
    const members = Object.values(memberData).sort((a, b) => a.kaferId.localeCompare(b.kaferId));

    if (members.length === 0) {
        memberListBody.innerHTML = '<tr><td colspan="5">登録されているアクティブな会員がいません。</td></tr>';
        return;
    }

    memberListBody.innerHTML = ''; // Clear loading message
    for (const member of members) {
        const row = memberListBody.insertRow();
        const balance = calculateKAFerMoneyBalance(member.kaferId, records);
        const paymentStatus = await calculateUserPaymentStatus(member.kaferId, records);
        
        let statusText, statusColor;
        if (paymentStatus.outstanding <= 0) {
            statusText = '支払い済み';
            statusColor = 'var(--success-color)';
        } else {
            statusText = `未払い (${paymentStatus.outstanding} KAFer不足)`;
            statusColor = 'var(--error-color)';
        }

        row.innerHTML = `
            <td>${member.kaferId}</td>
            <td>${member.name}</td>
            <td>${new Date(member.timestamp).toLocaleDateString('ja-JP')}</td>
            <td>${balance} KAFer (${kafToYen(balance)}円)</td>
            <td style="color: ${statusColor}; font-weight: bold;">${statusText}</td>
        `;
    }
}

/**
 * Handles the submission of the admin new member registration form.
 */
async function handleAdminRegisterSubmit(e, user) {
    e.preventDefault();
    hideMessage('message-area');
    
    const name = document.getElementById('admin-register-name').value;
    const kaferId = document.getElementById('admin-register-kaferId').value;
    const password = document.getElementById('admin-register-password').value;

    if (!name || !kaferId || !password) {
        showMessage('message-area', 'すべての必須フィールドを入力してください。', 'error');
        return;
    }

    const records = await fetchSheetData(true);
    if (records.some(r => r.kaferId === kaferId && r.type === 'register')) {
        showMessage('message-area', `KAFer ID「${kaferId}」は既に使用されています。`, 'error');
        return;
    }
    
    const success = await writeToSheet(name, kaferId, 'register', { pass: password });
    if (success) {
        showMessage('message-area', `新規会員「${name}」(ID: ${kaferId}) を登録しました。`, 'success');
        document.getElementById('admin-register-form').reset();
        await loadMembers(); // Refresh the list
    } else {
        showMessage('message-area', '会員登録に失敗しました。', 'error');
    }
}

/**
 * Handles the submission of the username modification form.
 */
async function handleUserModifySubmit(e, user) {
    e.preventDefault();
    hideMessage('message-area');

    const modifyKaferId = document.getElementById('modify-kaferId').value;
    const newUsername = document.getElementById('new-username').value;

    if (!modifyKaferId || !newUsername) {
        showMessage('message-area', 'すべてのフィールドを入力してください。', 'error');
        return;
    }

    const records = await fetchSheetData(true);
    const targetUser = records.find(r => r.kaferId === modifyKaferId && r.type === 'register');
    const isRemoved = records.some(r => r.type === 'remove' && r.targetKaferId === modifyKaferId);

    if (!targetUser || isRemoved) {
        showMessage('message-area', '指定されたKAFer IDの会員は見つからないか、既に削除されています。', 'error');
        return;
    }
    
    if (confirm(`会員「${targetUser.name}」のユーザー名を「${newUsername}」に変更しますか？`)) {
        const success = await writeToSheet(user.name, user.kaferId, 'name_update', { 
            targetKaferId: modifyKaferId, 
            newName: newUsername 
        });
        if (success) {
            showMessage('message-area', `ID: ${modifyKaferId} のユーザー名を変更しました。`, 'success');
            document.getElementById('user-modify-form').reset();
            await loadMembers();
        } else {
            showMessage('message-area', 'ユーザー名の変更に失敗しました。', 'error');
        }
    }
}

/**
 * Handles the submission of the remove member form.
 */
async function handleRemoveMemberSubmit(e, user) {
    e.preventDefault();
    hideMessage('message-area');

    const removeKaferId = document.getElementById('remove-kaferId').value;
    const removeReason = document.getElementById('remove-reason').value;

    if (!removeKaferId) {
        showMessage('message-area', '削除対象のKAFer IDを入力してください。', 'error');
        return;
    }

    const records = await fetchSheetData(true);
    const targetUser = records.find(r => r.kaferId === removeKaferId && r.type === 'register');
    const isAlreadyRemoved = records.some(r => r.type === 'remove' && r.targetKaferId === removeKaferId);

    if (!targetUser) {
        showMessage('message-area', '指定されたKAFer IDの会員は見つかりませんでした。', 'error');
        return;
    }
    if (isAlreadyRemoved) {
        showMessage('message-area', 'この会員は既に削除されています。', 'info');
        return;
    }

    if (confirm(`会員「${targetUser.name}」(ID: ${removeKaferId}) を本当に強制削除しますか？\nこの操作は取り消せません。`)) {
        const success = await writeToSheet(user.name, user.kaferId, 'remove', { 
            targetKaferId: removeKaferId, 
            reason: removeReason 
        });
        if (success) {
            showMessage('message-area', `ID: ${removeKaferId} の会員を削除しました。`, 'success');
            document.getElementById('remove-member-form').reset();
            await loadMembers();
        } else {
            showMessage('message-area', '会員の強制削除に失敗しました。', 'error');
        }
    }
}