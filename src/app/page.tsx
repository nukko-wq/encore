import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, checkUserInWhitelist } from '@/lib/supabase-server'

export default async function Home() {
  // サーバーサイドで認証状態をチェック（最適化されたヘルパー関数を使用）
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  console.log('🔵 Home page auth check:', {
    hasUser: !!user,
    userEmail: user?.email || 'none',
    authError: authError?.message || 'no error',
  })

  // 既にログインしている場合はダッシュボードにリダイレクト
  if (user?.email) {
    console.log(`🔵 User ${user.email} found, checking whitelist...`)

    try {
      // ホワイトリストチェック（RLS対応のサービスロールクライアント使用）
      const {
        isAllowed,
        data: allowedEmail,
        error: whitelistError,
      } = await checkUserInWhitelist(user.email)

      console.log('🔵 Whitelist check result:', {
        isAllowed,
        allowedEmail: allowedEmail ? 'found' : 'not found',
        email: user.email,
        emailLength: user.email.length,
        whitelistError: whitelistError ? String(whitelistError) : 'no error',
      })

      // メールアドレスの詳細分析
      console.log('🔍 Email analysis:', {
        email: user.email,
        trimmed: user.email.trim(),
        lowercase: user.email.toLowerCase(),
        bytes: Buffer.from(user.email, 'utf8').length,
        charCodes: user.email.split('').map((c) => c.charCodeAt(0)),
      })

      if (isAllowed && allowedEmail) {
        console.log(
          `🔵 User ${user.email} is whitelisted, redirecting to dashboard`,
        )
        redirect('/dashboard')
      } else if (whitelistError) {
        console.error(
          `❌ Whitelist query failed for ${user.email}:`,
          whitelistError,
        )

        // エラー時はサインアウトして再認証を促す
        await supabase.auth.signOut()
      } else {
        console.log(
          `❌ User ${user.email} not in whitelist, staying on home page`,
        )
        // ホワイトリストに登録されていない場合はサインアウト
        await supabase.auth.signOut()
      }
    } catch (error) {
      console.error('💥 Unexpected error during whitelist check:', error)
      // 予期しないエラーの場合もサインアウト
      await supabase.auth.signOut()
    }
  }
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="mt-6 text-3xl font-extrabold text-gray-900">Encore</h1>
          <p className="mt-2 text-sm text-gray-600">
            高機能なブックマーク管理システム
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <div className="grid grid-cols-1 gap-3">
            <Link
              href="/login"
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
            >
              <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                <svg
                  className="h-5 w-5 text-blue-300 group-hover:text-blue-400"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </span>
              ログインしてブックマーク管理を開始
            </Link>

            <Link
              href="/dashboard"
              className="group relative w-full flex justify-center py-3 px-4 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
            >
              ダッシュボードへ
            </Link>
          </div>

          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-4">主な機能</h3>
            <ul className="text-sm text-gray-600 space-y-2">
              <li className="flex items-center">
                <svg
                  className="h-4 w-4 text-green-500 mr-2"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Google認証によるセキュアなログイン
              </li>
              <li className="flex items-center">
                <svg
                  className="h-4 w-4 text-green-500 mr-2"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                ホワイトリストベースのアクセス制御
              </li>
              <li className="flex items-center">
                <svg
                  className="h-4 w-4 text-green-500 mr-2"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                自動メタデータ抽出
              </li>
              <li className="flex items-center">
                <svg
                  className="h-4 w-4 text-green-500 mr-2"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                ブラウザ拡張機能対応
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
