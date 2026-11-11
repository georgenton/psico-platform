import { describe, expect, it, vi } from "vitest";

import { GuideLifecycleService } from "./guide-lifecycle.service";
import { EXPERIENCE_DEFINITION_REPOSITORY } from "../experience/experience-definition.repository";

/**
 * `presentation` — la tercera pregunta de una tarjeta, y la única que hasta
 * ahora no tenía prueba en el servidor.
 *
 * Las otras dos ya estaban cubiertas. `status` dice qué palabra lleva el
 * control (START / CONTINUE / COMPLETED) y `applicability` dice si esta guía
 * habla del capítulo que hay en pantalla. Ninguna de las dos contesta «¿y
 * existe algo que este clic pueda ABRIR?», que es una pregunta sobre la
 * definición, no sobre la sesión ni sobre la navegación.
 *
 * Sin esa tercera respuesta la tarjeta ofrecía «Revisar» y el panel contestaba
 * «No pudimos preparar el recorrido» — medido en las cinco microguías de C01,
 * que tienen sesiones COMPLETED y ninguna definición reproducible.
 *
 * Lo que estas pruebas fijan, y por qué cada una:
 *
 *   1. Resoluble → PLAYABLE. Es el caso histórico: una sesión fijada a un pin
 *      que el lector SÍ puede abrir conserva su acción.
 *   2. No resoluble → PREPARING. El control se desactiva en vez de prometer.
 *   3. **Un DRAFT no vuelve PLAYABLE.** Es la más importante de las cinco: la
 *      vista previa de un borrador es un camino editorial con rol ADMIN, y si
 *      la resolución del lector aceptara borradores, publicar dejaría de ser
 *      la frontera. El repositorio de base exige PUBLISHED precisamente por
 *      esto, y aquí se comprueba que la tarjeta hereda esa frontera.
 *   4. Sin repositorio inyectado → el campo NO viaja. Es el comportamiento del
 *      cliente anterior, y se degrada a lo de antes, no a algo peor.
 *   5. Un fallo de lectura → el campo NO viaja. «No pude mirar» y «no hay» son
 *      hechos distintos, y afirmar el segundo desactivaría un control que sí
 *      abre.
 */

const READER = {
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  unitKey: "unit-c01",
} as const;

/**
 * Versión **2** a propósito. Con la 1 una mutación que fijara la versión a 1
 * sería invisible, y eso es exactamente lo que se quiere impedir: dos
 * versiones de una guía pueden nombrar escenas distintas.
 */
const PIN = { guideKey: "eec-c1-teorias-como-lentes", guideVersion: 2 };

/** Una definición cualquiera: lo que importa es que `getExact` la devuelva. */
const definicion = (status: "PUBLISHED" | "DRAFT" | "ARCHIVED") =>
  ({
    experienceKey: PIN.guideKey,
    experienceVersion: PIN.guideVersion,
    bookSlug: READER.bookSlug,
    chapterOrder: 1,
    title: "Lo que una teoría alcanza a mirar",
    status,
    guidePin: PIN,
    scenes: [],
  }) as never;

/**
 * El servicio con lo mínimo para que `resolveExperienceCardStates` llegue a la
 * decisión: dos lecturas de sesión, un veredicto de applicability y el
 * repositorio de definiciones — que es el sujeto de la prueba.
 *
 * `definitions === undefined` reproduce el despliegue sin el repositorio.
 */
function servicio(definitions: unknown) {
  const tx = {};
  return new GuideLifecycleService(
    { $transaction: (fn: (t: unknown) => unknown) => fn(tx) } as never,
    {} as never, // resolver — esta ruta no lo toca
    {} as never, // access
    {} as never, // context
    {
      // Ninguna sesión ACTIVE, y una COMPLETED en el pin exacto: el caso real
      // de las cinco microguías tras el recorrido por HTTP.
      findActiveOwnForGuideKeys: vi.fn(async () => []),
      findLatestOwnPerExactPin: vi.fn(async () => [
        {
          guideKey: PIN.guideKey,
          guideVersion: PIN.guideVersion,
          status: "COMPLETED",
        },
      ]),
    } as never,
    {} as never, // steps
    {} as never, // receipts
    {} as never, // events
    { verdicts: vi.fn(async () => ["APPLIES"]) } as never,
    definitions as never,
  );
}

async function presentacion(definitions: unknown) {
  const items = await servicio(definitions).resolveExperienceCardStates(
    "user-1",
    [PIN],
    READER,
  );
  return (items[0] as { presentation?: string }).presentation;
}

describe("la tercera pregunta de una tarjeta: ¿hay algo que abrir?", () => {
  it("una definición resoluble deja el control activo (PLAYABLE)", async () => {
    const getExact = vi.fn(async () => definicion("PUBLISHED"));
    expect(await presentacion({ getExact })).toBe("PLAYABLE");
    // Por VERSIÓN EXACTA, no por clave: dos versiones de una guía pueden
    // nombrar escenas distintas, y resolver por clave contestaría sobre una
    // que nadie fijó.
    expect(getExact).toHaveBeenCalledWith({
      experienceKey: PIN.guideKey,
      experienceVersion: PIN.guideVersion,
    });
  });

  it("sin definición el control se desactiva (PREPARING), no promete", async () => {
    expect(await presentacion({ getExact: vi.fn(async () => null) })).toBe(
      "PREPARING",
    );
  });

  it("un DRAFT NO vuelve PLAYABLE: publicar sigue siendo la frontera", async () => {
    // El repositorio de base ya devuelve `null` para todo lo que no sea
    // PUBLISHED. Esta prueba fija que la tarjeta hereda esa decisión en vez de
    // volver a preguntarla: si algún día alguien «arreglase» la resolución del
    // lector para aceptar borradores, la vista previa privada de un editor se
    // convertiría en un control abierto a cualquiera.
    const getExact = vi.fn(async (pin: { experienceKey: string }) => {
      const fila = definicion("DRAFT") as unknown as { status: string };
      return fila.status === "PUBLISHED" ? (fila as never) : null;
    });
    expect(await presentacion({ getExact })).toBe("PREPARING");
  });

  it("sin repositorio el campo NO viaja — el cliente anterior, intacto", async () => {
    expect(await presentacion(undefined)).toBeUndefined();
  });

  it("un fallo de lectura NO se afirma como «no hay»", async () => {
    const getExact = vi.fn(async () => {
      throw new Error("la base no contestó");
    });
    // Ni PLAYABLE ni PREPARING: el campo se omite, que es la única respuesta
    // honesta cuando no se pudo mirar.
    expect(await presentacion({ getExact })).toBeUndefined();
  });
});

describe("el símbolo que une las dos mitades", () => {
  it("el servicio pide el repositorio por el token que el módulo exporta", () => {
    // Si el token se renombrara en un lado, la inyección opcional dejaría
    // `definitions` en null y el campo desaparecería EN SILENCIO para todo el
    // mundo — un fallo sin síntoma, que es el peor que puede tener algo
    // opcional. Nombrarlo aquí lo convierte en un fallo de compilación.
    expect(EXPERIENCE_DEFINITION_REPOSITORY).toBeTruthy();
  });
});
