import { describe, expect, it } from "vitest";
import {
  FREE_ECO_DAILY_LIMIT,
  ecoExhaustedMessage,
  ecoQuotaWindow,
  ecoRemaining,
  ecoResetsAt,
  nextAvailabilityLabel,
} from "./eco-quota";

/**
 * La política de cuota de Eco, fijada donde se puede leer.
 *
 * Estas pruebas son la parte que NO necesita gastar en el modelo. La
 * comprobación alojada de FREE —diez pasan, el undécimo recibe
 * `ECO_QUOTA_EXCEEDED`— está aceptada desde el 16-11 y no se repite; y un
 * periodo PRO no se comprueba enviando doscientos mensajes, se comprueba
 * aquí, que es donde vive la aritmética.
 */

const QUITO = "America/Guayaquil"; // UTC−5 todo el año
const TOKIO = "Asia/Tokyo"; // UTC+9

function sub(
  start: string,
  end: string,
  status = "ACTIVE",
): { currentPeriodStart: Date; currentPeriodEnd: Date; status: string } {
  return {
    currentPeriodStart: new Date(start),
    currentPeriodEnd: new Date(end),
    status,
  };
}

describe("la ventana que de verdad limita", () => {
  it("FREE: diez por día UTC, y el reinicio es la medianoche UTC siguiente", () => {
    const w = ecoQuotaWindow("FREE", null, new Date("2026-11-16T17:04:00Z"));
    expect(w.kind).toBe("utc-day");
    expect(w.limit).toBe(FREE_ECO_DAILY_LIMIT);
    expect(w.limit).toBe(10);
    expect(w.start.toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-11-17T00:00:00.000Z");
    expect(ecoResetsAt(w)?.toISOString()).toBe("2026-11-17T00:00:00.000Z");
  });

  it("FREE ignora la suscripción: es la regla que la puerta aplica", () => {
    // El control que impide que alguien «unifique» esto con el periodo de
    // facturación. Una cuenta FREE con una fila de suscripción vigente —que
    // puede existir tras un cambio de plan— sigue limitada por día.
    const w = ecoQuotaWindow(
      "FREE",
      sub("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z"),
      new Date("2026-11-16T17:04:00Z"),
    );
    expect(w.kind).toBe("utc-day");
    expect(w.limit).toBe(10);
  });

  it("PRO: 200 en el periodo de la suscripción, y el reinicio es su fin", () => {
    const w = ecoQuotaWindow(
      "PRO",
      sub("2026-11-03T08:30:00Z", "2026-12-03T08:30:00Z"),
      new Date("2026-11-16T17:04:00Z"),
    );
    expect(w.kind).toBe("subscription");
    expect(w.limit).toBe(200);
    expect(w.start.toISOString()).toBe("2026-11-03T08:30:00.000Z");
    expect(ecoResetsAt(w)?.toISOString()).toBe("2026-12-03T08:30:00.000Z");
  });

  it("PRO sin periodo vigente cae al mes calendario, no al día", () => {
    for (const estado of ["CANCELED", "INCOMPLETE", "UNPAID"]) {
      const w = ecoQuotaWindow(
        "PRO",
        sub("2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z", estado),
        new Date("2026-11-16T17:04:00Z"),
      );
      expect(w.kind).toBe("calendar-month");
      expect(w.limit).toBe(200);
      expect(w.start.toISOString()).toBe("2026-11-01T00:00:00.000Z");
      expect(w.end.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    }
  });

  it("los tres estados que SÍ cuentan como periodo vigente", () => {
    for (const estado of ["ACTIVE", "TRIALING", "PAST_DUE"]) {
      const w = ecoQuotaWindow(
        "ANNUAL",
        sub("2026-11-03T00:00:00Z", "2027-11-03T00:00:00Z", estado),
        new Date("2026-11-16T17:04:00Z"),
      );
      expect(w.kind).toBe("subscription");
    }
  });

  it("B2B no tiene cupo, y entonces no hay nada que reiniciar", () => {
    const w = ecoQuotaWindow("B2B", null, new Date("2026-11-16T17:04:00Z"));
    expect(w.limit).toBeNull();
    expect(ecoResetsAt(w)).toBeNull();
    expect(ecoRemaining(w, 9999)).toBeNull();
  });

  it("lo que queda nunca baja de cero", () => {
    const w = ecoQuotaWindow("FREE", null, new Date("2026-11-16T17:04:00Z"));
    expect(ecoRemaining(w, 0)).toBe(10);
    expect(ecoRemaining(w, 10)).toBe(0);
    expect(ecoRemaining(w, 25)).toBe(0);
  });
});

describe("la próxima disponibilidad, en el reloj de la persona", () => {
  it("en Quito, las 00:00 UTC son las 19:00 del MISMO día", () => {
    // Éste es el caso que el mensaje anterior decía mal: prometía «mañana» a
    // quien recupera mensajes hoy por la tarde.
    const etiqueta = nextAvailabilityLabel(
      new Date("2026-11-17T00:00:00Z"),
      QUITO,
      new Date("2026-11-16T17:04:00Z"),
    );
    expect(etiqueta).toBe("hoy a las 19:00");
  });

  it("en Tokio, ese mismo instante es mañana por la mañana", () => {
    const etiqueta = nextAvailabilityLabel(
      new Date("2026-11-17T00:00:00Z"),
      TOKIO,
      new Date("2026-11-16T17:04:00Z"), // 02:04 del 17 en Tokio…
    );
    // 00:00 UTC del 17 son las 09:00 del 17 en Tokio, y «ahora» ya es el 17
    // allí: el mismo día local.
    expect(etiqueta).toBe("hoy a las 09:00");
  });

  it("sin zona se usa UTC, sin inventar una hora local", () => {
    expect(
      nextAvailabilityLabel(
        new Date("2026-11-17T00:00:00Z"),
        null,
        new Date("2026-11-16T17:04:00Z"),
      ),
    ).toBe("mañana a las 00:00");
  });

  it("una zona inválida no revienta: cae a UTC", () => {
    expect(
      nextAvailabilityLabel(
        new Date("2026-11-17T00:00:00Z"),
        "No/Existe",
        new Date("2026-11-16T17:04:00Z"),
      ),
    ).toBe("mañana a las 00:00");
  });

  it("cuando falta más de un día, se nombra la fecha", () => {
    expect(
      nextAvailabilityLabel(
        new Date("2026-12-03T08:30:00Z"),
        QUITO,
        new Date("2026-11-16T17:04:00Z"),
      ),
    ).toBe("el 3 de diciembre a las 03:30");
  });

  it("la frontera del reinicio: un minuto antes y un minuto después", () => {
    // 23:59 UTC del 16 → en Quito son las 18:59 del 16, y el reinicio (00:00
    // UTC del 17) son las 19:00 del 16: HOY.
    expect(
      nextAvailabilityLabel(
        new Date("2026-11-17T00:00:00Z"),
        QUITO,
        new Date("2026-11-16T23:59:00Z"),
      ),
    ).toBe("hoy a las 19:00");
    // Un minuto después del reinicio, la ventana ya es la del 17 UTC — pero en
    // Quito todavía es el 16 por la tarde (19:01), así que el SIGUIENTE
    // reinicio cae mañana en su reloj. No es una rareza: en una zona al oeste
    // de UTC, «hoy a las 19:00» y «mañana a las 19:00» son los dos ciertos
    // según en qué lado de las 19:00 locales esté la persona, y por eso la
    // etiqueta se calcula y no se escribe a mano.
    const w = ecoQuotaWindow("FREE", null, new Date("2026-11-17T00:01:00Z"));
    expect(w.start.toISOString()).toBe("2026-11-17T00:00:00.000Z");
    expect(
      nextAvailabilityLabel(w.end, QUITO, new Date("2026-11-17T00:01:00Z")),
    ).toBe("mañana a las 19:00");
  });
});

describe("el mensaje de agotamiento", () => {
  const ahora = new Date("2026-11-16T17:04:00Z");

  it("FREE: dice cuántos eran, y cuándo vuelven en su reloj", () => {
    const w = ecoQuotaWindow("FREE", null, ahora);
    const m = ecoExhaustedMessage({ window: w, timezone: QUITO, now: ahora });
    expect(m).toBe(
      "Has usado tus 10 mensajes de Eco de hoy. Vuelves a tener mensajes hoy a las 19:00.",
    );
  });

  it("PRO: ni «hazte Pro» ni «vuelve mañana»", () => {
    const w = ecoQuotaWindow(
      "PRO",
      sub("2026-11-03T08:30:00Z", "2026-12-03T08:30:00Z"),
      ahora,
    );
    const m = ecoExhaustedMessage({ window: w, timezone: QUITO, now: ahora });
    expect(m).toBe(
      "Has usado tus 200 mensajes de Eco de este periodo. Vuelves a tener mensajes el 3 de diciembre a las 03:30.",
    );
    expect(m).not.toMatch(/Pro/i);
    expect(m).not.toMatch(/mañana/i);
  });

  it("ningún mensaje promete una contratación que el piloto no ofrece", () => {
    // El control que importa, y que cubre los tres planes a la vez: los
    // cobros están cerrados, así que mandar a alguien a contratar es mandarlo
    // a una puerta que no existe.
    const ventanas = [
      ecoQuotaWindow("FREE", null, ahora),
      ecoQuotaWindow(
        "PRO",
        sub("2026-11-03T00:00:00Z", "2026-12-03T00:00:00Z"),
        ahora,
      ),
      ecoQuotaWindow("ANNUAL", null, ahora),
      ecoQuotaWindow("B2B", null, ahora),
    ];
    for (const w of ventanas) {
      const m = ecoExhaustedMessage({ window: w, timezone: QUITO, now: ahora });
      expect(m).not.toMatch(/hazte|suscríb|contrat|mejora tu plan|upgrade/i);
      expect(m).not.toMatch(/\$|USD/);
    }
  });

  it("sin límite no se fabrica una cifra", () => {
    const w = ecoQuotaWindow("B2B", null, ahora);
    const m = ecoExhaustedMessage({ window: w, timezone: QUITO, now: ahora });
    expect(m).not.toMatch(/\d+ mensaje/);
    expect(m).toBe("No pudimos enviar tu mensaje. Reintenta en unos minutos.");
  });

  it("el singular, cuando el límite es uno", () => {
    const m = ecoExhaustedMessage({
      window: { limit: 1, start: ahora, end: ahora, kind: "utc-day" },
      timezone: QUITO,
      now: ahora,
    });
    expect(m).toContain("1 mensaje de Eco");
    expect(m).not.toContain("1 mensajes");
  });
});
