// global.js

// --- システム設定値 ---
// これらの値は、あなたの環境に合わせて変更される可能性があります。

// GoogleスプレッドシートのID（URLから取得）
const SPREADSHEET_ID = '1lfDRRlo6aYsjW5rEj3ZoL-bpO0ZG2PiLzZVu4A0Ypdg';
// データを保存するシートの名前
const SHEET_NAME = 'v1.0';
// Opensheet APIのエンドポイントURL
const OPENSHEET_URL = `https://opensheet.elk.sh/${SPREADSHEET_ID}/${SHEET_NAME}`;
// 書き込みに使用するGoogleフォームのURL
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScPv4SVheBCYy1yu8iDPQs5MlJjRkhltnDN6KN2df5NJJ42NA/formResponse';
// Googleフォームの各入力欄に対応するエントリーID
const ENTRY_MAP = {
    name: 'entry.960395623',
    id: 'entry.58581214',
    type: 'entry.1943034586',
    data: 'entry.1922513785'
};
// 会員数に応じた料金表
const paymentRates = {
    1: 990, 2: 500, 3: 330, 4: 250, 5: 200,
    6: 170, 7: 150, 8: 130, 9: 110, 10: 100
};


// --- ログイン状態管理関数 ---

/**
 * ログイン情報をブラウザに保存する
 * @param {string} id - KAFerID
 * @param {string} name - ユーザー名
 */
function setLoggedInInfo(id, name) {
    localStorage.setItem('loggedInKAFerID', id);
    localStorage.setItem('loggedInUserName', name);
}

function getLoggedInKAFerID() { return localStorage.getItem('loggedInKAFerID'); }
function getLoggedInUserName() { return localStorage.getItem('loggedInUserName'); }

/**
 * 管理者セッションを設定する（ページを閉じると消える）
 */
function setAdminSession() {
    sessionStorage.setItem('isAdmin', 'true');
}

function isAdmin() { return sessionStorage.getItem('isAdmin') === 'true'; }

/**
 * すべてのログイン情報を削除してログアウトする
 */
function logout() {
    localStorage.clear();
    sessionStorage.clear();
}


// --- API通信関数 ---

/**
 * Opensheet APIから最新のデータを取得する
 * @returns {Promise<Array>} スプレッドシートの全データ
 */
async function fetchKAFerData() {
    try {
        // キャッシュを回避するために、URLに現在時刻を追加して毎回違うURLにする
        const response = await fetch(`${OPENSHEET_URL}?_=${new Date().getTime()}`);
        if (!response.ok) throw new Error(`HTTPエラー！ ステータス: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("データ取得エラー:", error);
        return [];
    }
}

/**
 * Googleフォームにデータを送信（書き込み）する
 * @param {FormData} formData - 送信するデータ
 * @returns {Promise<{success: boolean}>} 送信結果
 */
async function postToGoogleForm(formData) {
    try {
        await fetch(FORM_URL, { method: 'POST', body: formData, mode: 'no-cors' });
        return { success: true };
    } catch (error) {
        console.error("フォーム送信エラー:", error);
        return { success: false };
    }
}


// --- 新機能: データ反映確認（ポーリング）関数 ---

/**
 * 指定した条件が満たされるまで、Opensheet APIを定期的にチェックする
 * @param {function(Array): boolean} validationFn - データの正しさを検証する関数。trueを返すと成功。
 * @param {number} [timeout=30000] - タイムアウトまでの時間（ミリ秒）
 * @returns {Promise<boolean>} 成功した場合はtrue、タイムアウトした場合はエラーを投げる
 */
function pollForData(validationFn, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const interval = 2000; // 2秒ごとにチェック
        let elapsedTime = 0;

        const poller = setInterval(async () => {
            const data = await fetchKAFerData();
            // 検証関数を実行し、trueが返ってきたら成功
            if (validationFn(data)) {
                clearInterval(poller);
                resolve(true);
            }

            elapsedTime += interval;
            // タイムアウト時間を超えたらエラー
            if (elapsedTime >= timeout) {
                clearInterval(poller);
                reject(new Error("タイムアウト: データの反映を確認できませんでした。時間をおいて再試行してください。"));
            }
        }, interval);
    });
}


// --- ヘルパー（補助）関数 ---

function showMessage(element, msg, type) { element.textContent = msg; element.className = `message ${type}`; element.classList.remove('hidden'); }
function hideMessage(element) { element.classList.add('hidden'); }
function getMonthYear(date) { return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`; }


// --- 計算ロジック関数 ---

/**
 * 指定された時点でのアクティブな会員IDのリストを取得する
 * @param {Array} allData - スプレッドシートの全データ
 * @param {Date} [date=new Date()] - 判定基準日
 * @returns {Array<string>} アクティブな会員のKAFerIDの配列
 */
function getActiveUsers(allData, date = new Date()) {
    const userStatus = {};
    // 全データを走査して、各ユーザーの登録日と退会日をまとめる
    allData.forEach(row => {
        if (row.e === 'register' && row.F) {
            userStatus[row.F] = { registerDate: new Date(row.K) };
        } else if (row.e === 'remove' && row.F && userStatus[row.F]) {
            userStatus[row.F].removeDate = new Date(row.K);
        }
    });

    // 判定日時点でアクティブなユーザーを絞り込む
    return Object.keys(userStatus).filter(id => {
        const user = userStatus[id];
        return user.registerDate <= date && (!user.removeDate || user.removeDate > date);
    });
}

/**
 * 会員数に応じて一人あたりの請求額を計算する
 * @param {number} memberCount - アクティブな会員数
 * @returns {number} 請求額
 */
function calculateBilling(memberCount) {
    if (memberCount <= 0) return 990;
    if (paymentRates[memberCount]) return paymentRates[memberCount];
    // 10人を超える場合は、1000円を人数で割り、10円単位で切り上げ
    return Math.ceil((1000 / memberCount) / 10) * 10;
}