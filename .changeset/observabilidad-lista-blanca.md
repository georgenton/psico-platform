---
"@psico/types": minor
---

La observabilidad de errores pasa de redactar a reconstruir.

`@psico/types/observability` (también desde la raíz del paquete) lleva ahora la
**lista blanca** de lo que puede salir hacia un colector de errores:
`safeEvent` y `safeEnvelope` rehacen el evento y su sobre desde campos
enumerados, `guardTransport` envuelve el transporte de cualquier cliente para que
sólo salgan errores, y `nodeFrames` comprueba cada marco contra los ficheros del
despliegue. La comparten la API, el worker, los tres procesos de Web y el móvil.

Se retiran `sanitizeSentryEvent`, `sanitizeBreadcrumb`, `scrubUrl`,
`redactHeaders` y `REDACTED`. Borraban lo conocido: contra un receptor local, el
binario anterior mandaba las transacciones enteras, la IP y los argumentos de una
consulta dentro del mensaje de un error. `SENSITIVE_HEADERS` se conserva para los
diagnósticos de texto.

Es una entrada nueva del paquete y no sólo una exportación más: importarla desde
la raíz arrastraba los catálogos al middleware.
