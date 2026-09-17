// Network layer for the /chat endpoint. Not unit tested (per spec, only
// the sse.ts parser has automated tests); covered by the manual smoke test.

import { SSEDecoder, SSEParseError, type SSEEvent } from "./sse";

export type ChatEnding = "done" | "error" | "aborted" | "cut" | "timeout";

// Biztonsagi korlat arra az esetre, ha a szerver maga akad el, es ezert a
// sajat error esemenyet sem kuldi el. Szandekosan hosszabb a szerver
// oldali korlatoknal (30s): normal esetben a szerver error eventje er ide
// elobb, es az a pontosabb uzenet.
export const IDLE_TIMEOUT_MS = 45000;

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

  // Idle-korlat: barmilyen beerkezo adat (fejlec, majd minden darab)
  // nullazza. A kulso (felhasznaloi) es a belso (idokorlat) megszakitas
  // egy kozos jelre fut ossze, hogy mindket eset megallitsa a fetchet es
  // az olvasast; a ket ok utolag a timeoutController.signal.aborted-bol
  // kulonbozteto meg.
  const timeoutController = new AbortController();
  const combinedSignal = AbortSignal.any([opts.signal, timeoutController.signal]);
  const armTimeout = () => setTimeout(() => timeoutController.abort(), IDLE_TIMEOUT_MS);
  let timeoutId: ReturnType<typeof setTimeout> = armTimeout();
  const resetIdleTimer = () => {
    clearTimeout(timeoutId);
    timeoutId = armTimeout();
  };

  try {
    let response: Response;
    try {
      response = await fetch(`${url}/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
        signal: combinedSignal,
      });
    } catch (err) {
      if (timeoutController.signal.aborted) {
        return { ending: "timeout" };
      }
      if (isAbortError(err)) {
        return { ending: "aborted" };
      }
      throw new ChatRequestError(
        "network",
        "A szerver nem érhető el. Ellenőrizd a Tailscale/VPN kapcsolatot.",
      );
    }

    // A fejlecek megerkezese is eletjel: a szerver mar valaszolt, csak a
    // torzs meg nem jott. Ha ezt nem nullaznank, egy lassan megnyilo
    // folyamnal a kliens hamarabb feladhatna, mint ahogy a szerver sajat
    // (pontosabb) hibauzenete megerkezne.
    resetIdleTimer();

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
          // The server closed the connection without a "done" event. If
          // it sent an "error" event first, that is the real ending;
          // otherwise it's cut.
          return { ending: sawError ? "error" : "cut" };
        }
        resetIdleTimer();
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
      if (timeoutController.signal.aborted) {
        return { ending: "timeout" };
      }
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
  } finally {
    clearTimeout(timeoutId);
  }
}
