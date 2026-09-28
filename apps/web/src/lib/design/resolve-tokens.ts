/**
 * Resolver los tokens de color como los resolvería el navegador, sin navegador.
 *
 * Para qué: el contrato de contraste entre un primer plano y su fondo se puede
 * comprobar con los valores, y eso vale para una prueba determinista que corre
 * en cada PR. Lo que un navegador ve y esto no —opacidad de un ancestro, un
 * gradiente bajo el texto, una regla que pisa al token— se mide aparte, en el
 * navegador. Las dos cosas hacen falta; ninguna sustituye a la otra.
 *
 * El modelo del cascade es deliberadamente pequeño porque el archivo lo es:
 * los tokens se declaran en `:root` y en `[data-theme=…]` —los dos sobre
 * `<html>`— y en `body.amb-…` sobre `<body>`. `body` hereda de `html`, así que
 * el valor efectivo en el elemento que pinta es: lo de body si lo hay, si no lo
 * de html. Dentro de cada elemento gana la última declaración del archivo.
 */

export type Theme = "contemporary" | "renaissance";
export type Ambient = "calma" | "enfoque" | "energia" | "noche";

export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface Bloque {
  selector: string;
  declaraciones: Map<string, string>;
}

/** Trocea el CSS en bloques de primer nivel con sus declaraciones de tokens. */
function leerBloques(css: string): Bloque[] {
  const bloques: Bloque[] = [];
  // Fuera comentarios: pueden contener llaves y romper el recuento.
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  while (i < limpio.length) {
    const abre = limpio.indexOf("{", i);
    if (abre === -1) break;
    const selector = limpio.slice(i, abre).trim().split("\n").pop()!.trim();
    // Buscar el cierre de ESTE bloque contando anidamiento (media queries).
    let nivel = 1;
    let j = abre + 1;
    while (j < limpio.length && nivel > 0) {
      if (limpio[j] === "{") nivel++;
      else if (limpio[j] === "}") nivel--;
      j++;
    }
    const cuerpo = limpio.slice(abre + 1, j - 1);
    if (/^@/.test(selector)) {
      // `@theme` de Tailwind v4 lleva declaraciones planas y las emite sobre
      // `:root`. Ignorarlo dejaba sin resolver TODA la rampa base, y entonces
      // sólo Renacimiento —que redefine la suya— daba números.
      if (/^@theme\b/.test(selector) && !cuerpo.includes("{")) {
        const decl = new Map<string, string>();
        for (const m of cuerpo.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
          decl.set(m[1], m[2].trim());
        }
        if (decl.size) bloques.push({ selector: ":root", declaraciones: decl });
      } else {
        // Media queries y demás: sus bloques internos traen su propio selector.
        bloques.push(...leerBloques(cuerpo));
      }
    } else {
      const decl = new Map<string, string>();
      for (const m of cuerpo.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
        decl.set(m[1], m[2].trim());
      }
      if (decl.size) bloques.push({ selector, declaraciones: decl });
    }
    i = j;
  }
  return bloques;
}

/** ¿Este selector aplica a `<html>` con este tema? */
function aplicaAHtml(selector: string, theme: Theme): boolean {
  const partes = selector.split(",").map((s) => s.trim());
  return partes.some(
    (s) => s === ":root" || s === "html" || s === `[data-theme="${theme}"]`,
  );
}

/** ¿Este selector aplica a `<body>` con este tema y ambiente? */
function aplicaABody(
  selector: string,
  theme: Theme,
  ambient: Ambient | null,
): boolean {
  const partes = selector.split(",").map((s) => s.trim());
  return partes.some((s) => {
    if (s === "body") return true;
    if (ambient === null) return false;
    if (s === `body.amb-${ambient}`) return true;
    if (s === `[data-theme="${theme}"] body.amb-${ambient}`) return true;
    if (s === `body.amb-${ambient}[data-fv-theme="${theme}"]`) return true;
    return false;
  });
}

/**
 * El mapa de tokens que ve un elemento dentro de `<body>`, YA sustituido.
 *
 * La sutileza que decide todo: `--a: var(--b)` se sustituye DONDE SE DECLARA,
 * no donde se usa. Un alias escrito en `:root` —como `--bg-action:
 * var(--color-sage-600)`— congela ahí el valor de la rampa y NO acompaña al
 * ambiente, por mucho que `body.amb-noche` redefina esa rampa después. En
 * cambio un componente que escribe `var(--color-sage-600)` directamente sí la
 * sigue, porque la sustitución ocurre en el elemento.
 *
 * Esa diferencia es literalmente el #728: el mismo color, dos comportamientos,
 * y el nombre no lo dice. Modelarlo mal daba números que el navegador
 * desmentía, así que aquí cada declaración se resuelve dentro de SU ámbito.
 */
export function tokensDe(
  css: string,
  theme: Theme,
  /** `null` = fuera del panel, donde no hay clase de ambiente. */
  ambient: Ambient | null,
): Map<string, string> {
  const bloques = leerBloques(css);

  const crudoHtml = new Map<string, string>();
  for (const b of bloques) {
    if (aplicaAHtml(b.selector, theme)) {
      for (const [k, v] of b.declaraciones) crudoHtml.set(k, v);
    }
  }
  const crudoBody = new Map(crudoHtml);
  const declaradoEnBody = new Set<string>();
  for (const b of bloques) {
    if (aplicaABody(b.selector, theme, ambient)) {
      for (const [k, v] of b.declaraciones) {
        crudoBody.set(k, v);
        declaradoEnBody.add(k);
      }
    }
  }

  // Cada token se sustituye en el ámbito donde se declaró.
  const resueltoHtml = new Map<string, string>();
  for (const [k] of crudoHtml) resueltoHtml.set(k, resolverCrudo(crudoHtml, k));

  const salida = new Map(resueltoHtml);
  for (const k of declaradoEnBody) salida.set(k, resolverCrudo(crudoBody, k));
  return salida;
}

/** Resuelve el valor de un token dentro de un mapa crudo concreto. */
function resolverCrudo(
  crudo: Map<string, string>,
  nombre: string,
  profundidad = 0,
): string {
  const valor = crudo.get(nombre);
  if (valor === undefined || profundidad > 20) return valor ?? "";
  return sustituir(crudo, valor, profundidad);
}

function sustituir(
  crudo: Map<string, string>,
  valor: string,
  profundidad: number,
): string {
  if (profundidad > 20) return valor;
  return valor.replace(
    /var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/gi,
    (_todo, nombre: string, respaldo?: string) => {
      const v = crudo.get(nombre);
      if (v !== undefined) return sustituir(crudo, v, profundidad + 1);
      return respaldo !== undefined
        ? sustituir(crudo, respaldo, profundidad + 1)
        : _todo;
    },
  );
}

/** Sigue la cadena de `var(...)` hasta un valor literal. */
export function resolver(
  tokens: Map<string, string>,
  valor: string,
  profundidad = 0,
): string {
  if (profundidad > 20) return valor;
  const m = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([\s\S]+))?\)$/i.exec(
    valor.trim(),
  );
  if (!m) return valor.trim();
  const referido = tokens.get(m[1]);
  if (referido !== undefined)
    return resolver(tokens, referido, profundidad + 1);
  if (m[2] !== undefined) return resolver(tokens, m[2], profundidad + 1);
  return valor.trim();
}

export function parseColor(valor: string): Rgb | null {
  const v = valor.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v);
  if (hex) {
    const h = hex[1];
    const ex =
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h;
    return {
      r: parseInt(ex.slice(0, 2), 16),
      g: parseInt(ex.slice(2, 4), 16),
      b: parseInt(ex.slice(4, 6), 16),
      a: ex.length === 8 ? parseInt(ex.slice(6, 8), 16) / 255 : 1,
    };
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (rgb) {
    const q = rgb[1]
      .split(/[,\s/]+/)
      .filter(Boolean)
      .map(Number);
    if (q.length < 3 || q.some(Number.isNaN)) return null;
    return { r: q[0], g: q[1], b: q[2], a: q.length > 3 ? q[3] : 1 };
  }
  return null;
}

/**
 * Los stops de color de un `linear-gradient`, ya resueltos.
 *
 * Un gradiente no tiene UN color: el texto encima se apoya en todos. El punto
 * que decide es el más claro cuando el texto es claro, así que se devuelven
 * todos y quien mida se queda con el peor.
 */
export function stopsDeGradiente(
  tokens: Map<string, string>,
  valor: string,
): Rgb[] {
  const resuelto = resolver(tokens, valor);
  if (!/gradient\(/i.test(resuelto)) {
    const c = parseColor(resuelto);
    return c ? [c] : [];
  }
  const dentro = resuelto.slice(
    resuelto.indexOf("(") + 1,
    resuelto.lastIndexOf(")"),
  );
  const stops: Rgb[] = [];
  for (const m of dentro.matchAll(
    /(#[0-9a-f]{3,8}|rgba?\([^)]+\)|var\(--[a-z0-9-]+\))/gi,
  )) {
    const c = parseColor(resolver(tokens, m[1]));
    if (c) stops.push(c);
  }
  return stops;
}

const lineal = (v: number): number => {
  const x = v / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};

export function luminancia(c: Rgb): number {
  return 0.2126 * lineal(c.r) + 0.7152 * lineal(c.g) + 0.0722 * lineal(c.b);
}

/** Compone `fg` (con su alfa) sobre `bg` opaco. */
export function componer(fg: Rgb, bg: Rgb): Rgb {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

export function contraste(fg: Rgb, bg: Rgb): number {
  const f = luminancia(fg.a < 1 ? componer(fg, bg) : fg);
  const b = luminancia(bg);
  return (Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05);
}

/** El peor contraste del primer plano contra cualquier punto del fondo. */
export function peorContraste(fg: Rgb, fondos: Rgb[]): number {
  return fondos.reduce(
    (peor, bg) => Math.min(peor, contraste(fg, bg)),
    Infinity,
  );
}
