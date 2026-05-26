import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...\n");

  // ─── Book 1: FREE — Emociones en Construcción ─────────────────────────────

  const book1 = await prisma.book.upsert({
    where: { slug: "emociones-en-construccion" },
    create: {
      slug: "emociones-en-construccion",
      title: "Emociones en Construcción",
      description:
        "Una guía práctica para entender, nombrar y gestionar tus emociones desde adentro.",
      plan: "FREE",
      isPublished: true,
      totalChapters: 2,
    },
    update: {
      title: "Emociones en Construcción",
      isPublished: true,
      totalChapters: 2,
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
      description:
        "Herramientas psicoeducativas para construir vínculos sanos en familias reconstituidas.",
      plan: "PRO",
      isPublished: true,
      totalChapters: 3,
    },
    update: {
      title: "Familias Ensambladas",
      isPublished: true,
      totalChapters: 3,
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
