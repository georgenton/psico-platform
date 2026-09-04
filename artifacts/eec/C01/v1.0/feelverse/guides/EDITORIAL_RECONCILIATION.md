# EEC-C01 · reconciliación editorial de las cinco microguías

Qué dice el diseño aprobado, qué quedó implementado y por qué, cuando difieren.
Fuente canónica: `content/books/eec/C01/chapter.md`, SHA-256
`e10f42cedf881838578b7337355887c0e8cb2fe37b75dfa4204db509ac023018`, sin
modificar ni reingerir.

Autoridades editoriales:

- MG03 aprobado por Jorge el 2026-09-02 — [Diseño v0.1](https://app.notion.com/p/3cfcbb1031a08141a900fc42d2e64ce4)
- [Handoff técnico MG03](https://app.notion.com/p/3cfcbb1031a081d68219ff8ac91bb63f)
- [Inventario v0.1](https://app.notion.com/p/3cfcbb1031a0813fb184fe6173d8a826)

---

## 1. Decisión canónica de identidades

Las claves de práctica describían la tesis de la microguía en lugar de la
actividad. Se adoptaron las identidades descriptivas del diseño:

| Microguía | Antes | Ahora |
| --- | --- | --- |
| MG01 | `eec-c1-practice-teorias-como-lentes` | `eec-c1-practice-revisar-un-lente` |
| MG02 | `eec-c1-practice-rostro-como-pista` | `eec-c1-practice-una-sonrisa-varios-contextos` |
| MG03 | `eec-c1-practice-alarma-antes-del-relato` | `eec-c1-practice-ordenar-alarma-y-relato` |
| MG04 | `eec-c1-practice-emocion-informa-no-manda` | `eec-c1-practice-siento-interpreto-impulso-elijo` |
| MG05 | `eec-c1-practice-construida-no-significa-falsa` | `eec-c1-practice-senales-y-contextos` |

El paso `CATALOG_PRACTICE` de cada Guide sigue a su actividad
(`practicar-ordenar-alarma-y-relato`), como especificaba el handoff. Concepto,
recall, Guide y Experience conservan sus claves: ya nombraban la idea, que es
para lo que sirven.

**Seguridad:** consulta de solo lectura contra producción, sin escrituras, antes
de renombrar. Ninguna de las diez claves candidatas existe allí; los únicos
ejercicios EEC en producción son los del piloto
(`eec-c1-practice-escucharte-por-dentro`, `eec-c1-recall-cuerpo-antes-que-mente`)
y la única Experience es el piloto v2 en `DRAFT`. Era el último momento para
hacerlo sin migración.

---

## 2. MG03 — matriz contra el diseño aprobado

`MATCH` = la copy implementada es la aprobada. `JUSTIFIED_CHANGE` = difiere, con
razón. `MISSING` = falta.

### Escena 1 · INTRO

| Campo | Aprobado | Implementado | Estado |
| --- | --- | --- | --- |
| Título | Cuando reaccionas antes de entender | idéntico | `MATCH` |
| Cuerpo | «A veces el organismo se prepara antes de que alcances a explicar qué ocurrió…» | idéntico | `MATCH` |
| Nota de seguridad | «Trabajaremos con situaciones hipotéticas y cotidianas…» | idéntica | `MATCH` |
| actionLabel | `Comenzar` | `Comenzar` | `MATCH` |
| Salida segura | Puede salir y volver | en la nota | `MATCH` |
| Binding | `none` | ninguno | `MATCH` |

### Escena 2 · PASSAGE

| Campo | Aprobado | Implementado | Estado |
| --- | --- | --- | --- |
| Título | Una alarma antes de la historia | idéntico | `MATCH` |
| Cuerpo | «Lee el pasaje donde el capítulo presenta la propuesta de Joseph LeDoux…» | idéntico | `MATCH` |
| actionLabel | `Leí el pasaje` | idéntico | `MATCH` |
| Binding | ancla canónica | `anchorRef: eec-c1-alarma-antes-del-relato`, heading y huella verificados con 1 coincidencia | `MATCH` |

### Escena 3 · CONCEPT

| Campo | Aprobado | Implementado | Estado |
| --- | --- | --- | --- |
| Título | Protegerse no es lo mismo que sentir miedo | idéntico | `MATCH` |
| Cuerpo | párrafo completo | idéntico | `MATCH` |
| Matiz | «secuencia pedagógica… no una cadena cerebral rígida» | segundo párrafo del cuerpo | `JUSTIFIED_CHANGE` — el contrato de escena tiene un solo campo `note`, ocupado por la nota de progreso. El matiz científico es demasiado importante para relegarlo a un pie: va en el cuerpo, donde se lee siempre. |
| Nota de progreso | «Marcar esta escena registra que exploraste el concepto…» | idéntica, en `note` | `MATCH` |
| actionLabel | `He explorado la idea` | idéntico | `MATCH` |
| Binding | `CONCEPT_EXPLORATION` | `explorar-alarma-antes-del-relato` | `MATCH` |

### Escena 4 · EXAMPLE

| Campo | Aprobado | Implementado | Estado |
| --- | --- | --- | --- |
| Título | Lo que sabía Darwin y lo que hizo su cuerpo | idéntico | `MATCH` |
| Cuerpo | Darwin y el vidrio | idéntico | `MATCH` |
| Transferencia cotidiana | la puerta que se cierra | segundo párrafo | `MATCH` |

La versión anterior sustituía a Darwin por una analogía de detector de humo. Se
revirtió: el diseño aprobado eligió a Darwin como ejemplo principal (§15.3), y
el detector de humo introducía una metáfora de «alarma» que el propio diseño
evita para no sugerir un circuito único.

### Escena 5 · PRACTICE

| Campo | Aprobado | Implementado | Estado |
| --- | --- | --- | --- |
| Título | Ordena la alarma y el relato | idéntico | `MATCH` |
| Cuerpo | «Imagina que lees tranquilamente y una puerta se cierra de golpe…» | idéntico | `MATCH` |
| Cuatro tarjetas | señal · respuesta protectora · comprobación · interpretación | idénticas, en el catálogo server-side | `MATCH` |
| Feedback de orden | «La señal y la respuesta rápida pueden preceder…» | idéntico, en el catálogo | `MATCH` |
| Salida segura | `Prefiero ver el ejemplo resuelto` | idéntica | `MATCH` |
| Confirmación | `Ya hice la práctica` | idéntica | `MATCH` |
| Binding | `CATALOG_PRACTICE` | `practicar-ordenar-alarma-y-relato` | `MATCH` |
| Interacción | ordenar cuatro tarjetas | `sequence_ordering` con arrastre opcional, botones Subir/Bajar, teclado y `aria-live` | `MATCH` |

### Escena 6 · RECALL

| Campo | Aprobado | Implementado | Estado |
| --- | --- | --- | --- |
| Título | ¿Qué demuestra una reacción rápida? | idéntico | `MATCH` |
| Pregunta | «¿Cuál afirmación representa mejor la idea central de esta guía?» | idéntica, en el catálogo | `MATCH` |
| Opción A | amígdala produce el miedo | idéntica | `MATCH` |
| Opción B | respuesta protectora ≠ miedo consciente | idéntica | `MATCH` |
| Opción C | toda reacción intensa demuestra peligro | idéntica | `MATCH` |
| Correcta | `B`, solo servidor | `correctOptionKey` solo en `Exercise.content`; ausente de la definición, del manifiesto y de la vista pública | `MATCH` |
| Sin inferencia | una respuesta incorrecta no deduce nada | ningún consumo de la respuesta más allá de la escena | `MATCH` |
| Feedback CORRECT / REVIEW | dos textos | `MATCH` — implementados literales. Ver la nota de abajo sobre dónde viven. |

### Escena 7 · SUMMARY

| Campo | Aprobado | Implementado | Estado |
| --- | --- | --- | --- |
| Título | Una alarma no cuenta toda la historia | idéntico | `MATCH` |
| Cuerpo | «Antes de concluir “esto es miedo”…» | idéntico | `MATCH` |
| Puente | «En las siguientes microguías…» | segundo párrafo | `MATCH` |
| actionLabel | `Finalizar` | idéntico | `MATCH` |

#### Dónde vive el feedback del recall

La copy aprobada de `CORRECT` y `REVIEW` está en el catálogo server-side, en la
definición del recall — **no** en `Exercise.content`.

La razón es operativa y vale la pena dejarla escrita: la ingesta compara los
bytes almacenados y lanza `EXERCISE_INGEST_DRIFT_DETECTED` ante cualquier
diferencia; nunca actualiza. Añadir un campo a la forma almacenada habría hecho
que el siguiente `apply-targets` rechazara los siete recalls ya materializados,
producción incluida. El feedback es dato de catálogo en ambos casos; esta es la
mitad del catálogo que no necesita una fila para ser cierta.

El servidor resuelve la frase al leer el resultado del ledger, así que un replay
con la misma clave de idempotencia devuelve el mismo resultado **y** las mismas
palabras. Solo viaja la rama que ocurrió: tener las dos sería tener la
respuesta, igual que `correctOptionKey`.

`assertPairValid` exige ambas ramas en todo recall objetivo, de modo que la
falta de copy se detecta en la validación del catálogo y no delante de una
persona que acaba de responder.

### Identidades: diseño v0.1 frente a handoff

| Objeto | Diseño §9 | Handoff §2 | Implementado | Estado |
| --- | --- | --- | --- | --- |
| Concept | `eec-respuesta-protectora-no-es-miedo` | `eec-alarma-antes-del-relato` | `eec-alarma-antes-del-relato` | `JUSTIFIED_CHANGE` — el handoff es posterior y más técnico, y la instrucción de esta fase conserva explícitamente las claves de concepto. |
| Step 3 | `recordar-respuesta-protectora-y-miedo` | `recordar-alarma-antes-del-relato` | `recordar-alarma-antes-del-relato` | `JUSTIFIED_CHANGE` — misma razón; el paso sigue la identidad de la guía. |
| Practice | `eec-c1-practice-ordenar-alarma-y-relato` | idéntica | idéntica | `MATCH` |

### Decisiones que no se degradaron

Escenario cotidiano y de baja intensidad · no se pide trauma ni emoción intensa ·
se distingue respuesta protectora de miedo consciente · la amígdala no aparece
como botón del miedo · la secuencia se declara pedagógica, no cronología neural ·
existe «ver la secuencia resuelta» · se continúa sin penalización · la respuesta
correcta vive solo en el servidor.

---

## 3. MG01 — las teorías como lentes

**Tesis conservada:** las teorías son lentes o mapas orientados a preguntas
distintas.

**Corrección aplicada.** El ejemplo decía que dos mapas «no se contradicen».
Como afirmación general es falsa: hay teorías de la emoción que sostienen cosas
incompatibles. El ejemplo ahora dice que los mapas **enfocan aspectos distintos**
y añade explícitamente que eso «no las vuelve equivalentes ni automáticamente
compatibles», y que la discusión sigue abierta.

**Práctica** (`belief_lens`): separa una creencia de uso común en qué se observa,
qué se supone y qué contexto falta — algo que leer el capítulo no hace por ti.
Texto libre opcional, local, sin efecto sobre la finalización.

**Prudencia científica:** ninguna teoría se declara ganadora; el capítulo es un
mapa crítico y la microguía lo respeta.

---

## 4. MG02 — el rostro como pista

**Tesis conservada:** una expresión es una pista, no un diccionario.

**Corrección aplicada.** La práctica pedía solo ordenar interpretaciones por
plausibilidad, lo que se acerca al relativismo. Ahora separa cuatro cosas
distintas: **observación visible**, **contexto disponible**, **interpretaciones
plausibles** e **información faltante**. La copy dice de forma explícita que
varias lecturas posibles no son igual de probables.

**Accesibilidad:** existe alternativa sin arrastrar — clasificar cada lectura
como más plausible, posible o falta información.

---

## 5. MG04 — informa, no manda

**Tesis única conservada:** la emoción informa y orienta; no dicta ni garantiza
la conducta.

**Corrección aplicada.** El pasaje presentaba a Goleman y Damasio como dos
lecciones pegadas. Ahora se declaran como **dos ángulos de la misma idea**:
Goleman sobre reconocer / expresar / actuar, Damasio sobre señales que marcan
relevancia sin decidir. La escena de concepto sostiene una sola tesis y nombra
el «espacio» entre impulso y elección, que es lo que la práctica hace visible.

**Práctica** (`four_part_distinction`): cuatro campos sobre un escenario leve y
predeterminado. La copy declara que lo elegido no es diagnóstico ni
recomendación de conducta.

---

## 6. MG05 — construida no significa falsa

**Tesis conservada:** señales reales, contexto y aprendizaje, experiencia real,
no elegida a voluntad; el construccionismo es el mapa principal del libro, no un
consenso cerrado — dicho literalmente en la escena de concepto.

**Corrección aplicada.** El ejemplo entrevista / primera cita decía «lo que
cuentas sobre ellas», lo que sugiere que solo el relato verbal construye la
emoción. Ahora enumera lo que participa: **la situación, el aprendizaje previo,
los recuerdos y los conceptos** con los que se reconoce la experiencia. La
escena de concepto añade percepción y memoria junto a señales y contexto.

**Práctica** (`signal_context_compare`): identificar qué información cambia el
significado — situación, aprendizaje, expectativa, recuerdos, información nueva.

---

## 7. Contraste con `unit-payload.json`

Cada ancla se verificó contra la unidad publicada: heading exacto y huella con
**exactamente una** coincidencia en la unidad del capítulo, comprobado por
`plan` y por el pg-spec del vertical. Ninguna microguía cita texto extenso del
libro: la escena `PASSAGE` referencia el ancla y el lector resuelve el pasaje
desde la revisión canónica.

Ninguna repite otro capítulo: MG01–MG05 se apoyan en cinco secciones distintas
de C01 (lentes, Ekman, LeDoux, Goleman + Damasio, Barrett).
