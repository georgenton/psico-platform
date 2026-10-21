"use client";

import Link from "next/link";

import { ExperiencePlayer } from "../experience/ExperiencePlayer";
import { useChapterExperience } from "../experience/use-chapter-experience";
import { useGuideActorScope } from "./guide-actor-scope";
import { useGuideAvailability } from "./guide-availability";
import { useGuideOwnState } from "./use-guide-own-state";
import { resolveGuideWebBundle } from "./guide-web-bundle";

/**
 * GR-4 — the pin this STANDALONE route publishes, stated explicitly.
 *
 * The route is `/dashboard/exploraciones/eec-c1-cuerpo-antes-que-mente`, so
 * the guide it plays is that one and no other. Written here as a literal
 * rather than reached for as a default: the day a second standalone route
 * exists, each will name its own pin and neither will inherit the other's.
 */
const STANDALONE_PIN = {
  guideKey: "eec-c1-cuerpo-antes-que-mente",
  guideVersion: 1,
} as const;

/**
 * CC-7.5 / CC-7.R1 / GR-6 — mounts the Experience Player with the actor scope
 * from context. Same player the reader panel mounts; only the frame differs.
 *
 * The scope is resolved ONCE by the dashboard layout and published through the
 * `GuideActorScopeProvider`; this thin client wrapper reads it so the page can
 * stay identity-free.
 *
 * Two fail-closed gates, availability first:
 *
 *   - CC-7.R1: when the server-owned pilot gate says the guide is not enabled
 *     for this actor (e.g. someone opened the guide URL directly from outside
 *     the pilot), the player is NOT mounted — no availability round-trip, no
 *     recovery read, no START — and a calm "not available yet" card offers the
 *     way back. The commands would answer 503 anyway; this avoids the wasted
 *     attempt and states it plainly instead.
 *   - CC-7.5: when the scope is null (the layout could not resolve the
 *     authenticated identity this render) the player is likewise not mounted.
 */
/** The chapter this standalone route plays, stated with its pin. */
const STANDALONE_CONTEXT = {
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
} as const;

/** Un aviso centrado, para que las tres salidas no repitan su maquetación. */
function Aviso({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-live="polite"
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "48px 24px",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "1.25rem", marginBottom: 12 }}>{titulo}</h1>
      <p style={{ color: "var(--color-warm-600)", lineHeight: 1.6 }}>
        {children}
      </p>
      <p style={{ marginTop: 20 }}>
        <Link href="/dashboard/exploraciones" className="btn">
          Volver a Exploraciones
        </Link>
      </p>
    </section>
  );
}

export function GuidePlayerMount() {
  const available = useGuideAvailability();
  const scope = useGuideActorScope();
  // Hooks run before the gates below return: React requires the call order to
  // be stable, and `enabled` is what keeps a gated-out reader from asking.
  const experience = useChapterExperience({
    ...STANDALONE_CONTEXT,
    pin: STANDALONE_PIN,
    enabled: available && scope !== null,
  });
  /**
   * B4 — se pregunta por el propio avance incluso con el rollout cerrado,
   * porque el servidor lo contesta: las lecturas no pasan por el guard.
   * Ocultar la respuesta sería una decisión del cliente, no de la política.
   */
  const propio = useGuideOwnState(STANDALONE_PIN, scope !== null);

  if (!available) {
    /**
     * B4 — consultar lo propio no es ejecutar una operación nueva.
     *
     * Hasta aquí, quedarse fuera del rollout borraba de la vista el recorrido
     * que una persona ya había hecho: la pantalla decía «no está disponible»
     * y no había forma de ver el propio avance. Pero el servidor nunca dijo
     * eso. `GuideRolloutGuard` protege los CINCO COMANDOS —abrir sesión,
     * completar un paso, responder, cancelar, terminar— y ninguna lectura:
     * `/guide/sessions/state` contesta igual con el rollout cerrado. La
     * política ya distinguía los dos permisos; el cliente los confundía.
     *
     * Así que se pregunta, y se enseña lo que el servidor diga — **sin montar
     * el reproductor**. El reproductor existe para ejecutar un recorrido, y
     * ejecutar es justo lo que aquí no está permitido: sus botones acabarían
     * en un 503 que nadie anunció. Lo que se da es el hecho, en lectura.
     */
    if (propio.status === "loading") {
      return (
        <section
          aria-live="polite"
          style={{
            maxWidth: 640,
            margin: "0 auto",
            padding: "48px 24px",
            textAlign: "center",
            color: "var(--color-warm-600)",
          }}
        >
          Buscando tu recorrido…
        </section>
      );
    }
    if (propio.state === "ACTIVE" && propio.session) {
      return (
        <Aviso titulo="Tu recorrido está en pausa">
          Lo dejaste en el paso {propio.session.stepsCompleted} de{" "}
          {propio.session.totalSteps}. Ahora mismo esta guía no está disponible
          para tu cuenta, así que no puedes seguir avanzando — pero nada se ha
          perdido: cuando vuelva a estarlo, continuarás justo ahí.
        </Aviso>
      );
    }
    if (propio.state === "COMPLETED" && propio.session) {
      return (
        <Aviso titulo="Terminaste este recorrido">
          Registraste {propio.session.stepsCompleted} de{" "}
          {propio.session.totalSteps} pasos. Esta guía no está disponible para
          tu cuenta ahora mismo, así que no se puede volver a recorrer; lo que
          hiciste queda guardado.
        </Aviso>
      );
    }
    return (
      <Aviso titulo="Esta guía no está disponible por ahora">
        Estará disponible más adelante.
      </Aviso>
    );
  }

  if (!scope) {
    return (
      <section
        aria-live="polite"
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "48px 24px",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", marginBottom: 12 }}>
          No pudimos preparar tu guía
        </h1>
        <p style={{ color: "var(--color-warm-600)", lineHeight: 1.6 }}>
          Vuelve a intentarlo en un momento. Tu avance está a salvo.
        </p>
      </section>
    );
  }

  // A pin with no registered bundle is not a guide this build can play, and a
  // pin with no journey for this reader has nothing to present. Both fail
  // closed rather than rendering the other guide's copy under this URL — pero
  // ya no con la misma frase, porque no son el mismo hecho.
  const bundle = resolveGuideWebBundle(STANDALONE_PIN);
  const definition = experience.definition;

  // B3 — mientras la respuesta no ha llegado no se afirma nada. Antes, la
  // pantalla de «no disponible» aparecía durante la carga porque `definition`
  // empieza en null: un parpadeo que decía algo falso con seguridad.
  if (experience.status === "loading") {
    return (
      <section
        aria-live="polite"
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "48px 24px",
          textAlign: "center",
          color: "var(--color-warm-600)",
        }}
      >
        Buscando tu recorrido…
      </section>
    );
  }

  if (!bundle) {
    return (
      <Aviso titulo="No pudimos preparar tu guía">
        Esta versión de la aplicación no sabe mostrarla. Tu avance sigue
        guardado.
      </Aviso>
    );
  }

  if (definition === null) {
    // B3 — una retirada NO es un fallo pasajero.
    //
    // Aquí se llegaba diciendo «Vuelve a intentarlo en un momento», y eso era
    // falso en los dos sentidos: invitaba a reintentar algo que no va a
    // cambiar nunca, y presentaba una decisión editorial como una avería. Lo
    // que de verdad ocurre es que el capítulo ya no la ofrece y esta persona
    // no tiene un recorrido propio en ella — quien lo tiene llega aquí por
    // identidad exacta y SÍ ve el reproductor.
    return (
      <Aviso titulo="Este recorrido ya no está disponible">
        No forma parte de lo que este capítulo ofrece ahora. Si ya lo habías
        empezado, tu avance sigue guardado.
      </Aviso>
    );
  }

  return (
    <ExperiencePlayer
      actorScope={scope}
      definition={definition}
      bundle={bundle}
    />
  );
}
