import type { Metadata } from "next";
import type { UserMeResponse } from "@psico/types";

import { getAccessToken, serverFetch } from "@/lib/api.server";
import { ChangePasswordCard } from "@/components/dashboard/security/ChangePasswordCard";
import { DiaryLockCard } from "@/components/dashboard/security/DiaryLockCard";
import { LocalTextAnalysisCard } from "@/components/dashboard/security/LocalTextAnalysisCard";
import { ReplayTourCard } from "@/components/dashboard/security/ReplayTourCard";
import { ShowSeedPhraseCard } from "@/components/dashboard/security/ShowSeedPhraseCard";

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
      {/* Sprint G3 — generic screen-head for consistency with the design's
          internal screens. Design HTML v2 doesn't cover settings pages, so
          we apply the same eb + title pattern as a coherence sweep. */}
      <div className="screen-head">
        <div className="screen-title">
          <span className="eb">Cuenta y privacidad</span>
          Seguridad
        </div>
      </div>
      <p className="screen-sub" style={{ margin: "-14px 0 26px" }}>
        Cambia tu contraseña, gestiona el acceso a tu cuenta y revisa tu frase
        de recuperación.
      </p>

      <div className="space-y-5">
        <ChangePasswordCard
          cryptoSalt={meResult.cryptoSalt}
          apiBase={API_BASE}
          token={token}
        />
        <DiaryLockCard />
        <LocalTextAnalysisCard
          initialEnabled={meResult.privacy.localTextAnalysis}
          apiBase={API_BASE}
          token={token}
        />
        <ShowSeedPhraseCard cryptoSalt={meResult.cryptoSalt} />
        <ReplayTourCard />
      </div>
    </div>
  );
}
