import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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
    // La expectativa se amplía con `state` porque ahí vive la distinción que
    // antes faltaba: sin ella, «cero entradas» significaba dos cosas opuestas.
    expect(parseMailAllowlist(undefined)).toEqual({
      entries: [],
      malformed: [],
      state: "absent",
    });
    // Sólo separadores: entries y malformed siguen vacíos, pero alguien
    // escribió algo, así que no es una ausencia deliberada.
    expect(parseMailAllowlist("   ,  ")).toEqual({
      entries: [],
      malformed: [],
      state: "unusable",
    });
  });

  it("rechaza un dominio suelto: `endsWith` también aceptaría x@notdominio.com", () => {
    const { entries, malformed } = parseMailAllowlist("dominio.com");
    expect(entries).toEqual([]);
    expect(malformed).toEqual(["dominio.com"]);
  });

  it("rechaza lo que no es ni dirección ni sufijo, y NO autoriza a nadie", () => {
    const parsed = parseMailAllowlist(
      "@, sinarroba, a@b, @sinpunto, dos@arrobas@x.com",
    );
    expect(parsed.entries).toEqual([]);
    expect(parsed.malformed).toEqual([
      "@",
      "sinarroba",
      "a@b",
      "@sinpunto",
      "dos@arrobas@x.com",
    ]);
    // La consecuencia, que es lo que importa: no sale nada. El MOTIVO cambió al
    // arreglar el defecto de §67 y cambió a mejor — antes esta lista se
    // confundía con una lista ausente (`no-allowlist-outside-production`), que
    // es justamente la confusión que en producción abría el correo a todos.
    expect(parsed.state).toBe("unusable");
    expect(mailGate("qa@dominio.com", parsed, "staging")).toEqual({
      send: false,
      reason: "allowlist-unusable",
    });
  });

  it("una entrada ilegible no invalida las utilizables de la misma lista", () => {
    const parsed = parseMailAllowlist("qa@dominio.com, basura");
    expect(parsed.entries).toEqual(["qa@dominio.com"]);
    expect(parsed.malformed).toEqual(["basura"]);
    expect(mailGate("qa@dominio.com", parsed, "staging").send).toBe(true);
  });
});

describe("una lista ilegible NO es una lista ausente", () => {
  // La regresión del defecto que §67 reprodujo: `EMAIL_ALLOWLIST=dominio.com`
  // dejaba la lista utilizable vacía, y en producción eso caía en
  // `production-open`. Un error al escribir una restricción terminaba
  // permitiendo cualquier destinatario.
  const ilegible = parseMailAllowlist("dominio.com");
  const ausente = parseMailAllowlist(undefined);

  it("el parser las distingue por `state`, no por el recuento", () => {
    expect(ilegible.entries).toEqual([]);
    expect(ilegible.malformed).toEqual(["dominio.com"]);
    expect(ilegible.state).toBe("unusable");
    expect(ausente.state).toBe("absent");
    // Las dos tienen cero entradas: por eso el recuento no bastaba.
    expect(ausente.entries.length).toBe(ilegible.entries.length);
  });

  it("en PRODUCCIÓN una lista ilegible no abre nada", () => {
    expect(mailGate("ajeno@otro.com", ilegible, "production")).toEqual({
      send: false,
      reason: "allowlist-unusable",
    });
  });

  it("y tampoco fuera de producción", () => {
    for (const env of ["staging", "development", "test"] as const) {
      expect(mailGate("ajeno@otro.com", ilegible, env)).toEqual({
        send: false,
        reason: "allowlist-unusable",
      });
    }
  });

  it("el contrario se conserva: producción SIN lista sigue abierta a propósito", () => {
    expect(mailGate("ajeno@otro.com", ausente, "production")).toEqual({
      send: true,
      reason: "production-open",
    });
  });

  it("una variable vacía cuenta como AUSENTE, no como inválida", () => {
    // Borrar una variable en Coolify la deja como cadena vacía. Si eso contara
    // como «configurada e inválida», un borrado apagaría el correo de
    // producción — lo contrario del comportamiento deliberado.
    for (const crudo of ["", "   "]) {
      const p = parseMailAllowlist(crudo);
      expect(p.state).toBe("absent");
      expect(mailGate("quien@sea.com", p, "production").send).toBe(true);
    }
  });

  it("una lista con sólo separadores sí es inválida: alguien escribió algo", () => {
    const p = parseMailAllowlist(",,");
    expect(p.state).toBe("unusable");
    expect(mailGate("quien@sea.com", p, "production").send).toBe(false);
  });

  it("mezclar entradas válidas e ilegibles NO amplía la autorización", () => {
    const p = parseMailAllowlist("qa@dominio.com, dominio.com, basura");
    expect(p.state).toBe("usable");
    expect(p.entries).toEqual(["qa@dominio.com"]);
    expect(mailGate("qa@dominio.com", p, "production").send).toBe(true);
    // Las ilegibles no se convierten en permiso para su dominio.
    expect(mailGate("otro@dominio.com", p, "production").send).toBe(false);
    expect(mailGate("quien@sea.com", p, "production").send).toBe(false);
  });

  it("el banner dice lo MISMO que decide la guarda", () => {
    // El invariante que importa: si la guarda retiene, el texto no puede decir
    // «abierto». Se comprueba contra la función, no contra un literal.
    for (const env of ["production", "staging"] as const) {
      for (const crudo of [undefined, "", "dominio.com", "qa@x.com"]) {
        const p = parseMailAllowlist(crudo);
        const sale = mailGate("qa@x.com", p, env).send;
        const texto = describeMailGate(p, env, true);
        if (!sale) {
          expect(texto).not.toContain("abierto");
          expect(texto).toMatch(/RETENIDO|BLOQUEADO|restringido/);
        } else {
          expect(texto).toMatch(/abierto|restringido/);
        }
      }
    }
    // Y el caso del defecto, con su palabra propia: no es «RETENIDO».
    expect(describeMailGate(ilegible, "production", true)).toContain(
      "BLOQUEADO",
    );
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

describe("ningún correo lleva un destino de una plataforma retirada", () => {
  // Alcance deliberadamente estrecho: las plantillas de correo y los procesos
  // que las rellenan. No es una auditoría de la plataforma — es que un enlace
  // de correo se ENVÍA a una persona, así que un dominio obsoleto ahí llega a
  // su bandeja y ya no se puede retirar.
  //
  // El 2026-11-17, `WeeklyDigestProcessor` llevaba
  // `https://psico-platform-web.vercel.app/dashboard/patrones` como literal.
  const RETIRADAS = /vercel\.app|railway\.app|up\.railway|psico-platform-web/i;

  const superficies = [
    ...tsFiles(join(SRC, "notifications", "templates")),
    join(SRC, "jobs", "processors", "weekly-digest.processor.ts"),
    join(SRC, "jobs", "processors", "data-export.processor.ts"),
    join(SRC, "jobs", "processors", "email.processor.ts"),
    join(SRC, "auth", "auth.service.ts"),
  ].filter((f) => !/\.(spec|e2e-spec|pg-spec)\.ts$/.test(f));

  it("el patrón reconoce un literal retirado (control positivo)", () => {
    // Sin esto el trinquete sería vacuo con un patrón roto.
    expect(RETIRADAS.test("https://psico-platform-web.vercel.app/x")).toBe(
      true,
    );
    expect(RETIRADAS.test("https://staging.feelverse.app/x")).toBe(false);
  });

  it("y ninguna superficie de correo lo contiene", () => {
    const culpables = superficies
      .filter((f) => RETIRADAS.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(SRC.length + 1));
    expect(culpables).toEqual([]);
  });

  it("las superficies examinadas existen (la lista no puede quedarse vacía)", () => {
    // Un `filter` que no encuentra ficheros informaría «limpio» sin mirar nada.
    expect(superficies.length).toBeGreaterThanOrEqual(5);
    for (const f of superficies) expect(existsSync(f)).toBe(true);
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
