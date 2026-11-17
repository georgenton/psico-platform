import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { describeMailGate, mailGate, parseMailAllowlist } from "./mail-gate";

const SRC = join(__dirname, "..");

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      tsFiles(full, out);
      continue;
    }
    if (name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("parseMailAllowlist", () => {
  it("acepta direcciones completas y sufijos de dominio, normalizando", () => {
    const { entries, malformed } = parseMailAllowlist(
      " QA@Dominio.com , @Otro.Com ,, ",
    );
    expect(entries).toEqual(["qa@dominio.com", "@otro.com"]);
    expect(malformed).toEqual([]);
  });

  it("una lista ausente o vacía no tiene entradas ni ilegibles", () => {
    expect(parseMailAllowlist(undefined)).toEqual({
      entries: [],
      malformed: [],
    });
    expect(parseMailAllowlist("   ,  ")).toEqual({
      entries: [],
      malformed: [],
    });
  });

  it("rechaza un dominio suelto: `endsWith` también aceptaría x@notdominio.com", () => {
    const { entries, malformed } = parseMailAllowlist("dominio.com");
    expect(entries).toEqual([]);
    expect(malformed).toEqual(["dominio.com"]);
  });

  it("rechaza lo que no es ni dirección ni sufijo, y NO autoriza a nadie", () => {
    const { entries, malformed } = parseMailAllowlist(
      "@, sinarroba, a@b, @sinpunto, dos@arrobas@x.com",
    );
    expect(entries).toEqual([]);
    expect(malformed).toEqual([
      "@",
      "sinarroba",
      "a@b",
      "@sinpunto",
      "dos@arrobas@x.com",
    ]);
    // La consecuencia, que es lo que importa: una lista ilegible deja el
    // estado en «no sale nada» fuera de producción, no en «sale a todos».
    expect(
      mailGate("qa@dominio.com", { entries, malformed }, "staging"),
    ).toEqual({ send: false, reason: "no-allowlist-outside-production" });
  });

  it("una entrada ilegible no invalida las utilizables de la misma lista", () => {
    const parsed = parseMailAllowlist("qa@dominio.com, basura");
    expect(parsed.entries).toEqual(["qa@dominio.com"]);
    expect(parsed.malformed).toEqual(["basura"]);
    expect(mailGate("qa@dominio.com", parsed, "staging").send).toBe(true);
  });
});

describe("mailGate — el criterio por entorno", () => {
  const vacia = parseMailAllowlist(undefined);
  const lista = parseMailAllowlist("qa@dominio.com, @autorizado.com");

  it("producción sin lista escribe a cualquier usuario", () => {
    expect(mailGate("quien@sea.com", vacia, "production")).toEqual({
      send: true,
      reason: "production-open",
    });
  });

  it("FUERA de producción, con la lista vacía NO sale nada (falla cerrado)", () => {
    for (const env of ["staging", "development", "test"] as const) {
      expect(mailGate("qa@dominio.com", vacia, env)).toEqual({
        send: false,
        reason: "no-allowlist-outside-production",
      });
    }
  });

  it("con lista, sólo los autorizados — también en producción (canario)", () => {
    for (const env of ["production", "staging"] as const) {
      expect(mailGate("qa@dominio.com", lista, env).send).toBe(true);
      expect(mailGate("alguien@autorizado.com", lista, env).send).toBe(true);
      expect(mailGate("ajeno@otro.com", lista, env)).toEqual({
        send: false,
        reason: "not-allowlisted",
      });
    }
  });

  it("el sufijo no admite un dominio que sólo TERMINA igual", () => {
    expect(mailGate("x@noautorizado.com", lista, "staging").send).toBe(false);
  });

  it("compara sin distinguir mayúsculas, que es como se escriben las direcciones", () => {
    expect(mailGate("QA@Dominio.COM", lista, "staging").send).toBe(true);
  });

  it("un `to` con varios destinatarios exige que TODOS pasen", () => {
    // El hueco real, y conviene ser preciso con los datos porque la primera
    // versión de esta prueba lo describía sin llegar a tocarlo: `to` es una
    // cadena, así que comparar la cadena COMPLETA contra un sufijo autorizado
    // la acepta cuando la ÚLTIMA dirección es la autorizada — `endsWith`
    // mira el final, y el final del par es justo la que sí pasa. El correo
    // habría salido a las dos.
    //
    // Con direcciones exactas no se alcanza (la cadena entera no es igual a
    // ninguna entrada), así que el caso tiene que llevar un sufijo.
    const porDominio = parseMailAllowlist("@dominio.com");
    expect(
      mailGate("ajeno@otro.com, qa@dominio.com", porDominio, "staging"),
    ).toEqual({ send: false, reason: "not-allowlisted" });

    // Y el control contrario: los dos autorizados sí pasan.
    expect(
      mailGate("uno@dominio.com, dos@dominio.com", porDominio, "staging").send,
    ).toBe(true);

    // El mismo invariante con direcciones exactas.
    expect(
      mailGate("ajeno@otro.com, qa@dominio.com", lista, "staging").send,
    ).toBe(false);
    expect(
      mailGate("qa@dominio.com, otro@autorizado.com", lista, "staging").send,
    ).toBe(true);
  });

  it("un destinatario vacío no pasa", () => {
    expect(mailGate("", lista, "staging").send).toBe(false);
    expect(mailGate("  ,  ", lista, "staging").send).toBe(false);
  });
});

describe("describeMailGate", () => {
  it("distingue las cuatro situaciones sin que haya que abrir el código", () => {
    const vacia = parseMailAllowlist(undefined);
    const lista = parseMailAllowlist("qa@dominio.com");

    expect(describeMailGate(vacia, "staging", false)).toContain(
      "ningún correo sale",
    );
    expect(describeMailGate(vacia, "staging", true)).toContain("RETENIDO");
    expect(describeMailGate(vacia, "production", true)).toContain("abierto");
    expect(describeMailGate(lista, "staging", true)).toContain(
      "restringido a 1 destinatario(s)",
    );
  });

  it("nombra las entradas ilegibles, porque una lista que calla se lee como una que funciona", () => {
    const parsed = parseMailAllowlist("qa@dominio.com, basura");
    expect(describeMailGate(parsed, "staging", true)).toContain("basura");
  });
});

describe("el punto de paso es único — trinquete", () => {
  // El patrón vive escrito en este propio fichero, así que el alcance es el
  // código de PRODUCCIÓN: es el que sale de una caja desplegada, y es lo que la
  // guarda tiene que cubrir. Una prueba que instancie el SDK no manda correo a
  // nadie.
  const SDK = /new\s+Resend\s*\(|\.emails\.send\s*\(|from\s+"resend"/;
  const produccion = tsFiles(SRC).filter(
    (f) => !/\.(spec|e2e-spec|pg-spec|testing)\.ts$/.test(f),
  );

  it("el patrón reconoce el uso real del SDK (control positivo)", () => {
    // Sin esto el trinquete sería vacuo con un patrón roto: no encontraría
    // nada y lo informaría como «nadie lo usa».
    const servicio = produccion.find((f) => f.endsWith("resend.service.ts"));
    expect(servicio).toBeDefined();
    expect(SDK.test(readFileSync(servicio as string, "utf8"))).toBe(true);
  });

  it("nadie instancia el SDK de Resend fuera de ResendService", () => {
    const culpables = produccion
      .filter((f) => !f.endsWith("resend.service.ts"))
      .filter((f) => SDK.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(SRC.length + 1));

    // Si esta lista deja de estar vacía, hay un camino de correo que la guarda
    // de destinatarios NO cubre, y el arreglo no es añadir el fichero aquí.
    expect(culpables).toEqual([]);
  });

  it("y ResendService consulta la guarda antes de enviar", () => {
    const src = readFileSync(join(__dirname, "resend.service.ts"), "utf8");
    const guard = src.indexOf("mailGate(");
    const send = src.indexOf(".emails.send(");
    expect(guard).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(send);
  });
});
