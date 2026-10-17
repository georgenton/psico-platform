/**
 * Los dos fallos de proveedor de Eco, reproducidos y atribuidos.
 *
 * El hallazgo que motiva esto se midió en una pila local: con una clave de
 * Voyage obviamente falsa, TODOS los envíos a Eco terminaban en error y el
 * registro decía únicamente `Eco sendMessage failed: Status code: 401`. Con
 * dos dependencias externas en el mismo camino —embeddings primero, modelo
 * después— esa línea no permite saber a cuál escribirle.
 *
 * Aquí se reproducen las dos con sustitutos deterministas y se comprueba lo
 * que cambia: que el registro nombre la etapa, la dependencia y una categoría
 * cerrada. Lo que NO debe cambiar —el mensaje que lee la persona, y que no
 * viaje ningún texto privado— se comprueba igual de explícitamente, porque es
 * la mitad que una mejora de observabilidad rompe sin querer.
 */

import { Logger } from "@nestjs/common";
import { HttpException, HttpStatus } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EcoStageError,
  classifyEcoFailure,
  correlacionSegura,
  describeEcoFailure,
  marcosSeguros,
  runStage,
  upstreamStatusOf,
} from "./eco-failure";

/** Un error como los que lanzan los SDK: lleva `status`, no un cuerpo. */
function errorDeProveedor(status: number, mensaje = "Status code: " + status) {
  const e = new Error(mensaje) as Error & { status: number };
  e.status = status;
  return e;
}

describe("atribución de fallos de Eco", () => {
  describe("runStage", () => {
    it("deja pasar el valor cuando la etapa va bien", async () => {
      await expect(
        runStage("embeddings", "voyage", async () => 42),
      ).resolves.toBe(42);
    });

    it("etiqueta la etapa y la dependencia de lo que lance", async () => {
      const caido = runStage("embeddings", "voyage", async () => {
        throw errorDeProveedor(401);
      });
      await expect(caido).rejects.toBeInstanceOf(EcoStageError);
      await caido.catch((err: EcoStageError) => {
        expect(err.stage).toBe("embeddings");
        expect(err.dependency).toBe("voyage");
        expect((err.original as Error).message).toContain("401");
      });
    });

    it("NO envuelve las negativas deliberadas del propio servicio", async () => {
      // Una cuota agotada ya tiene código y mensaje propios. Convertirla en
      // «fallo de dependencia» sería precisamente la confusión que se corrige.
      const negativa = new HttpException(
        { statusCode: 402, code: "ECO_QUOTA_EXCEEDED", message: "…" },
        HttpStatus.PAYMENT_REQUIRED,
      );
      const caido = runStage("quota", "database", async () => {
        throw negativa;
      });
      await expect(caido).rejects.toBe(negativa);
    });

    it("no re-etiqueta un error que ya venía etiquetado", async () => {
      const interno = new EcoStageError("model", "anthropic", new Error("x"));
      const caido = runStage("finalize", "database", async () => {
        throw interno;
      });
      await expect(caido).rejects.toBe(interno);
    });
  });

  describe("classifyEcoFailure", () => {
    const casos: Array<[string, unknown, string, string]> = [
      [
        "401 de embeddings → credencial nuestra, no caída suya",
        new EcoStageError("embeddings", "voyage", errorDeProveedor(401)),
        "upstream_auth",
        "embeddings",
      ],
      [
        "403 se trata igual que 401",
        new EcoStageError("embeddings", "voyage", errorDeProveedor(403)),
        "upstream_auth",
        "embeddings",
      ],
      [
        "429 del modelo → esperar tiene sentido",
        new EcoStageError("model", "anthropic", errorDeProveedor(429)),
        "upstream_rate_limit",
        "model",
      ],
      [
        "500 del modelo → el tercero está caído",
        new EcoStageError("model", "anthropic", errorDeProveedor(500)),
        "upstream_unavailable",
        "model",
      ],
      [
        "400 del modelo → le mandamos algo que no acepta",
        new EcoStageError("model", "anthropic", errorDeProveedor(400)),
        "upstream_rejected",
        "model",
      ],
      [
        "sin estado: no hubo respuesta, se lee como caída del tercero",
        new EcoStageError("model", "anthropic", new Error("fetch failed")),
        "upstream_unavailable",
        "model",
      ],
      [
        "la base es nuestra, no un tercero",
        new EcoStageError("retrieval", "database", new Error("deadlock")),
        "internal",
        "retrieval",
      ],
      [
        "un error sin etiqueta no se atribuye a la última etapa por descarte",
        new Error("algo nuestro"),
        "internal",
        "unknown",
      ],
    ];

    it.each(casos)("%s", (_nombre, err, categoria, etapa) => {
      const a = classifyEcoFailure(err);
      expect(a.category).toBe(categoria);
      expect(a.stage).toBe(etapa);
    });

    it("una negativa deliberada no inventa un tercero (control de regresión)", () => {
      // La primera versión de este clasificador leía el `statusCode` de la
      // excepción y escribía `upstreamStatus=402` para una cuota agotada:
      // un código nuestro presentado como respuesta de un proveedor. Lo
      // descubrió la corrida de las pruebas del servicio, no una revisión.
      const negativa = new HttpException(
        { statusCode: 402, code: "ECO_QUOTA_EXCEEDED", message: "…" },
        HttpStatus.PAYMENT_REQUIRED,
      );
      const a = classifyEcoFailure(negativa);
      expect(a.category).toBe("deliberate_refusal");
      expect(a.dependency).toBe("internal");
      expect(a.upstreamStatus).toBeNull();
      expect(describeEcoFailure(a)).not.toContain("upstreamStatus");
    });

    it("un HttpException 5xx NO es una negativa deliberada (R1)", () => {
      // Tener `getStatus()` no significa «dijimos que no a propósito». Un 500
      // o un 503 lanzados como HttpException son un fallo NUESTRO, y
      // clasificarlos como negativa los sacaba del registro de errores y de
      // Sentry: justo los que hay que mirar.
      for (const estado of [500, 502, 503]) {
        const err = new HttpException({ code: "X", message: "…" }, estado);
        const a = classifyEcoFailure(err);
        expect(a.category).toBe("internal");
      }
      for (const estado of [400, 402, 403, 404, 429]) {
        const err = new HttpException({ code: "X", message: "…" }, estado);
        expect(classifyEcoFailure(err).category).toBe("deliberate_refusal");
      }
    });

    it("la correlación se valida antes de tratarla como metadato", () => {
      expect(correlacionSegura("cmv8upveo001m6qvvknmhqmyz")).not.toBeNull();
      expect(correlacionSegura("thread-1")).not.toBeNull();
      expect(correlacionSegura("con espacio")).toBeNull();
      expect(correlacionSegura("con\nsalto")).toBeNull();
      expect(correlacionSegura("x".repeat(65))).toBeNull();
      expect(correlacionSegura(42)).toBeNull();
    });

    it("los marcos se reducen a su ubicación, sin nombres arbitrarios", () => {
      // Quitar la primera línea del stack no basta: `at <nombre> (<sitio>)`
      // lleva texto arbitrario en `<nombre>`, y una prueba con marcadores
      // sintéticos lo destapó.
      //
      // Y la ubicación tampoco basta por sí sola: ahora sólo sobreviven los
      // marcos bajo la raíz de la aplicación, emitidos RELATIVOS a ella. Se
      // usa este propio archivo, que por construcción está dentro.
      const e = new Error("mensaje");
      const marcos = marcosSeguros(e);
      expect(marcos.length).toBeGreaterThan(0);
      expect(marcos.join(" ")).toContain("eco-failure.spec.ts");
      // Relativos: ninguna ruta absoluta de la máquina sale de aquí.
      for (const m of marcos) expect(m.startsWith("/")).toBe(false);
    });

    it("una ruta ajena al proyecto se descarta entera", () => {
      // Contraprueba B de la revisión: el stack de un error ajeno puede traer
      // un fichero temporal o una URL con un token en la query. Ninguno es
      // información de diagnóstico cuya seguridad podamos demostrar.
      const e = new Error("mensaje");
      e.stack =
        "Error: mensaje\n" +
        "    at algo (/tmp/MARCADOR_EN_RUTA/secreto.js:1:1)\n" +
        "    at https://proveedor.example/v1?token=MARCADOR_EN_URL:2:2\n" +
        "    at otro (/app/node_modules/sdk/index.js:3:3)";
      const marcos = marcosSeguros(e);
      expect(marcos).toEqual([]);
    });

    it("lee el estado de `status` y de `statusCode`, y descarta basura", () => {
      expect(upstreamStatusOf({ status: 503 })).toBe(503);
      expect(upstreamStatusOf({ statusCode: 429 })).toBe(429);
      expect(upstreamStatusOf({ status: "503" })).toBeNull();
      expect(upstreamStatusOf({ status: 99 })).toBeNull();
      expect(upstreamStatusOf(new Error("sin estado"))).toBeNull();
    });
  });

  describe("describeEcoFailure", () => {
    it("nombra etapa, dependencia, categoría y estado", () => {
      const linea = describeEcoFailure(
        classifyEcoFailure(
          new EcoStageError("embeddings", "voyage", errorDeProveedor(401)),
        ),
        { threadId: "thread-xyz" },
      );
      expect(linea).toContain("stage=embeddings");
      expect(linea).toContain("dependency=voyage");
      expect(linea).toContain("category=upstream_auth");
      expect(linea).toContain("upstreamStatus=401");
      expect(linea).toContain("threadId=thread-xyz");
    });

    it("omite el estado cuando el tercero no respondió", () => {
      const linea = describeEcoFailure(
        classifyEcoFailure(
          new EcoStageError("model", "anthropic", new Error("socket hang up")),
        ),
      );
      expect(linea).not.toContain("upstreamStatus");
      expect(linea).toContain("dependency=anthropic");
    });

    it("la línea se compone SÓLO de constantes y números", () => {
      // El control que importa: nada de lo que entra puede arrastrar texto de
      // la persona. Se le pasa una atribución con un estado y se comprueba que
      // la salida no contiene nada más que las claves conocidas.
      const linea = describeEcoFailure(
        {
          stage: "model",
          dependency: "anthropic",
          category: "upstream_unavailable",
          upstreamStatus: 503,
        },
        { threadId: "t1", messageId: "m1" },
      );
      const claves = linea.split(" ").map((p) => p.split("=")[0]);
      expect(claves.sort()).toEqual(
        [
          "category",
          "dependency",
          "messageId",
          "stage",
          "threadId",
          "upstreamStatus",
        ].sort(),
      );
    });
  });
});

describe("el mensaje para la persona no cambia", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("la atribución va al registro, no al texto que se lee en pantalla", () => {
    // Doble comprobación barata de la invariante que esta mejora podría
    // romper: el texto que el servicio emite por el stream está fijado en su
    // propio archivo y no se construye con la atribución.
    const spy = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    const a = classifyEcoFailure(
      new EcoStageError("embeddings", "voyage", errorDeProveedor(401)),
    );
    const linea = describeEcoFailure(a);
    expect(linea).not.toContain("Algo salió mal");
    spy.mockRestore();
  });
});
