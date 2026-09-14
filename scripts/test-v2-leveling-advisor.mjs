import { levelableJobs, levelingRecommendations } from '../public/leveling-advisor.js';

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
assert(!levelable.some(job => job.code === 'WAR'), 'WAR Lv100 should be hidden from leveling candidates');
assert(!levelable.some(job => job.code === 'BLU'), 'BLU Lv80 should be treated as current limited-job cap');

const sam = levelingRecommendations(jobs[1]);
const crp = levelingRecommendations(jobs[2]);
const min = levelingRecommendations(jobs[3]);
const fsh = levelingRecommendations(jobs[4]);

assert(sam.methods.some(row => row.title.includes('レベリングID')), 'SAM Lv99 should recommend an appropriate leveling dungeon');
assert(crp.methods[0].title.includes('収集品'), 'CRP Lv94 should prioritize current-level collectables');
assert(min.methods[0].title.includes('収集品'), 'MIN Lv95 should prioritize current-level collectables');
assert(fsh.methods[0].title.includes('オーシャンフィッシング'), 'FSH should prioritize Ocean Fishing');

const forbidden = ['ルーレット', '友好部族', 'グランドカンパニー', 'リーヴ'];
for (const result of [sam, crp, min, fsh]) {
  const text = result.methods.map(row => `${row.title} ${row.reason}`).join(' ');
  for (const term of forbidden) {
    assert(!text.includes(term), `leveling recommendations must not include ${term}: ${text}`);
  }
}

console.log(JSON.stringify({
  selectable: levelable.map(job => `${job.code}:${job.level}`),
  sam: sam.methods.map(row => row.title),
  crp: crp.methods.map(row => row.title),
  min: min.methods.map(row => row.title),
  fsh: fsh.methods.map(row => row.title)
}, null, 2));
