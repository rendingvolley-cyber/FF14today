import assert from "node:assert/strict";
import {
  isLikelyFfxivBinlog,
  localLogEntryKey,
  parseFfxivBinlog,
  toChatAssistMessage
} from "../public/ffxiv-binlog.mjs";

const encoder = new TextEncoder();

function u32le(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function makeToken(type, payload = [1]) {
  return [0x02, type, payload.length + 1, ...payload, 0x03];
}

function makeEntry({ timestamp, filter = 1, channel = 10, sender, text, tagged = false }) {
  const senderBytes = [...encoder.encode(sender)];
  const textBytes = [...encoder.encode(text)];
  const body = tagged
    ? [0x1f, ...makeToken(0x12), ...senderBytes, 0x1f, ...textBytes, ...makeToken(0x48)]
    : [0x1f, ...senderBytes, 0x1f, ...textBytes];
  return new Uint8Array([
    ...u32le(timestamp),
    filter,
    channel,
    0,
    0,
    ...body
  ]);
}

function makeBinlog(entries) {
  const count = entries.length;
  const header = new Uint8Array(8 + count * 4);
  const view = new DataView(header.buffer);
  view.setUint32(0, 100, true);
  view.setUint32(4, 100 + count, true);
  let total = 0;
  entries.forEach((entry, index) => {
    total += entry.byteLength;
    view.setUint32(8 + index * 4, total, true);
  });
  const out = new Uint8Array(header.byteLength + total);
  out.set(header, 0);
  let offset = header.byteLength;
  entries.forEach(entry => {
    out.set(entry, offset);
    offset += entry.byteLength;
  });
  return out.buffer;
}

const buffer = makeBinlog([
  makeEntry({ timestamp: 1792491000, sender: "Alice Example", text: "今日ルレ行かない？", tagged: true }),
  makeEntry({ timestamp: 1792491060, sender: "Kanade Tachibana", text: "21時ならいける！", channel: 12 })
]);

assert.equal(isLikelyFfxivBinlog(buffer), true);
const parsed = parseFfxivBinlog(buffer);
assert.equal(parsed.length, 2);
assert.equal(parsed[0].sender, "Alice Example");
assert.equal(parsed[0].text, "今日ルレ行かない？");
assert.equal(parsed[1].sender, "Kanade Tachibana");
assert.equal(parsed[1].channel, 12);
assert.ok(parsed[0].timestamp instanceof Date);

const message = toChatAssistMessage(parsed[0]);
assert.equal(message.speaker, "Alice Example");
assert.equal(message.text, "今日ルレ行かない？");
assert.match(message.channel, /^FF14 0x/);

const key1 = localLogEntryKey("00000001.log", parsed[0]);
const key2 = localLogEntryKey("00000001.log", parsed[0]);
const key3 = localLogEntryKey("00000001.log", parsed[1]);
assert.equal(key1, key2);
assert.notEqual(key1, key3);

const broken = new Uint8Array(buffer.slice(0));
new DataView(broken.buffer).setUint32(8, 0xffffffff, true);
assert.throws(() => parseFfxivBinlog(broken.buffer), /offset table/);

assert.equal(isLikelyFfxivBinlog(new Uint8Array([1, 2, 3]).buffer), false);
console.log("chat-assist-binlog-test: PASS");
