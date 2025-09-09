import { type NextRequest, NextResponse } from 'next/server'
import { checkUserInWhitelist, createClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  const next = searchParams.get('next') ?? '/bookmarks'

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
    try {
      const supabase = await createClient()
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
      const { isAllowed, error: whitelistError } = await checkUserInWhitelist(
        session.user.email,
      )

      if (whitelistError || !isAllowed) {
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
