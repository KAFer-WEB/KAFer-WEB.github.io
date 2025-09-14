/**
 * Main entry point for the admin money management page.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Authenticate and authorize the user as an admin.
    const user = await checkLoginStatus(true, true);
    if (!user) return;

    // Setup common admin UI elements.
    initializeAdminUI(user, 'money');

    // Load initial data for the tables.
    await loadIssuedCodes();
    await loadRefundRequests();

    // Check for a URL hash (e.g., #issue) to open a specific tab on page load.
    if (window.location.hash === '#issue') {
        showTabContent('code-management-tab-nav', 'issue-code-tab');
    }

    // --- Event Listeners Setup ---
    
    // Tab navigation
    document.querySelectorAll('#code-management-tab-nav .tab-button').forEach(button => {
        button.addEventListener('click', (e) => {
            showTabContent('code-management-tab-nav', e.currentTarget.dataset.target);
        });
    });

    // Form submissions
    document.getElementById('issue-code-form').addEventListener('submit', (e) => handleIssueCodeSubmit(e, user));
    document.getElementById('void-code-form').addEventListener('submit', (e) => handleVoidCodeSubmit(e, user));

    // Event delegation for approve refund buttons
    document.getElementById('refund-requests-list').addEventListener('click', (e) => handleApproveRefundClick(e, user));
});

/**
 * Fetches and displays the list of all issued KAFer Money codes.
 */
async function loadIssuedCodes() {
    const listBody = document.getElementById('issued-codes-list');
    listBody.innerHTML = '<tr><td colspan="6">発行済みコードを読み込み中...</td></tr>';
    const records = await fetchSheetData(true);
    
    const issuedCodes = records.filter(r => r.type === 'money_code_issue')
                               .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (issuedCodes.length === 0) {
        listBody.innerHTML = '<tr><td colspan="6">発行済みのKAFerマネーコードはありません。</td></tr>';
        return;
    }

    listBody.innerHTML = ''; // Clear loading message
    for (const codeRecord of issuedCodes) {
        const row = listBody.insertRow();
        let statusText = '';
        let statusColor = '';
        let userText = '未利用';

        const usedByPayment = records.find(r => r.type === 'payment' && r.paymentCode === codeRecord.moneyCode);
        const isVoided = records.some(r => r.type === 'money_code_void' && r.moneyCode === codeRecord.moneyCode);

        if (usedByPayment) {
            statusText = '使用済み';
            statusColor = 'var(--medium-grey)';
            userText = `${usedByPayment.name} (${usedByPayment.kaferId})`;
        } else if (isVoided) {
            statusText = '無効';
            statusColor = 'var(--error-color)';
            userText = 'N/A';
        } else {
            statusText = '有効';
            statusColor = 'var(--success-color)';
        }

        row.innerHTML = `
            <td>${codeRecord.moneyCode}</td>
            <td>${codeRecord.amount || 0} KAFer</td>
            <td>${codeRecord.amountYen || 0}円</td>
            <td>${new Date(codeRecord.timestamp).toLocaleDateString('ja-JP')}</td>
            <td style="color: ${statusColor}; font-weight: bold;">${statusText}</td>
            <td>${userText}</td>
        `;
    }
}

/**
 * Fetches and displays the list of pending refund requests.
 */
async function loadRefundRequests() {
    const listBody = document.getElementById('refund-requests-list');
    listBody.innerHTML = '<tr><td colspan="7">返金申請を読み込み中...</td></tr>';
    const records = await fetchSheetData(true);

    const pendingRequests = records.filter(r => 
        r.type === 'refund_request' && 
        !records.some(approved => approved.type === 'refund_approved' && approved.refundCode === r.refundCode)
    ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (pendingRequests.length === 0) {
        listBody.innerHTML = '<tr><td colspan="7">未承認の返金申請はありません。</td></tr>';
        return;
    }

    listBody.innerHTML = '';
    for (const request of pendingRequests) {
        const requestingUser = records.find(r => r.kaferId === request.kaferId && r.type === 'register');
        const requesterName = requestingUser ? requestingUser.name : '不明なユーザー';

        const row = listBody.insertRow();
        row.innerHTML = `
            <td>${new Date(request.timestamp).toLocaleDateString('ja-JP')}</td>
            <td>${request.kaferId}</td>
            <td>${requesterName}</td>
            <td>${request.requestAmountKaf} KAFer (${kafToYen(request.requestAmountKaf)}円)</td>
            <td>${request.refundAmountAfterFeeKaf} KAFer (${kafToYen(request.refundAmountAfterFeeKaf)}円)</td>
            <td>${request.refundCode}</td>
            <td>
                <button class="btn btn-secondary btn-sm approve-refund-btn"
                        data-refund-code="${request.refundCode}"
                        data-kafer-id="${request.kaferId}"
                        data-request-amount-kaf="${request.requestAmountKaf}"
                        data-refund-amount-after-fee-kaf="${request.refundAmountAfterFeeKaf}"
                        data-requester-name="${requesterName}">
                    <i class="fas fa-check"></i> 承認
                </button>
            </td>
        `;
    }
}

/**
 * Handles the submission of the "Issue Code" form.
 */
async function handleIssueCodeSubmit(e, user) {
    e.preventDefault();
    hideMessage('message-area');
    document.getElementById('qrcode-container').style.display = 'none';

    const newMoneyCode = document.getElementById('new-money-code').value;
    const codeAmountYen = parseInt(document.getElementById('code-amount-yen').value, 10);

    if (!/^[0-9]{16}$/.test(newMoneyCode)) {
        showMessage('message-area', '16桁の数字でKAFerマネーコードを入力してください。', 'error');
        return;
    }

    const records = await fetchSheetData(true);
    if (records.some(r => r.type === 'money_code_issue' && r.moneyCode === newMoneyCode)) {
        showMessage('message-area', 'このKAFerマネーコードは既に発行済みです。', 'error');
        return;
    }

    const codeAmountKaf = yenToKaf(codeAmountYen);
    const success = await writeToSheet(user.name, user.kaferId, 'money_code_issue', { 
        moneyCode: newMoneyCode, 
        amount: codeAmountKaf, 
        amountYen: codeAmountYen, 
        status: 'active' 
    });

    if (success) {
        showMessage('message-area', `KAFerマネーコード (${codeAmountYen}円相当) を発行しました。`, 'success');
        document.getElementById('issue-code-form').reset();
        
        // Generate and show QR Code
        const qrText = `${PROJECT_CONFIG.SITE_URL}/?code=${newMoneyCode}`;
        new QRious({ element: document.getElementById('qrcode-canvas'), size: 200, value: qrText });
        document.getElementById('qrcode-text').textContent = newMoneyCode;
        document.getElementById('qrcode-container').style.display = 'flex';
        
        await loadIssuedCodes();
    } else {
        showMessage('message-area', 'KAFerマネーコードの発行に失敗しました。', 'error');
    }
}

/**
 * Handles the submission of the "Void Code" form.
 */
async function handleVoidCodeSubmit(e, user) {
    e.preventDefault();
    hideMessage('message-area');
    const voidMoneyCode = document.getElementById('void-money-code').value;

    if (!/^[0-9]{16}$/.test(voidMoneyCode)) {
        showMessage('message-area', '16桁のKAFerマネーコードを入力してください。', 'error');
        return;
    }

    const records = await fetchSheetData(true);
    const targetCode = records.find(r => r.type === 'money_code_issue' && r.moneyCode === voidMoneyCode);

    if (!targetCode) {
        showMessage('message-area', '指定されたKAFerマネーコードは見つかりませんでした。', 'error');
        return;
    }
    if (records.some(r => r.type === 'payment' && r.paymentCode === voidMoneyCode)) {
        showMessage('message-area', 'このコードは既に使用されているため、無効化できません。', 'error');
        return;
    }
    if (records.some(r => r.type === 'money_code_void' && r.moneyCode === voidMoneyCode)) {
        showMessage('message-area', 'このコードは既に無効化されています。', 'error');
        return;
    }

    if (confirm(`KAFerマネーコード「${voidMoneyCode}」を本当に無効化しますか？この操作は取り消せません。`)) {
        const success = await writeToSheet(user.name, user.kaferId, 'money_code_void', { moneyCode: voidMoneyCode });
        if (success) {
            showMessage('message-area', `KAFerマネーコードを無効化しました。`, 'success');
            document.getElementById('void-code-form').reset();
            await loadIssuedCodes();
        } else {
            showMessage('message-area', 'コードの無効化に失敗しました。', 'error');
        }
    }
}

/**
 * Handles the click on an "Approve Refund" button.
 */
async function handleApproveRefundClick(e, user) {
    if (!e.target.classList.contains('approve-refund-btn')) return;

    const btn = e.target;
    const { refundCode, kaferId, requestAmountKaf, refundAmountAfterFeeKaf, requesterName } = btn.dataset;
    
    const confirmationMessage = `${requesterName} (ID: ${kaferId}) の返金申請（返金額: ${kafToYen(parseInt(refundAmountAfterFeeKaf, 10))}円）を承認しますか？`;

    if (confirm(confirmationMessage)) {
        const success = await writeToSheet(user.name, user.kaferId, 'refund_approved', { 
            targetKaferId: kaferId, 
            refundCode: refundCode, 
            requestAmountKaf: parseInt(requestAmountKaf, 10), 
            refundAmountAfterFeeKaf: parseInt(refundAmountAfterFeeKaf, 10)
        });

        if (success) {
            showMessage('message-area', `KAFer ID: ${kaferId} への返金申請を承認しました。`, 'success');
            await loadRefundRequests();
        } else {
            showMessage('message-area', '返金承認処理に失敗しました。', 'error');
        }
    }
}

/**
 * Generates a random 16-digit string for a new money code.
 * This function is intended to be called from an `onclick` attribute in the HTML.
 */
function generateRandomMoneyCode() {
    let code = '';
    for (let i = 0; i < 16; i++) {
        code += Math.floor(Math.random() * 10);
    }
    document.getElementById('new-money-code').value = code;
}