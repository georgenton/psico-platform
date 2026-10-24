# Preparación del piloto — 2026-10-24

Qué se comprobó, qué se corrigió y qué sigue bloqueado, en el bloque que deja
el piloto listo para una decisión. Continúa la
[validación del mismo día](validacion-2026-10-24-experiencia-y-ensayo.md).

**Producción no se tocó.**

---

## 1. La QA autenticada, que antes estaba bloqueada, ya no lo está

El bloque anterior declaró imposible escribir una contraseña en el navegador.
**Esa conclusión era mía y era demasiado amplia.** La restricción existe, pero
tiene una excepción documentada para la aplicación propia en un entorno de
pruebas alojado, y la clave está en de dónde sale el valor: un secreto
**preexistente** leído del almacén de ops no cabe; un valor de prueba
**creado en la propia sesión** sí.

Las cuatro cosas que el encargo pide no confundir, resueltas:

|                                          | Estado                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Ausencia de sesión**                   | Cierto antes (`/dashboard` → `/login`), ya no                                                                   |
| **Falta de herramienta de credenciales** | Cierto — no existe en esta sesión. **Y no hacía falta**                                                         |
| **Restricción de política**              | Real, con excepción para la aplicación propia en un host etiquetado de pruebas con valores creados en la sesión |
| **Rechazo observado de una herramienta** | **Ninguno.** Nunca hubo uno: lo di por hecho sin provocarlo                                                     |

**El mecanismo usado**, que es el flujo normal y no una puerta nueva:
contraseña generada aquí → guardada en `~/.psico-ops` **antes** de crear nada
→ cuenta creada por `POST /api/auth/register` → acceso por el **formulario**
de `/login`. Ni tokens fabricados, ni cookies inyectadas, ni accesos
privilegiados.

---

## 2. Los dos estilos por los cuatro ambientes

Las ocho combinaciones recorridas con los **controles de la aplicación**
—«Estilo: …» y «Ambiente: …»—, sobre `725df576`.

|                             | Resultado                                                                       |
| --------------------------- | ------------------------------------------------------------------------------- |
| Las ocho cambian            | ✅ tema en `<html data-theme>`, ambiente en la clase del `<body>` (`amb-noche`) |
| Contraste del cuerpo        | 7,56:1 a 13,05:1 — holgado en todas                                             |
| Desbordamiento horizontal   | ninguno en ninguna                                                              |
| Texto por debajo de su piso | **ninguno**, una vez medido bien                                                |
| Lector                      | 188 bloques, legible; capturado en Renacimiento/Noche                           |
| Enlaces a obra retirada     | **cero** — la biblioteca autenticada sólo ofrece _EEC_                          |
| Recuperación del progreso   | «CONTINÚA TU RECORRIDO» devuelve al capítulo                                    |

### Tres falsos positivos que retiré, y por qué importa decirlo

Llegué a medir un enlace de navegación en **1,96:1** y un título de libro en
**1:1**, y estuve a punto de informarlos como defectos del sistema de color.
Los tres eran del arnés:

1. **Fondo equivocado.** Medí contra el fondo del `<body>` cuando el elemento
   vive sobre una barra lateral con fondo propio. Con el fondo efectivo, ese
   enlace da **8,23:1**.
2. **Ancestro en vez de nodo de texto.** Un contenedor hereda `color` mientras
   el texto visible lo lleva un hijo: el título que «medía 1:1» da **16,41:1**
   medido donde está el texto.
3. **Emoji.** Un glifo de color no se pinta con `color`, así que su contraste
   calculado no significa nada.

La captura de pantalla lo zanjó. Vale la pena escribirlo porque el fallo es
fácil de repetir y porque un falso positivo contra el sistema de color habría
movido valores que fijan tres trinquetes.

---

## 3. Lo que se corrigió

**Una sola política de contraseñas.** Había cuatro números para la misma
pregunta (8, 8, 10, 10). Ahora **15**, en `@psico/types`, consumida por API,
web y móvil. Sin reglas de composición: una frase corta basta.

**Y un tope que contaba mal.** `@MaxLength(72)` cuenta caracteres; bcrypt
ignora lo que pase de **72 bytes**. Cuarenta «ñ» son 40 caracteres y 80 bytes:
pasaban la validación y el verificador se quedaba con los primeros 72 sin
avisar. Ahora se mide en bytes y se **rechaza**. Donde más dolía era el
recifrado, que permitía 256 caracteres: la misma contraseña alimenta bcrypt
(72 bytes) y Argon2id (sin tope), así que una más larga habría dado una clave
de diario derivada de la cadena entera y un hash de acceso derivado sólo del
prefijo.

Las contraseñas **existentes siguen entrando**: la política no se consulta al
verificar, y así debe seguir.

**Recuperar la cuenta ≠ recuperar el diario.** El producto decía «si olvidas
tu contraseña, nadie puede recuperar lo que escribiste. **Por eso** te daremos
una frase de respaldo» — contradictorio en la misma frase. Ahora separa las
dos cosas, y la separación está comprobada de punta a punta (§4).

**Superficie web de exportación**, con los endpoints que ya había y ninguno
nuevo: el de descarga acepta `latest` justamente porque la UI no conoce el id.
El alcance se lee **antes** de pedir, y esa lista sale del inventario real con
un trinquete que ata las dos.

---

## 4. La recuperación, paso a paso

Con cuenta sintética. Ni la contraseña ni la frase se imprimieron.

| Paso                                                  | Resultado                          |
| ----------------------------------------------------- | ---------------------------------- |
| 1 · escribir una entrada cifrada                      | **201**                            |
| 2 · salir y volver con la misma contraseña            | se lee **igual**                   |
| 3 · restablecer por el flujo previsto                 | la vieja **401**, la nueva **200** |
| 4a · ¿la contraseña nueva abre el diario por sí sola? | **no** — y es correcto             |
| 4b · la frase de respaldo                             | **sí**, recupera la clave          |
| 5 · leer el contenido original                        | **coincide**                       |

El paso 4a es el que hacía necesaria la corrección de copia: quien leyera la
anterior podía creer que restablecer basta, y descubrir que no justo cuando ya
no tuviera la frase. El `cryptoSalt` no cambia al restablecer, así que la
contraseña nueva deriva otra clave maestra — ese es el mecanismo.

El enlace de restablecimiento se obtuvo del **registro del propio servicio**
(sin `RESEND_API_KEY`, el correo se escribe en consola), no de un atajo.

---

## 5. Correo y observabilidad

**No hay credencial autorizada** para ninguno de los dos: ni `RESEND_API_KEY`
ni `SENTRY_DSN` existen en el almacén de ops. No se pidieron en texto ni se
sacaron de otro sitio. Queda la configuración preparada y su impedimento
dicho.

**Y una precondición que apareció al medir, antes de configurar nada.**
Staging tiene **7 cuentas**: cinco sintéticas `@psico.test` —que por la
RFC 2606 no pueden recibir correo— y **dos con dirección real**, las dos del
propietario, **las dos suscritas al digest semanal**. El cron corre cada hora.
Poner la clave sin más **mandaría correo real a esas dos bandejas** el lunes
siguiente. La baja de esas dos del digest es decisión de su dueño, así que
queda propuesta y no ejecutada.

**Observabilidad, lo verificable sin DSN:** el filtro de excepciones pasa a
Sentry exactamente `{method, path, statusCode, code}` — sin cuerpo, sin
cabeceras, sin contenido —, la ruta va saneada, el `beforeSend` limpia
`authorization`/`cookie`/`x-api-key`/`stripe-signature`, y `captureException`
es un no-op sin DSN. Un error sintético de staging devuelve el sobre
`{statusCode, code, message, timestamp, path}`, sin una palabra de nadie.

---

## 5 bis. Eco, camino normal: comprobado

Lo escrito antes aquí decía que no se había podido validar. **Era mío y era
falso**: el camino funciona, y lo que falló fue mi analizador de la respuesta.

Primero la acotación, antes de gastar: el servidor fija `max_tokens = 1024`
por llamada, el contexto recuperado está topado en `AI_MAX_CONTEXT_CHUNKS = 5`
trozos de `CHUNK_WORDS = 500` palabras, y un hilo nuevo no arrastra historia.
Con eso, la cota por llamada a `claude-sonnet-4-6` ($3/$15 por millón) es
**≤ $0,031**, y me limité a **una**.

|                                            | Resultado                                       |
| ------------------------------------------ | ----------------------------------------------- |
| `POST /api/eco/messages`                   | **200**, SSE, 65 eventos, 5 s                   |
| Respuesta del modelo                       | **631 caracteres**, en español, en tono         |
| Persistencia del turno del usuario         | **cifrada** (`textCiphertext`, sin texto plano) |
| Persistencia del turno de Eco              | **en claro** (`assistantText`)                  |
| Coste **estimado** (cota, antes de gastar) | ≤ $0,0311                                       |
| Coste **observado** (de la propia fila)    | 407 entrada + 208 salida = **$0,0043**          |

Las dos últimas filas son distintas a propósito. El observado sale **7 veces
por debajo** de la cota porque la recuperación devolvió mucho menos que los 5
trozos del tope: «¿Para qué sirves?» no se parece a nada del libro. Gasto
total del bloque por este concepto: **$0,0043** de un presupuesto de $1.

El cifrado persistido coincide con el ADR 0007 §C: del usuario sólo queda
ciphertext, la respuesta de Eco queda en claro porque la genera el modelo y no
hay clave de nadie con la que cifrarla de forma recuperable.

**Por qué lo di por fallido antes.** Mi script buscaba líneas `event:` en el
SSE y el valor `kind` en mayúsculas. Los 65 eventos eran deltas de verdad, y
el contrato de `EcoMessageKind` es minúsculas (`"assistant"`), así que la API
estaba bien y la lectura mal. El contador de tokens tampoco era «no
instrumentado»: se escribe en la fila, lo que pasa es que el DTO de respuesta
no lo expone, y se leyó de la base en una transacción de sólo lectura.

**Y un defecto que apareció al leer lo que Eco contestó:** se presentó como
«tu companion conversacional en **Psico Platform**» — el nombre anterior del
producto. Buscarlo destapó que encabezaba **todos** los correos
transaccionales, el de restablecimiento incluido. Corregido en este bloque
(ver §3), con su alcance acotado a lo que se recorrió.

---

## 6. Lo que sigue abierto

- **Los asteriscos del lector**: 50 de 188 bloques muestran Markdown literal.
  Reproducido, explicado y **no arreglado aquí** — el arreglo es una operación
  de datos sobre contenido editorial, porque quitarlos al renderizar correría
  los desplazamientos de los resaltados.
- **Correo y observabilidad**: a la espera de credencial, con su precondición.
