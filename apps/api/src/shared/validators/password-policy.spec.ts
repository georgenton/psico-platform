import { describe, expect, it } from "vitest";

import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  passwordByteLength,
  passwordPolicyMessage,
  passwordPolicyProblem,
} from "@psico/types";

describe("política de contraseñas nuevas", () => {
  describe("el mínimo", () => {
    it("rechaza justo por debajo y acepta justo en el límite", () => {
      expect(passwordPolicyProblem("a".repeat(PASSWORD_MIN_LENGTH - 1))).toBe(
        "TOO_SHORT",
      );
      expect(passwordPolicyProblem("a".repeat(PASSWORD_MIN_LENGTH))).toBeNull();
    });

    it("no impone composición: una frase corta en minúsculas vale", () => {
      expect(passwordPolicyProblem("la casa de la esquina")).toBeNull();
    });

    it("cuenta CARACTERES, no bytes, para el mínimo", () => {
      // 15 caracteres acentuados son 30 bytes. Si el mínimo contara bytes,
      // esto pasaría con la mitad de caracteres de los que la política pide.
      const quince = "ñ".repeat(PASSWORD_MIN_LENGTH);
      expect([...quince]).toHaveLength(PASSWORD_MIN_LENGTH);
      expect(passwordByteLength(quince)).toBe(PASSWORD_MIN_LENGTH * 2);
      expect(passwordPolicyProblem(quince)).toBeNull();
      expect(passwordPolicyProblem("ñ".repeat(PASSWORD_MIN_LENGTH - 1))).toBe(
        "TOO_SHORT",
      );
    });

    it("un emoji cuenta como UN carácter, no como sus unidades UTF-16", () => {
      // "🙂" ocupa dos unidades de código: `.length` diría 2 y el mínimo se
      // alcanzaría con la mitad de símbolos. El iterador de cadena no.
      const emojis = "🙂".repeat(PASSWORD_MIN_LENGTH - 1);
      expect(emojis.length).toBe((PASSWORD_MIN_LENGTH - 1) * 2);
      expect(passwordPolicyProblem(emojis)).toBe("TOO_SHORT");
    });
  });

  describe("el tope, que es donde bcrypt trunca en silencio", () => {
    it("acepta exactamente el tope en bytes", () => {
      const ascii = "a".repeat(PASSWORD_MAX_BYTES);
      expect(passwordByteLength(ascii)).toBe(PASSWORD_MAX_BYTES);
      expect(passwordPolicyProblem(ascii)).toBeNull();
    });

    it("rechaza un byte por encima", () => {
      expect(passwordPolicyProblem("a".repeat(PASSWORD_MAX_BYTES + 1))).toBe(
        "TOO_MANY_BYTES",
      );
    });

    it("rechaza una contraseña que CABE en caracteres pero no en bytes", () => {
      // El fallo que el tope en caracteres dejaba pasar: 40 «ñ» son 40
      // caracteres —por debajo de 72— pero 80 bytes. bcrypt se habría
      // quedado con los primeros 72 y nadie se habría enterado.
      const acentuada = "ñ".repeat(40);
      expect([...acentuada]).toHaveLength(40);
      expect(passwordByteLength(acentuada)).toBe(80);
      expect(passwordPolicyProblem(acentuada)).toBe("TOO_MANY_BYTES");
    });

    it("dos contraseñas que comparten los primeros 72 bytes NO se aceptan las dos", () => {
      // Es la consecuencia concreta del truncamiento: si ambas pasaran, la
      // segunda abriría la cuenta de la primera.
      const base = "a".repeat(PASSWORD_MAX_BYTES);
      expect(passwordPolicyProblem(base)).toBeNull();
      expect(passwordPolicyProblem(base + "distinto")).toBe("TOO_MANY_BYTES");
    });
  });

  describe("los mensajes", () => {
    it("dice el número cuando es corta y no lo dice cuando es larga", () => {
      expect(passwordPolicyMessage("TOO_SHORT")).toContain(
        String(PASSWORD_MIN_LENGTH),
      );
      // Pedir «menos de 72 bytes» a una persona no significa nada: el
      // mensaje largo habla de caracteres de más, no de la unidad interna.
      expect(passwordPolicyMessage("TOO_MANY_BYTES")).not.toContain("byte");
    });
  });
});

const ARCHIVOS_DTO = [
  "../../auth/dto/register.dto.ts",
  "../../auth/dto/reset-password.dto.ts",
  "../../users/dto/password-change.dto.ts",
  "../../users/dto/password-change-with-rekey.dto.ts",
] as const;

describe("los contratos que consumen la política", () => {
  it("los cuatro DTO que fijan una contraseña NUEVA declaran el validador", () => {
    // Por lectura del archivo y no por reflexión: instanciar estos DTO exige
    // el entorno de decoradores de Nest, y una prueba que pelea con su
    // runtime mide el arnés en vez del contrato. El COMPORTAMIENTO lo
    // ejercitan los E2E de auth (registro y restablecimiento) y el de
    // recifrado; lo que falta aquí es que ninguno se quede fuera.
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    for (const rel of ARCHIVOS_DTO) {
      const txt = fs.readFileSync(path.join(__dirname, rel), "utf8");
      expect(txt, `${rel} no usa la política compartida`).toContain(
        "@IsNewPassword()",
      );
    }
  });

  it("ningún DTO vuelve a traer un mínimo o un tope propios", () => {
    // Un `@MinLength` suelto en uno de estos archivos es cómo volvería la
    // divergencia, y pasaría desapercibido porque cada pantalla seguiría
    // siendo coherente consigo misma.
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    for (const rel of ARCHIVOS_DTO) {
      const txt = fs.readFileSync(path.join(__dirname, rel), "utf8");
      const bloque = txt.slice(
        Math.max(0, txt.indexOf("@IsNewPassword()") - 400),
        txt.indexOf("@IsNewPassword()") + 120,
      );
      expect(bloque, `${rel} mezcla la política con una longitud propia`).not.toMatch(
        /@(Min|Max)Length\(/,
      );
    }
  });
});
