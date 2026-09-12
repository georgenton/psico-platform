/**
 * The inviter's first name, and nothing more of them.
 *
 * Somebody deciding whether to accept an invitation needs to recognise who is
 * asking. What they do not need — and what a stranger holding a guessed link
 * must never get — is a full name, an email, or anything that identifies a
 * person they do not already know. So this reduces whatever the account holds
 * to a single given name, and fails closed to a neutral word rather than
 * leaking more when the data is shaped unexpectedly.
 *
 * `User.firstName` is preferred because it is already exactly this. `User.name`
 * is a fallback and is REDUCED, not passed through: it commonly holds a full
 * name, and returning it whole would turn a recognisability affordance into a
 * disclosure.
 */

/** Longer than any real given name; anything past this is not one. */
const MAX_FIRST_NAME = 40;

/**
 * Only the first whitespace-separated token of a display name is kept.
 *
 * "María Fernanda Salazar" becomes "María" rather than "María Fernanda": the
 * second token is as often a surname as a second given name, and guessing
 * wrong in that direction discloses more, not less. Recognition survives the
 * trim; identification does not.
 */
export function safeInviterFirstName(user: {
  readonly firstName?: string | null;
  readonly name?: string | null;
}): string {
  // BOTH columns go through the same reduction. `firstName` is meant to hold
  // one given name, but "meant to" is not a guarantee — it is free text a
  // person typed, and an earlier version of this trusted it: a `firstName` of
  // "Ana María Pérez Gómez" was returned whole, and a 200-character one was
  // returned at 200 characters. Whatever is stored, what leaves here is one
  // bounded token.
  const fromFirstName = reduce(user.firstName);
  if (fromFirstName) return fromFirstName;

  const fromName = reduce(user.name);
  if (fromName) return fromName;

  // An account with neither is possible (OAuth without a profile name). The
  // screen still has to say something, and "alguien" is honest: it tells the
  // person we are not going to invent an identity for whoever invited them.
  return "Alguien";
}

/** Clean, keep the first token, bound the length. Null when nothing survives. */
function reduce(value: string | null | undefined): string | null {
  const cleaned = clean(value);
  if (!cleaned) return null;
  const firstToken = cleaned.split(/\s+/)[0] ?? "";
  return firstToken.length > 0 ? truncate(firstToken) : null;
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  // Strip anything that could smuggle markup, a newline that breaks layout, or
  // control characters into a screen shown to a stranger.
  const stripped = value.replace(/[\p{C}<>]/gu, " ").trim();
  return stripped.length > 0 ? stripped : null;
}

function truncate(value: string): string {
  return value.length > MAX_FIRST_NAME ? value.slice(0, MAX_FIRST_NAME) : value;
}
