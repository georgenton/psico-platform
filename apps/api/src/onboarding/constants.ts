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
  // Four steps after this screen — motivos, ánimo, tu nombre and the
  // recommendation — and the counter now agrees. This copy was already
  // right; what disagreed was the indicator, which counted the welcome as a
  // step and announced "Paso 1 de 5" while the paragraph said four.
  //
  // No duration is promised either. The welcome used to say sixty seconds
  // and nobody had measured it; a number invented to sound friendly is
  // still a number the product can fail to keep.
  body:
    "Son cuatro pasos breves: tres preguntas cortas para entender qué te " +
    "trae aquí y cómo te sientes hoy, y al final tu recomendación de por " +
    "dónde empezar a leer. " +
    "Si prefieres saltar este paso, puedes hacerlo y explorar a tu ritmo.",
  signature: "— FeelVerse",
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
    // "Cada libro está escrito por psicólogos especializados" was a
    // credential claim with nothing behind it in this codebase, and "muchos
    // vienen con audio" a quantity nobody had counted. Both are gone. What
    // is left is what the product actually shows: authorship on the card,
    // audio where a chapter has it, filters that exist, marks that work.
    //
    // The audio line needed two passes, and both were about claiming more
    // than we can show.
    //
    // It first promised, to everybody, that "si todavía no está publicado, te
    // lo dice en su sitio". The player does say «Este capítulo aún no tiene
    // audio» — but only to someone who can reach that answer.
    // `LectorService.getAudio` throws `PRO_REQUIRED` for a FREE plan BEFORE it
    // ever looks for the file, so a free reader is told they need Pro and
    // never learns whether that chapter has audio at all. Since the tour runs
    // immediately after onboarding, nearly everybody reading this line is on
    // FREE, i.e. in the one case where it was not true.
    //
    // The replacement then opened with "Algunos capítulos tienen audio", which
    // is a claim about the catalogue: it asserts that playable tracks exist.
    // Nothing in this delivery measured the environment's inventory, and
    // measuring it is not the point — a tour can describe a CONDITIONAL
    // capability without inventorying it. So the line now states only the two
    // conditions that are true by construction: Pro, and a published track.
    //
    // Deliberately NOT said: that buying Pro gets you audio for a given
    // chapter. Pro is necessary, not sufficient, and the second condition is
    // editorial, not commercial. No audio was generated and no plan was
    // changed to make any wording true.
    title: "Tu Biblioteca",
    body:
      "Los libros y ejercicios de FeelVerse. Busca por título o autor y " +
      "filtra por tema para decidir por dónde seguir.",
    learnMore: {
      title: "¿Qué la hace distinta?",
      points: [
        "📚 Cada libro lleva su autoría y su ficha: puedes mirarla antes de empezar.",
        "🎧 El audio requiere Pro y sólo está disponible cuando el capítulo tiene una pista publicada. El reproductor del lector te dice en qué caso estás.",
        "🔍 Los filtros ayudan a decidir sin abrumar — elige un tema y empieza.",
        "✏️ Puedes resaltar frases y guardar notas mientras lees.",
      ],
    },
  },
  {
    order: 3,
    target: "diario",
    // The navigation calls this «Reflexiones»; the tour used to call it «Tu
    // Diario» and sent people looking for a section with that name.
    //
    // The recovery line was backwards, and that is the sentence that
    // mattered. The original promised we would hand over a phrase once
    // somebody had forgotten their password — a promise the cryptography
    // makes impossible to keep, because the key never reaches the server.
    //
    // Three facts the copy has to get right, and did not:
    //
    //   · The length. It says 12 because `SEED_PHRASE_WORD_COUNT` is 12
    //     (16-byte master key, Spanish wordlist). It said 24, which was
    //     true until ADR 0007 was revised in July 2026 and stopped being
    //     true then. `onboarding.service.spec.ts` now binds the number in
    //     this text to that constant, so the two cannot drift apart again.
    //   · The phrase is not a one-shot. `ShowSeedPhraseCard` re-derives and
    //     re-shows it from Ajustes → Seguridad whenever the diary is
    //     unlocked. "Save it now, it is your only chance" overstated the
    //     stakes and made the feature sound more fragile than it is.
    //   · Resetting the password restores access to the account. It does
    //     not, by itself, decrypt anything already written — those are two
    //     different recoveries and the tour is where people form the wrong
    //     model of which one they are getting.
    //
    // And the loss condition is a conjunction of THREE things, not two. The
    // previous wording ended "si pierdes la contraseña y la frase, el
    // contenido cifrado no se puede recuperar", which contradicts the bullet
    // right above it: `ShowSeedPhraseCard` reads `masterKey` straight from
    // `useDiaryKey()`, so a session that still holds the diary unlocked can
    // reveal the phrase with no password at all — it only falls back to
    // unlocking when that key is gone. Checked against the component, not
    // assumed. So an unlocked session is a third way out, and it is the one
    // somebody in trouble is most likely to still have open. Saying otherwise
    // would push a reader to give up while the rescue was on screen.
    //
    // Also added: do not share it. The phrase IS the key — `masterKey`
    // serialized — so whoever holds it can open the diary. The tour asked
    // people to store something that powerful without ever saying so.
    title: "Tus Reflexiones",
    body:
      "Un espacio privado para escribir cómo te sientes. Se cifra en tu " +
      "dispositivo antes de salir, así que nosotros no podemos leerlo.",
    learnMore: {
      title: "¿Cómo funciona la privacidad?",
      analogy:
        "Piensa en tus reflexiones como una caja fuerte con una llave " +
        "única — tú eres quien la tiene.",
      points: [
        "🔑 Tu llave se crea con tu contraseña y nunca sale de tu dispositivo.",
        "👀 En nuestros servidores solo queda texto cifrado.",
        "📝 La primera vez que abres tus reflexiones te mostramos una frase de 12 palabras. Guárdala en un lugar seguro y no la compartas con nadie: quien la tenga puede abrir tus reflexiones.",
        "🔁 No es tu única oportunidad de verla: puedes volver a consultarla en Ajustes → Seguridad, mientras tengas tus reflexiones desbloqueadas en ese momento.",
        "⚠️ Recuperar la cuenta y recuperar lo escrito no son lo mismo. Restablecer tu contraseña recupera el acceso a tu cuenta, pero no descifra por sí solo tus reflexiones anteriores. Si aún las tienes desbloqueadas, guarda tu frase desde Ajustes → Seguridad.",
        "🔒 Sin la contraseña que permite abrirlas, sin la frase de recuperación y sin una sesión que las conserve desbloqueadas, no podremos recuperar ese contenido.",
      ],
    },
  },
  {
    order: 4,
    target: "eco",
    // The old text said Eco was "igual de privado que tu diario — solo tú
    // las lees". It is not, and the service says so plainly: the message
    // arrives in plaintext, is checked for crisis signals, goes to the
    // embeddings service and to the conversational provider, and the reply
    // is stored unencrypted. Equating it with the diary was the single most
    // misleading line in this tour.
    //
    // "Entrenada" is gone too — it suggests training of our own that we
    // cannot evidence — and so is "inmediatas" next to professional help.
    title: "Eco",
    body:
      "Un compañero de conversación para pensar en voz alta y poner " +
      "palabras a lo que sientes. Funciona con inteligencia artificial.",
    learnMore: {
      title: "¿Qué es exactamente Eco?",
      points: [
        "🌿 Es una IA conversacional: responde con calma y no te juzga.",
        "🔒 Para responderte, Eco procesa lo que escribes mediante servicios de inteligencia artificial. Tu mensaje se guarda cifrado; su respuesta, no. No es lo mismo que tus reflexiones.",
        "🩺 Si aparecen señales de crisis, te muestra líneas de ayuda. No detecta todos los casos y no sustituye a una urgencia.",
        "🙋 Complementa el trabajo con un terapeuta — no lo reemplaza.",
      ],
    },
  },
  {
    order: 5,
    target: "patrones",
    // Two different sections were being described as one. «Patrones IA» and
    // «Mapa Emocional» are separate places in the navigation and answer
    // different questions; the tour used to hand the map's description to
    // the patterns step. The seven entries are now stated as the code
    // counts them: seven reflections within the same week, which is what
    // the weekly summary needs.
    title: "Patrones",
    body:
      "Cuando lleves unas cuantas reflexiones, aquí verás qué se repite: " +
      "emociones, momentos del día y temas. Tu Mapa Emocional es una " +
      "sección aparte.",
    learnMore: {
      title: "¿Qué son los patrones?",
      points: [
        "🏷️ Etiquetas que se repiten en tus reflexiones (por ejemplo: trabajo, familia, descanso).",
        "🕑 A qué horas sueles escribir y cómo te sientes en cada franja.",
        "📈 El resumen de la semana necesita unas 7 reflexiones dentro de esos siete días.",
        "✨ Es una función Pro — desde aquí siempre ves una vista previa.",
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
