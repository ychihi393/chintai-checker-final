/**
 * LINE Webhook受信API
 *
 * POST /api/line/webhook
 * Headers: x-line-signature
 * Input: LINE Webhook Events
 */

import { NextResponse } from 'next/server';
import { verifySignature } from '@/lib/line-signature';
import { createLineClient } from '@/lib/line-client';
import { getUserCases, setActiveCase, getActiveCase, getConversationState, setConversationState, getCase } from '@/lib/kv';
import type { WebhookEvent, MessageEvent, TextEventMessage, PostbackEvent, ImageEventMessage } from '@line/bot-sdk';

// LINE WebhookはPOSTのみ受け付ける
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

// GET リクエストには200を返す（検証用）
export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    message: 'LINE Webhook endpoint is ready',
    timestamp: new Date().toISOString()
  });
}

export async function POST(req: Request) {
  console.log('=== LINE Webhook POST request received ===');
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);

  try {
    // 1. 署名検証
    const signature = req.headers.get('x-line-signature');
    const body = await req.text();

    console.log('Signature:', signature ? 'Present' : 'Missing');
    console.log('Body length:', body.length);

    if (!signature) {
      console.error('No signature header');
      // LINE Webhookは常に200を返す必要がある
      return NextResponse.json({ success: false, error: 'No signature' }, { status: 200 });
    }

    const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
    console.log('Channel secret exists:', !!channelSecret);

    if (!verifySignature(body, signature, channelSecret)) {
      console.error('Invalid signature');
      // LINE Webhookは常に200を返す必要がある
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 200 });
    }

    console.log('Signature verified successfully');

    // 2. イベント処理
    const events: WebhookEvent[] = JSON.parse(body).events;
    console.log('Number of events:', events.length);

    const client = createLineClient();

    for (const event of events) {
      // follow イベント（友だち追加・ブロック解除）
      if (event.type === 'follow') {
        const userId = event.source.userId;
        if (!userId) continue;

        console.log(`[Follow event] User ID: ${userId}`);

        // 以前の案件があるか確認
        // まず、userCasesリストから取得を試みる
        const userCases = await getUserCases(userId, 1); // 最新1件を取得
        console.log(`[Follow event] Found ${userCases.length} previous cases from getUserCases for user ${userId}`);
        
        // userCasesリストが空でも、アクティブ案件があるかもしれないので確認
        let latestCase = userCases.length > 0 ? userCases[0] : null;
        
        if (!latestCase) {
          // アクティブ案件を確認
          const activeCase = await getActiveCase(userId);
          if (activeCase) {
            console.log(`[Follow event] Found active case: ${activeCase.case_id}`);
            latestCase = activeCase;
          }
        }
        
        if (latestCase) {
          console.log(`[Follow event] Latest case ID: ${latestCase.case_id}`);
          // 以前の案件がある場合 → 最新の案件の診断結果を自動送信
          const result = latestCase.result;
          
          // アクティブ案件に設定（まだ設定されていない場合）
          try {
            await setActiveCase(userId, latestCase.case_id);
          } catch (error: any) {
            console.warn(`[Follow event] Failed to set active case: ${error.message}`);
          }
          
          // 診断結果を送信
          if (result.is_secret_mode) {
            // 裏コマンド（占いモード）の場合
            const message = `✨ ${result.fortune_title || 'スペシャル診断'}\n\n${result.fortune_summary || ''}\n\n「履歴」と送信すると、いつでも結果を確認できます。`;
            await client.replyMessage(event.replyToken, {
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

            await client.pushMessage(userId, {
              type: 'text',
              text: message,
            });

            // 診断結果送信後、すぐに物件確認の質問を送信（通常診断の場合のみ）
            const propertyName = result.property_name || '物件名不明';
            const roomNumber = result.room_number || '';
            const propertyDisplay = roomNumber ? `${propertyName} ${roomNumber}` : propertyName;

            // 会話状態を保存
            await setConversationState(userId, 'property_confirm', latestCase.case_id);

            // Flex Messageで物件確認の質問を送信（おしゃれなデザイン）
            await client.pushMessage(userId, {
              type: 'flex',
              altText: '確認する物件はこの物件で合ってますか？',
              contents: {
                type: 'bubble',
                body: {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'text',
                      text: '物件の確認',
                      weight: 'bold',
                      size: 'xl',
                      color: '#333333',
                      margin: 'md',
                      align: 'center',
                    },
                    {
                      type: 'text',
                      text: propertyDisplay,
                      size: 'lg',
                      color: '#666666',
                      margin: 'sm',
                      align: 'center',
                      wrap: true,
                    },
                    {
                      type: 'separator',
                      margin: 'lg',
                    },
                    {
                      type: 'box',
                      layout: 'horizontal',
                      spacing: 'sm',
                      margin: 'lg',
                      contents: [
                        {
                          type: 'button',
                          style: 'primary',
                          color: '#007AFF',
                          height: 'sm',
                          action: {
                            type: 'message',
                            label: 'はい',
                            text: 'はい',
                          },
                          flex: 1,
                        },
                        {
                          type: 'button',
                          style: 'secondary',
                          color: '#808080',
                          height: 'sm',
                          action: {
                            type: 'message',
                            label: 'いいえ',
                            text: 'いいえ',
                          },
                          flex: 1,
                        },
                      ],
                    },
                    {
                      type: 'button',
                      style: 'primary',
                      color: '#FF9500',
                      height: 'sm',
                      action: {
                        type: 'message',
                        label: '相談したい',
                        text: '相談したい',
                      },
                      margin: 'md',
                    },
                  ],
                },
                styles: {
                  body: {
                    backgroundColor: '#FFFFFF',
                  },
                },
              },
            });
            
            console.log(`[Follow event] Diagnosis result and property confirmation sent to user ${userId}`);
          }
        } else {
          // 以前の案件がない場合（新規ユーザー）
          console.log(`[Follow event] No previous cases found for user ${userId}, sending welcome message`);
          
          try {
            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: '友だち追加ありがとうございます！🎉\n\n賃貸初期費用AI診断の結果をこちらのLINEでご確認いただけます。\n\n診断ページで「LINEで続きを確認」ボタンを押して、ぜひ連携してくださいね。',
            });
            console.log(`[Follow event] Welcome message sent to user ${userId}`);
          } catch (error: any) {
            console.error(`[Follow event] Failed to send welcome message to user ${userId}:`, error);
          }
        }
        continue;
      }

      // message イベント（テキストメッセージのみ処理）
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        if (!userId) continue;

        const messageText = event.message.text.trim();
        console.log(`[Message received] User: ${userId}, Text: "${messageText}"`);

        // 会話状態を確認して、ボタンからの日本語メッセージを処理
        const conversationState = await getConversationState(userId);
        console.log(`[Conversation state] User: ${userId}, State:`, conversationState);

        // property_confirmステップの場合
        if (conversationState && conversationState.step === 'property_confirm') {
          console.log(`[property_confirm] Processing message: "${messageText}"`);
          const caseId = conversationState.case_id;

          if (messageText === 'はい') {
            console.log('[property_confirm] User selected "はい" - moving to application_intent');
            // 「はい」が選択された場合 → 申し込み希望を聞く

            await client.replyMessage(event.replyToken, {
              type: 'flex',
              altText: 'お申し込みについて',
              contents: {
                type: 'bubble',
                body: {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'text',
                      text: 'ありがとうございます',
                      weight: 'bold',
                      size: 'lg',
                      color: '#333333',
                      margin: 'md',
                      align: 'center',
                    },
                    {
                      type: 'text',
                      text: 'こちらの物件へのお申し込みについてお伺いします',
                      size: 'sm',
                      color: '#666666',
                      margin: 'md',
                      align: 'center',
                      wrap: true,
                    },
                    {
                      type: 'separator',
                      margin: 'lg',
                    },
                    {
                      type: 'box',
                      layout: 'vertical',
                      spacing: 'sm',
                      margin: 'lg',
                      contents: [
                        {
                          type: 'button',
                          style: 'primary',
                          color: '#06C755',
                          height: 'sm',
                          action: {
                            type: 'message',
                            label: 'お申し込みする',
                            text: '申し込みする',
                          },
                        },
                        {
                          type: 'button',
                          style: 'secondary',
                          color: '#808080',
                          height: 'sm',
                          action: {
                            type: 'message',
                            label: '他の物件を探す',
                            text: '他の物件を探す',
                          },
                        },
                        {
                          type: 'button',
                          style: 'primary',
                          color: '#FF9500',
                          height: 'sm',
                          action: {
                            type: 'message',
                            label: '相談したい',
                            text: '相談したい',
                          },
                        },
                      ],
                    },
                  ],
                },
                styles: {
                  body: {
                    backgroundColor: '#FFFFFF',
                  },
                },
              },
            });

            // メッセージ送信後に状態を変更
            await setConversationState(userId, 'application_intent', caseId);
            continue;
          } else if (messageText === 'いいえ') {
            console.log('[property_confirm] User selected "いいえ" - requesting images');
            // 「いいえ」が選択された場合 → 画像送信を促す

            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: '承知いたしました。\n\nお手数ですが、ご希望の物件の募集図面と初期費用の見積もりをこちらのLINEにお送りいただけますでしょうか？\n\n担当者が確認の上、診断結果をお送りいたします。',
            });

            // メッセージ送信後に状態を変更
            await setConversationState(userId, 'waiting_images', caseId);
            continue;
          } else if (messageText === '相談したい') {
            console.log('[property_confirm] User selected "相談したい"');
            // 「相談したい」が選択された場合

            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: '承知いたしました。\n\nどのようなことでもお気軽にご相談ください。まずは、ざっくりとご相談内容を教えていただけますか？\n\n担当者より改めてご連絡させていただきます。',
            });

            // メッセージ送信後に状態を変更
            await setConversationState(userId, 'consultation', caseId);
            continue;
          }
        }

        // application_intentステップの場合
        if (conversationState && conversationState.step === 'application_intent') {
          console.log(`[application_intent] Processing message: "${messageText}"`);
          const caseId = conversationState.case_id;

          if (messageText === '申し込みする') {
            console.log('[application_intent] User selected "申し込みする"');
            // 「申し込みする」が選択された場合 → 以後手動対応

            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: 'ありがとうございます。\n\n最新の空室状況と、正確な初期費用のお見積もりを確認させていただきます。少々お待ちくださいませ。\n\n担当者より詳細をご連絡いたします。',
            });

            // メッセージ送信後に状態を変更
            await setConversationState(userId, 'completed', caseId);

            // ここで手動対応の通知
            console.log(`[Manual action required] User ${userId} wants to apply for case ${caseId}`);
            continue;
          } else if (messageText === '他の物件を探す' || messageText === '申し込みしない') {
            console.log('[application_intent] User selected "他の物件を探す"');
            // 「他の物件を探す」が選択された場合 → 物件探すシステムへのリンク

            // スーモのURL（テスト用、後で変更可能）
            const propertySearchUrl = 'https://suumo.jp/chintai/';

            await client.replyMessage(event.replyToken, {
              type: 'template',
              altText: '他の物件を探す',
              template: {
                type: 'buttons',
                text: '承知いたしました。\n\n他の物件をお探しでしたら、AIで最適な物件を探せるシステムをご用意しております。ぜひこちらもご活用ください。',
                actions: [
                  {
                    type: 'uri',
                    label: '物件を探す',
                    uri: propertySearchUrl,
                  },
                ],
              },
            });

            // メッセージ送信後に状態を変更
            await setConversationState(userId, 'completed', caseId);
            continue;
          } else if (messageText === '相談したい') {
            console.log('[application_intent] User selected "相談したい"');
            // 「相談したい」が選択された場合

            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: '承知いたしました。\n\nどのようなことでもお気軽にご相談ください。まずは、ざっくりとご相談内容を教えていただけますか？\n\n担当者より改めてご連絡させていただきます。',
            });

            // メッセージ送信後に状態を変更
            await setConversationState(userId, 'consultation', caseId);
            continue;
          }
        }

        // 「履歴」コマンド
        if (messageText === '履歴' || messageText === 'りれき' || messageText === 'history') {
          const cases = await getUserCases(userId, 5);

          if (cases.length === 0) {
            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: 'まだ案件がありません。\n診断ページで「LINEで続き」ボタンを押して連携してください。',
            });
          } else {
            let message = '📋 あなたの案件履歴（直近5件）\n\n';
            cases.forEach((c, index) => {
              message += `${index + 1}. ${c.display_title}\n`;
            });
            message += '\n番号を送信して案件を選択してください。';

            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: message,
            });
          }
          continue;
        }

        // 数字（1-5）→ 案件選択
        const numberMatch = messageText.match(/^([1-5])$/);
        if (numberMatch) {
          const index = parseInt(numberMatch[1], 10) - 1;
          const cases = await getUserCases(userId, 5);

          if (index >= 0 && index < cases.length) {
            const selectedCase = cases[index];
            await setActiveCase(userId, selectedCase.case_id);

            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: `✅ 「${selectedCase.display_title}」を選択しました。\n\n詳細を確認するには「はい」と送信してください。`,
            });
          } else {
            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: '選択した番号が無効です。「履歴」と送信して案件一覧を確認してください。',
            });
          }
          continue;
        }

        // 「はい」→ アクティブ案件の詳細表示（会話状態がない場合のみ）
        if ((messageText === 'はい' || messageText === 'Yes' || messageText === 'yes') &&
            (!conversationState || conversationState.step === 'completed')) {
          const activeCase = await getActiveCase(userId);

          if (!activeCase) {
            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: 'アクティブな案件がありません。\n「履歴」と送信して案件を選択してください。',
            });
          } else {
            const result = activeCase.result;
            let detailMessage = `📊 案件詳細\n\n`;
            detailMessage += `提示額: ¥${result.total_original?.toLocaleString() || '0'}\n`;
            detailMessage += `適正額: ¥${result.total_fair?.toLocaleString() || '0'}\n`;
            detailMessage += `削減可能額: ¥${result.discount_amount?.toLocaleString() || '0'}\n\n`;
            detailMessage += `リスクスコア: ${result.risk_score || 0}/100\n\n`;
            detailMessage += `プロからのアドバイス:\n${result.pro_review?.content || '診断結果をご確認ください'}\n\n`;
            detailMessage += `交渉が面倒、怖いと感じる方は、弊社で全ての交渉を代行しお得に契約できるようサポートが可能です。希望の場合はLINEでご相談ください。`;

            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: detailMessage,
            });
          }
          continue;
        }

        // 相談状態の場合、メッセージを受け取って以後手動対応
        if (conversationState && conversationState.step === 'consultation') {
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: 'ご相談内容を承りました。\n\n担当者より改めてご連絡させていただきますので、少々お待ちくださいませ。',
          });

          // メッセージ送信後に状態を変更
          await setConversationState(userId, 'completed', conversationState.case_id);

          // 相談内容をログに記録（手動対応用）
          console.log(`[Manual action required] Consultation from user ${userId}, case ${conversationState.case_id}: ${messageText}`);
          continue;
        }

        // 会話フロー中だが、期待されるメッセージではない場合
        // （誤タップや再タップを許容するため、制限は緩くする）
        if (conversationState && conversationState.step !== 'completed' && conversationState.step !== 'waiting_images') {
          console.log(`[Unexpected message] User ${userId} in state ${conversationState.step} sent: "${messageText}"`);
          // システムコマンドや通常メッセージとして処理を続行（制限しない）
        }

        // その他のメッセージ → ヘルプ
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '【使い方】\n\n📋 「履歴」→ 案件一覧を表示\n🔢 番号（1-5）→ 案件を選択\n✅ 「はい」→ 選択した案件の詳細を表示\n\n診断ページで「LINEで続き」ボタンを押すと新しい案件を連携できます。',
        });
      }

      // message イベント（画像メッセージ）
      if (event.type === 'message' && event.message.type === 'image') {
        const userId = event.source.userId;
        if (!userId) continue;

        const imageConversationState = await getConversationState(userId);
        if (imageConversationState && imageConversationState.step === 'waiting_images') {
          // 画像受信を確認（通知のみ）
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: '画像を受け取りました。ありがとうございます。\n\n担当者が確認の上、診断結果をお送りいたしますので、少々お待ちくださいませ。',
          });

          // 画像受信をログに記録（手動対応用）
          console.log(`[Manual action required] Image received from user ${userId}, case ${imageConversationState.case_id}`);
          continue;
        }

        // 画像が送信されたが、待機状態でない場合
        await client.replyMessage(event.replyToken, {
          type: 'text',
          text: '画像を受け取りました。\n\n診断ページから「LINEで続きを確認」ボタンを押して連携していただくと、診断結果をお送りできます。',
        });
      }
    }

    console.log('=== Webhook processing completed successfully ===');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('=== Webhook error ===');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    // LINE Webhookは常に200を返す必要がある（エラー時も）
    // エラーはログに記録し、LINEには成功として返す
    return NextResponse.json({ 
      success: false, 
      error: 'Webhook処理に失敗しました', 
      details: error.message 
    }, { status: 200 });
  }
}
