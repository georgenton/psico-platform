---
"@psico/types": minor
---

Ningún respaldo de autoría inventa ya a quién atribuir un libro.

**`LectorAudioMetadata.artist` pasa de `string` a `string | null`.** Es un
cambio que obliga al consumidor: el audio del lector atribuía el capítulo a la
**plataforma** cuando el libro no tenía autoría registrada, y un libro sin
autor es un estado legítimo desde la reparación de autoría —retirar un nombre
sin fuente no inventa quién escribió la obra—. Los clientes pintan el subtítulo
solo cuando falta, sin separador colgando. Va en `minor` porque en 0.x un
`major` saltaría a 1.0.0 y diría algo que no es; el cambio **sí** exige
manejarlo.

**`AUTHORSHIP_UNCONFIRMED` nuevo** — «Autoría por confirmar», para los campos
que van solos en su línea (la ficha de un libro, un _byline_), donde una línea
vacía no explica nada. Onboarding ya decía esa frase a mano y ahora la lee de
aquí; el _byline_ de Inicio, que firmaba los libros sin autor como «Psicología
Educativa», también.

La regla, que el trinquete de `apps/api/src/books/authorship-fallback.spec.ts`
sostiene: ausencia cuando el campo se compone con otro, marcador declarado
cuando va solo, y nunca un nombre que ninguna fuente sustente.
