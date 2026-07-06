import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { DiaryDetailResponse, UserMeResponse } from "@psico/types";

import { ApiError } from "@/lib/api";
import { getAccessToken, serverFetch } from "@/lib/api.server";
import { EntryDetailView } from "@/components/dashboard/diario/EntryDetailView";

export const metadata: Metadata = { title: "Entrada de diario" };
export const dynamic = "force-dynamic";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "")}/api`;

export default async function DiaryEntryDetailPage({
  params,
}: {
  params: { id: string };
}) {
  // Two parallel fetches: the entry (with full body cipher) and the user
  // (for cryptoSalt — needed when the user lands on this page directly
  // without coming from the list). Both can fail independently.
  let detail: DiaryDetailResponse;
  try {
    detail = await serverFetch<DiaryDetailResponse>(
      `/reflexiones/entries/${encodeURIComponent(params.id)}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const meResult = await serverFetch<UserMeResponse>("/user/me").catch(
    () => null,
  );
  const cryptoSalt = meResult?.cryptoSalt ?? null;
  const accessToken = getAccessToken();

  return (
    <div className="mx-auto max-w-[720px]">
      <EntryDetailView
        detail={detail}
        cryptoSalt={cryptoSalt}
        apiBase={API_BASE}
        token={accessToken}
      />
    </div>
  );
}
