# FF14 Today

Kanade Tachibana専用のFFXIVデイリープランナーです。

## v0.4

複数ユーザー/知り合い向け運用をやめ、自分専用へ簡略化しました。

- Lodestone character: Kanade Tachibana / Chocobo [Mana] 固定
- URL入力不要
- 既存のブラウザprofile tokenは裏側だけで利用（操作不要）
- 実績Screenshot Import
- Gemini 2.5 Flash
- 共有AIアクセスコード入力は不要
- SS解析はアプリ全体で1日20回まで
- 画像本体はD1へ保存しない

## Secret

必要なのはGemini APIキーだけです。

```powershell
npx.cmd wrangler secret put GEMINI_API_KEY
```

APIキーはGitHubやブラウザへ配信しません。

## Deploy

CloudflareとGitHub `main` が接続済みなら、mainへのpushで自動deployします。
