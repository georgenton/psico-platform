import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Trinquete de estructura semántica del panel — #732.
 *
 * LA POLÍTICA, EN TRES LÍNEAS:
 *   · el ARMAZÓN del panel es dueño de `<main>`;
 *   · la RUTA es dueña de su `<h1>`;
 *   · un COMPONENTE REUTILIZABLE no fija su nivel de heading, lo RECIBE.
 *
 * QUÉ PRUEBA ESTO Y QUÉ NO. Las rutas del panel son Server Components, y
 * montarlas en un test exigiría un runtime de Next entero; el número real de
 * landmarks se comprueba en el navegador, y esa es la autoridad. Lo que se
 * sostiene aquí es la CONDICIÓN que lo produce, que es además la que alguien
 * puede romper sin darse cuenta: que el armazón declare el landmark y que
 * ninguna ruta del panel declare un segundo.
 *
 * Los estados de Eco y los niveles de las tarjetas sí se renderizan de verdad,
 * en `eco/EcoShell.test.tsx` y en los tests de cada tarjeta.
 *
 * CONTROL NEGATIVO: devolver el armazón a `<section>`, o reintroducir un
 * `<main>` en el lector o en Círculos, hace fallar la prueba que lo cubre.
 */

const raiz = join(__dirname, "..");
const leer = (rel: string) => readFileSync(join(raiz, rel), "utf8");

/** El JSX de verdad, sin las menciones en comentarios. */
const sinComentarios = (fuente: string) =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const mainsJsx = (fuente: string) =>
  (sinComentarios(fuente).match(/<main[\s>]/g) ?? []).length;

function archivosTsx(dir: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) archivosTsx(ruta, salida);
    else if (entrada.endsWith(".tsx") && !entrada.includes(".test."))
      salida.push(ruta);
  }
  return salida;
}

describe("el armazón del panel es dueño de <main>", () => {
  const shell = leer("app/dashboard/_DashboardShell.tsx");

  it("declara exactamente un <main>, y es el contenedor del contenido", () => {
    expect(mainsJsx(shell)).toBe(1);
    // `.screen` es el contenedor del contenido de la ruta. La barra superior
    // vive en `.main` y queda fuera a propósito: no es el contenido.
    expect(sinComentarios(shell)).toMatch(/<main\s+className="screen"/);
  });

  it("deja la barra superior fuera del landmark", () => {
    const s = sinComentarios(shell);
    const iTopbar = s.indexOf("<Topbar");
    const iMain = s.indexOf("<main");
    expect(iTopbar).toBeGreaterThan(-1);
    expect(iMain).toBeGreaterThan(-1);
    expect(
      iTopbar,
      "la barra superior no puede quedar dentro de <main>",
    ).toBeLessThan(iMain);
  });

  it("escribe la política donde se lee, no sólo en un issue", () => {
    expect(shell).toMatch(/ESTRUCTURA SEMÁNTICA DEL PANEL/);
  });
});

describe("ninguna ruta del panel declara un segundo <main>", () => {
  // El fallo que esto impide: `/dashboard/circulos`, `/dashboard/admin/circulos`
  // y el lector traían su propio `<main>`. Anidados dentro del landmark del
  // armazón, la navegación por landmarks —que es como se salta el rail y la
  // barra— se queda sin un destino claro.
  const rutas = archivosTsx(join(raiz, "app", "dashboard"));

  for (const ruta of rutas) {
    const rel = ruta.slice(ruta.indexOf("/app/") + 1);
    if (rel.endsWith("_DashboardShell.tsx")) continue;
    it(`${rel} no abre <main>`, () => {
      expect(mainsJsx(readFileSync(ruta, "utf8"))).toBe(0);
    });
  }
});

describe("los componentes que sólo viven dentro del panel tampoco", () => {
  // Cada uno con su único consumidor comprobado: si mañana alguien los reutiliza
  // fuera del panel, la semántica tiene que venir del caller, no volver aquí.
  const soloDentro = [
    [
      "components/dashboard/lector/ReaderExperienceView.tsx",
      "LectorShell, sólo bajo el panel",
    ],
    ["components/dashboard/lector/LectorShell.tsx", "la ruta del lector"],
    ["components/dashboard/eco/EcoShell.tsx", "/dashboard/eco"],
  ] as const;

  for (const [rel, consumidor] of soloDentro) {
    it(`${rel.split("/").pop()} no abre <main> (lo monta ${consumidor})`, () => {
      expect(mainsJsx(leer(rel))).toBe(0);
    });
  }
});

describe("las superficies standalone conservan el suyo", () => {
  // La política es del panel. Aplicarla a una pantalla que no vive en el
  // armazón la dejaría SIN landmark, que es peor que tener dos.
  const standalone = [
    ["app/page.tsx", "la portada"],
    ["app/autor/layout.tsx", "el armazón de Autor"],
    ["app/compartir/[activityId]/page.tsx", "la sala compartida"],
    ["app/actividades/[templateKey]/page.tsx", "una actividad suelta"],
    [
      "components/circulos/EntradaInvitacion.tsx",
      "/i, la entrada por invitación",
    ],
    ["components/circulos/SalaDuo.tsx", "/compartir"],
    ["components/onboarding/OnboardingShell.tsx", "el onboarding"],
  ] as const;

  for (const [rel, quien] of standalone) {
    it(`${quien} sigue declarando <main>`, () => {
      expect(mainsJsx(leer(rel))).toBeGreaterThanOrEqual(1);
    });
  }
});

describe("la ruta es dueña de su <h1>", () => {
  // Sólo las pantallas que representan una página. Un componente parcial no
  // tiene por qué traer un h1, y exigírselo produciría h1 duplicados.
  const paginas = [
    ["app/dashboard/exploraciones/page.tsx", "Exploraciones"],
    ["app/dashboard/reflexiones/page.tsx", "Reflexiones"],
    ["app/dashboard/biblioteca/page.tsx", "Biblioteca"],
    ["app/dashboard/patrones/page.tsx", "Patrones"],
  ] as const;

  for (const [rel, nombre] of paginas) {
    it(`${nombre} trae su título de pantalla`, () => {
      const s = sinComentarios(leer(rel));
      expect(s, `${nombre} debe declarar su <h1>`).toMatch(/<h1[\s>]/);
      // El patrón nativo del panel, para que el título se vea como los demás.
      expect(s).toMatch(/className="screen-title"/);
    });
  }

  it("Eco no lo trae en la página porque su título vive en la pantalla", () => {
    // La conversación ES la pantalla: su título visible es el `<h1>`. Cuando no
    // hay conversación, `EcoShell` monta la cabecera nativa. Un `<h1>` en la
    // página además de eso serían dos.
    const pagina = sinComentarios(leer("app/dashboard/eco/page.tsx"));
    expect(pagina).not.toMatch(/<h1[\s>]/);
    const shell = sinComentarios(leer("components/dashboard/eco/EcoShell.tsx"));
    expect(shell, "EcoShell debe dar título a los estados sin chat").toMatch(
      /<h1 className="screen-title">Eco<\/h1>/,
    );
    expect(shell, "y pasarle el nivel al chat cuando hay conversación").toMatch(
      /tituloComo="h1"/,
    );
  });

  it("y nadie mete un h1 invisible para cumplir de mentira", () => {
    // Un título que sólo existe para el lector de pantalla describe una interfaz
    // que nadie ve. Si la pantalla necesita título, se ve.
    for (const rel of [
      "app/dashboard/eco/page.tsx",
      "components/dashboard/eco/EcoShell.tsx",
      "components/dashboard/eco/ChatArea.tsx",
    ]) {
      expect(sinComentarios(leer(rel))).not.toMatch(/<h1[^>]*sr-only/);
    }
  });
});

describe("un componente reutilizable recibe su nivel, no lo fija", () => {
  const reutilizables = [
    ["components/dashboard/exploraciones/ExCard.tsx", "h4"],
    ["components/dashboard/exploraciones/ExFeaturedCard.tsx", "h3"],
    ["components/dashboard/guide/GuideEntryCard.tsx", "h3"],
    ["components/dashboard/eco/ChatArea.tsx", "p"],
  ] as const;

  for (const [rel, defecto] of reutilizables) {
    const nombre = rel.split("/").pop()!;
    it(`${nombre} toma el nivel por prop y conserva ${defecto} por defecto`, () => {
      const s = leer(rel);
      expect(s, "debe aceptar el nivel del caller").toMatch(
        /tituloComo\??\s*[:=]/,
      );
      expect(s, `el defecto conserva el nivel anterior (${defecto})`).toMatch(
        new RegExp(`tituloComo = "${defecto}"`),
      );
      // Un heading literal dentro del componente volvería a decidir por el
      // llamador, que es justo lo que #732 pide no hacer.
      expect(sinComentarios(s)).not.toMatch(/<h[1-6][\s>]/);
    });
  }

  it("Exploraciones pide h2 para sus tarjetas primarias", () => {
    // h1 de pantalla → h2 de tarjeta. Antes eran h3 y h4, un salto que delataba
    // que el nivel lo decidía el componente.
    const s = sinComentarios(leer("app/dashboard/exploraciones/page.tsx"));
    for (const comp of ["ExFeaturedCard", "ExCard", "GuideEntryCardMount"]) {
      const i = s.indexOf(`<${comp}`);
      expect(i, `${comp} no se monta en la página`).toBeGreaterThan(-1);
      const uso = s.slice(i, s.indexOf(">", i) + 1);
      expect(uso, `${comp} debe recibir h2`).toMatch(/tituloComo="h2"/);
    }
  });
});

describe("el estilo no depende del nivel del heading", () => {
  it("las tarjetas de Exploraciones se estilan por clase, no por elemento", () => {
    // `.ex-feature h3` y `.ex-cbody h4` ataban el aspecto al nivel: cambiar de
    // nivel dejaba el título sin estilo. Con clase, las dos cosas son
    // independientes y el nivel puede moverse sin tocar el CSS.
    const css = readFileSync(join(raiz, "app", "dashboard-design.css"), "utf8");
    expect(css).toMatch(/\.ex-feature \.exf-title\s*\{/);
    expect(css).toMatch(/\.ex-cbody \.ex-card-title\s*\{/);
    expect(css).not.toMatch(/\.ex-feature h3\s*\{/);
    expect(css).not.toMatch(/\.ex-cbody h4\s*\{/);
  });
});
