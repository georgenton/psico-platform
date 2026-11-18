import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PURCHASES_CLOSED_BODY,
  PURCHASES_CLOSED_HEADLINE,
  PURCHASES_PROPOSAL_NOTICE,
} from "@psico/types";

/**
 * Trinquete de las dos pantallas que ofrecían contratar.
 *
 * ── Por qué una prueba de FUENTE y no de render ───────────────────────────
 *
 * Las dos son Server Components de Next, y este repositorio no prueba Server
 * Components con RTL (el runtime hace falta y la convención viene del Sprint
 * S39). Lo que estas pantallas pueden hacer mal es muy concreto y se lee en el
 * texto: ofrecer la acción sin preguntar, o preguntar y resolver la duda a
 * favor de abrir.
 *
 * La verificación en pantalla se hace sobre lo servido después de desplegar —
 * eso lo exige el encargo y es más fuerte que cualquier render en jsdom. Esto
 * es la red que impide reintroducirlo sin que nadie se dé cuenta.
 */

const DASHBOARD = __dirname;

function source(rel: string): string {
  return readFileSync(join(DASHBOARD, rel), "utf8");
}

const PLAN = "plan/page.tsx";
const PATRONES = "patrones/page.tsx";

describe("Mi plan · la compra no se ofrece sin permiso del servidor", () => {
  it("la disponibilidad la decide el servidor, no la pantalla", () => {
    const s = source(PLAN);
    // El campo viene de `GET /api/plan`. Si la pantalla dejara de leerlo y
    // derivara el estado por su cuenta, podría ofrecer lo que el servidor
    // rechaza — que es justo el defecto que este trabajo cierra.
    expect(s).toContain("plan?.purchases?.open");
  });

  it("falla CERRADO ante un contrato ausente", () => {
    const s = source(PLAN);
    expect(s).toContain("plan?.purchases?.open ?? false");
    // La mutación que esta línea mata: `?? true`. Un cliente nuevo contra una
    // API anterior pasaría a ofrecer compras. La ausencia de un permiso no es
    // un permiso.
    expect(s).not.toContain("purchases?.open ?? true");
  });

  it("el formulario de checkout vive dentro de la guarda", () => {
    const s = source(PLAN);
    const guard = s.indexOf("purchasesOpen ? (");
    const form = s.indexOf("<form action={checkoutWithPlan}");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(form).toBeGreaterThan(guard);
    // Y sólo hay UN formulario de checkout: si apareciera otro fuera de la
    // guarda, esta cuenta lo delataría.
    expect(s.split("action={checkoutWithPlan}").length - 1).toBe(1);
  });

  it("no se deja un botón deshabilitado en su lugar", () => {
    // Un `disabled` sigue siendo una llamada a contratar, y promete un «más
    // tarde» que nadie ha decidido cuándo es.
    const s = source(PLAN);
    expect(s).not.toMatch(/disabled[\s\S]{0,40}Actualizar a/);
  });

  it("los importes conservados se identifican como propuesta", () => {
    const s = source(PLAN);
    expect(s).toContain("PURCHASES_PROPOSAL_NOTICE");
    // Palabra por palabra el aviso de la landing: que las dos superficies digan
    // lo mismo es el punto.
    expect(PURCHASES_PROPOSAL_NOTICE).toBe(
      "Propuesta de precios · No disponible para compra",
    );
  });

  it("la pantalla explica por qué no se puede contratar", () => {
    const s = source(PLAN);
    expect(s).toContain("PURCHASES_CLOSED_HEADLINE");
    expect(s).toContain("PURCHASES_CLOSED_BODY");
    // El cuerpo dice lo que NO pasa, que es lo que una persona necesita saber.
    expect(PURCHASES_CLOSED_BODY).toContain("Tu plan actual sigue igual");
  });

  it("gestionar una suscripción existente NO depende de la guarda", () => {
    // Control contrario: cerrar la entrada no deja a nadie dentro sin salida.
    const s = source(PLAN);
    const activa = s.indexOf("function ActiveSubscription");
    const fin = s.indexOf("export default async function PlanPage");
    const bloque = s.slice(activa, fin);
    expect(bloque).toContain("createPortalAction");
    expect(bloque).toContain("SubscriptionActions");
    expect(bloque).not.toContain("purchasesOpen");
  });
});

describe("Patrones · el muro no ofrece contratar cuando no se puede", () => {
  it("obedece la disponibilidad que publica el servidor, y falla cerrado", () => {
    const s = source(PATRONES);
    expect(s).toContain("data.purchases?.open ?? false");
    expect(s).not.toContain("purchases?.open ?? true");
  });

  it("«Hazte Pro» vive dentro de la guarda", () => {
    const s = source(PATRONES);
    const guard = s.indexOf("purchasesOpen ? (");
    const cta = s.indexOf("Hazte Pro →");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(cta).toBeGreaterThan(guard);
    expect(s.split("Hazte Pro").length - 1).toBe(1);
  });

  it("y en su lugar se dice lo que es cierto", () => {
    const s = source(PATRONES);
    expect(s).toContain("PURCHASES_CLOSED_HEADLINE");
    expect(PURCHASES_CLOSED_HEADLINE).toBe(
      "Las compras todavía no están disponibles",
    );
  });
});
