import { redirect } from "next/navigation";

/**
 * /dashboard/reflexiones — Sprint B2 stub.
 *
 * The Sidebar redesign uses "Reflexiones" as the label for what was previously
 * "Diario". To unblock the new IA without rewriting the page, we redirect to
 * the existing `/dashboard/diario` implementation. Sprint B4 flips this
 * permanently: the real page moves here and `/dashboard/diario` becomes the
 * redirect alias (or 410 once we drop the legacy URL).
 */
export default function ReflexionesPage() {
  redirect("/dashboard/diario");
}
