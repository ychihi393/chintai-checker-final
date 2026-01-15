# Vercel環境変数セットアップガイド

## 方法1: ファイルを使ってまとめてアップロード（推奨）

### 手順

1. **Vercel Dashboardを開く**
   - https://vercel.com にアクセス
   - プロジェクト `chintai-checker` を選択

2. **Settings → Environment Variables に移動**
   - 左メニューから **"Settings"** をクリック
   - **"Environment Variables"** セクションを開く

3. **環境変数をインポート**
   - ページ右上の **"Import .env"** または **"Add New"** の横にある **"..."** メニュー
   - **"Import Variables"** を選択
   - `.env.vercel` ファイルをアップロード

4. **環境を選択**
   - すべての環境にチェック:
     - ✅ Production
     - ✅ Preview
     - ✅ Development

5. **Save して再デプロイ**
   - **"Save"** をクリック
   - 自動的に再デプロイが開始されます

---

## 方法2: 手動で1つずつ追加

上記の方法でうまくいかない場合は、以下を手動で追加：

### 必須の環境変数

#### 1. Gemini API
```
Name: GEMINI_API_KEY
Value: AIzaSyCLZ13ZRfAoAIE2RBnLAwbvLp_6BU7Lcd4
```

#### 2. LINE Channel Secret
```
Name: LINE_CHANNEL_SECRET
Value: d21bddc9a72cb577f0da05ba5e1ad63e
```

#### 3. LINE Channel Access Token
```
Name: LINE_CHANNEL_ACCESS_TOKEN
Value: 1B4U03+sEFsaZiWdj96GdP9+56SjVN9Aau0pUgTrakKGqY7jCOh416Xk3wYHIa/zZkL8q5D8y1wfy3o4wh//1NwZhFIDmifw8n3/QamtYxhXw12lRjEDPlGyY6xG5ju7pkK4xpC8Bav90ZeoRtmLFAdB04t89/1O/w1cDnyilFU=
```

#### 4. LIFF ID
```
Name: NEXT_PUBLIC_LIFF_ID
Value: 2008901046-GM21GYm9
```

### Vercel KV環境変数（自動設定済み）

以下は **Storage → KV** でデータベースを接続すると自動的に設定されます：
- `KV_URL`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `KV_REST_API_READ_ONLY_TOKEN`
- `REDIS_URL`

---

## 設定後の確認

環境変数を追加し、再デプロイが完了したら以下のURLで確認：

```
https://chintai-checker.vercel.app/api/health
```

### 期待される結果

```json
{
  "status": "ok",
  "timestamp": "...",
  "env": {
    "hasLineSecret": true,
    "hasLineToken": true,
    "hasLiffId": true,
    "hasKvUrl": true
  }
}
```

すべてが `true` になっていれば設定完了です！

---

## LINE Developers Consoleの設定

環境変数設定後、LINE側も更新が必要です：

1. **Webhook URL**
   ```
   https://chintai-checker.vercel.app/api/line/webhook
   ```
   - LINE Developers Console → Messaging API設定 → Webhook URL
   - 「検証」ボタンをクリックして成功を確認

2. **LIFF Endpoint URL**
   ```
   https://chintai-checker.vercel.app/liff/link
   ```
   - LINE Developers Console → LIFF → 該当のLIFFアプリ → Endpoint URL

3. **Webhook設定**
   - Webhookの利用: **ON**
   - 応答メッセージ: **OFF**（重要！）

---

## トラブルシューティング

### 環境変数が反映されない場合

1. **再デプロイを実行**
   - Deployments タブ → 最新デプロイ → "..." → "Redeploy"

2. **キャッシュをクリア**
   - 再デプロイ時に "Clear cache" をチェック

3. **ブラウザのキャッシュをクリア**
   - Ctrl + Shift + R (Windows/Linux)
   - Cmd + Shift + R (Mac)

### KV接続エラーが出る場合

```
https://chintai-checker.vercel.app/api/kv-test
```

このエンドポイントでKV接続をテストできます。エラーが出る場合：

1. Storage タブで KV データベースが接続されているか確認
2. 環境変数 `KV_REST_API_URL` と `KV_REST_API_TOKEN` が設定されているか確認

---

## セキュリティ注意事項

⚠️ **重要**: `.env.vercel` ファイルには機密情報が含まれています

- ✅ このファイルはVercel Dashboardにアップロードする目的のみ
- ❌ Gitリポジトリにコミットしないこと（`.gitignore` に追加済み）
- ❌ 他人と共有しないこと
- ✅ 使用後はローカルから削除することを推奨
