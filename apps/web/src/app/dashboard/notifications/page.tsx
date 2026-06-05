import type { Metadata } from "next";
import type { UserMeResponse } from "@psico/types";

import { isNextThrow, serverFetch } from "@/lib/api.server";
import { NotificationsForm } from "@/components/dashboard/notifications/NotificationsForm";

export const metadata: Metadata = { title: "Notificaciones" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
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
          Notificaciones
        </h1>
        <p
          className="rounded-2xl border-[1.5px] bg-white p-6 text-[13px]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-500)",
          }}
        >
          No pudimos cargar tus preferencias. Reintenta en unos minutos.
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
          Notificaciones
        </h1>
        <p
          className="mt-1 text-[13px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Controla qué te avisamos y cuándo. Estos ajustes aplican tanto al
          email como al push del mobile.
        </p>
      </header>

      <NotificationsForm initial={me.notifications} />
    </div>
  );
}
