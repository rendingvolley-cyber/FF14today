# v0.3 Gate

## Static

- [ ] `node --check src/index.js`
- [ ] `node --check public/app.js`
- [ ] `wrangler.jsonc` parse OK
- [ ] `.env` / `.dev.vars` / API key value がGitにない
- [ ] Lodestone fetch先を公式host allowlistで制限

## Runtime

- [ ] `/api/health` 200
- [ ] `multi_profile=true`
- [ ] `screenshot_import=true`
- [ ] Gemini Secret設定状態が確認できる
- [ ] Kanade URL sync成功
- [ ] 別Lodestone URL sync成功
- [ ] 別ブラウザ/profile tokenでprivate preferencesが混ざらない
- [ ] same profile + same characterでpreferences復元

## Screenshot Import

- [ ] PNG解析
- [ ] JPEG解析
- [ ] 8MB超過を拒否
- [ ] 非画像を拒否
- [ ] AI_ACCESS_CODE不正を403
- [ ] API key未設定を503
- [ ] 同じSS再投入でGemini再実行せず候補再利用
- [ ] 解析時点ではprogress factに入らない
- [ ] 90%以上だけUI初期選択
- [ ] low confidenceは未選択
- [ ] Confirmで選択分のみFact化
- [ ] 他profileのimport_idをConfirm不可
- [ ] 画像bytesはD1へ保存しない
- [ ] 10 analyses/profile/day上限

PASS後、Achievement ID照合 + Big Fishへ進む。
