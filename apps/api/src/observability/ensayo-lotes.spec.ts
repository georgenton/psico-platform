import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// @ts-expect-error — guion de ops en JavaScript, sin tipos.
import * as lib from "../../../../scripts/sentry-sumidero/lib.mjs";

/**
 * La comprobación de lotes del ensayo de Sentry (`scripts/sentry-sumidero`).
 *
 * El ensayo informó «0 de 18» del servidor de Web mirando los sobres de Edge: los
 * del servidor se habían descartado sin buscar nada. Lo que se fija aquí es que
 * un lote que no es el que dice ser, o que nadie miró, no puede aprobar. El
 * recorrido real lo hace el ensayo; su control negativo está en su README.
 */

const { acta, compruebaLote, senuelos, sinRevisar } = lib;

type Evento = {
  tags?: Record<string, string>;
  exception?: object;
};

const VALORES: Record<string, string> = senuelos(["cuerpo", "agente"]);

const sobre = (evento: Evento, cabeceras: string[] = []) => ({
  metodo: "POST",
  url: "/api/1/envelope/?sentry_key=x",
  cabeceras,
  cuerpo: ["{}", '{"type":"event"}', JSON.stringify(evento)].join("\n"),
});

const servidor = (extra: object = {}) =>
  sobre({ tags: { service: "servidor" }, ...extra });
const edge = () => sobre({ tags: { service: "edge" } });

const CONTEXTOS = [
  ["servidor", 1, (e: Evento) => e.tags?.service === "servidor"],
];

const revisa = (recibidos: object[], mas: object = {}) => {
  const a = acta();
  const ok = compruebaLote(a, "servidor inicial", recibidos, {
    valores: VALORES,
    introducidos: ["cuerpo"],
    contextos: CONTEXTOS,
    ...mas,
  });
  return { a, ok, fila: a.filas.at(-1) };
};

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("un lote del ensayo de Sentry", () => {
  it("aprueba con su evento y sin señuelos, y dice cuántos miró", () => {
    const { ok, fila } = revisa([servidor(), edge()]);
    expect(ok).toBe(true);
    expect(fila.nombre).toBe("señuelos en el lote «servidor inicial»: 0 de 2");
    expect(fila.detalle).toContain("2 evento(s) en 2 sobre(s)");
    expect(fila.detalle).toContain("servidor: 1");
  });

  it("vacío no aprueba, y no escribe un cero", () => {
    const { ok, fila } = revisa([]);
    expect(ok).toBe(false);
    expect(fila.nombre).toBe(
      "señuelos en el lote «servidor inicial»: SIN RESPALDO",
    );
    expect(fila.detalle).toContain("FALTAN");
  });

  it("con los sobres de OTRO proceso no aprueba, aunque estén limpios", () => {
    expect(revisa([edge(), edge()]).ok).toBe(false);
  });

  it("no aprueba si faltan eventos del mínimo", () => {
    const contextos = [["servidor", 2, CONTEXTOS[0]![2]]];
    expect(revisa([servidor()], { contextos }).ok).toBe(false);
    expect(revisa([servidor(), servidor()], { contextos }).ok).toBe(true);
  });

  it("no aprueba sin decir qué contexto comprueba", () => {
    expect(revisa([servidor()], { contextos: [] }).ok).toBe(false);
  });

  it("un señuelo lo tumba, con el nombre del lote y del señuelo", () => {
    const { ok, fila } = revisa([
      servidor({ exception: { values: [{ value: `x ${VALORES.cuerpo}` }] } }),
    ]);
    expect(ok).toBe(false);
    expect(fila).toMatchObject({
      nombre: "señuelos en el lote «servidor inicial»: 1 de 2",
      lote: "servidor inicial",
      salen: ["cuerpo"],
    });
  });

  it("también en la cabecera o en la dirección", () => {
    const conCabecera = sobre({ tags: { service: "servidor" } }, [
      "cookie",
      `a=${VALORES.cuerpo}`,
    ]);
    expect(revisa([conCabecera]).fila.salen).toEqual(["cuerpo"]);
    const conDireccion = {
      ...servidor(),
      url: `/api/1/envelope/?t=${VALORES.cuerpo}`,
    };
    expect(revisa([conDireccion]).fila.salen).toEqual(["cuerpo"]);
  });

  it("lo que viaja en la conexión por naturaleza sólo se perdona ahí", () => {
    const opciones = { enCabeceras: ["agente"] };
    const enCabecera = sobre({ tags: { service: "servidor" } }, [
      "user-agent",
      VALORES.agente!,
    ]);
    expect(revisa([enCabecera], opciones).ok).toBe(true);
    const enCuerpo = servidor({ extra: VALORES.agente });
    expect(revisa([enCuerpo], opciones).fila.salen).toEqual(["agente"]);
  });

  it("no aprueba un sobre que no se puede leer", () => {
    const comprimido = { ...servidor(), cuerpo: "\u001f�\b\u0000" };
    const { ok, fila } = revisa([servidor(), comprimido]);
    expect(ok).toBe(false);
    expect(fila.detalle).toContain("ILEGIBLES: 1");
  });

  it("no aprueba si no se introdujo ningún señuelo", () => {
    expect(revisa([servidor()], { introducidos: [] }).ok).toBe(false);
  });
});

describe("lo que llegó y nadie miró", () => {
  it("consta hasta que una comprobación de lote lo mira", () => {
    const inicial = servidor();
    const deEdge = edge();
    const suelto = { ...servidor(), url: "/spotlight" };
    // Lo que hacía el ensayo: descartar el inicial y revisar sólo el de Edge.
    const { a } = revisa([deEdge]);
    expect(sinRevisar(a, [inicial, deEdge, suelto])).toEqual([inicial]);
    compruebaLote(a, "otro", [inicial], {
      valores: VALORES,
      introducidos: ["cuerpo"],
      contextos: CONTEXTOS,
    });
    expect(sinRevisar(a, [inicial, deEdge, suelto])).toEqual([]);
  });
});
