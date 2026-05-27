import type { Metadata } from "next";
import type { DiaryListResponse, DiaryPromptOfTheDay } from "@psico/types";

import { serverFetch } from "@/lib/api.server";
import { Composer } from "@/components/dashboard/diario/Composer";
import { CryptoNotice } from "@/components/dashboard/diario/CryptoNotice";
import { EntryList } from "@/components/dashboard/diario/EntryList";

export const metadata: Metadata = { title: "Diario" };
export const dynamic = "force-dynamic";

export default async function DiarioPage() {
  // Both calls can fail independently; we render whatever succeeded.
  const [entriesResult, promptResult] = await Promise.allSettled([
    serverFetch<DiaryListResponse>("/diario/entries?perPage=30"),
    serverFetch<DiaryPromptOfTheDay | null>("/diario/prompt-of-the-day"),
  ]);

  const entries =
    entriesResult.status === "fulfilled" ? entriesResult.value.entries : [];
  const prompt =
    promptResult.status === "fulfilled" ? promptResult.value : null;

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

      <CryptoNotice />

      <Composer prompt={prompt} />

      <div className="mt-7 mb-3 flex items-baseline justify-between">
        <h2
          className="text-[12px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Entradas recientes
        </h2>
        <span
          className="text-[11px]"
          style={{ color: "var(--color-warm-400)" }}
        >
          {entries.length} {entries.length === 1 ? "entrada" : "entradas"}
        </span>
      </div>

      <EntryList entries={entries} />
    </div>
  );
}
