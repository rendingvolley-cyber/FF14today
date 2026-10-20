import {
  anonymizeConversation,
  containsKnownRealName,
  parseChatLog,
  uniqueSpeakers
} from "/chat-assist-core.mjs";

const SELF_STORAGE_KEY = "ff14-chat-assist:self-speaker:v1";
const NOTES_STORAGE_KEY = "ff14-chat-assist:participant-notes:v1";
const SELF_ABSENT = "__SELF_ABSENT__";

const input = document.querySelector("#chatLogInput");
const parseButton = document.querySelector("#parseChatButton");
const clearButton = document.querySelector("#clearChatButton");
const summary = document.querySelector("#parseSummary");
const conversation = document.querySelector("#conversationResult");
const unparsedBox = document.querySelector("#unparsedResult");
const selfSpeakerSelect = document.querySelector("#selfSpeakerSelect");
const memoSpeakerSelect = document.querySelector("#memoSpeakerSelect");
const memoInput = document.querySelector("#participantMemo");
const saveMemoButton = document.querySelector("#saveMemoButton");
const memoStatus = document.querySelector("#memoStatus");
const generateButton = document.querySelector("#generateRepliesButton");
const aiStatus = document.querySelector("#aiStatus");
const privacyStatus = document.querySelector("#privacyStatus");
const replyCards = [...document.querySelectorAll("[data-reply-key]")];

let currentResult = null;
let notes = loadNotes();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeStorageGet(key, fallback = null) {
  try { return localStorage.getItem(key) ?? fallback; }
  catch { return fallback; }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function loadNotes() {
  try {
    const parsed = JSON.parse(safeStorageGet(NOTES_STORAGE_KEY, "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveNotes() {
  return safeStorageSet(NOTES_STORAGE_KEY, JSON.stringify(notes));
}

function renderMessage(message) {
  const meta = [message.timestamp, message.channel].filter(Boolean).map(escapeHtml).join(" · ");
  return `
    <article class="chat-message">
      <div class="chat-message-head">
        <strong>${escapeHtml(message.speaker)}</strong>
        ${meta ? `<span>${meta}</span>` : ""}
      </div>
      <p>${escapeHtml(message.text)}</p>
    </article>
  `;
}

function renderResult(result) {
  summary.textContent = `${result.stats.parsed_messages}件を解析 / 未解析 ${result.stats.unparsed_lines}件`;
  conversation.innerHTML = result.messages.length
    ? result.messages.map(renderMessage).join("")
    : '<p class="muted">解析できる発言がありません。</p>';

  if (!result.unparsed.length) {
    unparsedBox.hidden = true;
    unparsedBox.innerHTML = "";
  } else {
    unparsedBox.hidden = false;
    unparsedBox.innerHTML = `
      <h3>解析できなかった行</h3>
      <p class="muted">この行は無視されました。元ログは変更していません。</p>
      <ul>${result.unparsed.map(item => `<li><strong>${item.line_number}行目</strong> ${escapeHtml(item.raw)}</li>`).join("")}</ul>
    `;
  }

  refreshSpeakerControls();
}

function buildOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function refreshSpeakerControls() {
  const speakers = uniqueSpeakers(currentResult?.messages || []);
  const savedSelf = safeStorageGet(SELF_STORAGE_KEY, "");
  const previousSelf = selfSpeakerSelect.value;

  selfSpeakerSelect.innerHTML = "";
  selfSpeakerSelect.append(buildOption("", "自分を選択"));
  selfSpeakerSelect.append(buildOption(SELF_ABSENT, "このログに自分の発言なし"));
  speakers.forEach(speaker => selfSpeakerSelect.append(buildOption(speaker, speaker)));
  selfSpeakerSelect.disabled = speakers.length === 0;

  const candidate = [previousSelf, savedSelf, speakers.includes("Me") ? "Me" : ""]
    .find(value => value === SELF_ABSENT || speakers.includes(value));
  if (candidate) selfSpeakerSelect.value = candidate;

  refreshMemoSpeakers();
  updateGenerateAvailability();
}

function selectedSelfSpeaker() {
  if (selfSpeakerSelect.value === SELF_ABSENT) return null;
  return selfSpeakerSelect.value || undefined;
}

function hasExplicitSelfSelection() {
  return selfSpeakerSelect.value === SELF_ABSENT || Boolean(selfSpeakerSelect.value);
}

function refreshMemoSpeakers() {
  const speakers = uniqueSpeakers(currentResult?.messages || []);
  const self = selectedSelfSpeaker();
  const previous = memoSpeakerSelect.value;
  const candidates = speakers.filter(speaker => !self || speaker !== self);

  memoSpeakerSelect.innerHTML = "";
  if (!candidates.length) {
    memoSpeakerSelect.append(buildOption("", "相手がいません"));
    memoSpeakerSelect.disabled = true;
    memoInput.value = "";
    memoInput.disabled = true;
    saveMemoButton.disabled = true;
    return;
  }

  candidates.forEach(speaker => memoSpeakerSelect.append(buildOption(speaker, speaker)));
  memoSpeakerSelect.disabled = false;
  const next = candidates.includes(previous) ? previous : candidates[0];
  memoSpeakerSelect.value = next;
  memoInput.disabled = false;
  saveMemoButton.disabled = false;
  loadCurrentMemo();
}

function loadCurrentMemo() {
  const speaker = memoSpeakerSelect.value;
  memoInput.value = speaker ? String(notes[speaker] || "") : "";
  memoStatus.textContent = "このメモはこのブラウザだけに保存されます。";
}

function saveCurrentMemo() {
  const speaker = memoSpeakerSelect.value;
  if (!speaker) return;
  const value = memoInput.value.trim();
  if (value) notes[speaker] = value;
  else delete notes[speaker];
  const ok = saveNotes();
  memoStatus.textContent = ok ? "保存しました。" : "保存できませんでした。ブラウザ設定を確認してください。";
}

function clearReplies() {
  replyCards.forEach(card => {
    const text = card.querySelector("[data-reply-text]");
    const button = card.querySelector("[data-copy-reply]");
    text.textContent = "まだ生成していません。";
    button.disabled = true;
    button.dataset.reply = "";
  });
}

function updateGenerateAvailability() {
  const canGenerate = Boolean(currentResult?.messages?.length) && hasExplicitSelfSelection();
  generateButton.disabled = !canGenerate;
  if (!currentResult?.messages?.length) {
    privacyStatus.textContent = "まずチャットログを解析してください。";
  } else if (!hasExplicitSelfSelection()) {
    privacyStatus.textContent = "自分の発言者名を選んでください。";
  } else {
    privacyStatus.textContent = "AI送信時は参加者名を ME / PLAYER_001… に置換します。実名はローカルに残ります。";
  }
}

function parseCurrentInput() {
  currentResult = parseChatLog(input.value);
  renderResult(currentResult);
  clearReplies();
  aiStatus.textContent = "返信案はまだ生成していません";
}

async function copyText(text, button) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  const original = button.textContent;
  button.textContent = "コピー済み";
  setTimeout(() => { button.textContent = original; }, 1200);
}

function renderReplies(replies) {
  replyCards.forEach(card => {
    const key = card.dataset.replyKey;
    const text = String(replies?.[key] || "").trim();
    const textNode = card.querySelector("[data-reply-text]");
    const button = card.querySelector("[data-copy-reply]");
    textNode.textContent = text || "生成できませんでした。";
    button.disabled = !text;
    button.dataset.reply = text;
  });
}

async function generateReplies() {
  if (!currentResult?.messages?.length || !hasExplicitSelfSelection()) return;
  saveCurrentMemo();

  let anonymized;
  try {
    anonymized = anonymizeConversation(
      currentResult.messages,
      selectedSelfSpeaker(),
      notes
    );
  } catch (error) {
    aiStatus.textContent = String(error?.message || error);
    return;
  }

  const payload = { messages: anonymized.messages, notes: anonymized.notes };
  if (containsKnownRealName(payload, anonymized.aliases)) {
    aiStatus.textContent = "プライバシーガード: 実名が送信データに残っているため送信を停止しました。";
    return;
  }

  generateButton.disabled = true;
  generateButton.textContent = "生成中…";
  aiStatus.textContent = "匿名化した会話をGeminiへ送信しています…";
  try {
    const response = await fetch("/api/chat-assist/replies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.detail || `HTTP ${response.status}`);
    renderReplies(data.replies);
    aiStatus.textContent = "3つの返信案を生成しました。送信はせず、コピーだけ行えます。";
  } catch (error) {
    aiStatus.textContent = `生成エラー: ${String(error?.message || error)}`;
  } finally {
    generateButton.textContent = "返信案を生成";
    updateGenerateAvailability();
  }
}

parseButton.addEventListener("click", parseCurrentInput);
clearButton.addEventListener("click", () => {
  input.value = "";
  currentResult = null;
  summary.textContent = "まだ解析していません";
  conversation.innerHTML = '<p class="muted">左の入力欄にチャットログを貼り付けてください。</p>';
  unparsedBox.hidden = true;
  unparsedBox.innerHTML = "";
  selfSpeakerSelect.innerHTML = '<option value="">自分を選択</option>';
  selfSpeakerSelect.disabled = true;
  memoSpeakerSelect.innerHTML = '<option value="">相手がいません</option>';
  memoSpeakerSelect.disabled = true;
  memoInput.value = "";
  memoInput.disabled = true;
  saveMemoButton.disabled = true;
  clearReplies();
  updateGenerateAvailability();
  aiStatus.textContent = "返信案はまだ生成していません";
  input.focus();
});

selfSpeakerSelect.addEventListener("change", () => {
  safeStorageSet(SELF_STORAGE_KEY, selfSpeakerSelect.value);
  refreshMemoSpeakers();
  updateGenerateAvailability();
  clearReplies();
});
memoSpeakerSelect.addEventListener("change", loadCurrentMemo);
saveMemoButton.addEventListener("click", saveCurrentMemo);
generateButton.addEventListener("click", generateReplies);
replyCards.forEach(card => {
  card.querySelector("[data-copy-reply]").addEventListener("click", event => {
    copyText(event.currentTarget.dataset.reply || "", event.currentTarget);
  });
});

updateGenerateAvailability();
