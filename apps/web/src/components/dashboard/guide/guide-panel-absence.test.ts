import { describe, expect, it } from "vitest";
import {
  GUIDE_PANEL_ABSENCE_COPY,
  guidePanelAbsence,
  type GuidePanelAbsenceInput,
} from "./guide-panel-absence";

/**
 * La regla, probada como regla.
 *
 * El defecto que la trajo aquí: el panel preguntaba
 * `status !== "loading" && definition === null` y con eso **una consulta que
 * falló se anunciaba como una decisión editorial** — «este capítulo todavía no
 * tiene recorrido guiado publicado» sobre un `status: "error"`, que no afirma
 * nada del catálogo. Es el mismo error que la mejora anterior vino a deshacer,
 * un paso más allá: tres causas no caben en dos condiciones, y cuatro menos.
 *
 * El ORDEN es parte de la regla, así que cada caso que lo fija declara las dos
 * cosas ciertas a la vez y nombra la que manda.
 */

const LISTO: GuidePanelAbsenceInput = {
  status: "ready",
  hasDefinition: true,
  publishedCount: 1,
  ownedLookupFailed: false,
  anchorResolved: true,
};

const con = (p: Partial<GuidePanelAbsenceInput>) => ({ ...LISTO, ...p });

describe("guidePanelAbsence", () => {
  it("no explica nada cuando hay recorrido y su pasaje resuelve", () => {
    expect(guidePanelAbsence(LISTO)).toBeNull();
  });

  it("no adelanta ningún veredicto mientras la consulta está en vuelo", () => {
    // Y con TODO lo demás en su peor estado: en vuelo no se sabe nada, y
    // ninguno de esos campos es todavía un hecho.
    expect(
      guidePanelAbsence(
        con({
          status: "loading",
          hasDefinition: false,
          publishedCount: 0,
          ownedLookupFailed: true,
          anchorResolved: false,
        }),
      ),
    ).toBe("loading");
  });

  it("una consulta fallida NO se lee como un capítulo sin publicar", () => {
    // El defecto exacto. `status: "error"` con `hasDefinition: false` es
    // indistinguible, mirando sólo esos dos campos, de «el capítulo no publica
    // nada» — y son cosas distintas con remedios distintos.
    expect(
      guidePanelAbsence(con({ status: "error", hasDefinition: false })),
    ).toBe("lookup-failed");
    expect(GUIDE_PANEL_ABSENCE_COPY["lookup-failed"].text).not.toMatch(
      /no tiene recorrido/i,
    );
  });

  it("y tampoco cuando lo que falló fue la lectura del recorrido propio", () => {
    // La segunda consulta. Un 404 ahí es la respuesta normal y deja esto en
    // false; cualquier otra cosa —red, 401, 5xx— no contestó, y entonces
    // `definition === null` no es un hecho sobre el catálogo.
    expect(
      guidePanelAbsence(
        con({ status: "ready", hasDefinition: false, ownedLookupFailed: true }),
      ),
    ).toBe("lookup-failed");
  });

  it("el fallo gana sobre el recuento de lo publicado", () => {
    // Las dos son ciertas —falló y el capítulo publica cero— y sólo una es la
    // causa: de una pregunta sin contestar no sale una conclusión.
    expect(
      guidePanelAbsence(
        con({ status: "error", hasDefinition: false, publishedCount: 0 }),
      ),
    ).toBe("lookup-failed");
  });

  it("sin nada publicado, lo dice sin llamarlo avería", () => {
    expect(
      guidePanelAbsence(
        con({ status: "ready", hasDefinition: false, publishedCount: 0 }),
      ),
    ).toBe("not-published");
    expect(GUIDE_PANEL_ABSENCE_COPY["not-published"].text).not.toMatch(
      /no pudimos/i,
    );
  });

  it("con otros publicados y este no, no dice que el capítulo esté vacío", () => {
    // Distinto remedio: ahí sí hay algo que abrir, en otra tarjeta.
    expect(
      guidePanelAbsence(
        con({ status: "ready", hasDefinition: false, publishedCount: 3 }),
      ),
    ).toBe("pin-unavailable");
    expect(GUIDE_PANEL_ABSENCE_COPY["pin-unavailable"].text).not.toMatch(
      /no tiene recorrido/i,
    );
  });

  it("«nada publicado» gana sobre «el pasaje no se localiza»", () => {
    // Las dos ciertas. El ancla de un recorrido que no existe no es una
    // avería, y la versión anterior de este componente ponía el ancla delante
    // y reportaba una avería donde no había ninguna.
    expect(
      guidePanelAbsence(
        con({
          status: "ready",
          hasDefinition: false,
          publishedCount: 0,
          anchorResolved: false,
        }),
      ),
    ).toBe("not-published");
  });

  it("conserva la avería real: hay recorrido y su pasaje no aparece", () => {
    expect(guidePanelAbsence(con({ anchorResolved: false }))).toBe(
      "anchor-unresolved",
    );
    expect(GUIDE_PANEL_ABSENCE_COPY["anchor-unresolved"].text).toMatch(
      /No pudimos preparar/i,
    );
  });

  it("cada causa tiene su identificador, y ninguno se repite", () => {
    // Sin esto, dos causas podrían compartir marca y cualquier instrumento que
    // mire el DOM —las pruebas incluidas— las confundiría otra vez.
    const ids = Object.values(GUIDE_PANEL_ABSENCE_COPY).map((c) => c.testId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(5);
  });
});
