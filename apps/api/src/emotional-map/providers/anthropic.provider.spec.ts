import { describe, expect, it } from "vitest";

import { parseEmotionalMapJson } from "./anthropic.provider";

describe("parseEmotionalMapJson", () => {
  it("parses a clean JSON object", () => {
    const out = parseEmotionalMapJson(
      `{"calma":0.7,"claridad":0.55,"compasion":0.62,"consciencia":0.48}`,
    );
    expect(out).toEqual({
      calma: 0.7,
      claridad: 0.55,
      compasion: 0.62,
      consciencia: 0.48,
    });
  });

  it("tolerates ```json fences the model sometimes adds despite the prompt", () => {
    const out = parseEmotionalMapJson(
      '```json\n{"calma":0.5,"claridad":0.5,"compasion":0.5,"consciencia":0.5}\n```',
    );
    expect(out).not.toBeNull();
    expect(out?.calma).toBe(0.5);
  });

  it("clamps out-of-range values to [0, 1]", () => {
    const out = parseEmotionalMapJson(
      `{"calma":1.5,"claridad":-0.3,"compasion":0.5,"consciencia":2}`,
    );
    expect(out?.calma).toBe(1);
    expect(out?.claridad).toBe(0);
    expect(out?.consciencia).toBe(1);
  });

  it("returns null on missing keys", () => {
    const out = parseEmotionalMapJson(`{"calma":0.5,"claridad":0.5}`);
    expect(out).toBeNull();
  });

  it("returns null on garbage text", () => {
    expect(parseEmotionalMapJson("not json")).toBeNull();
    expect(parseEmotionalMapJson("")).toBeNull();
  });

  it("returns null on non-numeric values", () => {
    const out = parseEmotionalMapJson(
      `{"calma":"high","claridad":0.5,"compasion":0.5,"consciencia":0.5}`,
    );
    expect(out).toBeNull();
  });
});
