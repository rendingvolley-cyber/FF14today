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
  { code: 'BLU', name_ja: '青魔道士', level: 80 }
];

const levelable = levelableJobs(jobs);
assert(levelable.some(job => job.code === 'SAM'), 'SAM Lv99 should be selectable');
assert(levelable.some(job => job.code === 'CRP'), 'CRP Lv94 should be selectable');
assert(levelable.some(job => job.code === 'MIN'), 'MIN Lv95 should be selectable');
assert(levelable.some(job => job.code === 'FSH'), 'FSH Lv89 should be selectable');
assert(!levelable.some(job => job.code === 'WAR'), 'WAR Lv100 should be hidden');
assert(!levelable.some(job => job.code === 'BLU'), 'BLU Lv80 should be treated as cap');

assert(dungeonForLevel(91)?.name.includes('イフイカ'), 'Lv91 must resolve to Ihuykatumu');
assert(dungeonForLevel(95)?.name.includes('天深きセノーテ'), 'Lv95 must resolve to Skydeep Cenote');
assert(dungeonForLevel(99)?.name.includes('オリジェニクス'), 'Lv99 must resolve to Origenics');

const sam = levelingRecommendations(jobs[1]);
const crp = levelingRecommendations(jobs[2]);
const min = levelingRecommendations(jobs[3]);
const fsh = levelingRecommendations(jobs[4]);

assert(sam.methods[0].title.includes('オリジェニクス'), 'SAM Lv99 should name Origenics directly');
assert(sam.methods[0].steps?.some(step => step.includes('コンテンツファインダー')), 'battle advice must contain executable steps');
assert(sam.methods[0].completion?.includes('Lv100'), 'SAM Lv99 must expose a concrete finish condition');
assert(crp.methods[0].title.includes('収集品'), 'CRP Lv94 should prioritize collectables');
assert(crp.methods[0].steps?.length >= 5, 'crafter advice must explain the actual workflow');
assert(min.methods[0].steps?.some(step => step.includes('採集手帳')), 'gatherer advice must say how to locate the target');
assert(fsh.methods[0].steps?.some(step => step.includes('X:3.0 Y:12.7')), 'FSH must include Ocean Fishing registration coordinates');

const rank3 = ISLAND_GUIDE[3];
assert(rank3.materials.some(([name, count]) => name === '石灰岩' && count === 20), 'Rank 3 must require 20 limestone');
assert(rank3.materials.some(([name, count]) => name === '原木' && count === 22), 'Rank 3 must require 22 logs');
assert(rank3.steps.some(step => step.includes('Workshop Iを2棟')), 'Rank 3 must explain exact workshop count');
assert(rank3.completion.includes('Workshop Iが2棟'), 'Rank 3 must expose completion condition');
const rank6 = ISLAND_GUIDE[6];
assert(rank6.materials.some(([name, count]) => name === 'ヘンプ' && count === 40), 'Rank 6 must require 40 hemp');
assert(rank6.steps.some(step => step.includes('Workshop I×3')), 'Rank 6 must explain all three workshop upgrades');

const forbidden = ['ルーレット', '友好部族', 'グランドカンパニー', 'リーヴ'];
for (const result of [sam, crp, min, fsh]) {
  const text = result.methods.map(row => `${row.title} ${row.reason} ${(row.steps || []).join(' ')}`).join(' ');
  for (const term of forbidden) assert(!text.includes(term), `recommendations must not include ${term}: ${text}`);
}

console.log(JSON.stringify({
  selectable: levelable.map(job => `${job.code}:${job.level}`),
  sam: sam.methods.map(row => row.title),
  crpSteps: crp.methods[0].steps.length,
  minSteps: min.methods[0].steps.length,
  fsh: fsh.methods[0].title,
  rank3Materials: rank3.materials
}, null, 2));
