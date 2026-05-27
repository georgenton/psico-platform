import { describe, expect, it } from "vitest";
import { isCrisisText } from "./crisis";

describe("isCrisisText", () => {
  it.each([
    "estoy pensando en suicidarme",
    "tengo ganas de quitarme la vida",
    "ya no quiero vivir",
    "creo que voy a matarme",
    "quiero desaparecer para siempre",
    "I want to kill myself",
    "thinking about suicide",
  ])("detects %s", (text) => {
    expect(isCrisisText(text)).toBe(true);
  });

  it.each([
    "estoy un poco triste",
    "tuve un mal día",
    "me siento ansioso por el trabajo",
    "necesito vacaciones",
    "hoy me sentí mal pero ya estoy mejor",
  ])("does NOT match soft signal: %s", (text) => {
    expect(isCrisisText(text)).toBe(false);
  });

  it("is accent-insensitive", () => {
    // "suicidió" with composed accent should still match the `\bsuicid` pattern.
    expect(isCrisisText("creo que se suicidió mi vecino")).toBe(true);
  });

  it("case-insensitive", () => {
    expect(isCrisisText("QUIERO MORIR")).toBe(true);
  });
});
