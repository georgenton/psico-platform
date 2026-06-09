import type { Metadata } from "next";
import Link from "next/link";
import type { UserMeResponse } from "@psico/types";

import { isNextThrow, serverFetch } from "@/lib/api.server";
import { AchievementsGrid } from "@/components/dashboard/perfil/AchievementsGrid";
import { AvatarUploadCard } from "@/components/dashboard/perfil/AvatarUploadCard";
import { DangerZone } from "@/components/dashboard/perfil/DangerZone";
import { EditProfileCard } from "@/components/dashboard/perfil/EditProfileCard";
import { EmailChangeCard } from "@/components/dashboard/perfil/EmailChangeCard";
import { ProfileHeader } from "@/components/dashboard/perfil/ProfileHeader";
import { StatsGrid } from "@/components/dashboard/perfil/StatsGrid";

export const metadata: Metadata = { title: "Perfil" };
export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  let me: UserMeResponse | null = null;
  let loadError: string | null = null;
  try {
    me = await serverFetch<UserMeResponse>("/user/me");
  } catch (err) {
    if (isNextThrow(err)) throw err;
    loadError =
      err instanceof Error ? err.message : "Error desconocido al cargar.";
  }

  if (!me) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1
          className="mb-3 text-[26px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Perfil
        </h1>
        <div
          className="rounded-2xl border-[1.5px] bg-white p-6"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <p
            className="text-[13px]"
            style={{ color: "var(--color-warm-700)" }}
          >
            No pudimos cargar tu perfil.
          </p>
          {loadError ? (
            <p
              className="mt-2 font-mono text-[12px]"
              style={{ color: "var(--color-rose-600)" }}
            >
              {loadError}
            </p>
          ) : null}
          <div className="mt-4 flex gap-2">
            <Link
              href="/dashboard/perfil"
              className="rounded-xl border-[1.5px] bg-white px-3 py-1.5 text-[12px] font-medium"
              style={{
                borderColor: "var(--color-warm-300)",
                color: "var(--color-warm-700)",
              }}
            >
              Reintentar
            </Link>
            <Link
              href="/logout"
              className="rounded-xl px-3 py-1.5 text-[12px] font-medium text-white"
              style={{ background: "var(--color-rose-600)" }}
            >
              Cerrar sesión y volver a entrar
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1
          className="text-[26px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Perfil
        </h1>
        <p
          className="mt-1 text-[13px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Tus datos, tu actividad y los ajustes de la cuenta.
        </p>
      </header>

      <ProfileHeader me={me} />
      <StatsGrid stats={me.stats} />
      <AvatarUploadCard me={me} />
      <EditProfileCard me={me} />
      <EmailChangeCard me={me} />
      <AchievementsGrid achievements={me.achievements} />
      <ShortcutsGrid />
      <DangerZone me={me} />
    </div>
  );
}

function ShortcutsGrid() {
  const items = [
    {
      href: "/dashboard/notifications",
      title: "Notificaciones",
      hint: "Push, email digest, recordatorios",
      icon: "🔔",
    },
    {
      href: "/dashboard/security",
      title: "Seguridad",
      hint: "Contraseña, frase de respaldo",
      icon: "🔐",
    },
    {
      href: "/dashboard/plan",
      title: "Mi plan",
      hint: "Suscripción, uso, facturas",
      icon: "💳",
    },
  ];
  return (
    <section data-testid="shortcuts-grid">
      <h2
        className="mb-2 text-[14px] font-semibold"
        style={{ color: "var(--color-warm-900)" }}
      >
        Ajustes
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="rounded-2xl border-[1.5px] bg-white p-4 transition hover:bg-[var(--color-warm-50)]"
            style={{ borderColor: "var(--color-warm-200)" }}
            data-testid={`shortcut-${it.title}`}
          >
            <div className="text-[20px]" aria-hidden>
              {it.icon}
            </div>
            <p
              className="mt-1 text-[13px] font-semibold"
              style={{ color: "var(--color-warm-900)" }}
            >
              {it.title}
            </p>
            <p
              className="mt-0.5 text-[11px]"
              style={{ color: "var(--color-warm-500)" }}
            >
              {it.hint}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
