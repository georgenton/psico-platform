import { describe, expect, it } from "vitest";
import {
  hasOwnOpenableJourney,
  type OwnJourneyFacts,
} from "./guide-own-journey";

/**
 * B5 — la regla, probada como regla.
 *
 * Lo que decide la oferta de la pestaña cuando el capítulo no publica nada no
 * puede vivir en un `if` dentro de un `useMemo` de 2 000 líneas: ahí no se
 * prueban sus bordes, y los bordes son lo delicado. Las tres condiciones son
 * **las mismas tres** que `openRouteGuide` exige antes de abrir algo, y eso es
 * el invariante que estos casos fijan: si la pestaña apareciera con un criterio
 * más laxo que el de la apertura, volveríamos a ofrecer una puerta que el clic
 * rechaza.
 */

const PROPIO: OwnJourneyFacts = {
  status: "CONTINUE",
  applicability: "APPLIES",
  presentation: "PLAYABLE",
};

describe("hasOwnOpenableJourney", () => {
  it("sin estados no hay recorrido propio", () => {
    expect(hasOwnOpenableJourney([])).toBe(false);
  });

  it("una sesión en curso, admitida y reproducible, SÍ lo es", () => {
    expect(hasOwnOpenableJourney([PROPIO])).toBe(true);
  });

  it("una terminada también: repasarla es abrirla", () => {
    // «Revisar» es una de las dos acciones que el encargo nombra, así que
    // COMPLETED cuenta igual que CONTINUE. Lo contrario le quitaría la puerta a
    // quien ya acabó su recorrido.
    expect(hasOwnOpenableJourney([{ ...PROPIO, status: "COMPLETED" }])).toBe(
      true,
    );
  });

  it("el control contrario · `START` no es un recorrido propio", () => {
    // Éste es el que impide la pestaña vacía: quien no ha empezado nada no
    // tiene puerta que conservar, y `START` es además el veredicto de un pin
    // que nadie ha tocado — incluido uno sin experiencia detrás.
    expect(hasOwnOpenableJourney([{ ...PROPIO, status: "START" }])).toBe(false);
  });

  it("el control contrario · el servidor no lo admite en este capítulo", () => {
    expect(
      hasOwnOpenableJourney([{ ...PROPIO, applicability: "UNAVAILABLE" }]),
    ).toBe(false);
  });

  it("el control contrario · la ausencia de respuesta NO es un sí", () => {
    // Una respuesta legada no trae `applicability`. «No podemos saberlo» tiene
    // que leerse como lo que es, y no como permiso: es exactamente la
    // confusión que el resto de este módulo existe para no repetir.
    expect(hasOwnOpenableJourney([{ status: "CONTINUE" }])).toBe(false);
    expect(
      hasOwnOpenableJourney([{ status: "CONTINUE", applicability: null }]),
    ).toBe(false);
  });

  it("el control contrario · sin definición reproducible no se ofrece nada", () => {
    // El caso de las cinco microguías antes de publicarse: «Completada» era
    // cierto y el panel no tenía nada que pintar. El estado se conserva; la
    // puerta no se promete.
    expect(
      hasOwnOpenableJourney([{ ...PROPIO, presentation: "PREPARING" }]),
    ).toBe(false);
  });

  it("un pin SIN `presentation` se comporta como antes de que ese campo existiera", () => {
    // Su ausencia no es `PREPARING`. Eso es lo que conserva el repaso de una
    // versión histórica que sigue resolviendo, que es justo lo que no se puede
    // quitar para tapar el problema.
    expect(
      hasOwnOpenableJourney([{ status: "CONTINUE", applicability: "APPLIES" }]),
    ).toBe(true);
  });

  it("basta UNO entre varios: es una pregunta sobre el capítulo", () => {
    // El caso del encargo, literal: el pin predeterminado no tiene nada y otro
    // del mismo capítulo sí.
    const estados: OwnJourneyFacts[] = [
      { status: "START", applicability: "APPLIES", presentation: "PREPARING" },
      { status: "START", applicability: "APPLIES", presentation: "PREPARING" },
      PROPIO,
      { status: "START", applicability: "UNAVAILABLE" },
    ];
    expect(hasOwnOpenableJourney(estados)).toBe(true);
  });

  it("y ninguno basta si a todos les falta algo distinto", () => {
    const estados: OwnJourneyFacts[] = [
      { status: "CONTINUE", applicability: "UNAVAILABLE" },
      {
        status: "COMPLETED",
        applicability: "APPLIES",
        presentation: "PREPARING",
      },
      { status: "START", applicability: "APPLIES", presentation: "PLAYABLE" },
      { status: "CONTINUE" },
    ];
    expect(hasOwnOpenableJourney(estados)).toBe(false);
  });
});
