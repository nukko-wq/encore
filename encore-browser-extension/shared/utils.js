/**
 * 共通ユーティリティ関数
 */

/**
 * 日付フォーマット
 */
export const DateUtils = {
  /**
   * 日付を "YYYY/MM/DD HH:mm" 形式でフォーマット
   */
  formatDateTime(date) {
    if (!date) return ''

    const d = new Date(date)
    if (Number.isNaN(d.getTime())) return ''

    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')

    return `${year}/${month}/${day} ${hours}:${minutes}`
  },

  /**
   * 相対時間を表示 ("2時間前" など)
   */
  formatRelativeTime(date) {
    if (!date) return ''

    const d = new Date(date)
    if (Number.isNaN(d.getTime())) return ''

    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMinutes / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMinutes < 1) return 'たった今'
    if (diffMinutes < 60) return `${diffMinutes}分前`
    if (diffHours < 24) return `${diffHours}時間前`
    if (diffDays < 7) return `${diffDays}日前`

    return this.formatDateTime(date)
  },
}

/**
 * URL関連ユーティリティ
 */
export const UrlUtils = {
  /**
   * URLを短縮表示用にフォーマット
   */
  formatDisplayUrl(url, maxLength = 60) {
    if (!url) return ''

    try {
      const urlObj = new URL(url)
      let displayUrl = `${urlObj.hostname}${urlObj.pathname}`

      if (urlObj.search) {
        displayUrl += '?...'
      }

      if (displayUrl.length > maxLength) {
        displayUrl = `${displayUrl.substring(0, maxLength - 3)}...`
      }

      return displayUrl
    } catch (_error) {
      // 無効なURLの場合はそのまま短縮
      return url.length > maxLength
        ? `${url.substring(0, maxLength - 3)}...`
        : url
    }
  },

  /**
   * URLのドメインを取得
   */
  getDomain(url) {
    if (!url) return ''

    try {
      const urlObj = new URL(url)
      return urlObj.hostname
    } catch (_error) {
      return ''
    }
  },

  /**
   * URLが有効かチェック
   */
  isValidUrl(url) {
    if (!url) return false

    try {
      new URL(url)
      return true
    } catch (_error) {
      return false
    }
  },
}

/**
 * テキスト関連ユーティリティ
 */
export const TextUtils = {
  /**
   * テキストを指定文字数で切り詰め
   */
  truncate(text, maxLength = 100, suffix = '...') {
    if (!text) return ''
    if (text.length <= maxLength) return text

    return text.substring(0, maxLength - suffix.length) + suffix
  },

  /**
   * HTMLタグを除去
   */
  stripHtml(html) {
    if (!html) return ''

    // 簡単なHTMLタグ除去（完璧ではないが拡張機能用途では十分）
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&[^;]+;/g, ' ')
      .trim()
  },

  /**
   * 文字列をキャメルケースに変換
   */
  toCamelCase(str) {
    if (!str) return ''

    return str
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
        return index === 0 ? word.toLowerCase() : word.toUpperCase()
      })
      .replace(/\s+/g, '')
  },

  /**
   * 検索文字列をハイライト用にエスケープ
   */
  escapeRegExp(string) {
    if (!string) return ''
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  },
}

/**
 * 配列関連ユーティリティ
 */
export const ArrayUtils = {
  /**
   * 配列から重複を除去
   */
  unique(array) {
    return [...new Set(array)]
  },

  /**
   * 配列を指定サイズに分割
   */
  chunk(array, size) {
    const chunks = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  },

  /**
   * 配列の要素をシャッフル
   */
  shuffle(array) {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  },
}

/**
 * カラー関連ユーティリティ
 */
export const ColorUtils = {
  /**
   * ランダムなタグカラーを生成
   */
  getRandomTagColor() {
    const colors = [
      '#3B82F6', // Blue
      '#10B981', // Green
      '#F59E0B', // Yellow
      '#EF4444', // Red
      '#8B5CF6', // Purple
      '#F97316', // Orange
      '#06B6D4', // Cyan
      '#84CC16', // Lime
      '#EC4899', // Pink
      '#6B7280', // Gray
    ]

    return colors[Math.floor(Math.random() * colors.length)]
  },

  /**
   * 色の明度を判定（テキストカラー決定用）
   */
  isLightColor(hexColor) {
    if (!hexColor) return true

    // #を除去
    const hex = hexColor.replace('#', '')

    // RGB値に変換
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)

    // 輝度を計算（W3Cの推奨式）
    const brightness = (r * 299 + g * 587 + b * 114) / 1000

    return brightness > 128
  },
}

/**
 * ストレージ関連ユーティリティ
 */
export const StorageUtils = {
  /**
   * Chrome storage に安全にデータを保存
   */
  async set(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value })
    } catch (error) {
      console.error('Storage set error:', error)
      throw new Error('データの保存に失敗しました')
    }
  },

  /**
   * Chrome storage からデータを取得
   */
  async get(key, defaultValue = null) {
    try {
      const result = await chrome.storage.local.get([key])
      return result[key] !== undefined ? result[key] : defaultValue
    } catch (error) {
      console.error('Storage get error:', error)
      return defaultValue
    }
  },

  /**
   * Chrome storage からデータを削除
   */
  async remove(key) {
    try {
      await chrome.storage.local.remove([key])
    } catch (error) {
      console.error('Storage remove error:', error)
      throw new Error('データの削除に失敗しました')
    }
  },

  /**
   * Chrome storage をクリア
   */
  async clear() {
    try {
      await chrome.storage.local.clear()
    } catch (error) {
      console.error('Storage clear error:', error)
      throw new Error('ストレージのクリアに失敗しました')
    }
  },
}

/**
 * パフォーマンス関連ユーティリティ
 */
export const PerformanceUtils = {
  /**
   * デバウンス処理
   */
  debounce(func, wait) {
    let timeout
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout)
        func(...args)
      }
      clearTimeout(timeout)
      timeout = setTimeout(later, wait)
    }
  },

  /**
   * スロットル処理
   */
  throttle(func, wait) {
    let inThrottle
    return function executedFunction(...args) {
      if (!inThrottle) {
        func.apply(this, args)
        inThrottle = true
        setTimeout(() => (inThrottle = false), wait)
      }
    }
  },

  /**
   * 処理時間を測定
   */
  measureTime(label, func) {
    return async (...args) => {
      const start = performance.now()

      try {
        const result = await func(...args)
        const end = performance.now()
        console.log(`${label}: ${(end - start).toFixed(2)}ms`)
        return result
      } catch (error) {
        const end = performance.now()
        console.log(`${label} (error): ${(end - start).toFixed(2)}ms`)
        throw error
      }
    }
  },
}

/**
 * エラーハンドリングユーティリティ
 */
export const ErrorUtils = {
  /**
   * エラーを安全に文字列化
   */
  stringify(error) {
    if (!error) return 'Unknown error'

    if (typeof error === 'string') return error

    if (error.message) return error.message

    try {
      return JSON.stringify(error)
    } catch (_jsonError) {
      return String(error)
    }
  },

  /**
   * エラーログを出力
   */
  log(error, context = '') {
    const message = this.stringify(error)
    const timestamp = new Date().toISOString()
    console.error(`[${timestamp}] ${context}: ${message}`, error)
  },
}

/**
 * バリデーション関連ユーティリティ
 */
export const ValidationUtils = {
  /**
   * メールアドレスの形式をチェック
   */
  isValidEmail(email) {
    if (!email) return false

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  },

  /**
   * タグ名の妥当性をチェック
   */
  isValidTagName(tagName) {
    if (!tagName || typeof tagName !== 'string') return false

    const trimmed = tagName.trim()
    if (trimmed.length === 0 || trimmed.length > 50) return false

    // 特殊文字をチェック（基本的な文字、数字、ハイフン、アンダースコアのみ許可）
    const validChars = /^[\w\-\s\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+$/
    return validChars.test(trimmed)
  },

  /**
   * URLの妥当性をチェック
   */
  isValidBookmarkUrl(url) {
    if (!url) return false

    try {
      const urlObj = new URL(url)
      return ['http:', 'https:'].includes(urlObj.protocol)
    } catch (_error) {
      return false
    }
  },
}

/**
 * クッキー関連ユーティリティ
 */
export const CookieUtils = {
  /**
   * 指定されたドメインからクッキーを取得
   */
  async getCookies(url, name = null) {
    try {
      if (!chrome.cookies) {
        console.warn('Cookie API not available')
        return null
      }

      const details = { url }
      if (name) {
        details.name = name
      }

      if (name) {
        // 特定のクッキーを取得
        const cookie = await chrome.cookies.get(details)
        return cookie
      } else {
        // 全てのクッキーを取得
        const cookies = await chrome.cookies.getAll(details)
        return cookies
      }
    } catch (error) {
      console.error('Cookie get error:', error)
      return null
    }
  },

  /**
   * Supabaseの認証関連クッキーを取得
   */
  async getSupabaseCookies(domain = 'localhost:3002') {
    try {
      const url = domain.startsWith('http') ? domain : `http://${domain}`
      const cookies = await this.getCookies(url)

      if (!cookies) return null

      // Supabaseの認証関連クッキーをフィルタリング
      const authCookies = cookies.filter(
        (cookie) =>
          cookie.name.includes('supabase') ||
          cookie.name.includes('auth') ||
          cookie.name.includes('session'),
      )

      return authCookies.length > 0 ? authCookies : null
    } catch (error) {
      console.error('Supabase cookies get error:', error)
      return null
    }
  },
}
