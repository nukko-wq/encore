'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { signInWithGoogle, supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    // 既にログイン済みかチェック
    const checkAuthStatus = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session) {
        console.log('🔵 Already logged in, redirecting to dashboard...')
        router.push('/dashboard')
      }
    }

    checkAuthStatus()
  }, [router])

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true)
      setError(null)

      console.log('🔵 Starting Google OAuth...')

      // 既存セッションをクリアしてOAuth認証の競合を防ぐ
      console.log('🔵 Clearing existing session before OAuth...')
      await supabase.auth.signOut()

      // 少し待ってからOAuth開始（セッションクリアの完了を確保）
      await new Promise((resolve) => setTimeout(resolve, 100))

      const { data, error } = await signInWithGoogle()

      console.log('🔵 OAuth response:', {
        data: data ? 'present' : 'null',
        error: error?.message || 'no error',
      })

      if (error) {
        let userMessage = 'ログインに失敗しました。'

        // エラータイプに応じたメッセージ
        if (error.message.includes('OAuth')) {
          userMessage =
            'Google認証でエラーが発生しました。しばらく待ってから再試行してください。'
        } else if (error.message.includes('network')) {
          userMessage = 'ネットワークエラーです。接続を確認してください。'
        } else if (error.message.includes('temporarily unavailable')) {
          userMessage =
            '認証サービスが一時的に利用できません。しばらく待ってから再試行してください。'
        } else {
          userMessage = `ログインエラー: ${error.message}`
        }

        setError(userMessage)
        console.error('Login error:', error.message)

        // エラー時にセッション状態をクリーンアップ
        await supabase.auth.signOut()
      }
      // 成功した場合は自動的にリダイレクトされます
    } catch (err) {
      console.error('Unexpected login error:', err)
      setError(
        '予期しないエラーが発生しました。ページを更新して再試行してください。',
      )

      // 予期しないエラー時もセッションをクリーンアップ
      try {
        await supabase.auth.signOut()
      } catch (cleanupError) {
        console.error('Error during cleanup:', cleanupError)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Encore にログイン
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            ブックマーク管理システム
          </p>
        </div>
        <div className="mt-8 space-y-6">
          <div>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                <svg
                  className="h-5 w-5 text-blue-300 group-hover:text-blue-400"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              </span>
              {isLoading ? 'ログイン中...' : 'Google でログイン'}
            </button>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">エラー</h3>
                  <div className="mt-2 text-sm text-red-700">{error}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
