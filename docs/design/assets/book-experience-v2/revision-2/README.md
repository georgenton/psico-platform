# Book Experience V2 — prototipo visual · Revisión 2 (R2)

```
BOOK_EXPERIENCE_V2_PROTOTYPE_VERSION=R2
STATUS=PENDING_REVIEW
SCOPE=VISUAL_PROTOTYPE_ONLY
REPOSITORY_CHANGES=none
IMPLEMENTATION_AUTHORIZED=false
```

Revisión del prototipo visual que cierra el hallazgo **P0-1** y los tres **P1**
de `docs/design/book-experience-v2-prototype-review.md`, más los refinamientos
P2/P3 que pedían una decisión visual.

**No es código de producción.** No se copia a `apps/web`.

---

## Contenido del paquete

| Archivo               | Rol                                                    |
| --------------------- | ------------------------------------------------------ |
| `index.html`          | Punto de entrada — 15 pantallas navegables             |
| `style.css`           | Hoja de estilo del prototipo                           |
| `colors_and_type.css` | Tokens de Psico Platform (importada por `style.css`)   |

Autocontenido: abrir `index.html` en cualquier navegador, sin servidor y sin
sesión. La única dependencia externa sigue siendo la familia Geist por Google
Fonts, que degrada limpio a la pila del sistema — **no convertirla en
dependencia productiva**.

---

## Pantallas

Las nueve del brief, las dos extra de R1 que la revisión pidió conservar, y
cuatro nuevas de R2.

| #    | Pantalla            | Estados                                                                                                          |
| ---- | ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1    | Chapter Home        | Con datos · Vacío · Cargando · Completado · **Error recuperable**                                                |
| 2    | Reader              | Con datos · Completado · **Cargando** · **Error recuperable**                                                    |
| 3    | Escuchar            | En curso · Próximamente · Cargando · Error                                                                       |
| 4    | Podcast             | Con datos · Vacío · **Error recuperable**                                                                        |
| 5    | Ver                 | Con datos · Cargando · Oculto · **Error recuperable**                                                            |
| 6    | Experiencias        | 4 · 1 · **10 (agrupadas)** · 0 · **Cargando** · **Error recuperable**                                            |
| 7    | Experience Player   | Pasaje · Audio · Práctica · Reflexión · Pregunta para recordar · Resonancia · **Ejemplo** · **Video** · Cargando · **Error** · Otro dispositivo |
| 8    | Cierre              | Con oferta · Sin oferta · Resonancia confirmada · **Error recuperable**                                          |
| 9    | Tu mapa             | Con datos · Sin señal · Cargando · **Error recuperable**                                                         |
| 10   | **Eco · apoyo**     | Desktop drawer · Mobile sheet — `SAFETY_HANDOFF_STATE`                                                           |
| 11   | **Panel mobile**    | Eco con contexto · Notas vacío · Notas editando · Reflexión privada · Error recuperable                          |
| 12   | Casos               | Emociones (4 experiencias) vs Parejas (2)                                                                        |
| 13   | Sistema             | Chips · posición · señales · medios · lenguaje · responsive · **tablet** · **accesibilidad**                     |
| 14   | **Matriz estados**  | 8 estados reutilizables + cobertura por pantalla                                                                 |
| 15   | **R1 → R2**         | Resumen trazable de cambios                                                                                      |

Tres anchos en todas: **1365×900 · 1024×768 · 390×844**.

---

## Qué cierra R2

### P0-1 · El radar dibuja los seis ejes reales

Los ejes del prototipo son ahora los del modelo, en su orden:

```
Calma · Claridad · Conexión · Propósito · Compasión · Consciencia
```

Fuera *Energía* y *Descanso*, que no existían en ningún modelo del registry.
Cada valor sale del origen que declara su fila (`Tu ánimo` · `Tu check-in` ·
`Tus resonancias`), y **Conexión muestra 75 %** — 3 ideas confirmadas sobre 4 —
en vez del 50 % sin explicación de R1.

Tres grados de evidencia, visualmente distintos:

| Estado                | Cómo se ve                                                          |
| --------------------- | ------------------------------------------------------------------- |
| `EVIDENCIA_EXPLICITA` | Valor + chip «Con tus registros» + «Basado en N registros tuyos»    |
| `EVIDENCIA_LIMITADA`  | Valor + chip «Base limitada» + aviso de que puede moverse           |
| `SIN_EVIDENCIA`       | «—» + chip «Reuniendo datos» + **«No hay suficiente información todavía»** |

Un eje sin señal se dibuja punteado, con nodo hueco cerca del centro. **Nunca un
cero, nunca un número provisional presentado como estable.**

### P1-1 · Error recuperable en las nueve pantallas

Un solo patrón, con el copy adaptado a cada superficie: mensaje breve, sin
diagnóstico técnico ni códigos, **Reintentar**, **Volver** cuando hay a dónde, y
siempre la frase de qué queda a salvo. `Cargando` sube a 8 de 9 — el Cierre no
carga, su espera es la confirmación optimista de la resonancia.

### P1-2 · Eco · traspaso a ayuda humana

`SAFETY_HANDOFF_STATE`, en drawer (desktop) y sheet (mobile). Eco deja de
conversar, el compositor queda en pausa, y la superficie ofrece únicamente una
transición hacia ayuda real y el regreso al capítulo. Sin diagnóstico, sin
consejo clínico, sin conversación inmersiva, sin dramatización, sin gamificación
y sin registrar nada en el mapa.

> El copy de esta maqueta **no es texto definitivo de producción**: es un patrón
> visual sujeto a revisión de seguridad.

### P1-3 · Panel compañero en mobile

Bottom sheet con selector Eco / Notas / Reflexión, cierre visible, contexto del
pasaje, teclado, y regreso al mismo punto del texto. Notas: crear, editar,
guardar, cancelar. Reflexión: anunciada como privada y cifrada, con su contenido
oculto hasta que la persona lo abra. Sheet a pantalla completa controlada al
escribir, para que la acción primaria siga alcanzable.

### Refinamientos

- **P2-1** — nombre accesible documentado para cada control de solo ícono,
  semántica de pestañas (`tablist`/`tab`/`tabpanel`/`aria-selected`/
  `aria-disabled`) para los selectores, posición del Player como `role="img"`
  con etiqueta en palabras, y `:focus-visible` con forma propia. Anotado en
  **Sistema · Accesibilidad**; no se escribió ARIA de producción.
- **P2-2** — ninguna superficie que pueda copiarse literalmente cita ya un
  término prohibido, ni para negarlo. El catálogo de antipatrones vive solo en
  **Sistema**, que es documentación. También salieron los términos internos del
  chrome: los pasos se llaman Pasaje, Ejemplo, Práctica, Reflexión, **Pregunta
  para recordar**.
- **P2-3** — diez experiencias se agrupan por relación con la persona (donde
  quedaste · por recorrer · ya recorridas, plegadas · se abre después) con
  filtros y **sin ordinales**: el número de lista era lo que las hacía parecer un
  curso.
- **P2-4** — tablet con decisiones propias: drawer de 290 px, cuerpo a 17,5 px
  priorizando la medida de lectura, rejillas a una o dos columnas.
- **P2-5** — dicho por qué la posición en el capítulo lleva % y el avance entre
  pasos no.
- **P3-1** — `EXAMPLE` y `VIDEO` dibujados, con la misma anatomía.
- **P3-2** — áreas táctiles a 44 × 44 en mobile.

---

## Qué se conservó sin tocar

Chapter Home centrado en «Seguir leyendo» · separación real entre Leer,
Escuchar, Ver y Experiencias · Podcast como subformato de Escuchar · cantidades
dinámicas (0..N en todo) · Player de pasos variables · Cierre sin evaluación ·
resonancia explícita y revocable · aviso honesto de reanudación entre
dispositivos · marca **MAQUETA** sobre todo medio inexistente · marco reservado
sin botón de play · paleta warm / sage / lavender · casos comparativos de
*Emociones* y *Parejas*.

---

## Principios que el prototipo sostiene

```
CONTENT_FIRST=true              READING_REMAINS_PRIMARY=true
EXPERIENCE_IS_OPTIONAL=true     USER_CONTROL_REQUIRED=true
UNKNOWN_CONTENT_IS_HIDDEN=true  COMING_SOON_IS_DISABLED=true
TRANSCRIPT_DOES_NOT_REPLACE_MEDIA=true
BEHAVIOR_IS_NOT_EMOTION=true    NO_AUTOMATIC_EMOTION_INFERENCE=true
NO_DIAGNOSIS=true               NO_EMOTIONAL_SCORE=true
UNKNOWN != COMING_SOON          UNKNOWN = HIDDEN
MIN_TOUCH_TARGET=44x44
```

---

## Destino

```
docs/design/assets/book-experience-v2/revision-2/
```

Los coloca Jorge. Sin cambios en el repositorio desde el diseño.
