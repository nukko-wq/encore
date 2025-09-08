import { createBrowserClient } from '@supabase/ssr'
import type { AuthChangeEvent, AuthError, Session } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Supabase configuration error: Missing required environment variables',
  )
  throw new Error('Application configuration error')
}

// ブラウザ専用クライアント（クッキー自動管理）
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

// Google認証の実行
export const signInWithGoogle = async () => {
  try {
    const redirectUrl = `${window.location.origin}/callback`

    // PKCEフローを明示的に使用してOAuth認証を実行
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        scopes: 'openid email profile',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })

    if (error) {
      console.error('Google sign-in error:', error.message)
    }

    return { data, error }
  } catch (error) {
    console.error('Unexpected error during Google sign-in:', error)
    return {
      data: null,
      error: {
        message: 'Authentication service temporarily unavailable',
      } as AuthError,
    }
  }
}

// サインアウト
export const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('Sign-out error:', error.message)
    }

    return { error }
  } catch (error) {
    console.error('Unexpected error during sign-out:', error)
    return { error: { message: 'Sign-out failed' } as AuthError }
  }
}

// 現在のユーザー取得
export const getCurrentUser = async () => {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) {
      console.error('Get user error:', error.message)
    }

    return { user, error }
  } catch (error) {
    console.error('Unexpected error getting user:', error)
    return {
      user: null,
      error: { message: 'Failed to retrieve user information' } as AuthError,
    }
  }
}

// セッション監視
export const onAuthStateChange = (
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) => {
  return supabase.auth.onAuthStateChange(callback)
}
