# Encore - 後で読むサービス

## プロジェクト概要

EncoreはPocketやはてなブックマークのような「後で読む」サービスです。
気になったWebページやツイートを保存し、後で整理・検索して読み返すことができるパーソナルなアプリです。

### 目的・コンセプト

- 情報のインプットから整理・活用までをシームレスに
- 個人用に特化した使いやすさ重視
- モバイルファーストでどこでも使える
- 技術学習やニュース収集の効率化

### ターゲットユーザー

- 開発者本人（個人利用）
- Google認証のホワイトリスト形式で限定的な共有も可能

## 技術スタック

- **フロントエンド**: Next.js 15 + TypeScript + Tailwind CSS v4
- **バックエンド**: Next.js API Routes + Supabase
- **データベース**: Supabase (PostgreSQL)
- **認証**: Supabase Auth (Google Provider + RLS)
- **ホスティング**: Vercel
- **拡張機能**: Chrome Extension
- **メタデータ取得**: 自前実装（Phase1）→ 外部APIフォールバック（Phase2）→ 専用パーサー（Phase3）
- **外部API**: Microlink API等（フォールバック）、Twitter API（将来オプション）

## 開発フェーズ

### Phase 1: 基本機能
- URL保存・閲覧機能
- Google認証・アクセス制御
- 基本的なUI/UX

### Phase 2: 整理機能
- タグ・カテゴリ機能
- 検索・フィルタリング
- お気に入り・ピン留め

### Phase 3: 拡張機能
- Chrome拡張機能
- X/Twitter URL対応（基本）
- モバイル最適化

### Phase 4: 改善・最適化
- パフォーマンス改善
- PWA対応
- ユーザビリティ向上

### Phase 5: 高度な機能（オプション）
- Twitter API連携
- その他のAPI連携機能
- 詳細メタデータ取得