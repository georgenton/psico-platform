import type { Metadata } from "next";
import { getAccessToken } from "@/lib/api.server";
import { VozRecorder } from "@/components/dashboard/voz/VozRecorder";

export const metadata: Metadata = { title: "Voz" };

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "")}/api`;

/**
 * /dashboard/voz — Sprint front-voz.
 *
 * Voice-to-text companion page invoked from the Diario composer. The page
 * itself is a thin Server Component that injects the API base URL and the
 * access token; all the recording / transcription / UX state lives in the
 * client `VozRecorder` component.
 *
 * URL contract: `?return=/dashboard/diario` lets any caller redirect back
 * to the right place after the user clicks "Usar este texto". Defaults to
 * /dashboard/diario if absent.
 */
export default function VozPage() {
  const accessToken = getAccessToken();

  return (
    <div className="mx-auto max-w-[640px]">
      <header className="mb-5">
        <h1
          className="text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]"
          style={{ color: "var(--color-warm-900)" }}
        >
          Voz
        </h1>
        <p
          className="mt-1.5 text-[14px] leading-relaxed"
          style={{ color: "var(--color-warm-500)" }}
        >
          Habla y nosotros transcribimos. Tu audio no se almacena — solo se
          procesa en el momento para extraer el texto.
        </p>
      </header>

      <VozRecorder apiBase={API_BASE} token={accessToken} />
    </div>
  );
}
