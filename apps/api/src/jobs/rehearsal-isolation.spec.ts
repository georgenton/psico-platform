import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// @ts-expect-error — guion de ops en JavaScript, sin tipos; se importa por sus
// dos funciones puras, que es justo para lo que llevan la guarda de CLI.
import {
  checkIsolation,
  parseEnv,
} from "../../../../scripts/rehearsal-isolation-check.mjs";

/**
 * La puerta de aislamiento del ensayo de recuperación, y su trinquete.
 *
 * ── Qué protege ────────────────────────────────────────────────────────────
 *
 * El ensayo de nivel 4 restaura el volcado REAL en una caja nueva y arranca los
 * tres servicios. Las filas restauradas son reales: direcciones de correo,
 * fichas de dispositivo, solicitudes de exportación. Y el worker registra sus
 * crons contra ellas en cuanto arranca.
 *
 * El borrado de FILAS queda contenido, porque opera sobre la copia. Lo que no
 * queda contenido es todo lo que sale de la caja: R2 no es una copia, un correo
 * llega a una persona, un push llega a un teléfono y una llamada al modelo se
 * factura.
 *
 * ── Y la segunda mitad, que es la que envejece bien ────────────────────────
 *
 * Una lista de comprobaciones escrita a mano se queda corta el día que alguien
 * añade un procesador. Así que aquí no sólo se ejercita cada comprobación: se
 * recorren los procesadores de verdad, se clasifican por el efecto que tienen
 * fuera de la caja, y se exige que la puerta cubra cada familia encontrada. Un
 * procesador nuevo que llame a un proveedor que la puerta no vigila **rompe
 * esta prueba**, que es cuando hay que enterarse — no durante el ensayo.
 */

const PROCESADORES = join(__dirname, "processors");
const PUERTA = join(
  __dirname,
  "../../../../scripts/rehearsal-isolation-check.mjs",
);

/** Un entorno de ensayo correctamente aislado: todo apagado, base distinta. */
const AISLADO: Record<string, string> = {
  DATABASE_URL: "postgresql://u:p@ensayo-db:5432/feelverse_ensayo",
  R2_ACCESS_KEY_ID: "clave-del-ensayo",
  R2_SECRET_ACCESS_KEY: "secreto-del-ensayo",
  R2_BUCKET_NAME: "feelverse-ensayo",
  RESEND_API_KEY: "",
  VAPID_PUBLIC_KEY: "",
  VAPID_PRIVATE_KEY: "",
  VAPID_SUBJECT: "",
  ANTHROPIC_API_KEY: "",
  CIRCLES_ROLLOUT_MODE: "off",
  GUIDE_ROLLOUT_MODE: "off",
};

const VIVO = {
  bucketVivo: "feelverse-staging",
  dbViva: "rmucrqybnsllxshfznc7vy6l",
};

const con = (cambios: Record<string, string>) => ({ ...AISLADO, ...cambios });
const fallosDe = (env: Record<string, string>) =>
  (checkIsolation(env, VIVO) as { fallos: { qué: string; porqué: string }[] })
    .fallos;

describe("la puerta de aislamiento del ensayo", () => {
  it("un entorno correctamente apagado pasa, y pasa entero", () => {
    const { fallos, pasa } = checkIsolation(AISLADO, VIVO) as {
      fallos: unknown[];
      pasa: string[];
    };
    expect(fallos).toEqual([]);
    // Si alguien quitara comprobaciones, lo de arriba seguiría pasando con la
    // lista vacía. Esto fija que de verdad se comprueba algo.
    expect(pasa.length).toBeGreaterThanOrEqual(8);
  });

  it("R2 apuntando al bucket VIVO no pasa — ahí es donde se borra de verdad", () => {
    const f = fallosDe(con({ R2_BUCKET_NAME: VIVO.bucketVivo }));
    expect(f).toHaveLength(1);
    expect(f[0].porqué).toMatch(/account-deletion y data-export-retention/);
  });

  it("credenciales de R2 sin bucket declarado tampoco pasa: no se puede afirmar a dónde escribe", () => {
    // Falla CERRADO. «No sé» no es «está bien».
    const f = fallosDe(con({ R2_BUCKET_NAME: "" }));
    expect(f).toHaveLength(1);
    expect(f[0].porqué).toMatch(/no se puede afirmar a dónde escriben/);
  });

  it("sin credenciales de R2, el bucket deja de importar", () => {
    const f = fallosDe(
      con({
        R2_ACCESS_KEY_ID: "",
        R2_SECRET_ACCESS_KEY: "",
        R2_BUCKET_NAME: "",
      }),
    );
    expect(f).toEqual([]);
  });

  it("una clave de Resend no pasa — escribiría a las direcciones restauradas", () => {
    const f = fallosDe(con({ RESEND_API_KEY: "re_cualquier_cosa" }));
    expect(f).toHaveLength(1);
    expect(f[0].porqué).toMatch(/direcciones restauradas/);
  });

  it.each(["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"])(
    "%s puesta no pasa — empujaría a las fichas restauradas",
    (clave) => {
      const f = fallosDe(con({ [clave]: "algo" }));
      expect(f).toHaveLength(1);
      expect(f[0].qué).toContain(clave);
    },
  );

  it("una clave del modelo no pasa — weekly-summary se factura por persona", () => {
    const f = fallosDe(con({ ANTHROPIC_API_KEY: "sk-ant-lo-que-sea" }));
    expect(f).toHaveLength(1);
    expect(f[0].porqué).toMatch(/se factura/);
  });

  it.each(["CIRCLES_ROLLOUT_MODE", "GUIDE_ROLLOUT_MODE"])(
    "%s que no sea off no pasa",
    (clave) => {
      expect(fallosDe(con({ [clave]: "pilot" }))).toHaveLength(1);
      // Y ausente tampoco: la puerta exige el valor, no la ausencia de otro.
      const sin = { ...AISLADO };
      delete sin[clave];
      expect(fallosDe(sin)).toHaveLength(1);
    },
  );

  it("la base del ensayo apuntando a la VIVA no pasa", () => {
    const f = fallosDe(
      con({
        DATABASE_URL: `postgresql://u:p@${VIVO.dbViva}:5432/feelverse_staging`,
      }),
    );
    expect(f).toHaveLength(1);
    expect(f[0].porqué).toMatch(/host VIVO/);
  });

  it("una DATABASE_URL ausente o ilegible no pasa: falla cerrado", () => {
    expect(fallosDe(con({ DATABASE_URL: "" }))).toHaveLength(1);
    expect(fallosDe(con({ DATABASE_URL: "no-es-una-url" }))).toHaveLength(1);
  });

  it("parseEnv ignora comentarios y quita comillas", () => {
    const env = parseEnv(
      ["# un comentario", "", "A=uno", 'B="dos"', "C='tres'", "sinIgual"].join(
        "\n",
      ),
    ) as Record<string, string>;
    expect(env).toEqual({ A: "uno", B: "dos", C: "tres" });
  });
});

/**
 * El trinquete: la puerta no puede quedarse por detrás de los procesadores.
 *
 * Cada familia de efecto externo que aparezca en `processors/` tiene que estar
 * vigilada por la puerta. Si alguien añade un procesador que llama a un
 * proveedor nuevo —Stripe, un SMS, otro almacén— esta prueba cae y obliga a
 * decidir qué hace el ensayo con eso, en vez de descubrirlo durante el ensayo.
 */
describe("el trinquete entre los procesadores y la puerta", () => {
  /** Familia de efecto → marcas en el código → variable que la apaga. */
  const FAMILIAS = [
    {
      familia: "R2",
      marcas: /\bstorage\.|deleteObject|uploadObject|putObject/,
      guarda: "R2_ACCESS_KEY_ID",
    },
    {
      familia: "correo",
      marcas: /[Rr]esend|sendEmail|enqueueEmail/,
      guarda: "RESEND_API_KEY",
    },
    {
      familia: "push",
      marcas: /[Pp]ushService|pushTo|sendPush/,
      guarda: "VAPID_PRIVATE_KEY",
    },
    {
      familia: "modelo",
      marcas: /[Aa]iService|generateWeeklyNarrative|anthropic/,
      guarda: "ANTHROPIC_API_KEY",
    },
    { familia: "stripe", marcas: /[Ss]tripe/, guarda: "__SIN_GUARDA__" },
    { familia: "sms", marcas: /[Tt]wilio|sendSms/, guarda: "__SIN_GUARDA__" },
  ];

  const fuentePuerta = readFileSync(PUERTA, "utf8");

  const procesadores = readdirSync(PROCESADORES).filter(
    (f) => f.endsWith(".ts") && !f.includes(".spec."),
  );

  it("hay procesadores que recorrer (si no, el trinquete no diría nada)", () => {
    expect(procesadores.length).toBeGreaterThanOrEqual(10);
  });

  /**
   * Un salto, y por qué hace falta: `weekly-summary` NO menciona el modelo.
   * Llama a `PatronesService.regenerateWeeklySummary`, y es ese servicio el que
   * llama al modelo. Mirar sólo los archivos de `processors/` daba tres
   * familias de cuatro — se perdía justo la que se factura.
   *
   * Un salto basta para lo que hay hoy, y conviene decir que es un salto y no
   * un grafo: un procesador que llegue a un proveedor a través de DOS servicios
   * seguiría siendo invisible aquí. Si eso aparece, lo honesto es ampliar esto,
   * no confiar en que no aparezca.
   */
  function fuentesDe(archivo: string): { nombre: string; src: string }[] {
    const propio = readFileSync(join(PROCESADORES, archivo), "utf8");
    const salidas = [{ nombre: archivo, src: propio }];
    const importes = propio.matchAll(/from\s+"((?:\.\.\/)+[^"]*\.service)"/g);
    for (const m of importes) {
      const ruta = join(PROCESADORES, `${m[1]}.ts`);
      try {
        salidas.push({
          nombre: `${archivo} → ${m[1].split("/").pop()}`,
          src: readFileSync(ruta, "utf8"),
        });
      } catch {
        // Un import que no resuelve a un archivo no es un fallo de esta prueba.
      }
    }
    return salidas;
  }

  it("cada familia de efecto externo presente está vigilada por la puerta", () => {
    const encontradas = new Map<string, string[]>();
    for (const archivo of procesadores) {
      for (const { nombre, src } of fuentesDe(archivo)) {
        for (const { familia, marcas } of FAMILIAS) {
          if (marcas.test(src)) {
            encontradas.set(familia, [
              ...(encontradas.get(familia) ?? []),
              nombre,
            ]);
          }
        }
      }
    }

    const sinVigilar: string[] = [];
    for (const [familia, archivos] of encontradas) {
      const { guarda } = FAMILIAS.find((f) => f.familia === familia)!;
      if (!fuentePuerta.includes(guarda)) {
        sinVigilar.push(
          `${familia} (en ${archivos.join(", ")}) → la puerta no comprueba ${guarda}`,
        );
      }
    }

    expect(
      sinVigilar,
      sinVigilar.length
        ? "Un procesador tiene un efecto fuera de la caja que la puerta de aislamiento no apaga. " +
            "Antes de ejecutar el ensayo de nivel 4 hay que decidir qué pasa con esto:\n  · " +
            sinVigilar.join("\n  · ")
        : undefined,
    ).toEqual([]);

    // Y que el recorrido encontró de verdad las cuatro familias conocidas: si
    // una detección se rompiera, lo de arriba pasaría por no encontrar nada.
    expect([...encontradas.keys()].sort()).toEqual([
      "R2",
      "correo",
      "modelo",
      "push",
    ]);
  });
});
