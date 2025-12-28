import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const estimateFile = formData.get("estimate") as File;
    const planFile = formData.get("plan") as File | null;

    if (!estimateFile) {
      return NextResponse.json({ error: "見積書の画像が必要です" }, { status: 400 });
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

    // ★修正: 図面との照合ロジック強化 & 夢の提案機能追加
    const prompt = `
    あなたは「消費者の味方となる最強の不動産エージェントAI」です。
    アップロードされた見積書${planFile ? "と募集図面" : ""}を精査し、安くできる項目を徹底的に洗い出してください。

    【重要：図面との照合分析】
    ${planFile ? 
      "募集図面（マイソク）と見積書を比較してください。図面に「必須」と書かれていない付帯商品（安心サポート、消毒代、簡易消火器、謎の会費など）が見積書に入っている場合は、**「募集図面に記載がないため、支払い義務がない可能性が高い」**という明確な根拠を理由（reason）に記述し、ステータスを「cut」にしてください。" 
      : "一般的な相場と比較し、必須ではない付帯商品は交渉可能と判断してください。"}

    【診断ルール】
    1. **仲介手数料**: 家賃の0.55ヶ月分(税込)を超えている場合は「交渉余地あり（negotiable）」とし、「原則は0.55ヶ月分」という根拠を添えてください。
    2. **火災保険**: 2万円以上の場合は「negotiable」。貸主指定が必須でなければ自己加入（約4,000円〜）が安い旨を助言してください。
    3. **夢の提案（savings_magic）**: 
       算出した「削減見込み総額」を使って何ができるか、消費者がワクワクするような例えを1つ考えてください。
       例：「韓国旅行 2泊3日 ペア旅」「最新のiPad Air」「有名ブランドの2人掛けソファ」「高級焼肉店で豪遊 3回分」など、金額に見合った具体的な贅沢を提案してください。

    【出力JSON形式】
    {
      "property_name": "物件名（不明なら'物件名不明'）",
      "room_number": "号室",
      "items": [
        {
          "name": "項目名",
          "price_original": 数値,
          "price_fair": 数値,
          "status": "fair" | "negotiable" | "cut",
          "reason": "根拠（例：図面に記載がないため外せます / 相場より高額です）",
          "is_insurance": boolean
        }
      ],
      "total_original": 数値,
      "total_fair": 数値,
      "discount_amount": 数値,
      "savings_magic": "削減額でできること（例：北海道旅行 2泊3日 ペア招待）",
      "pro_review": {
        "title": "総評タイトル",
        "content": "解説文（150文字程度）"
      },
      "knowledge": {
        "title": "豆知識タイトル",
        "content": "豆知識本文"
      }
    }
    `;

    parts.push({ text: prompt });

    const targetModel = "gemini-2.5-flash"; 
    
    const generate = async (modelName: string) => {
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        generationConfig: { responseMimeType: "application/json" }
      });
      const result = await model.generateContent(parts);
      return result.response.text();
    };

    let jsonString;
    try {
      jsonString = await generate(targetModel);
    } catch (e) {
      jsonString = await generate("gemini-1.5-flash");
    }

    return NextResponse.json({ result: JSON.parse(jsonString) });

  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json({ error: "解析失敗", details: error.message }, { status: 500 });
  }
}