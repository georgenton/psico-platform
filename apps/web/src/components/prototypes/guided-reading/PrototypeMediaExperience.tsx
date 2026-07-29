"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./guided-reading-prototype.module.css";
import {
  AUDIOBOOK,
  EVOLUTION_NOTE,
  PODCAST,
  VIDEO,
  type ListenTrack,
} from "./guided-reading-prototype.fixture";

function mmss(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Reproductor simulado.
 *
 * No hay audio ni video reales: «reproducir» avanza un reloj local para que la
 * línea de tiempo se vea viva durante la revisión. La velocidad afecta a ese
 * reloj —1.5× avanza una vez y media por segundo— para que el control se sienta
 * conectado a algo. El hosting de medios se decide en GR-2
 * (`MEDIA_HOSTING_PROVIDER=TBD_UNTIL_GR2`).
 */
function SimulatedPlayer({
  label,
  totalSeconds,
  totalLabel,
  startSeconds,
  speeds,
}: {
  label: string;
  totalSeconds: number;
  totalLabel: string;
  startSeconds: number;
  speeds: readonly number[];
}) {
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(startSeconds);
  const [speed, setSpeed] = useState(1);
  // El intervalo lee la velocidad viva por referencia: cambiarla no reinicia
  // la reproducción.
  const speedRef = useRef(1);
  speedRef.current = speed;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setPosition((current) =>
        Math.min(totalSeconds, current + speedRef.current),
      );
    }, 1000);
    return () => clearInterval(id);
  }, [playing, totalSeconds]);

  const pct = totalSeconds > 0 ? (position / totalSeconds) * 100 : 0;

  return (
    <div data-testid="simulated-player" data-speed={speed}>
      <div className={styles.playerRow}>
        <button
          type="button"
          className={styles.playButton}
          aria-label={playing ? `Pausar ${label}` : `Reproducir ${label}`}
          onClick={() => setPlaying((value) => !value)}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <span className={styles.timeLabel} data-testid="player-clock">
          {mmss(position)}
        </span>
        <div
          className={styles.timeline}
          role="progressbar"
          aria-label={`Progreso de ${label}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
        >
          <span
            className={styles.timelineFill}
            style={{ width: `${pct}%`, display: "block" }}
          />
        </div>
        <span className={styles.timeLabel}>{totalLabel}</span>
      </div>
      <div className={styles.rowWrap}>
        <span className={styles.timeLabel}>Velocidad</span>
        {speeds.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={speed === value}
            onClick={() => setSpeed(value)}
            className={`${styles.chip} ${speed === value ? styles.chipOn : ""}`}
          >
            {value}×
          </button>
        ))}
      </div>
    </div>
  );
}

/** La misma línea en las tres modalidades: qué se registrará al terminar. */
function EvolutionNote() {
  return (
    <p className={styles.evolutionNote} data-testid="evolution-note">
      {EVOLUTION_NOTE}
    </p>
  );
}

function ListenExperience() {
  const [track, setTrack] = useState<ListenTrack>("audiobook");

  return (
    <section className={styles.mediaCard} aria-label="Escuchar el capítulo">
      <div
        className={styles.mediaTabs}
        role="tablist"
        aria-label="Formato de audio"
      >
        <button
          type="button"
          role="tab"
          aria-selected={track === "audiobook"}
          onClick={() => setTrack("audiobook")}
          className={`${styles.chip} ${track === "audiobook" ? styles.chipOn : ""}`}
        >
          Audiolibro
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={track === "podcast"}
          onClick={() => setTrack("podcast")}
          className={`${styles.chip} ${track === "podcast" ? styles.chipOn : ""}`}
        >
          Podcast
        </button>
      </div>

      {track === "audiobook" ? (
        <div>
          <h2 className={styles.mediaTitle}>{AUDIOBOOK.title}</h2>
          <p className={styles.mediaSubtitle}>{AUDIOBOOK.subtitle}</p>
          <SimulatedPlayer
            label="el audiolibro"
            totalSeconds={AUDIOBOOK.totalSeconds}
            totalLabel={AUDIOBOOK.totalLabel}
            startSeconds={AUDIOBOOK.startSeconds}
            speeds={AUDIOBOOK.speeds}
          />
          <p className={styles.sectionLabel}>Marcas del capítulo</p>
          <ul className={styles.listReset}>
            {AUDIOBOOK.marks.map((mark) => (
              <li key={mark.at} className={styles.listRow}>
                <span className={styles.timeLabel}>{mark.at}</span>
                <span>{mark.label}</span>
              </li>
            ))}
          </ul>
          <EvolutionNote />
        </div>
      ) : (
        <div>
          <h2 className={styles.mediaTitle}>{PODCAST.title}</h2>
          <p className={styles.mediaSubtitle}>
            {PODCAST.format} · {PODCAST.targetLabel}
          </p>
          <SimulatedPlayer
            label="el podcast"
            totalSeconds={PODCAST.totalSeconds}
            totalLabel={PODCAST.totalLabel}
            startSeconds={PODCAST.startSeconds}
            speeds={PODCAST.speeds}
          />
          <p className={styles.sectionLabel}>Notas del episodio</p>
          <ul className={styles.listReset}>
            {PODCAST.showNotes.map((note) => (
              <li key={note} className={styles.listRow}>
                <span>{note}</span>
              </li>
            ))}
          </ul>
          <EvolutionNote />
        </div>
      )}
    </section>
  );
}

function WatchExperience() {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [subtitles, setSubtitles] = useState(true);

  return (
    <section className={styles.mediaCard} aria-label="Ver el capítulo">
      <div className={styles.videoHead}>
        <div
          className={`${styles.poster} ${audioOnly ? styles.posterAudio : ""}`}
          data-testid="video-poster"
          data-representation={audioOnly ? "audio" : "video"}
        >
          <span aria-hidden="true" style={{ fontSize: "var(--text-3xl)" }}>
            {audioOnly ? "◍" : "▶"}
          </span>
          <span className={styles.posterCaption}>
            {audioOnly ? VIDEO.audioOnlyCaption : VIDEO.posterCaption}
          </span>
          {subtitles && !audioOnly ? (
            <span className={styles.subtitleLine} data-testid="video-subtitle">
              {VIDEO.subtitleLine}
            </span>
          ) : null}
        </div>

        <div className={styles.videoMeta}>
          <h2 className={styles.mediaTitle}>{VIDEO.title}</h2>
          <p className={styles.mediaSubtitle}>
            {VIDEO.subtitle} · {VIDEO.targetLabel} · {VIDEO.totalLabel}
          </p>

          <SimulatedPlayer
            label="la videoexplicación"
            totalSeconds={492}
            totalLabel={VIDEO.totalLabel}
            startSeconds={0}
            speeds={[0.75, 1, 1.25, 1.5]}
          />

          <div className={styles.rowWrap}>
            <button
              type="button"
              aria-pressed={subtitles}
              onClick={() => setSubtitles((value) => !value)}
              className={`${styles.chip} ${subtitles ? styles.chipOn : ""}`}
            >
              Subtítulos
            </button>
            <button
              type="button"
              aria-pressed={audioOnly}
              onClick={() => setAudioOnly((value) => !value)}
              className={`${styles.chip} ${audioOnly ? styles.chipOn : ""}`}
            >
              Solo audio
            </button>
            <button
              type="button"
              aria-expanded={transcriptOpen}
              onClick={() => setTranscriptOpen((value) => !value)}
              className={`${styles.chip} ${transcriptOpen ? styles.chipOn : ""}`}
            >
              Transcripción
            </button>
          </div>
        </div>
      </div>

      {transcriptOpen ? (
        <div className={styles.transcriptBox}>
          {VIDEO.transcript.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}

      <p className={styles.sectionLabel}>Capítulos del video</p>
      <ul className={styles.listReset}>
        {VIDEO.chapters.map((chapter) => (
          <li key={chapter.at} className={styles.listRow}>
            <span className={styles.timeLabel}>{chapter.at}</span>
            <span>{chapter.title}</span>
          </li>
        ))}
      </ul>

      <EvolutionNote />
    </section>
  );
}

/** Modalidades Escuchar y Ver. Ambas son representaciones visuales. */
export function PrototypeMediaExperience({
  mode,
}: {
  mode: "listen" | "watch";
}) {
  return mode === "listen" ? <ListenExperience /> : <WatchExperience />;
}
