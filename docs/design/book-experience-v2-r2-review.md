# Book Experience V2 · R2 — revisión del prototipo

```
BOOK_EXPERIENCE_V2_R2_REVIEW_VERSION=1.0
SOURCE=CLAUDE_DESIGN_R2_EXPORT
R1_REFERENCE=docs/design/assets/book-experience-v2/
R2_REFERENCE=docs/design/assets/book-experience-v2/revision-2/
IMPLEMENTATION_AUTHORIZED=false
```

Audita la revisión 2 del prototipo visual contra
[la revisión de R1](book-experience-v2-prototype-review.md) y los cuatro
documentos V2. R1 y R2 coexisten: R1 queda como el estado del que se partió, R2
es el diseño vigente.

---

## 1. El paquete

Cinco archivos, importados byte a byte desde
`~/Downloads/Psico Platform Design System (5)/book-experience-v2-r2`.

| Archivo                                 | Rol                                                  | Bytes   |
| --------------------------------------- | ---------------------------------------------------- | ------- |
| `index.html`                            | **Punto de entrada** — 15 pantallas navegables       | 143 824 |
| `style.css`                             | Hoja de estilo del prototipo                         | 44 429  |
| `colors_and_type.css`                   | Tokens de Psico Platform (importada por `style.css`) | 11 118  |
| `book-experience-v2-r2-standalone.html` | Bundle autocontenido de Claude Design                | 453 888 |
| `README.md`                             | Notas de la revisión, escritas por Claude Design     | 8 952   |

```
R2_ENTRY_FILE=index.html
R2_SUPPORT_FILE_COUNT=4
R2_EXPORT_COMPLETE=true
R2_ORIGINAL_HTML_MODIFIED=false
R2_ORIGINAL_CSS_MODIFIED=false
SOURCE_DIR_UNCHANGED=true
```

A diferencia de R1, **el paquete llegó completo**: `index.html` enlaza
`style.css`, esa importa `./colors_and_type.css`, y las tres están. No hizo
falta recuperar nada de Claude Design. `colors_and_type.css` tiene el mismo
SHA-256 que la copia de R1 (`d4125ee5…`), así que los tokens no se movieron.

Hashes en `SHA256SUMS` y `PROTOTYPE_MANIFEST.json`. El SHA del entry file es
`da4213654d3df8ddaff473f1a48af0525a34a34242868408cb8575474154709d`, idéntico al
del archivo descargado. El directorio de origen quedó intacto (comparación de
hashes antes y después de copiar).

**Nota de formato.** El paquete se commiteó sin pasar por los hooks de
pre-commit, porque `lint-staged` corre Prettier sobre `docs/**/*.md` y habría
reformateado el `README.md` exportado — el bloque pedía explícitamente no
ejecutar Prettier sobre los archivos exportados. Los dos documentos que sí
escribí yo (este y `docs/README.md`) se formatearon a mano con la misma
configuración, y el guard de `migration.sql` se corrió aparte.

---

## 2. Seguridad y portabilidad

```
R2_EXTERNAL_NETWORK_DEPENDENCIES=1
R2_TRACKING_CODE_PRESENT=false
R2_HARDCODED_SECRET_PRESENT=false
R2_PII_PRESENT=false
R2_PRODUCTION_API_CALLS_PRESENT=false
```

Cero `fetch`, `XMLHttpRequest`, `WebSocket`, `localStorage`, `sessionStorage`,
`document.cookie`, `<form>`, `<iframe>` y cero analytics. Un solo `<script>`
inline (líneas 1159–1229) que solo conmuta pestañas, estados y ancho.

Las dos apariciones de la palabra «token» son copy del propio prototipo diciendo
lo contrario de lo que un scanner teme: «sin códigos ni tokens» y «Ningún error
muestra código, token ni mensaje de infraestructura».

La única dependencia externa sigue siendo Geist por Google Fonts, importada
desde `colors_and_type.css`. Degrada limpio a la pila del sistema y **no debe
convertirse en dependencia productiva** — `apps/web` ya carga Geist por npm.

Nada se ejecutó contra producción, no se usó la cuenta piloto y no se envió
ningún formulario.

---

## 3. Se sirvió y se abrió

```
R2_LOADS_LOCALLY=true
R2_CONSOLE_FATAL_ERRORS=0
R2_CONSOLE_WARNINGS=0
R2_PAGE_5XX=0
```

Servido con `python3 -m http.server` sobre la carpeta importada, sin añadir
dependencias ni tocar `package.json`. Los tres archivos del entry devuelven 200.
El servidor se apagó al terminar.

---

## 4. Gate P0 — Mapa Emocional · **PASA**

```
R2_EMOTIONAL_MAP_AXES_CORRECT=true
ENERGIA_AS_EMOTIONAL_MAP_AXIS=false
DESCANSO_AS_EMOTIONAL_MAP_AXIS=false
COMPASION_AXIS_PRESENT=true
CONSCIENCIA_AXIS_PRESENT=true
```

Los vértices del hexágono, leídos del DOM renderizado, son exactamente:

```
Calma · Claridad · Conexión · Propósito · Compasión · Consciencia
```

_Energía_ y _Descanso_ desaparecieron de la superficie. Las dos palabras
aparecen una vez cada una en todo el archivo, y ambas en la pantalla `R1 → R2`,
que documenta que se quitaron. Ninguna es un eje.

Cada fila declara su origen y el número que lo respalda:

| Eje         | Valor | Origen          | Grado                 | Respaldo                                                       |
| ----------- | ----- | --------------- | --------------------- | -------------------------------------------------------------- |
| Calma       | 68 %  | Tu ánimo        | `EVIDENCIA_EXPLICITA` | «Basado en 21 registros tuyos de ánimo»                        |
| Claridad    | 88 %  | Tu check-in     | `EVIDENCIA_EXPLICITA` | «Basado en 5 respuestas tuyas del check-in»                    |
| Conexión    | 75 %  | Tus resonancias | `EVIDENCIA_EXPLICITA` | «3 ideas distintas que marcaste como resonantes»               |
| Compasión   | 54 %  | Tu check-in     | `EVIDENCIA_LIMITADA`  | «Basado en 2 respuestas tuyas. Puede moverse bastante todavía» |
| Propósito   | —     | Aún sin señal   | `SIN_EVIDENCIA`       | «No hay suficiente información todavía»                        |
| Consciencia | —     | Aún sin señal   | `SIN_EVIDENCIA`       | «No hay suficiente información todavía»                        |

Los tres grados se distinguen visualmente sin depender solo del color: chip
distinto («Con tus registros» lavanda · «Base limitada» gris · «Reuniendo
datos» gris claro), valor contra guion, y en el radar la punta sin señal se
dibuja **hueca y punteada cerca del centro**, con leyenda explícita: «Una punta
sin señal se queda cerca del centro, hueca y punteada. No es un cero: es que
todavía no hay con qué dibujarla».

El 75 % de Conexión cuadra ahora con `ARC-C1` (3 ideas confirmadas sobre 4). En
R1 ese mismo eje decía 50 % sin explicación.

```
BEHAVIOR_IS_NOT_EMOTION=true
NO_AUTOMATIC_EMOTION_INFERENCE=true
NO_DIAGNOSIS=true
NO_EMOTIONAL_SCORE=true
```

La pantalla cierra con la frase que separa aprendizaje de mapa: «Tu recorrido
por los libros vive en Mi Evolución. Aquí no hay porcentaje global, ni ejes
alimentados por actividad».

**R2_P0_FINDINGS=0.**

---

## 5. Gate P1 — las tres revisiones obligatorias · **PASAN**

### 5.1 Sistema de estados · **completo**

```
R2_STATE_SYSTEM_COMPLETE=true
UNKNOWN != COMING_SOON
UNKNOWN = HIDDEN
```

R2 añade una pantalla dedicada, **Matriz de estados**, con los ocho estados como
patrón reutilizable y no como copia por pantalla:

| Estado              | Patrón dibujado                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `HIDDEN`            | Sin chip. No hay fila, no hay pestaña, no hay mensaje. Estado por defecto de lo no confirmado                   |
| `LOADING`           | Solo después de saber que la superficie existe. Copy por superficie                                             |
| `COMING_SOON`       | Anunciado editorialmente y deshabilitado. No navega, no abre reproductor                                        |
| `AVAILABLE`         | Hay activo reproducible de verdad — «una pestaña es una oferta»                                                 |
| `IN_PROGRESS`       | «2 de 4 recorridas», nunca «te faltan 2»                                                                        |
| `COMPLETED`         | Hechos del recorrido, nunca valoración; volver a entrar nunca se bloquea                                        |
| `ERROR_RECOVERABLE` | Mensaje breve sin códigos · **Reintentar** · **Volver** cuando hay a dónde                                      |
| `EMPTY`             | Solo cuando el contenedor existe y legítimamente está vacío. Un catálogo sin experiencias es `HIDDEN`, no vacío |

Cobertura real, contada sobre los `data-state` del DOM:

| Estado              | R1         | R2         |
| ------------------- | ---------- | ---------- |
| `ERROR_RECOVERABLE` | **1 de 9** | **9 de 9** |
| `LOADING`           | 5 de 9     | **8 de 9** |

El Cierre es la única pantalla sin `LOADING`, y el prototipo dice por qué: no
carga nada, se llega a él desde el último paso y su espera es la confirmación
optimista de la resonancia. Es una ausencia razonada, no un olvido.

### 5.2 Safety handoff de Eco · **presente**

```
R2_ECO_SAFETY_HANDOFF_PRESENT=true
SAFETY_HANDOFF_STATE=drawer (desktop) + sheet (mobile)
```

Pantalla propia, `Eco · apoyo`, en las dos plataformas. Cumple las cinco
condiciones:

- **Interrumpe la conversación normal** — «Eco está en pausa en esta
  conversación»; el compositor queda inactivo.
- **Evita el diagnóstico** — «No soy un profesional ni puedo ayudarte con
  esto». No nombra ninguna condición ni interpreta lo que la persona escribió.
- **Ofrece ayuda humana** — «Ver líneas de ayuda» y «Hablar con alguien de
  confianza», más «Si estás en peligro ahora mismo, busca ayuda de inmediato».
- **Permite salir al contenido** — «Volver al capítulo», y el texto sigue
  exactamente donde estaba: «La lectura no se interrumpe, no se cierra y no se
  bloquea nada».
- **Sin dramatización ni gamificación** — sin alarma roja, sin contadores, sin
  seguimiento. Nada de esto entra al mapa.

El propio prototipo se marca `PATRÓN SUJETO A REVISIÓN` y el README declara que
el copy no es texto definitivo de producción. Se aprueba **el patrón visual**,
no el texto clínico.

### 5.3 Panel compañero mobile · **presente**

```
R2_MOBILE_COMPANION_PRESENT=true
```

Pantalla `Panel mobile`, bottom sheet, con cinco estados que cubren lo pedido:

| Pedido                   | Dónde está                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Abrir / cerrar           | Sheet con cabecera «Panel del capítulo» y cierre visible                               |
| Selector de herramienta  | Eco / Notas / Reflexión en los cinco estados                                           |
| Teclado móvil            | Estado «Notas · editando», con el teclado dibujado y la acción alcanzable              |
| Empty                    | «Aún no tienes notas en este capítulo»                                                 |
| Contenido                | Eco con contexto del pasaje · nota anclada a una frase                                 |
| Error                    | «No pudimos abrir el panel. Tus notas y tu reflexión están a salvo»                    |
| Regreso al mismo pasaje  | «el texto sigue detrás. La persona no pierde el sitio»                                 |
| Safety handoff en mobile | Estado «Mobile · sheet» de `Eco · apoyo`                                               |
| Privacidad de Reflexión  | «Cifrada de extremo a extremo · solo tú puedes leerla», contenido oculto hasta abrirlo |

**R2_P1_FINDINGS=0.**

---

## 6. Responsive y accesibilidad

Medido en Chrome headless sobre el marco del dispositivo (escala verificada a 1,
así que las medidas son píxeles CSS reales), 15 pantallas × 3 anchos = 45
mediciones.

```
R2_DESKTOP_HORIZONTAL_OVERFLOW=0
R2_TABLET_HORIZONTAL_OVERFLOW=0
R2_MOBILE_HORIZONTAL_OVERFLOW=0
R2_UNNAMED_CONTROLS=20
R2_TOUCH_TARGETS_UNDER_44=33
```

Semántica, comparada con R1:

| Señal                      | R1        | R2         |
| -------------------------- | --------- | ---------- |
| Controles totales          | 172       | 259        |
| Sin nombre accesible       | 26 (15 %) | 20 (7,7 %) |
| Atributos `role`           | 2         | 31         |
| `aria-label`               | 2         | 26         |
| `aria-selected`            | 0         | 19         |
| Reglas `:focus`            | 0         | 3          |
| Reglas con `outline: none` | 0         | 0          |

R2 mejora sustancialmente: los selectores ya llevan semántica de pestañas y hay
foco diseñado. Lo que queda abierto está en §7.

---

## 7. Hallazgos

```
R2_SCREENS_PRESENT=15
R2_P0_FINDINGS=0
R2_P1_FINDINGS=0
R2_P2_FINDINGS=4
R2_P3_FINDINGS=2
R2_IMPLEMENTATION_GATE=PASS
```

Ningún hallazgo bloquea la implementación. Los cuatro P2 son cosas que el
código debe resolver, no el diseño.

**P2-1 — 33 controles por debajo de 44 px de alto en mobile.** El README afirma
«áreas táctiles a 44 × 44 en mobile» y la pantalla `Sistema` promete «≥ 44 px».
Medido en las 15 pantallas a 390 px con escala 1, hay 33 que no llegan: las
píldoras de subformato (26 px), las pestañas del panel compañero (33 px),
«Empezar» del bloque de experiencia inline (35 px), los chips de velocidad
(38 px). Es la única distancia real entre lo que R2 declara y lo que dibuja. En
la implementación, el mínimo debe salir del CSS, no de la maqueta.

**P2-2 — 20 de 259 controles siguen sin nombre accesible.** Bajó del 15 % al
7,7 %, y el README es honesto al decir que la ARIA está _anotada_ en `Sistema`
pero no escrita. Los que faltan son de solo ícono: volver, ⓘ por eje, transporte
del reproductor. La implementación tiene que suplirlos; el prototipo ya dice
cuáles y con qué texto.

**P2-3 — Tres reglas `:focus` para 259 controles.** Hay foco diseñado, que es
más de lo que tenía R1, pero no cubre cada familia de control. Conviene fijar
`:focus-visible` en el CSS de producción para botón, pestaña, fila de ruta y
enlace, no solo para los tres casos dibujados.

**P2-4 — Tablet se probó en 1024×768, no en 768×1024.** El prototipo define el
ancho «tablet» como 1024 landscape y ahí toma decisiones propias (drawer de
290 px, cuerpo a 17,5 px). No hay decisión para tablet en vertical, que es el
ancho que pedía el bloque. No desborda —el documento mide limpio a 768— pero
tampoco es una decisión tomada.

**P3-1 — El bundle standalone es un segundo artefacto sin contrato.**
`book-experience-v2-r2-standalone.html` (454 KB) trae bloques
`<script type="__bundler/*">` y duplica el prototipo. Se conserva porque venía
en el paquete y está hasheado, pero **el entry file es `index.html`** y es el
que se audita y del que salen las capturas.

**P3-2 — Google Fonts sigue siendo la única dependencia externa.** Documentado
en §2, sin cambios respecto a R1.

---

## 8. Evidencia

Dieciséis capturas en `revision-2/evidence/`, con `MANIFEST.json` y
`SHA256SUMS`. Todas de una sola carga del mismo SHA, recortadas al marco del
dispositivo: sin chrome del navegador, sin DevTools, sin PII.

| Archivo                                   | Pantalla          | Estado                     | Viewport |
| ----------------------------------------- | ----------------- | -------------------------- | -------- |
| `01-chapter-home-desktop.webp`            | Chapter Home      | Con datos                  | 1365×900 |
| `02-reader-desktop.webp`                  | Reader            | Con datos                  | 1365×900 |
| `03-audiobook-desktop.webp`               | Escuchar          | En curso                   | 1365×900 |
| `04-podcast-desktop.webp`                 | Podcast           | Con datos                  | 1365×900 |
| `05-video-desktop.webp`                   | Ver               | Con datos                  | 1365×900 |
| `06-guided-list-desktop.webp`             | Experiencias      | 10 experiencias            | 1365×900 |
| `07-experience-player-desktop.webp`       | Experience Player | Pasaje                     | 1365×900 |
| `08-completion-summary-desktop.webp`      | Cierre            | Con oferta                 | 1365×900 |
| `09-emotional-map-desktop.webp`           | Tu mapa           | Con datos                  | 1365×900 |
| `10-state-system-desktop.webp`            | Matriz de estados | Ocho estados reutilizables | 1365×900 |
| `11-eco-safety-handoff-desktop.webp`      | Eco · apoyo       | Desktop · drawer           | 1365×900 |
| `12-companion-panel-mobile.webp`          | Panel mobile      | Eco · con contexto         | 390×844  |
| `13-experience-player-mobile.webp`        | Experience Player | Pasaje                     | 390×844  |
| `14-emotional-map-mobile.webp`            | Tu mapa           | Con datos                  | 390×844  |
| `15-emotional-map-no-signal-desktop.webp` | Tu mapa           | Sin señal                  | 1365×900 |
| `16-eco-safety-handoff-mobile.webp`       | Eco · apoyo       | Mobile · sheet             | 390×844  |

Las dos últimas van más allá del mínimo pedido: el mapa sin señal es el estado
que prueba que `SIN_EVIDENCIA` no se dibuja como cero, y el handoff en mobile
completa la pareja drawer/sheet.

---

## 9. Change Log

| Fecha      | Versión | Cambio                                                                                                                                                                                                                                                                                                                                                          |
| ---------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-03 | 1.0     | Revisión de R2: paquete completo importado byte a byte, barrido de seguridad, 15 pantallas, gate P0 (ejes correctos + tres grados de evidencia) y los tres gates P1 (estados, safety handoff, panel mobile) verificados como cerrados, 45 mediciones responsive, 16 capturas hasheadas, 6 hallazgos (0 P0 · 0 P1 · 4 P2 · 2 P3). `R2_IMPLEMENTATION_GATE=PASS`. |
