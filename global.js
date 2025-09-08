// global.js (v2.0 Final Revolution - Hotfix)

// --- システム設定値 ---
const SPREADSHEET_ID = '1lfDRRlo6aYsjW5rEj3ZoL-bpO0ZG2PiLzZVu4A0Ypdg';
const SHEET_NAME = 'v1.0';
const OPENSHEET_URL = `https://opensheet.elk.sh/${SPREADSHEET_ID}/${SHEET_NAME}`;
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScPv4SVheBCYy1yu8iDPQs5MlJjRkhltnDN6KN2df5NJJ42NA/formResponse';
const ENTRY_MAP = {
    name: 'entry.960395623',
    id: 'entry.58581214',
    type: 'entry.1943034586',
    data: 'entry.1922513785'
};
const paymentRates = {
    1: 990, 2: 500, 3: 330, 4: 250, 5: 200,
    6: 170, 7: 150, 8: 130, 9: 110, 10: 100
};

// --- ログイン状態管理 ---
function setLoggedInInfo(id, name, version) {
    localStorage.setItem('loggedInKAFerID', id);
    localStorage.setItem('loggedInUserName', name);
    localStorage.setItem('userVersion', version);
}
function getLoggedInKAFerID() { return localStorage.getItem('loggedInKAFerID'); }
function getLoggedInUserName() { return localStorage.getItem('loggedInUserName'); }
function getUserVersion() { return localStorage.getItem('userVersion'); }
function setAdminSession() { sessionStorage.setItem('isAdmin', 'true'); }
function isAdmin() { return sessionStorage.getItem('isAdmin') === 'true'; }
function logout() {
    localStorage.clear();
    sessionStorage.clear();
}

// --- API通信 ---
async function fetchKAFerData() {
    try {
        const response = await fetch(`${OPENSHEET_URL}?_=${new Date().getTime()}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("データ取得エラー:", error);
        return [];
    }
}
async function postToGoogleForm(formData) {
    try {
        await fetch(FORM_URL, { method: 'POST', body: formData, mode: 'no-cors' });
        return { success: true };
    } catch (error) {
        console.error("フォーム送信エラー:", error);
        return { success: false };
    }
}

// --- データ反映確認 (ポーリング) ---
function pollForData(validationFn, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const interval = 2000;
        let elapsedTime = 0;
        const poller = setInterval(async () => {
            try {
                const data = await fetchKAFerData();
                if (validationFn(data)) {
                    clearInterval(poller);
                    resolve(true);
                }
            } catch (e) {
                console.error("ポーリング中にエラー:", e);
            }
            elapsedTime += interval;
            if (elapsedTime >= timeout) {
                clearInterval(poller);
                reject(new Error("タイムアウト: データの反映を確認できませんでした。"));
            }
        }, interval);
    });
}

// --- UI ヘルパー ---
function showMessage(element, msg, type) { element.textContent = msg; element.className = `message ${type}`; element.classList.remove('hidden'); }
function hideMessage(element) { element.classList.add('hidden'); }

// ★★★ 改善版: カスタムモーダル (v1, v2両対応) ★★★
function showModal(title, messageOrHtml, buttons = [{ text: 'OK', action: hideModal }]) {
    let modal = document.getElementById('customModal');
    if (!modal) { // モーダルがなければ作成 (v1ページ用)
        modal = document.createElement('div');
        modal.id = 'customModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `<div class="modal-content" style="background:white;padding:30px;border-radius:10px;text-align:center;max-width:400px;">
            <h2 id="modalTitle"></h2>
            <div id="modalMessageContainer"></div>
            <div id="modalButtons" style="display:flex;justify-content:center;gap:10px;margin-top:20px;"></div>
        </div>`;
        document.body.appendChild(modal);
    }
    document.getElementById('modalTitle').textContent = title;
    const messageContainer = document.getElementById('modalMessageContainer');
    messageContainer.innerHTML = messageOrHtml; // 常にHTMLとして解釈

    const buttonsContainer = document.getElementById('modalButtons');
    buttonsContainer.innerHTML = '';
    buttons.forEach(btnInfo => {
        const button = document.createElement('button');
        button.textContent = btnInfo.text;
        // v1とv2でボタンのクラス名が違うため、存在すれば設定
        if (btnInfo.class) button.className = btnInfo.class; 
        button.onclick = btnInfo.action;
        buttonsContainer.appendChild(button);
    });
    modal.classList.add('visible');
}
function hideModal() {
    const modal = document.getElementById('customModal');
    if (modal) modal.classList.remove('visible');
}

function showNotification(message, type = 'success') {
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        document.body.appendChild(container);
    }
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    container.appendChild(notification);
    setTimeout(() => {
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => { if(container.contains(notification)) container.removeChild(notification) }, 500);
        }, 4000);
    }, 10);
}

// --- 計算ロジック ---
function getMonthYear(date) { return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`; }

function getActiveUsers(allData, date = new Date()) {
    const userStatus = {};
    allData.forEach(row => {
        if (row.e === 'register' && row.F) userStatus[row.F] = { registerDate: new Date(row.K) };
        else if (row.e === 'remove' && row.F && userStatus[row.F]) userStatus[row.F].removeDate = new Date(row.K);
    });
    return Object.keys(userStatus).filter(id => {
        const user = userStatus[id];
        return user.registerDate <= date && (!user.removeDate || user.removeDate > date);
    });
}

function calculateBilling(memberCount) {
    if (memberCount <= 0) return 990;
    if (paymentRates[memberCount]) return paymentRates[memberCount];
    return Math.ceil((1000 / memberCount) / 10) * 10;
}
