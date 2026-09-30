import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GuidedReadingPrototype } from "@/components/prototypes/guided-reading/GuidedReadingPrototype";
import { resolvePrototypeParams } from "@/components/prototypes/guided-reading/guided-reading-prototype.fixture";
import { prototypeRoutesHidden } from "@/lib/deploy-env";

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
 * - devuelve 404 en produccion.
 *
 * Quien decide es `prototypeRoutesHidden()` (`@/lib/deploy-env`), que resuelve el
 * entorno sin preguntarselo a un proveedor: ver ADR 0024. En local y en preview
 * la ruta queda accesible; en una caja desplegada que no declara su entorno, no.
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
  if (prototypeRoutesHidden()) {
    notFound();
  }

  const initial = resolvePrototypeParams(searchParams ?? {});

  return <GuidedReadingPrototype initial={initial} />;
}
