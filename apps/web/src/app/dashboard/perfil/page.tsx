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
  try {
    me = await serverFetch<UserMeResponse>("/user/me");
  } catch (err) {
    if (isNextThrow(err)) throw err;
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
        <p
          className="rounded-2xl border-[1.5px] bg-white p-6 text-[13px]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-500)",
          }}
        >
          No pudimos cargar tu perfil. Reintenta en unos minutos.
        </p>
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
