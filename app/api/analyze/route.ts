import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const estimateFile = formData.get("estimate") as File | null;
    const planFile = formData.get("plan") as File | null;

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

    // ファイルタイプの検証
    if (!estimateFile.type.startsWith('image/')) {
      return NextResponse.json({ error: "見積書は画像ファイルである必要があります" }, { status: 400 });
    }

    if (planFile && !planFile.type.startsWith('image/')) {
      return NextResponse.json({ error: "募集図面は画像ファイルである必要があります" }, { status: 400 });
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

    **【必須手順】図面の読み取り方法**:
    1. **まず、募集図面（マイソク）を徹底的に読み取ってください。**
       - 図面の全体を隅々まで確認してください（上部、下部、左右、備考欄、特記事項など）
       - 小さな文字や注釈も見落とさないでください
       - 表形式、箇条書き、文章形式など、どのような形式でも読み取ってください
       - 鍵に関連する表記をすべて探してください。以下は例であり、これらに限定されません：
        * 「鍵交換」「鍵代」「鍵費用」「鍵設定費用」「カードキー設定費用」「鍵交換費」「鍵交換費用」「鍵代金」「鍵交換代」「鍵代行」「鍵交換代行」「鍵設定」「カードキー設定」「オートロック設定」「セキュリティ設定」「鍵交換代」「鍵工事費」「鍵交換工事費」「鍵変更費」「鍵変更費用」「鍵交換手数料」「鍵設定手数料」「キー設定」「キー代」「鍵代行費」「鍵交換代行費」「カギ交換」「カギ代」「カギ費用」「カギ設定費用」など、鍵・キー・カギに関連するあらゆる表記を網羅的に探してください
       - 「初期費用」「諸費用」「その他費用」「付帯費用」などの項目欄も必ず確認してください
       - 図面に記載されているすべての費用項目をリストアップしてください

    2. **次に、見積書と照合してください。**
       - 図面に記載されている項目が、見積書にどのように反映されているか確認してください
       - 図面に記載されているのに見積書にない項目がないか確認してください
       - 見積書にある項目が、図面に記載されているか確認してください

    AIとしての機械的な照合ではなく、**「図面に書いていない費用を後出しで請求するのはおかしい」**という不動産取引の原則に基づき、厳しめにチェックを行ってください。

    **【最重要】判定の絶対原則**:
    - 募集図面（マイソク）に記載がない初期費用項目は、**絶対に「適正（fair）」と判定してはいけません**。
    - 図面に記載がない項目は、必ず「削除推奨（cut）」または「交渉可（negotiable）」として判定してください。
    - 例外：礼金・敷金・家賃など、物件の基本条件として必ず存在する項目のみ「適正」の判定が可能です。
    - **この原則を絶対に守ってください。図面に記載がないのに「適正」と判定することは厳禁です。**

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

    **【全項目チェック前の必須作業】**
    診断を開始する前に、必ず以下を実行してください：
    1. 募集図面（マイソク）の画像を隅々まで読み取り、記載されているすべての費用項目をリストアップしてください
    2. 見積書の画像を読み取り、記載されているすべての費用項目をリストアップしてください
    3. **【最重要】見積書に記載されているすべての項目について、金額が0円以外の場合は必ずその金額をprice_originalに反映してください。0円と表示することは絶対に避けてください。見積書に記載されている項目を見落とさないよう、慎重に確認してください。**
    4. 両方のリストを比較し、差分を確認してください
    5. 各項目について、図面に記載があるかどうかを必ず確認してから判定してください
    6. **【重要】見積書に記載されている項目が、何らかの理由で認識されなかった場合でも、その項目の金額を0円として表示することは絶対に避けてください。見積書の全項目を漏れなくチェックしてください。**

    以下の基準で画像を読み解き、少しでも疑わしい場合は「入居者に有利な指摘」をしてください。

    ### ① 付帯商品（消毒、虫駆除、24hサポート、〇〇クラブ、プレミアデスク等）
    * **現場の感覚**: これらは仲介会社が利益を上乗せするために勝手に入れているケースが大半です。
    * **【最重要】付帯商品・サポート関連の表記を広く認識してください**:
        * 以下の表記は全て「付帯商品・サポート関連費用」として認識してください：
          - 「24時間サポート」「24hサポート」「24時間対応」「24h対応」「サポート費用」「サポート費」「サポート料」
          - 「○○サポート」「○○クラブ」「○○サービス」「○○会員」「○○プラン」（○○には会社名やサービス名が入る）
          - 「プレミアデスク」「プレミアサポート」「プレミアクラブ」「プレミアサービス」
          - 「メンテナンスサポート」「生活サポート」「入居サポート」「アフターサポート」
          - 「サポート」「クラブ」「デスク」「サービス」「会員」「プラン」という文字を含む費用項目で、具体的なサービス内容が不明確なもの
          - 「消毒」「虫駆除」「害虫駆除」「シロアリ駆除」「消臭」「抗菌」「除菌」「清掃」などのメンテナンス関連費用
          - 上記に限定されず、サポート・クラブ・サービス・会員・プランなどの文字を含むあらゆる表記を「付帯商品」として認識してください
    * **【重要】見積書の読み取り手順**:
        1. 見積書全体を徹底的に確認してください（特に以下の箇所）:
           - 「初期費用」「諸費用」「その他費用」「付帯費用」などの項目欄
           - 「備考」「特記事項」「注意事項」欄
           - 表の下部や小さな文字での記載
           - 上記の付帯商品・サポート関連のキーワードをすべて探してください
        2. **見積書に付帯商品・サポート関連の項目が記載されている場合は、金額が0円でなければ必ずその金額を反映してください。0円と表示することは絶対に避けてください。**
    * **判断基準**:
        * **見積書に付帯商品・サポート関連の項目が記載されていて、金額が0円以外の場合** → **必ずその金額をprice_originalに反映してください。**
        * **図面に記載なし** → **「削除推奨（cut）」と判断。price_fairは0円としてください。「図面に記載がないため、加入義務はない可能性が高く、外せる可能性が高いです」と指摘。**
        * **図面に記載あり** → 「適正（fair）」とするが、備考欄に小さく「任意」とないか確認。任意の場合は「交渉可（negotiable）」としてください。
        * **図面に「月額」「無料」と記載** → 初期費用として請求されるべきではない可能性が高いので「削除推奨（cut）」。price_fairは0円としてください。
        * **重要**: 見積書に記載されている項目の金額を0円と表示することは絶対に避けてください。必ず見積書に記載されている金額を正確に反映してください。

    ### ② 鍵交換費用
    * **現場の感覚**: 鍵交換費用は、見積書に記載されていれば基本的に必須です。本来、国交省ガイドラインでは「貸主負担」が原則ですが、実際の現場では借主負担が通例です。見積書に記載されている場合は、業者が必須として扱っている前提で判断してください。
    * **【最重要】鍵関連の表記を広く認識してください**:
        * 以下の表記は全て「鍵交換費用」として認識してください：
          - 「鍵交換」「鍵代」「鍵費用」「鍵設定費用」「カードキー設定費用」「鍵交換費」「鍵交換費用」「鍵代金」「鍵交換代」「鍵代行」「鍵交換代行」
          - 「鍵設定」「カードキー設定」「オートロック設定」「セキュリティ設定」「鍵交換代」「鍵工事費」「鍵交換工事費」
          - 「鍵変更費」「鍵変更費用」「鍵交換手数料」「鍵設定手数料」「キー設定」「キー代」「鍵代行費」「鍵交換代行費」
          - 「カギ交換」「カギ代」「カギ費用」「カギ設定費用」「鍵」「キー」「カギ」という文字を含む費用項目
          - 上記に限定されず、鍵・キー・カギに関連するあらゆる表記を「鍵交換費用」として認識してください
    * **【重要】見積書の読み取り手順**:
        1. 見積書全体を徹底的に確認してください（特に以下の箇所）:
           - 「初期費用」「諸費用」「その他費用」「付帯費用」などの項目欄
           - 「備考」「特記事項」「注意事項」欄
           - 表の下部や小さな文字での記載
           - 上記の鍵関連のキーワードをすべて探してください
        2. 金額が記載されていなくても、鍵関連の文字があれば「記載あり」と判断してください
        3. **見積書に鍵関連の項目が記載されている場合は、金額が0円でなければ必ずその金額を反映してください。0円と表示することは絶対に避けてください。**
    * **【重要】図面の読み取り手順**:
        1. 図面全体を徹底的に確認してください（特に以下の箇所）:
           - 「初期費用」欄や「諸費用」欄
           - 「その他費用」「付帯費用」欄
           - 「備考」「特記事項」「注意事項」欄
           - 表の下部や小さな文字での記載
           - 上記の鍵関連のキーワードをすべて探してください
        2. 金額が記載されていなくても、鍵関連の文字があれば「記載あり」と判断してください
        3. 「借主負担」「入居者負担」「要」などの記載があれば、必ず「記載あり」と判断してください
    * **判断基準**:
        * **見積書に鍵関連の項目が記載されていて、金額が0円以外の場合** → **必ずその金額をprice_originalに反映してください。基本的に「必須」として扱い、price_fairも同額または0円に近い金額としてください（図面に記載がない場合のみ交渉可とする）。**
        * **見積書に記載があり、図面にも記載がある場合** → **「適正（fair）」と判断。「図面に記載があるため、支払いが必要です」と判定。**
        * **見積書に記載があるが、図面に記載がない場合** → **「交渉可（negotiable）」と判断。「図面に記載がないため、ガイドライン通りオーナー負担にできる可能性が高いです」と指摘。ただし、見積書の金額は必ずprice_originalに反映してください。**
        * **見積書に記載がない場合** → 項目自体を出力しないか、図面に記載があれば「交渉可能（貸主負担にできる）」と判断。
        * **重要**: 見積書に記載されている項目の金額を0円と表示することは絶対に避けてください。必ず見積書に記載されている金額を正確に反映してください。

    ### ③ 仲介手数料
    * **現場の感覚**: 法律上の原則は「0.5ヶ月分」です。1ヶ月分取るには依頼者の承諾が必要です。
    * **判断基準**:
        * 見積もりが「1.0ヶ月分（または1.1ヶ月分）」になっている場合 → **「ぼったくり（減額可能）」**と判定。
        * 「原則は0.5ヶ月分です。承諾していないなら下がる可能性が高いです」と伝え、さらに「交渉が面倒、怖いと感じる方もご安心ください。私たちが全ての交渉を代行し、最安値で契約できるようサポートします。まずはLINEでご相談ください」と誘導してください。

    ### ④ 火災保険料
    * **現場の感覚**: 管理会社指定の保険は割高（2万円以上）なことが多いです。自分で入れば安くなる可能性が高いです。
    * **重要**: 火災保険は「入らなくていい」ということは絶対にありません。必ず加入が必要です。ただし、0円にできる可能性はありません。
    * **判断基準**:
        * 見積額が「16,000円」を超えている場合 → **「見直し推奨」**。「指定必須とあっても、交渉次第で自己加入（約16,000円以下）に変更できる可能性が高いです。ただし、火災保険自体は必ず加入が必要です」とアドバイス。
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

    **【最重要】見積書の項目を0円にしない原則**:
    - 見積書に記載されている項目で、金額が0円以外のものは、必ずその金額をprice_originalに反映してください。
    - 見積書に記載されている項目を見落とすことのないよう、見積書のすべての項目を慎重に確認してください。
    - 鍵交換費用、付帯商品（サポート・クラブ・サービスなど）、その他の費用項目について、見積書に記載がある場合は必ず認識してください。
    - 表記方法が異なっていても、その項目が鍵交換費用や付帯商品などであることが判断できる場合は、必ずその項目を出力してください。
    - 見積書に記載されている項目の金額を0円とすることは絶対に避けてください。

    {
      "property_name": "物件名（不明なら'不明'）",
      "room_number": "号室",
      "items": [
        {
          "name": "項目名（例：仲介手数料、付帯費用（消毒・サポート等）、鍵交換費用、火災保険、保証会社保証料など）",
          "price_original": 数値（見積書の額。**重要**: 見積書に記載されている金額を必ず正確に反映してください。0円とすることは絶対に避けてください。）,
          "price_fair": 数値（適正額。削除可能な場合は0）,
          "status": "fair|negotiable|cut",
          "reason": "簡潔な説明のみ（1-2行程度）。断定的な表現は避け、「可能性が高いです」「可能性があります」などの表現を使用してください。例：「図面に記載がないため削除できる可能性が高いです」「0.5ヶ月分を超えているため減額できる可能性が高いです」「自己加入すれば約16,000円以下に変更できる可能性が高いです（ただし火災保険は必ず加入が必要）」など。長い説明や「交渉を代行する」などのメッセージは含めないでください。**重要**: 図面に記載がない項目については、必ず「図面に記載がないため」という理由を含めてください。"
        }
      ],
      "total_original": 合計金額,
      "total_fair": 適正合計,
      "discount_amount": 差額,
      "pro_review": { 
        "content": "総評は以下のフォーマットで出力してください：\n\n【総括】（一行で、この物件の初期費用についての結論を一言で太文字で表現。例：図面にない付帯費用が多数乗せられています。典型的なぼったくり見積もりです。）\n\n【最善の行動】（簡潔に、次に取るべき行動を2-3行で）\n\n【ポイント】\n・削減可能な項目を簡潔に箇条書き（各項目1行）\n・交渉のポイントを簡潔に箇条書き\n・注意点があれば簡潔に箇条書き\n\n**重要**: \n- 総評は簡潔で分かりやすく、借主がすぐに行動できる内容にしてください。\n- 説明文や指示文は一切含めないでください。\n- 同じ内容を繰り返さないでください（重複を避ける）。\n- 「必ず」「絶対に」「必ずしも」などの断定的な表現は避け、「可能性が高いです」「推奨します」「検討することをお勧めします」などの表現を使用してください。\n- 例：「契約前に必ず仲介会社に詳細な説明を求め」→「契約前に仲介会社に詳細な説明を求めることを推奨します」\n- 各項目を1件1件明確に区別して、重複のない文章を生成してください。"
      },
      "risk_score": 0〜100の数値（払いすぎ危険度。削減可能額が多いほど高いスコア）
    }
    `;
    parts.push({ text: prompt });

    // 環境変数からモデル名を取得（デフォルトはgemini-2.5-flash）
    // 他の選択肢: "gemini-2.5-flash-lite", "gemini-3-flash", "gemini-2.5-flash-tts"
    const primaryModel = process.env.GEMINI_MODEL_NAME || "gemini-2.5-flash";
    
    // フォールバック用のモデルリスト（制限が緩い順）
    const fallbackModels = ["gemini-2.5-flash-lite", "gemini-3-flash", "gemini-2.5-flash"];
    
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
      // エラーオブジェクトの詳細をログ出力
      console.error("API Error Details:", {
        status: apiError.status,
        statusCode: apiError.statusCode,
        code: apiError.code,
        message: apiError.message,
        errorDetails: apiError.errorDetails,
        stack: apiError.stack
      });
      
      // APIレート制限エラー（429）を検出（複数のパターンをチェック）
      const isRateLimitError = 
        apiError.status === 429 || 
        apiError.statusCode === 429 ||
        apiError.code === 429 ||
        apiError.message?.includes('429') || 
        apiError.message?.includes('rate limit') || 
        apiError.message?.includes('Rate limit') ||
        apiError.message?.includes('Too Many Requests') ||
        apiError.message?.includes('RESOURCE_EXHAUSTED') ||
        (apiError.errorDetails && Array.isArray(apiError.errorDetails) && 
         apiError.errorDetails.some((detail: any) => 
           detail.reason === 'RATE_LIMIT_EXCEEDED' || 
           detail.reason === 'RESOURCE_EXHAUSTED' ||
           detail.status?.code === 429
         ));
      
      if (isRateLimitError) {
        console.error("API Rate Limit Error detected for model:", primaryModel);
        console.error("Full error object:", JSON.stringify(apiError, null, 2));
        
        // フォールバックモデルを試す
        // primaryModelを除外したフォールバックモデルリストを作成
        const availableFallbacks = fallbackModels.filter(model => model !== primaryModel);
        
        if (availableFallbacks.length === 0) {
          console.error("フォールバックモデルがありません");
          return NextResponse.json({ 
            error: "APIレート制限に達しました",
            details: "短時間に多くのリクエストが送信されました。しばらく時間をおいてから再度お試しください。",
            errorCode: "RATE_LIMIT"
          }, { status: 429 });
        }
        
        // すべてのフォールバックモデルを順番に試す
        let fallbackSuccess = false;
        for (let i = 0; i < availableFallbacks.length; i++) {
          const nextModel = availableFallbacks[i];
          
          console.log(`フォールバック試行 ${i + 1}/${availableFallbacks.length}: ${primaryModel} -> ${nextModel} を試します`);
          
          try {
            const fallbackModelInstance = genAI.getGenerativeModel({ 
              model: nextModel, 
              generationConfig: { responseMimeType: "application/json" }
            });
            result = await fallbackModelInstance.generateContent(parts);
            usedModel = nextModel;
            console.log(`✅ フォールバック成功: ${nextModel} を使用しました`);
            fallbackSuccess = true;
            break;
          } catch (fallbackError: any) {
            console.error(`フォールバック失敗 (${nextModel}):`, {
              status: fallbackError.status,
              statusCode: fallbackError.statusCode,
              code: fallbackError.code,
              message: fallbackError.message
            });
            // 次のフォールバックモデルを試す
            continue;
          }
        }
        
        if (!fallbackSuccess) {
          console.error("すべてのフォールバックモデルが失敗しました");
          return NextResponse.json({ 
            error: "APIレート制限に達しました",
            details: "短時間に多くのリクエストが送信されました。しばらく時間をおいてから再度お試しください。",
            errorCode: "RATE_LIMIT"
          }, { status: 429 });
        }
      } else {
        // その他のAPIエラー
        console.error("Non-rate-limit API Error:", apiError);
        throw apiError;
      }
    }
    
    // resultが未定義の場合はエラー
    if (!result) {
      throw new Error("AI解析の結果が取得できませんでした");
    }
    
    const responseText = result.response.text();
    
    // JSONパースのエラーハンドリング
    let json;
    try {
      // Markdownコードブロックを削除
      const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      json = JSON.parse(cleanedText);
    } catch (parseError: any) {
      console.error("JSON Parse Error:", parseError);
      console.error("Response text:", responseText);
      throw new Error(`AIの応答の解析に失敗しました: ${parseError.message}`);
    }
    
    // 総評フォーマットの整形（AIの出力から説明文を削除）
    if (json.pro_review && json.pro_review.content) {
      let aiContent = json.pro_review.content.trim();
      // 不要な説明文を削除
      aiContent = aiContent.replace(/この物件の初期費用について[^\n]*\n?/g, '');
      aiContent = aiContent.replace(/以下の点を必ず含めて詳細に分析してください[^\n]*\n?/g, '');
      aiContent = aiContent.replace(/総評は[^\n]*\n?/g, '');
      aiContent = aiContent.replace(/説明文や指示文は一切含めないでください[^\n]*\n?/g, '');
      aiContent = aiContent.trim();
      // 重複を防ぐため、既に含まれている場合は追加しない
      const noticeText = "※今回の診断結果はあくまで『書面上で分かる範囲』の減額です。";
      const negotiationText = "交渉が面倒、怖いと感じる方もご安心ください。私たちが全ての交渉を代行し、最安値で契約できるようサポートします。まずはLINEでご相談ください。";
      
      if (!aiContent.includes(noticeText)) {
        json.pro_review.content = aiContent;
      } else {
        json.pro_review.content = aiContent;
      }
    }

    return NextResponse.json({ result: json });

  } catch (error: any) {
    console.error("Server Error:", error);
    console.error("Error stack:", error.stack);
    
    // より詳細なエラーメッセージを返す
    let errorMessage = "解析エラーが発生しました";
    let errorDetails = error.message || "不明なエラー";
    
    // エラータイプに応じたメッセージ
    if (error.status === 429 || error.message?.includes('429') || error.message?.includes('rate limit') || error.message?.includes('Too Many Requests')) {
      errorMessage = "APIレート制限に達しました";
      errorDetails = "短時間に多くのリクエストが送信されました。しばらく時間をおいてから再度お試しください。";
    } else if (error.message?.includes("JSON")) {
      errorMessage = "AIからの応答の解析に失敗しました";
      errorDetails = "AIの応答形式が正しくありません。もう一度お試しください。";
    } else if (error.message?.includes("API") || error.status === 401 || error.status === 403) {
      errorMessage = "AI APIへの接続に失敗しました";
      errorDetails = "APIキーの設定を確認してください。";
    } else if (error.message?.includes("timeout") || error.message?.includes("time")) {
      errorMessage = "解析がタイムアウトしました";
      errorDetails = "画像が大きすぎる可能性があります。もう一度お試しください。";
    } else if (error.message?.includes("image") || error.message?.includes("画像")) {
      errorMessage = "画像の処理に失敗しました";
      errorDetails = "画像形式を確認してください。JPEG、PNG形式を推奨します。";
    }
    
    // ステータスコードを適切に設定
    const statusCode = error.status === 429 ? 429 : (error.status || 500);
    
    return NextResponse.json({ 
      error: errorMessage, 
      details: errorDetails,
      fullError: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: statusCode });
  }
}
