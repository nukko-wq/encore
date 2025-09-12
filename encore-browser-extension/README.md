# Encore Bookmark Extension

Encoreブックマーク管理システム用のChrome拡張機能です。

## 🚀 機能

- **ワンクリックブックマーク保存**: 現在のページを即座に保存
- **タグ管理**: 既存タグの選択と新規タグの作成
- **認証連携**: Supabase認証との完全連携
- **ショートカットキー**: Ctrl+Shift+Bで素早く保存
- **コンテキストメニュー**: 右クリックからの保存
- **メタデータ抽出**: ページの情報を自動取得

## 📋 前提条件

- Google Chrome または Chromium ベースのブラウザ
- Encoreブックマーク管理システムが稼働中
- ユーザーがEncoreにログイン済み

## 🛠️ 開発環境のセットアップ

### 1. 拡張機能のロード

1. Chrome で `chrome://extensions/` にアクセス
2. 右上の「デベロッパーモード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. このディレクトリ（encore-browser-extension）を選択

### 2. Encoreサーバーの起動

拡張機能は Encore の開発サーバーと連携します：

```bash
# Encoreプロジェクトのルートディレクトリで
cd /home/nukko/dev/encore
npm run dev
```

サーバーが `http://localhost:3002` で起動していることを確認してください。

### 3. アイコンの生成（オプション）

基本的なアイコンを生成する場合：

1. `assets/create-icons.html` をブラウザで開く
2. 生成された各サイズのアイコンをダウンロード
3. `assets/icons/` ディレクトリに保存

## 🧪 テスト方法

### 基本機能のテスト

1. **認証テスト**:
   - 拡張機能アイコンをクリック
   - ログイン状態が正しく表示されることを確認

2. **ブックマーク保存テスト**:
   - 任意のWebページで拡張機能アイコンをクリック
   - メモとタグを設定して保存
   - Encoreのブックマーク一覧で確認

3. **ショートカットテスト**:
   - `Ctrl+Shift+B` でクイック保存を実行

4. **コンテキストメニューテスト**:
   - ページを右クリック → 「このページをEncoreに保存」
   - リンクを右クリック → 「このリンクをEncoreに保存」

### デバッグ

1. **開発者ツール**:
   - 拡張機能のポップアップで右クリック → 「検証」
   - バックグラウンドページ: `chrome://extensions/` → 拡張機能の詳細 → 「ビューを検証: background page」

2. **ログの確認**:
   - ブラウザのコンソールでエラーや警告を確認
   - ネットワークタブでAPI通信を確認

## 📁 ファイル構成

```
encore-browser-extension/
├── manifest.json                 # 拡張機能の設定
├── popup/
│   ├── popup.html               # メインUI
│   ├── popup.css                # スタイル
│   └── popup.js                 # UI制御ロジック
├── background/
│   └── service-worker.js        # バックグラウンド処理
├── content-scripts/
│   └── content.js               # ページ情報取得
├── shared/
│   ├── api.js                   # API通信
│   ├── auth.js                  # 認証管理
│   └── utils.js                 # 共通ユーティリティ
├── assets/
│   ├── icons/                   # アイコンファイル
│   ├── images/                  # 画像ファイル
│   └── create-icons.html        # アイコン生成ツール
└── README.md
```

## 🔧 設定

### manifest.json の主要設定

- **permissions**: `activeTab`, `storage`, `scripting`
- **host_permissions**: Encoreサーバーへのアクセス許可
- **content_scripts**: 全てのページで実行
- **background**: Service Worker として動作

### API エンドポイント

拡張機能は以下のEncoreAPIと連携します：

- `GET /api/auth/user` - ユーザー情報取得
- `GET /api/tags` - タグ一覧取得
- `POST /api/tags` - 新規タグ作成
- `POST /api/bookmarks` - ブックマーク作成

## 🚨 トラブルシューティング

### よくある問題

1. **「ログインが必要です」と表示される**:
   - Encoreにログインしているか確認
   - `chrome://settings/cookies` でCookieが有効か確認

2. **「ネットワークに接続できません」エラー**:
   - Encoreサーバーが起動しているか確認
   - `http://localhost:3002` にアクセスできるか確認
   - manifest.jsonのhost_permissionsを確認

3. **タグが表示されない**:
   - Encoreでタグを作成済みか確認
   - APIレスポンスをネットワークタブで確認

4. **拡張機能が読み込まれない**:
   - manifest.jsonの構文エラーをチェック
   - Chrome拡張機能ページでエラーメッセージを確認

### ログの確認方法

```bash
# Chromeのコンソールで以下を実行してログレベルを変更
localStorage.setItem('encore-extension-debug', 'true')
```

## 🔄 開発ワークフロー

### コードの変更後

1. ファイルを保存
2. `chrome://extensions/` で拡張機能の「再読み込み」ボタンをクリック
3. 必要に応じてブラウザのキャッシュをクリア

### デバッグ時

1. 開発者ツールを開く
2. ネットワークタブでAPIリクエストを監視
3. コンソールタブでエラーログを確認

## 🚀 本格運用への準備

1. **アイコンの作成**: デザイナーによる適切なアイコン作成
2. **Chrome Web Store への公開**: 
   - アイコン、スクリーンショットの準備
   - プライバシーポリシーの作成
   - 説明文の作成
3. **プロダクション設定**: API URLの本格環境への変更

## 📄 ライセンス

このプロジェクトはEncoreブックマーク管理システムの一部として開発されています。

## 🤝 コントリビューション

バグ報告や機能要望は、Encoreプロジェクトのリポジトリで管理しています。
