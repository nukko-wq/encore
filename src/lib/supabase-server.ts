import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

// 環境変数をキャッシュしてパフォーマンス向上
let cachedEnvVars: {
  url: string
  key: string
  serviceRoleKey?: string
} | null = null

function getSupabaseEnvVars() {
  if (!cachedEnvVars) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error(
        'Server Supabase configuration error: Missing required environment variables',
      )
      throw new Error('Server configuration error')
    }

    cachedEnvVars = {
      url: supabaseUrl,
      key: supabaseAnonKey,
      serviceRoleKey: supabaseServiceRoleKey,
    }
  }

  return cachedEnvVars
}

export async function createClient() {
  const cookieStore = await cookies()
  const { url, key } = getSupabaseEnvVars()

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch (error) {
          // サーバーコンポーネント内ではcookieを設定できない場合がある
          // middlewareでセッションリフレッシュされる場合は無視できる
          console.error('Failed to set cookies:', error)
        }
      },
    },
  })
}

// 管理者権限クライアント（RLSをバイパス）
export function createServiceRoleClient() {
  const { url, serviceRoleKey } = getSupabaseEnvVars()

  if (!serviceRoleKey) {
    console.warn(
      'Service role key not configured - using anon key with potential RLS restrictions',
    )
    return createServerClient(url, getSupabaseEnvVars().key, {
      cookies: {
        getAll() {
          return []
        },
        setAll() {},
      },
    })
  }

  return createServerClient(url, serviceRoleKey, {
    cookies: {
      getAll() {
        return []
      },
      setAll() {},
    },
  })
}

// 下位互換性のための別名エクスポート
export const createServerSupabaseClient = createClient

// 共通認証ロジック（内部使用）
async function getAuthenticatedUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  return { user, error, supabase }
}

// 認証必須のサーバーコンポーネント用
export async function requireAuth() {
  const { user, error, supabase } = await getAuthenticatedUser()

  if (!user || error) {
    redirect('/auth/signin')
  }

  return { user, supabase }
}

// 現在のユーザー取得（最適化版）
export async function getCurrentUser() {
  const { user } = await getAuthenticatedUser()
  return user
}

// API Route用の認証チェック
export async function validateApiAuth() {
  const { user, error } = await getAuthenticatedUser()

  if (!user || error) {
    return { user: null, error: 'Unauthorized' }
  }

  return { user, error: null }
}

// ホワイトリストチェック（RLS対応）
export async function checkUserInWhitelist(email: string) {
  const serviceClient = createServiceRoleClient()

  try {
    const { data: allowedEmail, error } = await serviceClient
      .from('allowed_emails')
      .select('email')
      .eq('email', email)
      .single()

    return {
      isAllowed: !!allowedEmail,
      data: allowedEmail,
      error,
    }
  } catch (error) {
    console.error('Whitelist check failed:', error)
    return {
      isAllowed: false,
      data: null,
      error,
    }
  }
}
