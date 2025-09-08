import { type CookieOptions, createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  const next = searchParams.get('next') ?? '/dashboard'

  // OAuth認証エラーログは重要なので残す（エラー情報のみ）
  if (error) {
    console.error('OAuth error:', error, errorDescription)
  }

  // OAuth認証エラーの場合
  if (error) {
    console.error('OAuth error received:', error, errorDescription)
    return NextResponse.redirect(
      `${origin}/error?message=oauth_error&details=${encodeURIComponent(error)}`,
    )
  }

  if (code) {
    const cookieStore = await cookies()

    // 環境変数の確認
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    // 環境変数設定の確認（機密情報を含まない）

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase environment variables')
      return NextResponse.redirect(`${origin}/error?message=config_error`)
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options })
        },
      },
    })

    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.exchangeCodeForSession(code)

      if (error) {
        console.error('Auth callback error:', error.message)
        return NextResponse.redirect(`${origin}/error?message=callback_error`)
      }

      if (!session?.user?.email) {
        console.error('No user email found in session')
        return NextResponse.redirect(`${origin}/error?message=no_email`)
      }

      // サーバーサイドでホワイトリストチェック
      const { data: allowedEmail, error: whitelistError } = await supabase
        .from('allowed_emails')
        .select('email')
        .eq('email', session.user.email)
        .single()

      if (whitelistError || !allowedEmail) {
        console.error(`Access denied for email: ${session.user.email}`)
        // 許可されていないユーザーはサインアウト
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/error?message=unauthorized`)
      }

      // ホワイトリストチェック通過、ダッシュボードにリダイレクト
      return NextResponse.redirect(`${origin}${next}`)
    } catch (error) {
      console.error('Unexpected callback error:', error)
      return NextResponse.redirect(`${origin}/error?message=unexpected_error`)
    }
  }

  // 認証コードがない場合はログインページに戻す
  return NextResponse.redirect(`${origin}/login`)
}
