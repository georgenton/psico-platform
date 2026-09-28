import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Trinquete de tamaño de objetivo y de nombre accesible — lote P3 (#746, #747).
 *
 * QUÉ PRUEBA ESTO Y QUÉ NO. La geometría real se mide en el navegador, y esa es
 * la autoridad: un jsdom no sabe cuánto ocupa un glifo. Lo que se puede sostener
 * aquí, y hace falta, es la DECLARACIÓN que produce esa geometría. Los fallos
 * volverían por donde vinieron: alguien quita un `min-h-[24px]` para apretar una
 * fila, o cambia un `aria-label` por un `title` pensando que da igual.
 *
 * Cada caso lleva el número medido antes del arreglo, para que quien lea esto
 * mañana sepa qué se rompía y cuánto.
 *
 * LO QUE NO SE TOCÓ, A PROPÓSITO. La casilla «Recordar en este dispositivo» mide
 * 16×16, y no es un fallo: responde todo su `<label>`, 626,9×68,9 medidos. Los
 * enlaces del armazón de Autor estaban además exentos por separación; se les dio
 * tamaño porque era gratis, no porque incumplieran.
 *
 * CONTROL NEGATIVO: devolver cualquiera de estos controles a su clase anterior
 * —`px-1.5 py-0.5` sin mínimos, o el enlace sin `min-h`— hace fallar la prueba
 * que lo cubre. Es la misma mutación que causaba el defecto.
 */

const raiz = join(__dirname, "..");
const leer = (rel: string) => readFileSync(join(raiz, rel), "utf8");

/**
 * El contrato se acota al elemento del que habla. Un «no aparece en todo el
 * fichero» prohibiría usos legítimos —`px-1.5` está bien en cualquier otro
 * sitio— y acabaría borrándose por molesto, que es la peor clase de prueba.
 */
const trozo = (fuente: string, desde: string, hasta: string) => {
  const i = fuente.indexOf(desde);
  expect(i, `no se encontró «${desde}»`).toBeGreaterThan(-1);
  const j = fuente.indexOf(hasta, i);
  return fuente.slice(i, j > i ? j : undefined);
};

describe("#746 · el correo de la barra lateral tiene caja para sus descendentes", () => {
  // Medía 12px de caja con 12px de tipo, y el área del tipo pide 14. Con Geist
  // la tinta llegaba a 11,94 y no se veía; con cualquier cara de reserva de la
  // pila se cortaban 0,33–0,67px de q, y, p.
  const shell = leer("app/dashboard/_DashboardShell.tsx");
  const span = () => trozo(shell, 'textOverflow: "ellipsis"', "{user?.email");

  it("declara una altura de línea propia y no hereda la de `.nav-item`", () => {
    // `.nav-item` trae `font: 500 14px/1`: heredar ese 1 recalculaba la caja a
    // 12px exactos. Sin una altura explícita aquí, el defecto vuelve entero.
    expect(span()).toMatch(/lineHeight:\s*1\.3\d/);
  });

  it("conserva el truncado horizontal, que es lo que no se debía romper", () => {
    const s = span();
    expect(s).toContain('textOverflow: "ellipsis"');
    expect(s).toContain('overflow: "hidden"');
    expect(s).toContain('whiteSpace: "nowrap"');
    expect(s).toContain("maxWidth: 130");
  });
});

describe("#747 · los botones de icono de Autor responden en 24×24", () => {
  // Medidos 19,8×20,5 (↑ ↓), 20,4×20,5 (✕) y 26×20,5 (✨). Los centros de ↑ y ↓
  // quedaban a 23,9px: dos círculos de 24 se cortan, así que tampoco les valía
  // la excepción de separación de 2.5.8.
  const casos = [
    [
      "estructura",
      "app/autor/libros/[id]/estructura/StructureEditor.tsx",
      ["↑", "↓", "✕"],
    ],
    [
      "capítulo",
      "app/autor/libros/[id]/capitulos/[n]/ChapterEditor.tsx",
      ["✨", "↑", "↓", "✕"],
    ],
  ] as const;

  for (const [nombre, ruta, glifos] of casos) {
    const fuente = leer(ruta);
    for (const glifo of glifos) {
      it(`${nombre} · ${glifo} declara mínimos de 24 y un nombre accesible`, () => {
        // El glifo se ancla como CONTENIDO del botón —solo en su línea—, no
        // como cualquier aparición en el fichero: los comentarios de estos
        // arreglos citan los glifos, y buscar la primera coincidencia cortaba
        // el trozo antes de llegar al `aria-label`.
        const comoContenido = new RegExp(`\\n\\s*${glifo}\\s*\\n`);
        const m = comoContenido.exec(fuente);
        expect(
          m,
          `no se encontró ${glifo} como contenido de un botón`,
        ).not.toBeNull();
        const iBoton = fuente.lastIndexOf("<button", m!.index);
        const boton = fuente.slice(iBoton, m!.index);

        expect(boton, "la zona útil debe llegar a 24 de ancho").toContain(
          "min-w-[24px]",
        );
        expect(boton, "la zona útil debe llegar a 24 de alto").toContain(
          "min-h-[24px]",
        );
        // El `title` NO nombra un botón que ya tiene contenido: el árbol de
        // accesibilidad anunciaba «↑ botón». El nombre tiene que ser explícito.
        expect(boton, "necesita aria-label, no sólo title").toMatch(
          /aria-label="[^"]{4,}"/,
        );
      });
    }
  }
});

describe("#747 · el armazón de Autor y el gate del diario", () => {
  it("los enlaces del armazón de Autor llegan a 24 de alto", () => {
    // 21,8px la marca y 18,8px «Mis libros» y «Cobros». `min-h` sobre un
    // `inline-flex` los sube sin tocar la tipografía: la cabecera no se mueve
    // porque su alto lo fija «Ir al consumer», con 30,8 medidos.
    const layout = leer("app/autor/layout.tsx");
    for (const ancla of ["📚 Editor de autor", "Mis libros", "Cobros"]) {
      const i = layout.indexOf(ancla);
      expect(i, `no se encontró «${ancla}»`).toBeGreaterThan(-1);
      const enlace = layout.slice(layout.lastIndexOf("<Link", i), i);
      expect(enlace, `«${ancla}» necesita alto mínimo`).toContain(
        "min-h-[24px]",
      );
      expect(
        enlace,
        `«${ancla}» necesita ser inline-flex para que el mínimo aplique`,
      ).toContain("inline-flex");
    }
  });

  it("«Olvidé mi contraseña» tiene relleno vertical, no letra más grande", () => {
    // Medía 18px. Es una acción propia, no un enlace dentro de una frase, así
    // que no le vale la excepción inline de 2.5.8.
    const gate = leer("components/dashboard/diario/UnlockGate.tsx");
    const i = gate.indexOf("Olvidé mi contraseña");
    const boton = gate.slice(gate.lastIndexOf("<button", i), i);
    expect(boton).toMatch(/\bpy-\d/);
    // Si alguien lo "arregla" agrandando la tipografía, el objetivo crece pero
    // el diseño cambia: el acuerdo era relleno.
    expect(boton).toContain("text-[12px]");
  });

  it("la casilla «Recordar» sigue respondiendo en todo su label", () => {
    // No se toca el `<input>` de 16×16: el objetivo efectivo es el `<label>`,
    // 626,9×68,9 medidos. Lo que hay que impedir es que alguien saque la
    // casilla de su label y la deje suelta.
    const gate = leer("components/dashboard/diario/UnlockGate.tsx");
    const i = gate.indexOf('type="checkbox"');
    const contexto = gate.slice(gate.lastIndexOf("<label", i), i);
    expect(contexto, "la casilla debe seguir dentro de su <label>").toContain(
      "<label",
    );
    expect(contexto, "el label es lo que da la zona útil").toMatch(/py-\d/);
  });
});
