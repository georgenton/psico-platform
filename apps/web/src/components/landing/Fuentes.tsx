/**
 * Las tipografías de la landing, pedidas cuanto antes.
 *
 * Son exactamente las cuatro del sistema aprobado y con los mismos ejes:
 * Geist y Geist Mono para texto, Newsreader en Contemporary y Source Serif 4
 * en Renacimiento. No se cambia ninguna familia, así que la fidelidad frente a
 * la referencia no se mueve.
 *
 * ── Por qué un <link> y no el @import del prototipo ───────────────────────
 *
 * El prototipo es un HTML suelto y las pide con `@import` dentro de
 * `themes/core.css`. Dentro de una hoja de estilo, ese `@import` es la forma
 * más lenta de pedir algo: el navegador descubre la hoja de Google sólo
 * después de descargar y analizar los 60 KB de la nuestra, y recién entonces
 * empieza a buscar los woff2. Tres viajes en serie antes de poder pintar.
 *
 * Medido sobre la página servida, primera visita:
 *
 *   con @import, red normal          FCP  504 ms
 *   con @import, 400 ms de latencia  FCP  796 ms
 *   con @import, 1 s de latencia     FCP 1400 ms
 *   sin pedir las fuentes            FCP  100 ms
 *
 * El `<link>` se descubre al leer el documento, y la preconexión adelanta el
 * apretón de manos con el servidor que sirve los woff2. Mismas fuentes, mismos
 * bytes, descubiertos antes.
 *
 * `crossOrigin` en la preconexión a `fonts.gstatic.com` no es decorativo: las
 * fuentes se piden en modo anónimo, y sin ese atributo el navegador abriría una
 * conexión distinta de la que luego usa, perdiendo justo lo que se quería
 * ganar.
 *
 * Next iza estos elementos al `<head>`, así que no hace falta tocar el layout
 * raíz ni cargar estas familias en el resto de la aplicación.
 */

const FAMILIAS =
  "https://fonts.googleapis.com/css2" +
  "?family=Geist:wght@400;500;600;700" +
  "&family=Geist+Mono:wght@400;500;600" +
  "&family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700" +
  "&family=Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..700" +
  "&display=swap";

export function Fuentes() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={FAMILIAS} />
    </>
  );
}
