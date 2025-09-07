# Encore - 技術アーキテクチャ

## システム構成図

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Chrome拡張    │    │   モバイルWeb   │    │   デスクトップ  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
            │                      │                      │
            └──────────────────────┼──────────────────────┘
                                   │
                    ┌─────────────────────────┐
                    │    Next.js Frontend     │
                    │   (Vercel hosting)      │
                    └─────────────────────────┘
                                   │
                    ┌─────────────────────────┐
                    │   Next.js API Routes    │
                    │  (Server Components)    │
                    └─────────────────────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
    ┌───────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │ NextAuth.js v5│    │ Supabase DB     │    │ Supabase Storage│
    │ (認証・セッション)│    │ (PostgreSQL)    │    │  (画像・動画)   │
    └───────────────┘    └─────────────────┘    └─────────────────┘
                                   │
                         ┌─────────────────┐
                         │  External APIs  │
                         │ - Google OAuth  │
                         │ - Microlink API*│
                         │   (Fallback)    │
                         │ - Twitter API*  │
                         │   (Optional)    │
                         └─────────────────┘
```

## データベース設計（Supabase/PostgreSQL）

### テーブル設計

#### 1. users（ユーザー）
```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  display_name text,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_whitelisted boolean DEFAULT false
);
```

#### 2. bookmarks（ブックマーク）
```sql
CREATE TABLE bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  url text NOT NULL,
  title text,
  description text,
  thumbnail_url text,
  memo text,
  is_favorite boolean DEFAULT false,
  is_pinned boolean DEFAULT false,
  is_read boolean DEFAULT false,
  pinned_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
```

#### 3. tags（タグ）
```sql
CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text DEFAULT '#6366f1',
  parent_tag_id uuid REFERENCES tags(id),
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, name)
);
```

#### 4. bookmark_tags（ブックマークタグ関連）
```sql
CREATE TABLE bookmark_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bookmark_id uuid REFERENCES bookmarks(id) ON DELETE CASCADE,
  tag_id uuid REFERENCES tags(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(bookmark_id, tag_id)
);
```

#### 5. bookmark_metadata（追加メタデータ）
```sql
CREATE TABLE bookmark_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bookmark_id uuid REFERENCES bookmarks(id) ON DELETE CASCADE,
  metadata_type text NOT NULL, -- 'twitter', 'youtube', 'article' など
  metadata_json jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(bookmark_id, metadata_type)
);

-- Twitter特有のメタデータ例（将来のAPI連携時）
-- metadata_json構造:
-- {
--   "tweet_id": "1234567890",
--   "author": {
--     "username": "example",
--     "display_name": "Example User",
--     "avatar_url": "https://..."
--   },
--   "stats": {
--     "likes": 100,
--     "retweets": 50
--   },
--   "media_urls": ["https://..."]
-- }
```

### インデックス設計
```sql
-- パフォーマンス最適化用インデックス
CREATE INDEX idx_bookmarks_user_created_at ON bookmarks(user_id, created_at DESC);
CREATE INDEX idx_bookmarks_user_favorite ON bookmarks(user_id, is_favorite);
CREATE INDEX idx_bookmarks_user_pinned ON bookmarks(user_id, is_pinned);
CREATE INDEX idx_bookmarks_url ON bookmarks(url);
CREATE INDEX idx_tags_user_id ON tags(user_id);
CREATE INDEX idx_bookmark_tags_bookmark_id ON bookmark_tags(bookmark_id);
CREATE INDEX idx_bookmark_tags_tag_id ON bookmark_tags(tag_id);
CREATE INDEX idx_bookmark_metadata_bookmark_id ON bookmark_metadata(bookmark_id);
CREATE INDEX idx_bookmark_metadata_type ON bookmark_metadata(metadata_type);

-- 全文検索用インデックス
CREATE INDEX idx_bookmarks_search ON bookmarks USING gin(
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(memo, ''))
);
```

## API設計（Next.js API Routes）

### REST API エンドポイント

#### ブックマーク管理
```typescript
// GET /api/bookmarks - ブックマーク一覧取得
// POST /api/bookmarks - ブックマーク作成
// PUT /api/bookmarks/[id] - ブックマーク更新
// DELETE /api/bookmarks/[id] - ブックマーク削除
// GET /api/bookmarks/[id] - ブックマーク詳細

// POST /api/bookmarks/bulk - 一括作成
// PUT /api/bookmarks/[id]/favorite - お気に入り切り替え
// PUT /api/bookmarks/[id]/pin - ピン留め切り替え
// PUT /api/bookmarks/[id]/read - 既読切り替え
```

#### タグ管理
```typescript
// GET /api/tags - タグ一覧取得
// POST /api/tags - タグ作成
// PUT /api/tags/[id] - タグ更新
// DELETE /api/tags/[id] - タグ削除
```

#### 検索・フィルタ
```typescript
// GET /api/search?q=keyword&tags=tag1,tag2&filter=favorites
// GET /api/bookmarks/feed?page=1&limit=20&sort=created_at&order=desc
```

#### メタデータ・外部連携 API
```typescript
// POST /api/extract-metadata - 段階的メタデータ取得
//   1. 自前実装でのOGP取得
//   2. 失敗時は外部API（Microlink等）フォールバック
//   3. 特定サイト専用パーサー適用

// POST /api/twitter/enhance - Twitter URL の追加情報取得（オプション）
// POST /api/import/pocket - Pocket インポート
// GET /api/export - データエクスポート
```

### データベース・API層

#### NextAuth.js v5 設定
```typescript
// auth.ts
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { SupabaseAdapter } from "@auth/supabase-adapter"

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: SupabaseAdapter({
    url: process.env.SUPABASE_URL!,
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  }),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    })
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // ホワイトリストチェック
      const isWhitelisted = await checkWhitelist(user.email!)
      return isWhitelisted
    },
    async session({ session, user }) {
      // セッションにユーザー情報を追加
      session.user.id = user.id
      return session
    }
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  }
})

// Supabase クライアント設定
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 型安全性のためのDB型定義
export interface Database {
  public: {
    Tables: {
      bookmarks: {
        Row: BookmarkRow
        Insert: BookmarkInsert
        Update: BookmarkUpdate
      }
      // ... 他のテーブル
    }
  }
}
```

#### データアクセスレイヤー
```typescript
// lib/services/bookmarks.ts
export class BookmarkService {
  async getBookmarks(userId: string, filters: BookmarkFilters) {
    // Supabase クエリ実装
  }
  
  async createBookmark(userId: string, data: CreateBookmarkData) {
    // 段階的メタデータ取得 → Twitter URL判定 → DB保存
    const metadata = await this.extractMetadataWithFallback(data.url)
    
    // Twitter URLの場合、自動タグ付け
    if (this.isTwitterUrl(data.url)) {
      metadata.tags = ['Twitter', ...(metadata.tags || [])]
      metadata.type = 'tweet'
    }
    
    return await this.saveBookmark(userId, metadata)
  }
  
  private async extractMetadataWithFallback(url: string) {
    // Phase 1: 自前実装を試行
    let metadata = await this.extractMetadata(url)
    
    // Phase 2: 失敗時は外部APIを利用
    if (!metadata.title) {
      metadata = await this.getMetadataFromAPI(url)
    }
    
    // Phase 3: 特定サイト用の後処理
    const handler = this.getSiteHandler(url)
    if (handler) {
      metadata = await handler(url, metadata)
    }
    
    return metadata
  }
  
  async updateBookmark(id: string, updates: Partial<BookmarkRow>) {
    // 更新処理
  }
  
  private isTwitterUrl(url: string): boolean {
    return /^https?:\/\/(twitter\.com|x\.com)\/\w+\/status\/\d+/.test(url)
  }
  
  // オプション機能：Twitter API使用時の拡張情報取得
  async enhanceTwitterBookmark(bookmarkId: string, useApi = false) {
    if (!useApi) return null
    
    // Twitter API v2 呼び出し（制限内で）
    // 追加情報を bookmark_metadata テーブルに保存
  }
}
```

## フロントエンド アーキテクチャ

### フォルダ構成
```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── page.tsx
│   ├── dashboard/
│   │   ├── page.tsx
│   │   ├── loading.tsx
│   │   └── error.tsx
│   ├── bookmarks/
│   │   ├── [id]/
│   │   └── page.tsx
│   ├── api/
│   │   ├── bookmarks/
│   │   ├── tags/
│   │   └── auth/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   └── modal.tsx
│   ├── bookmarks/
│   │   ├── bookmark-card.tsx
│   │   ├── bookmark-form.tsx
│   │   └── bookmark-list.tsx
│   ├── layout/
│   │   ├── header.tsx
│   │   ├── sidebar.tsx
│   │   └── mobile-nav.tsx
│   └── common/
├── lib/
│   ├── supabase.ts
│   ├── auth.ts
│   ├── utils.ts
│   └── services/
│       ├── bookmarks.ts
│       ├── tags.ts
│       └── metadata/
│           ├── extractor.ts      -- 自前実装
│           ├── fallback-api.ts   -- 外部APIフォールバック
│           ├── site-handlers.ts  -- 特定サイト専用パーサー
│           └── index.ts          -- 統合インターフェース
├── hooks/
│   ├── use-bookmarks.ts
│   ├── use-tags.ts
│   └── use-auth.ts
└── types/
    ├── database.ts
    ├── api.ts
    └── common.ts
```

### メタデータ抽出システム設計
```typescript
// lib/services/metadata/index.ts - 統合インターフェース
export class MetadataExtractor {
  async extractMetadata(url: string): Promise<Metadata> {
    // Phase 1: 自前実装を試行
    let metadata = await this.extractWithCheerio(url)
    
    // Phase 2: 失敗時は外部APIフォールバック
    if (!metadata.title && process.env.FALLBACK_API_ENABLED) {
      metadata = await this.extractWithFallbackAPI(url)
    }
    
    // Phase 3: 特定サイト専用パーサー
    const siteHandler = this.getSiteHandler(url)
    if (siteHandler) {
      metadata = await siteHandler(url, metadata)
    }
    
    return this.sanitizeMetadata(metadata)
  }
  
  private getSiteHandler(url: string) {
    const domain = new URL(url).hostname.replace('www.', '')
    const handlers = {
      'github.com': this.handleGitHub,
      'youtube.com': this.handleYouTube,
      'youtu.be': this.handleYouTube,
      'twitter.com': this.handleTwitter,
      'x.com': this.handleTwitter,
      'qiita.com': this.handleQiita,
      'zenn.dev': this.handleZenn
    }
    return handlers[domain]
  }
}

// lib/services/metadata/extractor.ts - 自前実装
import cheerio from 'cheerio'

export async function extractWithCheerio(url: string): Promise<Metadata> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EncoreBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 10000
    })
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    
    const html = await response.text()
    const $ = cheerio.load(html)
    
    return {
      title: extractTitle($),
      description: extractDescription($),
      image: extractImage($, url),
      url: extractCanonicalUrl($, url),
      siteName: extractSiteName($),
      favicon: extractFavicon($, url)
    }
  } catch (error) {
    console.error('Cheerio extraction failed:', error)
    return { title: '', description: '', image: null, url }
  }
}

function extractTitle($: CheerioAPI): string {
  return $('meta[property="og:title"]').attr('content') ||
         $('meta[name="twitter:title"]').attr('content') ||
         $('title').text().trim() ||
         $('h1').first().text().trim() || ''
}

// lib/services/metadata/fallback-api.ts - 外部APIフォールバック
export async function extractWithFallbackAPI(url: string): Promise<Metadata> {
  const apiServices = [
    { name: 'microlink', endpoint: 'https://api.microlink.io/' },
    { name: 'linkpreview', endpoint: 'https://api.linkpreview.net/' }
  ]
  
  for (const service of apiServices) {
    try {
      const response = await fetch(`${service.endpoint}?url=${encodeURIComponent(url)}`)
      const data = await response.json()
      
      if (service.name === 'microlink' && data.status === 'success') {
        return {
          title: data.data.title || '',
          description: data.data.description || '',
          image: data.data.image?.url || null,
          url: data.data.url || url,
          siteName: data.data.publisher || ''
        }
      }
    } catch (error) {
      console.warn(`${service.name} API failed:`, error)
      continue
    }
  }
  
  return { title: '', description: '', image: null, url }
}

// lib/services/metadata/site-handlers.ts - 特定サイト専用パーサー
export const siteHandlers = {
  async handleGitHub(url: string, metadata: Metadata): Promise<Metadata> {
    // GitHub特有の情報を追加取得
    const repoMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)/)
    if (repoMatch) {
      const [, owner, repo] = repoMatch
      // GitHub API呼び出しでstar数、言語等を取得
      metadata.tags = ['GitHub', 'Development']
      metadata.type = 'repository'
    }
    return metadata
  },
  
  async handleTwitter(url: string, metadata: Metadata): Promise<Metadata> {
    // Twitter URLの特別処理
    metadata.tags = ['Twitter', 'Social']
    metadata.type = 'tweet'
    return metadata
  },
  
  async handleYouTube(url: string, metadata: Metadata): Promise<Metadata> {
    // YouTube動画の情報強化
    metadata.tags = ['YouTube', 'Video']
    metadata.type = 'video'
    return metadata
  }
}
```

### 状態管理
```typescript
// Zustand による軽量な状態管理
import { create } from 'zustand'

interface BookmarkStore {
  bookmarks: Bookmark[]
  loading: boolean
  filters: BookmarkFilters
  setBookmarks: (bookmarks: Bookmark[]) => void
  addBookmark: (bookmark: Bookmark) => void
  updateBookmark: (id: string, updates: Partial<Bookmark>) => void
  setFilters: (filters: BookmarkFilters) => void
}

export const useBookmarkStore = create<BookmarkStore>((set, get) => ({
  // ストア実装
}))
```

## Chrome拡張機能 アーキテクチャ

### Manifest V3 構成
```json
{
  "manifest_version": 3,
  "name": "Encore - Read Later",
  "version": "1.0.0",
  "permissions": [
    "activeTab",
    "storage",
    "contextMenus"
  ],
  "host_permissions": [
    "https://your-encore-app.vercel.app/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"]
    }
  ],
  "action": {
    "default_popup": "popup.html"
  }
}
```

### 拡張機能とWebアプリの連携
- PostMessage API による通信
- JWT トークンベースの認証
- Chrome Storage API でのローカル設定保存

## セキュリティ・パフォーマンス考慮事項

### セキュリティ
- Supabase Row Level Security (RLS) による認可
- CSRF 保護（Next.js内蔵）
- XSS 対策（React の自動エスケープ）
- URL バリデーション
- レート制限の実装

### パフォーマンス
- Next.js Server Components による初期レンダリング最適化
- Virtual scrolling による大量データ表示
- 画像の遅延読み込み・WebP対応
- CDN 配信（Vercel Edge Network）
- データベースクエリ最適化
- キャッシュ戦略（Redis検討）