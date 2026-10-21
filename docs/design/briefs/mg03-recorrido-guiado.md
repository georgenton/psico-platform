# Brief de diseño — MG03 «Una alarma antes de la historia»

Para Claude Design. Preparado el 2026-10-21 desde el contenido editorial real
del manifiesto `artifacts/eec/C01/v1.0/feelverse/guides/mg03.manifest.json`
(`EEC-C01-MG03`, `canonicalVersion: EEC_C01_v1.0_TEXT_LOCKED_2026-08-20`).

## Qué se pide, y qué no

Se pide el **diseño visual** de las siete escenas de MG03 y de los cuatro
estados de su tarjeta, en los dos sistemas visuales por los cuatro ambientes.

No se pide texto. El contenido está aprobado y bloqueado contra un manuscrito
con su SHA; cualquier cambio de redacción es una decisión editorial con su
propio circuito. Tampoco se piden interacciones nuevas: las que hay están
construidas y algunas lo están **por razones de accesibilidad que no se pueden
revertir** (abajo, «lo que ya existe»).

MG03 está en **DRAFT** y su manifiesto declara `publishAllowed: false`. Nada
de este trabajo publica nada.

## El contenido real, escena por escena

| #   | Tipo     | Título                                      | Acción                 |
| --- | -------- | ------------------------------------------- | ---------------------- |
| 1   | INTRO    | Cuando reaccionas antes de entender         | «Comenzar»             |
| 2   | PASSAGE  | Una alarma antes de la historia             | «Leí el pasaje»        |
| 3   | CONCEPT  | Protegerse no es lo mismo que sentir miedo  | «He explorado la idea» |
| 4   | EXAMPLE  | Lo que sabía Darwin y lo que hizo su cuerpo | (sin acción propia)    |
| 5   | PRACTICE | Ordena la alarma y el relato                | «Ya hice la práctica»  |
| 6   | RECALL   | ¿Qué demuestra una reacción rápida?         | «Responder»            |
| 7   | SUMMARY  | Una alarma no cuenta toda la historia       | «Finalizar»            |

Tres de las siete son **checkpoints** (3, 5, 6): las únicas que mueven el
registro. Las otras cuatro acompañan. El contador que ve la persona —«1 DE 3
PASOS REGISTRADOS»— cuenta sólo las tres.

**1 · INTRO.** «A veces el organismo se prepara antes de que alcances a
explicar qué ocurrió. En esta guía distinguirás esa respuesta rápida de la
emoción consciente que después puedes reconocer y nombrar.» Lleva una nota que
es parte del contrato de cuidado, no decoración: «Trabajaremos con situaciones
hipotéticas y cotidianas. No necesitas recordar una experiencia difícil. Puedes
salir y volver cuando quieras.» Esa nota necesita sitio propio y legible; hoy
va en gris pequeño.

**2 · PASSAGE.** Ancla al pasaje del capítulo (`anchorRef:
eec-c1-alarma-antes-del-relato`). La escena no reproduce el texto del libro:
lleva a él y vuelve. El diseño tiene que dejar claro que esto es «ve a leer y
regresa», no «aquí hay un resumen».

**3 · CONCEPT.** La idea central, con una nota que importa:
«Marcar esta escena registra que exploraste el concepto; no evalúa lo que
sentiste ni infiere un estado psicológico.» Es la frase que separa esta app de
un test. Debe leerse, no esconderse.

**4 · EXAMPLE.** Darwin ante la serpiente tras el cristal. Es el único momento
narrativo puro de la guía y hoy se ve igual que los demás.

**5 · PRACTICE — ordenamiento.** Escenario: «Lees tranquilamente en casa y una
puerta se cierra de golpe.» Cuatro tarjetas a ordenar:

1. Aparece una señal repentina.
2. El organismo inicia una respuesta protectora o de sobresalto.
3. Compruebas el contexto y descubres qué ocurrió.
4. Interpretas la situación y puedes nombrar la experiencia.

Con una salida declarada: «Prefiero ver el ejemplo resuelto», sin penalización.
Y una nota: «Confirmar registra únicamente que hiciste la práctica.» **Nada
califica el orden del lector.**

**6 · RECALL.** Tres opciones, una correcta, corregida en el servidor. El
veredicto que vuelve es «Correcta» o «Para repasar» — nunca «incorrecta», y
nunca se revela cuál era la buena. El diseño del feedback tiene que sostener
esa diferencia sin convertirla en un suspenso disfrazado.

**7 · SUMMARY.** Cierra separando tres cosas —la reacción, el contexto y el
significado— y enlaza con las microguías siguientes.

## Lo que ya existe (no rediseñar la interacción)

- **Doce renderizadores** por tipo de escena, resueltos por un registro
  cerrado. Un tipo nuevo no se inventa en el diseño.
- **El ordenamiento es primero de botones, y a propósito.** Cada tarjeta lleva
  «Subir» y «Bajar»; el arrastre con puntero está encima y nada depende de él.
  El motivo está escrito en el código: arrastrar es inusable con teclado,
  invisible para un lector de pantalla y hostil en pantallas pequeñas. Se puede
  rediseñar **cómo se ven** esos controles; no se puede proponer arrastrar como
  interacción principal.
- **Cada movimiento se anuncia** por `aria-live` («…Posición 2 de 4»). El
  diseño no puede depender de una animación para comunicar el cambio.
- **El resumen final reporta hechos, no una nota.** Ideas exploradas, prácticas
  confirmadas y el veredicto del servidor por cada recuerdo. Sin porcentajes,
  sin rachas, sin frases sobre cómo ha cambiado la persona.

Requisitos que el propio manifiesto declara y que valen como restricción de
diseño: navegación completa por teclado con foco visible y orden lógico; toda
reordenación anunciada; alternativa sin arrastrar; respeto a
`prefers-reduced-motion`; **el color nunca es la única señal de estado**;
ninguna reproducción automática.

## Los cuatro estados de la tarjeta

Con su texto actual, medido en el capítulo 1 de _Emociones en Construcción_:

| Estado            | Cuándo                                                                                                     | Hoy se ve así                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Disponible**    | hay una experiencia publicada para ese pin, el servidor la declara arrancable y es la única que lo reclama | tarjeta activa, «Empezar»                                                                                                 |
| **No disponible** | falta cualquiera de esas tres condiciones                                                                  | **«No disponible ahora», control apagado** — las cinco microguías de C01 están así hoy                                    |
| **En curso**      | hay una sesión abierta                                                                                     | «Continuar»; y si se abre el recorrido: «Tienes este recorrido abierto», con «Continuar experiencia» y «Empezar de nuevo» |
| **Completado**    | la sesión terminó                                                                                          | el resumen con sus hechos y «Repetir experiencia»                                                                         |

Dos matices que el diseño debe poder expresar y hoy comparten forma:

1. **«Ofrecida pero no ejecutable» reutiliza «No disponible ahora».** Es
   honesto y no inventa una fecha. Falta decidir si merece forma propia cuando
   conviva con tarjetas que sí abren.
2. **Un recorrido retirado para inicios nuevos** mantiene «Continuar» y apaga
   «Empezar de nuevo» / «Repetir experiencia», con el motivo al lado: «Esta
   experiencia ya no admite recorridos nuevos. Lo que completaste queda
   guardado.» El control se queda apagado en vez de desaparecer, para que quien
   vuelva buscándolo se entere de por qué no puede. Conviene revisar el tono de
   esa frase para quien **nunca** lo empezó.

## Sistemas visuales y ambientes

Dos sistemas —**Contemporary** y **Renacimiento**— por cuatro ambientes
—**Calma**, **Enfoque**, **Energía**, **Noche**—. El radio de los paneles
cambia con el sistema por diseño (24 px en Contemporary, 6 px en Renacimiento);
no es un error que haya que unificar.

**Aviso sobre Noche (#728).** Hay un fallo conocido y aún no corregido: doce
alias declarados en `<html>` como `var()` de un token que Noche redefine en
`body` se quedan con el valor claro. Bordes y sombras conservan el claro y un
acento de enlace cae a 2,65:1. Es el sistema de color, no esta pantalla. El
diseño de MG03 en Noche debe especificarse contra los valores **pretendidos**,
y conviene no apoyar ninguna jerarquía nueva en bordes o sombras hasta que eso
se cierre.

## Qué se puede mirar hoy, y qué no muestra

Existe una **vista previa interactiva del borrador**, dentro del editor de
administración: monta el reproductor real con los renderizadores reales y una
ejecución que no registra nada («Vista previa: no registra avance, respuestas
ni resonancias»). Recorrida de principio a fin el 2026-10-21 en una pila local:
las siete escenas se suceden y el contador llega a 3 de 3.

**Con una limitación que conviene saber antes de revisar por ahí:** la vista
previa no pasa contexto de red al reproductor, así que la **interacción de la
práctica no se carga**. En la escena 5 se ven el título, el cuerpo, la nota, un
temporizador opcional y el botón de confirmar — pero **no las cuatro tarjetas a
ordenar**. Quien revise MG03 sólo por la vista previa no llegará a ver la
práctica. Las tarjetas sí están en el catálogo (arriba, textuales) y el
renderizador existe con sus propias pruebas.

No hace falta publicar nada para diseñar esto, y no debe hacerse.

## Preguntas que sí son de diseño

1. ¿Merece «ofrecida pero no ejecutable» una forma distinta de «no disponible
   todavía», o la honestidad de compartir forma es preferible?
2. ¿Cómo se ve un feedback de recuerdo que dice «para repasar» sin que se lea
   como «has fallado» y sin revelar la respuesta?
3. Las notas de cuidado (escenas 1, 3 y 5) son el contrato de la app con quien
   la usa. Hoy van en gris pequeño al pie. ¿Dónde deberían ir?
4. La escena 4 es narrativa y se ve como las demás. ¿Debe respirar distinto?
5. ¿Qué distingue visualmente una escena que registra de una que acompaña, sin
   convertir el contador en una barra de progreso que presione?
