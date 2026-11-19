import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PURCHASES_CLOSED_BODY,
  PURCHASES_CLOSED_HEADLINE,
  PURCHASES_PROPOSAL_NOTICE,
} from "@psico/types";

/**
 * Lo que las pruebas de render NO pueden comprobar.
 *
 * ── El reparto, tras mover las tarjetas a sus propios ficheros ────────────
 *
 * `UpgradeCard.test.tsx` y `PaywallCard.test.tsx` montan las dos pantallas con
 * `purchasesOpen` en los dos valores y preguntan qué ofrecen. Eso cubre —mejor
 * que cualquier comprobación de texto— que la rama correcta va con el valor
 * correcto: **intercambiarlas las mata**, que es justo lo que la versión
 * anterior de este fichero dejaba pasar.
 *
 * Lo que un render no ve son dos cosas, y son las que quedan aquí:
 *
 *   1. Cómo las PÁGINAS calculan la prop. Son Server Components que hacen
 *      `serverFetch` y leen cookies: no se montan en jsdom, y la decisión que
 *      toman —resolver la duda hacia CERRADO— es la que convierte un contrato
 *      ausente en «no se puede comprar» en vez de en «adelante».
 *   2. Una AUSENCIA en el resto del árbol: que no haya un segundo camino de
 *      compra en otra pantalla. Un render sólo habla del componente que monta.
 */

const WEB_SRC = join(__dirname, "..", "..");
const DASHBOARD = __dirname;

function source(rel: string): string {
  return readFileSync(join(DASHBOARD, rel), "utf8");
}

const PLAN_PAGE = "plan/page.tsx";
const PATRONES_PAGE = "patrones/page.tsx";

describe("las páginas resuelven la duda hacia CERRADO", () => {
  it("Mi plan lee la disponibilidad del servidor y falla cerrado", () => {
    const s = source(PLAN_PAGE);
    // El campo viene de `GET /api/plan`. Si la pantalla dejara de leerlo y
    // derivara el estado por su cuenta, podría ofrecer lo que el servidor
    // rechaza — que es el defecto que este trabajo cierra.
    expect(s).toContain("plan?.purchases?.open ?? false");
    // La mutación que esta línea mata: `?? true`. Un cliente nuevo contra una
    // API anterior —o un `/plan` que falló— pasaría a ofrecer compras. La
    // ausencia de un permiso no es un permiso.
    expect(s).not.toContain("purchases?.open ?? true");
  });

  it("Patrones hace lo mismo", () => {
    const s = source(PATRONES_PAGE);
    expect(s).toContain("data.purchases?.open ?? false");
    expect(s).not.toContain("purchases?.open ?? true");
  });
});

describe("no hay un segundo camino de compra en la Web", () => {
  it("sólo un fichero de producción invoca la acción de checkout", () => {
    // Enumerar el árbol es lo único que detecta una puerta nueva abierta al
    // lado. Un render del componente de hoy nunca vería la pantalla de mañana.
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry)) continue;
        if (/\.(test|spec)\.tsx?$/.test(entry)) continue;
        if (readFileSync(full, "utf8").includes("createCheckoutAction")) {
          hits.push(relative(WEB_SRC, full).replaceAll("\\", "/"));
        }
      }
    };
    walk(WEB_SRC);

    expect(hits.sort()).toEqual([
      // Quien la declara.
      "actions/subscription.ts",
      // Y el ÚNICO sitio que la usa, cuya rama de uso está cubierta por
      // `UpgradeCard.test.tsx`.
      "components/dashboard/plan/UpgradeCard.tsx",
    ]);
  });
});

describe("gestionar una suscripción existente no depende de la guarda", () => {
  it("el bloque de suscripción activa no consulta `purchasesOpen`", () => {
    // Control contrario: cerrar la entrada no deja a nadie dentro sin salida.
    const s = source(PLAN_PAGE);
    const activa = s.indexOf("function ActiveSubscription");
    const fin = s.indexOf("export default async function PlanPage");
    const bloque = s.slice(activa, fin);
    expect(bloque).toContain("createPortalAction");
    expect(bloque).toContain("SubscriptionActions");
    expect(bloque).not.toContain("purchasesOpen");
  });
});

describe("el copy es el de la landing, palabra por palabra", () => {
  it("el aviso de importes coincide con el que ya ve quien no tiene cuenta", () => {
    expect(PURCHASES_PROPOSAL_NOTICE).toBe(
      "Propuesta de precios · No disponible para compra",
    );
  });

  it("el titular y el cuerpo dicen qué pasa y qué NO pasa", () => {
    expect(PURCHASES_CLOSED_HEADLINE).toBe(
      "Las compras todavía no están disponibles",
    );
    expect(PURCHASES_CLOSED_BODY).toContain("Tu plan actual sigue igual");
  });
});
