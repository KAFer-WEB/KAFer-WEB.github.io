const PROJECT_CONFIG = {
    SHEET_ID: '1lfDRRlo6aYsjW5rEj3ZoL-bpO0ZG2PiLzZVu4A0Ypdg', // あなたのスプレッドシートIDに設定してください
    SHEET_NAME: 'v3.0', // v3.0用にシート名を変更
    ADMIN_ID: '2025', // 管理者KAFerID
    ADMIN_PASSCODE_SPECIAL: '@ichijik', // 管理者ログイン専用の特殊パスワード
    // 【最重要セキュリティ警告】
    // ★★★ ここをあなたが作成した37文字の秘密鍵で置き換えてください！ ★★★
    // このパスワードはSHA256でハッシュ化されてAESキーとして使用されます。
    // GitHubに公開されるため、この鍵が漏洩すると全データが解読されます。
    // 真にセキュリティを強化するためには、サーバーサイドのロジックへの移行を強く推奨します。
    MASTER_PASSWORD: 'iKeMaster.atMark.lll3.wout.win#2025', // ← ここにあなたの強力な秘密鍵を設定
    OPENSHEET_BASE_URL: 'https://opensheet.elk.sh/', // Opensheet APIのベースURL
    FORM_BASE_URL: 'https://docs.google.com/forms/d/e/1FAIpQLScPv4SVheBCYy1yu8iDPQs5MlJjRkhltzDN6KN2df5NJJ42NA/formResponse', // GoogleフォームのformResponse URL
    SITE_URL: 'https://KAFer-WEB.github.io', // あなたのサイトのURL (PWAやQRコードに利用)
    // システム設定のデフォルト値
    DEFAULT_SYSTEM_CONFIG: {
        emergency_lockdown: false, // 緊急情報保護モード (true: 有効, false: 無効)
        base_monthly_fee_yen: 1000, // 基本の月額会費 (円)
    },
    KAF_MONEY_PER_YEN: 100, // 1円あたりのKAFerマネー
    REFUND_FEE_YEN: 100, // 返金手数料 (円)
    REFUND_FEE_KAF: 100 * 100, // 返金手数料 (KAFerマネー) = 10000 KAFer
    REFUND_UNIT_KAF: 100 * 100, // 返金可能単位 (KAFerマネー) = 10000 KAFer
};

// Googleフォームの質問項目に対応するentry ID (v3.0ではDataのみに集約)
const ENTRY_MAP = {
    // フォームがDataフィールドのみを持つため、他のEntry IDは直接使用しない
    // ただし、以前のバージョンのコード互換性やデバッグのために残す可能性も考慮
    // 新しいフォームの「KAFer」という質問項目のEntry IDを指定
    data: '1922513785' // 新しいフォームの「KAFer」という質問項目のEntry ID
};

// 暗号化/復号のキーとしてMASTER_PASSWORDをSHA256でハッシュ化して使用
// クライアントサイドに鍵が存在するセキュリティリスクを許容します。
const AES_KEY = CryptoJS.SHA256(PROJECT_CONFIG.MASTER_PASSWORD);

// ============================================================
// 2. データ取得・書き込み関数
// ============================================================

/**
 * Googleスプレッドシートからデータを取得し、DATA列の暗号化データを復号して返す。
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
            // 新しいスプレッドシート構造: 'DATA' 列に暗号化JSONが格納される
            if (!r.DATA) return false;
            const encryptedPayload = JSON.parse(r.DATA);
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
            // 日付文字列をISO形式のDateオブジェクトに変換して比較
            const prevContent = JSON.parse(decryptData(JSON.parse(prev.DATA)));
            const currentContent = JSON.parse(decryptData(JSON.parse(current.DATA)));
            return (new Date(prevContent.timestamp) > new Date(currentContent.timestamp)) ? prev : current;
        }, systemConfigRecordsRaw[0]);
        Object.assign(currentSystemConfig, JSON.parse(decryptData(JSON.parse(latestConfigRaw.DATA))));
    }

    // 緊急情報保護モードが有効で、かつ現在のユーザーが管理者ではない場合、データ取得をブロック
    if (currentSystemConfig.emergency_lockdown && !(user && user.isAdmin) && !isAdminFetch) {
        console.warn('Emergency lockdown is active. Data fetch blocked for non-admin users.');
        alert('現在、システムは緊急情報保護モードです。データは読み込めません。');
        return [];
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

        // DATA列の暗号化データを復号し、各要素に展開する
        data = data.map(record => {
            const newRecord = { ...record };
            if (newRecord.DATA) { // 'DATA'列を参照
                try {
                    const encryptedPayload = JSON.parse(newRecord.DATA); // DATA列は暗号化されたJSON文字列
                    const decryptedJsonString = decryptData(encryptedPayload); // クライアントサイドで復号
                    const decryptedContent = JSON.parse(decryptedJsonString);
                    if (decryptedContent) {
                        Object.assign(newRecord, decryptedContent);
                    }
                } catch (e) {
                    console.warn('Could not decrypt or parse DATA for record:', newRecord, e);
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
 * @returns {Promise<Array>} スプレッドシートの全データ（JSON形式、DATA列は暗号化されたまま）
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
        return [];
    }
}


/**
 * Googleフォームを通じてスプレッドシートにデータを書き込む (TIMEは自動、DATAは暗号化)
 * @param {string} name ユーザー名 (暗号化データに含めるため使用)
 * @param {string} kaferId KAFerID (暗号化データに含めるため使用)
 * @param {string} type レコード種別 (暗号化データに含めるため使用)
 * @param {object|string} additionalData `DATA`列に含める追加データ（例: { pass: "XXXX" }）
 * @returns {Promise<boolean>} 成功した場合はtrue、失敗した場合はfalse
 */
async function writeToSheet(name, kaferId, type, additionalData) {
    const formData = new FormData();

    // TIME列はGoogleフォームが自動で入力するため、ここでは何もしない
    // フォームの質問項目が「KAFer」（entry.1922513785）のみを想定
    // その他のAFE列はV3.0スプレッドシートでは使用しないため、フォーム送信からも削除

    // すべてのデータをまとめてクライアントサイドで暗号化し、DATAフィールドに送信
    const dataToEncrypt = {
        name: name,
        kaferId: kaferId,
        type: type, // レコード種別も暗号化データ内に含める
        timestamp: new Date().toISOString(), // タイムスタンプもデータ内に含める (TIME列とは別で、データ内部のソートに利用)
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
        console.log('Form submission initiated (DATA encrypted by Client).');
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
        const prevTime = new Date(prev.timestamp); // データ内部のtimestampを使用
        const currentTime = new Date(current.timestamp);
        return (prevTime > currentTime) ? prev : current;
    }, userRecords[0]);

    if (!latestRegister || !latestRegister.pass) {
        return null; // パスコード情報なし
    }

    try {
        if (latestRegister.pass === password) {
            // 認証成功、ユーザーセッションを設定
            localStorage.setItem('loggedInUser', JSON.stringify({
                kaferId: kaferId,
                name: latestRegister.name,
                version: 'v3.0', // v3.0を強制
                isAdmin: (kaferId === PROJECT_CONFIG.ADMIN_ID)
            }));
            return {
                kaferId: kaferId,
                name: latestRegister.name,
                version: 'v3.0', // v3.0を強制
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
        return;
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
            return;
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
            window.location.href = 'index.html';
            return;
        }
    }
}


// ============================================================
// 5. システム設定・会費計算関数
// ============================================================

/**
 * 最新のシステム設定レコードを取得する
 * @param {Array} allRecords fetchSheetDataまたはfetchRawSheetDataから取得した全レコード
 * @returns {object} 最新のシステム設定オブジェクト (デフォルト値を含む)
 */
async function getSystemConfig(allRecords) {
    const configRecords = allRecords.filter(r => {
        try {
            if (r.type === 'system_config') { // 復号済みデータの場合
                return true;
            } else if (r.DATA) { // 生データの場合 ('DATA'列を見る)
                const encryptedPayload = JSON.parse(r.DATA);
                const decryptedJsonString = decryptData(encryptedPayload);
                const decryptedContent = JSON.parse(decryptedJsonString);
                return decryptedContent.type === 'system_config';
            }
            return false;
        } catch (e) {
            return false;
        }
    }).map(r => { // 必ず復号済みのオブジェクトとして返す
        if (r.type === 'system_config') {
            return r; // 既に復号済み
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

/**
 * 当月の必要な月額会費を計算する (各会員ごとの延滞額を考慮し、合計する)
 * @param {Array} allRecords 全ての復号済みレコード
 * @returns {Promise<number>} 当月の支払い必要額の合計 (KAFerマネー)
 */
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


/**
 * 特定ユーザーのKAFerマネー残高を計算する
 * @param {string} kaferId 対象ユーザーのKAFerID
 * @param {Array} allRecords 全ての復号済みレコード
 * @returns {number} KAFerマネー残高
 */
function calculateKAFerMoneyBalance(kaferId, allRecords) {
    let balance = 0;

    // 発行されたKAFerマネー
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

    // 使用されたKAFerマネー（支払い）
    const usedMoney = allRecords.filter(r => r.kaferId === kaferId && r.type === 'payment');
    usedMoney.forEach(payment => {
        if (payment.paymentCode && payment.amount) {
            balance -= payment.amount;
        }
    });

    // 返金が承認されたKAFerマネー（残高から減らす）
    const approvedRefunds = allRecords.filter(r => r.targetKaferId === kaferId && r.type === 'refund_approved');
    approvedRefunds.forEach(refund => {
        if (refund.refundAmountAfterFeeKaf) {
            balance -= refund.refundAmountAfterFeeKaf;
        }
    });

    return balance;
}

/**
 * 特定ユーザーの当月未払い額または過払いKAFerマネー額を計算する
 * 当月の支払い必要額には、過去の延滞額が繰り越されて加算されるロジックを含む。
 * @param {string} kaferId 対象ユーザーのKAFerID
 * @param {Array} allRecords 全ての復号済みレコード
 * @returns {{ monthlyDue: number, kaferMoneyBalance: number, outstanding: number, excess: number }} (すべてKAFerマネー単位)
 */
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
    const registerDate = new Date(registerRecord.timestamp); // データ内部のtimestampを使用
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


/**
 * 円をKAFerマネーに変換し、小数点以下を切り上げて整数KAFerマネーにする。
 * @param {number} yenAmount 円単位の金額
 * @returns {number} KAFerマネー単位の金額 (整数)
 */
function yenToKaf(yenAmount) {
    return Math.ceil(yenAmount * PROJECT_CONFIG.KAF_MONEY_PER_YEN);
}

/**
 * KAFerマネーを円に変換し、小数点以下2桁で切り上げる。
 * @param {number} kafAmount KAFerマネー単位の金額
 * @returns {number} 円単位の金額 (小数点以下2桁)
 */
function kafToYen(kafAmount) {
    const yen = kafAmount / PROJECT_CONFIG.KAF_MONEY_PER_YEN;
    return Math.ceil(yen * 100) / 100;
}

/**
 * 基本月額会費 (円) をKAFerマネーに変換する
 * @param {number} baseFeeYen 基本月額会費 (円)
 * @returns {number} KAFerマネー単位の金額 (整数)
 */
function baseFeeYenToKaf(baseFeeYen) {
    return baseFeeYen * PROJECT_CONFIG.KAF_MONEY_PER_YEN;
}


/**
 * ランダムなKAFerマネーコード (16桁の数字) を生成する
 * @returns {string} 16桁の数字文字列
 */
function generateRandomMoneyCode() {
    let result = '';
    for (let i = 0; i < 16; i++) {
        result += Math.floor(Math.random() * 10).toString();
    }
    return result;
}

/**
 * ランダムな返還コードを生成する (8文字以上の英数字記号)
 * @param {number} length 生成する文字列の長さ
 * @returns {string} ランダムな文字列
 */
function generateRandomRefundCode(length = 12) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
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
        element.className = `message ${type}`;
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

// ============================================================
// 7. PWA初期化関数
// ============================================================

/**
 * PWAの初期設定を行う関数
 * 各HTMLファイルのDOMContentLoadedイベント内で呼び出すことを想定。
 */
function initializePwaAndDarkMode() {
    // PWA Service Worker の登録 (GitHub PagesはHTTPS対応必須)
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
    // ファビコンのダークモード切り替えは、v3.0ではライトモード固定のため行わない
}