/* eslint-disable @typescript-eslint/consistent-type-imports */
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { validate } from "../config";
import { IntegrationsService } from "./integrations.service";

/**
 * «¿Eligió alguien el remitente?», atravesando el ConfigModule de verdad.
 *
 * ── Por qué no vale un doble ───────────────────────────────────────────────
 *
 * Las dos versiones anteriores de esta comprobación pasaban sus pruebas y
 * describían lo contrario de producción, y las dos por la misma razón: el doble
 * no reproducía lo que hace Nest.
 *
 * `@nestjs/config@4.x`, en `ConfigModule.forRoot`:
 *
 *     const validatedConfig = options.validate(config);
 *     this.assignVariablesToProcess(validatedConfig);
 *
 * Es decir, **copia los valores validados —defaults incluidos— a
 * `process.env`**. Después del arranque la clave existe siempre, así que
 * preguntarle al entorno «¿está?» responde «sí» en todas las cajas. Un doble
 * que devuelve `undefined` nunca habría mostrado eso.
 *
 * De ahí que esta prueba monte el módulo real y mire el informe que sale, en
 * los tres casos que importan. Si alguien vuelve a mover la procedencia a un
 * sitio que Nest transforma, esto cae.
 */

/** Lo mínimo que el schema exige para validar. Nada de esto es un secreto. */
const BASE: Record<string, string> = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/d",
  JWT_SECRET: "x".repeat(40),
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "akid",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET_NAME: "bucket",
  // Con clave, para que la lista de arranque pueda mencionar el remitente: sin
  // clave no sale correo y el aviso no se emite.
  RESEND_API_KEY: "re_para_la_prueba",
};

/**
 * Las claves que este archivo toca, restauradas una por una.
 *
 * No se reemplaza `process.env` entero: Nest, Vitest y el propio Node leen de
 * ahí mientras la prueba corre. Y hay que borrar `EMAIL_FROM` entre casos
 * **precisamente porque Nest lo escribe**: sin eso, el segundo caso heredaría
 * el default que dejó el primero y la prueba mediría su propia contaminación.
 */
const TOUCHED = [...Object.keys(BASE), "EMAIL_FROM", "EMAIL_FROM_EXPLICIT"];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(TOUCHED.map((k) => [k, process.env[k]]));
  for (const k of TOUCHED) delete process.env[k];
  Object.assign(process.env, BASE);
});

afterEach(() => {
  for (const k of TOUCHED) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function reportThroughRealConfigModule() {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        validate,
        // Sin esto la prueba leería el `.env` de quien la ejecuta y su
        // resultado dependería de la máquina.
        ignoreEnvFile: true,
      }),
    ],
    providers: [IntegrationsService],
  }).compile();
  const svc = moduleRef.get(IntegrationsService);
  return { report: svc.report(), issues: svc.bootIssues() };
}

describe("el remitente, por procedencia y a través del módulo real", () => {
  it("AUSENTE de entrada: no elegido, y el arranque lo menciona", async () => {
    const { report, issues } = await reportThroughRealConfigModule();
    expect(report.resendFrom.configured).toBe(false);
    expect(issues.some((i) => i.key.startsWith("EMAIL_FROM"))).toBe(true);
  });

  it("Nest DEJA la clave en el entorno aunque nadie la pusiera", async () => {
    // El hecho que invalidaba la versión anterior, fijado como prueba para que
    // no vuelva a sorprender a nadie: después de montar el módulo, la clave
    // existe en `process.env` con el valor por defecto.
    expect(process.env.EMAIL_FROM).toBeUndefined();
    await reportThroughRealConfigModule();
    expect(process.env.EMAIL_FROM).toBe("no-reply@feelverse.app");
  });

  it("el remitente PREDETERMINADO, elegido a propósito, cuenta como elegido", async () => {
    // El caso que la primera versión reportaba al revés por comparar valores,
    // y que la segunda tampoco distinguía porque miraba un entorno ya
    // transformado.
    process.env.EMAIL_FROM = "no-reply@feelverse.app";
    const { report, issues } = await reportThroughRealConfigModule();
    expect(report.resendFrom.configured).toBe(true);
    expect(issues.some((i) => i.key.startsWith("EMAIL_FROM"))).toBe(false);
  });

  it("otro remitente explícito también", async () => {
    process.env.EMAIL_FROM = "hola@feelverse.app";
    const { report, issues } = await reportThroughRealConfigModule();
    expect(report.resendFrom.configured).toBe(true);
    expect(issues.some((i) => i.key.startsWith("EMAIL_FROM"))).toBe(false);
  });

  it("una cadena en blanco no llega a este indicador: no arranca", async () => {
    // Escrito al revés en la primera versión de esta prueba, y la corrección es
    // mejor noticia que la expectativa: un remitente en blanco no es «una
    // elección vacía» que haya que interpretar, es una configuración inválida
    // que `z.string().email()` rechaza, y la aplicación se niega a arrancar.
    // Un fallo al arrancar, con el nombre del campo, es mejor que un informe
    // matizado sobre un valor que nunca podría enviar un correo.
    process.env.EMAIL_FROM = "   ";
    await expect(reportThroughRealConfigModule()).rejects.toThrow(
      /EMAIL_FROM: Invalid email address/,
    );
  });

  it("y el informe sigue contestando UNA pregunta, no tres", async () => {
    // Configuración del remitente, verificación del dominio y recepción del
    // mensaje son comprobaciones distintas. Esta caja sólo puede con la
    // primera, así que el informe no debe insinuar las otras dos.
    process.env.EMAIL_FROM = "alguien-muy-concreto@feelverse.app";
    const { report } = await reportThroughRealConfigModule();
    expect(Object.keys(report.resendFrom)).toEqual(["configured"]);
    expect(JSON.stringify(report)).not.toContain("alguien-muy-concreto");
    expect(JSON.stringify(report)).not.toMatch(/verified|delivered|domain/i);
  });

  it("el endpoint responde SIN clave de Resend — lo que depende de ella es el aviso", async () => {
    // Una afirmación mía del parte del 07-11 que estaba mal: dije que el
    // diagnóstico «nadie puede ejercerlo hasta que exista una clave». El
    // endpoint existe y contesta antes; lo que la clave condiciona es que la
    // lista de arranque mencione el remitente.
    delete process.env.RESEND_API_KEY;
    const { report, issues } = await reportThroughRealConfigModule();
    expect(report.resend.configured).toBe(false);
    expect(report.resendFrom).toBeDefined();
    expect(issues.some((i) => i.key.startsWith("EMAIL_FROM"))).toBe(false);
  });
});
