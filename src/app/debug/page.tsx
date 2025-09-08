import {
  createClient,
  createServiceRoleClient,
  checkUserInWhitelist,
} from '@/lib/supabase-server'

export default async function DebugPage() {
  const supabase = await createClient()
  const serviceClient = createServiceRoleClient()

  // 現在のセッション確認
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  // ホワイトリスト確認（サービスロールクライアント使用）
  let whitelistEmails = []
  let whitelistError = null
  let serviceRoleStatus = 'unknown'

  try {
    console.log(
      '🔍 Debug page: Attempting whitelist query with service role client...',
    )
    const { data, error } = await serviceClient
      .from('allowed_emails')
      .select('*')
    whitelistEmails = data || []
    whitelistError = error
    serviceRoleStatus = error ? 'error' : 'success'

    console.log('🔍 Debug page: Whitelist query result:', {
      dataCount: data?.length || 0,
      error: error?.message || 'no error',
    })
  } catch (err) {
    whitelistError = err
    serviceRoleStatus = 'exception'
    console.error('🔍 Debug page: Whitelist query exception:', err)
  }

  // 現在のユーザーでのホワイトリストチェックテスト
  let currentUserWhitelistCheck = null
  if (session?.user?.email) {
    try {
      currentUserWhitelistCheck = await checkUserInWhitelist(session.user.email)
      console.log(
        '🔍 Debug page: Current user whitelist check:',
        currentUserWhitelistCheck,
      )
    } catch (error) {
      console.error(
        '🔍 Debug page: Current user whitelist check failed:',
        error,
      )
    }
  }

  // 環境変数確認
  const envVars = {
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Set' : 'Not set',
    SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? 'Set'
      : 'Not set',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? 'Set'
      : 'Not set',
    SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || 'Not set',
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-8">認証デバッグ情報</h1>

        {/* 環境変数 */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">環境変数</h2>
          <pre className="bg-gray-100 p-4 rounded text-sm">
            {JSON.stringify(envVars, null, 2)}
          </pre>
        </div>

        {/* セッション情報 */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">現在のセッション</h2>
          {sessionError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              セッションエラー: {sessionError.message}
            </div>
          )}
          <pre className="bg-gray-100 p-4 rounded text-sm">
            {JSON.stringify(
              {
                session: session
                  ? {
                      user: {
                        id: session.user.id,
                        email: session.user.email,
                        created_at: session.user.created_at,
                      },
                      expires_at: session.expires_at,
                    }
                  : null,
              },
              null,
              2,
            )}
          </pre>
        </div>

        {/* サービスロール状況 */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">サービスロール状況</h2>
          <div
            className={`px-4 py-3 rounded mb-4 ${
              serviceRoleStatus === 'success'
                ? 'bg-green-100 border border-green-400 text-green-700'
                : serviceRoleStatus === 'error'
                  ? 'bg-red-100 border border-red-400 text-red-700'
                  : 'bg-yellow-100 border border-yellow-400 text-yellow-700'
            }`}
          >
            サービスロールクライアント状況: {serviceRoleStatus}
          </div>
          {envVars.SUPABASE_SERVICE_ROLE_KEY === 'Set' ? (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
              ✅ SUPABASE_SERVICE_ROLE_KEY が設定されています
            </div>
          ) : (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              ❌ SUPABASE_SERVICE_ROLE_KEY が設定されていません
            </div>
          )}
        </div>

        {/* 現在のユーザーのホワイトリストチェック */}
        {session?.user?.email && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">
              現在のユーザーのホワイトリストチェック
            </h2>
            <p className="mb-2">
              現在のユーザー: <strong>{session.user.email}</strong>
            </p>
            {currentUserWhitelistCheck ? (
              <div
                className={`px-4 py-3 rounded ${
                  currentUserWhitelistCheck.isAllowed
                    ? 'bg-green-100 border border-green-400 text-green-700'
                    : 'bg-red-100 border border-red-400 text-red-700'
                }`}
              >
                {currentUserWhitelistCheck.isAllowed
                  ? '✅ ホワイトリストに登録済み'
                  : '❌ ホワイトリストに未登録'}
              </div>
            ) : (
              <div className="bg-gray-100 border border-gray-400 text-gray-700 px-4 py-3 rounded">
                ホワイトリストチェック結果なし
              </div>
            )}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-gray-600">
                詳細情報を表示
              </summary>
              <pre className="bg-gray-100 p-2 rounded text-xs mt-2">
                {JSON.stringify(currentUserWhitelistCheck, null, 2)}
              </pre>
            </details>
          </div>
        )}

        {/* ホワイトリスト */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">
            ホワイトリスト（全データ）
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            取得方法: サービスロールクライアント
          </p>
          {whitelistError ? (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              ホワイトリストエラー: {String(whitelistError)}
            </div>
          ) : null}
          <div className="mb-4">
            <span className="text-sm font-medium">データ件数: </span>
            <span
              className={`px-2 py-1 rounded text-sm ${
                whitelistEmails.length > 0
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {whitelistEmails.length}件
            </span>
          </div>
          <pre className="bg-gray-100 p-4 rounded text-sm">
            {JSON.stringify(whitelistEmails, null, 2)}
          </pre>
        </div>

        {/* アクション */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">クイックアクション</h2>
          <div className="space-y-4">
            <div>
              <a
                href="/login"
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                ログインページに移動
              </a>
            </div>
            <div>
              <a
                href="/dashboard"
                className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
              >
                ダッシュボードに移動
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
