import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import "./App.css";
import { ChatRequestError, sendChatMessage } from "./chatClient";
import { SSEParseError, type SSEEvent } from "./sse";

type MessageStatus =
  | "streaming"
  | "done"
  | "error"
  | "aborted"
  | "interrupted"
  | "timeout";

interface ChatMessage {
  id: string;
  role: "user" | "izzie";
  text: string;
  status: MessageStatus;
  errorMessage?: string;
}

function getMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!import.meta.env.VITE_IZZIE_URL) missing.push("VITE_IZZIE_URL");
  if (!import.meta.env.VITE_IZZIE_TOKEN) missing.push("VITE_IZZIE_TOKEN");
  return missing;
}

function describeRequestError(err: unknown): string {
  if (err instanceof ChatRequestError) {
    switch (err.kind) {
      case "unauthorized":
        return "Érvénytelen token.";
      case "http":
        return `A szerver hibával válaszolt (${err.status ?? "?"}).`;
      case "network":
        return "A szerver nem érhető el. Ellenőrizd a Tailscale/VPN kapcsolatot.";
      case "invalid-response":
        return "A szerver nem küldött választörzset.";
    }
  }
  if (err instanceof SSEParseError) {
    return "Hiba történt a válasz feldolgozása közben.";
  }
  return "Ismeretlen hiba történt.";
}

function App() {
  const missingEnvVars = getMissingEnvVars();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  function updateMessage(id: string, updater: (msg: ChatMessage) => ChatMessage) {
    setMessages((prev) => prev.map((m) => (m.id === id ? updater(m) : m)));
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isGenerating) {
      return;
    }

    const userId = crypto.randomUUID();
    const izzieId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", text, status: "done" },
      { id: izzieId, role: "izzie", text: "", status: "streaming" },
    ]);
    setInput("");
    setIsGenerating(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    function handleEvent(event: SSEEvent) {
      switch (event.type) {
        case "token":
          updateMessage(izzieId, (m) => ({ ...m, text: m.text + event.text }));
          break;
        case "error":
          updateMessage(izzieId, (m) => ({ ...m, errorMessage: event.message }));
          break;
        case "sentence":
        case "done":
          // "sentence": nothing to do yet (reserved for future speech synthesis).
          // "done": handled via the ending returned by sendChatMessage.
          break;
      }
    }

    try {
      const result = await sendChatMessage(text, {
        signal: controller.signal,
        onEvent: handleEvent,
      });
      const status: MessageStatus =
        result.ending === "done"
          ? "done"
          : result.ending === "error"
            ? "error"
            : result.ending === "aborted"
              ? "aborted"
              : result.ending === "timeout"
                ? "timeout"
                : "interrupted";
      updateMessage(izzieId, (m) => ({ ...m, status }));
    } catch (err) {
      updateMessage(izzieId, (m) => ({
        ...m,
        status: "error",
        errorMessage: describeRequestError(err),
      }));
    } finally {
      abortControllerRef.current = null;
      setIsGenerating(false);
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (missingEnvVars.length > 0) {
    return (
      <main className="app app-error">
        <p>
          Hiányzó beállítás: állítsd be a következő változókat a{" "}
          <code>.env.local</code> fájlban: {missingEnvVars.join(", ")}.
        </p>
      </main>
    );
  }

  return (
    <main className="app">
      <div className="message-list" ref={listRef}>
        {messages.map((m) => {
          const isThinking =
            m.role === "izzie" && m.status === "streaming" && m.text === "" && !m.errorMessage;
          return (
            <div key={m.id} className={`message message-${m.role}`}>
              <div className="message-text">
                {isThinking ? (
                  <span className="thinking">
                    Izzie gondolkodik
                    <span className="thinking-dots">
                      <span>.</span>
                      <span>.</span>
                      <span>.</span>
                    </span>
                  </span>
                ) : (
                  m.text
                )}
              </div>
              {m.errorMessage && <div className="message-error">{m.errorMessage}</div>}
              {m.status === "interrupted" && <div className="message-status">Megszakadt</div>}
              {m.status === "aborted" && <div className="message-status">Leállítva</div>}
              {m.status === "timeout" && (
                <div className="message-status">Izzie nem válaszolt időben.</div>
              )}
            </div>
          );
        })}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Írj üzenetet Izzie-nek..."
          disabled={isGenerating}
        />
        {isGenerating ? (
          <button type="button" onClick={handleStop}>
            Leállítás
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()}>
            Küldés
          </button>
        )}
      </form>
    </main>
  );
}

export default App;
