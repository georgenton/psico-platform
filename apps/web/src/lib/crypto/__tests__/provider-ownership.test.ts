import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Quién puede montar un `DiaryKeyProvider`, y quién no.
 *
 * Un proveedor anidado gana sobre el de arriba. Eso no es un detalle de React:
 * decide si una persona que YA desbloqueó su diario se encuentra la reja otra
 * vez al abrir una entrada. `EntryDetailView` montaba uno «para que el camino de
 * las pruebas fuera simple» —su propio comentario— y con él se comía el
 * desbloqueo de la sesión entera cada vez que alguien pulsaba una reflexión.
 *
 * La prueba de comportamiento que lo demuestra está en
 * `diario/__tests__/crypto-session-scope.test.tsx`; esta lista sólo evita que
 * vuelva a colarse uno en otro sitio sin que nadie se dé cuenta.
 *
 * No se prohíbe el montaje en todo el repositorio: hay un caso donde aislar es
 * exactamente la intención, y está abajo con su razón.
 */

const RAIZ = join(__dirname, "..", "..", "..");

/**
 * Los únicos dos sitios donde montar el proveedor es correcto.
 *
 * Añadir una entrada aquí es una decisión de seguridad, no de comodidad: quien
 * la añada está diciendo que ESA pantalla debe tener su propia sesión
 * criptográfica, separada de la del resto del panel.
 */
const PERMITIDOS: Record<string, string> = {
  "app/dashboard/_DashboardShell.tsx":
    "El dueño. Vive por encima de todo /dashboard, así que el desbloqueo " +
    "sobrevive a la navegación entre Reflexiones, su detalle, Eco y Seguridad.",
  "components/dashboard/security/ShowSeedPhraseCard.tsx":
    "Aislado a propósito: las 12 palabras descifran el Diario entero para " +
    "siempre, así que tener la sesión abierta no basta para verlas. Aquí el " +
    "prompt de contraseña ES la función, no una molestia.",
};

/**
 * El fichero que DEFINE el proveedor no cuenta como sitio que lo monta. Aparece
 * porque su mensaje de error dice «must be used inside <DiaryKeyProvider>».
 */
const DEFINICION = "lib/crypto/diary-key-context.tsx";

function archivosFuente(dir: string, acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === "node_modules" || nombre === "__tests__") continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivosFuente(ruta, acc);
    else if (/\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre))
      acc.push(ruta);
  }
  return acc;
}

describe("de quién es la sesión criptográfica", () => {
  it("sólo el armazón del panel y la tarjeta de la frase montan el proveedor", () => {
    const montan = archivosFuente(RAIZ)
      .filter((ruta) =>
        /<DiaryKeyProvider[\s>]/.test(readFileSync(ruta, "utf8")),
      )
      .map((ruta) => ruta.slice(RAIZ.length + 1))
      .filter((ruta) => ruta !== DEFINICION)
      .sort();

    expect(montan).toEqual(Object.keys(PERMITIDOS).sort());
  });

  it("el detalle de una reflexión y Eco consumen, no montan", () => {
    // Los dos sitios donde el ciclo 11 vio —o creyó ver— reaparecer la reja.
    // El detalle lo hacía de verdad; Eco nunca montó nada y la medición estaba
    // mal hecha (una recarga completa disfrazada de navegación). Los dos quedan
    // fijados aquí para que ninguno de los dos empiece.
    for (const ruta of [
      "components/dashboard/diario/EntryDetailView.tsx",
      "components/dashboard/eco/EcoShell.tsx",
    ]) {
      const fuente = readFileSync(join(RAIZ, ruta), "utf8");
      expect(fuente).toMatch(/useDiaryKey\(/);
      expect(fuente).not.toMatch(/<DiaryKeyProvider[\s>]/);
    }
  });
});
