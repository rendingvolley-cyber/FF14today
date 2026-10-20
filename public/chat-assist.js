import { parseChatLog } from "/chat-assist-core.mjs";

const input = document.querySelector("#chatLogInput");
const parseButton = document.querySelector("#parseChatButton");
const clearButton = document.querySelector("#clearChatButton");
const summary = document.querySelector("#parseSummary");
const conversation = document.querySelector("#conversationResult");
const unparsedBox = document.querySelector("#unparsedResult");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
    return;
  }

  unparsedBox.hidden = false;
  unparsedBox.innerHTML = `
    <h3>解析できなかった行</h3>
    <p class="muted">この行は無視されました。元ログは変更していません。</p>
    <ul>${result.unparsed.map(item => `<li><strong>${item.line_number}行目</strong> ${escapeHtml(item.raw)}</li>`).join("")}</ul>
  `;
}

function parseCurrentInput() {
  renderResult(parseChatLog(input.value));
}

parseButton.addEventListener("click", parseCurrentInput);
clearButton.addEventListener("click", () => {
  input.value = "";
  summary.textContent = "まだ解析していません";
  conversation.innerHTML = '<p class="muted">左の入力欄にチャットログを貼り付けてください。</p>';
  unparsedBox.hidden = true;
  unparsedBox.innerHTML = "";
  input.focus();
});
