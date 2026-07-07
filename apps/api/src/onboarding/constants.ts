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

/**
 * Onboarding welcome copy. Generic voice (no personal name) so the intro
 * stays brand-neutral as more authors get onboarded via Author B2B (S22+).
 * If we later need per-author intros, swap this constant for a function
 * keyed by the recommendedBookId or current featured author.
 */
export const ONBOARDING_INTRO: OnboardingIntro = {
  title: "Empecemos.",
  subtitle: "Antes de leer, queremos conocerte un poco.",
  body:
    "Te haremos tres preguntas cortas para entender qué te trae aquí y " +
    "cómo te sientes hoy. Con eso vas a recibir una recomendación de por " +
    "dónde empezar a leer. " +
    "Si prefieres saltar este paso, puedes hacerlo y explorar a tu ritmo.",
  signature: "— Psico Platform",
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
      "Este es tu punto de partida cada día. Verás tu lectura en curso, " +
      "una pregunta para reflexionar y accesos rápidos a lo que más usas.",
    learnMore: {
      title: "¿Qué vas a ver aquí con el tiempo?",
      points: [
        "📖 El libro que estás leyendo y por dónde vas.",
        "✍️ Una pregunta del día pensada para invitarte a escribir.",
        "🌿 Un saludo de Eco cuando quieras conversar.",
        "📊 Un mini Mapa Emocional que se va llenando a medida que reflexionas.",
      ],
    },
  },
  {
    order: 2,
    target: "biblioteca",
    title: "Tu Biblioteca",
    body:
      "Todos los libros, audios y ejercicios de la plataforma. Filtra por " +
      "tema o autor para encontrar lo que te haga clic.",
    learnMore: {
      title: "¿Qué la hace distinta?",
      points: [
        "📚 Cada libro está escrito por psicólogos especializados.",
        "🎧 Muchos vienen con audio para escuchar mientras caminas o descansas.",
        "🔍 Los filtros ayudan a decidir sin abrumar — elige un tema y empieza.",
        "✏️ Puedes resaltar frases y guardar notas mientras lees.",
      ],
    },
  },
  {
    order: 3,
    target: "diario",
    title: "Tu Diario",
    body:
      "Un espacio privado para escribir cómo te sientes. Solo tú puedes " +
      "leerlo — ni siquiera nuestro equipo tiene acceso.",
    learnMore: {
      title: "¿Cómo funciona la privacidad?",
      analogy:
        "Piensa en tu diario como una caja fuerte con una llave única — " +
        "tú eres el único que la tiene.",
      points: [
        "🔑 Tu llave se crea con tu contraseña y nunca sale de tu dispositivo.",
        "👀 Nosotros solo vemos texto revuelto que no significa nada.",
        "📝 Si olvidas tu contraseña, te daremos una frase de 24 palabras para poder volver a entrar.",
      ],
    },
  },
  {
    order: 4,
    target: "eco",
    title: "Eco",
    body:
      "Un compañero de conversación pensado para acompañarte. Está aquí " +
      "para escucharte y ayudarte a poner palabras a lo que sientes.",
    learnMore: {
      title: "¿Qué es exactamente Eco?",
      points: [
        "🌿 Una IA entrenada para acompañarte con calma, no para juzgarte.",
        "🔒 Tus conversaciones son igual de privadas que tu diario — solo tú las lees.",
        "🩺 Si detecta señales de crisis, te muestra líneas de ayuda profesional inmediatas.",
        "🙋 Complementa el trabajo con un terapeuta — no lo reemplaza.",
      ],
    },
  },
  {
    order: 5,
    target: "patrones",
    title: "Tus Patrones",
    body:
      "Cuando reflexiones un poco más, aquí verás tu mapa emocional: qué " +
      "emociones se repiten, cuándo escribes y qué temas van surgiendo.",
    learnMore: {
      title: "¿Qué son los patrones?",
      points: [
        "🗺️ Un mapa visual de las tendencias en tu ánimo a lo largo del tiempo.",
        "🏷️ Etiquetas que se repiten en tus reflexiones (por ejemplo: trabajo, familia, descanso).",
        "📈 Con unas 7 entradas de diario empiezan a aparecer los primeros insights.",
        "✨ Es una función Pro — desde aquí siempre ves un preview.",
      ],
    },
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

// Sprint B6b: aligned with redesign-v2 (5 wellness levels) — kept in lockstep
// with DIARY_MOODS via `moods-alignment.spec.ts`. Swatches map design intent:
// great/good lean green (sage), ok stays warm-neutral, low/hard lean lavender.
export const MOOD_SEED_CATALOG: readonly OnboardingMoodSeed[] = [
  { id: "great", label: "Muy bien", swatch: "#7FAE76", order: 1 },
  { id: "good", label: "Bien", swatch: "#A8C7E4", order: 2 },
  { id: "ok", label: "Neutral", swatch: "#B8B3AA", order: 3 },
  { id: "low", label: "Bajo", swatch: "#8B71F5", order: 4 },
  { id: "hard", label: "Difícil", swatch: "#5E42C0", order: 5 },
] as const;

// Legacy IDs the pre-B6b seed inserted into `OnboardingMood`. The B6b seed
// flips their `isActive` to false so the onboarding step 2 picker stops
// listing them; existing rows in `OnboardingState.initialMoodId` keep their
// value (analytic audit), the live "current mood" surfaces show
// "¿Cómo estás?" until the user picks again.
export const LEGACY_MOOD_IDS_TO_DEACTIVATE = [
  "calma",
  "foco",
  "energia",
  "reflexion",
  "alegria",
  "ansiedad",
  "tristeza",
] as const;

// ─── Motivo catalog (seeded into OnboardingMotivo) ───────────────────────────
//
// Single source of truth for the motivos catalog persisted in `OnboardingMotivo`.
// The alignment test `motivos-alignment.spec.ts` enforces that:
//   - Every motivo here has an entry in RECOMMENDATION_BY_MOTIVO.
//   - Every recommended book slug is one of the known ancla books.
//   - FALLBACK_BOOK_SLUG is one of the known slugs.
//
// `icon` stores the literal glyph rendered by the UI. Emojis were chosen over
// a separate icon library (lucide-react) to keep the bundle thin and ensure
// the value is self-contained — the frontend just renders whatever string the
// backend persists. Re-seed after edits so existing rows pick up new glyphs.

export interface OnboardingMotivoSeed {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly order: number;
}

export const MOTIVO_SEED_CATALOG: readonly OnboardingMotivoSeed[] = [
  { id: "ansiedad", label: "Ansiedad", icon: "🌬️", order: 1 },
  { id: "tristeza", label: "Tristeza", icon: "🌧️", order: 2 },
  {
    id: "relaciones",
    label: "Mis relaciones",
    icon: "🤝",
    order: 3,
  },
  { id: "vinculos", label: "Vínculos familiares", icon: "👥", order: 4 },
  { id: "trabajo", label: "Trabajo y burnout", icon: "💼", order: 5 },
  { id: "duelo", label: "Estoy en un duelo", icon: "💔", order: 6 },
  { id: "explorar", label: "Solo explorando", icon: "🧭", order: 7 },
] as const;

/**
 * Known book slugs the onboarding recommender can return. Kept here to give
 * the alignment test a closed set to validate against. The seed creates these
 * two anchor books in `seed.ts`; any new book that should be recommendable from
 * onboarding must be added here too.
 */
export const KNOWN_ANCHOR_BOOK_SLUGS: readonly string[] = [
  "emociones-en-construccion",
  "familias-ensambladas",
] as const;
