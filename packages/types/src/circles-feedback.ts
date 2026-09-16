/**
 * The optional question after the activity, and the closed answers it accepts.
 *
 * ── Two kinds of "topic", and they are not the same number ─────────────────
 *
 * A template has `topics`: what the ACTIVITY is about, decided when it was
 * written. This file is the other kind: what somebody says their own situation
 * was about, if they choose to say anything.
 *
 * They answer different questions — "which activity was used" and "what did
 * this person say it touched" — and a panel that mixed them would be reporting
 * a number nobody can interpret. They are separate on the wire, separate in
 * storage and separate on screen.
 *
 * ── What is deliberately impossible ────────────────────────────────────────
 *
 * There is no free-text option. No "otro, ¿cuál?", no date, no age, no
 * relationship, no name. The eight labels below are the entire vocabulary, and
 * the server checks the keys rather than trusting them — a list somebody can
 * type into is a list somebody will put a sentence in, and this one is read by
 * an administrator.
 *
 * Nor is any of it a diagnosis. "Preocupaciones y ansiedad" is a word two
 * people might use about a Tuesday; it is not a finding, it does not go in a
 * record, and nothing downstream may treat it as one.
 */

export type CircleFeedbackUsefulness = "YES" | "SOME" | "NO";

export const CIRCLE_FEEDBACK_USEFULNESS: readonly CircleFeedbackUsefulness[] = [
  "YES",
  "SOME",
  "NO",
];

export interface CircleFeedbackTopicOption {
  /** Stored, aggregated, and validated server-side. */
  readonly key: string;
  readonly label: string;
}

/**
 * The substantive topics. Eight labels, six of which are subjects.
 *
 * `otro` is a subject too — "none of these" is information — while "prefiero no
 * responder" is NOT here on purpose: declining is an omission, so it sends
 * nothing at all and can never appear in a distribution as though it were a
 * kind of situation.
 */
export const CIRCLE_FEEDBACK_TOPICS: readonly CircleFeedbackTopicOption[] = [
  { key: "comunicacion", label: "Comunicación" },
  { key: "preocupaciones", label: "Preocupaciones y ansiedad" },
  { key: "convivencia", label: "Convivencia" },
  { key: "cambios", label: "Cambios en la relación" },
  { key: "separacion", label: "Separación" },
  { key: "apoyo-cotidiano", label: "Apoyo cotidiano" },
  { key: "otro", label: "Otro" },
];

export const CIRCLE_FEEDBACK_TOPIC_KEYS: readonly string[] =
  CIRCLE_FEEDBACK_TOPICS.map((t) => t.key);

/** At most two. Three would be "everything", which measures nothing. */
export const CIRCLE_FEEDBACK_MAX_TOPICS = 2;

/**
 * The wording somebody agreed to, versioned.
 *
 * Stored with each contribution, because consent is to a particular sentence.
 * Changing the sentence means a new version — not a silent reinterpretation of
 * what people already said yes to.
 */
export const CIRCLE_FEEDBACK_NOTICE_VERSION = "2026-09-15.1";

export const CIRCLE_FEEDBACK_NOTICE =
  "Si quieres, ayúdanos a mejorar esta experiencia. Puedes indicar un tema " +
  "general y si te resultó útil. Es opcional, no se muestra a la otra persona " +
  "y no enviará lo que escribiste en la actividad.";

/** What the browser may send. The server derives everything else. */
export interface CircleFeedbackRequest {
  /** Up to two keys from `CIRCLE_FEEDBACK_TOPIC_KEYS`. Empty is fine. */
  readonly topics: readonly string[];
  /** Omitted when skipped — never a fourth value meaning "skipped". */
  readonly usefulness?: CircleFeedbackUsefulness;
  readonly noticeVersion: string;
  /**
   * How many times each prepared help was opened, counted in the browser's
   * memory during the private preparation and sent only here, with this
   * consent. Never sent on its own, and lost if the person leaves first.
   */
  readonly helpOpens?: readonly {
    readonly fieldKey: string;
    readonly piece: "explanation" | "example";
    readonly opens: number;
  }[];
}

export interface CircleFeedbackResponse {
  readonly recorded: true;
}
