# Encore - セキュリティ・パフォーマンス

## セキュリティ考慮事項

### SSRF/セキュリティ対策
```typescript
// lib/security/url-validator.ts
export class UrlValidator {
  private static readonly ALLOWED_PROTOCOLS = ['http:', 'https:']
  private static readonly PRIVATE_IP_RANGES = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^127\./,
    /^169\.254\./,
    /^::1$/,
    /^fc00:/,
    /^fe80:/
  ]
  
  static validate(url: string): { valid: boolean; error?: string } {
    try {
      const parsed = new URL(url)
      
      // プロトコルチェック
      if (!this.ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
        return { valid: false, error: 'Invalid protocol' }
      }
      
      // プライベートIPチェック
      if (this.isPrivateIP(parsed.hostname)) {
        return { valid: false, error: 'Private IP not allowed' }
      }
      
      // ループバックチェック
      if (parsed.hostname === 'localhost' || parsed.hostname === '0.0.0.0') {
        return { valid: false, error: 'Loopback not allowed' }
      }
      
      return { valid: true }
    } catch (error) {
      return { valid: false, error: 'Invalid URL format' }
    }
  }
  
  private static isPrivateIP(hostname: string): boolean {
    return this.PRIVATE_IP_RANGES.some(range => range.test(hostname))
  }
}
```

### リクエスト制限とタイムアウト
```typescript
// lib/http/safe-fetch.ts
export async function safeFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // URLバリデーション
  const validation = UrlValidator.validate(url)
  if (!validation.valid) {
    throw new Error(`URL validation failed: ${validation.error}`)
  }
  
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒タイムアウト
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'EncoreMetaBot/1.0',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja,en;q=0.9',
        ...options.headers
      },
      // サイズ制限（先靣1-2MBで打ち切り）
      // Note: 実際はstreamで処理してサイズチェック
    })
    
    // リダイレクト制限（最大5回）
    if (response.redirected && this.getRedirectCount(response) > 5) {
      throw new Error('Too many redirects')
    }
    
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}
```

### 多層レートリミット
```typescript
// app/api/extract/route.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

// ユーザーベースのレートリミット（認証済みユーザー用）
const userRateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, '1 m'), // 認証済みユーザー：1分間20リクエスト
})

// IPベースのレートリミット（未認証・フォールバック用）
const ipRateLimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 未認証：1分間10リクエスト
})

export async function GET(request: Request) {
  // 認証状態をチェック
  const supabase = createServerComponentClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  
  let identifier: string
  let rateLimit: Ratelimit
  
  if (user) {
    // 認証済みユーザー：ユーザーIDベースでレートリミット
    identifier = user.id
    rateLimit = userRateLimit
  } else {
    // 未認証ユーザー：IPベースでレートリミット
    identifier = request.headers.get('x-forwarded-for') ?? '127.0.0.1'
    rateLimit = ipRateLimit
  }
  
  const { success } = await rateLimit.limit(identifier)
  
  if (!success) {
    return new Response('Rate limit exceeded', { status: 429 })
  }
  
  // メタデータ抽出処理...
}
```

### セキュリティヘッダーの設定
```typescript
// next.config.js
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'",
          },
        ],
      },
    ]
  },
}
```

## パフォーマンス最適化

### 最適化のポイント
- **Edge First**: 大部分のリクエストはEdgeで完結（低レイテンシ・低コスト）
- **キャッシュ優先**: DBからの取得を最優先、リクエスト数を抑制
- **バックグラウンド更新**: ユーザー体験を阻害しない非同期更新
- **段階的フォールバック**: 必要時のみ高コストAPIを使用
- **統合キャッシュ**: ユーザー間でキャッシュを共有、重複リクエスト排除
- **スマート再取得**: 指数的バックオフで失敗リンクの無駄な再試行を抑制
- **多層レートリミット**: ユーザーID優先、IP フォールバックで安定制御

### 画像最適化とCDN活用
```typescript
// next.config.js - 画像最適化設定
const nextConfig = {
  images: {
    domains: ['example.com', 'cdn.example.com'],
    formats: ['image/webp', 'image/avif'],
    sizes: '100vw',
    minimumCacheTTL: 31536000, // 1年
  },
  
  // CDN最適化
  assetPrefix: process.env.NODE_ENV === 'production' 
    ? 'https://cdn.example.com' 
    : '',
}

// components/ui/optimized-image.tsx
import Image from 'next/image'
import { useState } from 'react'

interface OptimizedImageProps {
  src: string
  alt: string
  className?: string
  fallbackSrc?: string
}

export function OptimizedImage({ src, alt, className, fallbackSrc }: OptimizedImageProps) {
  const [imgSrc, setImgSrc] = useState(src)
  const [loading, setLoading] = useState(true)

  const handleError = () => {
    if (fallbackSrc && imgSrc !== fallbackSrc) {
      setImgSrc(fallbackSrc)
    }
  }

  const handleLoad = () => {
    setLoading(false)
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {loading && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      )}
      <Image
        src={imgSrc}
        alt={alt}
        fill
        className={`object-cover transition-opacity duration-300 ${
          loading ? 'opacity-0' : 'opacity-100'
        }`}
        onError={handleError}
        onLoad={handleLoad}
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      />
    </div>
  )
}
```

### Virtual Scrolling（大量データ対応）
```typescript
// components/bookmarks/virtual-bookmark-list.tsx
import { FixedSizeList as List } from 'react-window'
import { BookmarkCard } from './bookmark-card'
import type { BookmarkRow } from '@/types/database'

interface VirtualBookmarkListProps {
  bookmarks: BookmarkRow[]
  height: number
  itemHeight: number
}

export function VirtualBookmarkList({ 
  bookmarks, 
  height = 600, 
  itemHeight = 200 
}: VirtualBookmarkListProps) {
  const renderItem = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style}>
      <BookmarkCard bookmark={bookmarks[index]} />
    </div>
  )

  return (
    <List
      height={height}
      itemCount={bookmarks.length}
      itemSize={itemHeight}
      overscanCount={5} // パフォーマンス向上のための先読み
    >
      {renderItem}
    </List>
  )
}
```

### Infinite Scroll（無限スクロール）
```typescript
// hooks/use-infinite-bookmarks.ts
import { useState, useEffect, useCallback } from 'react'
import { useInView } from 'react-intersection-observer'
import { BookmarkService } from '@/lib/services/bookmarks'
import type { BookmarkRow } from '@/types/database'

const ITEMS_PER_PAGE = 20

export function useInfiniteBookmarks(filters?: BookmarkFilters) {
  const [bookmarks, setBookmarks] = useState<BookmarkRow[]>([])
  const [loading, setLoading] = useState(false)
  const [hasNextPage, setHasNextPage] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const bookmarkService = new BookmarkService()
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '100px',
  })

  const loadBookmarks = useCallback(async (page: number = 0, reset: boolean = false) => {
    if (loading) return

    setLoading(true)
    setError(null)

    try {
      const newBookmarks = await bookmarkService.getBookmarks({
        ...filters,
        offset: page * ITEMS_PER_PAGE,
        limit: ITEMS_PER_PAGE,
      })

      if (reset) {
        setBookmarks(newBookmarks)
      } else {
        setBookmarks(prev => [...prev, ...newBookmarks])
      }

      setHasNextPage(newBookmarks.length === ITEMS_PER_PAGE)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bookmarks')
    } finally {
      setLoading(false)
    }
  }, [filters, loading])

  // 初回読み込み
  useEffect(() => {
    loadBookmarks(0, true)
  }, [filters])

  // 無限スクロール
  useEffect(() => {
    if (inView && hasNextPage && !loading) {
      const currentPage = Math.floor(bookmarks.length / ITEMS_PER_PAGE)
      loadBookmarks(currentPage)
    }
  }, [inView, hasNextPage, loading, bookmarks.length, loadBookmarks])

  const refetch = useCallback(() => {
    loadBookmarks(0, true)
  }, [loadBookmarks])

  return {
    bookmarks,
    loading,
    error,
    hasNextPage,
    loadMoreRef,
    refetch,
  }
}
```

### Service Worker（PWA対応）
```typescript
// public/sw.js - Service Worker for caching
const CACHE_NAME = 'encore-v1'
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache)
      })
  )
})

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // キャッシュがあればそれを返す
        if (response) {
          return response
        }

        // キャッシュがない場合はネットワークから取得
        return fetch(event.request).then((response) => {
          // レスポンスが有効でない場合はそのまま返す
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response
          }

          // レスポンスをクローンしてキャッシュに保存
          const responseToCache = response.clone()
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache)
            })

          return response
        })
      })
  )
})
```

### Bundle Size Optimization
```typescript
// next.config.js - バンドル最適化
const nextConfig = {
  // Tree shaking の最適化
  experimental: {
    optimizeCss: true,
    swcMinify: true,
  },

  // Bundle analyzer
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback.fs = false
    }

    // Bundle analyzer (開発時のみ)
    if (process.env.ANALYZE === 'true') {
      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'server',
          analyzerPort: 8888,
          openAnalyzer: true,
        })
      )
    }

    return config
  },

  // 動的インポート
  experimental: {
    esmExternals: 'loose',
  },
}

// Dynamic imports example
const BookmarkForm = dynamic(() => import('./bookmark-form'), {
  loading: () => <div>Loading...</div>,
  ssr: false,
})
```

## 監視・ログ

### Error Tracking（Sentry設定）
```typescript
// lib/sentry.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  beforeSend(event) {
    // プライベート情報のフィルタリング
    if (event.request?.headers) {
      delete event.request.headers.authorization
      delete event.request.headers.cookie
    }
    return event
  },
})

// エラーレポート用ヘルパー
export const reportError = (error: Error, context?: Record<string, any>) => {
  console.error('Error:', error)
  
  Sentry.withScope((scope) => {
    if (context) {
      Object.keys(context).forEach(key => {
        scope.setTag(key, context[key])
      })
    }
    Sentry.captureException(error)
  })
}
```

### Analytics and Performance Monitoring
```typescript
// lib/analytics.ts
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals'

export function reportWebVitals() {
  getCLS(sendToAnalytics)
  getFID(sendToAnalytics)
  getFCP(sendToAnalytics)
  getLCP(sendToAnalytics)
  getTTFB(sendToAnalytics)
}

function sendToAnalytics(metric: any) {
  // Google Analytics 4 に送信
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', metric.name, {
      custom_map: { metric_id: 'dimension1' },
      metric_id: metric.id,
      metric_value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
      metric_delta: metric.delta,
    })
  }
  
  // カスタム分析エンドポイントにも送信
  fetch('/api/analytics/web-vitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metric),
  }).catch(console.error)
}
```

## 環境変数設定

```bash
# 必須
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Google認証
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# メタデータ取得
METADATA_FALLBACK_ENABLED=false  # trueで外部API有効
MICROLINK_API_KEY=your_microlink_key  # オプション

# 日本語検索設定
SEARCH_MIN_SIMILARITY=0.1  # Trigram検索の類似度闾値

# Cronセキュリティ
CRON_SECRET=your_random_cron_secret

# レートリミット（Upstash Redis）
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token

# レートリミット設定
RATE_LIMIT_USER_RPM=20      # 認証済みユーザー：1分間のリクエスト数
RATE_LIMIT_IP_RPM=10        # 未認証ユーザー：1分間のリクエスト数

# Cronジョブ設定
CRON_REVALIDATE_LIMIT=100   # 1回の実行で処理する最大プレビュー数
CRON_REQUEST_DELAY=100      # リクエスト間の遅延（ms）

# 監視・ログ
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn
NEXT_PUBLIC_GA_MEASUREMENT_ID=your_ga_id

# CDN・最適化
NEXT_PUBLIC_CDN_URL=your_cdn_url
NEXT_PUBLIC_IMAGE_DOMAINS=example.com,cdn.example.com
```

## デバッグ情報保存
- `source`フィールドでどの段階で抽出できたか記録
- `status`で成功/部分成功/失敗を区別
- `retry_count`で再試行回数を記録
- `error_message`で失敗理由を保存
- `similarity_score`で検索結果の関連度を記録