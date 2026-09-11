import type { Metadata } from "next";

import { EntradaInvitacion } from "@/components/circulos/EntradaInvitacion";

/**
 * `/i#token` — where an invitation link lands.
 *
 * The page itself is deliberately almost empty and fully client-rendered for
 * the part that matters: the secret lives in the URL fragment, which the
 * browser never sends to a server, so there is nothing for a Server Component
 * to read and nothing to put in the RSC payload. Rendering it server-side would
 * mean the token had to reach the server some other way — a query string — and
 * that is exactly the design this avoids.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invitación | FeelVerse",
  robots: { index: false, follow: false },
};

export default function InvitacionPage() {
  return <EntradaInvitacion />;
}
