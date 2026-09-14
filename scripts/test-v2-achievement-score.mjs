import { achievementDistanceScore } from '../src/v2-entry.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const oneShot = achievementDistanceScore('おためし', '対象コンテンツを1回クリアする');
const tenRuns = achievementDistanceScore('十回', '対象コンテンツを10回攻略する');
const tank300WithDailyNote = achievementDistanceScore(
  'みんなの戦士：ランク3',
  '対象コンテンツを戦士で300回攻略する ※コンテンツルーレットは、タンクのいずれかで1日1回のみカウント対象'
);
const tank500WithDailyNote = achievementDistanceScore(
  'みんなの戦士：ランク4',
  '対象コンテンツを戦士で500回攻略する ※コンテンツルーレットは、タンクのいずれかで1日1回のみカウント対象'
);

assert(oneShot < tenRuns, `one-shot should rank easier than 10 runs: ${oneShot} vs ${tenRuns}`);
assert(tenRuns < tank300WithDailyNote, `10 runs should rank easier than 300 runs: ${tenRuns} vs ${tank300WithDailyNote}`);
assert(tank300WithDailyNote >= 300, `daily note must not collapse a 300-run goal: ${tank300WithDailyNote}`);
assert(tank500WithDailyNote > tank300WithDailyNote, `500 runs should rank harder than 300 runs: ${tank500WithDailyNote} vs ${tank300WithDailyNote}`);

console.log(JSON.stringify({ oneShot, tenRuns, tank300WithDailyNote, tank500WithDailyNote }));
