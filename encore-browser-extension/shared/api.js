/**
 * Encore API連携モジュール
 * ブックマーク管理システムとの通信を担当
 */

// API設定
const API_CONFIG = {
  // 開発環境の場合はlocalhostを使用
  baseUrl: 'http://localhost:3000', // Encore開発サーバー
  endpoints: {
    // 認証関連
    authUser: '/api/auth/user',
    authLogin: '/api/auth/login',
    authLogout: '/api/auth/logout',

    // ブックマーク関連
    bookmarks: '/api/bookmarks',
    bookmarkCreate: '/api/bookmarks',
    bookmarkUpdate: '/api/bookmarks',
    bookmarkDelete: '/api/bookmarks',

    // タグ関連
    tags: '/api/tags',
    tagCreate: '/api/tags',
    tagUpdate: '/api/tags',
    tagDelete: '/api/tags',
  },
  timeout: 10000, // 10秒タイムアウト
  retryAttempts: 3,
  retryDelay: 1000, // 1秒
}

/**
 * HTTP リクエストヘルパー
 */
class ApiClient {
  constructor() {
    this.baseUrl = API_CONFIG.baseUrl
    this.timeout = API_CONFIG.timeout
  }

  /**
   * 認証トークンを取得
   */
  async getAuthToken() {
    try {
      const result = await chrome.storage.local.get(['authToken'])
      return result.authToken || null
    } catch (error) {
      console.error('Failed to get auth token:', error)
      return null
    }
  }

  /**
   * 認証トークンを保存
   */
  async setAuthToken(token) {
    try {
      await chrome.storage.local.set({ authToken: token })
    } catch (error) {
      console.error('Failed to set auth token:', error)
    }
  }

  /**
   * 認証トークンを削除
   */
  async clearAuthToken() {
    try {
      await chrome.storage.local.remove(['authToken'])
    } catch (error) {
      console.error('Failed to clear auth token:', error)
    }
  }

  /**
   * HTTPリクエストを実行
   */
  async request(endpoint, options = {}) {
    const { method = 'GET', headers = {}, body, requireAuth = true } = options

    // 認証が必要な場合はトークンを取得
    const authHeaders = {}
    if (requireAuth) {
      const token = await this.getAuthToken()
      if (token) {
        authHeaders.Authorization = `Bearer ${token}`
      }
    }

    // リクエストオプションを構築
    const requestOptions = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...headers,
      },
    }

    // ボディがある場合は追加
    if (body) {
      if (typeof body === 'object') {
        requestOptions.body = JSON.stringify(body)
      } else {
        requestOptions.body = body
      }
    }

    // AbortControllerでタイムアウト制御
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)
    requestOptions.signal = controller.signal

    try {
      const url = `${this.baseUrl}${endpoint}`
      console.log(`API Request: ${method} ${url}`)

      const response = await fetch(url, requestOptions)
      clearTimeout(timeoutId)

      // レスポンスのログ
      console.log(`API Response: ${response.status} ${response.statusText}`)

      // レスポンスボディを一度だけ読み込み
      let data
      try {
        const responseText = await response.text()

        // 空のレスポンスの場合
        if (!responseText) {
          data = {}
        } else {
          // JSONとしてパース試行
          try {
            data = JSON.parse(responseText)
          } catch (jsonError) {
            console.warn('Failed to parse JSON response:', jsonError)
            data = { message: responseText }
          }
        }
      } catch (textError) {
        console.warn('Failed to read response text:', textError)
        data = { message: 'Failed to read response' }
      }

      if (!response.ok) {
        throw new ApiError(
          data.message || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          data,
        )
      }

      return {
        success: true,
        data,
        status: response.status,
      }
    } catch (error) {
      clearTimeout(timeoutId)

      if (error.name === 'AbortError') {
        throw new ApiError('Request timeout', 408)
      }

      if (error instanceof ApiError) {
        throw error
      }

      throw new ApiError(`Network error: ${error.message}`, 0, {
        originalError: error.message,
      })
    }
  }

  /**
   * リトライ付きリクエスト
   */
  async requestWithRetry(endpoint, options = {}) {
    let lastError

    for (let attempt = 1; attempt <= API_CONFIG.retryAttempts; attempt++) {
      try {
        return await this.request(endpoint, options)
      } catch (error) {
        lastError = error
        console.warn(`API request attempt ${attempt} failed:`, error.message)

        // 認証エラーやクライアントエラーはリトライしない
        if (error.status >= 400 && error.status < 500) {
          throw error
        }

        // 最後の試行でない場合は待機
        if (attempt < API_CONFIG.retryAttempts) {
          await new Promise((resolve) =>
            setTimeout(resolve, API_CONFIG.retryDelay * attempt),
          )
        }
      }
    }

    throw lastError
  }
}

/**
 * APIエラークラス
 */
class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

// APIクライアントインスタンス
const apiClient = new ApiClient()

/**
 * 認証API
 */
export const AuthAPI = {
  /**
   * 現在のユーザー情報を取得
   */
  async getCurrentUser() {
    try {
      const result = await apiClient.requestWithRetry(
        API_CONFIG.endpoints.authUser,
      )
      return result.data
    } catch (error) {
      if (error.status === 401) {
        // 認証トークンが無効な場合はクリア
        await apiClient.clearAuthToken()
        return null
      }
      throw error
    }
  },

  /**
   * ログアウト
   */
  async logout() {
    try {
      await apiClient.requestWithRetry(API_CONFIG.endpoints.authLogout, {
        method: 'POST',
      })
    } catch (error) {
      console.warn('Logout request failed:', error.message)
    } finally {
      // トークンは常にクリア
      await apiClient.clearAuthToken()
    }
  },

  /**
   * 認証状態をチェック
   * 1. 既存トークンチェック
   * 2. クッキーベースの認証チェック（新規追加）
   */
  async checkAuth() {
    // まず既存のトークンベース認証を試行
    const token = await apiClient.getAuthToken()
    if (token) {
      try {
        const user = await this.getCurrentUser()
        if (user) {
          return {
            isAuthenticated: true,
            user: user,
          }
        }
      } catch (_error) {
        console.log('Token-based auth failed, trying cookie-based auth')
      }
    }

    // トークンベース認証が失敗した場合、クッキーベース認証を試行
    try {
      const cookieAuthResult = await this.checkCookieAuth()
      return cookieAuthResult
    } catch (error) {
      console.error('Cookie-based auth failed:', error)
      return { isAuthenticated: false, user: null }
    }
  },

  /**
   * クッキーベースの認証状態をチェック
   */
  async checkCookieAuth() {
    try {
      console.log('Attempting cookie-based authentication...')

      // ネットワーク接続をテスト
      const testUrl = `${API_CONFIG.baseUrl}/api/auth/user`
      console.log('Testing network connection to:', testUrl)

      // 拡張機能専用エンドポイントを使用
      const response = await fetch(`${API_CONFIG.baseUrl}/api/extension/auth`, {
        method: 'GET',
        mode: 'cors', // CORS モードを明示的に指定
        credentials: 'include', // クッキーを含める
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      })

      console.log('Cookie auth response status:', response.status)

      if (!response.ok) {
        console.warn(
          `Cookie auth failed with status: ${response.status} ${response.statusText}`,
        )
        return { isAuthenticated: false, user: null }
      }

      const result = await response.json()
      console.log('Cookie auth result:', result)
      return result
    } catch (error) {
      console.error('Cookie auth check error:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
      })

      // より詳細なエラー情報を提供
      if (
        error.name === 'TypeError' &&
        error.message.includes('Failed to fetch')
      ) {
        console.error(
          'Network error: Cannot connect to server. Check if the server is running.',
        )
      } else if (
        error.name === 'TypeError' &&
        error.message.includes('NetworkError')
      ) {
        console.error(
          'CORS error: Server may not be allowing cross-origin requests from extensions',
        )
      }

      return { isAuthenticated: false, user: null }
    }
  },
}

/**
 * ブックマークAPI
 */
export const BookmarkAPI = {
  /**
   * ブックマーク一覧を取得
   */
  async getBookmarks(filters = {}) {
    const params = new URLSearchParams()

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value))
      }
    })

    const endpoint = params.toString()
      ? `${API_CONFIG.endpoints.bookmarks}?${params.toString()}`
      : API_CONFIG.endpoints.bookmarks

    const result = await apiClient.requestWithRetry(endpoint)
    return result.data
  },

  /**
   * 新しいブックマークを作成
   */
  async createBookmark(bookmarkData) {
    const result = await apiClient.requestWithRetry(
      API_CONFIG.endpoints.bookmarkCreate,
      {
        method: 'POST',
        body: bookmarkData,
      },
    )
    return result.data
  },

  /**
   * ブックマークを更新
   */
  async updateBookmark(id, updates) {
    const result = await apiClient.requestWithRetry(
      `${API_CONFIG.endpoints.bookmarkUpdate}/${id}`,
      {
        method: 'PATCH',
        body: updates,
      },
    )
    return result.data
  },

  /**
   * ブックマークを削除
   */
  async deleteBookmark(id) {
    await apiClient.requestWithRetry(
      `${API_CONFIG.endpoints.bookmarkDelete}/${id}`,
      {
        method: 'DELETE',
      },
    )
  },

  /**
   * 重複チェック
   */
  async checkDuplicate(url) {
    try {
      const result = await this.getBookmarks({ url })
      return result.data && result.data.length > 0 ? result.data[0] : null
    } catch (error) {
      console.warn('Duplicate check failed:', error.message)
      return null
    }
  },
}

/**
 * タグAPI
 */
export const TagAPI = {
  /**
   * タグ一覧を取得
   */
  async getTags() {
    const result = await apiClient.requestWithRetry(API_CONFIG.endpoints.tags)
    return result.data
  },

  /**
   * 新しいタグを作成
   */
  async createTag(tagData) {
    console.log('Creating tag with data:', tagData)

    try {
      const result = await apiClient.requestWithRetry(
        API_CONFIG.endpoints.tagCreate,
        {
          method: 'POST',
          body: tagData,
        },
      )
      console.log('Tag creation successful:', result)
      return result.data
    } catch (error) {
      console.error('Tag creation failed:', {
        error: error.message,
        status: error.status,
        data: error.data,
        tagData: tagData,
      })
      throw error
    }
  },

  /**
   * タグを更新
   */
  async updateTag(id, updates) {
    const result = await apiClient.requestWithRetry(
      `${API_CONFIG.endpoints.tagUpdate}/${id}`,
      {
        method: 'PATCH',
        body: updates,
      },
    )
    return result.data
  },

  /**
   * タグを削除
   */
  async deleteTag(id) {
    await apiClient.requestWithRetry(
      `${API_CONFIG.endpoints.tagDelete}/${id}`,
      {
        method: 'DELETE',
      },
    )
  },
}

/**
 * ユーティリティ関数
 */
export const ApiUtils = {
  /**
   * エラーメッセージを取得
   */
  getErrorMessage(error) {
    if (error instanceof ApiError) {
      return error.message
    }

    if (error?.message) {
      return error.message
    }

    return '不明なエラーが発生しました'
  },

  /**
   * 認証エラーかチェック
   */
  isAuthError(error) {
    return error instanceof ApiError && error.status === 401
  },

  /**
   * ネットワークエラーかチェック
   */
  isNetworkError(error) {
    return error instanceof ApiError && error.status === 0
  },
}

export { ApiError, apiClient }
