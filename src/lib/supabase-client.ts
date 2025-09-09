import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabaseの環境変数が不足しています')
}

// クライアント用のSupabaseクライアント
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
