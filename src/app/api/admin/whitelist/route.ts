import { type NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'

// ホワイトリストにメールアドレスを追加する（開発用）
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'メールアドレスが必要です' }, { status: 400 })
    }

    // 管理者権限でサービスロールクライアント使用
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('allowed_emails')
      .insert({ email })
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      message: 'ホワイトリストにメールアドレスが正常に追加されました',
      data,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'ホワイトリストへのメールアドレス追加に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

// ホワイトリストのメールアドレス一覧を取得
export async function GET() {
  try {
    // 管理者権限でサービスロールクライアント使用
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('allowed_emails')
      .select('*')
      .order('email')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'ホワイトリストの取得に失敗しました',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
