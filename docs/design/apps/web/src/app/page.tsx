import type { Metadata } from "next";
import type { Book, PlanInfo } from "@psico/types";

import { booksApi, subscriptionsApi } from "@/lib/api";
import { Navbar } from "@/components/landing/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { BooksSection } from "@/components/landing/BooksSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { CtaSection } from "@/components/landing/CtaSection";
import { Footer } from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Psico Platform — Psicoeducación para tu bienestar",
  description:
    "Psicoeducación basada en evidencia para comprender tus emociones, mejorar tus relaciones y construir una vida más plena — a tu ritmo.",
};

// ISR: regenera la landing cada hora. Las páginas de libros
// y planes no cambian frecuentemente.
export const revalidate = 3600;

// ── Fallback data — se usa cuando la API no está disponible ────────────────

const FALLBACK_BOOKS: Book[] = [
  {
    id: "fallback-1",
    slug: "emociones-en-construccion",
    title: "Emociones en Construcción",
    description:
      "Aprende a identificar, comprender y gestionar tus emociones con herramientas basadas en psicología cognitiva.",
    coverUrl: null,
    totalChapters: 12,
    isPublished: true,
    plan: "FREE",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  },
  {
    id: "fallback-2",
    slug: "familias-ensambladas",
    title: "Familias Ensambladas",
    description:
      "Guía para navegar las dinámicas de las familias reconstruidas con empatía y comunicación efectiva.",
    coverUrl: null,
    totalChapters: 10,
    isPublished: true,
    plan: "PRO",
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  },
];

const FALLBACK_PLANS: PlanInfo[] = [
  {
    plan: "FREE",
    name: "Gratuito",
    prices: { currency: "USD" },
    description: "Para empezar tu camino al bienestar",
    features: [
      "Libro introductorio gratuito",
      "Ejercicios de reflexión",
      "Seguimiento de progreso básico",
    ],
  },
  {
    plan: "PRO",
    name: "Pro",
    prices: { monthly: 7, yearly: 59, currency: "USD" },
    description: "Acceso completo para tu crecimiento personal",
    features: [
      "Todos los libros de la plataforma",
      "Audios y meditaciones guiadas",
      "IA companion personalizado",
      "Historial completo de progreso",
      "Sin publicidad",
    ],
  },
  {
    plan: "ANNUAL",
    name: "Anual",
    prices: { yearly: 59, currency: "USD" },
    description: "El mejor valor para un crecimiento sostenido",
    features: [
      "Todo lo incluido en Pro",
      "Ahorra un 30% vs. mensual",
      "Acceso anticipado a nuevos libros",
      "Soporte prioritario",
    ],
  },
];

// ── Page ──────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const [books, plans] = await Promise.all([
    booksApi.findAll().catch((): Book[] => FALLBACK_BOOKS),
    subscriptionsApi.getPlans().catch((): PlanInfo[] => FALLBACK_PLANS),
  ]);

  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <HowItWorksSection />
        <BooksSection books={books} />
        <PricingSection plans={plans} />
        <CtaSection />
      </main>
      <Footer />
    </>
  );
}
