import type { Metadata } from "next";

import { isNextThrow, serverFetch } from "@/lib/api.server";
import { estilos as S } from "@/components/circulos/estilos";

/**
 * One circle, for a member.
 *
 * PR3's read surface is per ACTIVITY — `GET /api/circles/activities/:id` — and
 * there is deliberately no "list my circles" or "read this circle" route: a
 * roster endpoint is the thing most likely to leak who is in a Dúo with whom,
 * and it was left out of the engine rather than added speculatively.
 *
 * So this page does not invent one. It carries the circle's own entry point and
 * routes the member to the activity room, which is where the filtered view
 * actually lives. When PR5 adds a roster contract, this is where it lands —
 * building a second source of truth in the browser first would only have to be
 * deleted then.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tu círculo | FeelVerse",
  robots: { index: false, follow: false },
};

async function available(): Promise<boolean> {
  try {
    await serverFetch<{ available: true }>("/circles/access", {
      cache: "no-store",
    });
    return true;
  } catch (err) {
    // A Next redirect means "logged out", not "unavailable". Re-throw it.
    if (isNextThrow(err)) throw err;
    return false;
  }
}

export default async function CirculoPage() {
  if (!(await available())) {
    return (
      <main style={S.page}>
        <h1 style={S.h1}>Círculos todavía no está abierto</h1>
        <p style={S.p}>Te avisaremos cuando esté disponible para tu cuenta.</p>
      </main>
    );
  }

  return (
    <main style={S.page}>
      <header>
        <h1 style={S.h1}>Tu círculo</h1>
        <p style={S.p}>
          Aquí verás las actividades de este círculo y en qué va cada una.
        </p>
      </header>

      <section style={S.section}>
        <h2 style={S.h2}>Todavía no hay nada que mostrar</h2>
        <p style={S.p}>
          Cuando empieces una actividad, podrás entrar a su sala desde aquí. Si
          te invitaron a una, abre el enlace que te enviaron.
        </p>
        <a href="/dashboard/circulos" style={S.secondary}>
          Volver a Círculos
        </a>
      </section>
    </main>
  );
}

/*
 * The circle id is deliberately never rendered. It stays in the address bar,
 * where the person's own navigation put it; printing it into the page would
 * make an internal id something to screenshot, paste into a chat, or index.
 */
