import { redirect } from "next/navigation";

/**
 * /dashboard/diario — Sprint B4 redirect alias.
 *
 * The real Diario UI now lives at `/dashboard/reflexiones`. We keep
 * `/dashboard/diario` reachable so any deep link the user typed, bookmarked
 * or received in past emails/notifications still resolves to the new
 * surface without a 404.
 *
 * 308 permanent redirect (the default in `next/navigation`'s `redirect`)
 * tells crawlers + the browser cache to forget the old URL.
 */
export default function DiarioRedirect() {
  redirect("/dashboard/reflexiones");
}
