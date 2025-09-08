/**
 * 統一URL正規化モジュール
 * Edge/Node/Client間で完全に同一の実装を使用（差し戻し対策）
 */

import type * as cheerio from 'cheerio'

/**
 * URL正規化関数（重複防止・差し戻し対策）
 * Edge/Node/Client間で完全に同一の実装を使用する
 */
export function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url)

    // 1. ホスト名の小文字化
    urlObj.hostname = urlObj.hostname.toLowerCase()

    // 2. デフォルトポート削除
    if (
      (urlObj.protocol === 'http:' && urlObj.port === '80') ||
      (urlObj.protocol === 'https:' && urlObj.port === '443')
    ) {
      urlObj.port = ''
    }

    // 3. フラグメント除去
    urlObj.hash = ''

    // 4. トラッキングパラメータ除去（統一リスト）
    const trackingParams = [
      // Google Analytics & Ads
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'utm_id',
      'utm_source_platform',
      'utm_creative_format',
      'utm_marketing_tactic',
      '_ga',
      '_gl',
      'gclid',
      'gclsrc',
      'dclid',
      'wbraid',
      'gbraid',

      // Facebook & Social
      'fbclid',
      'fb_action_ids',
      'fb_action_types',
      'fb_ref',
      'fb_source',

      // Microsoft
      'msclkid',
      'mc_eid',
      'mc_cid',

      // Other tracking
      'ref',
      'source',
      'campaign',
      'medium',
      'content',
      '_hsenc',
      '_hsmi',
      'hsCtaTracking', // HubSpot
      'vero_conv',
      'vero_id', // Vero
      'pk_campaign',
      'pk_kwd',
      'pk_medium',
      'pk_source', // Piwik/Matomo

      // Email tracking
      'email_source',
      'email_campaign',
      'email_id',
    ]

    for (const param of trackingParams) {
      urlObj.searchParams.delete(param)
    }

    // 5. クエリキーのソート（残存パラメータの順序統一）
    const sortedParams = new URLSearchParams()
    for (const [key, value] of Array.from(urlObj.searchParams.entries()).sort(
      ([a], [b]) => a.localeCompare(b),
    )) {
      sortedParams.append(key, value)
    }
    urlObj.search = sortedParams.toString()

    // 6. 末尾スラッシュ統一（パスがルートでない場合のみ削除）
    let normalizedUrl = urlObj.toString()
    if (urlObj.pathname !== '/' && normalizedUrl.endsWith('/')) {
      normalizedUrl = normalizedUrl.slice(0, -1)
    }

    return normalizedUrl
  } catch (error) {
    // URL形式エラー時は元のURLを返す
    console.warn('URL normalization failed:', error)
    return url
  }
}

/**
 * URL正規化の妥当性検証（開発/テスト用）
 * 正規化前後でのURL整合性をチェック
 */
export function validateNormalization(
  originalUrl: string,
  normalizedUrl: string,
): boolean {
  try {
    const original = new URL(originalUrl)
    const normalized = new URL(normalizedUrl)

    // 基本要素が保持されていることを確認
    return (
      original.protocol === normalized.protocol &&
      original.hostname.toLowerCase() === normalized.hostname &&
      original.pathname === normalized.pathname
    )
  } catch {
    return false
  }
}

/**
 * 相対URL→絶対URL変換（<base href>対応）
 */
export function makeAbsoluteUrl(
  href: string,
  baseUrl: string,
  $?: cheerio.CheerioAPI,
): string {
  try {
    let effectiveBaseUrl = baseUrl

    // CheerioオブジェクトがあればHTML内の<base href>をチェック
    if ($ && typeof $ === 'function') {
      const baseHref = $('base[href]').attr('href')
      if (baseHref) {
        try {
          // <base href>が見つかった場合、それを基準URLとして使用
          effectiveBaseUrl = new URL(baseHref, baseUrl).href
        } catch (error) {
          console.warn(
            'Invalid base href detected, using original baseUrl:',
            baseHref,
            error,
          )
        }
      }
    }

    return new URL(href, effectiveBaseUrl).href
  } catch {
    return ''
  }
}

/**
 * 基本的なURL検証（Edge Runtime用軽量版）
 */
export function validateBasicUrl(url: string): void {
  const urlObj = new URL(url)

  // プロトコル制限
  if (!['http:', 'https:'].includes(urlObj.protocol)) {
    throw new Error(`Unsupported protocol: ${urlObj.protocol}`)
  }
}
