import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

/**
 * Contrato: un formulario que lleva un secreto NUNCA puede enviarlo por GET.
 *
 * EL FALLO QUE ESTO IMPIDE. Un `<form>` sin `method` envía por GET, y lo único
 * que lo impedía era `preventDefault()` dentro de `onSubmit` — o sea,
 * JavaScript ya enganchado. Varias de estas pantallas viajan en el HTML del
 * servidor, así que entre que se pintan y que hidratan hay una ventana real: en
 * `/register` pulsar «Crear cuenta gratis» durante esa ventana mandaba nombre,
 * correo y CONTRASEÑA a la barra de direcciones, y de ahí al historial y a los
 * registros de acceso. Reproducido sobre el despliegue (#727).
 *
 * POR QUÉ SON DOS PRUEBAS Y NO UNA.
 *
 * La primera es de COMPORTAMIENTO: monta el formulario y lee `form.method`, que
 * es la propiedad que el navegador consulta para decidir cómo envía — no el
 * texto del atributo. Lo que no puede hacer es observar la navegación en sí:
 * jsdom no implementa el envío de formularios. Ese hueco lo cubre la regresión
 * en navegador real, que sí envía sin JavaScript y comprueba la URL resultante.
 *
 * La segunda es ESTRUCTURAL y es la que de verdad vigila el futuro: recorre
 * todos los formularios del front, se queda con los que contienen un campo de
 * credencial y exige que declaren POST. Así el día que alguien añada una
 * pantalla con contraseña, esta prueba la encuentra sin que nadie se acuerde de
 * venir aquí. Un `grep("method=post")` sobre ficheros conocidos no haría eso.
 */

// ── Parte 1 · comportamiento ────────────────────────────────────────────────

describe("el método de envío que el navegador va a usar", () => {
  it("un formulario sin `method` envía por GET — que es el fallo", () => {
    // El control de la prueba: así se comporta lo que había antes.
    const { container } = render(
      <form>
        <input name="password" type="password" readOnly value="" />
      </form>,
    );
    const f = container.querySelector("form")!;
    expect(f.method).toBe("get");
  });

  it('declarar `method="post"` cambia lo que el navegador hará', () => {
    const { container } = render(
      <form method="post">
        <input name="password" type="password" readOnly value="" />
      </form>,
    );
    const f = container.querySelector("form")!;
    expect(f.method).toBe("post");
    // Y no hay un `action` que lo mande a otra parte: el envío nativo va a la
    // misma ruta, que no atiende POST. Un callejón, pero uno que no filtra.
    expect(f.getAttribute("action")).toBeNull();
  });
});

// ── Parte 2 · estructural, sobre todo el front ──────────────────────────────

const RAIZ = join(__dirname, "..", "..");

/** Campos que convierten a un formulario en portador de un secreto. */
const CAMPO_SECRETO =
  /type="password"|autoComplete="(current|new)-password"|name="(password|confirm|newPassword|currentPassword|confirmPassword|codigo)"/;

function ficherosTsx(dir: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada === ".next") continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) ficherosTsx(ruta, salida);
    else if (entrada.endsWith(".tsx") && !entrada.includes(".test."))
      salida.push(ruta);
  }
  return salida;
}

/**
 * Quita comentarios antes de buscar.
 *
 * Sin esto el escáner se traga la prosa: el comentario que explica este
 * arreglo menciona `<form>` para contar qué pasaba, y el escáner lo tomó por
 * un formulario de verdad sin `method`. Lo descubrió la propia prueba al dar
 * un falso positivo sobre el fichero que sí estaba arreglado.
 */
function sinComentarios(fuente: string): string {
  return (
    fuente
      // Primero TODO bloque `/* … */`, venga suelto o dentro de `{…}`. Buscar
      // el par `{/* … */}` completo de una sola pasada era frágil: si el `*/`
      // siguiente no venía seguido de `}`, el motor retrocedía hasta el
      // siguiente cierre y se comía media pantalla — incluido el formulario
      // que venía a vigilar. Pasó aquí, y por eso el orden es este.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // Las llaves vacías que quedan de un comentario JSX ya no estorban.
      .replace(/\{\s*\}/g, "")
      // Y las líneas que sólo son `// …`.
      .replace(/^[ \t]*\/\/.*$/gm, "")
  );
}

/**
 * Trocea un fichero en sus formularios. Cuenta las aperturas y los cierres para
 * no confundirse con formularios anidados o con dos en el mismo fichero: mirar
 * el fichero entero daría por bueno un formulario vulnerable sólo porque otro
 * de al lado declara POST.
 */
function formulariosDe(fuente: string): { apertura: string; cuerpo: string }[] {
  const salida: { apertura: string; cuerpo: string }[] = [];
  let desde = 0;
  for (;;) {
    const i = fuente.indexOf("<form", desde);
    if (i === -1) break;

    // El `>` que cierra la etiqueta, no el primero que aparezca. Dentro de la
    // apertura hay expresiones JSX con funciones flecha —`onSubmit={(e) => …}`—
    // y su `>` no cierra nada. Cortar ahí dejaría `method` fuera del trozo y la
    // prueba acusaría a un formulario que sí está defendido.
    let profundidad = 0;
    let finApertura = -1;
    for (let k = i + 5; k < fuente.length; k++) {
      const ch = fuente[k];
      if (ch === "{") profundidad++;
      else if (ch === "}") profundidad--;
      else if (ch === ">" && profundidad === 0) {
        finApertura = k;
        break;
      }
    }
    if (finApertura === -1) break;

    const cierre = fuente.indexOf("</form>", finApertura);
    salida.push({
      apertura: fuente.slice(i, finApertura + 1),
      cuerpo: fuente.slice(finApertura + 1, cierre === -1 ? undefined : cierre),
    });
    desde = finApertura + 1;
  }
  return salida;
}

describe("todo formulario que lleva un secreto declara POST", () => {
  const conSecreto: { fichero: string; declaraPost: boolean }[] = [];

  for (const ruta of ficherosTsx(RAIZ)) {
    const fuente = sinComentarios(readFileSync(ruta, "utf8"));
    for (const { apertura, cuerpo } of formulariosDe(fuente)) {
      if (!CAMPO_SECRETO.test(cuerpo)) continue;
      conSecreto.push({
        fichero: ruta.slice(RAIZ.length + 1),
        declaraPost: /method="post"/.test(apertura),
      });
    }
  }

  it("encuentra los formularios con secreto que ya conocemos", () => {
    // Si este número baja, alguien borró una pantalla o el troceador dejó de
    // encontrarlas — en ambos casos la vigilancia se habría apagado en
    // silencio, que es peor que fallar.
    expect(conSecreto.length).toBeGreaterThanOrEqual(5);
  });

  it("ninguno se queda sin la defensa declarativa", () => {
    const sinDefensa = conSecreto
      .filter((f) => !f.declaraPost)
      .map((f) => f.fichero);
    expect(sinDefensa).toEqual([]);
  });
});
