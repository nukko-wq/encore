# Encore - メタデータ抽出システム

## フォルダ構成

```
src/
├── app/
│   ├── api/
│   │   ├── extract/
│   │   │   ├── route.ts          -- Edge超軽量抽出
│   │   │   ├── deep/
│   │   │   │   └── route.ts      -- Node精度重視
│   │   │   └── external/
│   │   │       └── route.ts      -- 外部APIフォールバック
│   │   ├── cron/
│   │   │   └── revalidate/
│   │   │       └── route.ts      -- バックグラウンド再取得
├── lib/
│   └── services/
│       └── metadata/
│           ├── edge-extractor.ts     -- Edge超軽量抽出
│           ├── node-extractor.ts     -- Node精度重視
│           ├── external-api.ts       -- 外部APIフォールバック
│           ├── site-handlers.ts      -- 特定サイト専用パーサー
│           ├── cache-manager.ts      -- キャッシュ管理
│           └── index.ts              -- 統合サービス
```

## メタデータ抽出システム設計（現実解）

### 実装方針（Vercel対応）
- **Edge**: 認可チェック、軽量リダイレクト、キャッシュ判定など"薄い"処理のみ
- **Node**: URL取得→HTML取得→OGP/メタ抽出→本文抜粋の実質的処理
- **HTMLRewriter**: Vercelで使用不可のため、Cheerioで代替

### APIルート構成

#### メインメタデータ抽出（Node）
```typescript
// app/api/preview/route.ts - メイン抽出処理（Node.js Runtime）
export const runtime = 'nodejs'

import * as cheerio from 'cheerio'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'

export async function POST(request: Request) {
  const { url } = await request.json()
  
  if (!url) return Response.json({ error: 'URL required' }, { status: 400 })
  
  try {
    // URL取得
    const response = await fetch(url, {
      headers: { 
        'User-Agent': 'EncoreBot/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(10000)
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const html = await response.text()
    const $ = cheerio.load(html)
    
    // OGP/メタデータ抽出（優先度順）
    const title = 
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text().trim() ||
      ''
    
    const description = 
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      ''
    
    const image = 
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('link[rel="apple-touch-icon"]').attr('href') ||
      ''
    
    const siteName = 
      $('meta[property="og:site_name"]').attr('content') ||
      $('meta[name="application-name"]').attr('content') ||
      ''
    
    const favicon = 
      $('link[rel="icon"]').attr('href') ||
      $('link[rel="shortcut icon"]').attr('href') ||
      '/favicon.ico'
    
    // 相対URLを絶対URLに変換
    const absoluteImage = image ? new URL(image, url).href : ''
    const absoluteFavicon = favicon ? new URL(favicon, url).href : ''
    
    // descriptionが無い場合はReadabilityで本文抜粋
    let extractedDescription = description
    if (!extractedDescription && html) {
      try {
        const dom = new JSDOM(html, { url })
        const reader = new Readability(dom.window.document)
        const article = reader.parse()
        
        if (article?.textContent) {
          // 日本語対応: 全角160-200文字程度に制限
          extractedDescription = article.textContent
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 200) + (article.textContent.length > 200 ? '...' : '')
        }
      } catch (readabilityError) {
        console.warn('Readability extraction failed:', readabilityError)
      }
    }
    
    const metadata = {
      title,
      description: extractedDescription,
      image: absoluteImage,
      favicon: absoluteFavicon,
      siteName,
      url
    }
    
    return Response.json({
      success: true,
      data: metadata,
      source: 'node'
    })
    
  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message,
      source: 'node' 
    }, { status: 500 })
  }
}
```

#### Edge軽量処理（認可・キャッシュ制御）
```typescript
// app/api/preview/check/route.ts - Edge軽量処理
export const runtime = 'edge'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  
  if (!url) return Response.json({ error: 'URL required' }, { status: 400 })
  
  try {
    // URL正規化
    const normalizedUrl = normalizeUrl(url)
    
    // キャッシュチェック（Supabase）
    const cached = await checkCachedPreview(normalizedUrl)
    
    if (cached && !shouldRevalidate(cached)) {
      return Response.json({
        cached: true,
        data: cached,
        source: 'cache'
      })
    }
    
    // キャッシュが無い、または期限切れの場合
    return Response.json({
      cached: false,
      shouldFetch: true,
      normalizedUrl
    })
    
  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message,
      source: 'edge' 
    }, { status: 500 })
  }
}

function normalizeUrl(url: string): string {
  const urlObj = new URL(url)
  
  // ホスト名の小文字化
  urlObj.hostname = urlObj.hostname.toLowerCase()
  
  // デフォルトポート削除
  if ((urlObj.protocol === 'http:' && urlObj.port === '80') ||
      (urlObj.protocol === 'https:' && urlObj.port === '443')) {
    urlObj.port = ''
  }
  
  // フラグメント除去
  urlObj.hash = ''
  
  // トラッキングパラメータ除去
  const trackingParams = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'fbclid', 'gclid', 'msclkid', '_ga', 'mc_eid', 'ref', 'source'
  ]
  trackingParams.forEach(param => urlObj.searchParams.delete(param))
  
  // クエリキーのソート
  const sortedParams = new URLSearchParams()
  Array.from(urlObj.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, value]) => sortedParams.append(key, value))
  urlObj.search = sortedParams.toString()
  
  // 末尾スラッシュ統一
  let normalizedUrl = urlObj.toString()
  if (urlObj.pathname !== '/' && normalizedUrl.endsWith('/')) {
    normalizedUrl = normalizedUrl.slice(0, -1)
  }
  
  return normalizedUrl
}
```

#### 外部APIフォールバック（オプション）
```typescript
// app/api/preview/external/route.ts - 外部APIフォールバック
export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (process.env.METADATA_EXTERNAL_ENABLED !== 'true') {
    return Response.json({ error: 'External API disabled' }, { status: 403 })
  }
  
  const { url } = await request.json()
  
  try {
    // Microlink APIを使用（例）
    const microlinkResponse = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`, {
      headers: {
        'X-API-Key': process.env.MICROLINK_API_KEY || ''
      }
    })
    
    const microlinkData = await microlinkResponse.json()
    
    if (microlinkData.status === 'success') {
      const metadata = {
        title: microlinkData.data.title || '',
        description: microlinkData.data.description || '',
        image: microlinkData.data.image?.url || '',
        favicon: microlinkData.data.logo?.url || '',
        siteName: microlinkData.data.publisher || '',
        url: microlinkData.data.url || url
      }
      
      return Response.json({
        success: true,
        data: metadata,
        source: 'external'
      })
    } else {
      throw new Error('External API failed')
    }
  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message,
      source: 'external' 
    }, { status: 500 })
  }
}
```

### 統合メタデータサービス
```typescript
// lib/services/metadata/index.ts
export class MetadataService {
  async extractMetadata(url: string): Promise<LinkPreview> {
    const normalizedUrl = this.normalizeUrl(url)
    
    // 1. Edge でキャッシュチェック
    const cacheCheck = await this.checkCache(normalizedUrl)
    if (cacheCheck.cached) {
      return cacheCheck.data
    }
    
    let metadata: Partial<LinkPreview> = {}
    let source = 'node'
    
    // 2. Node でメイン抽出処理
    try {
      const nodeResult = await this.callNodeExtractor(normalizedUrl)
      metadata = nodeResult.data
      source = 'node'
    } catch (nodeError) {
      console.warn('Node extraction failed:', nodeError)
      
      // 3. 外部APIフォールバック（オプション）
      if (process.env.METADATA_EXTERNAL_ENABLED === 'true') {
        try {
          const externalResult = await this.callExternalExtractor(normalizedUrl)
          metadata = externalResult.data
          source = 'external'
        } catch (externalError) {
          console.warn('External API failed:', externalError)
          // フォールバック: 最低限のメタデータを生成
          metadata = this.generateFallbackMetadata(normalizedUrl)
          source = 'fallback'
        }
      } else {
        // 外部API無効時のフォールバック
        metadata = this.generateFallbackMetadata(normalizedUrl)
        source = 'fallback'
      }
    }
    
    // 4. 特定サイト専用処理（オプション）
    const handler = this.getSiteHandler(normalizedUrl)
    if (handler) {
      metadata = await handler(normalizedUrl, metadata)
    }
    
    // 5. キャッシュ保存と返却
    const preview = await this.savePreviewCache(normalizedUrl, metadata, source)
    return preview
  }
  
  private async checkCache(url: string) {
    const response = await fetch(`/api/preview/check?url=${encodeURIComponent(url)}`)
    return await response.json()
  }
  
  private async callNodeExtractor(url: string) {
    const response = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    })
    
    if (!response.ok) {
      throw new Error(`Node extraction failed: ${response.statusText}`)
    }
    
    return await response.json()
  }
  
  private async callExternalExtractor(url: string) {
    const response = await fetch('/api/preview/external', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    })
    
    if (!response.ok) {
      throw new Error(`External extraction failed: ${response.statusText}`)
    }
    
    return await response.json()
  }
  
  private generateFallbackMetadata(url: string): Partial<LinkPreview> {
    const urlObj = new URL(url)
    
    return {
      title: `${urlObj.hostname}`,
      description: `Link to ${urlObj.hostname}`,
      image: '',
      favicon: `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`,
      siteName: urlObj.hostname,
      url
    }
  }
  
  private normalizeUrl(url: string): string {
    const urlObj = new URL(url)
    
    // 1. ホスト名の小文字化
    urlObj.hostname = urlObj.hostname.toLowerCase()
    
    // 2. デフォルトポート削除
    if ((urlObj.protocol === 'http:' && urlObj.port === '80') ||
        (urlObj.protocol === 'https:' && urlObj.port === '443')) {
      urlObj.port = ''
    }
    
    // 3. フラグメント除去
    urlObj.hash = ''
    
    // 4. トラッキングパラメータ除去
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', '_ga', 'mc_eid', 'ref', 'source'
    ]
    trackingParams.forEach(param => urlObj.searchParams.delete(param))
    
    // 5. クエリキーのソート（残すもの）
    const sortedParams = new URLSearchParams()
    Array.from(urlObj.searchParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([key, value]) => sortedParams.append(key, value))
    urlObj.search = sortedParams.toString()
    
    // 6. 末尾スラッシュ統一（パスがルートでない場合のみ削除）
    let normalizedUrl = urlObj.toString()
    if (urlObj.pathname !== '/' && normalizedUrl.endsWith('/')) {
      normalizedUrl = normalizedUrl.slice(0, -1)
    }
    
    return normalizedUrl
  }
  
  private getSiteHandler(url: string): ((url: string, metadata: any) => Promise<any>) | null {
    const urlObj = new URL(url)
    
    // Twitter/X専用ハンドラー（将来実装）
    if (urlObj.hostname.includes('twitter.com') || urlObj.hostname.includes('x.com')) {
      return this.handleTwitter
    }
    
    // YouTube専用ハンドラー（将来実装）
    if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
      return this.handleYoutube
    }
    
    return null
  }
  
  private async handleTwitter(url: string, metadata: any) {
    // Twitter専用処理（将来実装）
    return metadata
  }
  
  private async handleYoutube(url: string, metadata: any) {
    // YouTube専用処理（将来実装）
    return metadata
  }
}
```

### 依存関係（package.json）
```json
{
  "dependencies": {
    "cheerio": "^1.0.0-rc.12",
    "@mozilla/readability": "^0.4.4",
    "jsdom": "^23.0.1"
  },
  "devDependencies": {
    "@types/jsdom": "^21.1.6"
  }
}
```

## キャッシュ・再取得戦略

### キャッシュライフサイクル
```typescript
// キャッシュ管理サービス
export class CacheManager {
  // 初回取得時
  async savePreviewCache(url: string, metadata: LinkPreview, source: string): Promise<LinkPreview> {
    const preview = {
      url,
      ...metadata,
      source,
      status: this.determineStatus(metadata),
      fetched_at: new Date(),
      revalidate_at: new Date(Date.now() + this.getTTL(source)),
      retry_count: 0
    }
    
    return await supabase.from('link_previews').upsert(preview).single()
  }
  
  // TTL設定（ソース別）
  private getTTL(source: string): number {
    const ttlMap = {
      'edge': 7 * 24 * 60 * 60 * 1000,     // 7日
      'node': 14 * 24 * 60 * 60 * 1000,    // 14日
      'external': 30 * 24 * 60 * 60 * 1000, // 30日
      'failed': 6 * 60 * 60 * 1000         // 6時間（失敗時）
    }
    return ttlMap[source] || ttlMap['edge']
  }
  
  // ステータス判定
  private determineStatus(metadata: LinkPreview): string {
    if (metadata.title && (metadata.description || metadata.image)) {
      return 'success'
    } else if (metadata.title) {
      return 'partial'
    } else {
      return 'failed'
    }
  }
  
  // 手動再取得
  async forceRevalidate(url: string): Promise<LinkPreview> {
    // キャッシュを無視して再取得
    return await this.metadataService.extractMetadata(url)
  }
}
```

### バックグラウンド再取得（Vercel Cron）

#### 再取得運用ポリシー
- **実行頻度**: 1日1回（深夜時間帯）
- **処理上限**: 1回あたり最大100件のプレビューを処理
- **対象選定**: 期限切れの成功プレビューを優先、失敗プレビューは指数的バックオフ
- **バックオフ戦略**: 失敗回数に応じて再試行確率を低下（0.5^retry_count）
- **レートリミット**: リクエスト間に100ms遅延、外部API負荷を考慮

```typescript
// app/api/cron/revalidate/route.ts
export async function GET(request: Request) {
  // 認証チェック
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  
  try {
    // 再取得対象を優先度順で抽出（上位100件）
    // 1. 成功プレビューの期限切れ（最優先）
    // 2. 失敗プレビューの指数的バックオフ対象
    const expiredPreviews = await supabase
      .from('link_previews')
      .select('url, status, retry_count, fetched_at')
      .lt('revalidate_at', new Date().toISOString())
      .order('status', { ascending: false }) // 'success' > 'partial' > 'failed'
      .order('fetched_at', { ascending: true }) // 古いものから優先
      .limit(100)
    
    const results = []
    
    let processedCount = 0
    let successCount = 0
    let errorCount = 0
    
    for (const preview of expiredPreviews.data || []) {
      try {
        // 指数的バックオフチェック（失敗プレビューのみ）
        if (preview.status === 'failed') {
          const backoffProbability = Math.pow(0.5, preview.retry_count)
          if (Math.random() > backoffProbability) {
            results.push({ url: preview.url, status: 'skipped', reason: 'backoff' })
            continue
          }
        }
        
        const updated = await metadataService.extractMetadata(preview.url)
        results.push({ url: preview.url, status: 'updated', source: updated.source })
        successCount++
        
        // レートリミットを考慮して遅延（外部API保護）
        await new Promise(resolve => setTimeout(resolve, 100))
        processedCount++
        
      } catch (error) {
        results.push({ 
          url: preview.url, 
          status: 'error', 
          error: error.message,
          retry_count: preview.retry_count + 1
        })
        errorCount++
        processedCount++
      }
    }
    
    return Response.json({ 
      success: true, 
      summary: {
        total_candidates: expiredPreviews.data?.length || 0,
        processed: processedCount,
        updated: successCount,
        errors: errorCount,
        skipped: results.filter(r => r.status === 'skipped').length
      },
      results 
    })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
```

### 手動再取得UI
```typescript
// components/bookmarks/refresh-preview-button.tsx
export function RefreshPreviewButton({ bookmark }: { bookmark: Bookmark }) {
  const [isLoading, setIsLoading] = useState(false)
  
  const handleRefresh = async () => {
    setIsLoading(true)
    try {
      await fetch('/api/bookmarks/refresh-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarkId: bookmark.id })
      })
      
      // UI更新
      router.refresh()
    } catch (error) {
      console.error('Preview refresh failed:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <button onClick={handleRefresh} disabled={isLoading}>
      {isLoading ? <Spinner /> : <RefreshIcon />}
      再取得
    </button>
  )
}
```

## 抽出優先度とデータ正規化

### 抽出優先度
```typescript
// タイトル優先度
const title = 
  $('meta[property="og:title"]').attr('content') ||
  $('meta[name="twitter:title"]').attr('content') ||
  $('title').text().trim()

// 説明優先度  
const description =
  $('meta[property="og:description"]').attr('content') ||
  $('meta[name="twitter:description"]').attr('content') ||
  $('meta[name="description"]').attr('content') ||
  await extractWithReadability(url) // Nodeのみ

// 画像優先度
const image =
  $('meta[property="og:image"]').attr('content') ||
  $('meta[name="twitter:image"]').attr('content') ||
  $('meta[name="twitter:image:src"]').attr('content') ||
  $('link[rel="apple-touch-icon"]').attr('href') ||
  $('link[rel="icon"]').attr('href')
```

### データ正規化ルール
```typescript
export function normalizeUrl(url: string): string {
  const urlObj = new URL(url)
  
  // 1. ホスト名の小文字化
  urlObj.hostname = urlObj.hostname.toLowerCase()
  
  // 2. デフォルトポート削除
  if ((urlObj.protocol === 'http:' && urlObj.port === '80') ||
      (urlObj.protocol === 'https:' && urlObj.port === '443')) {
    urlObj.port = ''
  }
  
  // 3. フラグメント除去
  urlObj.hash = ''
  
  // 4. トラッキングパラメータ除去
  const trackingParams = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'fbclid', 'gclid', 'msclkid', '_ga', 'mc_eid', 'ref', 'source'
  ]
  
  trackingParams.forEach(param => {
    urlObj.searchParams.delete(param)
  })
  
  // 5. クエリキーのソート（残すもの）
  const sortedParams = new URLSearchParams()
  Array.from(urlObj.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, value]) => sortedParams.append(key, value))
  urlObj.search = sortedParams.toString()
  
  // 6. 末尾スラッシュ統一（パスがルートでない場合のみ削除）
  let normalizedUrl = urlObj.toString()
  if (urlObj.pathname !== '/' && normalizedUrl.endsWith('/')) {
    normalizedUrl = normalizedUrl.slice(0, -1)
  }
  
  return normalizedUrl
}

export function makeAbsoluteUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).href
  } catch {
    return ''
  }
}
```

## 導入順序（現実的な段階実装）

### Phase 1: コア機能MVP
1. `/api/preview` NodeルートのCheerio実装（メイン抽出処理）
2. `link_previews`テーブル作成
3. 基本URL正規化機能
4. ブックマーク保存時のメタデータ連携

### Phase 2: パフォーマンス最適化
5. `/api/preview/check` Edgeルートのキャッシュチェック実装
6. Readabilityによる本文抜粋強化
7. 基本キャッシュライフサイクル管理

### Phase 3: 堅牢性向上
8. エラーハンドリング強化
9. フォールバックメタデータ生成
10. リトライ機能とタイムアウト調整

### Phase 4: 外部API連携（オプション）
11. `/api/preview/external`ルート実装
12. Microlink API連携
13. 環境変数で有効/無効切り替え

### Phase 5: 運用機能
14. Vercel Cronでのバックグラウンド再取得
15. 手動再取得ボタン
16. 特定サイト専用ハンドラー（Twitter、YouTube等）
17. 多層レートリミット実装
18. 指数的バックオフによる失敗リンク管理

### 技術的な利点
- **Vercel完全対応**: HTMLRewriterの制約から解放
- **依存関係明確**: cheerio, jsdom, readabilityの組み合わせ
- **段階的移行可能**: 将来Edge最適化が必要な場合も分離しやすい構成
- **デバッグ容易**: Node.jsランタイムで完全なログとエラー情報
- **メンテナンス性**: 一般的なライブラリによる実装で保守が容易