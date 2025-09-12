/**
 * 認証管理モジュール
 * Supabase認証との連携を担当
 */

import { ApiUtils, AuthAPI } from './api.js'

/**
 * 認証状態の定数
 */
export const AuthStatus = {
  LOADING: 'loading',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
  ERROR: 'error',
}

/**
 * 認証マネージャークラス
 */
class AuthManager {
  constructor() {
    this.currentUser = null
    this.authStatus = AuthStatus.LOADING
    this.listeners = new Set()
    this.checkInterval = null
  }

  /**
   * 認証状態変更のリスナーを追加
   */
  addAuthListener(listener) {
    this.listeners.add(listener)

    // 現在の状態を即座に通知
    if (this.authStatus !== AuthStatus.LOADING) {
      listener({
        status: this.authStatus,
        user: this.currentUser,
      })
    }

    return () => this.listeners.delete(listener)
  }

  /**
   * 認証状態変更を通知
   */
  notifyListeners() {
    const authState = {
      status: this.authStatus,
      user: this.currentUser,
    }

    this.listeners.forEach((listener) => {
      try {
        listener(authState)
      } catch (error) {
        console.error('Auth listener error:', error)
      }
    })
  }

  /**
   * 認証状態を初期化
   */
  async initialize() {
    try {
      console.log('🔐 Initializing authentication...')
      console.log('Extension environment:', {
        chromeVersion: chrome.runtime.getManifest().version,
        permissions: chrome.runtime.getManifest().permissions,
        hostPermissions: chrome.runtime.getManifest().host_permissions,
      })

      const authResult = await AuthAPI.checkAuth()
      console.log('Auth check result:', authResult)

      if (authResult.isAuthenticated) {
        this.currentUser = authResult.user
        this.authStatus = AuthStatus.AUTHENTICATED
        console.log('✅ User authenticated:', this.currentUser?.email)
      } else {
        this.currentUser = null
        this.authStatus = AuthStatus.UNAUTHENTICATED
        console.log('❌ User not authenticated')
      }
    } catch (error) {
      console.error('💥 Auth initialization error:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
      })
      this.currentUser = null
      this.authStatus = AuthStatus.ERROR
    }

    this.notifyListeners()

    // 定期的な認証状態チェックを開始
    this.startAuthCheck()
  }

  /**
   * 定期的な認証状態チェックを開始
   */
  startAuthCheck() {
    // 既存のインターバルをクリア
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
    }

    // 5分ごとに認証状態をチェック
    this.checkInterval = setInterval(
      async () => {
        await this.refreshAuthState()
      },
      5 * 60 * 1000,
    )
  }

  /**
   * 定期的な認証状態チェックを停止
   */
  stopAuthCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }

  /**
   * 認証状態を更新
   */
  async refreshAuthState() {
    try {
      const authResult = await AuthAPI.checkAuth()

      const wasAuthenticated = this.authStatus === AuthStatus.AUTHENTICATED
      const isNowAuthenticated = authResult.isAuthenticated

      // 認証状態が変更された場合のみ通知
      if (wasAuthenticated !== isNowAuthenticated) {
        console.log('Auth state changed:', {
          wasAuthenticated,
          isNowAuthenticated,
        })

        if (isNowAuthenticated) {
          this.currentUser = authResult.user
          this.authStatus = AuthStatus.AUTHENTICATED
        } else {
          this.currentUser = null
          this.authStatus = AuthStatus.UNAUTHENTICATED
        }

        this.notifyListeners()
      }
    } catch (error) {
      console.error('Auth refresh error:', error)

      // ネットワークエラーの場合は状態を変更しない
      if (!ApiUtils.isNetworkError(error)) {
        this.currentUser = null
        this.authStatus = AuthStatus.ERROR
        this.notifyListeners()
      }
    }
  }

  /**
   * ログイン処理
   */
  async login() {
    try {
      // Encoreのログインページを開く
      const loginUrl = `${window.location.protocol}//${window.location.hostname}:3000/login`

      await chrome.tabs.create({ url: loginUrl })

      // ポップアップを閉じる
      window.close()
    } catch (error) {
      console.error('Login error:', error)
      throw new Error('ログインページを開けませんでした')
    }
  }

  /**
   * ログアウト処理
   */
  async logout() {
    try {
      await AuthAPI.logout()

      this.currentUser = null
      this.authStatus = AuthStatus.UNAUTHENTICATED
      this.notifyListeners()
    } catch (error) {
      console.error('Logout error:', error)
      throw new Error('ログアウトに失敗しました')
    }
  }

  /**
   * 現在の認証状態を取得
   */
  getAuthState() {
    return {
      status: this.authStatus,
      user: this.currentUser,
      isAuthenticated: this.authStatus === AuthStatus.AUTHENTICATED,
      isLoading: this.authStatus === AuthStatus.LOADING,
    }
  }

  /**
   * ユーザー情報を取得
   */
  getCurrentUser() {
    return this.currentUser
  }

  /**
   * 認証済みかチェック
   */
  isAuthenticated() {
    return (
      this.authStatus === AuthStatus.AUTHENTICATED && this.currentUser !== null
    )
  }

  /**
   * リソースのクリーンアップ
   */
  destroy() {
    this.stopAuthCheck()
    this.listeners.clear()
    this.currentUser = null
    this.authStatus = AuthStatus.LOADING
  }
}

/**
 * グローバル認証マネージャーインスタンス
 */
export const authManager = new AuthManager()

/**
 * 認証ユーティリティ関数
 */
export const AuthUtils = {
  /**
   * ログイン状態を確認し、必要に応じてログインプロンプトを表示
   */
  async requireAuth() {
    const authState = authManager.getAuthState()

    if (!authState.isAuthenticated) {
      if (authState.isLoading) {
        throw new Error('認証状態を確認中です...')
      } else {
        throw new Error('ログインが必要です')
      }
    }

    return authState.user
  },

  /**
   * 認証エラーのハンドリング
   */
  handleAuthError(error) {
    if (ApiUtils.isAuthError(error)) {
      // 認証エラーの場合は自動的にログアウト
      authManager.logout().catch((logoutError) => {
        console.error('Auto logout failed:', logoutError)
      })
      return 'ログインセッションが期限切れです。再度ログインしてください。'
    }

    return ApiUtils.getErrorMessage(error)
  },

  /**
   * ユーザーフレンドリーなエラーメッセージを生成
   */
  getUserFriendlyError(error) {
    if (ApiUtils.isAuthError(error)) {
      return 'ログインが必要です。'
    }

    if (ApiUtils.isNetworkError(error)) {
      return 'ネットワークに接続できません。インターネット接続を確認してください。'
    }

    return ApiUtils.getErrorMessage(error) || '不明なエラーが発生しました。'
  },
}

/**
 * 認証状態を監視するReactライクなフック
 */
export function useAuth() {
  const currentState = authManager.getAuthState()

  return {
    ...currentState,
    login: () => authManager.login(),
    logout: () => authManager.logout(),
    refresh: () => authManager.refreshAuthState(),
    addListener: (listener) => authManager.addAuthListener(listener),
  }
}

/**
 * 初期化関数
 * 拡張機能の起動時に呼び出される
 */
export async function initializeAuth() {
  await authManager.initialize()
  return authManager
}

/**
 * 認証状態リスナーのヘルパー
 */
export function onAuthStateChange(callback) {
  return authManager.addAuthListener(callback)
}

/**
 * 拡張機能終了時のクリーンアップ
 */
export function cleanupAuth() {
  authManager.destroy()
}
