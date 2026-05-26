import type { Metadata } from "next";
import type { BookListItem, PlanInfo } from "@psico/types";

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

// FALLBACK_BOOKS uses the BookListItem shape so the landing renders the same
// hero cards even when the API is unreachable during ISR regeneration.
const FALLBACK_BOOKS: BookListItem[] = [
  {
    id: "fallback-1",
    slug: "emociones-en-construccion",
    title: "Emociones en Construcción",
    subtitle:
      "Aprende a identificar, comprender y gestionar tus emociones con herramientas basadas en psicología cognitiva.",
    authorId: null,
    authorName: "Marina Quintana",
    cover: "warm",
    coverArtUrl: null,
    categoryId: null,
    categorySlug: null,
    chapters: 12,
    pages: 96,
    durationMinutes: 0,
    publishedOn: new Date("2025-01-01"),
    rating: 0,
    reviewCount: 0,
    tierRequired: "free",
    isFavorite: false,
    isBookmarked: false,
    userProgress: null,
  },
  {
    id: "fallback-2",
    slug: "familias-ensambladas",
    title: "Familias Ensambladas",
    subtitle:
      "Guía para navegar las dinámicas de las familias reconstruidas con empatía y comunicación efectiva.",
    authorId: null,
    authorName: "Marina Quintana",
    cover: "cool",
    coverArtUrl: null,
    categoryId: null,
    categorySlug: null,
    chapters: 10,
    pages: 140,
    durationMinutes: 0,
    publishedOn: new Date("2025-01-01"),
    rating: 0,
    reviewCount: 0,
    tierRequired: "pro",
    isFavorite: false,
    isBookmarked: false,
    userProgress: null,
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
  const [booksList, plans] = await Promise.all([
    booksApi.findAll().catch(() => ({
      books: FALLBACK_BOOKS,
      pagination: {
        page: 1,
        perPage: FALLBACK_BOOKS.length,
        total: FALLBACK_BOOKS.length,
      },
      categories: [],
      authors: [],
    })),
    subscriptionsApi.getPlans().catch((): PlanInfo[] => FALLBACK_PLANS),
  ]);

  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <HowItWorksSection />
        <BooksSection books={booksList.books} />
        <PricingSection plans={plans} />
        <CtaSection />
      </main>
      <Footer />
    </>
  );
}
