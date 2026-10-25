import fs from "node:fs";
import path from "node:path";

import { BRAND_NAME } from "@psico/types";
import { describe, expect, it } from "vitest";

import { passwordResetEmail } from "./password-reset.template";
import { verifyEmail } from "./verify-email.template";

/**
 * El nombre del producto en todo lo que una persona puede llegar a leer.
 *
 * ── Qué se rompió, y cómo se encontró ──────────────────────────────────────
 *
 * El 2026-10-24, probando el camino normal de Eco con una cuenta sintética,
 * Eco se presentó así: «Soy Eco, tu companion conversacional en Psico
 * Platform». Ése es el nombre anterior del producto.
 *
 * ── Por qué este archivo vigila MÁS que las plantillas ─────────────────────
 *
 * Porque mi inventario a mano falló dos veces seguidas, y conviene que quede
 * escrito en vez de repetirse.
 *
 * La primera: corregí el armazón compartido y dos plantillas, y escribí un
 * inventario diciendo que el resto estaba justificado. Había mirado seis de
 * diecisiete archivos.
 *
 * La segunda: el correo de exportación salió **desplegado** con el nombre
 * viejo en el ASUNTO, porque los asuntos no viven en el armazón —cada
 * plantilla pone el suyo— y ése se construye en el propio processor.
 *
 * Y el mecanismo que Eco destapó aplica a cualquier PROMPT: el modelo repite
 * el nombre que se le da. El narrador del Mapa (NAR-L1) está encendido por
 * defecto y su texto se le muestra a la persona, así que un prompt con el
 * nombre viejo es el mismo defecto esperando turno.
 *
 * Así que el trinquete recorre el árbol y pide una lista explícita de
 * excepciones, cada una con su motivo. Es lo contrario de un inventario: aquí
 * olvidarse de un archivo **falla**, en vez de pasar desapercibido.
 */

const NOMBRE_ANTERIOR = "Psico Platform";
const RAIZ_API = path.resolve(__dirname, "../..");

/**
 * Lo que puede seguir nombrando al producto por su nombre anterior, y por qué.
 * Cada entrada es una decisión, no un descuido.
 */
const EXCEPCIONES: Array<{ ruta: string; motivo: string }> = [
  {
    ruta: "main.ts",
    motivo: "título de Swagger — superficie interna, no la ve nadie de fuera",
  },
  {
    ruta: "lector/lector.service.ts",
    motivo:
      "autor de respaldo del audio. NO es marca: es una afirmación sin fuente " +
      "—atribuye el libro a la plataforma— y desde la reparación de autoría sí " +
      "dispararía. Misma clase que la reparación retira; su propia ventana",
  },
  {
    ruta: "notifications/templates/author-publication-approved.template.ts",
    motivo:
      "recorrido B2B de publicación, no recorrido; la publicación editorial " +
      "está fuera de alcance",
  },
  {
    ruta: "eco/README.md",
    motivo: "documentación interna del módulo",
  },
  {
    ruta: "onboarding/onboarding.service.spec.ts",
    motivo:
      "prueba que YA vigila esto: fija que la bienvenida firme «— FeelVerse» " +
      "y no el nombre anterior",
  },
  {
    ruta: "notifications/templates/brand.spec.ts",
    motivo: "este archivo: necesita nombrar lo que prohíbe",
  },
];

function recorrer(dir: string, encontrados: string[] = []): string[] {
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completa = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      recorrer(completa, encontrados);
    } else if (/\.(ts|tsx|md)$/.test(entrada.name)) {
      if (fs.readFileSync(completa, "utf8").includes(NOMBRE_ANTERIOR)) {
        encontrados.push(path.relative(RAIZ_API, completa));
      }
    }
  }
  return encontrados;
}

describe("marca en los correos", () => {
  const casos = [
    {
      nombre: "restablecer contraseña",
      render: () =>
        passwordResetEmail({
          firstName: "Ana",
          resetUrl: "https://example.test/reset?token=x",
          expiresHours: 2,
          requestIp: null,
        }),
    },
    {
      nombre: "verificar correo",
      render: () =>
        verifyEmail({
          firstName: "Ana",
          verifyUrl: "https://example.test/verify?token=x",
          expiresHours: 24,
        }),
    },
  ];

  for (const caso of casos) {
    it(`«${caso.nombre}» dice ${BRAND_NAME} y no el nombre anterior`, () => {
      const correo = caso.render();
      // El asunto cuenta: es lo primero que se lee, y el armazón no lo pone.
      const todo = `${correo.subject}\n${correo.html}\n${correo.text}`;

      expect(todo).toContain(BRAND_NAME);
      expect(todo).not.toContain(NOMBRE_ANTERIOR);
      // Una interpolación mal escrita deja las llaves literales en la salida.
      // Esto pagó en el acto: los dos asuntos eran cadenas con comillas, no
      // literales de plantilla, así que la sustitución los dejó tal cual. Un
      // grep del fuente habría pasado; el render no.
      expect(todo).not.toContain("${");
    });
  }

  it("el armazón compartido no deja el nombre anterior en cabecera ni pie", () => {
    const html = casos[0].render().html;
    expect(html).toContain(`<title>${BRAND_NAME}</title>`);
    expect(html).toContain(`>${BRAND_NAME}</h1>`);
    expect(html).toContain(`© ${BRAND_NAME}`);
  });
});

describe("el nombre anterior no vuelve por otra puerta", () => {
  it("sólo aparece donde está justificado, y cada sitio tiene su motivo", () => {
    const encontrados = recorrer(RAIZ_API).sort();
    const permitidas = new Set(EXCEPCIONES.map((e) => e.ruta));
    const sinJustificar = encontrados.filter((r) => !permitidas.has(r));

    expect(
      sinJustificar,
      "Estos archivos nombran el producto por su nombre anterior sin motivo " +
        "declarado. Si es una superficie que una persona lee —un asunto de " +
        "correo, un prompt que el modelo repite, una pantalla— usa BRAND_NAME. " +
        "Si no lo es, añádelo a EXCEPCIONES con su razón.",
    ).toEqual([]);
  });

  it("no quedan excepciones que ya no existan", () => {
    // Una excepción obsoleta es permiso para un defecto futuro: el día que
    // alguien reintroduzca el nombre en ese archivo, nadie se enteraría.
    const encontrados = new Set(recorrer(RAIZ_API));
    const obsoletas = EXCEPCIONES.filter((e) => !encontrados.has(e.ruta)).map(
      (e) => e.ruta,
    );
    expect(obsoletas).toEqual([]);
  });

  it("ningún prompt del modelo nombra el producto a mano", () => {
    // El mecanismo que Eco demostró: lo que se le da al modelo, el modelo lo
    // repite. Vale para Eco, para el narrador del Mapa y para el resumen
    // semanal, cuyos textos se le muestran a la persona.
    const prompts = [
      "eco/persona.ts",
      "ai/ai.service.ts",
      "emotional-map/providers/anthropic.provider.ts",
    ];
    for (const rel of prompts) {
      const src = fs.readFileSync(path.join(RAIZ_API, rel), "utf8");
      expect(src, `${rel} no usa BRAND_NAME`).toContain("BRAND_NAME");
      expect(src, `${rel} nombra el producto a mano`).not.toContain(
        `"${BRAND_NAME}"`,
      );
    }
  });
});
