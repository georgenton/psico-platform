import type { Metadata } from "next";
import Link from "next/link";
import type { CrisisResponse } from "@psico/types";
import { isNextThrow, serverFetch } from "@/lib/api.server";

export const metadata: Metadata = { title: "Apoyo inmediato · Terapia" };
export const dynamic = "force-dynamic";

export default async function CrisisPage() {
  let data: CrisisResponse | null = null;
  let loadError: string | null = null;
  try {
    data = await serverFetch<CrisisResponse>("/terapia/crisis?country=EC");
  } catch (err) {
    if (isNextThrow(err)) throw err;
    loadError = err instanceof Error ? err.message : "Error desconocido";
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link
        href="/dashboard/terapia"
        className="text-[13px]"
        style={{ color: "var(--color-lavender-700)" }}
      >
        ← Volver al hub
      </Link>

      <header
        className="rounded-2xl border-[1.5px] p-5"
        style={{
          background: "var(--color-rose-50)",
          borderColor: "var(--color-rose-200)",
        }}
      >
        <h1
          className="text-[22px] font-bold"
          style={{ color: "var(--color-rose-700)" }}
        >
          Estás haciendo lo correcto
        </h1>
        <p
          className="mt-2 text-[14px] leading-relaxed"
          style={{ color: "var(--color-rose-700)" }}
        >
          Acá hay líneas que te pueden escuchar ahora mismo. Llamar es un paso
          valiente.
        </p>
      </header>

      {loadError ? (
        <p
          className="rounded-2xl border-[1.5px] bg-white p-5 text-[13px]"
          style={{
            borderColor: "var(--color-rose-200)",
            color: "var(--color-rose-700)",
          }}
        >
          {loadError}
        </p>
      ) : null}

      {data ? (
        <>
          <section>
            <h2
              className="mb-2 text-[12px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--color-warm-500)" }}
            >
              Líneas en {data.country === "EC" ? "Ecuador" : data.country}
            </h2>
            <ul className="space-y-2">
              {data.lines.map((line) => (
                <li
                  key={line.id}
                  className="rounded-2xl border-[1.5px] bg-white p-4"
                  style={{ borderColor: "var(--color-warm-200)" }}
                >
                  <p
                    className="text-[15px] font-semibold"
                    style={{ color: "var(--color-warm-900)" }}
                  >
                    {line.name}
                  </p>
                  <p
                    className="mt-0.5 text-[12px]"
                    style={{ color: "var(--color-warm-500)" }}
                  >
                    {line.availability} · {line.languages.join(", ")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={`tel:${line.phone.replace(/[^+0-9]/g, "")}`}
                      className="rounded-xl px-4 py-2 text-[13px] font-medium text-white"
                      style={{ background: "var(--color-rose-600)" }}
                    >
                      📞 Llamar {line.phone}
                    </a>
                    {line.whatsapp ? (
                      <a
                        href={`https://wa.me/${line.whatsapp.replace(/[^0-9]/g, "")}`}
                        className="rounded-xl border-[1.5px] bg-white px-4 py-2 text-[13px] font-medium"
                        style={{
                          borderColor: "var(--color-sage-300)",
                          color: "var(--color-sage-700)",
                        }}
                      >
                        WhatsApp
                      </a>
                    ) : null}
                    {line.chatUrl ? (
                      <a
                        href={line.chatUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl border-[1.5px] bg-white px-4 py-2 text-[13px] font-medium"
                        style={{
                          borderColor: "var(--color-lavender-300)",
                          color: "var(--color-lavender-700)",
                        }}
                      >
                        Chat web
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section
            className="rounded-2xl border-[1.5px] bg-white p-5"
            style={{ borderColor: "var(--color-warm-200)" }}
          >
            <h2
              className="text-[14px] font-semibold"
              style={{ color: "var(--color-warm-900)" }}
            >
              Mientras tanto
            </h2>
            <ul
              className="mt-3 list-disc space-y-2 pl-5 text-[13px] leading-relaxed"
              style={{ color: "var(--color-warm-700)" }}
            >
              {data.safetyTipsShort.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </section>

          <section
            className="rounded-2xl border-[1.5px] bg-white p-5"
            style={{ borderColor: "var(--color-warm-200)" }}
          >
            <h2
              className="text-[14px] font-semibold"
              style={{ color: "var(--color-warm-900)" }}
            >
              Próximos pasos
            </h2>
            <ul
              className="mt-3 list-decimal space-y-2 pl-5 text-[13px] leading-relaxed"
              style={{ color: "var(--color-warm-700)" }}
            >
              {data.nextSteps.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
