---
"@psico/types": minor
---

El catálogo de líneas de crisis pasa a vivir aquí.

Vivía dentro de la API, así que la única forma de que una pantalla enseñara un
teléfono era pedírselo por red. Ahora es dato puro más un resolutor puro, y la
página pública de ayuda lo lee sin red: las líneas se ven aunque la API esté
caída. La API sigue sirviendo `GET /api/terapia/crisis` desde **este** módulo —el
mismo objeto, el mismo resolutor—, de modo que no hay dos copias que puedan
separarse.

Superficie nueva, sin tocar la que había: `getCrisisFor`, `CRISIS_COUNTRIES`,
`CRISIS_COUNTRY_NAMES`, `CRISIS_DEFAULT_COUNTRY`, `CRISIS_FALLBACK`,
`isCrisisCountry` y el tipo `CrisisCountry`. `CRISIS_COUNTRY_NAMES` está tipado
contra el catálogo: añadir un país sin ponerle nombre no compila.

**Ni un dato cambió.** Países, teléfonos, enlaces, horarios, idiomas, consejos,
pasos y orden son los mismos, y la respuesta HTTP se compara, país por país, con
literales capturados antes de mover nada.
