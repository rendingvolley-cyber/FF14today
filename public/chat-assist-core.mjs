const TIMESTAMP_PATTERN = "\\d{1,2}:\\d{2}(?::\\d{2})?";

function normalizeLine(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").trim();
}

export function parseChatLine(rawLine, lineNumber = null) {
  const raw = String(rawLine ?? "");
  const line = normalizeLine(raw);
  if (!line) return { kind: "blank", line_number: lineNumber, raw };

  const withTimestamp = new RegExp(
    `^\\[(?<timestamp>${TIMESTAMP_PATTERN})\\]\\s*(?:\\[(?<channel>[^\\]]+)\\]\\s*)?(?<speaker>[^:：]+?)\\s*[:：]\\s*(?<text>.+)$`
  );
  const withoutTimestamp = /^(?:\[(?<channel>[^\]]+)\]\s*)?(?<speaker>[^:：]+?)\s*[:：]\s*(?<text>.+)$/;
  const match = line.match(withTimestamp) || line.match(withoutTimestamp);

  if (!match?.groups) {
    return { kind: "unparsed", line_number: lineNumber, raw };
  }

  const speaker = normalizeLine(match.groups.speaker);
  const text = normalizeLine(match.groups.text);
  if (!speaker || !text) {
    return { kind: "unparsed", line_number: lineNumber, raw };
  }

  return {
    kind: "message",
    message: {
      timestamp: match.groups.timestamp || null,
      channel: normalizeLine(match.groups.channel) || null,
      speaker,
      text
    }
  };
}

export function parseChatLog(rawLog) {
  const lines = String(rawLog ?? "").replace(/\r\n?/g, "\n").split("\n");
  const messages = [];
  const unparsed = [];
  let ignoredBlank = 0;

  lines.forEach((line, index) => {
    const parsed = parseChatLine(line, index + 1);
    if (parsed.kind === "blank") {
      ignoredBlank += 1;
    } else if (parsed.kind === "message") {
      messages.push(parsed.message);
    } else {
      unparsed.push({ line_number: index + 1, raw: line });
    }
  });

  return {
    messages,
    unparsed,
    stats: {
      total_lines: lines.length,
      parsed_messages: messages.length,
      unparsed_lines: unparsed.length,
      ignored_blank_lines: ignoredBlank
    }
  };
}

export function uniqueSpeakers(messages) {
  const seen = new Set();
  const speakers = [];
  for (const message of messages || []) {
    const speaker = normalizeLine(message?.speaker);
    if (speaker && !seen.has(speaker)) {
      seen.add(speaker);
      speakers.push(speaker);
    }
  }
  return speakers;
}

function replaceKnownParticipantNames(value, aliases) {
  let text = String(value ?? "");
  const entries = Object.entries(aliases)
    .filter(([name]) => name)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [realName, alias] of entries) {
    text = text.split(realName).join(alias);
  }
  return text;
}

export function anonymizeConversation(messages, selfSpeaker = null, notesBySpeaker = {}) {
  const speakers = uniqueSpeakers(messages);
  const normalizedSelf = selfSpeaker == null ? null : normalizeLine(selfSpeaker);
  if (normalizedSelf && !speakers.includes(normalizedSelf)) {
    throw new Error("選択した自分の名前が現在のログにありません。");
  }

  const aliases = {};
  let playerIndex = 1;
  for (const speaker of speakers) {
    if (normalizedSelf && speaker === normalizedSelf) {
      aliases[speaker] = "ME";
    } else {
      aliases[speaker] = `PLAYER_${String(playerIndex).padStart(3, "0")}`;
      playerIndex += 1;
    }
  }

  const anonymizedMessages = (messages || []).map(message => ({
    timestamp: message?.timestamp || null,
    channel: message?.channel || null,
    speaker: aliases[message?.speaker],
    text: replaceKnownParticipantNames(message?.text, aliases).trim()
  }));

  const anonymizedNotes = {};
  for (const [speaker, rawNote] of Object.entries(notesBySpeaker || {})) {
    const alias = aliases[speaker];
    if (!alias || alias === "ME") continue;
    const note = replaceKnownParticipantNames(rawNote, aliases).trim();
    if (note) anonymizedNotes[alias] = note;
  }

  return {
    messages: anonymizedMessages,
    notes: anonymizedNotes,
    aliases
  };
}

export function containsKnownRealName(value, aliases) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return Object.keys(aliases || {}).some(name => name && serialized.includes(name));
}
