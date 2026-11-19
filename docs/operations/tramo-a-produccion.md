# El tramo a producción — qué falta, y de quién depende

> Ficha breve, corte del **2026-11-19 por la noche**, con el correo ya cerrado.
>
> Las puertas completas viven en
> [runbook §4](../deploy/coolify-runbook.md). Esto es el saldo y lo que cada
> cosa necesita para moverse.

## Resumen en una tabla

| #   | Condición                       | Qué falta exactamente            | Quién la mueve        |
| --- | ------------------------------- | -------------------------------- | --------------------- |
| 1   | **Sentry**                      | un DSN                           | **insumo de Jorge**   |
| 2   | **Ensayo de nivel 4**           | un **importe máximo autorizado** | **decisión de Jorge** |
| 3   | **Canal del aviso de respaldo** | autorizar un destino             | **decisión de Jorge** |
| 4   | **Aceptación estética**         | que Jorge mire el material       | **sólo Jorge**        |
| 5   | **Editorial**                   | cinco decisiones del paquete     | **sólo Jorge**        |
| 6   | **Recursos de producción**      | nada todavía: va después de 1–5  | —                     |

**Ninguna es trabajo técnico pendiente.** Lo preparable con los accesos
existentes está hecho.

---

## 1 · Sentry

**Qué hay.** El cableado está completo en los cuatro frentes desde el Sprint 2
(API, worker, Web, móvil), con `beforeSend` que limpia `authorization`,
`cookie`, `x-api-key` y `stripe-signature`, y con **grabación de sesión y
capturas apagadas en duro** — porque grabarían el composer del Diario abierto,
con texto en claro en pantalla.

**Qué falta.** El **DSN**. Comprobado hoy **dentro del contenedor servido**:
`SENTRY_DSN` **ausente**. Hacen falta dos valores distintos, no uno: el del
servidor (API y worker) y el del cliente (`NEXT_PUBLIC_SENTRY_DSN` en Web).

**Cómo se comprobará.** No con «la variable está puesta», que no demuestra
nada. Con un **500 provocado y controlado** en staging —una ruta de prueba que
lance— y la comprobación de que ese evento **aparece en el proyecto de Sentry**
con su contexto (`method`, `path`, `statusCode`, `code`) y **sin** ninguna
cabecera sensible en el cuerpo del evento.

**No bloquea el piloto.** Bloquea producción: sin él, un fallo se investiga a
ciegas.

---

## 2 · Ensayo de nivel 4 — reconstruir tras perder el servidor

**Qué está listo.** Todo menos la caja: la copia de R2 es **alcanzable y
restaurable desde fuera del servidor** (comprobado el 06-11, `pg_restore`
rc=0), las tres claves destructivas están a salvo fuera, y la **puerta de
aislamiento** que impide que el ensayo alcance a proveedores reales es
ejecutable y está comprobada arrancando los dos binarios.

**El recurso previsto.** Una instancia **`d2-8`** de OVHcloud Public Cloud —
4 vCore, 8 GB — que es la gama con esa forma y precio mensual sin compromiso.

**El precio vigente**, leído hoy de la tabla de
`us.ovhcloud.com/public-cloud/prices/`:

| Concepto        | Precio                   | Procedencia                                  |
| --------------- | ------------------------ | -------------------------------------------- |
| `d2-8` por hora | **$0,0461**              | fila literal de la tabla, «excl. taxes», USD |
| `d2-8` por mes  | $25,53                   | misma fila                                   |
| IPv4 pública    | ~$0,00319/h (~$2,33/mes) | **no verificado literalmente** — ver abajo   |

> **El precio se movió, y por eso se relee.** La referencia del 09-11 decía
> **$0,0439/h**; hoy la tabla dice **$0,0461/h**. Una estimación de diez días
> no es un precio.
>
> **Lo que no pude acreditar literalmente**, y lo digo en vez de rellenarlo: la
> nota de IPv4 y la de almacenamiento de esa sección quedaron fuera del texto
> legible. La página sí dice, literalmente, que «las instancias no incluyen una
> dirección IPv4 por defecto». La cifra de la IPv4 viene de un resumen, no de
> la tabla. Y la fila muestra «50 GB» de almacenamiento sin decir si va
> incluido.

**Coste total estimado.** Para un ensayo de 12–24 h, usando sólo la cifra
literal: **$0,55 (12 h)** a **$1,11 (24 h)**, sin impuestos. Con la IPv4 no
verificada, unos **$1,19** las 24 h.

**Presupuesto máximo que necesita tu autorización: US$ 15 (sin impuestos).**

Ese techo no es la estimación: la multiplica por doce a propósito, para que
cubra un primer intento fallido, un segundo ensayo completo, el almacenamiento
si resulta facturarse aparte, y unas horas de más si algo se queda encendido
por error. **Autorizar un importe no es autorizar el gasto**: cuando llegue el
momento se relee el precio otra vez y se contrasta con el presupuesto antes de
contratar.

> **Destruir la instancia no cierra todos los cargos por sí solo.** La
> documentación de OVH dice que borrarla termina su facturación pero **no borra
> automáticamente** almacenamiento, instantáneas ni respaldos, y que una IP
> flotante desasociada **sigue asignada** hasta liberarla. Por eso el cierre
> tiene seis pasos y el último es **comprobar la factura del mes siguiente**. Y
> la evidencia se extrae **antes** de destruir nada, porque el detector y los
> registros viven dentro de la caja.

---

## 3 · Canal del aviso de respaldo

**Qué hay.** Un detector instalado y corriendo solo desde el 07-11: cron diario
a las 06:10 UTC, sólo lectura, con control positivo y negativo ejecutados.
Registra **siempre**, también cuando todo va bien — porque un detector que sólo
habla al fallar no se distingue de uno que dejó de correr, que es exactamente
cómo pasó inadvertido el hueco del 29-10.

**Qué falta.** Un **canal**. Coolify tiene `missing_backup_notification_days`
puesto a 2, pero **los cinco canales están desactivados y sin destino**. Un
aviso sin canal es un ajuste, no un aviso.

**Destino propuesto: `soporte@syntavera.dev`.** Ya existe —se creó el 19-11—,
es un buzón compartido sin licencia, y tú lo abres. No hay que crear nada.

> **Pendiente de tu autorización**, y no por formalidad: inventar un destino
> habría sido peor que no tener ninguno, y el correo que saliera por ahí no
> pasa por la guarda de `EMAIL_ALLOWLIST` —lo manda Coolify, no FeelVerse—, así
> que es una decisión sobre a dónde escribe otra herramienta.

**Límite conocido del detector, dicho antes de que nadie confíe de más:** mira
el día **anterior**, así que un respaldo que falla a las 05:00 se detecta a las
**06:10 del día siguiente** — hasta 25 h 10 min. Y si la caja no arranca, no se
entera nadie, porque el detector vive dentro.

---

## 4 · Aceptación estética

**El material a revisar:**
[`docs/product/aceptacion-visual-2026-11-18.md`](../product/aceptacion-visual-2026-11-18.md)
— 18 pantallas en el orden en que una persona conoce el producto, con capturas
**antes y después** de las diez decisiones, todas cerradas.

**Qué es y qué no.** Todo lo medido ahí es tipografía, contraste y qué dice
cada pantalla. **No** es si el conjunto te gusta, y eso ninguna medición lo
cierra. Es la única mitad de la puerta 1 que sigue abierta: el recorrido de
recuperación por correo, que era la otra, **está hecho**.

---

## 5 · Decisiones editoriales

Cinco de las ocho del paquete siguen abiertas, con su propuesta ya redactada en
[`docs/product/paquete-editorial-2026-11-07.md`](../product/paquete-editorial-2026-11-07.md);
el estado de cada obra, en
[`docs/product/inventario-editorial.md`](../product/inventario-editorial.md).

En corto: el **vínculo sucesor del Dúo** (hoy cuelga de un pin retirado), las
**otras dos obras**, el **primer medio editorial definitivo** (se propone el
audio del capítulo 1 de _EEC_, que es el que más maquinaria valida de una vez),
la **apertura de B** y los **precios con la apertura de cobros**.

**Condicionan el alcance final, no el piloto.** B puede ejecutarse sin ellas.

---

## 6 · Recursos de producción, y el orden

**Producción no existe como recurso:** el proyecto de Coolify tiene tres
aplicaciones y las tres son de staging. Que `feelverse.app` resuelva al
servidor no significa que haya producción — el DNS está pre-apuntado y ningún
recurso reclama ese dominio.

**El orden acordado no cambia:** primero las puertas 1 a 5 de arriba, después
se crean los recursos de producción, y sólo entonces se despliega. **No se
declara producción lista por tener staging sano**, que es la tentación que este
documento existe para no tener.

---

## Lo que esta ficha NO hace

No contrata nada, no abre cobros, no invita a nadie, no publica contenido y no
declara ninguna condición cerrada que no lo esté.
