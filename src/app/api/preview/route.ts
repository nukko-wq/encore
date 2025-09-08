/**
 * メインメタデータ抽出API（Node.js Runtime）
 * 共有メタデータ抽出モジュールを使用
 */

// Node.js Runtimeを明示的に指定
export const runtime = 'nodejs'

import { extractMetadataFromHtml } from '@/lib/metadata-extractor'
import type { MetadataExtractResult } from '@/types/database'

export async function POST(request: Request) {
  const { url } = await request.json()

  if (!url) return Response.json({ error: 'URL required' }, { status: 400 })

  try {
    // 共有メタデータ抽出モジュールを使用
    const extractedMetadata = await extractMetadataFromHtml(url)

    const metadata: MetadataExtractResult = {
      success: true,
      data: {
        title: extractedMetadata.title,
        description: extractedMetadata.description,
        image: extractedMetadata.image,
        favicon: extractedMetadata.favicon,
        siteName: extractedMetadata.siteName,
        url: extractedMetadata.url,
      },
      source: 'node',
    }

    return Response.json(metadata)
  } catch (error) {
    const errorResult: MetadataExtractResult = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      source: 'node',
    }

    return Response.json(errorResult, { status: 500 })
  }
}