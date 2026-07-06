import Link from "next/link";
import type { ActivityFeedItemType, HomeResponse } from "@psico/types";

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

/** Map activity feed type → matching nav icon. Keeps the timeline
 *  visually coherent with the rest of the dashboard. */
const ACTIVITY_ICON: Record<
  ActivityFeedItemType,
  (props: { size?: number }) => React.ReactNode
> = {
  diary: IconPencil,
  reading: IconBook,
  eco: IconEco,
  voice: IconWind,
};

/** Sprint F3 — surface what each activity contributes to the user's map.
 *  Mirrors the design's `.a-fed` chip ("+ mapa", "+ patrón", "+ calma").
 *  Keep these short — they're the third column of a row that already has
 *  a title + subtitle. */
const ACTIVITY_FED: Record<ActivityFeedItemType, string> = {
  diary: "+ mapa",
  reading: "+ comprensión",
  eco: "+ patrón",
  voice: "+ calma",
};

/** Compact relative timestamp ("ahora", "hace 2h", "ayer", "21 jun").
 *  Server Component-safe — uses `new Date()` only inside the function, so
 *  hydration sees the same value the server rendered. */
function relativeFrom(iso: string): string {
  const t = new Date(iso).getTime();
  const diffMin = Math.round((Date.now() - t) / 60_000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH}h`;
  const diffD = Math.round(diffH / 24);
  if (diffD === 1) return "ayer";
  if (diffD < 7) return `hace ${diffD}d`;
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`;
}

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
          {home.emotionalMap.pct === 0 &&
          home.emotionalMap.values.every((v) => v === 0) ? (
            <div className="radar-holder">
              <div
                style={{
                  padding: "36px 20px",
                  textAlign: "center",
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "var(--color-warm-500)",
                }}
              >
                Empieza a leer o a escribir una reflexión y tu Mapa Emocional se
                irá dibujando aquí.
              </div>
            </div>
          ) : (
            <>
              <div className="radar-holder">
                <Radar size={200} values={home.emotionalMap.values} />
              </div>
              <div className="mm-foot">
                <b>{home.emotionalMap.pct}%</b>
                <span>
                  Comprensión
                  <br />
                  emocional
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="sec-label">Tu progreso de comprensión</div>
      <div className="metrics">
        <div className="metric">
          <span className="mg">
            <IconPencil size={19} />
          </span>
          <b>{home.stats.entriesThisWeek}</b>
          <span className="lbl">Reflexiones</span>
          <span className="trend">
            <IconTrendUp size={13} />
            esta semana
          </span>
        </div>
        <div className="metric">
          <span className="mg">
            <IconMap size={19} />
          </span>
          <b>{home.stats.insightsCount}</b>
          <span className="lbl">Insights</span>
          <span className="trend">
            <IconTrendUp size={13} />
            de Eco
          </span>
        </div>
        <div className="metric">
          <span className="mg">
            <IconPatterns size={19} />
          </span>
          <b>{home.stats.patternsCount}</b>
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
          <b>{home.stats.minutesThisWeek}</b>
          <span className="lbl">Minutos de lectura</span>
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

      {/* Hilo de reflexión · activity timeline. Sprint D wires /api/activity
          (top-5 interleaved Reflexiones + Lectura + Eco + Voz). The empty
          state still surfaces the breathing nudge so the card never lands
          fully blank on a brand-new account. */}
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
          {home.activity.items.length > 0 ? (
            home.activity.items.map((it) => {
              const Icon = ACTIVITY_ICON[it.type];
              const meta = (
                <>
                  <span className={`ag${it.type === "voice" ? " sage" : ""}`}>
                    <Icon size={18} />
                  </span>
                  <div className="a-meta">
                    <div className="a-title">{it.title}</div>
                    <div className="a-sub">{it.subtitle}</div>
                  </div>
                  <span className="a-fed">{ACTIVITY_FED[it.type]}</span>
                  <span className="a-time">{relativeFrom(it.timestamp)}</span>
                </>
              );
              return it.href ? (
                <Link
                  key={it.id}
                  href={it.href}
                  className="act"
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  {meta}
                </Link>
              ) : (
                <div key={it.id} className="act">
                  {meta}
                </div>
              );
            })
          ) : (
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
          )}
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
