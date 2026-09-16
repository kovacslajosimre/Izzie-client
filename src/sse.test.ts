import { describe, expect, it } from "vitest";
import { SSEDecoder, SSEParseError } from "./sse";

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("SSEDecoder", () => {
  it("parses a single event delivered in one chunk", () => {
    const decoder = new SSEDecoder();
    const events = decoder.push(
      encode('data: {"type":"token","text":"hello"}\n\n'),
    );
    expect(events).toEqual([{ type: "token", text: "hello" }]);
  });

  it("parses multiple events delivered in one chunk", () => {
    const decoder = new SSEDecoder();
    const events = decoder.push(
      encode(
        'data: {"type":"token","text":"hel"}\n\ndata: {"type":"token","text":"lo"}\n\n',
      ),
    );
    expect(events).toEqual([
      { type: "token", text: "hel" },
      { type: "token", text: "lo" },
    ]);
  });

  it("parses an event split across multiple chunks, mid-line", () => {
    const decoder = new SSEDecoder();
    const full = 'data: {"type":"token","text":"hello"}\n\n';
    const splitAt = full.indexOf('"text"');

    const first = decoder.push(encode(full.slice(0, splitAt)));
    expect(first).toEqual([]);

    const second = decoder.push(encode(full.slice(splitAt)));
    expect(second).toEqual([{ type: "token", text: "hello" }]);
  });

  it("reassembles a multi-byte UTF-8 character split across two chunks", () => {
    const decoder = new SSEDecoder();
    const full = 'data: {"type":"token","text":"árvíztűrő"}\n\n';
    const bytes = encode(full);

    // Find the byte offset of the "á" character's second byte so the split
    // lands in the middle of a multi-byte UTF-8 sequence.
    const charIndex = full.indexOf("á");
    const splitAt = encode(full.slice(0, charIndex)).length + 1;

    const first = decoder.push(bytes.slice(0, splitAt));
    expect(first).toEqual([]);

    const second = decoder.push(bytes.slice(splitAt));
    expect(second).toEqual([{ type: "token", text: "árvíztűrő" }]);
  });

  it("accepts \\r\\n line endings", () => {
    const decoder = new SSEDecoder();
    const events = decoder.push(encode('data: {"type":"done"}\r\n\r\n'));
    expect(events).toEqual([{ type: "done" }]);
  });

  it("ignores unknown event types but keeps processing the rest", () => {
    const decoder = new SSEDecoder();
    const events = decoder.push(
      encode(
        'data: {"type":"future_type","foo":1}\n\ndata: {"type":"done"}\n\n',
      ),
    );
    expect(events).toEqual([{ type: "done" }]);
  });

  it("throws SSEParseError on malformed JSON", () => {
    const decoder = new SSEDecoder();
    expect(() => decoder.push(encode("data: not-json\n\n"))).toThrow(
      SSEParseError,
    );
  });

  it("keeps an unterminated trailing event buffered until it closes", () => {
    const decoder = new SSEDecoder();
    const first = decoder.push(
      encode('data: {"type":"token","text":"a"}\n\ndata: {"type":"token"'),
    );
    expect(first).toEqual([{ type: "token", text: "a" }]);

    const second = decoder.push(encode(',"text":"b"}\n\n'));
    expect(second).toEqual([{ type: "token", text: "b" }]);
  });

  it("parses sentence events with their index and text", () => {
    const decoder = new SSEDecoder();
    const events = decoder.push(
      encode(
        'data: {"type":"sentence","index":2,"text":"Hello world."}\n\n',
      ),
    );
    expect(events).toEqual([
      { type: "sentence", index: 2, text: "Hello world." },
    ]);
  });
});
