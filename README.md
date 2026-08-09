# FF14 Today

FFXIVを起動する前に開けば「今日やること」が決まる、進捗連動型のWebプランナーです。

現在のv0.2では、LodestoneのキャラクターURLを入力すると公開プロフィールとJob/Classレベルを同期し、Cloudflare D1へキャラクター単位で保存します。プレイ可能時間と気力から暫定Today Planを生成します。

## Current features

- Lodestone URL入力
- 複数キャラクター対応
- Character / World / Data Center / Job Lv同期
- Cloudflare Workers + Static Assets
- Cloudflare D1
- キャラクターごとのプレイ時間・気力・Daily Plan保存
- 最後に使ったLodestone URLをブラウザに保存
- Lodestone parser異常時のfail-closed

## Planned

1. Achievement Screenshot Import
2. 「このページのSSを撮ってください」Evidence Request
3. Big Fish window engine
4. 現行イベント・期限情報
5. Gemini planner
6. START / COMPLETE / SKIP履歴学習

## Local / Cloudflare

```powershell
npm.cmd install
npm.cmd run db:remote
npm.cmd run deploy
```

## Secrets

APIキーはGitHubへコミットしません。Gemini接続時はCloudflare Worker Secretを使用します。

```powershell
npx.cmd wrangler secret put GEMINI_API_KEY
```

ローカル用の `.dev.vars` / `.env` もGit管理対象外です。

## Public app

知り合いは同じWebアプリURLを開き、自分のLodestoneキャラクターページURLを貼って利用する想定です。

> Screenshot Importを公開利用へ進める前に、個人進捗を他ユーザーから分離するための匿名プロフィールトークンを追加します。
