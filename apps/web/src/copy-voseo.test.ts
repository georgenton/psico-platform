import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * El producto habla de tú, no de vos.
 *
 * POR QUÉ. FeelVerse se valida en **Ecuador** antes que en ningún otro sitio, y
 * ahí el voseo rioplatense no es un acento vecino: es texto que suena extranjero
 * en una pantalla que pide intimidad. La regla está acordada desde hace tiempo;
 * lo que faltaba era algo que la sostuviera cuando nadie está mirando.
 *
 * QUÉ LO DESTAPÓ. Verificando el push web sobre la versión servida apareció
 * «Recibí alertas del recordatorio diario…» — y las otras tres frases del MISMO
 * ternario ya usaban tuteo («Negaste el permiso. Actívalo», «recibirás
 * alertas»). Un componente contradiciéndose a sí mismo. Había dos más:
 * «Es para vos» en la nota de preparación de sesión (web y móvil) y «Elegí un
 * rating» en los dos modales de valoración.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * EL LÍMITE, DICHO ANTES DE QUE ALGUIEN CONFÍE DE MÁS EN ESTA PRUEBA.
 *
 * En castellano, el imperativo voseante de los verbos en -ir es IDÉNTICO a la
 * primera persona del pretérito. «Escribí una reflexión hace poco» es Eco
 * hablando en pasado y es correcto; «Escribí tu reflexión» sería una orden
 * voseante. La misma palabra. Ninguna expresión regular puede separarlas, y una
 * que lo intentara marcaría frases correctas — que es como se enseña a la gente
 * a desactivar un trinquete.
 *
 * Así que esta prueba cubre lo INEQUÍVOCO: el pronombre `vos`, las formas del
 * presente voseante (`tenés`, `podés`…) y los imperativos en -ar, cuyo acento en
 * -á no colisiona con ninguna primera persona. Para los ambiguos en -í/-é sólo
 * salta si la misma frase lleva además un marcador de segunda persona.
 *
 * Seamos exactos sobre lo que habría atrapado de los tres de hoy: «Es para vos»
 * sí. «Recibí alertas…» y «Elegí un rating» **no**. Esos dos siguen dependiendo
 * de que alguien lea la pantalla. Una red parcial declarada como parcial es
 * mejor que una red completa que no lo es.
 * ────────────────────────────────────────────────────────────────────────────
 */

const RAIZ = join(__dirname, "..", "..", "..");

/**
 * `\b` de JavaScript es ASCII: una vocal acentuada cuenta como NO-palabra, así
 * que `/\bcontá\b/` encuentra «contá» dentro de «contándote» —hay frontera
 * entre la «á» y la «n»— y marcaría gerundios perfectamente correctos. Los
 * límites se escriben a mano con la clase de letras del español.
 */
const L = "a-záéíóúüñA-ZÁÉÍÓÚÜÑ";
const palabra = (alternativas: string, banderas = "i") =>
  new RegExp(`(?<![${L}])(?:${alternativas})(?![${L}])`, banderas);

/** Pronombre y presente voseantes: no tienen otra lectura posible. */
const INEQUIVOCO = palabra(
  // Presente de -er: termina en -és, donde el tuteo dice -es.
  "tenés|podés|querés|sabés|debés|hacés|creés|ponés|comés|leés|volvés|perdés|" +
    "entendés|respondés|aprendés|corrés|metés|tenés|valés|" +
    // Presente de -ir: termina en -ís, donde el tuteo dice -es. Se enumeran en
    // vez de usar una regla «acaba en -ís» porque «país» también acaba así.
    "recibís|escribís|elegís|abrís|subís|compartís|pedís|seguís|vivís|venís|" +
    "decís|sentís|salís|repetís|medís|permitís|descubrís|añadís|insistís|" +
    // El pronombre va aparte, abajo: no puede ir aquí porque esta lista se
    // compara sin distinguir mayúsculas y «SOS» en una pantalla de crisis es
    // una palabra legítima.
    "insistís",
);

/**
 * El pronombre es el delator más limpio, pero exige cuidado con las
 * mayúsculas: se acepta al principio de una frase («Vos…») y se descarta en
 * versales, porque «SOS» es una palabra real y en una pantalla de crisis sería
 * exactamente la que no conviene tachar.
 */
const PRONOMBRE = palabra("vos|Vos|sos|Sos", "");

/**
 * Imperativos voseantes de verbos en -ar. Terminan en -á, y la primera persona
 * del pretérito termina en -é, así que no se confunden con nada.
 */
const IMPERATIVO_AR = palabra(
  "mirá|dejá|contá|usá|guardá|probá|entrá|buscá|tocá|cerrá|hablá|tomá|llevá|mandá|esperá|cambiá|agregá|andá|pasá|marcá|anotá|empezá|intentá|revisá|descansá|respirá|activá|apagá|cargá|borrá|enviá",
);

/** Formas ambiguas: sólo cuentan acompañadas de un marcador de segunda persona. */
const AMBIGUO = palabra(
  "escribí|elegí|recibí|seguí|abrí|subí|compartí|pedí|añadí|decidí|repetí|medí",
);
const SEGUNDA_PERSONA = palabra("tu|tus|te|ti|tuyo|tuya|vos");

/**
 * Se recorre el fichero ENTERO, línea a línea, no sólo las cadenas
 * entrecomilladas. La primera versión de esta prueba miraba sólo literales y
 * pasó en verde sobre «Recibís un ZIP con tu perfil» — porque eso es **texto
 * JSX**, hijo de un elemento, sin comillas alrededor. La mayor parte del copy
 * de este producto vive así, de modo que una prueba que sólo mira literales
 * mide la minoría.
 *
 * Mirar el fichero entero es seguro aquí por dos razones: los marcadores
 * llevan tilde y no aparecen en identificadores de JavaScript, y los
 * comentarios de este repositorio se escriben en inglés por convención.
 */

function ficheros(dir: string, salida: string[] = []): string[] {
  let entradas: string[];
  try {
    entradas = readdirSync(dir);
  } catch {
    return salida;
  }
  for (const e of entradas) {
    if (e === "node_modules" || e === ".next" || e === "dist") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      ficheros(p, salida);
    } else if (
      /\.tsx?$/.test(e) &&
      !/\.(test|spec|e2e-spec|pg-spec)\.tsx?$/.test(e)
    ) {
      salida.push(p);
    }
  }
  return salida;
}

const AMBITOS = [
  "apps/web/src",
  "apps/mobile/src",
  "apps/mobile/app",
  "packages/types/src",
];

describe("el copy de la interfaz tutea", () => {
  const hallazgos: string[] = [];

  for (const ambito of AMBITOS) {
    for (const f of ficheros(join(RAIZ, ambito))) {
      const lineas = readFileSync(f, "utf8").split("\n");
      for (const [i, linea] of lineas.entries()) {
        const texto = linea.trim();
        if (texto.length < 4) continue;
        const malo =
          INEQUIVOCO.test(texto) ||
          PRONOMBRE.test(texto) ||
          IMPERATIVO_AR.test(texto) ||
          (AMBIGUO.test(texto) && SEGUNDA_PERSONA.test(texto));
        if (malo) {
          hallazgos.push(
            `${f.slice(RAIZ.length + 1)}:${i + 1} → ${texto.slice(0, 90)}`,
          );
        }
      }
    }
  }

  it("no queda voseo inequívoco en ninguna cadena de interfaz", () => {
    expect(hallazgos).toEqual([]);
  });

  it("la prueba mira donde hay copy de verdad", () => {
    // Sin esto, un refactor que mueva los componentes dejaría la prueba verde
    // recorriendo cero ficheros — verde por vacío, que es el peor verde.
    const total = AMBITOS.reduce(
      (n, a) => n + ficheros(join(RAIZ, a)).length,
      0,
    );
    expect(total).toBeGreaterThan(300);
  });
});
