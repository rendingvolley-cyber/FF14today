# FF14 Today

FFXIVの「今日は何をやるか」を自分で選ばなくて済むようにする、Cloudflare Workers + D1製のWebアプリです。

## v0.3

- LodestoneキャラクターURL入力
- Character / World / Data Center / Job Lv同期
- 15分〜2時間+のプレイ時間と気力1〜5
- 暫定Today Plan
- **匿名ブラウザプロフィール分離**
- **Achievement Screenshot Import**
- 「次にこの実績ページのSSを撮ってください」というEvidence Request
- Gemini 2.5 Flashによる画像→構造化候補
- Import Preview（高信頼だけ初期選択）
- 確認後にだけ進捗Fact DBへ保存
- 同一SSの重複解析を回避
- SS画像本体はD1へ保存しない
- 1匿名プロフィールあたりSS解析10回/日
- Lodestone URLはFF14公式hostだけ許可（SSRF対策）

## Public repository とSecret

このリポジトリにGemini APIキーは置きません。

Cloudflare Worker Secretとして以下を設定します。

```powershell
npx.cmd wrangler secret put GEMINI_API_KEY
npx.cmd wrangler secret put AI_ACCESS_CODE
```

- `GEMINI_API_KEY`: Google AI Studioで作成したGemini APIキー
- `AI_ACCESS_CODE`: 自分と知り合いだけに共有する任意の長いコード

`AI_ACCESS_CODE` はAPIキーそのものを配る代わりの入口です。公開Webサイトを見つけた第三者が、Gemini API枠を勝手に消費しにくくするために使います。

ローカル開発では `.dev.vars` / `.env` を利用できますが、どちらも `.gitignore` 対象です。

## 匿名プロフィール

アプリ初回アクセス時、ブラウザ側でランダムな32-byte tokenを作りLocalStorageへ保存します。Workerにはtokenを送りますが、D1に保存するのはSHA-256 hashだけです。

そのため同じLodestoneキャラクターURLを別ブラウザで使っても、プレイ時間・気力・Daily Plan・Screenshot Import・private progress factsは混ざりません。

Lodestone由来のCharacter/Job snapshotだけは公開情報キャッシュとして共有します。

## Screenshot Import

1. キャラクターをLodestoneから読み込む
2. `このページのSSを撮ってください` を確認
3. FF14内で該当の実績ページを表示してSS
4. PNG/JPEG/WebPをアップロード
5. Geminiが見えている実績だけJSON化
6. 90%以上の候補だけ初期選択
7. 人間がプレビュー確認
8. `インポート` 後に初めてD1へFact確定

AIの読み取り結果を確認なしでprogress factに昇格しません。

### 画像の扱い

アップロード画像はWorkerからGemini APIへ転送しますが、画像bytesそのものはD1へ保存しません。D1に残すのは、画像SHA-256・ファイル名・MIME type・解析候補・確認結果です。

## Gemini

既定モデルは `gemini-2.5-flash`。公開設定値なので `wrangler.jsonc` の `GEMINI_MODEL` で変更できます。APIキーはSecretのみです。

## D1

Migration:

- `0001_init.sql`
- `0002_multi_character.sql`
- `0003_profile_isolation_and_screenshot_import.sql`

v0.3 private schemaはWorker側も `CREATE TABLE IF NOT EXISTS` でfail-safeに初期化するため、GitHub自動deploy直後でも新機能が起動できます。正式なDB管理にはmigrationを使います。

手動適用:

```powershell
npm.cmd run db:remote
```

## API

- `GET /api/health`
- `GET /api/state?lodestone_id=...`
- `POST /api/sync`
- `POST /api/plan`
- `POST /api/achievement-import/analyze`
- `POST /api/achievement-import/confirm`

private APIは `x-profile-token` を使用します。Geminiを使うAnalyze APIはさらに `x-ai-access-code` を要求します。

## 次

v0.4候補:

1. Screenshotの実績名をXIVAPI/FFXIV static dataへ照合して正式Achievement ID化
2. 実績のdescription/達成条件から具体的な行動候補を生成
3. Big Fish window engine
4. 期間イベント/週課/期限データ
5. Gemini Today Planner
6. START / COMPLETE / SKIP履歴
