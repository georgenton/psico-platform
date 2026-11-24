import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  dialableHotline,
  recursosDeAyuda,
  CRISIS_COUNTRIES,
} from "@psico/types";
import { describe, expect, it } from "vitest";

import { crisisGuidance, crisisNotice } from "./crisis";
import { buildSystemPrompt } from "./persona";

/**
 * El aviso de crisis de Eco, país por país y palabra por palabra.
 *
 * Los textos esperados están escritos a mano: es lo que alguien lee en el peor
 * momento, y cambiarlo tiene que verse aquí.
 */

const CON_911 = `Lo que me contaste me preocupa. Quiero que estés a salvo.

Si tú u otra persona están en peligro, llama ahora. En Ecuador, el número de emergencias es el 911. Si estás en otro país, llama al número de emergencias de ese país.

No soy profesional de la salud ni un servicio de emergencias. Hay más recursos en Ayuda inmediata.

No tienes que pasar por esto a solas. Si puedes, busca a alguien de confianza.`;

const SIN_NUMERO = `Lo que me contaste me preocupa. Quiero que estés a salvo.

Si tú u otra persona están en peligro, llama ahora al número de emergencias de tu país.

No soy profesional de la salud ni un servicio de emergencias. Hay más recursos en Ayuda inmediata.

No tienes que pasar por esto a solas. Si puedes, busca a alguien de confianza.`;

const CASOS: ReadonlyArray<
  [string | null | undefined, string, string, string | undefined]
> = [
  // País declarado con emergencia acreditada.
  ["EC", CON_911, "911 (Ecuador)", "EC"],
  ["ec", CON_911, "911 (Ecuador)", "EC"],
  [" ec ", CON_911, "911 (Ecuador)", "EC"],
  // Sin país: el de partida del producto, dicho en el texto. No se afirma que
  // la persona esté ahí, así que no viaja como su país.
  [null, CON_911, "911 (Ecuador)", undefined],
  [undefined, CON_911, "911 (Ecuador)", undefined],
  ["", CON_911, "911 (Ecuador)", undefined],
  ["  ", CON_911, "911 (Ecuador)", undefined],
  // Declarado sin emergencia acreditada: ningún número, ni el de Ecuador.
  ["CO", SIN_NUMERO, "número de emergencias de tu país", "CO"],
  ["MX", SIN_NUMERO, "número de emergencias de tu país", "MX"],
  // Declarado y desconocido.
  ["PE", SIN_NUMERO, "número de emergencias de tu país", undefined],
  ["ZZ", SIN_NUMERO, "número de emergencias de tu país", undefined],
  ["__proto__", SIN_NUMERO, "número de emergencias de tu país", undefined],
];

describe("el aviso de crisis, según el país del perfil", () => {
  it.each(CASOS)("país %j", (pais, texto, hotline, country) => {
    const aviso = crisisNotice(pais);
    expect(aviso.text).toBe(texto);
    expect(aviso.hotline).toBe(hotline);
    expect(aviso.country).toBe(country);
    expect(aviso.crisisPath).toBe("/terapia/crisis");
  });

  it.each(CASOS)(
    "país %j: el número del texto es el del botón, o no hay",
    (pais) => {
      const aviso = crisisNotice(pais);
      const enTexto = aviso.text.match(/\d+/g) ?? [];
      const marcable = dialableHotline(aviso.hotline);
      expect(enTexto).toEqual(marcable === null ? [] : [marcable]);
    },
  );

  it.each(CASOS)("país %j: no afirma lo que nadie acredita", (pais) => {
    const { text, hotline } = crisisNotice(pais);
    // Ni horarios ni adjetivos, ni Markdown que los modales pintan literal, ni
    // la búsqueda que Eco no puede hacer.
    expect(text).not.toMatch(/24\s*\/\s*7|gratuit|confidencial|an[oó]nim/i);
    expect(text).not.toContain("*");
    expect(text).not.toMatch(/la busco contigo|b[uú]sco/i);
    expect(text).not.toMatch(/ahora mismo/i);
    expect(hotline).not.toContain("*");
    expect(text).toContain("ni un servicio de emergencias");
    expect(text).toContain("Ayuda inmediata");
  });

  it("un cliente instalado pinta una frase entera cuando no hay número", () => {
    // Esos clientes escriben «📞 Llama al {hotline}» si no pueden marcarlo.
    expect(`Llama al ${crisisNotice("CO").hotline}`).toBe(
      "Llama al número de emergencias de tu país",
    );
  });

  it("nada en validación se cuela en ningún aviso", () => {
    const sinPublicar = CRISIS_COUNTRIES.flatMap((p) =>
      recursosDeAyuda(p).filter((r) => r.estado !== "publicado"),
    );
    expect(sinPublicar.length).toBeGreaterThan(0);
    for (const [pais] of CASOS) {
      const { text, hotline } = crisisNotice(pais);
      for (const { linea } of sinPublicar) {
        // El 911 de México está en validación y comparte cifras con el de
        // Ecuador, publicado: lo que no puede es salir para México.
        if (linea.phone === "911" && pais !== "MX") continue;
        const numero = dialableHotline(linea.phone);
        expect(numero).not.toBeNull();
        expect(`${text} ${hotline}`).not.toContain(linea.phone);
        expect(dialableHotline(hotline)).not.toBe(numero);
      }
    }
  });
});

describe("los modelos no dan números por su cuenta", () => {
  it("a Eco se le dice que no, y a dónde remitir", () => {
    const prompt = buildSystemPrompt({});
    expect(prompt).toContain("NO des números de teléfono");
    expect(prompt).toContain("aunque te los pidan o hayan salido antes");
    expect(prompt).toContain("Ayuda inmediata");
    // Y el propio prompt no trae ninguno.
    expect(prompt).not.toMatch(/\d{3,}/);
  });

  it("la guía que lee el chat anterior es la misma que la del aviso", () => {
    for (const [pais] of CASOS) {
      expect(crisisNotice(pais).text).toContain(crisisGuidance(pais));
    }
  });
});

describe("los avisos ya guardados se quedan como están", () => {
  function fuentes(dir: string, acc: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) fuentes(p, acc);
      else if (p.endsWith(".ts") && !/spec\.ts$/.test(p)) acc.push(p);
    }
    return acc;
  }

  const API = fuentes(join(__dirname, ".."));

  it("ninguna ruta reescribe un EcoMessage", () => {
    // Un aviso se relee tal cual se mandó. Nada lo regenera con el texto de
    // hoy: para eso haría falta una de estas escrituras, y no hay ninguna.
    expect(API.length).toBeGreaterThan(200);
    const reescriben = API.filter((f) =>
      /ecoMessage\s*\.\s*(update|updateMany|upsert)\b/.test(
        readFileSync(f, "utf8"),
      ),
    );
    expect(reescriben).toEqual([]);
  });

  it("y el aviso se compone en un solo sitio, al emitirlo", () => {
    const usan = API.filter((f) =>
      /crisisNotice\s*\(/.test(readFileSync(f, "utf8")),
    ).map((f) => f.slice(f.indexOf("src")));
    expect(usan.sort()).toEqual([
      "src/eco/crisis.ts",
      "src/eco/eco.service.ts",
    ]);
  });
});
