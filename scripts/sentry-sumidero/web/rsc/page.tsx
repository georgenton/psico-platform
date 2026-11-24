// Plantilla del ensayo: un componente de servidor ANIDADO que falla con el
// contenido de la petición dentro, después de usar todo lo que el SDK ofrece.
import { cookies, headers } from "next/headers";
import * as Sentry from "@sentry/node";

export const dynamic = "force-dynamic";

async function Nieta({ t }: { t: string }): Promise<JSX.Element> {
  const h = headers();
  const todo = [
    t,
    h.get("authorization"),
    h.get("x-forwarded-for"),
    h.get("user-agent"),
    cookies().toString(),
  ].join(" ");
  Sentry.setUser({ id: t, ip_address: h.get("x-forwarded-for") ?? "" });
  Sentry.setExtra("e", todo);
  Sentry.setContext("c", { todo });
  Sentry.setTag("t", t);
  Sentry.addBreadcrumb({ message: todo });
  console.log("sonda", todo);
  Sentry.captureMessage(todo);
  Sentry.captureFeedback({ message: todo });
  Sentry.startSpan({ name: todo }, () => undefined);
  Sentry.startSession();
  Sentry.captureSession();
  throw Object.assign(
    new Error(`rsc ${todo}`, {
      cause: new Error(`causa ${todo}`),
    }),
    { respuesta: todo },
  );
}

export default function Page({
  searchParams,
}: {
  searchParams: { t?: string };
}) {
  return (
    <main>
      <Nieta t={searchParams.t ?? ""} />
    </main>
  );
}
