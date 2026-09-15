import { dungeonForLevel, levelableJobs, levelingRecommendations } from '../public/leveling-advisor.js';
import { ISLAND_GUIDE } from '../public/island-guide.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const jobs = [
  { code: 'WAR', name_ja: '戦士', level: 100 },
  { code: 'SAM', name_ja: '侍', level: 99 },
  { code: 'CRP', name_ja: '木工師', level: 94 },
  { code: 'MIN', name_ja: '採掘師', level: 95 },
  { code: 'FSH', name_ja: '漁師', level: 89 },
  { code: 'BLU', name_ja: '青魔道士', level: 80 },
  { code: 'SMN', name_ja: '召喚士', level: 73 },
  { code: 'WHM', name_ja: '白魔道士', level: 57 }
];

const levelable = levelableJobs(jobs);
assert(levelable.some(job => job.code === 'SAM'), '侍レベル99が選択可能であること');
assert(levelable.some(job => job.code === 'CRP'), '木工師レベル94が選択可能であること');
assert(levelable.some(job => job.code === 'MIN'), '採掘師レベル95が選択可能であること');
assert(levelable.some(job => job.code === 'FSH'), '漁師レベル89が選択可能であること');
assert(!levelable.some(job => job.code === 'WAR'), '戦士レベル100は候補外であること');
assert(!levelable.some(job => job.code === 'BLU'), '青魔道士レベル80は上限扱いであること');

assert(dungeonForLevel(91)?.name.includes('イフイカ'), 'レベル91はイフイカ・トゥム');
assert(dungeonForLevel(95)?.name.includes('天深きセノーテ'), 'レベル95は天深きセノーテ');
assert(dungeonForLevel(99)?.name.includes('オリジェニクス'), 'レベル99はオリジェニクス');

const sam = levelingRecommendations(jobs[1]);
const crp = levelingRecommendations(jobs[2]);
const min = levelingRecommendations(jobs[3]);
const fsh = levelingRecommendations(jobs[4]);
const smn = levelingRecommendations(jobs[6]);
const whm = levelingRecommendations(jobs[7]);

assert(sam.methods[0].title.includes('オリジェニクス'), '侍レベル99はオリジェニクスを直接表示');
assert(sam.methods[0].steps?.some(step => step.includes('コンテンツファインダー')), '戦闘案内に実行手順があること');
assert(sam.methods[0].completion?.includes('レベル100'), '侍レベル99に終了条件があること');
assert(crp.methods[0].title.includes('収集品'), '木工師レベル94は収集品を優先');
assert(crp.methods[0].steps?.length >= 5, 'クラフター案内に実行手順があること');
assert(min.methods[0].steps?.some(step => step.includes('採集手帳')), 'ギャザラー案内に採集手帳の手順があること');
assert(fsh.methods[0].steps?.some(step => step.includes('座標3.0, 12.7')), '漁師にオーシャンフィッシング受付座標があること');

const rank3 = ISLAND_GUIDE[3];
assert(rank3.materials.some(([name, count]) => name === '石灰岩' && count === 20), '開拓ランク3は石灰岩20個');
assert(rank3.materials.some(([name, count]) => name === '原木' && count === 22), '開拓ランク3は原木22個');
assert(rank3.steps.some(step => step.includes('Workshop Iを2棟')), '元データに工房2棟の進行情報があること');
assert(rank3.completion.includes('Workshop Iが2棟'), '元データに工房2棟の完了条件があること');
const rank6 = ISLAND_GUIDE[6];
assert(rank6.materials.some(([name, count]) => name === 'ヘンプ' && count === 40), '開拓ランク6はヘンプ40個');

const forbidden = ['ルーレット', '友好部族', 'グランドカンパニー', 'リーヴ'];
for (const result of [sam, crp, min, fsh, smn, whm]) {
  const text = result.methods.map(row => `${row.title} ${row.reason} ${row.tag || ''} ${(row.steps || []).join(' ')} ${row.completion || ''}`).join(' ');
  for (const term of forbidden) assert(!text.includes(term), `レベル上げ案内に不要機能 ${term} を含めない: ${text}`);
}

console.log(JSON.stringify({
  selectable: levelable.map(job => `${job.code}:${job.level}`),
  sam: sam.methods.map(row => row.title),
  crpSteps: crp.methods[0].steps.length,
  minSteps: min.methods[0].steps.length,
  fsh: fsh.methods[0].title,
  rank3Materials: rank3.materials
}, null, 2));
