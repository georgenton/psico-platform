# Construcción y recuperación en el VPS compartido

**Propuesta operativa. Nada de lo que sigue se ha ejecutado.** Las medidas que
tocan infraestructura se entregan agrupadas al final, para decidir, no para
aplicar.

Origen: el 15-10-2026, el primer despliegue de `feelverse-staging-api` al
commit `8cb480c0` falló con

```
ERROR: failed to build: failed to receive status:
rpc error: code = Unavailable desc = error reading from server: EOF
```

durante `nest build`. La causa no estaba en el código —el mismo árbol compila
en CI y en local— sino en el kernel del servidor:

```
[Thu Oct 15 03:22:55 2026] node invoked oom-killer: ...
Out of memory: Killed process 3709613 (buildkitd) total-vm:7396220kB, anon-rss:3719368kB
```

El reintento, sin cambiar nada, terminó bien.

---

## 1 · Qué se construye, y dónde

Lo primero que conviene separar, porque se confunde con facilidad:

|                      | dónde ocurre                       | qué consume            |
| -------------------- | ---------------------------------- | ---------------------- |
| CI de GitHub         | runners de GitHub                  | nada nuestro           |
| **Build de Coolify** | **el mismo VPS que sirve staging** | CPU y memoria del host |
| Contenedor servido   | el mismo VPS                       | su `limits_memory`     |

El build **no** está aislado del host. `buildkitd` corre ahí, junto a los 39
contenedores en ejecución del resto de proyectos. Que CI esté verde no dice
nada sobre si el build cabrá en esa máquina en ese momento.

Inventario del servidor, leído el 15-10:

- **6 CPU · 11 GB de memoria · 0 GB de swap.**
- 10 aplicaciones de 7 familias distintas (FeelVerse, drillops, sales-intelligence, voces, syntavera…).
- Build packs: 3 `railpack`, 3 `dockerfile`, 4 `dockerimage`. Los **seis primeros construyen en el host**; los cuatro últimos sólo descargan una imagen.
- **0 de 10 con autodespliegue.** Todo despliegue de esa máquina lo dispara una persona o una llamada explícita.

El dato que más llama la atención es **swap = 0**. Sin swap no hay margen que
degrade un pico en lentitud antes de que el kernel actúe.

Conviene no estirar lo que la evidencia sostiene. Lo observado es: el kernel
invocó al OOM-killer, eligió `buildkitd`, y su RSS en ese momento era 3,7 GB.
El OOM-killer puntúa por memoria **y** por otros factores (`oom_score_adj`,
cgroup, antigüedad), así que **no está demostrado que lo eligiera sólo por ser
el mayor**: es coherente con serlo, nada más. Tampoco está demostrado que
añadir swap hubiera evitado este OOM, ni que evite el próximo — con suficiente
presión el kernel mata igual, y antes de eso el sistema puede volverse
inservible por paginación. Lo que swap cambia es el modo de fallo típico, no
la existencia del límite.

## 2 · Qué puede competir por la memoria

Por orden de lo que he podido comprobar:

1. **Otro build simultáneo.** Seis aplicaciones construyen en el host. Coolify
   encola los despliegues _por aplicación_; no he encontrado evidencia de una
   cola global entre aplicaciones distintas, y no la doy por supuesta: está en
   las mediciones que faltan.
2. **Nuestro propio par API → Web.** Son dos builds de Node grandes. Hoy los
   lanzo en secuencia porque la promoción lo exige, no porque exista un
   mecanismo que lo impida.
3. **El estado estable de los 39 contenedores.** En la lectura del 15-10
   ocupaban ~4,9 GB, dejando ~6,7 GB disponibles. Ese número es **una
   observación de un instante, no un umbral**: no se debe convertir en
   «con 6,7 GB libres se puede construir».
4. **Trabajos puntuales**: restores, drills de backup, scripts de ops.

## 3 · Qué mediciones faltan

Ninguna de estas existe hoy, y sin ellas cualquier umbral sería inventado:

- **Pico de memoria por build**, por aplicación. Lo único medido es el RSS de
  `buildkitd` en el momento de morir (3,7 GB), que es un suelo, no el pico.
- **Duración y perfil del build** a lo largo del tiempo.
- **Si Coolify serializa builds entre aplicaciones distintas**, o sólo dentro
  de una.
- **Memoria disponible en el instante de arrancar** cada build, registrada
  junto al resultado, para poder correlacionar.
- **Cuántos fallos de build son OOM** frente a otras causas. Hoy hay uno.

Propuesta barata: registrar `free -m` y la lista de builds activos
inmediatamente antes de cada despliegue, y guardarlo junto al `deployment_uuid`.
Es una lectura, no una intervención.

## 4 · Cómo secuenciar y cuándo parar

Reglas que se pueden aplicar **sin tocar infraestructura**, porque son
disciplina de quien despliega:

1. **Un build nuestro a la vez.** API y Web nunca en paralelo. Ya se hace; esto
   lo deja escrito.
2. **Mirar antes de empezar.** Leer memoria disponible y builds en curso. Si
   hay otro build del host corriendo, esperar.
3. **Condición de parada explícita**: si dos intentos consecutivos del mismo
   commit mueren con un error de transporte de buildkit (`rpc error … EOF`,
   `signal: killed`), **parar y escalar** en vez de reintentar. Un reintento
   tras un OOM es razonable; tres son una forma lenta de no arreglar nada.
4. **No reintentar a ciegas un fallo que no sea de recursos.** Si el log
   muestra un error de compilación, el reintento sólo repite el gasto.

## 5 · Distinguir un build fallido de un artefacto caído

Es la distinción que evitó un rollback innecesario el 15-10, y conviene fijarla:

|                   | build fallido                   | artefacto servido caído                   |
| ----------------- | ------------------------------- | ----------------------------------------- |
| qué dice Coolify  | deployment `failed`             | deployment `finished`, contenedor no sano |
| contenedor        | **el anterior sigue corriendo** | el nuevo está arriba y falla              |
| salud del dominio | intacta                         | degradada                                 |
| qué hacer         | reintentar o parar              | **revertir el artefacto**                 |

Comprobación concreta, en este orden:

```bash
# 1 · ¿qué imagen corre de verdad?
docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | grep <uuid>

# 2 · ¿responde?
curl -s -o /dev/null -w '%{http_code}' https://<dominio>/health
```

Si el contenedor sigue siendo el de antes y el dominio responde, **no hay nada
que revertir**: Coolify retira la versión nueva por su cuenta cuando el build
muere. Declarar un rollback ahí sería tocar un servicio sano.

## 6 · Conservar y recuperar artefactos anteriores

Lo comprobado el 15-10 sobre el host:

- Las imágenes se etiquetan **por commit**, no por `latest`:
  `aft7nt3p6wsormno2cejtavj:be382aa4…`, `…:8cb480c0…`.
- Hay varias generaciones retenidas (al menos tres por aplicación, de hasta 7
  días).
- El contenedor en ejecución referencia esa etiqueta, así que la identidad es
  verificable sin confiar en el panel.

**El punto delicado**, y es el que hay que decidir: las tres aplicaciones
tienen `git_commit_sha: "HEAD"`. Un «redesplegar» reconstruye **main HEAD**, no
el commit anterior. Es decir:

> Si `main` ya avanzó, pulsar redeploy **no** devuelve el artefacto anterior:
> construye uno nuevo. El rollback real es volver a servir la imagen etiquetada
> que ya existe, o fijar temporalmente el commit anterior antes de desplegar.

Hoy esto funciona por una coincidencia: nadie hace push a `main` entre el
deploy y un eventual rollback. Conviene no depender de eso.

## 7 · Cuatro distinciones que esta propuesta respeta

Se dicen porque confundirlas es cómo se fabrica una conclusión falsa, y porque
en esta misma revisión tuve que separarlas una por una:

- **Código**: lo que hay en el repositorio. Se lee con `git`.
- **Configuración persistente**: lo que Coolify guarda y regenerará en el
  próximo despliegue. Sus valores están **cifrados en reposo**, así que por API
  sólo se ven los NOMBRES de las claves.
- **Archivo generado**: el `.env` que Coolify escribe junto al
  `docker-compose.yaml` en el último despliegue. Leerlo dice qué se materializó
  entonces, no necesariamente qué se materializará la próxima vez.
- **Entorno efectivo**: lo que el proceso tiene en memoria ahora mismo.

Inspeccionar uno **no** demuestra los otros. Un contenedor sano no prueba que
la configuración persistente siga cerrada; el `.env` en disco no prueba que no
se haya cambiado el almacén después.

## 8 · Decisiones agrupadas, para decidir — no ejecutadas

Ninguna se ha aplicado. Todas tocan infraestructura.

| #   | decisión                                                                         | a favor                                                                  | en contra                                        |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------ |
| D1  | **Añadir swap al VPS** (p. ej. 4–8 GB)                                           | un pico se vuelve lentitud en vez de un proceso muerto; es lo más barato | degrada el rendimiento del resto mientras se usa |
| D2  | **Construir fuera del host servidor** (build server dedicado o registro externo) | el build deja de competir con lo que sirve a usuarios                    | coste nuevo y una pieza más que mantener         |
| D3  | **Limitar la memoria del build** con cgroups                                     | el OOM mata el build y no un servicio                                    | si el límite queda corto, el build no pasa nunca |
| D4  | **Fijar `git_commit_sha` al promover**, en vez de `HEAD`                         | el rollback vuelve a ser determinista                                    | un paso más en cada promoción                    |
| D5  | **Retención explícita de imágenes** por aplicación                               | garantiza que el artefacto anterior exista                               | ocupa disco (57 de 96 GB usados hoy)             |
| D6  | **Registrar memoria y builds activos antes de cada despliegue**                  | da los datos de §3 sin tocar nada                                        | sólo sirve si alguien los mira                   |

Mi recomendación, si hay que elegir una: **D1 y D6**. La primera convierte el
modo de fallo más caro —un proceso muerto a mitad— en uno recuperable; la
segunda es la única que produce las mediciones que faltan, y no interviene
nada. D4 es barata y elimina una trampa silenciosa del rollback.

---

**Alcance**: este documento no cambia el tamaño del VPS, ni swap, ni procesos,
ni límites de contenedor, ni registro de imágenes, ni configuración de Coolify.
