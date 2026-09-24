import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Trinquete de contraste — las decisiones de token que cerraron el lote P1.
 *
 * POR QUÉ ES UN CONTRATO SOBRE EL CÓDIGO Y NO UNA CAPTURA. Todos estos fallos
 * nacieron igual: alguien escribió un valor CRUDO de una rampa (`--color-*`)
 * donde hacía falta un nombre semántico. Eso se ve perfectamente bien en
 * Contemporary y se rompe en Noche, donde las rampas están invertidas — así
 * que una revisión visual en el tema de siempre no lo habría atrapado, y una
 * captura tampoco. Lo que hay que impedir es la vuelta al valor crudo.
 *
 * Cada caso apunta al ratio medido en las ocho combinaciones, para que quien
 * lea esto mañana sepa qué se rompía y cuánto.
 *
 * CONTROL NEGATIVO: devolver cualquiera de estos valores a la rampa cruda hace
 * fallar la prueba que lo cubre. Es la misma mutación que causó el defecto.
 */

const raiz = join(__dirname, "..");
const leer = (rel: string) => readFileSync(join(raiz, rel), "utf8");

/**
 * Las mismas rampas crudas son perfectamente válidas en OTROS sitios del mismo
 * fichero —`--color-warm-900` como color de un encabezado, `--color-lavender-400`
 * como borde de foco—, así que el contrato se acota al elemento del que habla.
 * Un «no aparece en todo el fichero» prohibiría usos legítimos y acabaría
 * borrándose por molesto, que es la peor clase de prueba.
 */
const trozo = (fuente: string, desde: string, hasta: string) => {
  const i = fuente.indexOf(desde);
  expect(i, `no se encontró «${desde}»`).toBeGreaterThan(-1);
  const j = fuente.indexOf(hasta, i);
  return fuente.slice(i, j > i ? j : undefined);
};

describe("relleno de marca frente a relleno de acción", () => {
  // Sólo el botón: `--color-warm-900` sigue siendo correcto como color de los
  // encabezados de esta misma pantalla.
  const boton = trozo(
    leer("components/dashboard/detalle/BookHero.tsx"),
    "{/* CTAs */}",
    "</button>",
  );

  it("el CTA bloqueado usa el relleno de marca, no un valor crudo de la rampa", () => {
    // Antes: `--color-warm-900`, que en Noche se invierte a casi blanco y
    // dejaba el texto blanco en 1.00:1 — el botón desaparecía.
    expect(boton).toContain('? "var(--bg-brand-strong)"');
    expect(boton).toContain("background: isLocked");
    expect(boton).not.toContain("var(--color-warm-900)");
  });

  it("declara el color del texto junto al relleno", () => {
    // Si el par viaja junto no puede desemparejarse al cambiar uno de los dos.
    // No se comprueba la ausencia de `text-white`: el estilo en línea gana a
    // la utilidad de todas formas, y la cadena aparece también en los
    // comentarios, así que prohibirla sólo produciría falsos rojos.
    expect(boton).toContain('color: "var(--fg-on-brand)"');
  });
});

describe("acciones del lector", () => {
  it("«marcar capítulo como leído» usa el relleno de acción del sistema", () => {
    // Antes: `--color-sage-500` con blanco — 3.18–3.67 en los ambientes
    // claros y 1.71 en Noche. `--bg-action` da 4.88–5.24 en las ocho.
    const fuente = leer("components/dashboard/lector/ReaderExperienceView.tsx");
    expect(fuente).toContain('background: "var(--bg-action)"');
    expect(fuente).toContain('color: "var(--fg-on-brand)"');
    expect(fuente).not.toContain("var(--color-sage-500)");
  });

  it("el bloque de pausa toma el color de texto del sistema", () => {
    // El panel (`--color-sage-50`) sí acompaña al ambiente; el texto
    // (`--color-sage-800`) no lo hacía, y en Noche quedaba verde oscuro sobre
    // verde oscuro: 1.61:1. El 🌿 y el panel siguen marcando la pausa.
    const fuente = leer("components/dashboard/lector/BlockRenderer.tsx");
    expect(fuente).toContain('color: "var(--fg-body)"');
    expect(fuente).not.toContain("var(--color-sage-800)");
  });
});

describe("el lector sin tema propio sigue al ambiente", () => {
  const fuente = leer("components/dashboard/lector/LectorShell.tsx");

  it("«system» declara la familia entera en términos semánticos", () => {
    // El fallo no era un color: era que el texto caía en un TOKEN (que se
    // invierte) y el fondo en un LITERAL claro (que no). Blanco sobre casi
    // blanco: 1.23:1 el título, 2.01:1 el subtítulo.
    for (const par of [
      '["--reader-bg" as string]: "var(--bg-page)"',
      '["--reader-bg-tint" as string]: "var(--surface-glass-bg)"',
      '["--reader-text" as string]: "var(--fg-strong)"',
      '["--reader-muted" as string]: "var(--fg-muted)"',
    ]) {
      expect(fuente).toContain(par);
    }
    expect(fuente).toContain("default:\n      return READER_FOLLOWS_AMBIENT;");
  });

  it("«claro» fija también el texto, no sólo el fondo", () => {
    // Un tema que fija un fondo blanco y deja el color al ambiente produce
    // exactamente el mismo fallo por otra puerta.
    const claro = fuente.slice(
      fuente.indexOf('case "light":'),
      fuente.indexOf('case "system":'),
    );
    expect(claro).toContain('["--reader-text" as string]');
    expect(claro).toContain('["--reader-muted" as string]');
  });
});

describe("superficie de acceso", () => {
  const fuente = leer("app/(auth)/login/_LoginForm.tsx");
  // Sólo el botón de envío: los campos de al lado usan legítimamente
  // `--color-lavender-400` como borde de foco y `disabled:opacity-60`.
  const boton = trozo(fuente, '<button\n          type="submit"', "</button>");

  it("el botón usa el relleno de marca en todo momento, también al enviar", () => {
    // Antes: `--color-lavender-500` (3.63:1) y, mientras enviaba,
    // `--color-lavender-400` — aún más claro. La etiqueta sigue informando
    // («Iniciando sesión…»), así que tiene que seguir leyéndose.
    expect(boton).toContain('background: "var(--bg-brand-strong)"');
    expect(boton).toContain('color: "var(--fg-on-brand)"');
    expect(boton).not.toContain("var(--color-lavender-400)");
    expect(boton).not.toContain("var(--color-lavender-500)");
  });

  it("no atenúa el botón mientras envía", () => {
    expect(boton).not.toContain("disabled:opacity-60");
    expect(boton).toContain("aria-busy={isPending}");
  });

  it("el acento del encabezado usa el token de enlace fuerte", () => {
    // `--color-lavender-500` como TEXTO sobre la página: 3.48:1.
    const eyebrow = trozo(fuente, "Tu espacio te espera", "</p>");
    expect(fuente.slice(0, fuente.indexOf("Tu espacio te espera"))).toContain(
      'color: "var(--fg-link-strong)"',
    );
    expect(eyebrow).toBeTruthy();
  });
});

describe("logros del perfil", () => {
  const fuente = leer("components/dashboard/perfil/AchievementsGrid.tsx");

  it("no atenúa la tarjeta entera para decir «pendiente»", () => {
    // El token de texto llega a 5.29:1 por sí solo; la opacidad del 0.7 sobre
    // toda la tarjeta lo hundía a 2.90. El estado ya lo dicen el 🔒, el borde
    // neutro y la barra de progreso.
    expect(fuente).not.toMatch(/opacity:\s*unlocked/);
  });

  it("usa el token de texto secundario en lugar del valor crudo", () => {
    expect(fuente).not.toContain("var(--color-warm-500)");
    expect(fuente).toContain('color: "var(--fg-muted)"');
  });
});

describe("objetivos táctiles de 24×24 (WCAG 2.2 · 2.5.8)", () => {
  it("el corazón de la tarjeta de libro crece como objetivo, no como icono", () => {
    const fuente = leer("components/dashboard/biblioteca/BookCard.tsx");
    // Medía 15×16. El `text-[16px]` se conserva: crece el área, no la letra.
    expect(fuente).toMatch(
      /h-6 w-6 shrink-0 items-center justify-center text-\[16px\]/,
    );
  });

  it("la flecha de volver del lector llega al mínimo", () => {
    const fuente = leer("components/dashboard/lector/LectorShell.tsx");
    // Medía 14×27: fallaba por el ancho, y es la única salida del lector.
    expect(fuente).toMatch(
      /h-6 min-w-6 items-center justify-center text-\[18px\]/,
    );
  });

  it("los enlaces «ver todas» y «ver completo» llegan al mínimo", () => {
    const css = leer("app/dashboard-design.css");
    for (const regla of [".mini-map .mm-link", ".r-all"]) {
      const linea = css
        .split("\n")
        .find((l) => l.trimStart().startsWith(regla + " {"));
      expect(linea, `falta la regla ${regla}`).toBeTruthy();
      expect(linea).toContain("min-height: 24px");
    }
  });
});
