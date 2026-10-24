// Pure transformation of the server's GET /history response into UI items.
// Independent of React and the network layer.

// The server's message shape (backend app/main.py, HistoryMessage).
export interface HistoryMessage {
  id: number;
  session_id: number;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "partial";
  created_at: string;
}

export type HistoryItem =
  | { kind: "separator"; id: string; startedAt: string }
  | {
      kind: "message";
      id: string;
      role: "user" | "izzie";
      text: string;
      partial: boolean;
    };

export class HistoryParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoryParseError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseMessage(value: unknown, index: number): HistoryMessage {
  if (!isRecord(value)) {
    throw new HistoryParseError(`messages[${index}] is not an object`);
  }
  const { id, session_id, role, content, status, created_at } = value;
  if (
    typeof id !== "number" ||
    typeof session_id !== "number" ||
    (role !== "user" && role !== "assistant") ||
    typeof content !== "string" ||
    (status !== "complete" && status !== "partial") ||
    typeof created_at !== "string"
  ) {
    throw new HistoryParseError(`messages[${index}] has an invalid shape`);
  }
  return { id, session_id, role, content, status, created_at };
}

export function parseHistoryResponse(json: unknown): HistoryMessage[] {
  if (!isRecord(json) || !Array.isArray(json.messages)) {
    throw new HistoryParseError("missing messages array");
  }
  return json.messages.map(parseMessage);
}

// A separator goes before the first message of every session (so also at
// the start of the list). It carries the raw timestamp; formatting happens
// at render time, so the structure does not depend on the time zone.
export function toHistoryItems(messages: HistoryMessage[]): HistoryItem[] {
  const items: HistoryItem[] = [];
  let prevSessionId: number | null = null;
  for (const msg of messages) {
    if (msg.session_id !== prevSessionId) {
      items.push({ kind: "separator", id: `sep-${msg.id}`, startedAt: msg.created_at });
      prevSessionId = msg.session_id;
    }
    items.push({
      kind: "message",
      id: `srv-${msg.id}`,
      role: msg.role === "assistant" ? "izzie" : "user",
      text: msg.content,
      partial: msg.status === "partial",
    });
  }
  return items;
}

// Python's isoformat() writes microseconds (6 digits); ECMAScript only
// guarantees 3, and the Tauri webview on Linux (WebKitGTK) is not V8, so
// the fraction is cut to milliseconds before parsing.
function parseIsoDate(iso: string): Date {
  return new Date(iso.replace(/(\.\d{3})\d+/, "$1"));
}

// timeZone is omitted in the app (local time); tests pass it explicitly.
export function formatSessionStart(iso: string, timeZone?: string): string {
  const date = parseIsoDate(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}
