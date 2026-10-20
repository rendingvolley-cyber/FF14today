const UTF8 = new TextDecoder("utf-8", { fatal: false });

function asBuffer(input) {
  if (input instanceof ArrayBuffer) return input;
  if (ArrayBuffer.isView(input)) {
    return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
  }
  throw new TypeError("ArrayBuffer または TypedArray が必要です。");
}

export function isLikelyFfxivBinlog(input) {
  const buffer = asBuffer(input);
  if (buffer.byteLength < 8) return false;
  const view = new DataView(buffer);
  const bodyMarker = view.getUint32(0, true);
  const fileMarker = view.getUint32(4, true);
  const entryCount = fileMarker - bodyMarker;
  if (fileMarker <= bodyMarker || entryCount <= 0 || entryCount > 1000) return false;
  return 8 + entryCount * 4 <= buffer.byteLength;
}

function decodeTaggedText(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const chunks = [];
  let textStart = 0;
  let index = 0;

  const flush = end => {
    if (end <= textStart) return;
    const text = UTF8.decode(bytes.slice(textStart, end)).replaceAll("\u0000", "");
    if (text) chunks.push(text);
  };

  while (index < bytes.length) {
    if (bytes[index] !== 0x02 || index + 2 >= bytes.length) {
      index += 1;
      continue;
    }

    flush(index);
    const payloadLength = bytes[index + 2];
    const tokenEnd = index + 3 + payloadLength;
    if (payloadLength < 1 || tokenEnd > bytes.length) {
      // 壊れたタグは残りを通常テキストとして扱う。
      textStart = index;
      index += 1;
      continue;
    }

    index = tokenEnd;
    textStart = index;
  }

  flush(bytes.length);
  return chunks.join("").replace(/[\u0000-\u001e]/g, "").trim();
}

function findMessageSeparator(bytes, start) {
  let index = start;
  while (index < bytes.length) {
    if (bytes[index] === 0x02 && index + 2 < bytes.length) {
      const payloadLength = bytes[index + 2];
      const tokenEnd = index + 3 + payloadLength;
      if (payloadLength >= 1 && tokenEnd <= bytes.length) {
        index = tokenEnd;
        continue;
      }
    }
    if (bytes[index] === 0x1f) return index;
    index += 1;
  }
  return -1;
}

export function parseFfxivBinlogEntry(input, index = 0) {
  const buffer = asBuffer(input);
  if (buffer.byteLength < 10) return null;
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (bytes[8] !== 0x1f) return null;

  const separator = findMessageSeparator(bytes, 9);
  if (separator < 9) return null;

  const timestampSeconds = view.getUint32(0, true);
  const sender = decodeTaggedText(bytes.slice(9, separator));
  const text = decodeTaggedText(bytes.slice(separator + 1));
  if (!text) return null;

  return {
    index,
    timestamp_seconds: timestampSeconds,
    timestamp: new Date(timestampSeconds * 1000),
    filter: view.getUint8(4) & 0x7f,
    channel: view.getUint8(5),
    sender,
    text
  };
}

export function parseFfxivBinlog(input) {
  const buffer = asBuffer(input);
  if (!isLikelyFfxivBinlog(buffer)) {
    throw new Error("FFXIVチャットログとして認識できないbinlogです。");
  }

  const view = new DataView(buffer);
  const bodyMarker = view.getUint32(0, true);
  const fileMarker = view.getUint32(4, true);
  const entryCount = fileMarker - bodyMarker;
  const tableStart = 8;
  const bodyStart = tableStart + entryCount * 4;
  const offsets = [];

  let previous = 0;
  for (let i = 0; i < entryCount; i += 1) {
    const end = view.getUint32(tableStart + i * 4, true);
    if (end <= previous || bodyStart + end > buffer.byteLength) {
      throw new Error("FFXIVチャットログのoffset tableが不正です。");
    }
    offsets.push(end);
    previous = end;
  }

  const entries = [];
  let begin = 0;
  offsets.forEach((end, index) => {
    const entryBuffer = buffer.slice(bodyStart + begin, bodyStart + end);
    const parsed = parseFfxivBinlogEntry(entryBuffer, index);
    if (parsed) entries.push(parsed);
    begin = end;
  });
  return entries;
}

export function channelLabel(channel) {
  return `FF14 0x${Number(channel || 0).toString(16).padStart(2, "0").toUpperCase()}`;
}

export function toChatAssistMessage(entry) {
  if (!entry?.sender || !entry?.text) return null;
  const date = entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp_seconds * 1000);
  const timestamp = Number.isNaN(date.getTime())
    ? null
    : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return {
    timestamp,
    channel: channelLabel(entry.channel),
    speaker: entry.sender.trim(),
    text: entry.text.trim()
  };
}

export function localLogEntryKey(fileKey, entry) {
  return [
    fileKey,
    entry?.index ?? "",
    entry?.timestamp_seconds ?? "",
    entry?.channel ?? "",
    entry?.sender ?? "",
    entry?.text ?? ""
  ].join("\u001f");
}
