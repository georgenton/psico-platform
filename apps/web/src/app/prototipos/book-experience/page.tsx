import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BookExperiencePrototype } from "@/components/prototypes/book-experience/BookExperiencePrototype";

/**
 * Prototipo visual del Book Experience Standard V1.
 *
 * Autoridad de producto: docs/product/book-experience-standard-v1.md.
 *
 * Sigue la convención de prototipos que ya existe (`/prototipos/lectura-guiada`)
 * en lugar de inventar una ruta o una variable de entorno nuevas:
 * - no requiere identidad ni datos reales;
 * - no lee cookies ni hace `fetch`;
 * - no aparece en la navegación del producto;
 * - `noindex, nofollow`;
 * - devuelve 404 cuando `VERCEL_ENV=production`.
 *
 * `VERCEL_ENV` la define Vercel. En local y en preview la ruta queda accesible.
 */
export const metadata: Metadata = {
  title: "Prototipo · Book Experience Standard V1",
  robots: { index: false, follow: false },
};

export default function BookExperiencePrototypePage() {
  if (process.env.VERCEL_ENV === "production") {
    notFound();
  }

  return <BookExperiencePrototype />;
}
