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
