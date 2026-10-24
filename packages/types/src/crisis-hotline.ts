/**
 * Turning a written crisis line into something a phone will actually dial.
 *
 * ── The defect this exists to stop ────────────────────────────────────────
 *
 * Both crisis modals built their `tel:` with `hotline.replace(/\s|\(.+?\)/g,
 * "")` — strip the spaces, strip whatever is in brackets. Against the line
 * the API really serves, `"1800-4-SALUD (1800-472583)"`, that discards the
 * ONE fully numeric form the string contains and keeps the mnemonic:
 *
 *     "1800-4-SALUD (1800-472583)"  ->  tel:1800-4-SALUD
 *
 * A `tel:` with letters in it is not reliably dialled by anything; the
 * mnemonic is for a human reading a poster, not for a dialler. So the button
 * that says «Llamar ahora», on the one surface where a tap has to work the
 * first time, led somewhere a phone may refuse. Nobody noticed because every
 * test pinned a fixture line (`"171 (opción 6)"`) whose brackets happen to
 * hold the decoration rather than the number.
 *
 * ── The rule ─────────────────────────────────────────────────────────────
 *
 * Read the written line as a set of candidate forms — the text outside the
 * brackets, and each bracketed group — and dial the first one that is
 * actually dialable. Prefer a bracketed numeric form, because that is the
 * convention these lines are written in: the mnemonic leads, the digits
 * follow in brackets for whoever needs to key them in.
 *
 * When nothing is dialable the answer is `null`, and the caller must render
 * the number as text instead of a link. A dead `tel:` on this surface is
 * worse than no link: it looks like help and does nothing.
 */

/** Characters a dialler accepts, once `tel:` has been written. */
const DIALABLE = /^[+0-9][0-9+\-.*#]*$/;

/** How many digits a string needs before we will call it a phone number. */
const MIN_DIGITS = 3;

const digitsIn = (s: string) => (s.match(/[0-9]/g) ?? []).length;

/** Strip what a `tel:` must not carry, keeping `+` only where it leads. */
function toDialable(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const plus = trimmed.startsWith("+") ? "+" : "";
  // Spaces, brackets and separators go; letters are the thing we refuse, so
  // they are not silently dropped — a candidate carrying one is rejected
  // below rather than quietly turned into a different number.
  const body = trimmed.slice(plus.length).replace(/[\s()]/g, "");
  const candidate = `${plus}${body}`;
  if (!DIALABLE.test(candidate)) return null;
  if (digitsIn(candidate) < MIN_DIGITS) return null;
  return candidate;
}

/**
 * The number to dial for a written crisis line, or `null` when the line
 * carries no dialable form.
 *
 * Pure and total: any string in, a dialable string or `null` out.
 */
export function dialableHotline(
  hotline: string | null | undefined,
): string | null {
  if (!hotline) return null;

  // Bracketed groups first. The convention these lines follow puts the
  // mnemonic outside and the digits inside, and the digits are what we want.
  for (const m of hotline.matchAll(/\(([^)]*)\)/g)) {
    const inner = toDialable(m[1] ?? "");
    if (inner) return inner;
  }

  // Otherwise the line with every bracketed group removed. `171 (opción 6)`
  // reaches here, because «opción 6» is not a number to call.
  return toDialable(hotline.replace(/\([^)]*\)/g, ""));
}
