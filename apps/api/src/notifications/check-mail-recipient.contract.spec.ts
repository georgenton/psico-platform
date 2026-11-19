import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resolveEnvironment } from "../shared/psico-environment";
import { mailGate, parseMailAllowlist } from "./mail-gate";

/**
 * El comprobador de destinatario tiene que decidir el entorno con el MISMO
 * criterio que el servicio de correo.
 *
 * ── Por qué no basta leer `PSICO_ENV` ─────────────────────────────────────
 *
 * `ResendService` resuelve su entorno con `resolveEnvironment()`, que recorta,
 * pasa a minúsculas y —en una caja desplegada— rechaza cualquier palabra que
 * no sea `production` o `staging`. La primera versión del guion leía la
 * variable cruda, así que las dos superficies podían discrepar justo donde la
 * guarda ABRE, que es donde una respuesta equivocada cuesta más.
 *
 * Esta prueba fija las dos mitades: que la divergencia era real (y por tanto
 * el arreglo hace algo) y que el guion usa el resolutor.
 */

const GUION = join(
  __dirname,
  "..",
  "..",
  "scripts",
  "check-mail-recipient.cjs",
);

function fuenteDelGuion(): string {
  return readFileSync(GUION, "utf8");
}

describe("el entorno se resuelve con el criterio del servicio", () => {
  const ENV_ORIGINAL = process.env.PSICO_ENV;

  afterEach(() => {
    if (ENV_ORIGINAL === undefined) delete process.env.PSICO_ENV;
    else process.env.PSICO_ENV = ENV_ORIGINAL;
  });

  it("leer la variable cruda y resolverla dan respuestas OPUESTAS con espacios y mayúsculas", () => {
    // El caso exacto que señaló la revisión: producción escrita con adorno y
    // sin lista de destinatarios.
    process.env.PSICO_ENV = " Production ";
    const sinLista = parseMailAllowlist(undefined);
    expect(sinLista.state).toBe("absent");

    const resuelto = resolveEnvironment();
    expect(resuelto).toBe("production");

    const conResolutor = mailGate("alguien@dominio.test", sinLista, resuelto);
    const conVariableCruda = mailGate(
      "alguien@dominio.test",
      sinLista,
      // Lo que hacía la versión anterior del guion.
      process.env.PSICO_ENV as never,
    );

    // El servicio, con este entorno y sin lista, ABRE. Es el comportamiento
    // deliberado de producción.
    expect(conResolutor).toEqual({ send: true, reason: "production-open" });
    // Y la lectura cruda decía lo contrario.
    expect(conVariableCruda.send).toBe(false);
    expect(conVariableCruda).not.toEqual(conResolutor);
  });

  it("con la forma canónica los dos caminos coinciden — el arreglo no cambia el caso normal", () => {
    process.env.PSICO_ENV = "staging";
    const lista = parseMailAllowlist("qa@dominio.test");
    const resuelto = resolveEnvironment();

    expect(mailGate("qa@dominio.test", lista, resuelto)).toEqual({
      send: true,
      reason: "allowlisted",
    });
    expect(mailGate("otra@dominio.test", lista, resuelto)).toEqual({
      send: false,
      reason: "not-allowlisted",
    });
  });
});

describe("el guion usa el resolutor, no la variable", () => {
  it("carga `resolveEnvironment` del módulo compartido", () => {
    const s = fuenteDelGuion();
    expect(s).toContain("psico-environment");
    expect(s).toContain("resolveEnvironment");
    expect(s).toContain("resolveEnvironment()");
  });

  it("no vuelve a leer `process.env.PSICO_ENV` por su cuenta", () => {
    // La mutación que esta línea mata: volver a
    // `const entorno = process.env.PSICO_ENV`, que es la versión que
    // divergía. Se permite nombrarla en los comentarios, no leerla.
    const sinComentarios = fuenteDelGuion()
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // El límite importa: `PSICO_ENVIRONMENT_PATH` —la salida para ensayarlo
    // fuera del contenedor— empieza por el mismo texto, así que un
    // `toContain` suelto daba un falso positivo. Se exige que el nombre
    // termine ahí.
    expect(sinComentarios).not.toMatch(/process\.env\.PSICO_ENV(?![A-Z_])/);
  });

  it("sigue leyendo la dirección por stdin y la lista por entorno", () => {
    // Lo que el arreglo NO podía romper: la dirección no vuelve a argv, y la
    // política de destinatarios sigue siendo la de `EMAIL_ALLOWLIST`.
    const s = fuenteDelGuion();
    expect(s).toContain("process.stdin");
    expect(s).toContain("process.env.EMAIL_ALLOWLIST");
    expect(s).not.toContain("process.argv[2]");
  });
});
