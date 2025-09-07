# Encore - 技術アーキテクチャ（インデックス）

このファイルは大きくなったため、以下のファイルに分割されました。

## ドキュメント構成

### 1. [データベース設計](./database-design.md)
- システム構成図
- テーブル設計（RLS、ホワイトリスト対応）
- インデックス設計（日本語検索対応）
- ストアドファンクション

### 2. [API設計](./api-design.md)
- REST APIエンドポイント
- Supabase Auth設定
- BookmarkServiceの実装
- URL正規化と重複制御

### 3. [メタデータ抽出システム](./metadata-extraction.md)
- 三段構えメタデータ抽出（Edge → Node → External API）
- キャッシュ・再取得戦略
- HTMLRewriter実装
- バックグラウンド処理

### 4. [フロントエンド・状態管理](./frontend-state-management.md)
- React Hooksベースの状態管理
- Supabase Realtime対応
- タグ階層管理
- PWA・Chrome拡張機能連携

### 5. [セキュリティ・パフォーマンス](./security-performance.md)
- SSRF対策・URL検証
- 多層レートリミット
- パフォーマンス最適化
- 監視・ログ設定

## 主要な技術的特徴

### 認証・アクセス制御
- **Supabase Auth**: Google OAuth + RLS（Row Level Security）
- **二段階ホワイトリスト**: Auth hooks + RLS policies
- **citext使用**: 大文字小文字を自動無視

### データベース設計
- **URL重複防止**: canonical_urlフィールド + ユニークインデックス
- **日本語検索対応**: PostgreSQL Trigram + フォールバック
- **タグ階層**: parent_tag_id + display_orderによる並び順制御

### メタデータ抽出
- **三段構えシステム**: Edge（HTMLRewriter）→ Node（metascraper）→ External API
- **段階的フォールバック**: 必要時のみ高コストAPIを使用
- **運用ポリシー**: 指数的バックオフ + レート制御

### パフォーマンス最適化
- **多層レートリミット**: ユーザーID優先、IPフォールバック
- **統合キャッシュ**: ユーザー間共有 + TTL管理
- **Edge First**: 大部分の処理をEdgeで完結

## 環境変数設定例

```bash
# 基本設定
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
GOOGLE_CLIENT_ID=your_google_client_id

# メタデータ取得制御
METADATA_FALLBACK_ENABLED=false  # 外部API使用制御

# レートリミット
RATE_LIMIT_USER_RPM=20      # 認証済みユーザー制限
RATE_LIMIT_IP_RPM=10        # 未認証ユーザー制限

# Cronジョブ
CRON_REVALIDATE_LIMIT=100   # バックグラウンド処理上限
CRON_REQUEST_DELAY=100      # API負荷制御
```

## 実装フェーズ

1. **Phase 1**: MVP（認証 + 基本CRUD + Edge抽出）
2. **Phase 2**: 検索・タグ（日本語検索 + 階層タグ）
3. **Phase 3**: UX向上（お気に入り + 無限スクロール）
4. **Phase 4**: 拡張機能（Chrome拡張 + PWA）
5. **Phase 5**: 高度機能（Twitter API + その他連携）

詳細な実装仕様は各分割ドキュメントを参照してください。