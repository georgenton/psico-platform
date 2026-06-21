import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  LEGACY_MOOD_IDS_TO_DEACTIVATE,
  MOOD_SEED_CATALOG,
  MOTIVO_SEED_CATALOG,
} from "../src/onboarding/constants";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...\n");

  // ─── Book Categories (S5) ────────────────────────────────────────────────

  const categories = [
    { id: "cat-ansiedad", slug: "ansiedad", label: "Ansiedad", order: 1 },
    { id: "cat-vinculos", slug: "vinculos", label: "Vínculos", order: 2 },
    { id: "cat-duelo", slug: "duelo", label: "Duelo", order: 3 },
    { id: "cat-familia", slug: "familia", label: "Familia", order: 4 },
    { id: "cat-emociones", slug: "emociones", label: "Emociones", order: 5 },
    { id: "cat-autoestima", slug: "autoestima", label: "Autoestima", order: 6 },
    { id: "cat-trabajo", slug: "trabajo", label: "Trabajo", order: 7 },
  ];
  for (const c of categories) {
    await prisma.bookCategory.upsert({
      where: { id: c.id },
      create: { ...c, isActive: true },
      update: { label: c.label, order: c.order, isActive: true },
    });
  }
  console.log(`✅  BookCategory catalog: ${categories.length} entries`);

  // ─── Book Authors (S5) ───────────────────────────────────────────────────

  const marina = await prisma.bookAuthor.upsert({
    where: { slug: "marina-quintana" },
    create: {
      slug: "marina-quintana",
      name: "Marina Quintana",
      title: "Dra. en Psicología Clínica",
      bio: "Especialista en psicoeducación y familias ensambladas. Autora ancla de la plataforma.",
      cover: "warm",
      licenseNumber: "EC-PSI-2018-001",
      isVerified: true,
    },
    update: {
      name: "Marina Quintana",
      title: "Dra. en Psicología Clínica",
      bio: "Especialista en psicoeducación y familias ensambladas. Autora ancla de la plataforma.",
      cover: "warm",
      isVerified: true,
    },
  });
  console.log(`✅  BookAuthor: ${marina.name}`);

  // ─── Book 1: FREE — Emociones en Construcción ─────────────────────────────

  const book1 = await prisma.book.upsert({
    where: { slug: "emociones-en-construccion" },
    create: {
      slug: "emociones-en-construccion",
      title: "Emociones en Construcción",
      subtitle: "Una guía práctica desde adentro",
      description:
        "Una guía práctica para entender, nombrar y gestionar tus emociones desde adentro.",
      summary:
        "Marina Quintana acompaña al lector en un recorrido por las seis emociones básicas, con ejercicios cortos al final de cada capítulo.",
      cover: "warm",
      pages: 96,
      durationMinutes: 20,
      language: "es",
      plan: "FREE",
      isPublished: true,
      totalChapters: 2,
      authorId: marina.id,
      categoryId: "cat-emociones",
      publishedAt: new Date("2026-01-15"),
    },
    update: {
      title: "Emociones en Construcción",
      subtitle: "Una guía práctica desde adentro",
      cover: "warm",
      durationMinutes: 20,
      pages: 96,
      isPublished: true,
      totalChapters: 2,
      authorId: marina.id,
      categoryId: "cat-emociones",
    },
  });

  await prisma.chapter.upsert({
    where: { bookId_order: { bookId: book1.id, order: 1 } },
    create: {
      bookId: book1.id,
      order: 1,
      title: "Introducción: Entendiendo tus Emociones",
      description:
        "¿Qué son las emociones y por qué las sentimos? El origen y la función de las emociones en la vida cotidiana.",
      durationMinutes: 8,
      isPublished: true,
    },
    update: {
      title: "Introducción: Entendiendo tus Emociones",
      isPublished: true,
    },
  });

  await prisma.chapter.upsert({
    where: { bookId_order: { bookId: book1.id, order: 2 } },
    create: {
      bookId: book1.id,
      order: 2,
      title: "Las Emociones Básicas y su Función",
      description:
        "Alegría, tristeza, miedo, ira, sorpresa y asco: las seis emociones universales y cómo cada una cuida nuestro bienestar.",
      durationMinutes: 12,
      isPublished: true,
    },
    update: {
      title: "Las Emociones Básicas y su Función",
      isPublished: true,
    },
  });

  console.log(`✅  FREE  "${book1.title}"  slug: ${book1.slug}  (2 capítulos)`);

  // ─── Book 2: PRO — Familias Ensambladas ───────────────────────────────────

  const book2 = await prisma.book.upsert({
    where: { slug: "familias-ensambladas" },
    create: {
      slug: "familias-ensambladas",
      title: "Familias Ensambladas",
      subtitle: "Herramientas para construir vínculos",
      description:
        "Herramientas psicoeducativas para construir vínculos sanos en familias reconstituidas.",
      summary:
        "Tres capítulos prácticos sobre cómo se redefinen los roles cuando dos familias se unen. Incluye ejercicios para padres e hijos.",
      cover: "cool",
      pages: 140,
      durationMinutes: 43,
      language: "es",
      plan: "PRO",
      isPublished: true,
      totalChapters: 3,
      authorId: marina.id,
      categoryId: "cat-familia",
      publishedAt: new Date("2026-02-01"),
    },
    update: {
      title: "Familias Ensambladas",
      subtitle: "Herramientas para construir vínculos",
      cover: "cool",
      pages: 140,
      durationMinutes: 43,
      isPublished: true,
      totalChapters: 3,
      authorId: marina.id,
      categoryId: "cat-familia",
    },
  });

  await prisma.chapter.upsert({
    where: { bookId_order: { bookId: book2.id, order: 1 } },
    create: {
      bookId: book2.id,
      order: 1,
      title: "¿Qué es una Familia Ensamblada?",
      description:
        "Definición, tipos y estadísticas: comprendiendo la nueva realidad familiar en Ecuador y LATAM.",
      durationMinutes: 10,
      isPublished: true,
    },
    update: {
      title: "¿Qué es una Familia Ensamblada?",
      isPublished: true,
    },
  });

  await prisma.chapter.upsert({
    where: { bookId_order: { bookId: book2.id, order: 2 } },
    create: {
      bookId: book2.id,
      order: 2,
      title: "Roles y Vínculos en la Nueva Familia",
      description:
        "Cómo se redefinen los roles parentales, filiales y fraternales cuando dos familias se unen.",
      durationMinutes: 15,
      isPublished: true,
    },
    update: {
      title: "Roles y Vínculos en la Nueva Familia",
      isPublished: true,
    },
  });

  await prisma.chapter.upsert({
    where: { bookId_order: { bookId: book2.id, order: 3 } },
    create: {
      bookId: book2.id,
      order: 3,
      title: "Comunicación y Manejo de Conflictos",
      description:
        "Estrategias concretas para resolver tensiones y fortalecer la comunicación dentro de la familia ensamblada.",
      durationMinutes: 18,
      isPublished: true,
    },
    update: {
      title: "Comunicación y Manejo de Conflictos",
      isPublished: true,
    },
  });

  console.log(`✅  PRO   "${book2.title}"  slug: ${book2.slug}  (3 capítulos)`);

  // ─── Onboarding catalogs (Sprint S4) ─────────────────────────────────────
  //
  // Idempotent: each row upserted by stable id. Editing copy is a SQL UPDATE
  // (or re-run seed). Disabling a row → set isActive=false; old user picks
  // remain referencable but the row no longer shows up in /motivos /moods.

  console.log("\n🧭 Onboarding catalogs…");

  // Single source of truth: apps/api/src/onboarding/constants.ts.
  // The alignment test enforces that every motivo has a RECOMMENDATION_BY_MOTIVO
  // entry pointing to a known anchor book.
  const motivos = MOTIVO_SEED_CATALOG;
  for (const m of motivos) {
    await prisma.onboardingMotivo.upsert({
      where: { id: m.id },
      create: { ...m, isActive: true },
      update: { label: m.label, icon: m.icon, order: m.order, isActive: true },
    });
  }
  console.log(`✅  Motivos catalog: ${motivos.length} entries`);

  // Single source of truth: apps/api/src/onboarding/constants.ts.
  // The alignment test enforces parity with DIARY_MOODS in @psico/types.
  const moods = MOOD_SEED_CATALOG;
  for (const mo of moods) {
    await prisma.onboardingMood.upsert({
      where: { id: mo.id },
      create: { ...mo, isActive: true },
      update: {
        label: mo.label,
        swatch: mo.swatch,
        order: mo.order,
        isActive: true,
      },
    });
  }
  // Sprint B6b: soft-disable the pre-B6b emotion IDs (calma/foco/…) so
  // they stop appearing in the onboarding picker. We don't delete the rows
  // because `OnboardingState.initialMoodId` keeps a FK-like reference for
  // analytics on cohorts who answered with the old vocabulary.
  const deactivated = await prisma.onboardingMood.updateMany({
    where: { id: { in: [...LEGACY_MOOD_IDS_TO_DEACTIVATE] } },
    data: { isActive: false },
  });
  console.log(
    `✅  Moods catalog:   ${moods.length} active · ${deactivated.count} legacy soft-disabled`,
  );

  // ─── Reflection prompts (S5) ─────────────────────────────────────────────
  //
  // 7 prompts rotated by the Home service. Curated content team can add/edit
  // these directly in the DB; isActive=false soft-disables a prompt.

  console.log("\n💭 Reflection prompts…");
  const prompts = [
    { id: "rp-1", text: "¿Qué emoción te visitó hoy con más fuerza?" },
    {
      id: "rp-2",
      text: "Si pudieras agradecer una cosa pequeña, ¿cuál sería?",
    },
    { id: "rp-3", text: "¿Qué necesita tu cuerpo en este momento?" },
    { id: "rp-4", text: "¿Hay un pensamiento que se está repitiendo?" },
    { id: "rp-5", text: "¿Qué te dirías a ti mismo si fueras tu mejor amigo?" },
    { id: "rp-6", text: "Una palabra para describir este día." },
    { id: "rp-7", text: "¿Qué te gustaría soltar antes de dormir?" },
  ];
  for (const p of prompts) {
    await prisma.reflectionPrompt.upsert({
      where: { id: p.id },
      create: { ...p, audience: "all", isActive: true },
      update: { text: p.text, isActive: true },
    });
  }
  console.log(`✅  ReflectionPrompt catalog: ${prompts.length} entries`);

  // ─── Diary prompts (S6) ──────────────────────────────────────────────────
  //
  // Curated by the content team. Rotated daily by DiarioService via a
  // day-of-year hash — same prompt all day across all users.

  console.log("\n📓 Diary prompts…");
  const diaryPrompts = [
    {
      id: "dp-1",
      text: "Describe un momento de hoy donde te sentiste presente.",
    },
    {
      id: "dp-2",
      text: "¿Qué emoción dominó tu día? ¿De dónde crees que vino?",
    },
    {
      id: "dp-3",
      text: "Si pudieras volver a vivir un instante del día, ¿cuál sería?",
    },
    {
      id: "dp-4",
      text: "¿Hubo algo que te costó decir hoy? Ponlo en palabras aquí.",
    },
    { id: "dp-5", text: "Hoy aprendí…" },
    { id: "dp-6", text: "Una conversación que me quedó dando vueltas." },
    { id: "dp-7", text: "¿Cómo cuidaste de ti hoy, aunque sea un poco?" },
  ];
  for (const p of diaryPrompts) {
    await prisma.diaryPrompt.upsert({
      where: { id: p.id },
      create: { ...p, audience: "all", isActive: true },
      update: { text: p.text, isActive: true },
    });
  }
  console.log(`✅  DiaryPrompt catalog: ${diaryPrompts.length} entries`);

  // ─── Achievement catalog (Sprint E2) ─────────────────────────────────────
  //
  // 12 curated achievements wired to the EvolucionService auto-unlock loop.
  // Source of truth: apps/api/src/evolucion/achievement-catalog.ts. Adding
  // an entry there + re-running this seed is enough — the service picks it
  // up on the next /api/evolucion request and computes progress for every
  // user.
  const { ACHIEVEMENT_CATALOG } =
    await import("../src/evolucion/achievement-catalog");
  for (const a of ACHIEVEMENT_CATALOG) {
    await prisma.achievement.upsert({
      where: { id: a.id },
      create: {
        id: a.id,
        label: a.label,
        description: a.description,
        icon: a.icon,
        progressTarget: a.progressTarget,
        category: a.category,
      },
      update: {
        label: a.label,
        description: a.description,
        icon: a.icon,
        progressTarget: a.progressTarget,
        category: a.category,
      },
    });
  }
  console.log(`✅  Achievement catalog: ${ACHIEVEMENT_CATALOG.length} entries`);

  // ─── Lector · ChapterBlocks (Sprint S6) ──────────────────────────────────
  //
  // Six representative blocks per chapter so the reader has real content
  // from day one. Idempotent: re-running the seed updates existing blocks
  // by (chapterId, order) instead of inserting duplicates.
  //
  // The IDs are deterministic (cb-<bookSlug>-<chapterOrder>-<blockOrder>)
  // so tests can rely on them without round-tripping.

  console.log("\n📖 Lector · ChapterBlocks…");

  const chapterBlocks: Array<{
    id: string;
    chapterBookId: string;
    chapterOrder: number;
    order: number;
    kind:
      | "HEADING"
      | "PARAGRAPH"
      | "QUOTE"
      | "EXERCISE"
      | "AUDIO"
      | "IMAGE"
      | "PAUSE";
    content: string;
    meta?: Record<string, unknown>;
  }> = [
    // ── Emociones en Construcción · cap 1 ────────────────────────────────
    {
      id: "cb-emo-1-1",
      chapterBookId: book1.id,
      chapterOrder: 1,
      order: 1,
      kind: "HEADING",
      content: "¿Qué son las emociones?",
    },
    {
      id: "cb-emo-1-2",
      chapterBookId: book1.id,
      chapterOrder: 1,
      order: 2,
      kind: "PARAGRAPH",
      content:
        "Las emociones son respuestas adaptativas que evolucionaron para ayudarnos a sobrevivir. Antes de ser palabras, son sensaciones del cuerpo: una opresión en el pecho, un calor en la cara, un nudo en la garganta. Reconocerlas empieza por escucharlas.",
    },
    {
      id: "cb-emo-1-3",
      chapterBookId: book1.id,
      chapterOrder: 1,
      order: 3,
      kind: "QUOTE",
      content:
        "No hay emociones buenas o malas. Hay emociones útiles que, mal interpretadas, terminan haciéndonos daño.",
    },
    {
      id: "cb-emo-1-4",
      chapterBookId: book1.id,
      chapterOrder: 1,
      order: 4,
      kind: "PARAGRAPH",
      content:
        "Cada emoción cumple una función. El miedo nos prepara para protegernos. La tristeza nos invita a hacer una pausa. La ira nos avisa que algo importante está en riesgo. Aprender a leerlas es aprender a entendernos.",
    },
    {
      id: "cb-emo-1-5",
      chapterBookId: book1.id,
      chapterOrder: 1,
      order: 5,
      kind: "PAUSE",
      content:
        "Respira tres veces. Identifica una emoción que sentiste en las últimas 24 horas.",
    },
    {
      id: "cb-emo-1-6",
      chapterBookId: book1.id,
      chapterOrder: 1,
      order: 6,
      kind: "PARAGRAPH",
      content:
        "Este libro te acompañará a construir una relación más amable con tus emociones. No para controlarlas, sino para escucharlas con menos miedo y más curiosidad.",
    },

    // ── Emociones en Construcción · cap 2 ────────────────────────────────
    {
      id: "cb-emo-2-1",
      chapterBookId: book1.id,
      chapterOrder: 2,
      order: 1,
      kind: "HEADING",
      content: "Las seis emociones básicas",
    },
    {
      id: "cb-emo-2-2",
      chapterBookId: book1.id,
      chapterOrder: 2,
      order: 2,
      kind: "PARAGRAPH",
      content:
        "Paul Ekman identificó seis emociones universales: alegría, tristeza, miedo, ira, sorpresa y asco. Las reconocemos en rostros de cualquier cultura porque son parte del software emocional humano.",
    },
    {
      id: "cb-emo-2-3",
      chapterBookId: book1.id,
      chapterOrder: 2,
      order: 3,
      kind: "PARAGRAPH",
      content:
        "Cada una nos protege de algo distinto. El miedo, del peligro físico. La tristeza, de la pérdida. La ira, del abuso. La alegría refuerza vínculos. La sorpresa nos hace prestar atención. El asco, evitar lo que enferma.",
    },
    {
      id: "cb-emo-2-4",
      chapterBookId: book1.id,
      chapterOrder: 2,
      order: 4,
      kind: "QUOTE",
      content:
        "Si la emoción no se nombra, el cuerpo la grita. Si la nombras, empiezas a poder elegir qué hacer con ella.",
    },
    {
      id: "cb-emo-2-5",
      chapterBookId: book1.id,
      chapterOrder: 2,
      order: 5,
      kind: "PARAGRAPH",
      content:
        "Las emociones secundarias (vergüenza, culpa, orgullo, envidia) se construyen sobre las básicas y suman una capa social: aparecen cuando hay otro. Por eso a veces son tan difíciles de soltar.",
    },
    {
      id: "cb-emo-2-6",
      chapterBookId: book1.id,
      chapterOrder: 2,
      order: 6,
      kind: "EXERCISE",
      content: "Mapa de emociones del día",
      meta: { kind: "JOURNALING", durationMinutes: 5 },
    },

    // ── Familias Ensambladas · cap 1 ─────────────────────────────────────
    {
      id: "cb-fam-1-1",
      chapterBookId: book2.id,
      chapterOrder: 1,
      order: 1,
      kind: "HEADING",
      content: "Lo que llamamos familia",
    },
    {
      id: "cb-fam-1-2",
      chapterBookId: book2.id,
      chapterOrder: 1,
      order: 2,
      kind: "PARAGRAPH",
      content:
        "Las familias ensambladas son las que se forman cuando dos personas se eligen y ya traen historias previas: hijos, parejas que no son, casas vendidas, costumbres heredadas. No son rotas. Son nuevas.",
    },
    {
      id: "cb-fam-1-3",
      chapterBookId: book2.id,
      chapterOrder: 1,
      order: 3,
      kind: "QUOTE",
      content:
        "Llamarse familia no la hace una. Cuidarse, sí. Y el cuidado, en estos vínculos, se aprende.",
    },
    {
      id: "cb-fam-1-4",
      chapterBookId: book2.id,
      chapterOrder: 1,
      order: 4,
      kind: "PARAGRAPH",
      content:
        "No hay un manual: la familia ensamblada se construye por capas. Primero la pareja se elige. Después se eligen los rituales. Más tarde se construyen acuerdos con los hijos. Cada paso pide tiempo y consentimiento.",
    },
    {
      id: "cb-fam-1-5",
      chapterBookId: book2.id,
      chapterOrder: 1,
      order: 5,
      kind: "PARAGRAPH",
      content:
        "Lo que más fractura no son los conflictos visibles, sino los acuerdos que nadie hizo explícitos: quién decide qué, cuánto se involucra el padrastro o la madrastra, qué pasa con el otro hogar.",
    },
    {
      id: "cb-fam-1-6",
      chapterBookId: book2.id,
      chapterOrder: 1,
      order: 6,
      kind: "PAUSE",
      content:
        "Piensa en tu familia ensamblada (la actual o la de tu infancia). ¿Qué acuerdo nunca se habló y siguen pagando?",
    },

    // ── Familias Ensambladas · cap 2 ─────────────────────────────────────
    {
      id: "cb-fam-2-1",
      chapterBookId: book2.id,
      chapterOrder: 2,
      order: 1,
      kind: "HEADING",
      content: "El rol del padrastro o madrastra",
    },
    {
      id: "cb-fam-2-2",
      chapterBookId: book2.id,
      chapterOrder: 2,
      order: 2,
      kind: "PARAGRAPH",
      content:
        "El recién llegado no es ni padre ni madre, y tampoco es solo amigo. Vive en una zona intermedia donde, según el día y el conflicto, se le pide algo distinto. Sostener esa ambigüedad es agotador.",
    },
    {
      id: "cb-fam-2-3",
      chapterBookId: book2.id,
      chapterOrder: 2,
      order: 3,
      kind: "PARAGRAPH",
      content:
        "Una guía útil: el padrastro o madrastra no compite por el rol del progenitor biológico. Construye su propio vínculo con los niños, basado en quien es él o ella, no en sustituir a alguien.",
    },
    {
      id: "cb-fam-2-4",
      chapterBookId: book2.id,
      chapterOrder: 2,
      order: 4,
      kind: "QUOTE",
      content:
        "No te elijas el papel de padre. Elígete el de adulto presente. Eso ya es enorme.",
    },
    {
      id: "cb-fam-2-5",
      chapterBookId: book2.id,
      chapterOrder: 2,
      order: 5,
      kind: "PARAGRAPH",
      content:
        "Los primeros dos años son los más duros. Los niños están duelando un cambio que no pidieron, la pareja está aprendiendo, todos prueban dónde están los límites. La paciencia gana terreno donde la urgencia lo pierde.",
    },
    {
      id: "cb-fam-2-6",
      chapterBookId: book2.id,
      chapterOrder: 2,
      order: 6,
      kind: "EXERCISE",
      content: "Carta al niño o niña que vive contigo",
      meta: { kind: "JOURNALING", durationMinutes: 10 },
    },

    // ── Familias Ensambladas · cap 3 ─────────────────────────────────────
    {
      id: "cb-fam-3-1",
      chapterBookId: book2.id,
      chapterOrder: 3,
      order: 1,
      kind: "HEADING",
      content: "Construyendo rituales propios",
    },
    {
      id: "cb-fam-3-2",
      chapterBookId: book2.id,
      chapterOrder: 3,
      order: 2,
      kind: "PARAGRAPH",
      content:
        "Lo que sostiene una familia ensamblada con el tiempo son los rituales propios: la cena de los domingos, el viaje anual, la frase que dicen al despedirse. Son anclajes pequeños, pero acumulan pertenencia.",
    },
    {
      id: "cb-fam-3-3",
      chapterBookId: book2.id,
      chapterOrder: 3,
      order: 3,
      kind: "PARAGRAPH",
      content:
        "Los rituales no se imponen: se construyen. Empiezan torpes, los niños hacen muecas, y de repente, un día, alguien los pide. Ese día empezó a haber familia.",
    },
    {
      id: "cb-fam-3-4",
      chapterBookId: book2.id,
      chapterOrder: 3,
      order: 4,
      kind: "QUOTE",
      content:
        "La familia se hace en los detalles. En quién prepara el café los sábados. En quién recuerda el cumpleaños del perro.",
    },
    {
      id: "cb-fam-3-5",
      chapterBookId: book2.id,
      chapterOrder: 3,
      order: 5,
      kind: "PARAGRAPH",
      content:
        "Cuando la pareja se separa, los rituales construidos quedan. A veces los niños se llevan consigo el recuerdo y, años después, intentan replicarlos en sus propios hogares.",
    },
    {
      id: "cb-fam-3-6",
      chapterBookId: book2.id,
      chapterOrder: 3,
      order: 6,
      kind: "PAUSE",
      content:
        "Identifica un ritual de tu familia. Ahora propón uno nuevo, por chiquito que sea, para empezar esta semana.",
    },
  ];

  // Group by chapter to resolve chapter ID once.
  const chapterIdCache: Record<string, string> = {};
  for (const b of chapterBlocks) {
    const key = `${b.chapterBookId}:${b.chapterOrder}`;
    if (!chapterIdCache[key]) {
      const ch = await prisma.chapter.findUnique({
        where: {
          bookId_order: {
            bookId: b.chapterBookId,
            order: b.chapterOrder,
          },
        },
        select: { id: true },
      });
      if (!ch) {
        throw new Error(
          `Seed precondition failed: chapter (${b.chapterBookId}, order=${b.chapterOrder}) not found — seed it before ChapterBlocks.`,
        );
      }
      chapterIdCache[key] = ch.id;
    }
    await prisma.chapterBlock.upsert({
      where: { id: b.id },
      create: {
        id: b.id,
        chapterId: chapterIdCache[key]!,
        order: b.order,
        kind: b.kind,
        content: b.content,
        meta: (b.meta ?? undefined) as never,
      },
      update: {
        kind: b.kind,
        content: b.content,
        meta: (b.meta ?? undefined) as never,
      },
    });
  }
  console.log(`✅  ChapterBlock catalog: ${chapterBlocks.length} entries`);

  // ── Therapists (Sprint S63) ────────────────────────────────────────────
  const therapists = [
    {
      id: "t_marina",
      name: "Marina Quintana",
      initials: "MQ",
      title: "Psicóloga clínica · Senior Eco",
      licenseNumber: "PSI-EC-2031",
      licenseVerified: true,
      coverToken: "warm",
      bioShort:
        "Acompaño procesos de ansiedad, duelo y reconfiguración de identidad después de cambios grandes.",
      bioLong:
        "Soy psicóloga clínica formada en la PUCE con maestría en psicoanálisis. Trabajo desde un enfoque integrador con foco en lo somático y en la narrativa.",
      approach: "Integrativo · somático · narrativo",
      specialties: ["ansiedad", "duelo", "identidad"],
      modalities: ["INDIVIDUAL", "COUPLE"] as (
        | "INDIVIDUAL"
        | "COUPLE"
        | "FAMILY"
      )[],
      languages: ["es-EC"],
      genderId: "femenino",
      priceUsd: 45,
      acceptsInsurance: false,
      avgRating: 4.8,
      reviewsCount: 47,
      popularity: 100,
      firstSessionPolicy: "Primera sesión sin cargo si decides no continuar.",
      cancellationPolicy: "Hasta 24h antes sin costo.",
    },
    {
      id: "t_andrea",
      name: "Andrea Ortiz",
      initials: "AO",
      title: "Psicóloga · Pareja y familia",
      licenseNumber: "PSI-EC-1885",
      licenseVerified: true,
      coverToken: "lavender",
      bioShort:
        "Especializada en terapia de pareja y vínculos familiares. Trabajo desde el enfoque sistémico.",
      bioLong:
        "Soy psicóloga sistémica con 12 años de experiencia. Acompaño a parejas y familias en procesos de reconciliación, redefinición de roles y crisis.",
      approach: "Sistémico · centrado en soluciones",
      specialties: ["pareja", "familia", "comunicación"],
      modalities: ["COUPLE", "FAMILY"] as (
        | "INDIVIDUAL"
        | "COUPLE"
        | "FAMILY"
      )[],
      languages: ["es-EC"],
      genderId: "femenino",
      priceUsd: 55,
      acceptsInsurance: true,
      avgRating: 4.6,
      reviewsCount: 31,
      popularity: 80,
      firstSessionPolicy:
        "Primera sesión: anamnesis + co-construcción de objetivos.",
      cancellationPolicy: "Hasta 48h antes sin costo.",
    },
    {
      id: "t_diego",
      name: "Diego Velasco",
      initials: "DV",
      title: "Psicólogo · Adultos jóvenes",
      licenseNumber: "PSI-EC-2104",
      licenseVerified: true,
      coverToken: "mixed",
      bioShort:
        "Trabajo con jóvenes adultos en transiciones de carrera, vínculos y proyectos de vida.",
      bioLong:
        "Psicólogo formado en la UCE con especialidad en TCC. Mi foco son las transiciones de los 20–35 años.",
      approach: "Terapia cognitivo-conductual · TCC",
      specialties: ["ansiedad", "vocacional", "proyecto-de-vida"],
      modalities: ["INDIVIDUAL"] as ("INDIVIDUAL" | "COUPLE" | "FAMILY")[],
      languages: ["es-EC", "en"],
      genderId: "masculino",
      priceUsd: 35,
      acceptsInsurance: false,
      avgRating: 4.5,
      reviewsCount: 19,
      popularity: 70,
      firstSessionPolicy:
        "Primera sesión enfocada en establecer foco terapéutico.",
      cancellationPolicy: "Hasta 24h antes sin costo.",
    },
    {
      id: "t_lucia",
      name: "Lucía Pérez",
      initials: "LP",
      title: "Psicóloga · Trauma y abuso",
      licenseNumber: "PSI-EC-1992",
      licenseVerified: true,
      coverToken: "cool",
      bioShort:
        "Especialista en trauma complejo y supervivientes de abuso. Enfoque seguro y a tu ritmo.",
      bioLong:
        "Psicóloga formada en EMDR e ISST-D. Acompaño procesos de elaboración de trauma con técnicas validadas y a tu ritmo.",
      approach: "EMDR · trauma-focused CBT",
      specialties: ["trauma", "duelo", "abuso", "TEPT"],
      modalities: ["INDIVIDUAL"] as ("INDIVIDUAL" | "COUPLE" | "FAMILY")[],
      languages: ["es-EC"],
      genderId: "femenino",
      priceUsd: 60,
      acceptsInsurance: true,
      avgRating: 4.9,
      reviewsCount: 64,
      popularity: 95,
      firstSessionPolicy: "Sesión 0 gratuita para evaluar fit y seguridad.",
      cancellationPolicy: "Hasta 72h antes sin costo.",
    },
    {
      id: "t_eduardo",
      name: "Eduardo Salinas",
      initials: "ES",
      title: "Psicólogo · Adicciones",
      licenseNumber: "PSI-EC-1721",
      licenseVerified: true,
      coverToken: "warm",
      bioShort:
        "20 años trabajando en adicciones químicas y conductuales. Enfoque cognitivo-conductual y mindfulness.",
      bioLong:
        "Psicólogo formado en Argentina, especializado en adicciones. Trabajé en CRA Quito durante 12 años.",
      approach: "TCC + mindfulness · 12 pasos cuando aplica",
      specialties: ["adicciones", "ansiedad", "depresión"],
      modalities: ["INDIVIDUAL", "FAMILY"] as (
        | "INDIVIDUAL"
        | "COUPLE"
        | "FAMILY"
      )[],
      languages: ["es-EC"],
      genderId: "masculino",
      priceUsd: 50,
      acceptsInsurance: true,
      avgRating: 4.7,
      reviewsCount: 38,
      popularity: 85,
      firstSessionPolicy: "Evaluación inicial: motivacional + sistémica.",
      cancellationPolicy: "Hasta 48h antes sin costo.",
    },
    {
      id: "t_camila",
      name: "Camila Torres",
      initials: "CT",
      title: "Psicóloga · Adolescentes y juventud",
      licenseNumber: "PSI-EC-2240",
      licenseVerified: true,
      coverToken: "lavender",
      bioShort:
        "Trabajo con adolescentes y jóvenes en temas de identidad, ansiedad social, autoestima y bullying.",
      bioLong:
        "Magíster en psicología infantojuvenil. 8 años de experiencia en consultorio + colegios.",
      approach: "Terapia narrativa + arte-terapia",
      specialties: [
        "adolescentes",
        "autoestima",
        "ansiedad-social",
        "bullying",
      ],
      modalities: ["INDIVIDUAL", "FAMILY"] as (
        | "INDIVIDUAL"
        | "COUPLE"
        | "FAMILY"
      )[],
      languages: ["es-EC", "en"],
      genderId: "femenino",
      priceUsd: 40,
      acceptsInsurance: false,
      avgRating: 4.7,
      reviewsCount: 25,
      popularity: 75,
      firstSessionPolicy:
        "Primera sesión con padres + adolescente para alinear objetivos.",
      cancellationPolicy: "Hasta 24h antes sin costo.",
    },
  ];

  for (const t of therapists) {
    await prisma.therapist.upsert({
      where: { id: t.id },
      create: {
        ...t,
        isActive: true,
        currency: "USD",
      },
      update: {
        ...t,
        isActive: true,
        currency: "USD",
      },
    });

    // Default weekly availability — Mon/Wed/Fri 09:00–13:00 + 15:00–19:00
    // Tue/Thu 14:00–19:00. Tunable per therapist later via ops UI.
    const defaultSlots = [
      { dayOfWeek: 1, startMin: 540, endMin: 780 },
      { dayOfWeek: 1, startMin: 900, endMin: 1140 },
      { dayOfWeek: 3, startMin: 540, endMin: 780 },
      { dayOfWeek: 3, startMin: 900, endMin: 1140 },
      { dayOfWeek: 5, startMin: 540, endMin: 780 },
      { dayOfWeek: 5, startMin: 900, endMin: 1140 },
      { dayOfWeek: 2, startMin: 840, endMin: 1140 },
      { dayOfWeek: 4, startMin: 840, endMin: 1140 },
    ];
    // Wipe + reinsert to keep this idempotent.
    await prisma.therapistAvailability.deleteMany({
      where: { therapistId: t.id },
    });
    for (const s of defaultSlots) {
      await prisma.therapistAvailability.create({
        data: {
          therapistId: t.id,
          dayOfWeek: s.dayOfWeek,
          startMin: s.startMin,
          endMin: s.endMin,
          timezone: "America/Guayaquil",
        },
      });
    }
  }
  console.log(`✅  Therapists: ${therapists.length} terapeutas + availability`);

  // ─── Exploraciones · Journeys (Sprint B5) ────────────────────────────────
  //
  // Curated bundles of books around transformation arcs. Idempotent via slug.
  // v1 ships two journeys built from the two anchor books — the page renders
  // with content from day one. Ops can add more rows directly in DB.

  console.log("\n🧭 Journeys…");
  const now = new Date();
  const journeys = [
    {
      slug: "asentar-las-emociones",
      title: "Asentar las emociones",
      subtitle: "Un camino para mirar lo que sientes sin pelear con ello.",
      description:
        "Empieza por nombrar lo que pasa adentro y termina con una práctica diaria para sostenerlo.",
      coverToken: "cool" as const,
      durationMinutes: 96,
      bookSlugs: ["emociones-en-construccion"],
      order: 0,
    },
    {
      slug: "familia-y-vinculos",
      title: "Familia y vínculos",
      subtitle:
        "Para conversaciones que llevan tiempo sin tener un buen lugar.",
      description:
        "Lecturas que ayudan a entender las dinámicas que cargamos desde casa y a abrir espacio para nuevas.",
      coverToken: "warm" as const,
      durationMinutes: 140,
      bookSlugs: ["familias-ensambladas"],
      order: 1,
    },
  ];
  for (const j of journeys) {
    await prisma.journey.upsert({
      where: { slug: j.slug },
      create: { ...j, publishedAt: now },
      update: {
        title: j.title,
        subtitle: j.subtitle,
        description: j.description,
        coverToken: j.coverToken,
        durationMinutes: j.durationMinutes,
        bookSlugs: j.bookSlugs,
        order: j.order,
        publishedAt: now,
      },
    });
  }
  console.log(`✅  Journeys: ${journeys.length} exploraciones curadas`);

  console.log("\n🌱 Seed completado.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
