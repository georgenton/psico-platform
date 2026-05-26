import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

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

  const motivos = [
    { id: "ansiedad", label: "Ansiedad", icon: "wind", order: 1 },
    { id: "tristeza", label: "Tristeza", icon: "cloud-rain", order: 2 },
    {
      id: "relaciones",
      label: "Mis relaciones",
      icon: "heart-handshake",
      order: 3,
    },
    { id: "vinculos", label: "Vínculos familiares", icon: "users", order: 4 },
    { id: "trabajo", label: "Trabajo y burnout", icon: "briefcase", order: 5 },
    { id: "duelo", label: "Estoy en un duelo", icon: "heart-crack", order: 6 },
    { id: "explorar", label: "Solo explorando", icon: "compass", order: 7 },
  ];
  for (const m of motivos) {
    await prisma.onboardingMotivo.upsert({
      where: { id: m.id },
      create: { ...m, isActive: true },
      update: { label: m.label, icon: m.icon, order: m.order, isActive: true },
    });
  }
  console.log(`✅  Motivos catalog: ${motivos.length} entries`);

  const moods = [
    { id: "calma", label: "Calma", swatch: "#A8C7E4", order: 1 },
    { id: "foco", label: "Foco", swatch: "#7C5BC4", order: 2 },
    { id: "energia", label: "Energía", swatch: "#F2A65A", order: 3 },
    { id: "reflexion", label: "Reflexión", swatch: "#8C9F7E", order: 4 },
    { id: "alegria", label: "Alegría", swatch: "#F5C76B", order: 5 },
    { id: "ansiedad", label: "Ansiedad", swatch: "#C97B7B", order: 6 },
    { id: "tristeza", label: "Tristeza", swatch: "#6B7E8E", order: 7 },
  ];
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
  console.log(`✅  Moods catalog:   ${moods.length} entries`);

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
