import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import "./App.css";
import { ChatRequestError, fetchHistory, sendChatMessage } from "./chatClient";
import { formatSessionStart, toHistoryItems, type HistoryItem } from "./history";
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

type HistoryState =
  | { status: "loading" }
  | { status: "loaded"; items: HistoryItem[] }
  | { status: "error"; message: string };

function getMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!import.meta.env.VITE_IZZIE_URL) missing.push("VITE_IZZIE_URL");
  if (!import.meta.env.VITE_IZZIE_TOKEN) missing.push("VITE_IZZIE_TOKEN");
  return missing;
}

function describeRequestError(err: unknown): string {
  if (err instanceof ChatRequestError) {
    // The user-facing text is set where the error is raised.
    return err.message;
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
  const [history, setHistory] = useState<HistoryState>({ status: "loading" });
  const abortControllerRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, history]);

  // StrictMode runs this twice in development: the first run's cleanup
  // aborts its request and its result is dropped. setHistory replaces
  // rather than appends, so the history can never be added twice.
  useEffect(() => {
    if (missingEnvVars.length > 0) {
      return;
    }
    const controller = new AbortController();
    fetchHistory({ signal: controller.signal })
      .then((msgs) => {
        if (controller.signal.aborted) return;
        setHistory({ status: "loaded", items: toHistoryItems(msgs) });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setHistory({ status: "error", message: describeRequestError(err) });
      });
    return () => controller.abort();
    // Empty deps on purpose: load once on startup.
  }, []);

  function updateMessage(id: string, updater: (msg: ChatMessage) => ChatMessage) {
    setMessages((prev) => prev.map((m) => (m.id === id ? updater(m) : m)));
  }

  async function handleSend() {
    const text = input.trim();
    // While the history loads, sending is blocked: a new message would
    // end up above the history and mix up the order.
    if (!text || isGenerating || history.status === "loading") {
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
        {history.status === "loading" && (
          <div className="history-note">Előzmény betöltése…</div>
        )}
        {history.status === "error" && (
          <div className="history-note history-error">
            Az előzményt nem sikerült betölteni. {history.message}
          </div>
        )}
        {history.status === "loaded" &&
          history.items.map((item) =>
            item.kind === "separator" ? (
              <div key={item.id} className="history-separator">
                {formatSessionStart(item.startedAt)}
              </div>
            ) : (
              <div key={item.id} className={`message message-${item.role}`}>
                <div className="message-text">{item.text}</div>
                {item.partial && <div className="message-status">Félbemaradt</div>}
              </div>
            ),
          )}
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
          <button type="submit" disabled={!input.trim() || history.status === "loading"}>
            Küldés
          </button>
        )}
      </form>
    </main>
  );
}

export default App;
