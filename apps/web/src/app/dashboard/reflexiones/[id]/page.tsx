import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { DiaryDetailResponse } from "@psico/types";

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
  // Sólo la entrada, con el cuerpo cifrado entero.
  //
  // Aquí había también un `/user/me` para sacar el `cryptoSalt`. Lo pedía el
  // `DiaryKeyProvider` que este árbol montaba por su cuenta — el que hacía
  // reaparecer la reja al abrir una entrada desde la lista. Sin ese proveedor,
  // el salt no lo necesita nadie: el dueño del estado criptográfico es el
  // armazón del panel, que ya lo tiene. Era además una segunda ida y vuelta
  // encadenada a la primera, pese a que el comentario la llamaba paralela.
  let detail: DiaryDetailResponse;
  try {
    detail = await serverFetch<DiaryDetailResponse>(
      `/reflexiones/entries/${encodeURIComponent(params.id)}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const accessToken = getAccessToken();

  return (
    <div className="mx-auto max-w-[720px]">
      <EntryDetailView detail={detail} apiBase={API_BASE} token={accessToken} />
    </div>
  );
}
