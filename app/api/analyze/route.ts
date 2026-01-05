/**
 * 賃貸初期費用診断 API
 * 
 * 改善版 v2:
 * - temperature=0で安定した出力
 * - 厳格な判定ルール（図面との照合を徹底）
 * - 「無料」記載項目の特別ルール追加
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
見積書と募集図面を**厳密に照合**し、不当な費用を見つけ出してください。

## 【画像の説明】
- 1枚目: 見積書（必須）
- 2枚目以降: 募集図面（マイソク）または条件欄のアップ画像（任意）

---

## 【最重要】判定の絶対ルール

### ルール1: 「図面に無料と記載」→「見積書に金額あり」= 必ず「削除推奨」

以下のような項目名は**同一項目として扱ってください**（名称のバリエーション）:
- 「入居者安心サポート」「24時間サポート」「24時間ライフサポート」「安心サポート」「緊急サポート」→ すべて同じ
- 「消毒」「抗菌」「室内消毒」「室内抗菌」「消毒施工」「抗菌消臭」→ すべて同じ

**判定基準:**
- 図面に「無料」「0円」「サービス」と記載 → 見積書に金額があれば → **status: "cut", price_fair: 0, reason: "図面に無料と記載があるため請求は不当"**

### ルール2: 「図面に記載なし」= 必ず「削除推奨」または「交渉可」

見積書に記載があるが、図面に一切記載がない項目:
- 付帯サービス（消毒、サポート、クラブ、消火器など）→ **status: "cut", price_fair: 0**
- その他の費用 → **status: "negotiable"**

**例外（図面に記載がなくても適正と判定できる項目）:**
- 敷金、礼金、前家賃、管理費・共益費、仲介手数料、火災保険、保証会社、鍵交換

### ルール3: 金額の正確な読み取り

見積書の金額は**1円単位で正確に**読み取ってください。
- 「16,500円」→ 16500
- 「6,600円」→ 6600
- 「94,600円」→ 94600

---

## 【項目別の詳細ガイドライン】

### 24時間サポート / 入居者安心サポート
- 図面に「無料」と記載 → 見積書に金額あり → **cut（図面に無料記載あり）**
- 図面に記載なし → 見積書に金額あり → **cut（図面に記載なし）**
- 図面に金額記載あり → 見積書と同額 → **fair**

### 消毒・抗菌施工
- 図面に記載なし → **cut（任意オプションのため削除可能）**
- 図面に金額記載あり → 見積書と同額 → **fair**

### 簡易消火器具代 / 消火器
- 図面に記載なし → **cut（法的義務なし、削除可能）**
- 図面に記載あり → **fair**

### 鍵交換費用
- 図面に金額記載あり → 見積書と照合して判定
- 図面に記載なし → **negotiable（交渉余地あり）**

### 仲介手数料
- 家賃の1ヶ月分超 → **cut**
- 家賃の1ヶ月分 → **negotiable（原則0.5ヶ月が法定上限）**
- 家賃の0.5ヶ月分以下 → **fair**

### 火災保険
- 20,000円超 → **negotiable**
- 20,000円以下 → **fair**

### 保証会社（初回保証料）
- 家賃+管理費の50%程度 → **fair**
- それ以上 → **negotiable**

---

## 【出力フォーマット】

必ず以下のJSON形式で出力してください:

{
  "property_name": "物件名（図面から読み取り）",
  "room_number": "号室",
  "items": [
    {
      "name": "項目名",
      "price_original": 見積書の金額（数値）,
      "price_fair": 適正価格（数値）,
      "status": "fair" | "negotiable" | "cut",
      "reason": "判定理由（図面との照合結果を明記）",
      "evidence": {
        "flyer_evidence": "図面から読み取った該当箇所の原文（なければnull）",
        "estimate_evidence": "見積書から読み取った原文",
        "source_description": "判定根拠の要約"
      }
    }
  ],
  "total_original": 見積書の合計金額,
  "total_fair": 適正価格の合計,
  "discount_amount": 削減可能額,
  "pro_review": {
    "content": "【総括】\\n削減ポイントの要約"
  },
  "risk_score": 0-100（高いほど払いすぎの危険）
}

---

## 【チェックリスト】出力前に必ず確認

□ 図面に「無料」と記載されている項目が、見積書で有料になっていないか？ → あれば必ずcut
□ 見積書にあるが図面に記載がない付帯サービスはないか？ → あれば必ずcut
□ 各項目の金額は見積書から正確に読み取れているか？
□ evidenceに図面・見積書からの原文を記載したか？
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
        generationConfig: { 
          responseMimeType: "application/json",
          temperature: 0  // 出力を安定化
        }
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
              generationConfig: { 
                responseMimeType: "application/json",
                temperature: 0
              }
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
    console.log("AI応答を受信しました (モデル:", usedModel, ")");
    
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
      model: usedModel,
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
