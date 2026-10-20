import assert from "node:assert/strict";
import {
  anonymizeConversation,
  containsKnownRealName,
  parseChatLog
} from "../public/chat-assist-core.mjs";
import {
  buildChatAssistPrompt,
  normalizeChatAssistPayload
} from "../src/chat-assist.js";

const parsed = parseChatLog([
  "[22:14] [Party] Alice Example: Kanade Tachibana、今日ルレ行かない？",
  "[22:14] Kanade Tachibana：何時から？",
  "[22:15] Alice Example: 21時くらい！"
].join("\n"));
assert.equal(parsed.messages.length, 3);
assert.equal(parsed.messages[0].channel, "Party");

const anonymized = anonymizeConversation(parsed.messages, "Kanade Tachibana", {
  "Alice Example": "Alice Exampleとは零式仲間。Kanade Tachibanaにはかなりラフ。"
});
assert.equal(anonymized.messages[0].speaker, "PLAYER_001");
assert.equal(anonymized.messages[1].speaker, "ME");
assert.match(anonymized.messages[0].text, /ME/);
assert.doesNotMatch(anonymized.messages[0].text, /Kanade Tachibana/);
assert.doesNotMatch(anonymized.notes.PLAYER_001, /Alice Example|Kanade Tachibana/);
assert.equal(containsKnownRealName({ messages: anonymized.messages, notes: anonymized.notes }, anonymized.aliases), false);

const incomingOnly = anonymizeConversation([
  { timestamp: null, channel: "Tell", speaker: "Alice Example", text: "今ひま？" }
], null, {});
assert.equal(incomingOnly.messages[0].speaker, "PLAYER_001");

const normalized = normalizeChatAssistPayload({
  messages: anonymized.messages,
  notes: anonymized.notes
});
assert.equal(normalized.messages.length, 3);
assert.equal(normalized.notes.PLAYER_001.includes("零式仲間"), true);

assert.throws(() => normalizeChatAssistPayload({
  messages: [{ speaker: "Alice Example", text: "raw name" }]
}), /匿名alias/);

const oversized = normalizeChatAssistPayload({
  messages: Array.from({ length: 41 }, (_, index) => ({
    speaker: `PLAYER_${String((index % 2) + 1).padStart(3, "0")}`,
    text: `x${index}`
  }))
});
assert.equal(oversized.messages.length, 40);
assert.equal(oversized.messages[0].text, "x1");
assert.equal(oversized.messages.at(-1).text, "x40");

const staleNote = normalizeChatAssistPayload({
  messages: [{ speaker: "PLAYER_001", text: "hi" }],
  notes: { PLAYER_999: "not in recent conversation" }
});
assert.deepEqual(staleNote.notes, {});

assert.throws(() => normalizeChatAssistPayload({
  messages: [{ speaker: "PLAYER_001", text: "hi" }],
  notes: { "Alice Example": "raw real name key" }
}), /匿名PLAYER alias/);

assert.throws(() => normalizeChatAssistPayload({
  messages: [
    { speaker: "Alice Example", text: "too old but still raw" },
    ...Array.from({ length: 40 }, (_, index) => ({
      speaker: "PLAYER_001",
      text: `recent${index}`
    }))
  ]
}), /匿名alias/);

const prompt = buildChatAssistPrompt(normalized);
assert.match(prompt, /未信頼データ/);
assert.match(prompt, /natural/);
assert.doesNotMatch(prompt, /Alice Example|Kanade Tachibana/);

console.log("chat-assist complete tests: OK");
