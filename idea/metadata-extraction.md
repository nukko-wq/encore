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

## メタデータ抽出システム設計（三段構え）

### APIルート構成

#### Edge超軽量抽出
```typescript
// app/api/extract/route.ts - Edge超軽量抽出
export const runtime = 'edge'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  
  if (!url) return Response.json({ error: 'URL required' }, { status: 400 })
  
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'EncoreMetaBot/1.0' },
      signal: AbortSignal.timeout(5000)
    })
    
    const html = await response.text()
    
    // HTMLRewriterで軽量抽出
    const metadata = await extractWithHTMLRewriter(html, url)
    
    return Response.json({
      success: true,
      data: metadata,
      source: 'edge',
      complete: isComplete(metadata)
    })
  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message,
      source: 'edge' 
    }, { status: 500 })
  }
}
```

#### Node精度重視
```typescript
// app/api/extract/deep/route.ts - Node精度重視
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const { url } = await request.json()
  
  try {
    // metascraperで統合取得
    const metadata = await extractWithMetascraper(url)
    
    // descriptionが無い時はReadabilityで本文抜粋
    if (!metadata.description) {
      metadata.description = await extractContentWithReadability(url)
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

#### 外部APIフォールバック
```typescript
// app/api/extract/external/route.ts - 外部APIフォールバック
export async function POST(request: Request) {
  if (process.env.METADATA_EXTERNAL_ENABLED !== 'true') {
    return Response.json({ error: 'External API disabled' }, { status: 403 })
  }
  
  const { url } = await request.json()
  
  try {
    const metadata = await extractWithExternalAPI(url)
    
    return Response.json({
      success: true,
      data: metadata,
      source: 'external'
    })
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
    
    // 1. キャッシュチェック
    const cached = await this.getCachedPreview(normalizedUrl)
    if (cached && !this.shouldRevalidate(cached)) {
      return cached
    }
    
    let metadata: Partial<LinkPreview> = {}
    let source = 'edge'
    
    // 2. Edge超軽量抽出
    try {
      const edgeResult = await this.callEdgeExtractor(normalizedUrl)
      metadata = edgeResult.data
      
      // 完全でない場合は次の段階へ
      if (!edgeResult.complete) {
        // 3. Node精度重視
        try {
          const nodeResult = await this.callNodeExtractor(normalizedUrl)
          metadata = { ...metadata, ...nodeResult.data }
          source = 'node'
        } catch (nodeError) {
          console.warn('Node extraction failed:', nodeError)
          
          // 4. 外部APIフォールバック
          if (process.env.METADATA_EXTERNAL_ENABLED === 'true') {
            try {
              const externalResult = await this.callExternalExtractor(normalizedUrl)
              metadata = { ...metadata, ...externalResult.data }
              source = 'external'
            } catch (externalError) {
              console.warn('External API failed:', externalError)
            }
          }
        }
      }
    } catch (edgeError) {
      console.warn('Edge extraction failed:', edgeError)
      // Edgeで失敗した場合は直接Nodeへ
    }
    
    // 5. 特定サイト専用処理
    const handler = this.getSiteHandler(normalizedUrl)
    if (handler) {
      metadata = await handler(normalizedUrl, metadata)
    }
    
    // 6. キャッシュ保存と返却
    const preview = await this.savePreviewCache(normalizedUrl, metadata, source)
    return preview
  }
  
  private async callEdgeExtractor(url: string) {
    const response = await fetch(`/api/extract?url=${encodeURIComponent(url)}`)
    return await response.json()
  }
  
  private async callNodeExtractor(url: string) {
    const response = await fetch('/api/extract/deep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    })
    return await response.json()
  }
  
  private shouldRevalidate(cached: LinkPreview): boolean {
    return new Date() > new Date(cached.revalidate_at)
  }
  
  private normalizeUrl(url: string): string {
    // トラッキングパラメータ除去
    const urlObj = new URL(url)
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid']
    trackingParams.forEach(param => urlObj.searchParams.delete(param))
    
    // 末尾スラッシュ統一
    return urlObj.toString().replace(/\/$/, '')
  }
}
```

### Edge抽出器（HTMLRewriter）
```typescript
// lib/extractors/edge.ts
class MetaExtractor {
  title = ''
  description = ''
  image = ''
  favicon = ''
  
  element(element: Element) {
    const property = element.getAttribute('property')
    const name = element.getAttribute('name')
    const content = element.getAttribute('content')
    
    if (!content) return
    
    // タイトルの優先度
    if (!this.title) {
      if (property === 'og:title' || name === 'twitter:title') {
        this.title = content
      }
    }
    
    // 説明の優先度
    if (!this.description) {
      if (property === 'og:description' || name === 'twitter:description' || name === 'description') {
        this.description = content
      }
    }
    
    // 画像の優先度
    if (!this.image) {
      if (property === 'og:image' || name === 'twitter:image') {
        this.image = new URL(content, this.baseUrl).href
      }
    }
  }
}

export async function extractWithHTMLRewriter(html: string, baseUrl: string) {
  const extractor = new MetaExtractor()
  
  const rewriter = new HTMLRewriter()
    .on('meta', extractor)
    .on('title', {
      text(text) {
        if (!extractor.title) {
          extractor.title = text.text
        }
      }
    })
    .on('link[rel="icon"], link[rel="apple-touch-icon"]', {
      element(element) {
        if (!extractor.favicon) {
          const href = element.getAttribute('href')
          if (href) {
            extractor.favicon = new URL(href, baseUrl).href
          }
        }
      }
    })
  
  await rewriter.transform(new Response(html)).text()
  
  return {
    title: extractor.title,
    description: extractor.description,
    image: extractor.image,
    favicon: extractor.favicon
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
  
  // トラッキングパラメータ除去
  const trackingParams = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'fbclid', 'gclid', 'msclkid', '_ga', 'mc_eid'
  ]
  
  trackingParams.forEach(param => {
    urlObj.searchParams.delete(param)
  })
  
  // 末尾スラッシュ統一
  return urlObj.toString().replace(/\/$/, '')
}

export function makeAbsoluteUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).href
  } catch {
    return ''
  }
}
```

## 導入順序（小さく始めて伸ばせる）

### Phase 1: Edge Only MVP
1. `/api/extract` EdgeルートのHTMLRewriter実装
2. `link_previews`テーブル作成
3. 基本キャッシュ機能
4. ブックマーク保存時のEdge抽出連携

### Phase 2: Nodeフォールバック追加
5. `/api/extract/deep` Nodeルートのmetascraper実装
6. Readabilityによる本文抜粋機能
7. Edge→Nodeのフォールバックロジック

### Phase 3: 外部APIオプション
8. `/api/extract/external`ルート実装
9. Microlink API連携
10. 環境変数で有効/無効切り替え

### Phase 4: 運用機能
11. Vercel Cronでのバックグラウンド再取得（運用ポリシー含む）
12. 手動再取得ボタン
13. 多層レートリミット実装（ユーザーID + IP）
14. キャッシュ統計とモニタリング
15. 指数的バックオフによる失敗リンク管理