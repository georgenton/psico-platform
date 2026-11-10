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

/**
 * Un entorno de ensayo correctamente aislado.
 *
 * Nótese lo que NO es: no es «todo vacío». Las claves del modelo, de los
 * embeddings y de R2 están puestas, porque el schema las declara requeridas y
 * sin ellas la app no arranca. Lo que las aísla es que son centinelas y que sus
 * tres costuras apuntan a un sustituto local.
 */
const AISLADO: Record<string, string> = {
  DATABASE_URL: "postgresql://u:p@ensayo-db:5432/feelverse_ensayo",
  REDIS_URL: "redis://ensayo-redis:6379",
  R2_ACCOUNT_ID: "cuenta-del-ensayo",
  R2_ACCESS_KEY_ID: "clave-del-ensayo",
  R2_SECRET_ACCESS_KEY: "ensayo-secreto",
  R2_BUCKET_NAME: "feelverse-ensayo",
  R2_ENDPOINT: "http://127.0.0.1:4566",
  RESEND_API_KEY: "",
  VAPID_PUBLIC_KEY: "",
  VAPID_PRIVATE_KEY: "",
  VAPID_SUBJECT: "",
  ANTHROPIC_API_KEY: "ensayo-centinela",
  ANTHROPIC_BASE_URL: "http://127.0.0.1:4555",
  VOYAGE_API_KEY: "ensayo-centinela",
  VOYAGE_BASE_URL: "http://127.0.0.1:4555/v1",
  OPENAI_API_KEY: "ensayo-centinela",
  OPENAI_BASE_URL: "http://127.0.0.1:4555",
  STRIPE_SECRET_KEY: "sk_test_del_ensayo",
  CIRCLES_ROLLOUT_MODE: "off",
  GUIDE_ROLLOUT_MODE: "off",
};

const VIVO = {
  bucketVivo: "feelverse-staging",
  cuentaViva: "cuenta-viva-de-staging",
  dbViva: "rmucrqybnsllxshfznc7vy6l",
  redisVivo: "pwo0g8s4wgwo8s8gkwc4sskg",
};

const con = (cambios: Record<string, string>) => ({ ...AISLADO, ...cambios });
const fallosDe = (env: Record<string, string>) =>
  (checkIsolation(env, VIVO) as { fallos: { qué: string; porqué: string }[] })
    .fallos;

describe("la puerta de aislamiento del ensayo", () => {
  it("un entorno correctamente aislado pasa, y pasa entero", () => {
    const { fallos, pasa } = checkIsolation(AISLADO, VIVO) as {
      fallos: unknown[];
      pasa: string[];
    };
    expect(fallos).toEqual([]);
    // Si alguien quitara comprobaciones, lo de arriba seguiría pasando con la
    // lista vacía. Esto fija que de verdad se comprueba algo.
    expect(pasa.length).toBeGreaterThanOrEqual(18);
  });

  /**
   * El defecto que cerró este bloque: la primera versión exigía estas claves
   * VACÍAS, y el schema las declara requeridas. Era una puerta imposible de
   * satisfacer arrancando la app.
   */
  it("un entorno con las claves requeridas VACÍAS ya no pasa — no arrancaría", () => {
    const f = fallosDe(
      con({
        ANTHROPIC_API_KEY: "",
        VOYAGE_API_KEY: "",
        R2_ACCOUNT_ID: "",
        R2_ACCESS_KEY_ID: "",
        R2_SECRET_ACCESS_KEY: "",
        R2_BUCKET_NAME: "",
      }),
    );
    // Las claves vacías NO son el fallo —la puerta no las mira— pero el bucket
    // y la cuenta sí, y su mensaje dice justamente que así no arranca.
    expect(f.map((x) => x.qué)).toContain("R2_ACCOUNT_ID no es la cuenta viva");
    expect(f.find((x) => x.qué.includes("R2_ACCOUNT_ID"))!.porqué).toMatch(
      /la app no arranca/,
    );
  });

  it.each([
    ["ANTHROPIC_BASE_URL", "https://api.anthropic.com"],
    ["VOYAGE_BASE_URL", "https://api.voyageai.com/v1"],
    ["OPENAI_BASE_URL", "https://api.openai.com"],
    ["R2_ENDPOINT", "https://cuenta.r2.cloudflarestorage.com"],
  ])("%s apuntando al PROVEEDOR no pasa", (costura, destinoVivo) => {
    const f = fallosDe(con({ [costura]: destinoVivo }));
    expect(f).toHaveLength(1);
    expect(f[0].porqué).toMatch(/es del proveedor/);
  });

  it.each([
    "ANTHROPIC_BASE_URL",
    "VOYAGE_BASE_URL",
    "OPENAI_BASE_URL",
    "R2_ENDPOINT",
  ])(
    "%s ausente tampoco pasa: el cliente usaría el destino del proveedor",
    (costura) => {
      // Falla CERRADO. La ausencia de una costura NO es aislamiento: es
      // exactamente la configuración de producción.
      const sin = { ...AISLADO };
      delete sin[costura];
      const f = fallosDe(sin);
      expect(f).toHaveLength(1);
      expect(f[0].porqué).toMatch(/ausente o no analizable/);

      // Y vacía o ilegible, lo mismo.
      expect(fallosDe(con({ [costura]: "" }))).toHaveLength(1);
      expect(fallosDe(con({ [costura]: "no-es-una-url" }))).toHaveLength(1);
    },
  );

  it.each([
    ["ANTHROPIC_API_KEY", "sk-ant-api03-loquesea"],
    ["VOYAGE_API_KEY", "pa-loquesea"],
    ["OPENAI_API_KEY", "sk-proj-loquesea"],
    ["R2_SECRET_ACCESS_KEY", "una-credencial-de-verdad"],
  ])(
    "%s sin la marca de centinela no pasa, aunque la costura esté bien",
    (clave, viva) => {
      // La segunda condición, independiente de la primera: con la costura
      // correcta esto no llega a ninguna parte hoy, pero un destipeo en la
      // costura lo convertiría en una llamada facturada.
      const f = fallosDe(con({ [clave]: viva }));
      expect(f).toHaveLength(1);
      expect(f[0].qué).toBe(`${clave} lleva la marca de centinela`);
    },
  );

  it("R2 apuntando al bucket VIVO no pasa — ahí es donde se borra de verdad", () => {
    const f = fallosDe(con({ R2_BUCKET_NAME: VIVO.bucketVivo }));
    expect(f).toHaveLength(1);
    expect(f[0].qué).toBe("R2_BUCKET_NAME no es el bucket vivo");
  });

  /**
   * La mitad que faltaba. El destino de la petición sale de la CUENTA; el
   * bucket sólo nombra el objeto. Copiar la cuenta de staging renombrando el
   * bucket pasaba la puerta anterior.
   */
  it("R2 con la CUENTA viva no pasa, aunque el bucket sea otro", () => {
    const f = fallosDe(con({ R2_ACCOUNT_ID: VIVO.cuentaViva }));
    expect(f).toHaveLength(1);
    expect(f[0].porqué).toMatch(/iría al almacenamiento real/);
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

  it.each(["sk_live_loquesea", "loquesea", ""])(
    "STRIPE_SECRET_KEY=%s no pasa: no se declara de prueba",
    (valor) => {
      const f = fallosDe(con({ STRIPE_SECRET_KEY: valor }));
      expect(f).toHaveLength(1);
      expect(f[0].qué).toBe("STRIPE_SECRET_KEY es de prueba o centinela");
    },
  );

  it("una clave rk_test_ de Stripe sí pasa — es su propia declaración", () => {
    expect(fallosDe(con({ STRIPE_SECRET_KEY: "rk_test_x" }))).toEqual([]);
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

  /**
   * Redis, que tampoco estaba. Las colas de BullMQ no están separadas por
   * entorno: un worker de ensayo en el Redis vivo consume trabajos reales.
   */
  it("Redis del ensayo apuntando al VIVO no pasa", () => {
    const f = fallosDe(con({ REDIS_URL: `redis://${VIVO.redisVivo}:6379` }));
    expect(f).toHaveLength(1);
    expect(f[0].porqué).toMatch(/consumiría trabajos reales/);
  });

  /**
   * ── Los tres huecos que la revisión del 2026-11-09 encontró ──────────────
   *
   * Los tres son la misma forma de error: comprobar que algo NO es lo
   * prohibido, en vez de que SÍ es lo autorizado. Una lista de prohibidos
   * aprueba todo lo que no se le ocurrió a quien la escribió.
   */
  describe("autorizar, no descartar", () => {
    it("un dominio del proveedor con PUNTO FINAL ya no se cuela", () => {
      // `https://api.anthropic.com./v1` es una URL válida que resuelve al
      // mismo sitio, y su `hostname` termina en punto, así que no casaba con
      // ningún dominio escrito sin él. Pasaba la puerta entera.
      const f = fallosDe(
        con({ ANTHROPIC_BASE_URL: "https://api.anthropic.com./v1" }),
      );
      expect(f).toHaveLength(1);
      expect(f[0].porqué).toMatch(/es del proveedor/);
    });

    it.each([
      ["https://s3.otro-proveedor.com", "otro proveedor de objetos"],
      ["https://192.0.2.10:4566", "una IP pública cualquiera"],
      ["https://sink.ejemplo.net", "el servidor de alguien"],
    ])("%s tampoco: no basta con no ser del proveedor (%s)", (destino) => {
      const f = fallosDe(con({ R2_ENDPOINT: destino }));
      expect(f).toHaveLength(1);
      expect(f[0].porqué).toMatch(/no está entre los sustitutos autorizados/);
    });

    it("pero un sustituto DECLARADO sí se acepta", () => {
      // La autorización llega por la llamada, no por el fichero comprobado:
      // si el propio entorno pudiera declarar qué vale, no habría puerta.
      const { fallos } = checkIsolation(
        con({ R2_ENDPOINT: "http://sink-del-ensayo:4566" }),
        { ...VIVO, sustitutos: ["sink-del-ensayo", "127.0.0.1"] },
      ) as { fallos: unknown[] };
      expect(fallos).toEqual([]);
    });

    it("una credencial de un formato NO previsto ya no se aprueba", () => {
      // La versión anterior rechazaba `sk-ant-`, `pa-` y `sk-`, y aprobaba
      // cualquier otra cosa — incluida una credencial real de otro proveedor.
      const f = fallosDe(con({ ANTHROPIC_API_KEY: "AIzaSyB-clave-real" }));
      expect(f).toHaveLength(1);
      expect(f[0].qué).toBe("ANTHROPIC_API_KEY lleva la marca de centinela");
    });

    it("la marca se declara por fuera, y una distinta cambia el veredicto", () => {
      const env = con({ ANTHROPIC_API_KEY: "qa-centinela" });
      expect(fallosDe(env)).toHaveLength(1);
      const { fallos } = checkIsolation(env, {
        ...VIVO,
        marcaCentinela: "qa-",
        // La marca nueva no alcanza a las otras tres, que siguen con «ensayo-».
      }) as { fallos: unknown[] };
      expect(fallos).toHaveLength(3);
    });
  });

  describe("la comprobación de Redis no puede desvanecerse", () => {
    const sinReferencia = {
      bucketVivo: VIVO.bucketVivo,
      cuentaViva: VIVO.cuentaViva,
      dbViva: VIVO.dbViva,
    };

    it("omitir --redis-vivo con REDIS_URL puesta NO aprueba", () => {
      // Antes esto estaba envuelto en `if (redisVivo)`, así que olvidar la
      // referencia aprobaba el ensayo contra el Redis vivo, en silencio.
      const { fallos } = checkIsolation(
        con({ REDIS_URL: "redis://redis-vivo:6379" }),
        sinReferencia,
      ) as { fallos: { qué: string }[] };
      expect(fallos).toHaveLength(1);
      expect(fallos[0].qué).toBe("falta declarar el Redis vivo");
    });

    it("una REDIS_URL no analizable tampoco", () => {
      const f = fallosDe(con({ REDIS_URL: "no-es-una-url" }));
      expect(f).toHaveLength(1);
      expect(f[0].porqué).toMatch(/no es analizable/);
    });

    it("y un Redis APAGADO sí exime de declararla", () => {
      const { fallos } = checkIsolation(
        con({ REDIS_URL: "" }),
        sinReferencia,
      ) as { fallos: unknown[] };
      expect(fallos).toEqual([]);
    });
  });

  it("sin REDIS_URL pasa: la app cae a su sustituto en memoria", () => {
    expect(fallosDe(con({ REDIS_URL: "" }))).toEqual([]);
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
  /**
   * Familia de efecto → marcas en el código → variable que la apaga.
   *
   * Para las fronteras que el schema declara requeridas, la guarda es la
   * COSTURA DE DESTINO, no la clave: la clave no se puede vaciar sin impedir el
   * arranque, así que lo que de verdad protege es a dónde apunta el cliente.
   */
  const FAMILIAS = [
    {
      familia: "R2",
      marcas: /\bstorage\.|deleteObject|uploadObject|putObject/,
      guarda: "R2_ENDPOINT",
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
      guarda: "ANTHROPIC_BASE_URL",
    },
    {
      familia: "embeddings",
      marcas: /[Ee]mbeddingService|voyage/,
      guarda: "VOYAGE_BASE_URL",
    },
    {
      familia: "voz",
      marcas: /[Ww]hisperProvider|[Dd]eepgramProvider|VoiceService/,
      guarda: "OPENAI_BASE_URL",
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
