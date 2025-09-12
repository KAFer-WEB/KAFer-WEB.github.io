/*
 * global.js
 * 共通のJavaScript関数、設定値、UIヘルパーなど
 * KAFerプロジェクト引き継ぎ資料 (最終版)に基づき生成 (GitHubオンリー版 - admin.html新機能対応・フルコード)
 *
 * セキュリティ上の限界点 (MASTER_PASSWORDがクライアントサイドに存在すること) を許容し、
 * GitHub Pagesなどの純粋な静的サイトで動作するように調整されています。
 */

// ============================================================
// 1. プロジェクト設定
// ============================================================
const PROJECT_CONFIG = {
    SHEET_ID: '1lfDRRlo6aYsjW5rEj3ZoL-bpO0ZG2PiLzZVu4A0Ypdg', // あなたのスプレッドシートIDに設定済み
    SHEET_NAME: 'v1.0', // 資料に記載の通り、シート名は 'v1.0'
    ADMIN_ID: '2025', // 管理者KAFerID
    // ★★★ ここをあなたが作成した37文字の秘密鍵で置き換えてください！
    // このパスワードはSHA256でハッシュ化されてAESキーとして使用されます。
    // GitHubに公開されるため、この鍵が漏洩すると全データが解読されます。
    MASTER_PASSWORD: 'iKeMaster.atMark.lll3.wout.win#2025', // ← ここにあなたの強力な秘密鍵を設定しました
    OPENSHEET_BASE_URL: 'https://opensheet.elk.sh/', // Opensheet APIのベースURL
    FORM_BASE_URL: 'https://docs.google.com/forms/d/e/1FAIpQLScPv4SVheBCYy1yu8iDPQs5MlJjRkhltnDN6KN2df5NJJ42NA/formResponse', // GoogleフォームのformResponse URL
    // システム設定のデフォルト値
    DEFAULT_SYSTEM_CONFIG: {
        emergency_lockdown: false, // 緊急情報保護モード (true: 有効, false: 無効)
    }
};

// Googleフォームの質問項目に対応するentry ID
const ENTRY_MAP = {
    name: '960395623', // NameのEntry ID
    id: '58581214',   // IDのEntry ID
    type: '1943034586', // TypeのEntry ID
    data: '1922513785'  // DataのEntry ID
};

// 暗号化/復号のキーとしてMASTER_PASSWORDをSHA256でハッシュ化して使用
// クライアントサイドに鍵が存在するセキュリティリスクを許容します。
const AES_KEY = CryptoJS.SHA256(PROJECT_CONFIG.MASTER_PASSWORD);

// ============================================================
// 2. データ取得・書き込み関数
// ============================================================

/**
 * Googleスプレッドシートからデータを取得し、r列の暗号化データを復号して返す。
 * 緊急情報保護モードが有効で非管理者の場合、データ読み込みをブロックする。
 * @param {boolean} isAdminFetch 管理者によるフェッチかどうか (緊急情報保護モードの例外処理用)
 * @returns {Promise<Array>} 復号済みデータを含むスプレッドシートの全データ（JSON形式）
 */
async function fetchSheetData(isAdminFetch = false) {
    const user = getLoggedInUser();
    const recordsForConfig = await fetchRawSheetData(); // ロックダウン状態確認のため、まず生データを取得

    // 生データからシステム設定を復号して取得
    const systemConfigRecordsRaw = recordsForConfig.filter(r => {
        try {
            const encryptedPayload = JSON.parse(r.r);
            const decryptedJsonString = decryptData(encryptedPayload);
            const decryptedContent = JSON.parse(decryptedJsonString);
            return decryptedContent.type === 'system_config';
        } catch (e) {
            return false;
        }
    });

    let currentSystemConfig = { ...PROJECT_CONFIG.DEFAULT_SYSTEM_CONFIG };
    if (systemConfigRecordsRaw.length > 0) {
        const latestConfigRaw = systemConfigRecordsRaw.reduce((prev, current) => {
            const prevContent = JSON.parse(decryptData(JSON.parse(prev.r)));
            const currentContent = JSON.parse(decryptData(JSON.parse(current.r)));
            return (new Date(prevContent.timestamp) > new Date(currentContent.timestamp)) ? prev : current;
        });
        Object.assign(currentSystemConfig, JSON.parse(decryptData(JSON.parse(latestConfigRaw.r))));
    }


    // 緊急情報保護モードが有効で、かつ現在のユーザーが管理者ではない場合、データ取得をブロック
    if (currentSystemConfig.emergency_lockdown && !(user && user.isAdmin) && !isAdminFetch) {
        console.warn('Emergency lockdown is active. Data fetch blocked for non-admin users.');
        alert('現在、システムは緊急情報保護モードです。データは読み込めません。');
        return []; // 空の配列を返してデータを読み込めないようにする
    }

    try {
        const url = `${PROJECT_CONFIG.OPENSHEET_BASE_URL}${PROJECT_CONFIG.SHEET_ID}/${PROJECT_CONFIG.SHEET_NAME}`;
        console.log('Fetching from:', url);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        let data = await response.json();
        console.log('Fetched raw data:', data);

        // r列の暗号化データを復号し、各要素に展開する
        data = data.map(record => {
            const newRecord = { ...record };
            if (newRecord.r) { // 'r'列を参照
                try {
                    const encryptedPayload = JSON.parse(newRecord.r); // r列は暗号化されたJSON文字列
                    const decryptedJsonString = decryptData(encryptedPayload); // クライアントサイドで復号
                    const decryptedContent = JSON.parse(decryptedJsonString);
                    if (decryptedContent) {
                        Object.assign(newRecord, decryptedContent);
                    }
                } catch (e) {
                    console.warn('Could not decrypt or parse r for record:', newRecord, e);
                    // 復号できなかった場合は、元の暗号化されたデータを残す
                }
            }
            return newRecord;
        });
        console.log('Fetched and decrypted data:', data);
        return data;
    } catch (error) {
        console.error('Error fetching sheet data:', error);
        alert('データ取得中にエラーが発生しました。管理者にお問い合わせください。');
        return [];
    }
}

/**
 * Googleスプレッドシートから生のデータを取得する (緊急情報保護モードの状態確認用)
 * @returns {Promise<Array>} スプレッドシートの全データ（JSON形式、r列は暗号化されたまま）
 */
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
        //alert('生データ取得中にエラーが発生しました。管理者にお問い合わせください。');
        return [];
    }
}


/**
 * Googleフォームを通じてスプレッドシートにデータを書き込む (AFEは空白を送信)
 * @param {string} name ユーザー名 (暗号化データに含めるため使用)
 * @param {string} kaferId KAFerID (暗号化データに含めるため使用)
 * @param {string} type レコード種別 (暗号化データに含めるため使用)
 * @param {object|string} additionalData `r`列に含める追加データ（例: { pass: "XXXX" }）
 * @returns {Promise<boolean>} 成功した場合はtrue、失敗した場合はfalse
 */
async function writeToSheet(name, kaferId, type, additionalData) {
    const formData = new FormData();

    // A, F, e列は空白を送信（Googleフォームがエラーにならないように）
    formData.append(`entry.${ENTRY_MAP.name}`, ''); // 空白を送信
    formData.append(`entry.${ENTRY_MAP.id}`, '');   // 空白を送信
    formData.append(`entry.${ENTRY_MAP.type}`, ''); // 空白を送信

    // すべてのデータをまとめてクライアントサイドで暗号化
    const dataToEncrypt = {
        name: name,
        kaferId: kaferId,
        type: type, // レコード種別も暗号化データ内に含める
        timestamp: new Date().toISOString(), // タイムスタンプもデータ内に含める (Kとは別)
        ...additionalData // パスコード、支払いコードなどの追加データ
    };
    const encryptedResult = encryptData(JSON.stringify(dataToEncrypt)); // クライアントサイドで暗号化

    if (!encryptedResult) {
        return false; // 暗号化失敗
    }
    formData.append(`entry.${ENTRY_MAP.data}`, encryptedResult); // 暗号化されたJSON文字列をそのまま送る

    try {
        const response = await fetch(PROJECT_CONFIG.FORM_BASE_URL, {
            method: 'POST',
            body: formData,
            mode: 'no-cors' // Googleフォームへの送信はno-corsモードで行う
        });
        console.log('Form submission initiated (AFE blank, R encrypted by Client).');
        return true;
    } catch (error) {
        console.error('Error submitting form:', error);
        alert('データ送信中にエラーが発生しました。管理者にお問い合わせください。');
        return false;
    }
}

// ============================================================
// 3. 暗号化・復号関数 (CryptoJS CBCモード)
// ============================================================

/**
 * データをAES-CBC暗号化する。ランダムなIVを生成し、暗号文と一緒に返す。
 * @param {string} data 暗号化する文字列
 * @returns {string} JSON文字列形式の暗号化されたデータ {"iv": "Base64化したIV", "value": "Base64化した暗号文"}
 */
function encryptData(data) {
    try {
        const iv = CryptoJS.lib.WordArray.random(128 / 8); // 128ビットのIVを生成 (16バイト)
        const encrypted = CryptoJS.AES.encrypt(data, AES_KEY, {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });
        // IVと暗号文をBase64でエンコードし、JSON形式で返す
        return JSON.stringify({
            iv: CryptoJS.enc.Base64.stringify(iv),
            value: encrypted.toString()
        });
    } catch (error) {
        console.error('Encryption failed (CBC mode):', error);
        return '';
    }
}

/**
 * データをAES-CBC復号する。保存されたIVを使用して復号する。
 * @param {object} encryptedPayload 暗号化されたデータオブジェクト { iv: string, value: string }
 * @returns {string} 復号された文字列
 */
function decryptData(encryptedPayload) {
    try {
        // encryptedPayloadがオブジェクトであることを確認
        if (typeof encryptedPayload !== 'object' || !encryptedPayload.iv || !encryptedPayload.value) {
            throw new Error("Invalid encrypted data format or empty payload.");
        }
        const iv = CryptoJS.enc.Base64.parse(encryptedPayload.iv); // Base64からIVをパース
        const decrypted = CryptoJS.AES.decrypt(encryptedPayload.value, AES_KEY, {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });
        return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
        console.error('Decryption failed (CBC mode):', error);
        // エラー発生時は安全のため空文字列を返す
        return '';
    }
}

// ============================================================
// 4. 認証・状態管理関数
// ============================================================

/**
 * ユーザー認証を行う
 * @param {string} kaferId ユーザーが入力したKAFerID
 * @param {string} password ユーザーが入力したパスコード
 * @returns {Promise<object|null>} 認証成功時にユーザーデータ、失敗時にnull
 */
async function authenticateUser(kaferId, password) {
    const records = await fetchSheetData(); // 復号済みデータが返される
    const systemConfig = await getSystemConfig(records); // 最新のシステム設定を取得

    // 管理者以外のユーザーの場合、緊急ロックダウンが有効ならログインを拒否
    if (kaferId !== PROJECT_CONFIG.ADMIN_ID && systemConfig.emergency_lockdown) {
        alert('現在、システムは緊急情報保護モードです。ログインできません。');
        return null;
    }

    const userRecords = records.filter(r => r.kaferId === kaferId && r.type === 'register');

    if (userRecords.length === 0) {
        return null; // 登録情報なし
    }

    // 最新の登録レコードからパスコードを取得
    const latestRegister = userRecords.reduce((prev, current) => {
        const prevTime = new Date(prev.timestamp); // データのtimestampを使用
        const currentTime = new Date(current.timestamp);
        return (prevTime > currentTime) ? prev : current;
    });

    if (!latestRegister || !latestRegister.pass) {
        return null; // パスコード情報なし
    }

    try {
        if (latestRegister.pass === password) {
            // 認証成功、ユーザーセッションを設定
            localStorage.setItem('loggedInUser', JSON.stringify({
                kaferId: kaferId,
                name: latestRegister.name,
                version: 'v2.0', // v2.0を強制
                isAdmin: (kaferId === PROJECT_CONFIG.ADMIN_ID)
            }));
            return {
                kaferId: kaferId,
                name: latestRegister.name,
                version: 'v2.0', // v2.0を強制
                isAdmin: (kaferId === PROJECT_CONFIG.ADMIN_ID)
            };
        }
    } catch (e) {
        console.error('Error during authentication or parsing user data:', e);
    }
    return null; // 認証失敗
}

/**
 * ユーザーをログアウトさせる
 */
function logoutUser() {
    localStorage.removeItem('loggedInUser');
    window.location.href = 'index.html';
}

/**
 * 現在ログインしているユーザーの情報を取得する
 * @returns {object|null} ユーザー情報またはnull
 */
function getLoggedInUser() {
    const user = localStorage.getItem('loggedInUser');
    return user ? JSON.parse(user) : null;
}

/**
 * ログイン状態をチェックし、リダイレクトする
 * @param {boolean} requireLogin trueの場合、未ログインならindex.htmlへリダイレクト
 * @param {boolean} requireAdmin trueの場合、管理者でないならindex.htmlへリダイレクト
 * @param {string} currentPath 現在のページのパス (例: 'menu.html')
 */
async function checkLoginStatus(requireLogin = true, requireAdmin = false, currentPath = '') {
    const user = getLoggedInUser();
    const recordsRaw = await fetchRawSheetData(); // ロックダウン状態の確認のため生のデータを取得
    const systemConfig = await getSystemConfig(recordsRaw); // 最新のシステム設定を取得 (rawデータから)

    // 緊急ロックダウンモード中の非管理者ユーザーはindex.htmlに強制リダイレクト
    if (systemConfig.emergency_lockdown && user && user.kaferId !== PROJECT_CONFIG.ADMIN_ID) {
        alert('現在、システムは緊急情報保護モードです。ログインユーザーはログアウトされます。');
        logoutUser(); // 強制ログアウト
        return; // これ以上処理は行わない
    }

    // index.htmlでのログイン済みユーザーのリダイレクトチェック
    if (currentPath === 'index.html') {
        if (user) { // ログイン済み
            if (user.isAdmin) {
                // 管理者は緊急情報保護モードでもadmin.htmlにアクセス可能
                if (!window.location.pathname.endsWith('admin.html')) {
                    window.location.href = 'admin.html';
                }
            } else { // 一般ユーザー
                if (!window.location.pathname.endsWith('menu.html')) {
                    window.location.href = 'menu.html';
                }
            }
            return; // リダイレクト処理後はここで終了
        }
        // 未ログインの場合は、index.htmlに留まる
        return;
    }


    // その他のページでのログインチェック
    if (requireLogin && !user) {
        alert('ログインが必要です。');
        window.location.href = 'index.html';
        return;
    }
    if (user) {
        if (requireAdmin && !user.isAdmin) {
            alert('管理者権限が必要です。');
            window.location.href = 'index.html'; // 管理者でなければログインページへ
            return;
        }
    }
}


// ============================================================
// 5. システム設定管理関数
// ============================================================

/**
 * 最新のシステム設定レコードを取得する
 * @param {Array} allRecords fetchSheetDataまたはfetchRawSheetDataから取得した全レコード
 * @returns {object} 最新のシステム設定オブジェクト (デフォルト値を含む)
 */
async function getSystemConfig(allRecords) {
    const configRecords = allRecords.filter(r => r.type === 'system_config');

    let currentConfig = { ...PROJECT_CONFIG.DEFAULT_SYSTEM_CONFIG };

    if (configRecords.length > 0) {
        const latestConfig = configRecords.reduce((prev, current) => {
            const prevTime = new Date(prev.timestamp);
            const currentTime = new Date(current.timestamp);
            return (prevTime > currentTime) ? prev : current;
        });
        Object.assign(currentConfig, latestConfig); // 復号済みレコードであれば直接マージ
    }
    return currentConfig;
}


// ============================================================
// 6. UIヘルパー関数
// ============================================================

/**
 * 指定されたIDの要素にメッセージを表示する
 * @param {string} elementId メッセージを表示する要素のID
 * @param {string} message 表示するメッセージ
 * @param {string} type メッセージの種類 (success, error, info)
 */
function showMessage(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = `message ${type}`; // CSSでスタイルを適用する
        element.style.display = 'block';
    }
}

/**
 * メッセージを非表示にする
 * @param {string} elementId メッセージを表示する要素のID
 */
function hideMessage(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = 'none';
        element.textContent = '';
        element.className = '';
    }
}

/**
 * 指定されたタブのコンテンツを表示し、他のタブを非表示にする
 * @param {string} tabContainerId タブボタンを含むコンテナのID
 * @param {string} contentId 表示するタブコンテンツのID
 */
function showTabContent(tabContainerId, contentId) {
    // タブボタンのactiveクラスを切り替える
    document.querySelectorAll(`#${tabContainerId} .tab-button`).forEach(button => {
        button.classList.remove('active');
    });
    const targetButton = document.querySelector(`#${tabContainerId} button[data-target="${contentId}"]`);
    if (targetButton) {
        targetButton.classList.add('active');
    }


    // タブコンテンツの表示/非表示を切り替える
    const contentWrapperId = tabContainerId.replace('-nav', '-content-wrapper');
    document.querySelectorAll(`#${contentWrapperId} .tab-content`).forEach(content => {
        content.style.display = 'none';
    });
    const targetContent = document.getElementById(contentId);
    if (targetContent) {
        targetContent.style.display = 'block';
    }
}


// ============================================================
// 7. 初期化処理 (各HTMLファイルでDOMContentLoaded後に呼び出す)
// ============================================================