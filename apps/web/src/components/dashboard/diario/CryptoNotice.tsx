/**
 * CryptoNotice — small banner explaining the E2E encryption gap.
 *
 * Until the client-side crypto module lands (Sprint S6-crypto), the user
 * cannot create or read diary entries — the backend rejects anything that
 * isn't a properly-formed XChaCha20-Poly1305 ciphertext.
 *
 * This banner is the honest surface: it tells the user *exactly* what's
 * missing so they don't think the system is broken. We render it on every
 * diario route until S6-crypto removes it.
 *
 * Why we DON'T just put a "placeholder cipher" so the composer works:
 * ADR 0007 §G commits to no-recovery. Fake-encrypted entries created today
 * would be unreadable when real crypto lands, and we'd have no migration
 * path. Better to defer creation entirely than to corrupt user data.
 */
export function CryptoNotice() {
  return (
    <aside
      className="mb-6 flex items-start gap-3 rounded-2xl border-[1.5px] p-4"
      style={{
        borderColor: "var(--color-lavender-200)",
        background: "var(--color-lavender-50)",
      }}
    >
      <span
        aria-hidden
        className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px]"
        style={{
          background: "white",
          color: "var(--color-lavender-700)",
          border: "1.5px solid var(--color-lavender-200)",
        }}
      >
        🔒
      </span>
      <div className="text-[12.5px] leading-relaxed">
        <strong style={{ color: "var(--color-warm-900)" }}>
          Diario cifrado de extremo a extremo
        </strong>
        <p className="mt-0.5" style={{ color: "var(--color-warm-700)" }}>
          Tu texto se cifra en tu dispositivo con una clave derivada de tu
          contraseña — ni Psico Platform puede leerlo. El módulo de cifrado
          cliente-side llega en el próximo sprint; por ahora puedes ver la
          estructura y los prompts.
        </p>
      </div>
    </aside>
  );
}
