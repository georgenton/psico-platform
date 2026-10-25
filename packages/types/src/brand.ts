/**
 * El nombre del producto, una sola vez.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * El producto se llama FeelVerse. Pero el nombre anterior, «Psico Platform»,
 * seguía escrito a mano en diecisiete archivos, y varios hablan en voz alta:
 * el prompt de Eco —que se lo dijo literalmente a una cuenta de prueba el
 * 2026-10-24: «tu companion conversacional en Psico Platform»—, los asuntos
 * de los correos transaccionales y los prompts del narrador del Mapa y del
 * resumen semanal, cuyo texto se le muestra a la persona.
 *
 * Corregir cuatro copias habría dejado trece. Ésta es la misma decisión que
 * `password-policy`: el dato vive en un sitio y los consumidores lo leen.
 *
 * ── Dónde vive la lista de excepciones, y por qué no aquí ──────────────────
 *
 * La primera versión de este comentario traía el inventario de lo que quedaba
 * fuera. **Estaba mal dos veces**, y merece la pena decirlo porque explica el
 * diseño:
 *
 *   1. Afirmaba que el resto de menciones estaban justificadas. Había mirado
 *      seis de diecisiete archivos.
 *   2. Por eso el correo de exportación salió **desplegado** con el nombre
 *      viejo en el asunto. Los asuntos no viven en el armazón compartido:
 *      cada plantilla pone el suyo, y ése se construye en su processor.
 *
 * Un inventario a mano en un comentario no se comprueba nunca. La lista real,
 * con el motivo de cada excepción, vive en
 * `apps/api/src/notifications/templates/brand.spec.ts`, donde un trinquete
 * recorre el árbol y **falla** si aparece una mención que nadie justificó —y
 * también si sobra una justificación que ya no corresponde a nada.
 *
 * Ese trinquete rinde los correos en vez de leer el fuente, porque un grep
 * pasa cuando la interpolación queda mal escrita: los dos primeros asuntos
 * que corregí eran cadenas con comillas y no literales de plantilla, así que
 * la sustitución dejó las llaves tal cual.
 */
export const BRAND_NAME = "FeelVerse";
