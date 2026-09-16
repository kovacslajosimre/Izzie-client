// Pure SSE-style event decoder for the /chat stream.
// No React, no network dependency: takes raw byte chunks, returns parsed events.

export type SSEEvent =
  | { type: "token"; text: string }
  | { type: "sentence"; index: number; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

export class SSEParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SSEParseError";
  }
}

interface RawSSEEvent {
  type: string;
  text?: string;
  message?: string;
  index?: number;
}

const EVENT_SEPARATOR = /\r?\n\r?\n/;

export class SSEDecoder {
  private decoder = new TextDecoder("utf-8");
  private buffer = "";

  // Accepts one chunk of the response body, returns any complete events
  // found so far. Incomplete trailing data stays buffered for the next call.
  push(chunk: Uint8Array): SSEEvent[] {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    return this.drainEvents();
  }

  private drainEvents(): SSEEvent[] {
    const events: SSEEvent[] = [];
    let match: RegExpMatchArray | null;
    while ((match = this.buffer.match(EVENT_SEPARATOR))) {
      const separatorIndex = match.index ?? 0;
      const rawBlock = this.buffer.slice(0, separatorIndex);
      this.buffer = this.buffer.slice(separatorIndex + match[0].length);
      const event = parseEventBlock(rawBlock);
      if (event) {
        events.push(event);
      }
    }
    return events;
  }
}

function parseEventBlock(rawBlock: string): SSEEvent | null {
  const dataLines = rawBlock
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).replace(/^ /, ""));

  if (dataLines.length === 0) {
    return null;
  }

  const raw = parseRawEvent(dataLines.join("\n"));
  return toEvent(raw);
}

function parseRawEvent(json: string): RawSSEEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SSEParseError(`Nem ertelmezheto JSON az SSE esemenyben: ${json}`);
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { type?: unknown }).type !== "string"
  ) {
    throw new SSEParseError(`Hianyzo vagy ervenytelen "type" mezo: ${json}`);
  }
  return parsed as RawSSEEvent;
}

function toEvent(raw: RawSSEEvent): SSEEvent | null {
  switch (raw.type) {
    case "token":
      return { type: "token", text: raw.text ?? "" };
    case "sentence":
      return { type: "sentence", index: raw.index ?? 0, text: raw.text ?? "" };
    case "done":
      return { type: "done" };
    case "error":
      return { type: "error", message: raw.message ?? "" };
    default:
      // Unknown event types are ignored: the server may grow new ones later.
      return null;
  }
}
