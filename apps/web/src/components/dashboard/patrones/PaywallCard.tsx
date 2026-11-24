import Link from "next/link";
import { PURCHASES_CLOSED_HEADLINE } from "@psico/types";

/**
 * El muro de Patrones, fuera de la página.
 *
 * Misma razón que `plan/UpgradeCard.tsx`: la página es un Server Component y
 * lo único comprobable desde fuera era el texto del fichero. Una prueba de
 * posición no distingue qué rama corresponde a qué valor —intercambiarlas la
 * aprueba igual— y aquí la rama equivocada ofrece contratar justo cuando los
 * cobros están cerrados. Montándolo se le puede preguntar qué ofrece.
 */

export function PaywallCard({
  entryCount,
  purchasesOpen,
}: {
  entryCount: number;
  /**
   * La decide el servidor y llega en la propia respuesta de Patrones, con la
   * misma función y la misma variable que rechazan un checkout. Decidirlo aquí
   * por separado sería tener dos criterios capaces de contradecirse.
   */
  purchasesOpen: boolean;
}) {
  return (
    // El par de superficie de marca, no la rampa — la misma corrección que
    // `PaywallPro` (#728), por el mismo motivo. El gradiente iba de
    // `lavender-500` a `lavender-800`: sobre el 500 el blanco da 3,63, y en
    // Noche el 800 se aclara, así que el texto blanco del pie quedaba en 1,40.
    <section
      style={{
        marginTop: 16,
        overflow: "hidden",
        borderRadius: 24,
        padding: 36,
        color: "var(--fg-on-brand-surface)",
        background: "var(--bg-brand-surface)",
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: ".14em",
          color: "var(--fg-on-brand-surface-muted)",
          margin: 0,
        }}
      >
        Función Pro
      </p>
      {/* El color va explícito: la regla global de encabezados
          (`h1…h6 { color: var(--fg-heading) }`) pisa el que se hereda de la
          tarjeta, y el título salía en tinta oscura sobre morado — 1,30:1. */}
      <h2
        style={{
          font: "700 24px/1.1 var(--font-sans)",
          marginTop: 8,
          color: "var(--fg-on-brand-surface)",
        }}
      >
        Tu mapa emocional · sin descifrar nada
      </h2>
      <p
        style={{
          marginTop: 12,
          maxWidth: 460,
          fontSize: 14,
          lineHeight: 1.5,
          color: "var(--fg-on-brand-surface-muted)",
        }}
      >
        Hicimos los patrones para que veas tu propio ritmo: cuándo escribes, qué
        emociones se repiten, qué semanas estuvieron pesadas. Todo desde la
        metadata de tu diario, sin que el servidor toque tu texto.
      </p>
      <ul
        style={{
          marginTop: 20,
          listStyle: "none",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          fontSize: 13.5,
          color: "var(--fg-on-brand-surface)",
        }}
      >
        {[
          "Heatmap del mes con tus moods.",
          "Hora del día con más entradas.",
          "Resumen de tu semana con conteos: lo redacta una IA o, si falla, una plantilla.",
          "Compartir snapshot con tu terapeuta (próximamente).",
        ].map((line) => (
          <li
            key={line}
            style={{ display: "flex", alignItems: "flex-start", gap: 8 }}
          >
            <span style={{ marginTop: 2 }} aria-hidden>
              ✓
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p
        style={{
          marginTop: 20,
          fontSize: 11.5,
          color: "var(--fg-on-brand-surface-muted)",
        }}
      >
        Llevas <strong>{entryCount}</strong> entradas este período. Suficiente
        para empezar.
      </p>
      {/*
        El enlace de abajo es una llamada accionable a contratar, y mientras los
        cobros estén cerrados no hay nada que contratar. Se sustituye por lo que
        sí es cierto —qué es esto y dónde se ve el plan— sin un enlace que
        parezca el primer paso de una compra.

        El texto del botón NO se escribe en este comentario a propósito: el
        trinquete cuenta sus apariciones en el fichero, y repetirlo aquí lo
        haría fallar. Reformular sale más barato que carvarle una excepción.
      */}
      {purchasesOpen ? (
        <Link
          href="/dashboard/plan"
          style={{
            marginTop: 24,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            borderRadius: 16,
            padding: "12px 24px",
            fontSize: 13,
            fontWeight: 600,
            background: "var(--bg-surface)",
            color: "var(--color-lavender-700)",
            textDecoration: "none",
          }}
        >
          Hazte Pro →
        </Link>
      ) : (
        <div style={{ marginTop: 24 }}>
          <p
            style={{
              fontSize: 13,
              color: "var(--fg-on-brand-surface)",
              margin: 0,
            }}
          >
            {PURCHASES_CLOSED_HEADLINE}, así que esta función todavía no se
            puede activar.
          </p>
          <Link
            href="/dashboard/plan"
            style={{
              marginTop: 10,
              display: "inline-block",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--fg-on-brand-surface)",
              textDecoration: "underline",
            }}
          >
            Ver mi plan
          </Link>
        </div>
      )}
    </section>
  );
}
