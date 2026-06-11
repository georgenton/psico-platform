import type { OnboardingIntro, OnboardingTourStep } from "@psico/types";

/**
 * Editorial content that changes rarely (≈ once a quarter). Lives as constants
 * rather than DB rows because:
 *  - It's small (a few paragraphs total).
 *  - i18n is a non-issue for v1 (single locale es-419).
 *  - Editing requires a code review anyway (copy is brand-sensitive).
 *
 * If we later need to A/B test or rotate intros, migrate to a DB table
 * `OnboardingIntro { id, isActive, ... }`. Today YAGNI.
 */

export const MARINA_INTRO: OnboardingIntro = {
  title: "Hola, soy Marina",
  subtitle: "Tu compañera en este camino",
  body:
    "Antes de empezar quiero conocerte un poco. Te haré tres preguntas " +
    "sencillas para entender qué te trae aquí y cómo te sientes hoy. " +
    "Con eso te sugeriré por dónde empezar a leer. " +
    "Si prefieres saltar este paso, puedes hacerlo y explorar a tu ritmo.",
  signature: "— Marina, psicóloga y autora de Emociones en Construcción",
  avatarUrl: null,
};

/**
 * UI tour shown after onboarding completion. Each step points at a semantic
 * target the frontend knows how to resolve (CSS selector, ref name, etc.).
 *
 * Keep this list short — ≤ 5 steps. Long tours are ignored.
 */
export const TOUR_STEPS: OnboardingTourStep[] = [
  {
    order: 1,
    target: "inicio",
    title: "Tu Inicio",
    body:
      "Aquí encuentras tu lectura en curso, una pregunta del día y " +
      "accesos rápidos a tu diario y a Eco.",
  },
  {
    order: 2,
    target: "biblioteca",
    title: "Mi Biblioteca",
    body:
      "Todos los libros, audios y ejercicios. Filtra por motivo o autor " +
      "para encontrar lo que te haga clic.",
  },
  {
    order: 3,
    target: "diario",
    title: "Tu Diario",
    body:
      "Un espacio privado para escribir cómo te sientes. " +
      "Cifrado de punta a punta — solo tú puedes leerlo.",
  },
  {
    order: 4,
    target: "eco",
    title: "Eco",
    body:
      "Tu compañero conversacional. No es un terapeuta — está aquí para " +
      "escucharte y ayudarte a poner palabras a lo que sientes.",
  },
  {
    order: 5,
    target: "patrones",
    title: "Patrones",
    body:
      "Cuando escribas un poco más en tu diario, aquí vas a ver tu " +
      "mapa emocional: qué moods se repiten y cuándo escribes. Función " +
      "Pro — el preview vive aquí también.",
  },
];

// ─── Recommendation algorithm ────────────────────────────────────────────────
//
// Maps `motivo` → primary book slug. The first matching motivo wins; if no
// motivo matches we fall back to the anchor book ("emociones-en-construccion").
//
// This is intentionally simple. Sprint S25 (Pulso) gives us data to know
// what's working; until then, hard-coded mapping is honest about how much
// signal we have.
//
// IMPORTANT: bookSlug values must exist in the seeded `Book` table. The
// service validates and falls back gracefully if a recommendation points
// to a missing book.

export const RECOMMENDATION_BY_MOTIVO: Record<string, string> = {
  ansiedad: "emociones-en-construccion",
  tristeza: "emociones-en-construccion",
  relaciones: "familias-ensambladas",
  trabajo: "emociones-en-construccion",
  duelo: "emociones-en-construccion",
  vinculos: "familias-ensambladas",
  explorar: "emociones-en-construccion",
};

export const FALLBACK_BOOK_SLUG = "emociones-en-construccion";

// ─── "Why this book" copy per motivo+book pair ───────────────────────────────
//
// The recommendation includes a `why` field — a one-sentence explanation of
// why we picked this book for this user. Keys are `${motivoId}:${bookSlug}`.
// Falls back to a generic message if missing.

export const RECOMMENDATION_REASON: Record<string, string> = {
  "ansiedad:emociones-en-construccion":
    "Marina dedica un capítulo entero a la ansiedad y cómo nombrarla sin pelearla.",
  "tristeza:emociones-en-construccion":
    "Tres capítulos sobre cómo habitar la tristeza sin que tome el volante.",
  "relaciones:familias-ensambladas":
    "Justo para los vínculos cuando las dinámicas familiares se vuelven complejas.",
  "vinculos:familias-ensambladas":
    "Sobre los vínculos que cargamos desde nuestra historia y los que estamos construyendo.",
  "trabajo:emociones-en-construccion":
    "Un capítulo sobre cómo el burnout y la rabia productiva se sienten en el cuerpo.",
  "duelo:emociones-en-construccion":
    "Marina escribe sobre el duelo no solo cuando alguien muere, también cuando algo termina.",
  "explorar:emociones-en-construccion":
    "Un buen punto de partida para reconocer tus emociones sin etiquetas rígidas.",
};

export const FALLBACK_REASON =
  "Un comienzo amable, escrito por Marina para personas que están entrando a este camino.";

// ─── Mood catalog (seeded into OnboardingMood) ───────────────────────────────
//
// Single source of truth for the moods catalog that lives in DB. Both `seed.ts`
// and the alignment test in `apps/api/src/onboarding/moods-alignment.spec.ts`
// read from here. The shared catalog used by web + mobile UI lives in
// `@psico/types` as `DIARY_MOODS` — the alignment test verifies the two stay
// in lockstep (same IDs, same labels). Adding a mood requires touching both
// arrays + re-seeding.
//
// `swatch` and `order` are SEED-only metadata (UI uses emoji from DIARY_MOODS).

export interface OnboardingMoodSeed {
  readonly id: string;
  readonly label: string;
  readonly swatch: string;
  readonly order: number;
}

export const MOOD_SEED_CATALOG: readonly OnboardingMoodSeed[] = [
  { id: "calma", label: "Calma", swatch: "#A8C7E4", order: 1 },
  { id: "foco", label: "Foco", swatch: "#7C5BC4", order: 2 },
  { id: "energia", label: "Energía", swatch: "#F2A65A", order: 3 },
  { id: "reflexion", label: "Reflexión", swatch: "#8C9F7E", order: 4 },
  { id: "alegria", label: "Alegría", swatch: "#F5C76B", order: 5 },
  { id: "ansiedad", label: "Ansiedad", swatch: "#C97B7B", order: 6 },
  { id: "tristeza", label: "Tristeza", swatch: "#6B7E8E", order: 7 },
] as const;
