// Network layer for the /chat endpoint. Not unit tested (per spec, only
// the sse.ts parser has automated tests); covered by the manual smoke test.

import { SSEDecoder, SSEParseError, type SSEEvent } from "./sse";

export type ChatEnding = "done" | "error" | "aborted" | "cut";

export interface SendChatMessageResult {
  ending: ChatEnding;
}

export class ChatRequestError extends Error {
  kind: "unauthorized" | "http" | "network" | "invalid-response";
  status?: number;

  constructor(
    kind: "unauthorized" | "http" | "network" | "invalid-response",
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = "ChatRequestError";
    this.kind = kind;
    this.status = status;
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

export async function sendChatMessage(
  message: string,
  opts: { signal: AbortSignal; onEvent: (event: SSEEvent) => void },
): Promise<SendChatMessageResult> {
  const url = import.meta.env.VITE_IZZIE_URL;
  const token = import.meta.env.VITE_IZZIE_TOKEN;

  let response: Response;
  try {
    response = await fetch(`${url}/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
      signal: opts.signal,
    });
  } catch (err) {
    if (isAbortError(err)) {
      return { ending: "aborted" };
    }
    throw new ChatRequestError(
      "network",
      "A szerver nem érhető el. Ellenőrizd a Tailscale/VPN kapcsolatot.",
    );
  }

  if (response.status === 401) {
    throw new ChatRequestError("unauthorized", "Érvénytelen token.");
  }
  if (!response.ok) {
    throw new ChatRequestError(
      "http",
      `A szerver hibával válaszolt (${response.status}).`,
      response.status,
    );
  }
  if (!response.body) {
    throw new ChatRequestError(
      "invalid-response",
      "A szerver nem küldött választörzset.",
    );
  }

  const reader = response.body.getReader();
  const decoder = new SSEDecoder();
  let sawError = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      for (const event of decoder.push(value)) {
        opts.onEvent(event);
        if (event.type === "done") {
          return { ending: "done" };
        }
        if (event.type === "error") {
          sawError = true;
        }
      }
    }
  } catch (err) {
    if (isAbortError(err)) {
      return { ending: "aborted" };
    }
    if (err instanceof SSEParseError) {
      throw err;
    }
    // Connection dropped mid-stream: whatever text arrived stays, marked
    // as cut off rather than shown as an error message.
    return { ending: "cut" };
  }

  // The server closed the connection without a "done" event. If it sent
  // an "error" event first, that is the real ending; otherwise it's cut.
  return { ending: sawError ? "error" : "cut" };
}
