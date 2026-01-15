/**
 * Vercel KV接続テストAPI
 * KVが正しく動作するか確認
 */

import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // 動的インポートで @vercel/kv をロード
    const { kv } = await import('@vercel/kv');

    // テスト用のキーで読み書き
    const testKey = 'test:connection';
    const testValue = { timestamp: Date.now(), message: 'KV connection test' };

    await kv.set(testKey, JSON.stringify(testValue), { ex: 60 }); // 60秒で期限切れ
    const retrieved = await kv.get(testKey);

    return NextResponse.json({
      status: 'ok',
      message: 'Vercel KV is working',
      testValue,
      retrieved,
      connection: 'success',
    });
  } catch (error: any) {
    console.error('KV Test Error:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Vercel KV connection failed',
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
