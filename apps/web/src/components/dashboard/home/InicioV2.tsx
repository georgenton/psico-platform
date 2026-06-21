import Link from "next/link";
import type { HomeResponse } from "@psico/types";

import { Radar } from "@/components/dashboard/shell/Radar";
import {
  IconArrowRight,
  IconBook,
  IconEco,
  IconFlame,
  IconMap,
  IconPatterns,
  IconPencil,
  IconTrendUp,
  IconWind,
} from "@/components/dashboard/shell/icons";

const WEEKDAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
const MONTH_LABELS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

function todayLabel(city: string | null): string {
  const now = new Date();
  const base = `${WEEKDAY_LABELS[now.getDay()]} · ${now.getDate()} ${MONTH_LABELS[now.getMonth()]}`;
  return city ? `${base} · ${city}` : base;
}

/**
 * InicioV2 — Sprint B6 visual parity.
 *
 * Server Component that renders the Inicio screen using the design's class
 * names (`.greet`, `.mood-checkin`, `.home-hero`, `.metrics`, `.continue`,
 * `.eco-rec`, `.activity`). Data comes from the same `HomeResponse` the
 * previous version consumed, plus a placeholder week-strip and activity
 * timeline that Sprint C will replace with `/api/activity` real data.
 */
export function InicioV2({ home }: { home: HomeResponse }) {
  const insight = home.insightToday;
  const continueBook = home.continueBook;
  const ecoMoment = home.ecoMoment;

  const continuePct = continueBook?.progressPct ?? 0;
  const continueEta = continueBook
    ? Math.max(1, Math.round((100 - continuePct) * 0.25))
    : 0;

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <div className="greet-eyebrow">{todayLabel(home.user.city)}</div>
        <div className="greet">
          {home.greeting.text}, {home.user.firstName}.
        </div>
        <div className="greet-sub">
          {home.greeting.subtitle ?? "Una pausa para mirar hacia adentro."}
        </div>
      </div>

      {/* Hero 2-col: Insight + Mini Mapa */}
      <div className="home-hero">
        <div className="card insight">
          <div className="ins-top">
            <span className="card-tag">
              {insight?.kind === "streak"
                ? "Tu racha"
                : insight?.kind === "mood-trend"
                  ? "Patrón emocional"
                  : insight?.kind === "book-progress"
                    ? "Tu lectura"
                    : "Insight del día"}
            </span>
            <span className="ins-date">Generado por Eco</span>
          </div>
          <q>
            {insight?.body ??
              "Tu mapa se construye con cada práctica. Hoy es un buen día para mirarte con calma."}
          </q>
          <div className="ins-foot">
            <span className="av">
              <IconEco size={16} />
            </span>
            <span>
              A partir de tu actividad reciente · solo tú puedes verlo
            </span>
          </div>
        </div>

        <div className="card mini-map">
          <div className="mm-head">
            <div className="mm-title">
              <span className="d" />
              Tu Mapa Emocional
            </div>
            <Link href="/dashboard/mapa" className="mm-link">
              Ver completo →
            </Link>
          </div>
          <div className="radar-holder">
            <Radar size={200} />
          </div>
          <div className="mm-foot">
            <b>74%</b>
            <span>
              Comprensión
              <br />
              emocional
            </span>
          </div>
        </div>
      </div>

      <div className="sec-label">Tu progreso de comprensión</div>
      <div className="metrics">
        <div className="metric">
          <span className="mg">
            <IconPencil size={19} />
          </span>
          <b>{home.stats.entriesThisWeek + 0}</b>
          <span className="lbl">Reflexiones</span>
          <span className="trend">
            <IconTrendUp size={13} />+{home.stats.entriesThisWeek} esta semana
          </span>
        </div>
        <div className="metric">
          <span className="mg">
            <IconMap size={19} />
          </span>
          <b>{home.stats.weeklyGoalPct ?? 0}</b>
          <span className="lbl">Insights</span>
          <span className="trend">
            <IconTrendUp size={13} />
            +este mes
          </span>
        </div>
        <div className="metric">
          <span className="mg">
            <IconPatterns size={19} />
          </span>
          <b>{home.recos.length}</b>
          <span className="lbl">Patrones</span>
          <span className="trend">
            <IconTrendUp size={13} />
            detectados
          </span>
        </div>
        <div className="metric">
          <span className="mg">
            <IconWind size={19} />
          </span>
          {/* TODO senior: backend HomeStats.exercisesThisWeek missing.
              Using minutesThisWeek as proxy until /api/home counts exercises. */}
          <b>{home.stats.minutesThisWeek}</b>
          <span className="lbl">Ejercicios</span>
          <span className="trend">
            <IconTrendUp size={13} />
            esta semana
          </span>
        </div>
        <div className="metric">
          <span className="mg">
            <IconFlame size={19} />
          </span>
          <b>{home.user.streakDays}</b>
          <span className="lbl">Días seguidos</span>
          <span className="trend">
            <IconTrendUp size={13} />
            tu racha actual
          </span>
        </div>
      </div>

      <div className="home-cols">
        {continueBook ? (
          <div className="card continue">
            <span className="card-tag">Continúa tu recorrido</span>
            <div className="c-row" style={{ marginTop: 16 }}>
              <div className="cover">
                <IconBook size={24} />
              </div>
              <div className="c-meta">
                <div className="c-eyebrow">
                  Capítulo {continueBook.chapterN}
                </div>
                <div className="c-title">
                  {continueBook.title} — {continueBook.chapterTitle}
                </div>
                <div className="bar">
                  <i style={{ width: `${continuePct}%` }} />
                </div>
                <div className="c-pct">
                  {continuePct}% completado · ~{continueEta} min para terminar
                </div>
              </div>
            </div>
            <div className="c-foot">
              <span className="note">
                <IconMap size={15} />
                Este capítulo conecta con tu camino actual
              </span>
              <Link
                href={`/dashboard/biblioteca/${continueBook.bookId}/lector/${continueBook.chapterN}`}
                className="btn primary"
                style={{ textDecoration: "none" }}
              >
                Seguir leyendo →
              </Link>
            </div>
          </div>
        ) : null}

        {ecoMoment ? (
          <div className="card eco-rec">
            <div className="er-head">
              <span className="er-glyph">
                <IconEco size={20} />
              </span>
              <div>
                <div className="er-name">Eco te sugiere</div>
                <div className="er-status">Disponible ahora</div>
              </div>
            </div>
            <div className="er-body">{ecoMoment.prompt}</div>
            <div className="er-actions">
              <Link
                href="/dashboard/eco"
                className="er-btn w"
                style={{ textDecoration: "none" }}
              >
                Conversar
              </Link>
              <button type="button" className="er-btn o">
                Ahora no
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Hilo de reflexión · activity timeline. v1 stubs the activity list with
          the continueBook + ecoMoment we already have; Sprint C wires
          /api/activity for the real timeline. */}
      <div className="card continue activity">
        <div className="r-head">
          <span className="card-tag sage">
            Tu hilo de reflexión · todo alimenta tu mapa
          </span>
          <Link href="/dashboard/reflexiones" className="r-all">
            Ver todas →
          </Link>
        </div>
        <Link
          href="/dashboard/reflexiones"
          className="r-capture"
          style={{ textDecoration: "none" }}
        >
          <span className="rc-ava">{home.user.firstName.charAt(0)}</span>
          <span className="rc-prompt">¿Qué notaste sobre ti hoy?</span>
          <span className="rc-btn">
            <IconPencil size={15} />
            Escribir
          </span>
        </Link>
        <div className="act-list" style={{ marginTop: 8 }}>
          {continueBook ? (
            <div className="act">
              <span className="ag">
                <IconBook size={18} />
              </span>
              <div className="a-meta">
                <div className="a-title">Lectura en curso</div>
                <div className="a-sub">
                  {continueBook.title} · capítulo {continueBook.chapterN}
                </div>
              </div>
              <span className="a-fed">+ camino</span>
              <span className="a-time">en curso</span>
            </div>
          ) : null}
          {ecoMoment ? (
            <div className="act">
              <span className="ag">
                <IconEco size={18} />
              </span>
              <div className="a-meta">
                <div className="a-title">Eco te espera</div>
                <div className="a-sub">{ecoMoment.prompt.slice(0, 80)}…</div>
              </div>
              <span className="a-fed">+ pendiente</span>
              <span className="a-time">hoy</span>
            </div>
          ) : null}
          <div className="act">
            <span className="ag sage">
              <IconWind size={18} />
            </span>
            <div className="a-meta">
              <div className="a-title">Empieza con una respiración</div>
              <div className="a-sub">
                Tres minutos de aire — más fácil de lo que parece
              </div>
            </div>
            <span className="a-fed">+ calma</span>
            <span className="a-time">2 min</span>
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 36,
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: "var(--color-warm-500)",
          fontSize: 12,
        }}
      >
        <IconArrowRight size={14} />
        Explora una ruta temática en{" "}
        <Link
          href="/dashboard/exploraciones"
          style={{ color: "var(--color-lavender-700)", fontWeight: 600 }}
        >
          Exploraciones
        </Link>
        .
      </div>
    </>
  );
}
