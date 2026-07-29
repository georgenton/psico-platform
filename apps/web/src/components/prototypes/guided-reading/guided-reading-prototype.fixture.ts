/**
 * Guided Reading V1 — fixture editorial del prototipo visual (GR-1).
 *
 * Autoridad de producto: docs/product/guided-reading-v1.md (spec 0.4).
 *
 * Este archivo es COPY + datos de demostración. No es dominio, no es contrato
 * y no describe el runtime. Todo lo que aparece aquí es local: el prototipo no
 * llama al API Guide, no crea `GuideSession`, no persiste nada y no escribe en
 * el Mapa Emocional.
 *
 * El texto del lector es una paráfrasis editorial breve escrita para la
 * revisión visual. No es el capítulo publicado.
 */

/* ── Banderas declaradas por GR-1 ─────────────────────────────────────── */

/** El anchor del pasaje es un elemento DOM local, no un bloque real. */
export const PROTOTYPE_ANCHOR_KIND = "VISUAL_PLACEHOLDER" as const;
/** No se inventa un `anchorBlockKey`: la decisión editorial sigue pendiente. */
export const PROTOTYPE_ANCHOR_BLOCK_KEY: string | null = null;
export const RUNTIME_ANCHOR_APPROVED = false;
export const RUNTIME_ANCHOR_USED = false;
export const ANCHOR_VISUAL_PROTOTYPE_PASS = true;

/** El prototipo NUNCA califica la respuesta del recall. */
export const PROTOTYPE_CLIENT_GRADING = false;
/** El cierre solo cambia estado local; no crea `Resonance`. */
export const PROTOTYPE_RESONANCE_WRITE = false;
export const EMOTIONAL_MAP_WRITE = false;
/** El prototipo tampoco escribe en Mi Evolucion ni registra un check-in. */
export const PROTOTYPE_EVOLUTION_WRITE = false;
export const PROTOTYPE_CHECKIN_WRITE = false;

/**
 * La practica no se puede dar por terminada sin una ruta explicita: terminar la
 * pausa, terminarla antes, o elegir continuar sin temporizador.
 */
export const PRACTICE_EXPLICIT_ROUTE_REQUIRED = true;

/** El progreso por checkpoint es del servidor; aquí está simulado. */
export const CHECKPOINT_PROGRESS_AUTHORITY =
  "SIMULATED_SERVER_FIXTURE" as const;
/** La escena dentro del checkpoint es presentación, no dominio. */
export const SCENE_PROGRESS_AUTHORITY = "PRESENTATION" as const;

export const DESIGN_REFERENCE_USE = "inspiration_only" as const;
export const REFERENCE_CLONE = false;
export const EXPERIENCE_TONE = "ACCOMPANIED_NOT_ADMINISTRATIVE" as const;

/* ── Contexto editorial ───────────────────────────────────────────────── */

/**
 * Politica de datos (spec 0.5): la actividad va a Mi Evolucion; el Mapa
 * Emocional solo recibe lo que la persona decide expresar. El prototipo
 * anuncia el destino pero no escribe nada.
 */
export const EVOLUTION_NOTE = "Esta experiencia se registrará en Mi Evolución.";

export const CHAPTER = {
  bookTitle: "Emociones en construcción",
  partLabel: "Parte I · Deconstruyendo lo que sabíamos",
  chapterNumber: 1,
  chapterTitle: "¿Realmente sabemos qué es una emoción?",
  guidedReadingTitle: "El cuerpo sabe antes que la mente",
} as const;

export type PrototypeMode = "read" | "listen" | "watch" | "guide";

export const MODE_OPTIONS: readonly {
  mode: PrototypeMode;
  label: string;
  /** Etiqueta de la tira compacta: `Leer · Escuchar · Ver · Guía`. */
  shortLabel: string;
  hint: string;
  icon: string;
}[] = [
  {
    mode: "read",
    label: "Leer",
    shortLabel: "Leer",
    hint: "El capítulo completo, a tu ritmo",
    icon: "📖",
  },
  {
    mode: "listen",
    label: "Escuchar",
    shortLabel: "Escuchar",
    hint: "Audiolibro o podcast",
    icon: "🎧",
  },
  {
    mode: "watch",
    label: "Ver",
    shortLabel: "Ver",
    hint: "Videoexplicación del capítulo",
    icon: "🎬",
  },
  {
    mode: "guide",
    label: "Lectura guiada",
    shortLabel: "Guía",
    hint: "8–10 minutos acompañados",
    icon: "🌿",
  },
];

/* ── Lector — texto de demostración ───────────────────────────────────── */

export type ReaderBlockKind = "heading" | "paragraph" | "quote";

export interface ReaderBlock {
  /** Identificador local del prototipo. No es un `blockKey` de Content Core. */
  readonly id: string;
  readonly kind: ReaderBlockKind;
  readonly text: string;
  /** Destino visual de «Ir al pasaje». */
  readonly anchor?: boolean;
  /** Marca de lectura simulada (subrayado editorial de demostración). */
  readonly marked?: boolean;
}

export const READER_BLOCKS: readonly ReaderBlock[] = [
  {
    id: "demo-h1",
    kind: "heading",
    text: "Una reacción que llega antes que la palabra",
  },
  {
    id: "demo-p1",
    kind: "paragraph",
    text: "Solemos pensar que primero entendemos lo que nos pasa y después el cuerpo responde. La secuencia cotidiana suele ser la contraria: algo cambia en la respiración, en los hombros o en el estómago mientras todavía buscamos la palabra.",
  },
  {
    id: "demo-p2",
    kind: "paragraph",
    text: "Esa diferencia de tiempo es pequeña, casi imperceptible, y sin embargo explica buena parte de lo que llamamos «reaccionar sin querer».",
    marked: true,
  },
  {
    id: "demo-anchor",
    kind: "quote",
    text: "El cuerpo puede iniciar una respuesta antes de que la mente alcance a identificar, interpretar o nombrar conscientemente lo que ocurre.",
    anchor: true,
  },
  {
    id: "demo-p3",
    kind: "paragraph",
    text: "Esto no significa que el cuerpo «piense» ni que sepa algo que nosotros ignoramos. Significa que algunos cambios corporales pueden comenzar antes de que podamos reconocerlos y ponerles nombre.",
  },
  {
    id: "demo-p4",
    kind: "paragraph",
    text: "Tampoco existe una única firma corporal universal: la misma señal puede acompañar experiencias distintas según el contexto, la historia y el momento de cada persona.",
  },
  {
    id: "demo-p5",
    kind: "paragraph",
    text: "Por eso este capítulo propone observar antes que clasificar. Notar la señal, darle tiempo, y nombrarla solo cuando el nombre aparezca por sí solo.",
  },
];

/** Texto que deja explícito que el lector muestra una demostración. */
export const READER_DEMO_NOTE =
  "Texto de demostración para revisión de diseño. No es el capítulo publicado.";

/* ── Escuchar ─────────────────────────────────────────────────────────── */

export type ListenTrack = "audiobook" | "podcast";

export const AUDIOBOOK = {
  title: "Capítulo 1 · ¿Realmente sabemos qué es una emoción?",
  subtitle: "Narración fiel del capítulo",
  totalLabel: "18:40",
  totalSeconds: 1120,
  startSeconds: 264,
  speeds: [0.75, 1, 1.25, 1.5] as const,
  marks: [
    { label: "Apertura", at: "00:00" },
    { label: "La secuencia corporal", at: "04:12" },
    { label: "Contexto y experiencia", at: "09:30" },
    { label: "Cierre del capítulo", at: "15:05" },
  ],
} as const;

export const PODCAST = {
  title: "Antes de ponerle un nombre",
  format: "Jorge solo · guion conversacional",
  targetLabel: "8–12 min (objetivo editorial)",
  totalLabel: "10:24",
  totalSeconds: 624,
  startSeconds: 0,
  speeds: [0.75, 1, 1.25, 1.5] as const,
  /** Notas del episodio — estructura aprobada en §8 del blueprint. */
  showNotes: [
    "Pregunta inicial: ¿qué ocurre antes de que pensemos?",
    "Ejemplo cotidiano: un ruido inesperado detrás de ti",
    "Explicación: el cuerpo inicia una respuesta",
    "Matiz importante: no hay una firma corporal universal",
    "Aplicación: qué observar en ti sin diagnosticarte",
    "Cierre: nombrar no es lo mismo que reaccionar",
  ],
} as const;

/* ── Ver ──────────────────────────────────────────────────────────────── */

export const VIDEO = {
  title: "¿Realmente sabemos qué es una emoción?",
  subtitle: "Videoexplicación del capítulo",
  targetLabel: "7–9 min (objetivo editorial)",
  totalLabel: "08:12",
  posterCaption: "Jorge en cámara + apoyo visual",
  audioOnlyCaption: "Solo audio · sin imagen",
  subtitleLine:
    "…el cuerpo puede iniciar una respuesta antes de que la nombremos.",
  chapters: [
    { at: "00:00", title: "¿Qué ocurre antes de que pensemos?" },
    { at: "00:50", title: "El cuerpo inicia una respuesta" },
    { at: "02:10", title: "Nombrar no es lo mismo que reaccionar" },
    { at: "03:30", title: "Por qué no existe una firma corporal universal" },
    { at: "05:00", title: "El papel del contexto y la experiencia" },
    { at: "06:30", title: "Qué observar en ti sin diagnosticarte" },
    { at: "07:30", title: "Idea de cierre" },
  ],
  transcript: [
    "Imagina que escuchas un ruido inesperado detrás de ti.",
    "Tu cuerpo puede tensarse, cambiar la respiración o prepararse para moverse antes de que conscientemente comprendas lo ocurrido.",
    "Esa diferencia de tiempo ayuda a entender una de las ideas centrales del capítulo: una respuesta corporal puede comenzar antes de que podamos reconocerla y nombrarla.",
  ],
} as const;

/* ── Lectura guiada — ocho escenas ────────────────────────────────────── */

export type GuideSceneIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const GUIDE_SCENE_COUNT = 8;

/** Checkpoints server-owned. En el prototipo están simulados. */
export type GuideCheckpointKey = "concepto" | "practica" | "recordar";

export const GUIDE_CHECKPOINTS: readonly {
  key: GuideCheckpointKey;
  label: string;
  /** Escenas de presentación que viven dentro del checkpoint. */
  scenes: readonly GuideSceneIndex[];
}[] = [
  { key: "concepto", label: "Concepto", scenes: [1, 2, 3] },
  { key: "practica", label: "Práctica", scenes: [4] },
  { key: "recordar", label: "Recordar", scenes: [5, 6] },
];

export const GUIDE_COVER = {
  eyebrow: "LECTURA GUIADA",
  title: "El cuerpo sabe antes que la mente",
  description:
    "Explora por qué una reacción emocional puede comenzar antes de que logremos ponerle un nombre.",
  durationLabel: "8–10 minutos",
  pieces: ["video breve", "pasaje del libro", "práctica", "pregunta"],
  cta: "Empezar",
} as const;

export const GUIDE_CLIP = {
  title: "Antes de ponerle un nombre",
  durationLabel: "60–90 segundos",
  audioOnlyLabel: "Escuchar solo audio",
  backToVideoLabel: "Volver al video",
  audioOnlyCaption: "Solo audio · sin imagen",
  transcript: [
    "Imagina que escuchas un ruido inesperado detrás de ti. Tu cuerpo puede tensarse, cambiar la respiración o prepararse para moverse antes de que conscientemente comprendas lo ocurrido.",
    "Esa diferencia de tiempo ayuda a entender una de las ideas centrales del capítulo: una respuesta corporal puede comenzar antes de que podamos reconocerla y nombrarla.",
  ],
} as const;

export const GUIDE_ANCHOR_SCENE = {
  title: "Ahora míralo en el libro",
  description:
    "Este pasaje presenta la secuencia entre la reacción corporal y la comprensión consciente.",
  cta: "Ir al pasaje",
  explanation:
    "La idea no es que el cuerpo «piense» o comprenda intelectualmente. La propuesta es que algunos cambios corporales pueden comenzar antes de que podamos reconocerlos y nombrarlos conscientemente.",
  checkpointCta: "He explorado esta idea",
  locatedLabel: "Pasaje localizado ✓",
  continueCta: "Continuar",
} as const;

export const GUIDE_PRACTICE = {
  title: "Escucharte por dentro",
  intro:
    "No necesitas encontrar una emoción concreta ni ponerle un nombre perfecto.",
  steps: [
    "Haz una pausa.",
    "Observa una señal corporal presente.",
    "Nota si cambia cuando le prestas atención.",
    "Nómbrala solo si te resulta natural.",
  ],
  timerSeconds: 45,
  startTimerCta: "Comenzar pausa de 45 segundos",
  skipTimerCta: "Continuar sin temporizador",
  finishEarlyCta: "Terminar la pausa ahora",
  privacyNote: "La aplicación no guarda lo que observaste.",
  checkpointCta: "Terminé la práctica",
} as const;

/**
 * Recall — ítem editorial existente.
 *
 * Se muestran las tres opciones públicas. El prototipo NO conoce ni almacena
 * `correctOptionKey`: el feedback llega del fixture, nunca de la selección.
 */
export const RECALL_ITEM_KEY = "eec-c1-recall-cuerpo-antes-que-mente";

export const GUIDE_RECALL = {
  itemKey: RECALL_ITEM_KEY,
  question:
    "Según el capítulo, ¿cómo describe el libro la relación entre el cuerpo y la comprensión consciente?",
  options: [
    {
      optionKey: "opcion-cuerpo-primero",
      text: "El cuerpo puede reaccionar antes de que la mente alcance a identificar o nombrar lo que está sintiendo.",
    },
    {
      optionKey: "opcion-mente-primero",
      text: "La mente identifica primero la emoción y solamente después el cuerpo comienza a reaccionar.",
    },
    {
      optionKey: "opcion-simultanea",
      text: "El cuerpo y la mente siempre reaccionan de manera simultánea, consciente y perfectamente coordinada.",
    },
  ],
  cta: "Responder",
  note: "La revisión de la respuesta ocurre en el servidor. Este prototipo no la evalúa.",
} as const;

export type PrototypeOutcome = "correct" | "review";

export const GUIDE_FEEDBACK: Record<
  PrototypeOutcome,
  { badge: string; title: string; body: string }
> = {
  correct: {
    badge: "CORRECTO",
    title: "Esta opción coincide con la idea central del capítulo.",
    body: "El cuerpo puede iniciar una respuesta antes de que logremos reconocer conscientemente la emoción.",
  },
  review: {
    badge: "REVISEMOS",
    title: "Miremos nuevamente la secuencia.",
    body: "El capítulo propone que la reacción corporal puede comenzar antes de que la mente logre identificar o nombrar lo que ocurre.",
  },
};

export const GUIDE_COMPLETION = {
  eyebrow: "COMPLETASTE ESTA LECTURA GUIADA",
  intro: "Hoy exploraste:",
  achievements: [
    "La relación entre reacción corporal y consciencia",
    "Una práctica breve de observación",
    "Una pregunta para consolidar la idea",
  ],
  actions: ["Continuar leyendo", "Volver al pasaje", "Repetir la guía"],
  resonanceQuestion: "¿Esta idea fue personalmente significativa para ti?",
  resonanceYes: "Esto me resonó",
  checkinCta: "Registrar cómo me siento",
  resonanceNo: "Ahora no",
  resonanceConfirmed:
    "En el prototipo esto solo cambia el estado local. No se guarda ninguna resonancia.",
  checkinConfirmed:
    "En el prototipo esto solo cambia el estado local. No se registra ningún check-in.",
  evolutionNote: EVOLUTION_NOTE,
} as const;

/* ── Parámetros deterministas para capturas ───────────────────────────── */

export interface PrototypeInitialState {
  readonly mode: PrototypeMode;
  readonly scene: GuideSceneIndex;
  readonly outcome: PrototypeOutcome;
}

const MODES: readonly PrototypeMode[] = ["read", "listen", "watch", "guide"];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Traduce los query params permitidos a estado inicial.
 *
 * Solo existen para producir capturas deterministas durante la revisión.
 * No son un contrato productivo: cualquier valor inválido cae en el default
 * seguro (`mode=read`, escena 0, `outcome=correct`).
 */
export function resolvePrototypeParams(
  searchParams: Record<string, string | string[] | undefined>,
): PrototypeInitialState {
  const rawMode = first(searchParams.mode);
  const mode: PrototypeMode = MODES.includes(rawMode as PrototypeMode)
    ? (rawMode as PrototypeMode)
    : "read";

  let scene: GuideSceneIndex = 0;
  if (mode === "guide") {
    const parsed = Number.parseInt(first(searchParams.scene) ?? "", 10);
    scene =
      Number.isInteger(parsed) && parsed >= 1 && parsed <= 7
        ? (parsed as GuideSceneIndex)
        : 1;
  }

  const rawOutcome = first(searchParams.outcome);
  const outcome: PrototypeOutcome =
    rawOutcome === "review" ? "review" : "correct";

  return { mode, scene, outcome };
}

/**
 * Etiqueta «Concepto · parte 2 de 3» para la escena activa.
 *
 * El feedback es un momento distinto dentro del checkpoint `Recordar`: se
 * rotula como tal porque el checkpoint todavía NO está cerrado — solo el cierre
 * lo marca como completado.
 */
export function scenePartLabel(scene: GuideSceneIndex): string | null {
  if (scene === 6) return "Recordar · feedback";
  for (const checkpoint of GUIDE_CHECKPOINTS) {
    const index = checkpoint.scenes.indexOf(scene);
    if (index >= 0) {
      return `${checkpoint.label} · parte ${index + 1} de ${checkpoint.scenes.length}`;
    }
  }
  return null;
}

/** Checkpoint simulado al que pertenece la escena de presentación. */
export function checkpointForScene(
  scene: GuideSceneIndex,
): GuideCheckpointKey | null {
  for (const checkpoint of GUIDE_CHECKPOINTS) {
    if (checkpoint.scenes.includes(scene)) return checkpoint.key;
  }
  return null;
}
