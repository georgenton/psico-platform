/**
 * GR-2 — the honest empty state.
 *
 * A format that is announced but not produced says so. There is no silent
 * player, no fake timeline and no disabled control pretending an asset exists
 * behind it: the master does not exist yet, and the interface says exactly
 * that.
 */
export function ComingSoonNotice({
  icon,
  title,
  hint,
}: {
  icon: string;
  title: string;
  hint: string;
}) {
  return (
    <div
      className="rounded-2xl border-[1.5px] p-5 text-center"
      style={{
        background: "var(--color-warm-50)",
        borderColor: "var(--color-warm-200)",
      }}
    >
      <p
        className="text-[20px]"
        style={{ color: "var(--color-warm-500)" }}
        aria-hidden
      >
        {icon}
      </p>
      <p
        className="mt-2 text-[13.5px] font-semibold"
        style={{ color: "var(--color-warm-800)" }}
      >
        {title}
      </p>
      <p
        className="mt-1 text-[12.5px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        {hint}
      </p>
    </div>
  );
}
