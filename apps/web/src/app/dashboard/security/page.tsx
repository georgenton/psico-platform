import type { Metadata } from "next";
import type { UserMeResponse } from "@psico/types";

import { getAccessToken, serverFetch } from "@/lib/api.server";
import { ChangePasswordCard } from "@/components/dashboard/security/ChangePasswordCard";

export const metadata: Metadata = { title: "Seguridad" };
export const dynamic = "force-dynamic";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "")}/api`;

/**
 * /dashboard/security — for now, this page hosts a single card: password
 * change with E2E re-encrypt. Future iterations add 2FA, active sessions,
 * etc. We keep the route name generic on purpose so we don't need a
 * redirect later.
 */
export default async function SecurityPage() {
  const meResult = await serverFetch<UserMeResponse>("/user/me");
  const token = getAccessToken();

  return (
    <div className="mx-auto max-w-[720px]">
      <header className="mb-5">
        <h1
          className="text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]"
          style={{ color: "var(--color-warm-900)" }}
        >
          Seguridad
        </h1>
        <p
          className="mt-1.5 text-[14px] leading-relaxed"
          style={{ color: "var(--color-warm-500)" }}
        >
          Cambia tu contraseña, gestiona el acceso a tu cuenta y revisa tu frase
          de recuperación.
        </p>
      </header>

      <ChangePasswordCard
        cryptoSalt={meResult.cryptoSalt}
        apiBase={API_BASE}
        token={token}
      />
    </div>
  );
}
