import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Un control inactivo tiene que PARECER inactivo.
 *
 * ── Lo que se midió ────────────────────────────────────────────────────────
 *
 * En la portada de «El cuerpo, antes que la mente» (staging, 07-11), el botón
 * «Empezar experiencia» llegaba con `disabled: true` — correcto, porque esa
 * experiencia está retirada para inicios nuevos y la propia página lo dice una
 * línea más arriba—. Pero se pintaba así:
 *
 *     background  rgb(187, 224, 178)   ← verde pleno
 *     opacity     1
 *     cursor      pointer
 *
 * Es decir, **idéntico a uno activo**, con el puntero invitando a pulsarlo. No
 * era un fallo de función —el clic no hacía nada y las ayudas técnicas sí
 * anuncian `disabled`—: era una promesa visual que el control no podía
 * cumplir, y encima en una página cuya copia decía lo contrario.
 *
 * La causa no estaba en esa pantalla: **no había NINGUNA regla `:disabled`
 * para `.btn` en toda la hoja**. Afecta a los cinco sitios que deshabilitan un
 * `.btn`, el de exportar tus datos entre ellos.
 *
 * ── Y el `:hover`, que iba con ello ────────────────────────────────────────
 *
 * En CSS, `:hover` **sí** casa con un elemento deshabilitado, así que el botón
 * hasta cambiaba de color al pasar por encima — reforzando la invitación. Por
 * eso los `:hover` de las variantes llevan `:not(:disabled)`.
 *
 * Se prefirió eso a `pointer-events: none`, que habría resuelto el hover de
 * paso pero también habría impedido mostrar `cursor: not-allowed`, que es
 * justo la señal que aquí se quiere dar.
 */

const CSS = readFileSync(join(__dirname, "..", "dashboard-design.css"), "utf8");

/** El cuerpo de la primera regla cuyo selector contenga `fragmento`. */
function cuerpoDeRegla(fragmento: string): string {
  const i = CSS.indexOf(fragmento);
  if (i < 0) throw new Error(`no se encontró ninguna regla con «${fragmento}»`);
  const abre = CSS.indexOf("{", i);
  const cierra = CSS.indexOf("}", abre);
  return CSS.slice(abre + 1, cierra);
}

describe("un .btn deshabilitado se ve deshabilitado", () => {
  it("existe una regla :disabled para .btn", () => {
    expect(CSS).toMatch(/\.btn:disabled/);
  });

  it("y baja la opacidad — sin esto se pinta igual que uno activo", () => {
    const cuerpo = cuerpoDeRegla(".btn:disabled");
    const m = cuerpo.match(/opacity:\s*([\d.]+)/);
    expect(m, "la regla :disabled no declara opacity").not.toBeNull();
    expect(Number(m![1])).toBeLessThan(1);
  });

  it("y cambia el cursor — `pointer` dice «púlsame» sobre algo que no responde", () => {
    expect(cuerpoDeRegla(".btn:disabled")).toMatch(/cursor:\s*not-allowed/);
  });

  it("también cubre aria-disabled, para un control que no sea <button>", () => {
    expect(CSS).toMatch(/\.btn\[aria-disabled="true"\]/);
  });

  it.each(["primary", "soft", "ghost"])(
    "el :hover de .btn.%s no se aplica a uno deshabilitado",
    (variante) => {
      // `:hover` casa con elementos deshabilitados, así que sin la guarda el
      // botón cambiaba de color al pasar por encima.
      const re = new RegExp(`\\.btn\\.${variante}:hover(:not\\(:disabled\\))?`);
      const m = CSS.match(re);
      expect(m, `no hay regla :hover para .btn.${variante}`).not.toBeNull();
      expect(
        m![0],
        `.btn.${variante}:hover se aplicaría también a un botón deshabilitado`,
      ).toContain(":not(:disabled)");
    },
  );

  it("no queda ningún :hover de .btn sin guardar", () => {
    // El trinquete que importa: una variante NUEVA con su `:hover` sin
    // `:not(:disabled)` cae aquí, aunque nadie se acuerde de añadirla arriba.
    const sinGuardar = [
      ...CSS.matchAll(/\.btn[^{,\n]*:hover(?!:not\(:disabled\))[^{,\n]*\{/g),
    ]
      .map((m) => m[0].replace(/\s*\{$/, "").trim())
      // `body.amb-* .btn...` y demás ajustes por ambiente no son estados de
      // puntero sobre el botón; sólo se exige a los `:hover` propios.
      .filter((sel) => !sel.includes("body."));
    expect(
      sinGuardar,
      `estos :hover alcanzarían a un botón deshabilitado:\n  ${sinGuardar.join("\n  ")}`,
    ).toEqual([]);
  });
});
