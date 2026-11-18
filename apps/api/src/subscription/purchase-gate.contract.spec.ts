import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePurchaseGate } from "../shared/purchase-availability";

/**
 * Trinquete de la puerta de las compras de planes.
 *
 * `payment.service.spec.ts` ya demuestra lo que importa de verdad: con la
 * puerta cerrada el proveedor NO se toca, así que no se crea ningún cliente, no
 * se guarda ningún identificador y no se llama a Stripe. Lo que una prueba de
 * comportamiento no puede demostrar es una AUSENCIA en el resto del árbol: que
 * no exista otro camino que llegue al proveedor sin pasar por la puerta.
 *
 * Eso es lo que hace este fichero. Enumera los sitios de producción que
 * mencionan `createCheckoutSession` y los fija: añadir uno nuevo rompe la
 * prueba, y quien lo añada tiene que decidir a conciencia si está gateado. Un
 * `grep` que sólo compruebe «la guarda sigue ahí» no detectaría una segunda
 * puerta abierta al lado.
 */

const SRC = join(__dirname, "..");

/**
 * Se escanea CÓDIGO, no prosa.
 *
 * El primer intento contaba cualquier mención y se rompió con un comentario que
 * explicaba la propia guarda: la lista pasó a incluir un fichero que no llama a
 * nada. Un trinquete que castiga documentar es un trinquete que acabará
 * borrado, así que los comentarios se quitan antes de buscar.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** El código de un fichero de `src/`, sin comentarios. */
function code(relPath: string): string {
  return stripComments(readFileSync(join(SRC, relPath), "utf8"));
}

function productionTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...productionTsFiles(full));
      continue;
    }
    if (!entry.endsWith(".ts")) continue;
    // Las pruebas y los arneses no son producción: mencionan el método a
    // propósito y contarlos haría la lista inestable.
    if (/\.(spec|e2e-spec|pg-spec|testing)\.ts$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

describe("la puerta de las compras de planes", () => {
  it("el valor por omisión CIERRA — una caja sin configurar no vende", () => {
    // El invariante de más peso de todo este trabajo, en una línea.
    expect(resolvePurchaseGate(undefined).open).toBe(false);
  });

  it("sólo estos ficheros de producción mencionan createCheckoutSession", () => {
    const hits = productionTsFiles(SRC)
      .filter((f) =>
        stripComments(readFileSync(f, "utf8")).includes(
          "createCheckoutSession",
        ),
      )
      .map((f) => relative(SRC, f).replaceAll("\\", "/"))
      .sort();

    expect(hits).toEqual([
      // Las DOS entradas HTTP. Las dos delegan en `SubscriptionService`.
      "billing/billing.controller.ts",
      // El declarante del contrato y sus dos implementaciones.
      "subscription/payment.service.ts",
      "subscription/providers/payment-provider.interface.ts",
      "subscription/providers/payphone/payphone.provider.ts",
      "subscription/providers/stripe/stripe.provider.ts",
      "subscription/subscription.controller.ts",
      // El orquestador, que delega en `PaymentService`.
      "subscription/subscription.service.ts",
    ]);
  });

  it("las dos rutas existentes delegan en el mismo servicio", () => {
    const billing = code("billing/billing.controller.ts");
    const legacy = code("subscription/subscription.controller.ts");

    expect(billing).toContain('@Post("checkout-session")');
    expect(billing).toContain(
      "this.subscriptionService.createCheckoutSession(",
    );
    expect(legacy).toContain('@Post("checkout")');
    expect(legacy).toContain("this.subscriptionService.createCheckoutSession(");

    // Y ninguno de los dos salta el orquestador para hablar con el proveedor.
    expect(billing).not.toContain("paymentService.createCheckoutSession");
    expect(legacy).not.toContain("paymentService.createCheckoutSession");
  });

  it("el orquestador no habla con el proveedor sin pasar por PaymentService", () => {
    const service = code("subscription/subscription.service.ts");
    expect(service).toContain("this.paymentService.createCheckoutSession(");
    expect(service).not.toContain("selectProvider()");
  });

  it("PaymentService consulta la puerta antes de elegir proveedor", () => {
    const source = code("subscription/payment.service.ts");
    const start = source.indexOf("createCheckoutSession(");
    const body = source.slice(start, source.indexOf("createPortalSession("));

    const guard = body.indexOf("assertPurchasesOpen()");
    const provider = body.indexOf("selectProvider()");

    expect(guard).toBeGreaterThanOrEqual(0);
    expect(provider).toBeGreaterThanOrEqual(0);
    // El orden es la garantía: `getOrCreateStripeCustomer` ESCRIBE en nuestra
    // base, así que una guarda posterior llegaría tarde.
    expect(guard).toBeLessThan(provider);
  });

  it("las dos superficies que lo publican usan el MISMO resolutor", () => {
    // Si una derivase el estado por su cuenta, la pantalla podría ofrecer un
    // botón que el servidor rechaza, o esconder uno que acepta.
    for (const file of [
      "billing/plan.service.ts",
      "patrones/patrones.service.ts",
    ]) {
      expect(code(file)).toContain("purchaseAvailabilityForWire");
    }
  });

  it("la puerta NO alcanza las facturas, el portal ni el webhook", () => {
    // Control contrario del trinquete: cerrar la entrada no deja a nadie
    // dentro sin salida. Si la guarda apareciera en estos métodos, una persona
    // que ya paga no podría cancelar.
    const source = code("subscription/payment.service.ts");
    const afterCheckout = source.slice(source.indexOf("createPortalSession("));
    expect(afterCheckout).not.toContain("assertPurchasesOpen()");
  });
});
