/**
 * 賃貸初期費用診断 API
 * 
 * 改善版:
 * - シンプルな1回のGemini呼び出し（安定性重視）
 * - evidenceを含む出力形式
 * - nullガードの強化
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const estimateFile = formData.get("estimate") as File | null;
    const planFile = formData.get("plan") as File | null;
    const conditionFile = formData.get("condition") as File | null;

    if (!estimateFile) {
      return NextResponse.json({ error: "見積書の画像が必要です" }, { status: 400 });
    }

    // ファイルサイズの検証
    if (estimateFile.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "見積書の画像サイズが大きすぎます（20MB以下にしてください）" }, { status: 400 });
    }

    if (planFile && planFile.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "募集図面の画像サイズが大きすぎます（20MB以下にしてください）" }, { status: 400 });
    }

    if (conditionFile && conditionFile.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "条件欄の画像サイズが大きすぎます（20MB以下にしてください）" }, { status: 400 });
    }

    // ファイルタイプの検証
    if (!estimateFile.type.startsWith('image/')) {
      return NextResponse.json({ error: "見積書は画像ファイルである必要があります" }, { status: 400 });
    }

    if (planFile && !planFile.type.startsWith('image/')) {
      return NextResponse.json({ error: "募集図面は画像ファイルである必要があります" }, { status: 400 });
    }

    if (conditionFile && !conditionFile.type.startsWith('image/')) {
      return NextResponse.json({ error: "条件欄は画像ファイルである必要があります" }, { status: 400 });
    }

    const parts: any[] = [];
    const estimateBuffer = Buffer.from(await estimateFile.arrayBuffer());
    parts.push({
      inlineData: { mimeType: estimateFile.type, data: estimateBuffer.toString("base64") },
    });

    if (planFile) {
      const planBuffer = Buffer.from(await planFile.arrayBuffer());
      parts.push({
        inlineData: { mimeType: planFile.type, data: planBuffer.toString("base64") },
      });
    }

    if (conditionFile) {
      const conditionBuffer = Buffer.from(await conditionFile.arrayBuffer());
      parts.push({
        inlineData: { mimeType: conditionFile.type, data: conditionBuffer.toString("base64") },
      });
    }

    const prompt = `
    あなたは「入居者の味方をする、経験豊富な不動産コンサルタント」です。
    ユーザーから渡される画像を比較し、プロの現場感覚と法律知識に基づいて、不当な費用が含まれていないかを診断してください。
    
    **【画像の種類】**
    - 1枚目: 見積書（必須）
    - 2枚目以降: 募集図面（マイソク）または条件欄のアップ画像（任意）
    
    ※条件欄のアップ画像がある場合は、より詳細な条件（礼金、敷金、その他費用）を読み取ることができます。

    **【省略表記辞書】以下の表記を正しく認識してください：**
    ■ 礼金
    - "礼1" / "礼金1" → 礼金1ヶ月
    - "礼0" / "礼なし" / "礼金なし" / "なし" → 礼金0ヶ月
    - "-" / "ー" / "未定" / "相談" → null（不明・要確認）
    
    ■ 敷金
    - "敷1" / "敷金1" → 敷金1ヶ月
    - "敷0" / "敷なし" / "敷金なし" → 敷金0ヶ月
    - "-" / "ー" / "未定" / "相談" → null（不明・要確認）
    
    ■ 敷礼複合
    - "敷礼 0/1" → 敷金0ヶ月、礼金1ヶ月
    - "0/1" → 敷金0ヶ月、礼金1ヶ月

    **【最重要ルール】0円の判定について：**
    1. 0円と判定できるのは、"0" / "0円" / "なし" / "無し" / "無料" / "礼0" / "敷0" など、0を示す明確な記載がある場合のみです
    2. 記載がない / 読み取れない / 不明 の場合は、price_originalをnullにしてください（0にしてはいけない）
    3. 見積書に金額が記載されている場合は、必ずその金額を正確に読み取ってください

    **【必須手順】図面の読み取り方法**:
    1. まず、募集図面（マイソク）を徹底的に読み取ってください
       - 図面の全体を隅々まで確認（上部、下部、左右、備考欄、特記事項など）
       - 小さな文字や注釈も見落とさないでください
       - 「初期費用」「諸費用」「その他費用」「付帯費用」などの項目欄を確認
    
    2. 次に、見積書と照合してください
       - 図面に記載されている項目が、見積書にどのように反映されているか確認
       - 見積書にある項目が、図面に記載されているか確認
       - **見積書に記載されている金額は、必ずそのまま正確に読み取ってください**

    **【判定の絶対原則】**:
    - 募集図面に記載がない初期費用項目は、「削除推奨（cut）」または「交渉可（negotiable）」として判定
    - 図面に記載がないのに見積書に含まれている付帯費用（消毒、サポートなど）は「削除推奨」
    - 例外：礼金・敷金・家賃など、基本条件として必ず存在する項目は「適正」の判定が可能

    ## 項目別の診断ガイドライン

    ### 付帯商品（消毒、24hサポート、〇〇クラブ等）
    - 図面に記載なし → 「削除推奨（cut）」、price_fair=0
    - 図面に記載あり → 「適正」

    ### 鍵交換費用
    - 表記バリエーション: 鍵交換、鍵代、鍵費用、鍵設定費用、カードキー設定費用、キー代など
    - 見積書に記載がある場合 → 金額を正確に読み取る
    - 図面に記載あり → 「適正」
    - 図面に記載なし → 「交渉可」

    ### 仲介手数料
    - 1ヶ月分の場合 → 「交渉可」（原則0.5ヶ月分）
    - 0.5ヶ月分以下 → 「適正」

    ### 火災保険
    - 16,000円超 → 「交渉可」
    - 16,000円以下 → 「適正」

    ## 出力フォーマット（JSON）

    **重要**: 各項目にevidence（根拠）を含めてください

    {
      "property_name": "物件名",
      "room_number": "号室",
      "items": [
        {
          "name": "項目名",
          "price_original": 数値または null（読み取れない場合はnull、0円と表示しない）,
          "price_fair": 数値,
          "status": "fair|negotiable|cut",
          "reason": "判定理由",
          "evidence": {
            "flyer_evidence": "図面から読み取った原文（なければnull）",
            "estimate_evidence": "見積書から読み取った原文（なければnull）",
            "source_description": "図面: ○○ / 見積書: ○○"
          }
        }
      ],
      "total_original": 合計金額,
      "total_fair": 適正合計,
      "discount_amount": 差額,
      "pro_review": { 
        "content": "【総括】一行の結論\\n\\n【ポイント】\\n・項目1\\n・項目2"
      },
      "risk_score": 0〜100
    }

    **注意**: 
    - price_originalがnullの項目は「要確認」として扱います
    - 0円と判定する場合は、必ずevidence（"礼0"、"なし"など）を含めてください
    `;
    parts.push({ text: prompt });

    // モデル名
    const primaryModel = process.env.GEMINI_MODEL_NAME || "gemini-2.5-flash";
    const fallbackModels = ["gemini-2.5-flash-lite", "gemini-2.0-flash"];
    
    console.log("AI解析開始... モデル:", primaryModel);
    let result;
    let usedModel = primaryModel;
    
    try {
      const model = genAI.getGenerativeModel({ 
        model: primaryModel, 
        generationConfig: { responseMimeType: "application/json" }
      });
      result = await model.generateContent(parts);
    } catch (apiError: any) {
      console.error("API Error:", apiError.message);
      
      // レート制限エラーの場合、フォールバック
      const isRateLimitError = 
        apiError.status === 429 || 
        apiError.message?.includes('429') || 
        apiError.message?.includes('rate limit');
      
      if (isRateLimitError) {
        for (const nextModel of fallbackModels) {
          try {
            console.log(`フォールバック: ${nextModel}`);
            const fallbackModelInstance = genAI.getGenerativeModel({ 
              model: nextModel, 
              generationConfig: { responseMimeType: "application/json" }
            });
            result = await fallbackModelInstance.generateContent(parts);
            usedModel = nextModel;
            break;
          } catch (fallbackError: any) {
            console.error(`フォールバック失敗 (${nextModel}):`, fallbackError.message);
          }
        }
        
        if (!result) {
          return NextResponse.json({ 
            error: "APIレート制限に達しました",
            details: "しばらく時間をおいてから再度お試しください。"
          }, { status: 429 });
        }
      } else {
        throw apiError;
      }
    }
    
    if (!result) {
      throw new Error("AI解析の結果が取得できませんでした");
    }
    
    const responseText = result.response.text();
    console.log("AI応答を受信しました");
    
    // JSONパース
    let json;
    try {
      const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      json = JSON.parse(cleanedText);
    } catch (parseError: any) {
      console.error("JSON Parse Error:", parseError);
      console.error("Response text:", responseText.substring(0, 500));
      throw new Error(`AIの応答の解析に失敗しました: ${parseError.message}`);
    }
    
    // 後処理: nullの項目に要確認フラグを追加
    if (json.items && Array.isArray(json.items)) {
      json.items = json.items.map((item: any) => {
        // price_originalがnullの場合
        if (item.price_original === null) {
          return {
            ...item,
            price_original: 0, // UIでは0と表示
            requires_confirmation: true,
            reason: item.reason + "（※読み取り要確認）"
          };
        }
        return {
          ...item,
          requires_confirmation: false
        };
      });
      
      // 要確認項目があるかチェック
      const hasUnconfirmed = json.items.some((item: any) => item.requires_confirmation);
      json.has_unconfirmed_items = hasUnconfirmed;
      json.unconfirmed_item_names = json.items
        .filter((item: any) => item.requires_confirmation)
        .map((item: any) => item.name);
    }
    
    // 総評の整形
    if (json.pro_review && json.pro_review.content) {
      let content = json.pro_review.content.trim();
      content = content.replace(/この物件の初期費用について[^\n]*\n?/g, '');
      content = content.replace(/以下の点を必ず含めて[^\n]*\n?/g, '');
      json.pro_review.content = content;
    }

    console.log("診断完了:", {
      items_count: json.items?.length,
      total_original: json.total_original,
      discount_amount: json.discount_amount
    });

    return NextResponse.json({ result: json });

  } catch (error: any) {
    console.error("Server Error:", error);
    
    let errorMessage = "解析エラーが発生しました";
    let errorDetails = error.message || "不明なエラー";
    
    if (error.status === 429 || error.message?.includes('429')) {
      errorMessage = "APIレート制限に達しました";
      errorDetails = "しばらく時間をおいてから再度お試しください。";
    } else if (error.message?.includes("JSON")) {
      errorMessage = "AIからの応答の解析に失敗しました";
      errorDetails = "もう一度お試しください。";
    }
    
    return NextResponse.json({ 
      error: errorMessage, 
      details: errorDetails
    }, { status: error.status || 500 });
  }
}
