/**
 * LIFF→サーバー連携API
 *
 * POST /api/line/link
 * Headers: Authorization: Bearer {accessToken}
 * Input: { caseToken: string }
 * Output: { success: boolean, caseId: string }
 */

import { NextResponse } from 'next/server';
import { verifyAccessToken, createLineClient } from '@/lib/line-client';
import { consumeCaseToken, linkCaseToUser, setActiveCase, getCase } from '@/lib/kv';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    // 1. Authorization ヘッダーから accessToken を取得
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      );
    }

    const accessToken = authHeader.substring(7); // "Bearer " を除去

    const body = await req.json();
    const { caseToken } = body;

    if (!caseToken) {
      return NextResponse.json(
        { error: 'caseTokenが必要です' },
        { status: 400 }
      );
    }

    // 2. caseToken を検証・消費
    const caseId = await consumeCaseToken(caseToken);
    if (!caseId) {
      return NextResponse.json(
        { error: 'リンクの有効期限が切れました。診断画面に戻ってもう一度お試しください。' },
        { status: 400 }
      );
    }

    // 3. accessToken を検証して LINE User ID を取得
    const lineUserId = await verifyAccessToken(accessToken);
    if (!lineUserId) {
      return NextResponse.json(
        { error: '認証に失敗しました。もう一度お試しください。' },
        { status: 401 }
      );
    }

    // 4. 案件とユーザーを紐づけ
    await linkCaseToUser(caseId, lineUserId);

    // 5. アクティブ案件に設定
    await setActiveCase(lineUserId, caseId);

    // 6. 案件データを取得して診断結果の詳細メッセージを送信
    try {
      const caseData = await getCase(caseId);
      if (!caseData) {
        throw new Error('Case data not found');
      }

      const result = caseData.result;
      const client = createLineClient();

      // 裏コマンド（占いモード）の場合
      if (result.is_secret_mode) {
        const message = `✨ ${result.fortune_title || 'スペシャル診断'}\n\n${result.fortune_summary || ''}\n\n「履歴」と送信すると、いつでも結果を確認できます。`;
        await client.pushMessage(lineUserId, {
          type: 'text',
          text: message,
        });
      } else {
        // 通常の診断結果
        let message = `✅ 診断結果を引き継ぎました！\n\n`;
        message += `【物件情報】\n`;
        message += `${result.property_name || '物件名不明'}`;
        if (result.room_number) {
          message += ` ${result.room_number}`;
        }
        message += `\n\n`;
        message += `【診断サマリー】\n`;
        message += `見積書合計: ${result.total_original?.toLocaleString() || '0'}円\n`;
        message += `適正価格: ${result.total_fair?.toLocaleString() || '0'}円\n`;
        message += `💰 削減可能額: ${result.discount_amount?.toLocaleString() || '0'}円\n`;
        message += `⚠️ リスクスコア: ${result.risk_score || 0}点\n\n`;

        // 削減可能な項目を抽出
        const cutItems = result.items?.filter((item: any) => item.status === 'cut') || [];
        const negotiableItems = result.items?.filter((item: any) => item.status === 'negotiable') || [];

        if (cutItems.length > 0) {
          message += `【削減可能項目】\n`;
          cutItems.forEach((item: any) => {
            message += `❌ ${item.name}: ${item.price_original?.toLocaleString() || 0}円\n`;
            message += `   → ${item.reason}\n`;
          });
          message += `\n`;
        }

        if (negotiableItems.length > 0) {
          message += `【交渉推奨項目】\n`;
          negotiableItems.forEach((item: any) => {
            message += `⚡ ${item.name}: ${item.price_original?.toLocaleString() || 0}円\n`;
            message += `   → ${item.reason}\n`;
          });
          message += `\n`;
        }

        message += `「履歴」と送信すると、いつでも詳細を確認できます。`;

        await client.pushMessage(lineUserId, {
          type: 'text',
          text: message,
        });
      }
    } catch (messageError: any) {
      // メッセージ送信が失敗しても連携は成功しているので、エラーはログに記録するだけ
      console.warn('Failed to send LINE message:', messageError);
    }

    return NextResponse.json({
      success: true,
      caseId,
    });
  } catch (error: any) {
    console.error('LINE link error:', error);
    return NextResponse.json(
      { error: 'LINEとの連携に失敗しました', details: error.message },
      { status: 500 }
    );
  }
}
