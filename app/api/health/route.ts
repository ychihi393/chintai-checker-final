/**
 * ヘルスチェックAPI
 * Vercelデプロイの基本的な動作確認用
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      hasLineSecret: !!process.env.LINE_CHANNEL_SECRET,
      hasLineToken: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
      hasLiffId: !!process.env.NEXT_PUBLIC_LIFF_ID,
      hasKvUrl: !!process.env.KV_URL,
    },
  });
}
