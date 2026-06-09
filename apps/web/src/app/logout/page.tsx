import { logoutAction } from "@/actions/auth";

/**
 * /logout — convenience route that clears auth cookies and bounces to /login.
 *
 * Linked from the Perfil error state ("Cerrar sesión y volver a entrar") and
 * from any page that needs a clean session escape hatch. Lets `logoutAction`
 * own the redirect — it always ends in `redirect("/login")`.
 */
export const dynamic = "force-dynamic";

export default async function LogoutPage() {
  // logoutAction always ends in `redirect("/login")` — propagate its throw.
  await logoutAction();
  return null;
}
