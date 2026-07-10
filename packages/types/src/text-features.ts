/**
 * Etapa 6 — on-device reflection-text analysis (Mapa Emocional · Fase B).
 *
 * The diary is E2E-encrypted: the server NEVER sees plaintext (ADR 0007).
 * This module runs ON THE CLIENT (web + mobile import the same function, so
 * the math can't diverge): the composer already holds the decrypted text, we
 * compute a small vector of NUMERIC linguistic features and only those
 * numbers travel to the API. No word, no fragment, no hash of the text —
 * counts and densities only.
 *
 * The features follow the affective-science literature: first-person focus
 * (Pennebaker), absolutist language (Al-Mosaiwi & Johnstone 2018), affect
 * labeling, cognitive insight/causal words, and self-kind vs self-critical
 * talk. Lexicons are small, curated Ecuadorian/neutral Spanish, matched on
 * accent-stripped lowercase tokens so sloppy typing still counts.
 */

export interface ReflectionTextFeatures {
  /** Tokens in the entry (letters-only tokenization). */
  wordCount: number;
  /** First-person singular pronoun density (yo/me/mi...) in [0,1]. */
  selfFocus: number;
  /** Positive-affect word density in [0,1]. */
  positive: number;
  /** Negative-affect word density in [0,1]. */
  negative: number;
  /** Cognitive-insight marker density ("me di cuenta", entendí...) in [0,1]. */
  insight: number;
  /** Causal-language density (porque, por eso...) in [0,1]. */
  causal: number;
  /** Absolutist word density (siempre, nunca, todo, nada...) in [0,1]. */
  absolutist: number;
  /** Social-reference density (familia, amigos, nosotros...) in [0,1]. */
  social: number;
  /** Self-kind talk density ("está bien", "hice lo que pude"...) in [0,1]. */
  selfKind: number;
  /** Self-critical talk density ("soy un desastre", "es mi culpa"...) in [0,1]. */
  selfCritic: number;
}

/** Ordered keys — handy for DTO/tests that must assert numbers-only shape. */
export const REFLECTION_FEATURE_KEYS = [
  "wordCount",
  "selfFocus",
  "positive",
  "negative",
  "insight",
  "causal",
  "absolutist",
  "social",
  "selfKind",
  "selfCritic",
] as const;

// ─── lexicons (accent-stripped lowercase) ────────────────────────────────────

const SELF_WORDS = ["yo", "me", "mi", "mis", "mio", "mia", "mios", "mias", "conmigo"]; // prettier-ignore
const POSITIVE_WORDS = ["feliz", "alegre", "alegria", "tranquilo", "tranquila", "tranquilidad", "calma", "paz", "agradecido", "agradecida", "gratitud", "contento", "contenta", "esperanza", "orgulloso", "orgullosa", "amor", "carino", "bien", "mejor", "logre", "disfrute", "disfrutar", "sonrei", "ilusion", "animo"]; // prettier-ignore
const NEGATIVE_WORDS = ["triste", "tristeza", "ansioso", "ansiosa", "ansiedad", "miedo", "temor", "enojado", "enojada", "enojo", "ira", "rabia", "culpa", "verguenza", "cansado", "cansada", "agotado", "agotada", "estres", "estresado", "estresada", "preocupado", "preocupada", "preocupacion", "dolor", "mal", "peor", "llore", "llorar", "angustia", "vacio", "frustrado", "frustrada", "frustracion"]; // prettier-ignore
const INSIGHT_WORDS = ["entiendo", "entendi", "comprendo", "comprendi", "aprendi", "descubri", "reflexione", "reflexiono", "noto", "note", "claridad"]; // prettier-ignore
const INSIGHT_PHRASES = ["me di cuenta", "me doy cuenta", "ahora veo", "tiene sentido", "caigo en cuenta"]; // prettier-ignore
const CAUSAL_WORDS = ["porque", "entonces", "debido", "razon", "causa", "consecuencia"]; // prettier-ignore
const CAUSAL_PHRASES = ["ya que", "por eso", "asi que", "por lo que"]; // prettier-ignore
const ABSOLUTIST_WORDS = ["siempre", "nunca", "jamas", "todo", "todos", "todas", "nada", "nadie", "completamente", "totalmente", "absolutamente", "imposible", "definitivamente"]; // prettier-ignore
const SOCIAL_WORDS = ["nosotros", "nosotras", "familia", "amigo", "amiga", "amigos", "amigas", "mama", "papa", "madre", "padre", "hermano", "hermana", "hijo", "hija", "pareja", "esposo", "esposa", "novio", "novia", "companero", "companera", "gente", "juntos", "juntas", "hablamos", "conversamos", "equipo", "abrazo"]; // prettier-ignore
const SELF_KIND_WORDS = ["perdonarme", "cuidarme", "paciencia", "compasion", "merezco", "amable"]; // prettier-ignore
const SELF_KIND_PHRASES = ["esta bien sentir", "esta bien no", "hice lo que pude", "un paso a la vez", "me lo permito", "ser amable conmigo", "me perdono", "no pasa nada"]; // prettier-ignore
const SELF_CRITIC_WORDS = ["fracaso", "inutil", "tonto", "tonta", "estupido", "estupida", "debil", "patetico", "patetica"]; // prettier-ignore
const SELF_CRITIC_PHRASES = ["no sirvo", "soy un desastre", "todo lo hago mal", "es mi culpa", "deberia haber", "no puedo con", "soy lo peor"]; // prettier-ignore

// ─── analyzer ────────────────────────────────────────────────────────────────

/** Lowercase + strip diacritics so "más"/"mas" and sloppy typing both match. */
function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function countTokens(
  tokens: ReadonlyArray<string>,
  words: ReadonlyArray<string>,
): number {
  const set = new Set(words);
  let n = 0;
  for (const t of tokens) if (set.has(t)) n++;
  return n;
}

function countPhrases(text: string, phrases: ReadonlyArray<string>): number {
  let n = 0;
  for (const p of phrases) {
    let idx = text.indexOf(p);
    while (idx !== -1) {
      n++;
      idx = text.indexOf(p, idx + p.length);
    }
  }
  return n;
}

/**
 * Analyze a decrypted reflection ON DEVICE. Deterministic, dependency-free,
 * identical on web and mobile. Returns null for effectively-empty text so
 * callers can skip the upload entirely.
 */
export function analyzeReflectionText(
  text: string,
): ReflectionTextFeatures | null {
  const norm = normalize(text);
  const tokens = norm.split(/[^a-zñ]+/).filter(Boolean);
  const n = tokens.length;
  if (n < 5) return null; // too short to say anything honest

  const density = (hits: number) => round4(Math.min(1, hits / n));

  return {
    wordCount: n,
    selfFocus: density(countTokens(tokens, SELF_WORDS)),
    positive: density(countTokens(tokens, POSITIVE_WORDS)),
    negative: density(countTokens(tokens, NEGATIVE_WORDS)),
    insight: density(
      countTokens(tokens, INSIGHT_WORDS) + countPhrases(norm, INSIGHT_PHRASES),
    ),
    causal: density(
      countTokens(tokens, CAUSAL_WORDS) + countPhrases(norm, CAUSAL_PHRASES),
    ),
    absolutist: density(countTokens(tokens, ABSOLUTIST_WORDS)),
    social: density(countTokens(tokens, SOCIAL_WORDS)),
    selfKind: density(
      countTokens(tokens, SELF_KIND_WORDS) +
        countPhrases(norm, SELF_KIND_PHRASES),
    ),
    selfCritic: density(
      countTokens(tokens, SELF_CRITIC_WORDS) +
        countPhrases(norm, SELF_CRITIC_PHRASES),
    ),
  };
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

// ─── wire shapes ─────────────────────────────────────────────────────────────

/** Body for POST /api/emotional-map/text-features — NUMBERS ONLY, never text. */
export interface LogTextFeaturesRequest extends ReflectionTextFeatures {
  /** Diary entry the features belong to (enables idempotent re-save upsert). */
  entryId?: string;
}

export interface LogTextFeaturesResponse {
  ok: true;
  id: string;
}
