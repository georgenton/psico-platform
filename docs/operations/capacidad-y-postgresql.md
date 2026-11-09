# Capacidad y PostgreSQL — OVH · Coolify

> **Corte: 2026-11-07.** Todo lo que aquí se llama «medido» se midió ese día
> contra el entorno real de staging en OVH, con los artefactos servidos en ese
> momento y con identidades QA sintéticas. Lo que no se midió lleva su etiqueta.
>
> Este documento resuelve dos cosas como **trabajo técnico delegado**: qué
> variante de PostgreSQL se usa y por qué, y cuánta capacidad hace falta. Ni la
> elección de versión ni las mediciones son decisiones que haya que consultar.

---

## 1 · La variante de PostgreSQL: decidida, y ya era la correcta

**Decisión: se conserva `pgvector/pgvector:pg18`, fijada por digest**
`sha256:2ba9ca5f2e7daa0f0e7723cba1ee9167bab54efd3640516a44ac1a928dd67e7a`.

No es una elección nueva: es la que ya corre, y la comprobación la confirma
como reproducible. Lo que se hizo fue verificarla, no cambiarla — y el motivo
para escribirlo es que **el pin está haciendo trabajo real**, lo cual no se
sabía hasta medirlo:

| Comprobación                                                | Resultado                                          |
| ----------------------------------------------------------- | -------------------------------------------------- |
| Qué guarda Coolify para `feelverse-staging-postgres`        | la imagen **con digest**, no una etiqueta flotante |
| ¿Sigue disponible ese digest para reconstruir en otra caja? | **HTTP 200** en el registro de Docker Hub          |
| ¿A qué apunta hoy la etiqueta flotante `pg18`?              | a **otro** digest, `sha256:c29f3068…`              |
| Versión efectiva en marcha                                  | **PostgreSQL 18.6** (Debian 18.6-1.pgdg12+2)       |
| Extensiones                                                 | `plpgsql 1.0`, **`vector 0.8.6`**                  |
| Migraciones                                                 | **71/71**, `pending` y `failed` vacíos             |
| En marcha sin reinicios                                     | 37 días                                            |

La tercera fila es la que importa. Si el recurso usara `pgvector/pgvector:pg18`
a secas —como hacen `drillops-*`, `syntavera-*` y `voces-postgres`—, una
reconstrucción hoy traería una imagen **distinta** de la que lleva 37 días
sirviendo estos datos. Con el pin, la caja nueva del nivel 4 obtiene la misma.

**Lo que esto NO dice.** Que el digest sea pullable hoy no garantiza que lo sea
dentro de un año: Docker Hub no promete retención indefinida de imágenes no
etiquetadas. Para el nivel 4 esto es un supuesto con fecha, y la mitigación
—copiar la imagen a un registro propio— está en §5 como pendiente, no como
hecho.

**Sin configuración propia.** `postgres_conf` es nulo en Coolify: la instancia
corre con los valores por defecto de la imagen. Medidos:

| Ajuste                 | Valor efectivo |
| ---------------------- | -------------- |
| `max_connections`      | 100            |
| `shared_buffers`       | 128 MB         |
| `work_mem`             | 4 MB           |
| `maintenance_work_mem` | 64 MB          |
| `effective_cache_size` | 4 GB           |
| `max_wal_size`         | 1 GB           |
| `autovacuum`           | on             |

`effective_cache_size` de 4 GB es el valor por defecto de la imagen y **no
describe esta caja**: el contenedor tiene 1 GiB de límite. Es una estimación
que el planificador usa para decidir entre índice y recorrido secuencial, así
que un valor demasiado alto puede inclinarlo a confiar en caché que no existe.
Con 23 MB de base entera y 99,99 % de acierto de caché, hoy no tiene
consecuencia observable. Entra en §5 como algo que ajustar **si** se observa,
no como una corrección a aplicar a ciegas.

---

## 2 · Medido

### 2.1 En reposo

| Qué                            | Valor                                   |
| ------------------------------ | --------------------------------------- |
| Tamaño de la base              | **23 MB** (23 975 615 bytes)            |
| Tablas con filas               | 101 · **12 192** filas vivas            |
| Personas registradas           | 11 (todas sintéticas o del propietario) |
| Acierto de caché               | **99,99 %**                             |
| Conexiones abiertas            | 1 de 100                                |
| Volumen de PostgreSQL en disco | **79 MB**                               |
| Volumen de Redis en disco      | **53 MB**                               |

Las tres tablas mayores son contenido, no actividad: `BlockVersion` (3,4 MB),
`ChapterBlock` (1,6 MB) y `ContentBlock` (1,3 MB), 3 403 filas cada una. Es
decir, **el 27 % de la base es el libro**, y la actividad de once cuentas de
prueba cabe en el resto.

### 2.2 Límites declarados y consumo en reposo

| Contenedor | Límite        | En reposo   | %          |
| ---------- | ------------- | ----------- | ---------- |
| API        | 1 GiB · 1 CPU | 325,6 MiB   | **31,8 %** |
| worker     | 768 MiB       | 258,8 MiB   | 33,7 %     |
| Web        | 1 GiB         | 166,7 MiB   | 16,3 %     |
| PostgreSQL | 1 GiB · 1 CPU | 83,4 MiB    | 8,1 %      |
| Redis      | 256 MiB       | 11,5 MiB    | 4,5 %      |
| **Total**  | **4 GiB**     | **846 MiB** | **20,7 %** |

### 2.3 Durante un recorrido representativo

Las cinco microguías de C01 (15 pasos) más el control negativo, de principio a
fin, 24 muestras de recursos cada 2 s:

> **La unidad, que conviene no confundir.** Todas las cifras de esta tabla son
> del **conjunto de las cinco microguías**, no de una. Por recorrido suelto
> salen ~8 KB y ~13 filas. La primera versión de §3 proyectaba los 40 KB como
> si fuesen el coste de un recorrido, y multiplicaba por cinco de más.

| Qué                        | Valor (las **cinco** juntas)                    |
| -------------------------- | ----------------------------------------------- |
| Duración                   | **5,46 s** de reloj                             |
| Crecimiento de la base     | **+40 960 bytes** (40 KB) · ~8 KB por recorrido |
| Filas nuevas               | **+65** · ~13 por recorrido                     |
| Transacciones              | **+102**                                        |
| CPU pico de la API         | **50,3 %** de su única CPU                      |
| Memoria pico de la API     | 318,9 MiB — **igual que en reposo**             |
| CPU pico de PostgreSQL     | 10,3 %                                          |
| Memoria pico de PostgreSQL | 94,8 MiB                                        |

El pico de CPU de la API es el dato más tenso de toda la medición: **la mitad
de su cuota** para un recorrido de una sola persona. La memoria, en cambio, no
se mueve.

### 2.4 Lectura concurrente — el escenario sintético acotado

Lectura real del capítulo 1 de _EEC_ (`/api/lector/…`, **55 KB** de respuesta,
376 bloques). Acotado a propósito en tres sentidos, porque **la caja es
compartida con cinco proyectos más**: techo de concurrencia, techo de
peticiones totales y una válvula sobre la carga del host.

| Concurrencia | Lecturas | p50        | p95    | Caudal     | Códigos  |
| ------------ | -------- | ---------- | ------ | ---------- | -------- |
| 1            | 3        | 164 ms     | 631 ms | 3,2 lec/s  | 200 × 3  |
| 4            | 12       | 162 ms     | 768 ms | 11,2 lec/s | 200 × 12 |
| 8            | 24       | **194 ms** | 694 ms | 24,0 lec/s | 200 × 24 |

Carga del host: **0,53 → 0,89** de 6 núcleos. El p50 apenas se mueve de 1 a 8
lectores concurrentes (164 → 194 ms) y el caudal escala casi lineal. Nada se
acerca a saturarse.

**Y aquí está el hallazgo que cambia la lectura de todo lo anterior.** El primer
intento de este escenario llegó a concurrencia 16 e informó «65,8 lec/s». Ese
número era falso: **57 de 64 respuestas no eran 200**. Repetido con los códigos
a la vista, la causa es el límite de 60 peticiones por minuto — a concurrencia
16 fueron **64 de 64 en 429**. Es decir:

> **El techo que se alcanza primero no es ningún recurso de la caja: es el
> límite de peticiones por actor.** Un escenario sintético lanzado desde una
> sola cuenta mide el limitador, no la capacidad, y presentarlo como caudal
> sería inventar una cifra.

Para un piloto de una persona a la vez, 60 peticiones por minuto son del orden
de **diez veces** el ritmo de alguien leyendo.

### 2.5 El disco, que es el único frente tenso

| Qué                     | Valor                                            |
| ----------------------- | ------------------------------------------------ |
| Disco del host          | 96 GB · **77 GB usados (80 %)**                  |
| Libre                   | **20 GB**                                        |
| Imágenes de Docker      | 47,7 GB totales · **25,9 GB reclamables (54 %)** |
| Volúmenes               | 21,9 GB · 2,0 GB reclamables                     |
| Caché de construcción   | 2,7 GB                                           |
| Contenedores en la caja | **41**, de los que **5** son de FeelVerse        |

FeelVerse retiene **12 imágenes** (4 por servicio × 3 servicios) de ~2,97 GB
cada una, y sólo **3** están en uso. Sumar esos tamaños sobreestima —Docker
comparte capas—, pero la proporción es el hallazgo: **los datos de FeelVerse
son 132 MB y sus imágenes dominan su huella en disco.**

> **Y esas imágenes NO son basura: son los candidatos de reversión.** El
> runbook §3.1 depende de que la imagen anterior exista en la caja. Un
> `docker image prune` liberaría unos 26 GB **y destruiría la capacidad de
> volver atrás**, que es justo la que todavía no está comprobada del todo. Por
> eso aquí no se ha podado nada: es un hallazgo para decidir con el runbook
> delante, no una tarea de limpieza.

---

## 3 · Escenario de piloto supuesto

Esto **no está medido**. Es el escenario de
[docs/product/piloto-minimo.md](../product/piloto-minimo.md), convertido en
números para poder dimensionar:

| Supuesto                                 | Valor                              |
| ---------------------------------------- | ---------------------------------- |
| Personas simultáneas                     | **1** (el piloto es de una en una) |
| Personas en el padrón del piloto         | ≤ 5                                |
| Obras                                    | 1 (_EEC_)                          |
| Sesiones de lectura por persona y semana | 3                                  |
| Recorridos guiados por sesión            | ≤ 2                                |
| Reflexiones cifradas por sesión          | ≤ 1                                |

Con el crecimiento medido —**~8 KB por recorrido**, que son los 40 KB de las
cinco dividido entre cinco—, cinco personas a tres sesiones semanales con dos
recorridos cada una dan 30 recorridos por semana, unos **240 KB semanales** y
del orden de **1 MB al mes** de crecimiento de base.

> La versión anterior de este párrafo decía «40 KB por recorrido guiado
> completo» y llegaba a 1,2 MB al mes. El resultado se parecía por casualidad:
> tenía **dos** errores que se compensaban en parte —el coste por recorrido
> inflado cinco veces, y una aritmética que daba 1,2 MB por **semana**, no por
> mes—. La cifra de arriba sale de una sola cuenta, y está escrita.

Sobre 23 MB actuales y 20 GB libres de disco, el dato no es que quepa: es que
**no es la magnitud que hay que vigilar**.

---

## 4 · Margen elegido

| Decisión                                            | Por qué ese margen                                                                                                                                   |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No cambiar ningún límite de contenedor**          | En reposo se usa el 20,7 % de los 4 GiB declarados, y el pico de memoria durante un recorrido es igual al reposo. No hay nada que ensanchar todavía. |
| **No tocar `max_connections` ni `shared_buffers`**  | 1 conexión de 100 y 99,99 % de acierto de caché con 23 MB de datos. Tunear a ciegas introduce riesgo sin resolver ningún síntoma observado.          |
| **Dejar el límite de 1 CPU en la API, y vigilarlo** | Es el único número tenso: 50,3 % de su cuota para **una** persona. Dos recorridos guiados simultáneos lo pondrían al borde. Ver §5.                  |
| **No podar imágenes**                               | Liberaría ~26 GB y destruiría los candidatos de reversión. El margen de disco se decide con el runbook, no de forma incidental.                      |
| **Conservar PostgreSQL 18.6 pgvector por digest**   | Reproducible, verificada, 37 días estable, y la etiqueta flotante ya divergió. Cambiar de versión sin un síntoma es riesgo sin beneficio.            |

---

## 5 · Lo que hay que observar con uso real

Lo de arriba describe una caja que atiende a once cuentas sintéticas. Nada de
ello acredita cómo se comporta con personas. Estas cinco cosas hay que
**observarlas**, no estimarlas:

1. **El pico de CPU de la API con dos recorridos guiados a la vez.** El medido
   —50,3 % de una CPU para uno— es el único margen estrecho. Si dos personas
   coinciden, el límite de 1 CPU es el primero que se toca. _Qué mirar:_ CPU del
   contenedor de la API durante solapes reales.
2. **Si el límite de 60 por minuto molesta a alguien leyendo de verdad.** La
   medición dice que es el techo efectivo; lo que no dice es si una persona
   navegando rápido lo alcanza. Un 429 en mitad de un capítulo es un defecto de
   producto, no de capacidad. _Qué mirar:_ 429 por cuenta real.
3. **El disco, que va al 80 % y no por culpa de los datos.** Cada despliegue
   añade ~3 GB por servicio. Dos o tres despliegues más de los tres servicios
   consumen los 20 GB libres. _Qué mirar:_ `df -h /` después de cada despliegue,
   y la decisión de retención de imágenes junto al runbook.
4. **El crecimiento real por persona y semana**, contra el supuesto de 40 KB
   por recorrido. _Qué mirar:_ `pg_database_size` semanal.
5. **La retención del digest de la imagen de PostgreSQL.** Hoy es pullable; eso
   no se promete para siempre. _Mitigación pendiente:_ copiar la imagen a un
   registro propio, para que el nivel 4 no dependa de la retención de un tercero.

**Y una cosa que esta medición no puede dar**, por si se lee como si pudiera:
no hay ninguna cifra aquí sobre el comportamiento con **producción**, porque
producción no existe como recurso. Todo lo medido es staging, compartiendo una
caja con cinco proyectos ajenos.

---

## 6 · Cómo se repite esta medición

Los guiones usados viven en el directorio temporal de la sesión y **no se
committearon**, porque dependen de credenciales de ops y de nombres de
contenedor con fecha. Lo que sí es estable es el procedimiento:

1. **En reposo** — un `.cjs` que abre `BEGIN READ ONLY` sobre `DATABASE_URL`
   dentro del contenedor de la API y consulta `pg_database_size`,
   `pg_stat_user_tables`, `pg_settings` y `pg_stat_database`. Se copia con
   `docker cp` y se borra después (el directorio de la imagen no es escribible
   desde `-w /app/apps/api` sin más).
2. **Durante un recorrido** — una instantánea antes, el recorrido, una después,
   y en paralelo `docker stats --no-stream` cada 2 s sobre los contenedores de
   FeelVerse. Las instantáneas dan bytes y filas; `docker stats` da los picos.
3. **Concurrencia** — lecturas del capítulo real, por niveles, **con los
   códigos de respuesta a la vista**. Sin eso, el escenario informa caudal
   cuando está midiendo 429, que es el error que se cometió en el primer
   intento.
4. **La caja** — `nproc`, `free -m`, `df -h /`, `/proc/loadavg`,
   `docker system df`, y el `coolify.projectName` de cada contenedor para
   separar lo propio de lo ajeno.

Todas las consultas a la base son de **sólo lectura**. No se escribió, no se
podó y no se reinició nada.
