import { type CookieOptions, createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  const next = searchParams.get('next') ?? '/dashboard'

  console.log('=== CALLBACK ROUTE START ===')
  console.log('URL:', request.url)
  console.log('Search params:', Object.fromEntries(searchParams.entries()))
  console.log('Code:', code ? 'present' : 'missing')
  console.log('Error:', error || 'none')
  console.log('Error Description:', errorDescription || 'none')
  console.log('Next:', next)
  console.log('Origin:', origin)

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

    console.log('Environment check:', {
      supabaseUrl: supabaseUrl ? 'set' : 'missing',
      supabaseKey: supabaseKey ? 'set' : 'missing',
    })

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
      console.log('Attempting to exchange code for session...')
      const {
        data: { session },
        error,
      } = await supabase.auth.exchangeCodeForSession(code)

      console.log('Session exchange result:', {
        session: session ? 'present' : 'null',
        user: session?.user?.email || 'no user',
        error: error?.message || 'no error',
      })

      if (error) {
        console.error('Auth callback error:', error.message)
        return NextResponse.redirect(`${origin}/error?message=callback_error`)
      }

      if (!session?.user?.email) {
        console.error('No user email found in session')
        return NextResponse.redirect(`${origin}/error?message=no_email`)
      }

      // サーバーサイドでホワイトリストチェック
      console.log('Checking whitelist for:', session.user.email)
      const { data: allowedEmail, error: whitelistError } = await supabase
        .from('allowed_emails')
        .select('email')
        .eq('email', session.user.email)
        .single()

      console.log('Whitelist check result:', {
        allowedEmail: allowedEmail ? 'found' : 'not found',
        whitelistError: whitelistError?.message || 'no error',
      })

      if (whitelistError || !allowedEmail) {
        console.log(`Access denied for email: ${session.user.email}`)

        // 許可されていないユーザーはサインアウト
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/error?message=unauthorized`)
      }

      // ホワイトリストチェック通過、ダッシュボードにリダイレクト
      console.log(
        '✅ Authentication successful, redirecting to:',
        `${origin}${next}`,
      )
      console.log('=== CALLBACK ROUTE END (SUCCESS) ===')
      return NextResponse.redirect(`${origin}${next}`)
    } catch (error) {
      console.error('💥 Unexpected callback error:', error)
      console.log('=== CALLBACK ROUTE END (ERROR) ===')
      return NextResponse.redirect(`${origin}/error?message=unexpected_error`)
    }
  }

  // 認証コードがない場合はログインページに戻す
  console.log('❌ No auth code found, redirecting to login')
  console.log('=== CALLBACK ROUTE END (NO CODE) ===')
  return NextResponse.redirect(`${origin}/login`)
}
