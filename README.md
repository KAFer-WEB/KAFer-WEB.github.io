/ (プロジェクトルート)
|
├── README.md              # ★追加：プロジェクトの概要とファイル構成を記述
|
├── index.html             # ログイン・新規登録のトップページ
|
├── app/
|   ├── menu.html          # メインメニュー
|   └── meet.html          # 限定配信・集金情報ページ
|
├── admin/
|   ├── dashboard.html     # 管理者ダッシュボード
|   ├── members.html       # 会員管理
|   ├── money.html         # KAFerマネー管理
|   └── settings.html      # サイト設定
|
├── assets/
|   ├── css/
|   |   ├── global.css
|   |   ├── auth.css
|   |   ├── app.css
|   |   └── admin.css
|   |
|   ├── js/
|   |   ├── global.js
|   |   ├── index.js
|   |   ├── app/
|   |   |   └── menu.js
|   |   └── admin/
|   |       ├── dashboard.js
|   |       ├── members.js
|   |       ├── money.js
|   |       └── settings.js
|   |
|   └── icons/
|       ├── icon.png
|       └── icon-512.png
|
├── service-worker.js
└── manifest.webmanifest