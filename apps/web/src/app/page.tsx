import type { Metadata } from "next";

import { Landing } from "@/components/landing/Landing";

import "./landing.css";

/**
 * Home pública.
 *
 * Implementa la referencia aprobada el 27-09-2026 con su ajuste 2.1, recuperada
 * del proyecto de Claude Design «Psico Platform Design System» y espejada en
 * `docs/design/web-publica-f2-1/`.
 *
 * Sustituye a la landing anterior, que venía de `docs/design/redesign-v2/` —la
 * dirección que la auditoría del 27-09 descartó y que seguía publicada.
 *
 * `landing.css` es un archivo GENERADO desde esa referencia: se regenera con
 * `node scripts/landing/generar-css.mjs` y no se edita a mano.
 */

export const metadata: Metadata = {
  title: "FeelVerse — Psicoeducación para leer, explorar y poner en práctica",
  description:
    "Libros de psicología y experiencias guiadas con audios, videos y ejercicios. " +
    "Pregunta a Eco sobre lo que aprendes y practica por tu cuenta o con otras personas.",
};

export const revalidate = 3600;

export default function HomePage() {
  return <Landing />;
}
