import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GuidedReadingPrototype } from "@/components/prototypes/guided-reading/GuidedReadingPrototype";
import { resolvePrototypeParams } from "@/components/prototypes/guided-reading/guided-reading-prototype.fixture";

/**
 * Prototipo visual de Guided Reading V1 (GR-1).
 *
 * Autoridad de producto: docs/product/guided-reading-v1.md.
 *
 * Superficie aislada de revisión de diseño:
 * - no requiere identidad ni datos reales;
 * - no lee cookies ni hace `fetch`;
 * - no aparece en la navegación del producto;
 * - `noindex, nofollow`;
 * - devuelve 404 cuando `VERCEL_ENV=production`.
 *
 * `VERCEL_ENV` la define Vercel; GR-1 no introduce ninguna variable nueva.
 * En local y en preview la ruta queda accesible.
 */
export const metadata: Metadata = {
  title: "Prototipo · Lectura guiada",
  robots: { index: false, follow: false },
};

export default function GuidedReadingPrototypePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  if (process.env.VERCEL_ENV === "production") {
    notFound();
  }

  const initial = resolvePrototypeParams(searchParams ?? {});

  return <GuidedReadingPrototype initial={initial} />;
}
