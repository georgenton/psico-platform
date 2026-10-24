# Piloto mínimo — propuesta para revisión

**Fecha:** 2026-10-24 · **Estado:** propuesta, **no** una autorización.
Preparada sobre lo que el entorno de staging hace hoy, medido en
[la validación del 24-10](../informes/validacion-2026-10-24-experiencia-y-ensayo.md)
y [la UAT del 23-10](../informes/uat-2026-10-23-cierre-staging.md).

Nada de este documento abre rollout, publica contenido ni activa cobros. Son
decisiones que hay que tomar **una por una**, y aquí quedan concretas para que
se puedan revisar.

---

## 1. Qué incluiría

Un piloto **de lectura acompañada**, con una obra, en staging, con personas
invitadas de una en una.

| Recorrido | Por qué entra |
| --- | --- |
| **Registro y acceso** | Comprobado por API y por formulario. Nada lo bloquea: ningún guard exige el correo verificado, así que el alta funciona aunque el correo de verificación no salga. |
| **Lectura de *Emociones en construcción*** | Los diez capítulos están ingeridos; el cap. 1 tiene 188 bloques reales agrupados en sus tres partes. |
| **Progreso: salir y volver** | Verificado de extremo a extremo: el latido guarda y el progreso persiste entre sesiones. |
| **Marcas y notas** | Resaltar y anotar funcionan, y mueven Evolución exactamente en 1 sin tocar el mapa emocional. |
| **Diario cifrado** | El cifrado E2E está cerrado desde los sprints S21–S23, con rotación de contraseña y frase de recuperación. |
| **Mapa Emocional** | Honesto por construcción: sin datos dice «Reuniendo datos» en vez de inventar un 50 %. |
| **Mi Evolución** | Contadores reales, verificados con aislamiento entre cuentas. |
| **Exportar mis datos** | El recorrido funciona de principio a fin, con su alcance declarado (ver §4). |

---

## 2. Qué quedaría fuera, y por qué

| Recorrido | Motivo |
| --- | --- |
| **Modo guiado** | Decisión **editorial** más decisión de **rollout**. Ver §5. |
| **Dúo / Círculos** | Su propia puerta de rollout, que este piloto no necesita abrir. |
| **Cobros** | Cerrados por decisión. Los importes de la landing siguen marcados como propuesta y no hay pasarela. D-ORD operativo y comercial sigue abierto. |
| **Voz** | Depende de cuota Pro, y Pro no se vende en el piloto. Técnicamente vivo (`OPENAI_API_KEY` presente); fuera por alcance, no por avería. |
| **Terapia** | Detrás de su flag, v2. |
| **Móvil** | El piloto se camina en web. La app existe, pero su propia validación es otro frente. |
| **Producción** | No desplegada en Coolify. El piloto vive en staging. |

---

## 3. Integraciones, por recorrido

**No todas las credenciales ausentes bloquean lo mismo.** Esto es lo que cada
una habilita, y qué recorrido se queda corto sin ella:

| Integración | Estado en staging | Qué recorrido necesita |
| --- | --- | --- |
| `DATABASE_URL`, `REDIS_URL` | ✅ presentes | **Todo.** Imprescindibles. |
| Cuarteto de **R2** | ✅ presentes | Exportación (el archivo vive ahí) y medios del lector. |
| `ANTHROPIC_API_KEY` | ✅ presente | Conversación con Eco y la narrativa del Mapa. |
| `OPENAI_API_KEY` | ✅ presente | Voz. Fuera del alcance del piloto. |
| `STRIPE_*` (5 claves) | ✅ presentes, **modo test** | Nada en este piloto: los cobros están cerrados. |
| **`RESEND_API_KEY`** | ❌ ausente | **Recuperar contraseña** (sin esto, quien la olvide queda fuera y hay que crearle otra cuenta), el **digest semanal** y el aviso de **exportación lista**. **No** bloquea registro, lectura, diario ni mapa. |
| `GOOGLE_CLIENT_ID` | ❌ ausente, **y bien resuelto** | **Sólo** «Acceder con Google». Comprobado en el navegador: sin la clave pública, ni `/login` ni `/register` muestran el botón, ni el separador, ni la palabra «Google». El producto **no ofrece lo que no puede cumplir**, así que esto no es una decisión del piloto. |
| `VAPID_*` | ❌ ausentes | **Sólo** push web. El conmutador avisa de que falta configurar. |
| `SENTRY_DSN` | ❌ ausente | Ningún recorrido del usuario. Lo que se pierde es **nuestra** traza de errores: sin esto, un fallo del piloto se investiga reproduciéndolo. |

**Imprescindibles para el alcance propuesto:** base, Redis, R2 y
`ANTHROPIC_API_KEY` — ya están. **Muy recomendable:** `RESEND_API_KEY`, por la
recuperación de contraseña, que es la diferencia entre perder a una persona del
piloto y no perderla. **Recomendable:** `SENTRY_DSN`, para no depender de que
el fallo se repita delante de nosotros.

---

## 4. Cuatro cosas que no hay que confundir

El estado real de cada una, con la mitad comprobada y la mitad pendiente
separadas:

| Frente | Comprobado | Pendiente |
| --- | --- | --- |
| **Eco** | El **error controlado**: llega por SSE, sin `delta`, sin llamar al modelo, y los hilos quedan intactos. | La **conversación normal**. No se ensayó a propósito: habría sido una llamada facturable al modelo para conseguir un PASS. Se ensaya con la primera persona del piloto, o con una llamada autorizada expresamente. |
| **Retención** | El **planificador**: los dos crons corrieron a su hora y evaluaron el filtro por huso. | La **entrega completa**. Corrieron con `candidates=0`, así que nadie recibió nada. Sin `RESEND_API_KEY` el correo del digest no sale; el push sí podría, con `VAPID_*`. |
| **Exportación** | El **recorrido completo**, worker incluido: 202 → `READY` en 1,17 s → URL firmada de R2 → 2 837 bytes con sus diez secciones, sin cifrado ni credenciales, y la ajena en 404. | Su **alcance**: el archivo trae ocho secciones de contenido y **nombra** lo que no trae (diario, Eco, ánimo, check-ins, resonancias, marcas, accesos). Hay además material que ni viaja ni se nombra uno a uno, inventariado en `data-export-inventory.ts` bajo **D-EXP**. Y no hay **superficie en la web**: hoy se pide y se descarga por API. |
| **Modo guiado** | Que el **contenido existe**: cinco microguías de C01 declaradas en el catálogo de Guide. | Tres cosas distintas: la **aprobación editorial** (puerta de los ADR 0027/0028), la **disponibilidad efectiva** (`GUIDE_ROLLOUT_MODE=off`, sin allowlist) y la **UAT de ejecución**, que no se ha hecho porque no hay por dónde ejecutarla. |

---

## 5. Decisiones que de verdad hacen falta

Concretas y revisables una por una. Ninguna se infiere de este cierre.

1. **¿Se configura `RESEND_API_KEY` en staging?** Sin ella no sale el correo
   de restablecimiento, así que **no hay forma de recuperar el acceso** a una
   cuenta cuya contraseña se olvidó. *Alternativa si no:* decírselo a cada
   persona antes de empezar, para que conserve la contraseña. Crear otra
   cuenta **no es recuperar la anterior**: el diario de la primera sigue
   donde estaba, cifrado, y la cuenta nueva empieza vacía.
2. **¿Se configura `SENTRY_DSN`?** Decide si un fallo del piloto se investiga
   con traza o por reproducción.
3. **¿Se publica alguna microguía de C01?** Es editorial, con la puerta de los
   ADR 0027/0028, y **no** la abre este documento. Mientras no se publique, el
   copy actual de la landing («el modo guiado está en preparación») es exacto y
   se conserva.
4. **¿Se abre `GUIDE_ROLLOUT_MODE` a una allowlist?** Sólo tiene sentido
   **después** de la decisión 3: abrir el rollout sin contenido publicado no
   hace ejecutable nada.
5. **¿Se añade superficie web a la exportación?** Decide si una persona del
   piloto puede ejercer el derecho sin que nosotros intervengamos.
6. **¿Se sube el mínimo del registro de 8 a 10 caracteres**, o se baja el del
   re-cifrado de 10 a 8? Hoy el producto cuenta dos reglas y no explica el
   salto. Las dos salidas son defendibles; la incoherencia no.

---

## 6. Criterios

### De entrada

- `main` y los artefactos servidos **identificados por separado**, con la
  diferencia explicada (hoy: `439f5d32` vs `725df576`, sin código de runtime
  entre medias).
- `GET /api/health/ready` conforme. Así se ve conforme, medido el 2026-10-24:
  `{"ready":true,"reason":"ok","pending":[],"failed":[],"shippedCount":71,"appliedCount":71}`
  — las dos cuentas iguales es lo que importa. (El simple vive en `/health`,
  fuera del prefijo; `/api/health` responde 404 por diseño desde el Sprint 0.A.)
- Las decisiones 1 y 2 del §5 **tomadas**, en un sentido o en otro.
- Una **persona a la vez**, avisada de que es staging y de que recuperar la
  **cuenta** y recuperar el **diario** son dos cosas distintas: la cuenta
  vuelve con el correo de restablecimiento, y el diario sólo con su **frase de
  respaldo de 12 palabras**, que conviene guardar al crearla.
- Cuenta creada por **registro normal**, nunca sembrada.

### De salida (el piloto cumplió)

- La persona **lee un capítulo completo**, sale y vuelve, y el progreso está
  donde lo dejó.
- **Marca o anota** algo y lo encuentra después.
- **Escribe en el diario**, cierra sesión, vuelve y lo descifra.
- **Conversa con Eco** una vez, y la respuesta es pertinente y no suplanta a
  nadie — lo que cierra la mitad que hoy queda pendiente.
- Ve su **Mapa** y su **Evolución** sin que ninguna cifra la sorprenda.
- Ningún P0 ni P1 abierto de su recorrido.

### De suspensión (se para y se corrige)

- Cualquier **pérdida o corrupción** de lo que la persona escribió.
- Cualquier aparición de **texto del diario** fuera del cliente — registro,
  respuesta de API o correo.
- Un **cobro** de cualquier importe.
- Una **crisis** mal atendida: el modal que no aparece, o el número que no se
  puede marcar.
- Una obra retirada que **vuelva a servirse**.
- Dos personas que **vean datos de la otra**.
- `GET /api/health/ready` **no conforme** en mitad del piloto.
