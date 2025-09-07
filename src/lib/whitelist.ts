import type { PostgrestError } from '@supabase/supabase-js'
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
export async function addToWhitelist(
  email: string,
): Promise<{ data: unknown; error: PostgrestError | null }> {
  try {
    const { data, error } = await supabase
      .from('allowed_emails')
      .insert({ email }) // citextにより自動で大文字小文字無視

    if (error) {
      console.error('Add to whitelist error:', error.message)
    }

    return { data, error }
  } catch (error) {
    console.error('Unexpected error adding to whitelist:', error)
    return {
      data: null,
      error: { message: 'Failed to add email to whitelist' } as PostgrestError,
    }
  }
}

// ホワイトリスト一覧取得
export async function getWhitelistEmails(): Promise<{
  data: Array<{ email: string }> | null
  error: PostgrestError | null
}> {
  try {
    const { data, error } = await supabase
      .from('allowed_emails')
      .select('*')
      .order('email')

    if (error) {
      console.error('Get whitelist emails error:', error.message)
    }

    return { data, error }
  } catch (error) {
    console.error('Unexpected error getting whitelist emails:', error)
    return {
      data: null,
      error: { message: 'Failed to retrieve whitelist' } as PostgrestError,
    }
  }
}

// ホワイトリストからメール削除（citextにより大文字小文字は自動無視）
export async function removeFromWhitelist(
  email: string,
): Promise<{ error: PostgrestError | null }> {
  try {
    const { error } = await supabase
      .from('allowed_emails')
      .delete()
      .eq('email', email) // citextにより自動で大文字小文字無視

    if (error) {
      console.error('Remove from whitelist error:', error.message)
    }

    return { error }
  } catch (error) {
    console.error('Unexpected error removing from whitelist:', error)
    return {
      error: {
        message: 'Failed to remove email from whitelist',
      } as PostgrestError,
    }
  }
}
