import Link from "next/link";

/**
 * EmptyHomeState — shown when /api/home fails (network) or the user is
 * brand-new with zero books touched + zero diary entries. Soft fallback
 * that still gives the user a path forward.
 */
export function EmptyHomeState({ firstName }: { firstName: string }) {
  return (
    <article
      className="rounded-[20px] border-[1.5px] bg-white p-8 text-center"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <div
        aria-hidden
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-2xl"
        style={{ background: "var(--color-lavender-50)" }}
      >
        ✦
      </div>
      <h2
        className="mt-4 text-[20px] font-bold leading-tight tracking-tight"
        style={{ color: "var(--color-warm-900)" }}
      >
        Tu primera semana empieza ahora, {firstName}.
      </h2>
      <p
        className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed"
        style={{ color: "var(--color-warm-500)" }}
      >
        Empieza explorando la biblioteca o anota cómo te sientes hoy. Tu camino
        se construye paso a paso.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link
          href="/dashboard/biblioteca"
          className="inline-flex items-center gap-1.5 rounded-xl px-5 py-3 text-[13px] font-semibold text-white"
          style={{ background: "var(--color-sage-400)" }}
        >
          📚 Explorar biblioteca
        </Link>
        <Link
          href="/dashboard/reflexiones"
          className="inline-flex items-center gap-1.5 rounded-xl px-5 py-3 text-[13px] font-semibold"
          style={{
            color: "var(--color-warm-700)",
            background: "var(--color-warm-100)",
          }}
        >
          ✎ Anota cómo te sientes
        </Link>
      </div>
    </article>
  );
}
