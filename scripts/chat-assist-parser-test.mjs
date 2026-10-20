import assert from "node:assert/strict";
import { parseChatLine, parseChatLog } from "../public/chat-assist-core.mjs";

{
  const result = parseChatLog(`[22:14] Alice Example: 今日ルレ行かない？\n[22:14] Me: 何時から？\n[22:15] Alice Example: 21時くらい！`);
  assert.equal(result.messages.length, 3);
  assert.equal(result.unparsed.length, 0);
  assert.deepEqual(result.messages[0], {
    timestamp: "22:14",
    channel: null,
    speaker: "Alice Example",
    text: "今日ルレ行かない？"
  });
}

{
  const result = parseChatLog(`\n\n[19:03] [Tell] Alice Example: こんばんは\n`);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].channel, "Tell");
  assert.equal(result.stats.unparsed_lines, 0);
  assert.equal(result.stats.ignored_blank_lines, 3);
}

{
  const result = parseChatLog(`これは解析できない行\nBob Example: 了解！`);
  assert.equal(result.messages.length, 1);
  assert.equal(result.unparsed.length, 1);
  assert.equal(result.unparsed[0].line_number, 1);
  assert.equal(result.messages[0].speaker, "Bob Example");
}

{
  const parsed = parseChatLine("[8:05] Alice Example：全角コロンもOK");
  assert.equal(parsed.kind, "message");
  assert.equal(parsed.message.timestamp, "8:05");
  assert.equal(parsed.message.text, "全角コロンもOK");
}

console.log("chat-assist parser tests: PASS");
