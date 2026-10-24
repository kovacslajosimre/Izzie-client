import { describe, expect, it } from "vitest";
import {
  formatSessionStart,
  HistoryParseError,
  parseHistoryResponse,
  toHistoryItems,
  type HistoryMessage,
} from "./history";

function msg(overrides: Partial<HistoryMessage> & { id: number }): HistoryMessage {
  return {
    session_id: 1,
    role: "user",
    content: `message ${overrides.id}`,
    status: "complete",
    created_at: "2026-10-24T17:30:12+00:00",
    ...overrides,
  };
}

describe("toHistoryItems", () => {
  it("returns an empty list for empty input", () => {
    expect(toHistoryItems([])).toEqual([]);
  });

  it("puts one separator before the messages of a single session", () => {
    const items = toHistoryItems([msg({ id: 1 }), msg({ id: 2, role: "assistant" })]);
    expect(items.map((i) => i.kind)).toEqual(["separator", "message", "message"]);
  });

  it("puts a separator at each session change", () => {
    const items = toHistoryItems([
      msg({ id: 1, session_id: 10 }),
      msg({ id: 2, session_id: 10 }),
      msg({ id: 3, session_id: 11 }),
    ]);
    expect(items.map((i) => i.id)).toEqual(["sep-1", "srv-1", "srv-2", "sep-3", "srv-3"]);
  });

  it("maps roles to the UI roles", () => {
    const items = toHistoryItems([msg({ id: 1, role: "user" }), msg({ id: 2, role: "assistant" })]);
    const roles = items.flatMap((i) => (i.kind === "message" ? [i.role] : []));
    expect(roles).toEqual(["user", "izzie"]);
  });

  it("marks partial messages", () => {
    const items = toHistoryItems([
      msg({ id: 1, status: "complete" }),
      msg({ id: 2, role: "assistant", status: "partial" }),
    ]);
    const partial = items.flatMap((i) => (i.kind === "message" ? [i.partial] : []));
    expect(partial).toEqual([false, true]);
  });

  it("keeps the input order without re-sorting", () => {
    const items = toHistoryItems([msg({ id: 30 }), msg({ id: 5 }), msg({ id: 17 })]);
    const texts = items.flatMap((i) => (i.kind === "message" ? [i.text] : []));
    expect(texts).toEqual(["message 30", "message 5", "message 17"]);
  });

  it("derives unique ids from the server ids", () => {
    const items = toHistoryItems([
      msg({ id: 812, session_id: 37 }),
      msg({ id: 813, session_id: 38 }),
    ]);
    const ids = items.map((i) => i.id);
    expect(ids).toEqual(["sep-812", "srv-812", "sep-813", "srv-813"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives the separator the first message's raw timestamp", () => {
    const items = toHistoryItems([
      msg({ id: 1, created_at: "2026-10-20T08:00:00+00:00" }),
      msg({ id: 2, created_at: "2026-10-20T08:01:00+00:00" }),
    ]);
    expect(items[0]).toEqual({
      kind: "separator",
      id: "sep-1",
      startedAt: "2026-10-20T08:00:00+00:00",
    });
  });
});

describe("formatSessionStart", () => {
  it("formats in Hungarian in the given time zone", () => {
    expect(formatSessionStart("2026-10-24T17:30:12+00:00", "UTC")).toBe(
      "2026. október 24. 17:30",
    );
  });

  it("converts to Budapest time, summer and winter", () => {
    expect(formatSessionStart("2026-10-24T17:30:12+00:00", "Europe/Budapest")).toBe(
      "2026. október 24. 19:30",
    );
    expect(formatSessionStart("2026-12-05T17:30:12+00:00", "Europe/Budapest")).toBe(
      "2026. december 5. 18:30",
    );
  });

  it("moves to the next day across midnight", () => {
    expect(formatSessionStart("2026-10-24T23:30:00+00:00", "Europe/Budapest")).toBe(
      "2026. október 25. 01:30",
    );
  });

  it("handles microsecond precision from the server", () => {
    expect(formatSessionStart("2026-10-24T17:30:12.123456+00:00", "UTC")).toBe(
      "2026. október 24. 17:30",
    );
  });

  it("returns the raw input when it cannot be parsed", () => {
    expect(formatSessionStart("not a date", "UTC")).toBe("not a date");
  });
});

describe("parseHistoryResponse", () => {
  it("returns the messages of a valid response", () => {
    const m = msg({ id: 812, session_id: 37, status: "partial", role: "assistant" });
    expect(parseHistoryResponse({ messages: [m] })).toEqual([m]);
  });

  it("accepts an empty list", () => {
    expect(parseHistoryResponse({ messages: [] })).toEqual([]);
  });

  it.each([
    ["null", null],
    ["missing messages", {}],
    ["messages not an array", { messages: "x" }],
    ["unknown role", { messages: [{ ...msg({ id: 1 }), role: "system" }] }],
    ["unknown status", { messages: [{ ...msg({ id: 1 }), status: "redacted" }] }],
    ["wrong field type", { messages: [{ ...msg({ id: 1 }), id: "1" }] }],
    ["non-object element", { messages: [42] }],
  ])("throws on %s", (_label, input) => {
    expect(() => parseHistoryResponse(input)).toThrow(HistoryParseError);
  });
});
