# FeelVerse · Círculos — entrega a Claude Design

**Qué es esto.** El inventario de lo que existe y funciona hoy en Dúo y
Círculos adultos, para diseñar **sobre** ello. No es una propuesta visual y no
pide reconstruir nada.

**Versión descrita:** `d6ff909449b99357ab86ebc1fae7825b250f1b7e` en `main`,
desplegada en producción el 17 de septiembre de 2026 (API, worker y Web).
Alcance real: `CIRCLES_ROLLOUT_MODE=pilot`, `CIRCLES_GROUPS=on`, una sola
cuenta admitida. **No es acceso público.**

---

## 1 · Qué corregir de los briefs antes de diseñar

Los tres documentos de Notion siguen siendo la dirección. Estas referencias
funcionales suyas ya no describen el producto:

| El brief dice                                                              | Hoy                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «No aparece una sección Círculos en el HTML recuperado» (auditoría, 9 sep) | Círculos existe en el dashboard, con listado, creación y sala. Sigue **sin** existir en la landing pública.                                                                                                                                                           |
| «Dúo adulto ya está implementado» (15 sep)                                 | Además existen **Círculos adultos de 3 a 6** con incorporación flexible.                                                                                                                                                                                              |
| «El listado `/dashboard/circulos` no lleva a ninguna parte» (runbook)      | Resuelto: el listado ofrece «Empezar este círculo». La entrada del Dúo sigue viviendo en la superficie de lectura, a propósito.                                                                                                                                       |
| Tres zonas «Mi espacio / La mesa / Nuestro espacio»                        | El modelo mental es correcto pero **no es el vocabulario del producto**. Lo implementado son etapas: preparación privada → preview → envío → revelación → acuerdo → seguimiento. Diseñar sobre las etapas reales, o proponer el cambio de vocabulario explícitamente. |
| «74 % de comprensión emocional», radar, porcentajes globales               | Ya retirados del producto. No reintroducir.                                                                                                                                                                                                                           |

Los hallazgos de contraste de la auditoría (`sage-400` en el botón principal,
`warm-400` sobre blanco, lavanda sobre blanco) **siguen vigentes** y no se han
corregido: son de la landing pública, que este trabajo no tocó.

---

## 2 · Rutas reales

| Ruta                                      | Quién entra            | Qué es                                                                                                       |
| ----------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/dashboard/circulos`                     | miembro                | Listado de lo publicado. Ofrece «Empezar este círculo».                                                      |
| `/dashboard/circulos/nuevo/[templateKey]` | miembro                | Presentación + creación. Para grupo, selector de tamaño **3–6**.                                             |
| `/dashboard/circulos/[circleId]`          | miembro                | El círculo y sus enlaces de invitación.                                                                      |
| `/compartir/[activityId]`                 | miembro **e** invitado | **La sala.** Todas las etapas viven aquí.                                                                    |
| `/i#<secreto>`                            | invitado sin cuenta    | Entrada por invitación. El secreto viaja en el fragmento y se borra de la barra antes de cualquier petición. |
| `/dashboard/exploraciones/[...]`          | miembro                | Superficie de lectura; desde aquí nace el Dúo.                                                               |
| `/dashboard/admin/circulos`               | admin                  | Back-office.                                                                                                 |

---

## 3 · Componentes

Todos en `apps/web/src/components/circulos/`.

| Componente                     | Papel                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `DuoEntryPoint`                | Ofrecer el Dúo desde la lectura.                                                                                                           |
| `CrearCirculo`                 | Crear; para grupo incluye el selector de tamaño.                                                                                           |
| `CompartirInvitacion`          | **Un enlace por persona**, con WhatsApp, correo, compartir del dispositivo y copiar. Abrir un canal **no** marca la invitación como usada. |
| `EntradaInvitacion`            | Ver qué es la invitación y decidir. Alias opcional.                                                                                        |
| `SalaDuo`                      | La sala. Orquesta todas las etapas y es dueña del borrador.                                                                                |
| `ContinuarConQuienesAceptaron` | Fijar el grupo definitivo (sólo quien organiza).                                                                                           |
| `PreparacionPrivada`           | Una pregunta por pantalla y la elección de qué compartir.                                                                                  |
| `PreviewCompartir`             | Exactamente lo que se enviará, antes de enviarlo.                                                                                          |
| `Reveal`                       | Lo que compartió cada quien, simultáneo.                                                                                                   |
| `Artefacto`                    | Propuesta y confirmación por versión exacta.                                                                                               |
| `Seguimiento`                  | Cómo siguen.                                                                                                                               |
| `AyudaEcho`, `OpinionOpcional` | Ayuda por pregunta; opinión opcional al final.                                                                                             |

---

## 4 · Los estados reales de pantalla

Los que hay que diseñar. Ninguno es hipotético.

### Invitación (`/i`)

1. **Mirando** — se inspecciona el enlace sin gastarlo.
2. **Decidir** — qué actividad es, cuánto dura, quién invita, cuántas personas. Alias opcional si es grupo. «Aceptar invitación» / «Ahora no».
3. **Nombre corregible** — el alias no pasa el formato: se explica, **se conserva lo escrito** y el enlace sigue sirviendo. Nunca «caducado».
4. **Aceptando** · 5. **Enlace que ya no sirve** — una sola frase, sin decir por qué.

### Incorporación (grupo, en la sala)

6. **Abierta** — «Pueden participar hasta N. Por ahora están dentro M», la lista de quiénes están, las invitaciones pendientes como «Invitación N», y la invitación a ir preparando.
7. **Preparar sí, enviar todavía no** — el preview funciona, «Confirmar y enviar» no se ofrece: aún no hay destinatarios.
8. **Fijar el grupo** — sólo quien organiza, desde dos personas.
9. **Cerrada** — el grupo queda; los asientos que nadie tomó **desaparecen**; los enlaces sobrantes dejan de servir.

### Preparación y envío

10. **Consentimiento** — «Entiendo, empezar».
11. **Preparación privada** — una pregunta por pantalla. Nada sale del dispositivo. Cerrar la pestaña pierde el borrador, y la pantalla lo dice.
12. **Elegir qué compartir** — por respuesta, resumen propio, o no compartir.
13. **Preview** — exactamente lo que verá la otra gente.
14. **Enviando…** — el botón lo dice y queda deshabilitado.
15. **Enviado / esperando** — «**Tu parte ya quedó enviada.** No necesitas volver a enviarla. Lo compartido se abrirá cuando … hayan enviado su parte.» Más: no hace falta dejar la página abierta. **Aparece con el acuse del servidor, no con la siguiente lectura.**
16. **Enviado pero la sala no se pudo actualizar** — se conserva el acuse y se dice que falta refrescar. Nunca se presenta como envío fallido.
17. **Envío fallido** — error visible, **borrador intacto**, se puede reintentar la misma intención.

### Revelación y después

18. **Revelación** — simultánea. Cada respuesta con el asiento del que vino, o el alias si lo eligieron.
19. **Artefacto propuesto** — «N de M lo confirmaron», donde **M es el grupo**, no la capacidad.
20. **Acuerdo** · 21. **Nueva versión** — proponer otra redacción crea una versión y **no arrastra** confirmaciones.
21. **Seguimiento** — «¿Cómo siguen?», decisión por persona, se cierra con las del grupo.

### Salidas

23. **No compartir en un Dúo** — la otra persona sabe que terminaste; la actividad sigue.
24. **No compartir en un grupo (incluido el reducido a dos)** — termina para todas, lo de las demás se descarta sin abrirse, **no se dice quién lo eligió**.
25. **Retirarse** · 26. **Cerrada** — al terminar, la lista de quiénes estaban **desaparece**: una salida privada no debe dejar una lista de sospechosos.
26. **Error de sala** — un solo rechazo, sin filtrar la causa.

---

## 5 · Lo que el siguiente trabajo visual debe hacer

- Recuperar coherencia con el proyecto original de Claude Design.
- Revisar FeelVerse **progresivamente**, empezando por **Círculos y los
  componentes comunes**.
- Proponer **Renacimiento humano** como tema adicional compatible con los modos
  **enfoque, energético, tranquilo y noche** que ya existen en la hoja global.
- **Reutilizar tokens y componentes.** No duplicar cada pantalla por tema.
- Conservar la claridad del consentimiento, los estados de envío y la
  accesibilidad.
- Estética editorial cálida y contenida, según el brief maestro.

### Lo que no debe cambiar sin decidirlo explícitamente

- **El secreto de la invitación viaja en el fragmento** y se borra de la barra
  antes de cualquier petición. Ningún diseño puede ponerlo en una URL visible,
  en un `title` ni en una captura.
- **Mirar no es aceptar.** Abrir un enlace, o un canal para compartirlo, no
  consume la invitación.
- **Nada sale del dispositivo antes de confirmar.** No hay autoguardado, y la
  pantalla promete eso.
- **El acuse del envío es del servidor.** No inventar un estado optimista: si
  el envío no se confirmó, no se muestra como recibido.
- **La revelación es simultánea** y exige el grupo definitivo.
- **Una salida privada no nombra a nadie.**
- Cuatro números distintos: **capacidad**, **aceptadas**, **grupo** y
  **confirmaciones**. No reutilizar un campo con significados incompatibles
  según la pantalla.

### Intensidad sugerida por superficie

Landing expresiva · sala **contenida** · preparación y lectura casi invisibles
· **consentimiento y envío: mínima decoración, máxima claridad**. Las
explicaciones esenciales van en el cuerpo, no sólo en un icono o en una región
para lectores de pantalla.

---

## 6 · Lo que este documento no dice

No hay aquí una recomendación de color, tipografía ni retícula: eso es el
trabajo que viene. Tampoco hay datos de personas: los ejemplos del recorrido
alojado son sintéticos. Familia, grupos con menores y Eco Facilitador **no
existen** y no deben dibujarse como disponibles.
