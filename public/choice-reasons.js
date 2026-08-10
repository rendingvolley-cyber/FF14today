import "./task-board-v2.js";
import "./task-board-schedule-correction.js";

const $ = id => document.getElementById(id);

function activeMode() {
  return document.querySelector('#modeChoices [data-mode].active')?.dataset.mode || 'efficient';
}

function purposeFor(title, mode, badge = '') {
  if (badge.includes('ジャーナル')) return '進行中のジャーナル項目を、調べ直さず1段階進める';
  if (mode === 'craft') return '製作の進捗を作る';
  if (mode === 'gather') return title.includes('釣') ? '釣り・魚図鑑を進める' : '採集の進捗を作る';
  if (mode === 'discover') return '普段触れていない遊びを見つける';
  if (title.includes('レベリング') || title.includes('アライアンス') || title.includes('周')) return '戦闘ジョブの経験値を効率よく伸ばす';
  return '今のプレイ時間で進捗を作る';
}

function whyNowFor(title, reason, mode, badge = '') {
  if (badge.includes('ジャーナル')) return reason || '貼り付けたジャーナルに現在進行中として表示されているため。';
  if (mode === 'efficient') {
    const levelingDone = Boolean($('dailyLeveling')?.checked);
    const allianceDone = Boolean($('dailyAlliance')?.checked);
    if (title.includes('レベリング') && !levelingDone) {
      return '今日のレベルレが未消化で、1日1回の経験値ボーナスが残っているため。';
    }
    if (title.includes('アライアンス') && !allianceDone) {
      return '今日のアラルレが未消化で、日次ボーナスをまだ取れるため。';
    }
    if (title.includes('イフイカ') || title.includes('ウォーコー') || title.includes('セノーテ') || title.includes('ヴァンガード') || title.includes('オリジェニクス')) {
      if (levelingDone && allianceDone) {
        return `レベルレ・アラルレを消化済みで、日課後に経験値を伸ばせる現在レベル帯の反復候補だから。${reason ? ` ${reason}` : ''}`;
      }
      return reason || '現在レベル帯で繰り返せる経験値候補だから。';
    }
  }
  return reason || '現在のカテゴリ・残り時間・進捗から候補に入ったため。';
}

function rankReason(rank, title, condition, badge = '') {
  if (badge.includes('ジャーナル')) {
    return rank === 1
      ? '貼り付けたジャーナル情報と現在の候補を比較した結果、いま着手する候補として先頭に入った。'
      : '現在進行中の実タスクなので、普段のおすすめとは別の実行可能な選択肢として残している。';
  }
  if (rank === 1) {
    if (title.includes('再周回') || condition.includes('再周回')) {
      return '今日すでに触っていても、同カテゴリ内でまだ効率が高いため#1に残っている。';
    }
    return '今選んだカテゴリの中で、日課状況・所要時間・現在の進捗を見て先頭候補になっている。';
  }
  if (rank === 2) return '本命ほど優先ではないが、気分や待ち時間を変えたい時の有力な代替案。';
  return '方向性を少し変えたい時の逃げ道として残している候補。';
}

function addRow(box, label, text) {
  const row = document.createElement('div');
  row.className = 'choice-reason-row';
  const key = document.createElement('div');
  key.className = 'choice-reason-label';
  key.textContent = label;
  const value = document.createElement('div');
  value.className = 'choice-reason-text';
  value.textContent = text;
  row.append(key, value);
  box.append(row);
}

function splitCondition(value) {
  const raw = String(value || '').replace(/^選ぶ条件：/, '').trim();
  if (!raw.includes('｜装備判定：')) return { condition: raw, gear: '' };
  const [condition, gear] = raw.split('｜装備判定：', 2);
  return { condition: condition.trim(), gear: gear.trim() };
}

function enhanceCard(card, rank) {
  if (card.dataset.reasonEnhanced === '1') return;
  const title = card.querySelector('h3,.alternative-title')?.textContent?.trim() || 'この候補';
  const badge = card.querySelector('.method-badge')?.textContent?.trim() || '';
  const reasonNode = card.querySelector('.method-reason');
  const conditionNode = card.querySelector('.method-condition');
  const reason = reasonNode?.textContent?.trim() || '';
  const split = splitCondition(conditionNode?.textContent || '');
  const condition = split.condition;
  const mode = activeMode();

  const box = document.createElement('div');
  box.className = 'choice-reason-box';
  addRow(box, '目的', purposeFor(title, mode, badge));
  addRow(box, 'なぜ今？', whyNowFor(title, reason, mode, badge));
  addRow(box, 'この順位の理由', rankReason(rank, title, condition, badge));
  if (split.gear) addRow(box, '装備チェック', split.gear);
  if (condition) addRow(box, '向いている時', condition);

  const firstStep = card.querySelector('.first-step-nudge');
  const steps = card.querySelector('.method-steps');
  const anchor = firstStep || steps || card.querySelector('.complete-button,.choose-method');
  if (anchor) anchor.before(box);
  else card.append(box);

  reasonNode?.classList.add('reason-source-hidden');
  conditionNode?.classList.add('reason-source-hidden');
  card.dataset.reasonEnhanced = '1';
}

function enhanceAll() {
  const list = $('methodList');
  if (!list) return;
  const primary = list.querySelector('.method-card');
  if (primary) enhanceCard(primary, 1);
  list.querySelectorAll('.method-alternative').forEach((card, index) => enhanceCard(card, index + 2));
}

const list = $('methodList');
if (list) {
  new MutationObserver(() => enhanceAll()).observe(list, { childList: true, subtree: true });
  enhanceAll();
}

document.getElementById('modeChoices')?.addEventListener('click', () => {
  requestAnimationFrame(() => {
    document.querySelectorAll('[data-reason-enhanced="1"]').forEach(node => {
      node.dataset.reasonEnhanced = '0';
      node.querySelector('.choice-reason-box')?.remove();
      node.querySelectorAll('.reason-source-hidden').forEach(source => source.classList.remove('reason-source-hidden'));
    });
    enhanceAll();
  });
});

requestAnimationFrame(() => {
  const planner = document.getElementById('planner');
  const board = document.getElementById('taskBoard');
  if (planner?.parentNode && board) planner.after(board);
});
