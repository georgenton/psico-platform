"use client";

import { useState } from "react";

/**
 * Book Experience Standard V1 — prototipo visual interno.
 *
 * Autoridad de producto: `docs/product/book-experience-standard-v1.md`.
 *
 * Es una maqueta, y lo dice en pantalla. No reproduce nada, no llama a ninguna
 * API, no lee cookies y no contiene texto de los manuscritos: los párrafos son
 * relleno neutro escrito para esta pantalla. Un prototipo que trae medios
 * falsos identificados como reales sería el mismo problema que este estándar
 * corrige, una capa más arriba.
 */

const MODES = [
  { key: "book", label: "📖 Libro" },
  { key: "audiobook", label: "🎧 Audiolibro" },
  { key: "podcast", label: "🎙️ Podcast" },
  { key: "video", label: "🎬 Video" },
  { key: "guided", label: "🌱 Experiencia guiada" },
] as const;

type ModeKey = (typeof MODES)[number]["key"];

const CARD: React.CSSProperties = {
  background: "var(--color-warm-50, #fbf9f7)",
  border: "1px solid var(--color-warm-200, #e6ded6)",
  borderRadius: 16,
  padding: 16,
};

const MUTED = "var(--color-warm-600, #7a6c60)";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        borderRadius: 999,
        padding: "2px 10px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        background: "var(--color-lavender-100, #eee9f7)",
        color: "var(--color-lavender-700, #5b4a86)",
      }}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 20 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A frame that clearly is NOT a player: no controls, no timeline, no play. */
function PrototypeFrame({ label, height }: { label: string; height: number }) {
  return (
    <div
      role="img"
      aria-label={`${label} — sin reproducción real`}
      style={{
        ...CARD,
        height,
        display: "grid",
        placeItems: "center",
        color: MUTED,
        fontSize: 13,
        fontWeight: 600,
        borderStyle: "dashed",
      }}
    >
      {label}
    </div>
  );
}

function BookView() {
  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700 }}>
        Un encabezado de ejemplo
      </h2>
      <p style={{ marginTop: 12, lineHeight: 1.7 }}>
        Este párrafo es texto de relleno escrito para el prototipo. Sirve para
        ver el ancho de la columna, el interlineado y cómo se comporta la página
        cuando el contenido principal es la lectura.
      </p>
      <p style={{ marginTop: 12, lineHeight: 1.7 }}>
        Un segundo párrafo, con la misma función. El modo Libro no se convierte
        en una colección de tarjetas: la columna de lectura es la experiencia.
      </p>
      <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span style={{ ...CARD, padding: "6px 12px", fontSize: 12 }}>
          ✎ Nota
        </span>
        <span style={{ ...CARD, padding: "6px 12px", fontSize: 12 }}>
          🖍 Resaltar
        </span>
      </div>
    </div>
  );
}

function AudiobookView() {
  return (
    <div>
      <PrototypeFrame label="Prototipo de reproductor" height={120} />
      <Section title="Segmentos">
        <ol style={{ display: "grid", gap: 8 }}>
          {["Apertura", "Desarrollo", "Cierre"].map((s, i) => (
            <li key={s} style={{ ...CARD, padding: 12, fontSize: 13 }}>
              {i + 1}. {s}
            </li>
          ))}
        </ol>
      </Section>
      <Section title="Transcripción">
        <details style={CARD}>
          <summary style={{ cursor: "pointer", fontSize: 13 }}>
            Mostrar transcripción
          </summary>
          <p style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7 }}>
            Texto de relleno. La transcripción acompaña al audio; nunca lo
            sustituye.
          </p>
        </details>
      </Section>
      <Section title="Ideas clave">
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr" }}>
          {["Idea uno", "Idea dos", "Idea tres"].map((c) => (
            <div key={c} style={{ ...CARD, fontSize: 13 }}>
              {c}
            </div>
          ))}
        </div>
      </Section>
      <Section title="Pausa reflexiva">
        <div style={{ ...CARD, fontSize: 13, color: MUTED }}>
          Una pausa opcional. Complementaria, nunca una barrera para escuchar.
        </div>
      </Section>
    </div>
  );
}

function PodcastView() {
  return (
    <div>
      <Section title="Episodios">
        <div style={{ display: "grid", gap: 8 }}>
          {["Episodio de demostración 1", "Episodio de demostración 2"].map(
            (e) => (
              <div key={e} style={{ ...CARD, fontSize: 13 }}>
                {e}
                <div style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>
                  Prototipo · sin audio
                </div>
              </div>
            ),
          )}
        </div>
      </Section>
      <Section title="Notas del episodio">
        <div style={{ ...CARD, fontSize: 13, lineHeight: 1.7 }}>
          Texto de relleno para las show notes.
        </div>
      </Section>
      <Section title="Ideas principales">
        <div style={{ display: "grid", gap: 8 }}>
          {["Idea A", "Idea B"].map((c) => (
            <div key={c} style={{ ...CARD, fontSize: 13 }}>
              {c}
            </div>
          ))}
        </div>
      </Section>
      <Section title="Pregunta de reflexión">
        <div style={{ ...CARD, fontSize: 13, color: MUTED }}>
          Una pregunta abierta, opcional.
        </div>
      </Section>
    </div>
  );
}

function VideoView() {
  return (
    <div>
      <PrototypeFrame label="Prototipo de playlist" height={160} />
      <Section title="Playlist">
        <ol style={{ display: "grid", gap: 8 }}>
          {[
            "Video de demostración 1",
            "Video de demostración 2",
            "Video de demostración 3",
          ].map((v, i) => (
            <li key={v} style={{ ...CARD, padding: 12, fontSize: 13 }}>
              {i + 1}. {v}
            </li>
          ))}
        </ol>
      </Section>
      <Section title="Subtítulos y transcripción">
        <details style={CARD}>
          <summary style={{ cursor: "pointer", fontSize: 13 }}>
            Mostrar transcripción
          </summary>
          <p style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7 }}>
            Texto de relleno.
          </p>
        </details>
      </Section>
      <Section title="Actividad relacionada">
        <div style={{ ...CARD, fontSize: 13, color: MUTED }}>
          Una actividad opcional vinculada al video.
        </div>
      </Section>
    </div>
  );
}

const ROADMAP = [
  { title: "Idea clave 1", state: "Completada" },
  { title: "Idea clave 2", state: "En curso" },
  { title: "Idea clave 3", state: "Pendiente" },
] as const;

function GuidedView() {
  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Badge>Guía breve</Badge>
        <span style={{ fontSize: 12, color: MUTED }}>1 idea del capítulo</span>
      </div>
      <p style={{ marginTop: 12, fontSize: 13, color: MUTED, lineHeight: 1.7 }}>
        Así se ve hoy la Guide V1: una microguía. El recorrido de abajo es a
        dónde va un capítulo extenso.
      </p>

      <Section title="Recorrido del capítulo">
        <ol style={{ display: "grid", gap: 10 }}>
          {ROADMAP.map((u, i) => (
            <li key={u.title} style={CARD}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <strong style={{ fontSize: 14 }}>
                  {i + 1}. {u.title}
                </strong>
                <span style={{ fontSize: 12, color: MUTED }}>{u.state}</span>
              </div>
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  fontSize: 11,
                  color: MUTED,
                }}
              >
                <span>pasaje</span>
                <span aria-hidden>·</span>
                <span>práctica</span>
                <span aria-hidden>·</span>
                <span>recall</span>
                <span aria-hidden>·</span>
                <span>estado</span>
              </div>
            </li>
          ))}
          <li
            style={{ ...CARD, background: "var(--color-lavender-50, #f7f4fc)" }}
          >
            <strong style={{ fontSize: 14 }}>Síntesis</strong>
            <div style={{ marginTop: 4, fontSize: 12, color: MUTED }}>
              Cierre del recorrido.
            </div>
          </li>
        </ol>
      </Section>

      <p
        style={{
          marginTop: 16,
          fontSize: 12,
          color: MUTED,
          lineHeight: 1.7,
        }}
      >
        El roadmap es un prototipo visual. Las ideas reales se seleccionan con
        el autor.
      </p>
    </div>
  );
}

const VIEWS: Record<ModeKey, () => React.JSX.Element> = {
  book: BookView,
  audiobook: AudiobookView,
  podcast: PodcastView,
  video: VideoView,
  guided: GuidedView,
};

export function BookExperiencePrototype() {
  const [mode, setMode] = useState<ModeKey>("book");
  const View = VIEWS[mode];

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: "24px 16px 64px",
        overflowX: "hidden",
      }}
    >
      <header>
        <Badge>Prototipo</Badge>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 10 }}>
          Book Experience Standard V1
        </h1>
        <p
          data-testid="prototype-disclaimer"
          style={{ marginTop: 8, fontSize: 13, color: MUTED, lineHeight: 1.7 }}
        >
          Prototipo visual interno. No reproduce medios reales, no llama a
          ninguna API y no contiene texto de los manuscritos.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Modos del estándar"
        style={{
          marginTop: 20,
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            data-testid={`prototype-mode-${m.key}`}
            aria-selected={mode === m.key}
            onClick={() => setMode(m.key)}
            style={{
              borderRadius: 999,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 600,
              border: "1px solid var(--color-warm-200, #e6ded6)",
              background:
                mode === m.key
                  ? "var(--color-warm-900, #2f2823)"
                  : "transparent",
              color: mode === m.key ? "#fff" : "var(--color-warm-800, #4a3f37)",
              cursor: "pointer",
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <View />
      </div>
    </main>
  );
}
