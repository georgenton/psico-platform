import type { Metadata } from "next";
import type { HomeResponse } from "@psico/types";

import { ApiError } from "@/lib/api";
import { getAccessToken, getSessionUser, serverFetch } from "@/lib/api.server";
import { ContinueBookCard } from "@/components/dashboard/home/ContinueBookCard";
import { EcoMomentCard } from "@/components/dashboard/home/EcoMomentCard";
import { EmptyHomeState } from "@/components/dashboard/home/EmptyHomeState";
import { GreetingHero } from "@/components/dashboard/home/GreetingHero";
import { InsightTodayCard } from "@/components/dashboard/home/InsightTodayCard";
import { MapaPreviewCard } from "@/components/dashboard/home/MapaPreviewCard";
import { RecosRow } from "@/components/dashboard/home/RecosRow";
import { ReflectionPromptCard } from "@/components/dashboard/home/ReflectionPromptCard";
import { SideRail } from "@/components/dashboard/home/SideRail";
import { StatsGrid } from "@/components/dashboard/home/StatsGrid";

export const metadata: Metadata = { title: "Inicio" };

// Reload the dashboard on every request — it depends on the authenticated
// user's state and stats. The data is cheap to compute (HomeService.getHome
// runs 6 queries in Promise.all) so we trade some latency for freshness.
export const dynamic = "force-dynamic";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "")}/api`;

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

function todayLabel(): string {
  const now = new Date();
  return `${WEEKDAY_LABELS[now.getDay()]} · ${now.getDate()} ${MONTH_LABELS[now.getMonth()]}`;
}

export default async function DashboardPage() {
  const user = getSessionUser();
  const accessToken = getAccessToken();

  let home: HomeResponse | null = null;
  let fetchError = false;
  try {
    home = await serverFetch<HomeResponse>("/home");
  } catch (err) {
    // 404 (user not found) shouldn't happen for an authenticated session, but
    // we don't want to crash the dashboard if the backend hiccups. Render the
    // empty state instead.
    if (!(err instanceof ApiError)) {
      fetchError = true;
    } else if (err.status !== 404 && err.status !== 500) {
      throw err;
    }
    fetchError = true;
  }

  const firstName =
    home?.user.firstName ?? user?.email?.split("@")[0] ?? "amigo";

  if (!home || fetchError) {
    return (
      <div className="mx-auto max-w-[1080px]">
        <EmptyHomeState firstName={firstName} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1080px]">
      <GreetingHero
        user={home.user}
        greeting={home.greeting}
        todayLabel={todayLabel()}
      />

      {/* Sprint B3: insight del día — siempre arriba, antes que cualquier
          card específica del producto. La narrativa de la jornada manda. */}
      <div className="mb-5">
        <InsightTodayCard insight={home.insightToday} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_300px] lg:items-start">
        {/* Main column */}
        <div className="flex flex-col gap-5">
          {home.continueBook ? (
            <ContinueBookCard book={home.continueBook} />
          ) : null}
          {home.ecoMoment ? <EcoMomentCard moment={home.ecoMoment} /> : null}
          <RecosRow recos={home.recos} />
          <StatsGrid stats={home.stats} />
          {home.reflectionPrompt ? (
            <ReflectionPromptCard
              prompt={home.reflectionPrompt}
              apiBase={API_BASE}
              token={accessToken}
            />
          ) : null}
        </div>

        {/* Side rail — Sprint B3: agrega MapaPreviewCard arriba del rail. */}
        <div className="flex flex-col gap-5">
          <MapaPreviewCard />
          <SideRail
            user={home.user}
            stats={home.stats}
            shortcuts={home.shortcuts}
          />
        </div>
      </div>
    </div>
  );
}
