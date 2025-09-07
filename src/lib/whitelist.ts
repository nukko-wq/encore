import { supabase } from './supabase'

// ホワイトリストメール確認（citextにより大文字小文字は自動無視）
export async function checkWhitelistEmail(email: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('allowed_emails')
      .select('email')
      .eq('email', email) // citextにより自動で大文字小文字無視
      .single()

    return !!data && !error
  } catch (error) {
    console.error('Whitelist check error:', error)
    return false
  }
}

// ホワイトリストにメール追加（citextにより大文字小文字は自動無視）
export async function addToWhitelist(email: string) {
  const { data, error } = await supabase
    .from('allowed_emails')
    .insert({ email: email }) // citextにより自動で大文字小文字無視

  return { data, error }
}

// ホワイトリスト一覧取得
export async function getWhitelistEmails() {
  const { data, error } = await supabase
    .from('allowed_emails')
    .select('*')
    .order('email')

  return { data, error }
}

// ホワイトリストからメール削除（citextにより大文字小文字は自動無視）
export async function removeFromWhitelist(email: string) {
  const { error } = await supabase
    .from('allowed_emails')
    .delete()
    .eq('email', email) // citextにより自動で大文字小文字無視

  return { error }
}
