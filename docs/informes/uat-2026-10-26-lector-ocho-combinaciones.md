# Las ocho combinaciones sobre el texto reparado — 2026-10-26

Recorrido del lector en los **dos estilos × cuatro ambientes** después de
aplicar la reparación del énfasis de *Emociones en Construcción*
(`docs/operations/eec-emphasis-repair.md` §7).

Esto cierra el primer punto de la lista de trabajo vigente, con un matiz que
conviene no perder: la revisión del **24-10** ya había recorrido las ocho
combinaciones y vale para maquetación, contraste y color, porque Web no cambió.
Lo que no cubría era el **texto**, que cambió después. Este recorrido mide eso.

## Cómo

| | |
|---|---|
| Entorno | `staging.feelverse.app` · Web `5dacedbd` · API `19fcc261` |
| Cuenta | sintética `@psico.test`, creada en la sesión, contraseña guardada antes de registrar y **rotada al cerrar** |
| Acceso | el **formulario** de `/login`. Ni token fabricado ni cookie inyectada |
| Mandos | los de la aplicación: «Ambiente: … Cambiar.» y «Estilo: … Cambiar.» |
| Capítulo | *EEC* C01, 188 bloques |
| Ventana | 1280 × 900 |

**Un detalle del arnés, porque cambia cómo se lee el resultado.** Los
disparadores de los dos menús no responden a un `click` sintético: sólo se
abren con una pulsación real. Los elementos del menú sí responden. Así que cada
combinación se fijó abriendo el menú con una **pulsación real** y eligiendo la
opción por su texto. Un primer intento midió ocho veces la misma combinación
precisamente porque el disparador no se había abierto; esa tanda se descartó.

Antes de cada medición se espera a que el color **deje de moverse** (dos
fotogramas estables más margen): medir a mitad de la transición inventa un
fallo de contraste que no existe.

## Resultado

| Estilo | Ambiente | `strong` | `em` | Negrita distinguible | Cursiva | Contraste | Asteriscos | Desborde |
|---|---|---|---|---|---|---|---|---|
| Renacimiento | Calma | 25 | 24 | ✅ 400→700 · 700→900 | ✅ | 7,58 – 14,42 | 4 en 1 bloque | no |
| Renacimiento | Enfoque | 25 | 24 | ✅ | ✅ | 9,38 – 15,55 | 4 en 1 bloque | no |
| Renacimiento | Energía | 25 | 24 | ✅ | ✅ | 8,03 – 14,21 | 4 en 1 bloque | no |
| Renacimiento | Noche | 25 | 24 | ✅ | ✅ | 13,05 – 18,68 | 4 en 1 bloque | no |
| Contemporary | Calma | 25 | 24 | ✅ 400→700 · 500→700 | ✅ | 7,70 – 14,65 | 4 en 1 bloque | no |
| Contemporary | Enfoque | 25 | 24 | ✅ | ✅ | 9,38 – 15,55 | 4 en 1 bloque | no |
| Contemporary | Energía | 25 | 24 | ✅ | ✅ | 8,03 – 14,21 | 4 en 1 bloque | no |
| Contemporary | Noche | 25 | 24 | ✅ | ✅ | 13,05 – 18,68 | 4 en 1 bloque | no |

**«Negrita distinguible» no es que exista el `<strong>`**, es que su peso
calculado sea mayor que el de su párrafo. Importa porque una marca que
renderizara al peso del cuerpo habría *perdido* el énfasis en vez de moverlo, y
retirar los asteriscos lo habría escondido. Se comprobó en las 25, en las ocho
combinaciones.

Los **4 asteriscos** que quedan están los cuatro en el mismo bloque: la cita
bloqueada por el *backtick*, que espera decisión editorial.

**Tres de los cuatro ambientes dan la misma razón de contraste en los dos
estilos** (Enfoque 9,38–15,55 · Energía 8,03–14,21 · Noche 13,05–18,68), y
Calma difiere un poco (7,58–14,42 frente a 7,70–14,65). No es un valor
atascado: el ambiente es el que lleva la paleta de texto y fondo —en Noche,
`rgb(238,235,245)` sobre `rgb(20,17,25)` en los dos estilos— y el estilo lleva
la tipografía y los pesos, que sí cambian (`700→900` en Renacimiento,
`500→700` en Contemporary). Que Calma difiera demuestra que el estilo también
toca algún color.

## Ninguna marca quedó partida

Un desfase de un carácter al retirar los asteriscos aparecería justo en el
borde de una marca. Se comprobaron las **49** marcas del capítulo:

| | |
|---|---|
| Marcas revisadas | 49 |
| Que empiezan o acaban a mitad de palabra | **0** |
| Con espacio sobrante al borde | **0** |

Y leídas, dicen lo que deben: *Desmontando mitos y teorías tradicionales*,
*Inteligencia emocional*, los títulos de libros en cursiva, **Idea clave:** en
negrita.

## Un defecto, que el recorrido existía para encontrar

**164 de los 188 bloques —todo el cuerpo del libro— se pintaban con la serif
por defecto del navegador**, no con la letra del estilo. Los 24 encabezados sí
usaban Newsreader, así que el libro se leía con una letra distinta de la de sus
propios títulos, y cambiar de estilo no cambiaba la letra del texto.

La causa no era que faltara el token:

| Estilo | `var(--fv-font-reader)` resuelve a |
|---|---|
| Contemporary | `__Newsreader_1c8954, Georgia, serif` |
| Renacimiento | `__Source_Serif_4_704693, …, Georgia, serif` |

Resuelven, y resuelven **distinto**, medido con una sonda dentro del subárbol
del lector en la página viva. Y la hoja ya traía `.reader-prose` para
aplicarlo. La regla estaba muerta por los dos lados: nadie llevaba la clase, y
el lector la habría pisado igual con un estilo **en línea** genérico.

Arreglado en [PR #816](https://github.com/georgenton/psico-platform/pull/816),
con trinquete de cuatro mitades verificado por mutación.

## Veredicto

| | |
|---|---|
| El texto reparado se lee con sus marcas, en las ocho combinaciones | ✅ |
| Ninguna marca desplazada ni partida | ✅ |
| Contraste, pesos y ausencia de desborde | ✅ |
| **La letra del cuerpo** | ❌ defecto encontrado y arreglado en #816 |
| Aceptación visual del lector sobre el texto reparado | ⏸️ **parcial** hasta que Web sirva #816 y se vuelva a medir la letra |

Lo que falta para cerrarla es una pasada corta: con #816 servido, volver a
recorrer las ocho y comprobar que la familia calculada del cuerpo es la del
estilo activo. Las marcas ya están comprobadas y no dependen de eso.

## Lo que no se tocó

Producción. Ningún cobro. Ninguna publicación editorial. Ninguna llamada
facturable al modelo. Los dos bloques excluidos de *EEC* siguen excluidos y las
288 viñetas siguen fuera de alcance.
