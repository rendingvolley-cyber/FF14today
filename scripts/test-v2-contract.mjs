import fs from 'node:fs';

const html = fs.readFileSync('public/index.html', 'utf8');
const worker = fs.readFileSync('src/v2-entry.js', 'utf8');
const wrangler = JSON.parse(fs.readFileSync('wrangler.jsonc', 'utf8'));

for (const required of ['v2 · ON DEMAND', '無人島', 'アチーブ候補を取得', '時限採集を取得', 'まとめて取得']) {
  if (!html.includes(required)) throw new Error(`missing v2 UI marker: ${required}`);
}
for (const removed of ['遊べる時間', '気力', 'レベルレ済み', 'アラルレ済み', '双蛇党', 'モブハント', 'スクショ', 'ポケモン総当たり']) {
  if (html.includes(removed)) throw new Error(`legacy UI marker remains: ${removed}`);
}
for (const required of ['achievement_candidates: true', 'timed_gathering_on_demand: true', 'fishing_on_demand: true', 'not_available_in_v2']) {
  if (!worker.includes(required)) throw new Error(`missing worker marker: ${required}`);
}
if (wrangler.main !== 'src/v2-entry.js') throw new Error(`unexpected wrangler main: ${wrangler.main}`);
console.log('FF14 Today v2 contract OK');
