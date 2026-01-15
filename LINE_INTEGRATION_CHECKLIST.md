# LINE連携機能 実装チェックリスト

## ✅ 実装完了項目

### Phase 1: 環境セットアップ
- ✅ 依存関係のインストール（`@vercel/kv`, `@line/bot-sdk`）
- ✅ `.env.local` に環境変数追加
  - `LINE_CHANNEL_SECRET`
  - `LINE_CHANNEL_ACCESS_TOKEN`
  - `NEXT_PUBLIC_LIFF_ID`（要設定）

### Phase 2: コアユーティリティ実装
- ✅ `lib/kv.ts` - Vercel KV操作
  - `createCase()` - 案件作成
  - `createCaseToken()` - caseToken発行（10分TTL）
  - `consumeCaseToken()` - caseToken検証・消費
  - `linkCaseToUser()` - 案件とユーザー紐づけ
  - `getUserCases()` - ユーザーの案件一覧取得
  - `setActiveCase()` / `getActiveCase()` - アクティブ案件管理
- ✅ `lib/line-signature.ts` - Webhook署名検証
- ✅ `lib/line-client.ts` - LINE API クライアント
  - `createLineClient()` - LINE Clientの作成
  - `verifyAccessToken()` - accessToken検証

### Phase 3: API Routes実装
- ✅ `app/api/case/create/route.ts` - 案件作成＋caseToken発行API
- ✅ `app/api/line/link/route.ts` - LIFF→サーバー連携API
- ✅ `app/api/line/webhook/route.ts` - LINE Webhook受信
  - 友だち追加イベント処理
  - 「履歴」コマンド
  - 番号選択（1-5）
  - 「はい」コマンド
  - ヘルプメッセージ

### Phase 4: LIFF実装
- ✅ `app/liff/layout.tsx` - LIFF用レイアウト（SDK読み込み）
- ✅ `app/liff/link/page.tsx` - LIFF自動紐づけページ
  - LIFF初期化
  - caseToken取得
  - accessToken取得
  - サーバー連携
  - 成功メッセージ送信
  - ウィンドウクローズ

### Phase 5: Web UI更新
- ✅ `app/page.tsx` - 「LINEで続き」ボタン追加
  - `isCreatingLineLink` state追加
  - `handleLineLink()` ハンドラー実装
  - ボタンUI実装（グラデーション、アニメーション）

### ドキュメント
- ✅ `LINE_INTEGRATION_SETUP.md` - セットアップガイド
- ✅ `LINE_INTEGRATION_CHECKLIST.md` - 実装チェックリスト

## ⚠️ 残りのセットアップ作業

### 1. Vercel KVの作成
- [ ] Vercelダッシュボードでプロジェクトを選択
- [ ] Storage → Create Database → KV
- [ ] 環境変数が自動設定されることを確認

### 2. LIFF IDの取得と設定
- [ ] LINE Developers Consoleでチャネルを選択
- [ ] LIFF タブ → 追加
- [ ] 設定:
  - LIFFアプリ名: 賃貸初期費用診断連携
  - サイズ: Full
  - エンドポイントURL: `https://your-domain.vercel.app/liff/link`
  - Scope: `profile`, `openid`
  - ボットリンク機能: オン
- [ ] 作成されたLIFF IDをコピー
- [ ] `.env.local` の `NEXT_PUBLIC_LIFF_ID` を更新
- [ ] Vercel環境変数に `NEXT_PUBLIC_LIFF_ID` を追加

### 3. Webhook URLの設定
- [ ] LINE Developers Console → Messaging API タブ
- [ ] Webhook URL: `https://your-domain.vercel.app/api/line/webhook`
- [ ] Webhookの利用: オン
- [ ] 応答メッセージ: オフ（重要！）
- [ ] 検証ボタンでテスト

### 4. Vercel環境変数の設定
- [ ] Vercelダッシュボード → Settings → Environment Variables
- [ ] 以下を追加（全環境: Production, Preview, Development）:
  - `LINE_CHANNEL_SECRET`
  - `LINE_CHANNEL_ACCESS_TOKEN`
  - `NEXT_PUBLIC_LIFF_ID`

### 5. デプロイ
- [ ] `git add .`
- [ ] `git commit -m "Add LINE integration feature"`
- [ ] `git push origin main`
- [ ] Vercelで自動デプロイ完了を確認

### 6. 動作確認
- [ ] 診断を実行して結果を表示
- [ ] 「LINEで続き」ボタンが表示されることを確認
- [ ] ボタンクリックでLIFFページに遷移
- [ ] LINEに「引き継ぎが完了しました！」メッセージが届く
- [ ] LINE上で「履歴」と送信
- [ ] 案件一覧が表示される
- [ ] 番号を送信して案件を選択
- [ ] 「はい」と送信して詳細を確認

## 実装ファイル一覧

### 新規作成ファイル

**ユーティリティ (lib/)**
- `lib/kv.ts` (291行)
- `lib/line-signature.ts` (28行)
- `lib/line-client.ts` (47行)

**API Routes (app/api/)**
- `app/api/case/create/route.ts` (41行)
- `app/api/line/link/route.ts` (68行)
- `app/api/line/webhook/route.ts` (135行)

**LIFF (app/liff/)**
- `app/liff/layout.tsx` (18行)
- `app/liff/link/page.tsx` (134行)

**ドキュメント**
- `LINE_INTEGRATION_SETUP.md` (400行以上)
- `LINE_INTEGRATION_CHECKLIST.md` (このファイル)

### 編集ファイル
- `app/page.tsx` - 「LINEで続き」ボタン追加
- `package.json` - 依存関係追加
- `package-lock.json` - 依存関係ロックファイル更新
- `.env.local` - 環境変数追加（gitignoreで除外）

## セキュリティチェック

- ✅ caseToken: 128bit、10分TTL、ワンタイム
- ✅ accessToken検証: LINE Profile API経由
- ✅ Webhook署名検証: HMAC-SHA256
- ✅ 情報漏洩対策: 全APIでline_user_idフィルタ
- ✅ 環境変数: `.env.local`は.gitignoreに含まれる

## データ設計

### Vercel KV Keys
- `case:{case_id}` - 案件データ（30日TTL）
- `caseToken:{token}` - 案件トークン（10分TTL）
- `lineUser:{line_user_id}` - LINEユーザー情報
- `userCases:{line_user_id}` - ユーザーの案件IDリスト
- `activeCase:{line_user_id}` - アクティブ案件ID

## 参考情報

- **友だち追加URL**: https://lin.ee/UK6DCAl
- **Channel Secret**: `d21bddc9a72cb577f0da05ba5e1ad63e`
- **Channel Access Token**: （環境変数で設定済み）

---

**実装完了日**: 2026年1月15日
**次のステップ**: 上記の「残りのセットアップ作業」を実施
