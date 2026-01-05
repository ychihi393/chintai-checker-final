/**
 * 賃貸初期費用診断 API
 * 
 * シンプル版 + 裏コマンド機能:
 * - 見積書/図面の場合 → 通常の診断
 * - 関係ない画像の場合 → 特別な診断（占い/褒め倒し）
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

    const primaryModel = process.env.GEMINI_MODEL_NAME || "gemini-2.5-pro";
    
    // ========================================
    // 【第1段階】画像の種類を判定
    // ========================================
    const classificationPrompt = `
この画像を分析して、以下のどれに該当するか判定してください。

1. "estimate" - 賃貸の見積書・初期費用明細書
2. "flyer" - 賃貸の募集図面・マイソク
3. "face" - 人の顔が写っている写真
4. "animal" - 動物が写っている写真
5. "food" - 食べ物の写真
6. "scenery" - 風景・建物の写真
7. "other" - その他

JSON形式で出力してください:
{
  "type": "estimate" | "flyer" | "face" | "animal" | "food" | "scenery" | "other",
  "confidence": 0-100,
  "description": "画像の簡単な説明"
}
`;

    const classificationParts = [parts[0], { text: classificationPrompt }];
    
    const model = genAI.getGenerativeModel({ 
      model: primaryModel, 
      generationConfig: { 
        responseMimeType: "application/json",
        temperature: 0
      }
    });
    
    console.log("画像分類中...");
    const classificationResult = await model.generateContent(classificationParts);
    const classificationText = classificationResult.response.text();
    const cleanedClassification = classificationText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const classification = JSON.parse(cleanedClassification);
    
    console.log("画像分類結果:", classification);

    // ========================================
    // 【裏コマンド】関係ない画像の場合
    // ========================================
    if (classification.type !== "estimate" && classification.type !== "flyer") {
      console.log("裏コマンド発動！画像タイプ:", classification.type);
      
      let secretPrompt = "";
      
      if (classification.type === "face") {
        // 顔写真 → 占い風の診断
        secretPrompt = `
あなたは伝説の占い師「マダム・エステート」です。
この人物の写真から、その人の運勢と隠された才能を読み取ってください。

【重要ルール】
- 必ずポジティブで褒め倒す内容にする
- 具体的で面白い診断をする
- 不動産に絡めたユーモアを入れる

JSON形式で出力:
{
  "property_name": "🔮 運命の占い診断",
  "room_number": "✨ 特別鑑定",
  "items": [
    {
      "name": "総合運",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "あなたの運勢は最高です！（具体的に褒める内容を書く）",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "占星術による鑑定" }
    },
    {
      "name": "金運",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "金運について褒める内容",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "手相学による鑑定" }
    },
    {
      "name": "恋愛運",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "恋愛運について褒める内容",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "タロットによる鑑定" }
    },
    {
      "name": "住居運",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "最高の物件に巡り会える運命です！（不動産に絡めた内容）",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "風水による鑑定" }
    },
    {
      "name": "隠された才能",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "この人の隠された才能を具体的に褒める",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "オーラ診断" }
    }
  ],
  "total_original": 500,
  "total_fair": 500,
  "discount_amount": 0,
  "risk_score": 0,
  "pro_review": {
    "content": "【🔮 マダム・エステートの特別鑑定】\\n\\nあなたの顔相から読み取れる運命は...（壮大で褒め倒す総評を書く。最後は「最高の物件との出会いが近づいています✨」で締める）"
  }
}
`;
      } else if (classification.type === "animal") {
        // 動物 → 動物鑑定
        secretPrompt = `
あなたは世界的に有名な動物鑑定士「ドクター・アニマルエステート」です。
この動物の写真から、その動物の素晴らしさを最大限に褒めてください。

【重要ルール】
- 必ずポジティブで褒め倒す
- 具体的で面白い鑑定をする
- 不動産に絡めたユーモアを入れる

JSON形式で出力:
{
  "property_name": "🐾 動物鑑定書",
  "room_number": "✨ プレミアム鑑定",
  "items": [
    {
      "name": "可愛さ",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "可愛さについて具体的に褒める",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "専門家による鑑定" }
    },
    {
      "name": "癒し力",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "癒し力について褒める",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "セラピー効果測定" }
    },
    {
      "name": "賢さ",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "賢さについて褒める",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "行動分析" }
    },
    {
      "name": "オーラ",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "この子のオーラについて褒める",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "オーラ診断" }
    },
    {
      "name": "ペット可物件運",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "この子と暮らせる最高の物件が見つかる運命です！",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "不動産運勢" }
    }
  ],
  "total_original": 500,
  "total_fair": 500,
  "discount_amount": 0,
  "risk_score": 0,
  "pro_review": {
    "content": "【🐾 ドクター・アニマルエステートの鑑定結果】\\n\\nこの子は...（壮大で褒め倒す総評。最後は「この子と暮らせるペット可物件、探しましょう！🏠」で締める）"
  }
}
`;
      } else if (classification.type === "food") {
        // 食べ物 → グルメ鑑定
        secretPrompt = `
あなたは伝説の美食家「グルメ・エステート卿」です。
この料理の写真から、その素晴らしさを最大限に褒めてください。

【重要ルール】
- 必ずポジティブで褒め倒す
- 具体的で面白い鑑定をする
- 不動産に絡めたユーモアを入れる

JSON形式で出力:
{
  "property_name": "🍽️ グルメ鑑定書",
  "room_number": "⭐ 三ツ星鑑定",
  "items": [
    {
      "name": "見た目",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "見た目について褒める",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "ビジュアル評価" }
    },
    {
      "name": "美味しさ予測",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "美味しさについて褒める",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "AI味覚分析" }
    },
    {
      "name": "幸福度",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "この料理を食べる人の幸福度について",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "幸福度測定" }
    },
    {
      "name": "料理スキル",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "作った人の料理スキルを褒める",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "技術評価" }
    },
    {
      "name": "キッチン運",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "広いキッチンのある物件に住む運命です！",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "不動産運勢" }
    }
  ],
  "total_original": 500,
  "total_fair": 500,
  "discount_amount": 0,
  "risk_score": 0,
  "pro_review": {
    "content": "【🍽️ グルメ・エステート卿の鑑定】\\n\\nこの料理は...（壮大で褒め倒す総評。最後は「こんな料理が作れるあなたには、広いキッチンのある物件がお似合いです🏠」で締める）"
  }
}
`;
      } else {
        // その他 → 万能褒め鑑定
        secretPrompt = `
あなたは「万物鑑定士マスター・エステート」です。
この画像に写っているものを最大限に褒めてください。

画像の内容: ${classification.description}

【重要ルール】
- 必ずポジティブで褒め倒す
- 具体的で面白い鑑定をする
- 不動産に絡めたユーモアを入れる

JSON形式で出力:
{
  "property_name": "🌟 特別鑑定書",
  "room_number": "✨ レア鑑定",
  "items": [
    {
      "name": "素晴らしさ",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "この画像の素晴らしい点を具体的に褒める",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "専門家による鑑定" }
    },
    {
      "name": "芸術性",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "芸術的な観点から褒める",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "アート分析" }
    },
    {
      "name": "センス",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "撮影者・所有者のセンスを褒める",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "センス評価" }
    },
    {
      "name": "運気",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "この画像から感じる運気について褒める",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "運気測定" }
    },
    {
      "name": "不動産運",
      "price_original": 100,
      "price_fair": 100,
      "status": "fair",
      "reason": "最高の物件に巡り会える運命です！",
      "evidence": { "flyer_evidence": null, "estimate_evidence": null, "source_description": "不動産運勢" }
    }
  ],
  "total_original": 500,
  "total_fair": 500,
  "discount_amount": 0,
  "risk_score": 0,
  "pro_review": {
    "content": "【🌟 マスター・エステートの鑑定】\\n\\nこの画像は...（壮大で褒め倒す総評。最後は「素晴らしいセンスをお持ちのあなたには、きっと最高の物件が見つかります🏠」で締める）"
  }
}
`;
      }

      const secretParts = [parts[0], { text: secretPrompt }];
      const secretModel = genAI.getGenerativeModel({ 
        model: primaryModel, 
        generationConfig: { 
          responseMimeType: "application/json",
          temperature: 0.9 // 創造性を上げる
        }
      });
      
      const secretResult = await secretModel.generateContent(secretParts);
      const secretText = secretResult.response.text();
      const cleanedSecret = secretText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const secretJson = JSON.parse(cleanedSecret);
      
      // 裏コマンドフラグを追加
      secretJson.is_secret_mode = true;
      secretJson.secret_type = classification.type;
      secretJson.has_unconfirmed_items = false;
      secretJson.unconfirmed_item_names = [];
      
      console.log("裏コマンド診断完了！");
      return NextResponse.json({ result: secretJson });
    }

    // ========================================
    // 【通常モード】見積書/図面の診断
    // ========================================
    console.log("通常診断モード開始...");
    
    const prompt = `
あなたは「入居者の味方をする、経験豊富な不動産コンサルタント」です。
見積書と募集図面を**厳密に照合**し、不当な費用を見つけ出してください。

## 【画像の説明】
- 1枚目: 見積書（必須）
- 2枚目以降: 募集図面（マイソク）または条件欄のアップ画像（任意）

---

## 【重要】類似項目の名称マッチング

以下の項目は**同一項目**として扱ってください：
- 「入居者安心サポート」「24時間サポート」「24時間ライフサポート」「安心サポート」「緊急サポート」→ すべて同じ
- 「消毒」「抗菌」「室内消毒」「室内抗菌」「消毒施工」「抗菌消臭」「室内抗菌・消毒施工費」→ すべて同じ

---

## 【最重要】判定ルールと理由の書き方

### パターン1: 図面に「無料」と記載されている項目
図面に「無料」「0円」「サービス」と記載されているのに、見積書に金額がある場合：
→ status: "cut", price_fair: 0
→ reason: "**図面に「無料」と記載があるため、この請求は削除できます**"

### パターン2: 図面に記載がない項目
見積書にあるが、図面に一切記載がない付帯サービス：
→ status: "cut", price_fair: 0
→ reason: "**図面に記載がないため、削減交渉が可能です**"

対象: 消毒、抗菌、サポート、消火器、〇〇クラブなど

### パターン3: 図面に金額が記載されている項目
図面に金額が明記されていて、見積書と一致：
→ status: "fair"
→ reason: "**図面に記載があり、適正な費用です**"

### パターン4: 基本項目
- 敷金・礼金: 図面と一致なら → fair, "図面の記載と一致しており、適正です"
- 前家賃・管理費: → fair, "図面の記載と一致しており、適正です"
- 仲介手数料（1ヶ月分）: → negotiable, "法定上限は0.5ヶ月分のため、交渉の余地があります"
- 火災保険（20,000円超）: → negotiable, "相場より高めのため、交渉の余地があります"
- 保証会社: 50%程度なら → fair

---

## 【出力形式】JSON

{
  "property_name": "物件名",
  "room_number": "号室",
  "items": [
    {
      "name": "項目名",
      "price_original": 見積書の金額（数値）,
      "price_fair": 適正価格（数値）,
      "status": "fair" | "negotiable" | "cut",
      "reason": "上記パターンに従った理由",
      "evidence": {
        "flyer_evidence": "図面から読み取った原文（例: 入居者安心サポート: 無料）",
        "estimate_evidence": "見積書から読み取った原文",
        "source_description": "図面に「無料」と記載 / 図面に記載なし / 図面に○○円と記載"
      }
    }
  ],
  "total_original": 見積書合計,
  "total_fair": 適正合計,
  "discount_amount": 削減可能額,
  "risk_score": 0-100,
  "pro_review": {
    "content": "【総括】一言で結論"
  }
}

---

## 【チェックリスト】出力前に必ず確認

□ 図面に「無料」と記載されている項目が見積書で有料 → 必ずcut、理由は「図面に「無料」と記載があるため」
□ 図面に記載がない付帯サービス → 必ずcut、理由は「図面に記載がないため」
□ 図面に記載がある項目 → 基本的にfair、理由は「図面に記載があり」
`;

    parts.push({ text: prompt });
    
    const result = await model.generateContent(parts);
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
    
    // 後処理
    if (json.items && Array.isArray(json.items)) {
      json.items = json.items.map((item: any) => {
        if (item.price_original === null) {
          return {
            ...item,
            price_original: 0,
            requires_confirmation: true,
            reason: item.reason + "（※読み取り要確認）"
          };
        }
        return {
          ...item,
          requires_confirmation: false
        };
      });
      
      const hasUnconfirmed = json.items.some((item: any) => item.requires_confirmation);
      json.has_unconfirmed_items = hasUnconfirmed;
      json.unconfirmed_item_names = json.items
        .filter((item: any) => item.requires_confirmation)
        .map((item: any) => item.name);
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
