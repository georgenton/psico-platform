/**
 * Qué dice el producto cuando un libro no tiene autoría registrada.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * Porque un libro **puede** no tenerla, y eso es un estado legítimo desde la
 * reparación de autoría: retirar un nombre sin fuente no inventa quién
 * escribió la obra. *Familias ensambladas* vive así hoy.
 *
 * Lo que no puede pasar es que el respaldo se invente una atribución. Había
 * dos, las dos encontradas el 2026-10-25 buscando una sola:
 *
 *   - el audio del lector atribuía el libro a la **plataforma**;
 *   - las recomendaciones de Inicio firmaban el *byline* como «Psicología
 *     Educativa», que se lee como el nombre de una persona o un sello y que
 *     nadie puede distinguir de una atribución real.
 *
 * Las dos son de la misma clase que la reparación de autoría retira: una
 * afirmación sobre quién hizo algo que ninguna fuente sostiene.
 *
 * ── Las dos formas honestas, y cuándo usar cada una ────────────────────────
 *
 * **`null`** cuando el campo se COMPONE con otra cosa — el artista del audio
 * se pinta como «Libro · Artista», así que un marcador dejaría un separador
 * colgando, y un cliente de medios futuro escribiría una frase en español en
 * la ranura que el sistema operativo reserva para un nombre. Es además lo que
 * ya hace `lector.service.ts` en sus otros dos puntos de autoría.
 *
 * **`AUTHORSHIP_UNCONFIRMED`** cuando el campo va SOLO en su línea — la ficha
 * de un libro o un *byline*. Ahí una línea vacía no explica nada y el
 * marcador sí: dice que falta por confirmar, no que no haya nadie.
 *
 * El trinquete vive en `apps/api/src/books/authorship-fallback.spec.ts` y
 * exige que todo respaldo de autoría sea una de las dos, o esté en su lista
 * de excepciones con un motivo escrito.
 */
export const AUTHORSHIP_UNCONFIRMED = "Autoría por confirmar";
