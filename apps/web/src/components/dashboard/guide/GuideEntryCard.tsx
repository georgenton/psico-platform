"use client";

import type { ReactNode } from "react";

import Link from "next/link";
import { useEffect, useState } from "react";
import { guideRecoveryState } from "./guide-recovery";
import { resolveGuideWebBundle } from "./guide-web-bundle";
import { useChapterExperience } from "../experience/use-chapter-experience";

/**
 * GR-4 — the guide this Exploraciones card advertises, stated explicitly.
 *
 * Exploraciones lists PUBLISHED standalone guides, and there is exactly one.
 * Naming its pin here keeps the card from inheriting "whichever guide the
 * registry happens to hold first" the day a second one is registered.
 */
const CARD_PIN = {
  guideKey: "eec-c1-cuerpo-antes-que-mente",
  guideVersion: 1,
} as const;

/**
 * B3 — el capítulo de ese pin, declarado aquí como lo declara la ruta
 * independiente que esta tarjeta enlaza. Hace falta para preguntarle al
 * servidor si todavía se puede empezar, en vez de prometerlo desde
 * `localStorage`.
 */
const CARD_CONTEXT = {
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
} as const;

/**
 * CC-7.5 — the Guide entry point inside Exploraciones.
 *
 * A Guide is NOT a Journey. It has its own card, its own tag and its own
 * route; it never enters `JourneyListResponse`, and nothing about it is
 * rendered through the Journey components. Mixing them would make a
 * three-step educational guide look like a multi-book path.
 *
 * The card is a client component for one reason: whether this browser can
 * resume is a `localStorage` fact, unreadable on the server. So it renders
 * "Empezar guía" first — the honest default when we cannot know — and only
 * switches to "Continuar guía" after mount, if a valid record exists.
 *
 * There is no progress bar. We could not fill one without a GET, and drawing
 * an empty or invented one would be worse than drawing none.
 */
export interface GuideEntryCardProps {
  /** #732 — el nivel del título lo decide quien monta la tarjeta. */
  tituloComo?: "h2" | "h3" | "h4";
  /**
   * Opaque partition derived server-side — see `guide-recovery-scope.server`.
   * `null` when the layout could not resolve the authenticated identity this
   * render: the card fails closed to "Empezar", never promising to resume.
   */
  actorScope: string | null;
}

export function GuideEntryCard({
  actorScope,
  tituloComo = "h3",
}: GuideEntryCardProps) {
  const [storage, setStorage] = useState<"empty" | "valid" | "unavailable">(
    "empty",
  );
  const bundle = resolveGuideWebBundle(CARD_PIN);

  useEffect(() => {
    // No scope (identity unresolved) reads as `empty`, exactly like a record
    // belonging to another account — the CTA says "Empezar" because promising
    // to continue a run we cannot attribute would be a lie.
    if (!actorScope || !bundle) {
      setStorage("empty");
      return;
    }
    setStorage(guideRecoveryState(actorScope, bundle.pin, bundle.presentation));
  }, [actorScope, bundle]);

  /**
   * B3 — qué ofrece de verdad esta tarjeta, preguntado al servidor.
   *
   * Hasta aquí el rótulo salía sólo de `localStorage`, así que la tarjeta
   * decía «Empezar guía» también cuando empezar era imposible: el pin está
   * retirado para inicios nuevos y `POST /guide/sessions` responde 410. Un
   * CTA que lleva a una puerta cerrada no es una oferta.
   *
   * El hook resuelve por descubrimiento y, si el capítulo ya no la ofrece,
   * pregunta por identidad exacta — de modo que quien tiene un recorrido
   * propio sigue viendo su tarjeta aunque la experiencia esté retirada.
   */
  const experiencia = useChapterExperience({
    ...CARD_CONTEXT,
    pin: CARD_PIN,
    enabled: actorScope !== null,
  });
  const resuelta = experiencia.definition;
  const sePuedeEmpezar = resuelta?.startable === true;
  const canResume = storage === "valid" && sePuedeEmpezar;

  // No bundle, no card. A guide this build cannot render is a guide the
  // catalog must not advertise.
  if (!bundle) return null;
  // Lo mismo, por la misma razón, cuando el servidor ya contestó y no hay
  // nada que abrir: ni el capítulo la ofrece ni esta persona tiene un
  // recorrido en ella. Mientras la respuesta no llega la tarjeta se queda,
  // con un rótulo que no promete empezar.
  if (experiencia.status !== "loading" && resuelta === null) return null;
  const { presentation } = bundle;
  const href = presentation.href;

  return (
    <div
      className="card"
      style={{
        padding: 24,
        marginBottom: 26,
        display: "flex",
        flexWrap: "wrap",
        gap: 18,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ minWidth: 240, flex: "1 1 320px" }}>
        <span className="card-tag sage">{presentation.tag}</span>
        {/* El nivel lo pide quien monta la tarjeta (#732). El estilo va en
            línea, así que cambiarlo no toca el aspecto. */}
        <TituloDeTarjeta como={tituloComo}>
          {presentation.title}
        </TituloDeTarjeta>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--color-warm-600)",
            margin: 0,
            maxWidth: 480,
          }}
        >
          {presentation.summary}
        </p>
      </div>
      <Link
        href={href ?? "/dashboard/exploraciones"}
        className="btn primary"
        style={{ minHeight: 44, textDecoration: "none" }}
      >
        {canResume
          ? presentation.labels.resume
          : sePuedeEmpezar
            ? presentation.labels.start
            : // Ni «Empezar» ni «Continuar»: lo uno sería mentira y lo otro
              // una promesa que esta tarjeta no puede comprobar desde aquí.
              // Abrir es exactamente lo que hace, y la pantalla de destino
              // dice la verdad sobre lo que hay.
              "Abrir guía"}
      </Link>
      {storage === "unavailable" ? (
        // Saying "Empezar" without this would promise something this browser
        // cannot deliver: without storage there is no key to recover with.
        <p
          style={{
            flexBasis: "100%",
            margin: 0,
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--color-warm-500)",
          }}
        >
          Este navegador no puede guardar la recuperación de la guía.
        </p>
      ) : null}
    </div>
  );
}

/** El título de la tarjeta de entrada, con el nivel que le pasan. */
function TituloDeTarjeta({
  como,
  children,
}: {
  como: "h2" | "h3" | "h4";
  children: ReactNode;
}) {
  const Tag = como;
  return (
    <Tag
      style={{
        font: "700 19px/1.25 var(--font-sans)",
        color: "var(--color-warm-900)",
        margin: "10px 0 8px",
      }}
    >
      {children}
    </Tag>
  );
}
