/**
 * デバッグ用ホワイトリスト管理API
 * 開発・テスト用の一時的なエンドポイント
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser, createServiceRoleClient } from '@/lib/supabase-server'

// GET: 現在ユーザーのホワイトリスト状況確認
export async function GET() {
  try {
    const user = await getCurrentUser()
    
    if (!user?.email) {
      return NextResponse.json(
        { error: 'User not authenticated or email not available' },
        { status: 401 }
      )
    }

    const serviceClient = createServiceRoleClient()
    
    // ホワイトリスト確認
    const { data: allowedEmail, error: checkError } = await serviceClient
      .from('allowed_emails')
      .select('email')
      .eq('email', user.email)
      .single()

    // 全ホワイトリスト取得（デバッグ用）
    const { data: allEmails, error: listError } = await serviceClient
      .from('allowed_emails')
      .select('email')

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
      },
      whitelist: {
        isWhitelisted: !!allowedEmail,
        checkError: checkError?.message,
        userEntry: allowedEmail,
      },
      allWhitelistedEmails: allEmails || [],
      listError: listError?.message,
    })
  } catch (error) {
    console.error('Debug whitelist error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// POST: ホワイトリストに現在ユーザーを追加
export async function POST() {
  try {
    const user = await getCurrentUser()
    
    if (!user?.email) {
      return NextResponse.json(
        { error: 'User not authenticated or email not available' },
        { status: 401 }
      )
    }

    const serviceClient = createServiceRoleClient()
    
    // ホワイトリストに追加（upsert で重複回避）
    const { data, error } = await serviceClient
      .from('allowed_emails')
      .upsert({ email: user.email }, { onConflict: 'email' })
      .select()

    if (error) {
      console.error('Failed to add to whitelist:', error)
      return NextResponse.json(
        { error: 'Failed to add to whitelist', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `${user.email} added to whitelist`,
      data,
    })
  } catch (error) {
    console.error('Debug whitelist add error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}