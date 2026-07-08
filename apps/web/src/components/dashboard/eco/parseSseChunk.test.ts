import { describe, expect, it } from "vitest";
import { parseSseChunk } from "@psico/api-client";

/**
 * Regression guard for the "Eco never replies" bug.
 *
 * NestJS' `@Sse()` emits frames where the event discriminant lives INSIDE
 * the JSON `data:` payload, with NO SSE `event:` field:
 *
 *   id: 1
 *   data: {"event":"delta","data":{"text":"¡Hola!"}}
 *
 * The parser must read `event` from the JSON, not from an `event:` line. A
 * previous version required an `event:` line the server never sends, so every
 * frame was dropped and the chat looked frozen.
 *
 * These fixtures are copied verbatim from a real production SSE capture.
 */
describe("parseSseChunk (Eco SSE wire format)", () => {
  it("parses a delta frame with the event nested in the JSON (real format)", () => {
    const raw = `id: 1\ndata: {"event":"delta","data":{"text":"¡Hola!"}}`;
    const parsed = parseSseChunk(raw);
    expect(parsed).toEqual({ event: "delta", data: { text: "¡Hola!" } });
  });

  it("parses a done frame", () => {
    const raw = `id: 6\ndata: {"event":"done","data":{"messageId":"abc","quotaRemaining":9}}`;
    const parsed = parseSseChunk(raw);
    expect(parsed).toEqual({
      event: "done",
      data: { messageId: "abc", quotaRemaining: 9 },
    });
  });

  it("parses an error frame", () => {
    const raw = `id: 1\ndata: {"event":"error","data":{"code":"ECO_UNKNOWN","message":"Algo salió mal."}}`;
    const parsed = parseSseChunk(raw);
    expect(parsed?.event).toBe("error");
  });

  it("returns null for a data-less frame", () => {
    expect(parseSseChunk("id: 1")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseSseChunk("data: {not json")).toBeNull();
  });

  it("returns null when the JSON has no event discriminant", () => {
    expect(parseSseChunk(`data: {"data":{"text":"x"}}`)).toBeNull();
  });
});
