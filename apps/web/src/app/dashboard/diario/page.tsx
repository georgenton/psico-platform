import type { Metadata } from "next";
import type {
  DiaryListResponse,
  DiaryPromptOfTheDay,
  UserMeResponse,
} from "@psico/types";

import { getAccessToken, serverFetch } from "@/lib/api.server";
import { DiarioShell } from "@/components/dashboard/diario/DiarioShell";

export const metadata: Metadata = { title: "Diario" };
export const dynamic = "force-dynamic";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "")}/api`;

export default async function DiarioPage() {
  // Three parallel fetches: entries (list), prompt (rotation), me (for the
  // cryptoSalt). Each can fail independently — we degrade gracefully.
  const [entriesResult, promptResult, meResult] = await Promise.allSettled([
    serverFetch<DiaryListResponse>("/diario/entries?perPage=30"),
    serverFetch<DiaryPromptOfTheDay | null>("/diario/prompt-of-the-day"),
    serverFetch<UserMeResponse>("/user/me"),
  ]);

  const entries =
    entriesResult.status === "fulfilled" ? entriesResult.value.entries : [];
  const prompt =
    promptResult.status === "fulfilled" ? promptResult.value : null;
  const cryptoSalt =
    meResult.status === "fulfilled" ? meResult.value.cryptoSalt : null;
  const accessToken = getAccessToken();

  return (
    <div className="mx-auto max-w-[720px]">
      <header className="mb-5">
        <h1
          className="text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]"
          style={{ color: "var(--color-warm-900)" }}
        >
          Tu diario
        </h1>
        <p
          className="mt-1.5 text-[14px] leading-relaxed"
          style={{ color: "var(--color-warm-500)" }}
        >
          Un espacio para nombrar lo que pasa adentro. Cifrado en tu
          dispositivo.
        </p>
      </header>

      <DiarioShell
        cryptoSalt={cryptoSalt}
        entries={entries}
        prompt={prompt}
        apiBase={API_BASE}
        token={accessToken}
      />
    </div>
  );
}
