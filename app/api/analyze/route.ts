import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const maxDuration = 60;

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

    const prompt = `
    あなたは「入居者の味方をする、経験豊富な不動産コンサルタント」です。
    ユーザーから渡される「募集図面（マイソク）」と「見積書」の2つの画像を比較し、プロの現場感覚と法律知識に基づいて、不当な費用が含まれていないかを診断してください。

    AIとしての機械的な照合ではなく、**「図面に書いていない費用を後出しで請求するのはおかしい」**という不動産取引の原則に基づき、厳しめにチェックを行ってください。

    ## 判断の最重要指針（現場の鉄則）

    1.  **「募集図面」が正解、「見積書」は疑え**
        * 募集図面（マイソク）は、入居募集時の条件提示（広告）です。ここに記載されていない費用項目が、見積書にしれっと入っているケースが多々あります。
        * **図面に記載がないのに見積書に含まれている付帯費用（消毒、サポート、消臭など）は、すべて「ぼったくり（本来は任意、または不要）」と判定してください。**
        * 「見積もりの方が最新だろう」と好意的に解釈しないでください。図面にない費用は、説明義務違反の疑いがある「不当な上乗せ」です。

    2.  **法律・判例の観点を持つ（根拠の強化）**
        * 重要事項説明や事前の明示なく費用を請求することは、消費者契約法や宅建業法の信義則に反する可能性があります。
        * 仲介手数料についても、原則（国交省告示）と例外を理解して指摘してください。

    ---

    ## 項目別の診断ガイドライン

    以下の基準で画像を読み解き、少しでも疑わしい場合は「入居者に有利な指摘」をしてください。

    ### ① 付帯商品（消毒、虫駆除、24hサポート、〇〇クラブ等）
    * **現場の感覚**: これらは仲介会社が利益を上乗せするために勝手に入れているケースが大半です。
    * **判断基準**:
        * **図面に記載なし** → **「全額カット可能」**と判断。「図面に記載がないため、加入義務はない可能性が高く、外せる可能性が高いです」と指摘。
        * **図面に記載あり** → 「必須」とするが、備考欄に小さく「任意」とないか確認。
        * **図面に「月額」「無料」と記載** → 初期費用として請求されるべきではない可能性が高いので「削除推奨」。

    ### ② 鍵交換費用
    * **現場の感覚**: 本来、国交省ガイドラインでは「貸主負担」が原則ですが、特約で借主負担にするのが通例です。ただし、特約（図面記載）がなければ払う必要がない可能性が高いです。
    * **判断基準**:
        * **図面に記載なし** → **「交渉可能（貸主負担にできる）」**と判断。「図面に記載がないため、ガイドライン通りオーナー負担にできる可能性が高いです」と指摘。
        * **図面に記載あり** → 必須とみなす。

    ### ③ 仲介手数料
    * **現場の感覚**: 法律上の原則は「0.5ヶ月分」です。1ヶ月分取るには依頼者の承諾が必要です。
    * **判断基準**:
        * 見積もりが「1.0ヶ月分（または1.1ヶ月分）」になっている場合 → **「ぼったくり（減額可能）」**と判定。
        * 「原則は0.5ヶ月分です。承諾していないなら下がる可能性が高いです」と伝え、さらに「交渉が面倒、怖いと感じる方もご安心ください。私たちが全ての交渉を代行し、最安値で契約できるようサポートします。まずはLINEでご相談ください」と誘導してください。

    ### ④ 火災保険料
    * **現場の感覚**: 管理会社指定の保険は割高（2万円以上）なことが多いです。自分で入れば安くなる可能性が高いです。
    * **重要**: 火災保険は「入らなくていい」ということは絶対にありません。必ず加入が必要です。ただし、0円にできる可能性はありません。
    * **判断基準**:
        * 見積額が「16,000円」を超えている場合 → **「見直し推奨」**。「指定必須とあっても、交渉次第で自己加入（約16,000円）に変更できる可能性が高いです。ただし、火災保険自体は必ず加入が必要です」とアドバイス。
        * 見積額が「16,000円」以下の場合 → **「適正」**と判定。

    ### ⑤ 保証会社の保証料
    * **判断基準**:
        * 図面の条件（「総賃料の50%」など）と一致しているか確認。
        * 図面に記載がないのに高額な保証料が入っている場合は、「計算根拠不明」として注意喚起。基本は相場（50%〜）で計算されているかチェック。

    ### ⑥ 礼金・敷金・フリーレント
    * **判断基準**:
        * 図面が「礼金0」なのに、見積書で「礼金1」になっていたら**完全なNG**として指摘。
        * 図面に「フリーレント（FR）」があるのに、見積もりの初期費用から引かれていなければ「適用漏れ」として指摘。

    ---

    ## 出力フォーマット（JSON）

    Webサービス側で表示するため、必ず以下のJSON形式で出力してください。Markdownのコードブロックで囲まないでください。

    {
      "property_name": "物件名（不明なら'不明'）",
      "room_number": "号室",
      "items": [
        {
          "name": "項目名（例：仲介手数料、付帯費用（消毒・サポート等）、鍵交換費用、火災保険、保証会社保証料など）",
          "price_original": 数値（見積書の額）,
          "price_fair": 数値（適正額。削除可能な場合は0）,
          "status": "fair|negotiable|cut",
          "reason": "簡潔な説明のみ（1-2行程度）。断定的な表現は避け、「可能性が高いです」「可能性があります」などの表現を使用してください。例：「図面に記載がないため削除できる可能性が高いです」「0.5ヶ月分を超えているため減額できる可能性が高いです」「自己加入すれば約16,000円に変更できる可能性が高いです（ただし火災保険は必ず加入が必要）」など。長い説明や「交渉を代行する」などのメッセージは含めないでください。"
        }
      ],
      "total_original": 合計金額,
      "total_fair": 適正合計,
      "discount_amount": 差額,
      "pro_review": { 
        "content": "総評は以下のフォーマットで出力してください：\n\n【総括】（一行で、この物件の初期費用についての結論を一言で太文字で表現。例：図面にない付帯費用が多数乗せられています。典型的なぼったくり見積もりです。）\n\n【最善の行動】（簡潔に、次に取るべき行動を2-3行で）\n\n【ポイント】\n・削減可能な項目を簡潔に箇条書き（各項目1行）\n・交渉のポイントを簡潔に箇条書き\n・注意点があれば簡潔に箇条書き\n\n総評は簡潔で分かりやすく、借主がすぐに行動できる内容にしてください。説明文や指示文は一切含めないでください。必ずLINE問い合わせへの誘導を含めてください。"
      },
      "risk_score": 0〜100の数値（払いすぎ危険度。削減可能額が多いほど高いスコア）
    }
    `;
    parts.push({ text: prompt });

    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash", 
      generationConfig: { responseMimeType: "application/json" }
    });

    console.log("AI解析開始...");
    const result = await model.generateContent(parts);
    const responseText = result.response.text();
    const json = JSON.parse(responseText);
    
    // 総評フォーマットの整形（AIの出力から説明文を削除）
    if (json.pro_review && json.pro_review.content) {
      let aiContent = json.pro_review.content.trim();
      // 不要な説明文を削除
      aiContent = aiContent.replace(/この物件の初期費用について[^\n]*\n?/g, '');
      aiContent = aiContent.replace(/以下の点を必ず含めて詳細に分析してください[^\n]*\n?/g, '');
      aiContent = aiContent.replace(/総評は[^\n]*\n?/g, '');
      aiContent = aiContent.replace(/説明文や指示文は一切含めないでください[^\n]*\n?/g, '');
      aiContent = aiContent.trim();
      json.pro_review.content = `${aiContent}\n\n※今回の診断結果はあくまで『書面上で分かる範囲』の減額です。\n\n交渉が面倒、怖いと感じる方もご安心ください。私たちが全ての交渉を代行し、最安値で契約できるようサポートします。まずはLINEでご相談ください。`;
    }

    return NextResponse.json({ result: json });

  } catch (error: any) {
    console.error("Server Error:", error);
    return NextResponse.json({ error: "解析エラーが発生しました", details: error.message }, { status: 500 });
  }
}
