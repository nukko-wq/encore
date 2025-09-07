// Supabase Database型定義
// Generated from database schema

export interface Database {
  public: {
    Tables: {
      allowed_emails: {
        Row: {
          email: string
        }
        Insert: {
          email: string
        }
        Update: {
          email?: string
        }
      }
      user_profiles: {
        Row: {
          id: string
          display_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      bookmarks: {
        Row: {
          id: string
          user_id: string
          url: string
          canonical_url: string
          title: string | null
          description: string | null
          thumbnail_url: string | null
          memo: string | null
          is_favorite: boolean
          is_pinned: boolean
          status: 'unread' | 'read'
          pinned_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          url: string
          canonical_url: string
          title?: string | null
          description?: string | null
          thumbnail_url?: string | null
          memo?: string | null
          is_favorite?: boolean
          is_pinned?: boolean
          status?: 'unread' | 'read'
          pinned_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          url?: string
          canonical_url?: string
          title?: string | null
          description?: string | null
          thumbnail_url?: string | null
          memo?: string | null
          is_favorite?: boolean
          is_pinned?: boolean
          status?: 'unread' | 'read'
          pinned_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
    Functions: {
      search_bookmarks_trigram: {
        Args: {
          search_term: string
          min_similarity?: number
        }
        Returns: Array<{
          id: string
          user_id: string
          url: string
          canonical_url: string
          title: string | null
          description: string | null
          thumbnail_url: string | null
          memo: string | null
          is_favorite: boolean
          is_pinned: boolean
          status: 'unread' | 'read'
          pinned_at: string | null
          created_at: string
          updated_at: string
          similarity_score: number
        }>
      }
    }
  }
}

// よく使用される型のエイリアス
export type BookmarkRow = Database['public']['Tables']['bookmarks']['Row']
export type BookmarkInsert = Database['public']['Tables']['bookmarks']['Insert']
export type BookmarkUpdate = Database['public']['Tables']['bookmarks']['Update']

export type UserProfileRow =
  Database['public']['Tables']['user_profiles']['Row']
export type UserProfileInsert =
  Database['public']['Tables']['user_profiles']['Insert']
export type UserProfileUpdate =
  Database['public']['Tables']['user_profiles']['Update']

export type AllowedEmailRow =
  Database['public']['Tables']['allowed_emails']['Row']
export type AllowedEmailInsert =
  Database['public']['Tables']['allowed_emails']['Insert']
export type AllowedEmailUpdate =
  Database['public']['Tables']['allowed_emails']['Update']
