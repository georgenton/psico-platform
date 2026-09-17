"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The four ways to hand ONE invitation to ONE person.
 *
 * ── What this is, and what it deliberately is not ──────────────────────────
 *
 * It is four buttons over a link that already exists. It is not a channel, a
 * provider, an integration or a contact book: FeelVerse never learns the phone
 * number, never learns the address, and never sends anything itself. The
 * person picks the recipient in their own app and confirms the send there.
 *
 * ── One card, one link ─────────────────────────────────────────────────────
 *
 * Every button on this card shares THIS card's link and nothing else. Putting
 * several links in one message would hand one person every seat in the room,
 * and each of those links is single-use: whoever opened it first would take a
 * seat meant for somebody else.
 *
 * ── The honest part about the secret ───────────────────────────────────────
 *
 * The secret lives in the URL fragment, so it never reaches our server. It
 * does reach whatever app the person chooses — that is what sharing IS — and
 * the screen does not pretend otherwise. What this component guarantees is
 * narrower and worth stating: no third-party script, no request to anybody
 * before the click, no shortener, no tracking parameter, and the link is never
 * written to storage, a log or an error report.
 */

/** Opening a share sheet is not a delivery, and the copy never says it is. */
export interface CompartirInvitacionProps {
  /** The full one-use URL, fragment included. */
  readonly url: string;
  /** How this seat is named on screen — «Participante 2». Never a person. */
  readonly label: string;
  /**
   * Whether to render the copy button.
   *
   * `false` where the surrounding screen already has one. Two buttons with the
   * same accessible name is not a cosmetic problem: a room of five links has
   * five of each, and «copiado» stops telling anybody WHICH link they just
   * took — which is how the same link reaches two people.
   */
  readonly showCopy?: boolean;
}

const MESSAGE =
  "Te invito a una actividad de FeelVerse para conversar con calma. " +
  "Puedes participar desde este enlace sin instalar la aplicación. " +
  "La invitación es personal: ";

const SUBJECT = "Una invitación para conversar con calma";

/**
 * `wa.me` with `?text=`, which is the documented prefilled-message form and
 * works both in the installed app and on WhatsApp Web without a number.
 *
 * No number: adding one would mean FeelVerse holding a phone number, and the
 * whole point is that the person picks the contact inside WhatsApp.
 */
function whatsappHref(url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(MESSAGE + url)}`;
}

function mailtoHref(url: string): string {
  const body = `${MESSAGE}\n\n${url}\n`;
  return `mailto:?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(body)}`;
}

type Flash = { readonly tone: "ok" | "info"; readonly text: string } | null;

export function CompartirInvitacion({
  url,
  label,
  showCopy = true,
}: CompartirInvitacionProps) {
  const [flash, setFlash] = useState<Flash>(null);
  // Feature detection, not user-agent sniffing — and read after mount so the
  // server-rendered markup is the same for everybody.
  const [canSystemShare, setCanSystemShare] = useState(false);

  useEffect(() => {
    setCanSystemShare(typeof navigator !== "undefined" && !!navigator.share);
  }, []);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(timer);
  }, [flash]);

  const copy = useCallback(async () => {
    // «Enlace copiado» only after the clipboard actually accepted it. A
    // message that appears on click is a message that lies on a locked-down
    // browser, and the person walks away believing they have the link.
    try {
      await navigator.clipboard.writeText(url);
      setFlash({ tone: "ok", text: "Enlace copiado" });
    } catch {
      setFlash({
        tone: "info",
        text: "No se pudo copiar. Selecciona el enlace y cópialo a mano.",
      });
    }
  }, [url]);

  const systemShare = useCallback(async () => {
    try {
      await navigator.share({ text: MESSAGE + url });
      // Note what is NOT claimed: the sheet closed. Whether anybody received
      // anything is not something the browser tells us, or could.
      setFlash({ tone: "info", text: "Se abrió el menú de compartir" });
    } catch {
      // Cancelling is the ordinary outcome, not an error to report. Both land
      // here because `AbortError` is not reliably distinguishable across
      // browsers, and the harmless reading is the right default.
      setFlash(null);
    }
  }, [url]);

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={whatsappHref(url)}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="compartir-whatsapp"
          aria-label={`Enviar por WhatsApp la invitación de ${label}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-sage-200 bg-white px-3 py-2 text-sm text-ink-700 hover:bg-sage-50"
        >
          <span aria-hidden="true">💬</span> WhatsApp
        </a>

        <a
          href={mailtoHref(url)}
          data-testid="compartir-correo"
          aria-label={`Enviar por correo la invitación de ${label}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-sage-200 bg-white px-3 py-2 text-sm text-ink-700 hover:bg-sage-50"
        >
          <span aria-hidden="true">✉️</span> Correo
        </a>

        {canSystemShare ? (
          <button
            type="button"
            onClick={systemShare}
            data-testid="compartir-dispositivo"
            aria-label={`Compartir con otra aplicación la invitación de ${label}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-sage-200 bg-white px-3 py-2 text-sm text-ink-700 hover:bg-sage-50"
          >
            <span aria-hidden="true">📤</span> Compartir
          </button>
        ) : null}

        {showCopy ? (
          <button
            type="button"
            onClick={copy}
            data-testid="compartir-copiar"
            aria-label={`Copiar el enlace de ${label}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-sage-200 bg-white px-3 py-2 text-sm text-ink-700 hover:bg-sage-50"
          >
            <span aria-hidden="true">🔗</span> Copiar enlace
          </button>
        ) : null}
      </div>

      {flash ? (
        <p
          role="status"
          className={`mt-2 text-sm ${flash.tone === "ok" ? "text-sage-700" : "text-ink-500"}`}
        >
          {flash.text}
        </p>
      ) : null}
    </div>
  );
}
