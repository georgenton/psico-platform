import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BookExperiencePrototype } from "@/components/prototypes/book-experience/BookExperiencePrototype";
import { prototypeRoutesHidden } from "@/lib/deploy-env";

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
 * - devuelve 404 en produccion.
 *
 * Quien decide es `prototypeRoutesHidden()` (`@/lib/deploy-env`), que resuelve el
 * entorno sin preguntarselo a un proveedor: ver ADR 0024. En local y en preview
 * la ruta queda accesible; en una caja desplegada que no declara su entorno, no.
 */
export const metadata: Metadata = {
  title: "Prototipo · Book Experience Standard V1",
  robots: { index: false, follow: false },
};

/**
 * El gate se evalua por peticion, no al construir.
 *
 * Esta pagina no recibe parametros, asi que Next la prerenderizaba como estatica
 * (`○` en la salida del build) y `prototypeRoutesHidden()` se resolvia con las
 * variables del BUILD. En Vercel eso funcionaba de casualidad, porque el build
 * corre con `VERCEL_ENV=production`; en una plataforma donde el entorno solo
 * existe en runtime, el prerender habria publicado el prototipo como HTML
 * estatico y ninguna variable en caliente lo habria podido cerrar.
 *
 * Coste: se renderiza en cada peticion en lugar de una vez. Es un prototipo de
 * revision de diseno; no tiene trafico que justifique lo contrario.
 */
export const dynamic = "force-dynamic";

export default function BookExperiencePrototypePage() {
  if (prototypeRoutesHidden()) {
    notFound();
  }

  return <BookExperiencePrototype />;
}
