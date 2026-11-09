# Parte del 2026-11-09 — el ensayo ejecutable, el guía en pantalla y el Dúo con dos partes

> **Qué es esto.** El registro de lo que se midió el 9 de noviembre, con sus
> límites. Las decisiones que salieron de aquí viven en
> [el paquete editorial](../product/paquete-editorial-2026-11-07.md); el
> procedimiento, en [el runbook](../deploy/coolify-runbook.md).

**Artefactos servidos durante estas comprobaciones:** API y worker `f15c5c96`,
Web `2b452f86`. Leídos del contenedor, no de una tabla.

---

## 1 · El ensayo de recuperación dejó de pedir lo imposible

Detalle completo en [el runbook §3](../deploy/coolify-runbook.md) y en el
[PR #831](https://github.com/georgenton/psico-platform/pull/831). Lo que importa
para esta bitácora es **qué se ejecutó**, porque la diferencia entre revisar una
configuración y arrancarla con ella es la razón de que aparecieran dos defectos
que nadie buscaba.

| Paso                          | Resultado                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Puerta de aislamiento         | `✔ aislado — 18 comprobaciones`, código 0                                       |
| Migraciones sobre la copia    | 71 aplicadas                                                                    |
| **API real**                  | `/health` 200 · `ready=true`, 71/71, `pending` y `failed` vacíos                |
| **Worker real**               | `Awaiting jobs…`, **12 colas** y sus planificadores, proceso vivo               |
| **Borrado de R2 → sustituto** | `DELETE /feelverse-ensayo/data-exports/…?x-id=DeleteObject host=127.0.0.1:4566` |
| **Modelo → sustituto**        | `POST /v1/messages host=127.0.0.1:4555 bytes=1372`                              |
| Con destino al proveedor      | **0**                                                                           |
| Control negativo              | cuenta viva + costuras quitadas → `✗ 3 de 18 fallan`, código 1                  |

**Lo que esto NO es.** No es el ensayo de nivel 4. Es su **configuración**,
corregida y comprobada hasta el arranque. Reconstruir la plataforma entera en una
caja nueva —provisionar, instalar Coolify, recrear los tres recursos, restaurar y
recorrer— sigue **pendiente**, y sigue necesitando un VPS temporal.

---

## 2 · El guía en pantalla: la lista se ve, la interacción no se puede abrir

Cuenta sintética del padrón (`qa-visual-20261026@psico.test`, la única en
`GUIDE_PILOT_USER_IDS`), contraseña **rotada en esta sesión** antes de usarla.

**Lo que funciona.** El botón «Recorrido» abre la portada del capítulo y las
cinco microguías aparecen **numeradas, con título, resumen, duración y estado**
(«Completada», del recorrido por HTTP del 07-11). Eso confirma la evidencia del
08-11.

**Lo que no.** Pulsar «Revisar» en cualquiera de ellas abre el panel y responde:

> «No pudimos preparar el recorrido de este capítulo. Puedes seguir leyendo con
> normalidad.»

**Por qué, medido y no supuesto.** La petición es
`GET /api/experiences/mine/eec-c1-teorias-como-lentes/1` → **404
`EXPERIENCE_NOT_FOUND`**, y
`GET /api/experiences/discovery/emociones-en-construccion/1` devuelve **un solo
recorrido**: `eec-c1-cuerpo-antes-que-mente`, el legado. Las cinco viven en el
catálogo de **Guide** (`guide/guide-discovery-catalog.ts`); la legada vive además
en el de **Experience** (`experience/experience-production-catalog.ts`). Las cinco
**no tienen definición de Experience en ningún sitio**, ni en código ni en la
base — `ChapterExperienceVersion` sigue con 0 filas.

**Esto NO es un defecto de código.** `ReaderGuidePanel` se niega a propósito, y lo
escribe: «A pin with no published experience fails the same way and for the same
reason: there is nothing honest to render» — una portada con un «Empezar» que
funcionara registraría avance por un recorrido cuyo pasaje no se puede mostrar. Y
`use-chapter-experience.ts` anticipa el caso: «si algún día dejan de coincidir,
esto devolverá 404 y la pantalla dirá lo que decía antes — se degrada a lo
anterior, no a algo peor».

**Es la decisión A, con su consecuencia visible.** Hoy las cinco se **ven** y no se
**abren**. No se forzó por otra vía: abrir una por el camino de Guide habría
producido una evidencia que no corresponde a lo que vive una persona.

> **Corrección a la matriz.** «Pantalla comprobada ✅ (08-11)» era cierto de la
> **lista** y falso de la **interacción**. Las dos cosas se registran por separado
> a partir de aquí.

**El recorrido por HTTP sigue valiendo (31/31)**, y no hay contradicción: corre por
la API de órdenes de Guide, que resuelve del catálogo **en código** y no necesita
fila de Experience. Son dos registros distintos, y el panel depende del segundo.

---

## 3 · El Dúo con dos partes, en pantalla — y un defecto que sólo aparece así

Dos navegadores, dos identidades: la del padrón en Chrome, y una segunda cuenta
sintética creada en esta sesión (`qa-duo-b-20261109@psico.test`) en el navegador
de la aplicación.

**Lo que funciona.** Crear el Dúo, el enlace de un solo uso —con el secreto en el
**fragmento**, que no llega al servidor—, la página de invitación con el nombre de
quien invita, y la sala de la invitada con su consentimiento, sus seis
salvaguardas y «0 de 2 listas».

**El defecto.** La misma invitada, al mismo Dúo, con el mismo tipo de enlace:

| Invitada                                | Resultado                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| **con sesión**, cuenta fuera del padrón | «No pudimos abrir esta sala. Círculos no está disponible todavía.»                      |
| **sin sesión** (anónima)                | la sala abre entera: consentimiento, salvaguardas, «0 de 2 listas», «Entiendo, empezar» |

**Tener cuenta te dejaba peor que no tenerla.** Y no por una decisión: la
superficie de invitadas ya está abierta bajo `pilot` a propósito —«negarla haría
que un miembro del padrón no pudiera invitar a nadie»— y ese argumento no se había
aplicado a la invitada que **además** tiene cuenta, que en un piloto real son casi
todas.

Corregido en el [PR #832](https://github.com/georgenton/psico-platform/pull/832),
acotado: la participación deja de consultar el padrón, **crear lo conserva**.
Verificado por mutación. **Falta comprobarlo sobre staging**, que necesita
desplegar la API.

**Lo que depende de la sucesión editorial, y no se abrió por otra vía.** El enlace
«Ir a la experiencia» del Dúo lleva a `eec-c1-cuerpo-antes-que-mente`, cuya acción
principal está **retirada para inicios nuevos**: «Esta experiencia no admite
recorridos nuevos», con el botón deshabilitado. La decisión 5 del paquete editorial
—mover la elegibilidad a una de las cinco microguías vivas— es lo que cierra eso.

---

## 4 · Tres comprobaciones de paso

**El arreglo del control deshabilitado (#829), sobre el elemento real servido.**
No en la hoja compilada, sino en el botón que destapó el defecto:

```
disabled: true · opacity: 0.45 · cursor: not-allowed
```

**Los 503 del primer prefetch son arranque en frío, otra vez.** `/dashboard/eco`,
`/dashboard/notifications` y `/dashboard/perfil` respondieron 503 en la primera
navegación; repetidos desde la misma pestaña, **200 en ~125 ms** los tres. Es el
mismo falso positivo que la UAT del 22-10 dejó escrito. Queda aquí para que nadie
lo vuelva a investigar.

**El conmutador de push del navegador ofrece «Activar».** Es decir, la
configuración VAPID del 05-11 está viva y el cliente puede suscribirse. La entrega
real exige conceder el permiso de notificaciones en el navegador, que queda fuera
de lo que se hace sin pedirlo.

---

## 5 · Qué NO se tocó

- **Producción.** No existe como recurso, y no se creó ninguno.
- **Ningún cobro**, ninguna publicación editorial, ninguna llamada facturable al
  modelo: el sustituto del ensayo devolvió 401 y el servicio cayó a su narrativa
  por reglas.
- **Ninguna base viva.** Las tres consultas a OVH fueron `BEGIN READ ONLY`. Las
  filas sintéticas del ensayo se insertaron en una base **desechable**, destruida
  al terminar.
- **Ninguna preferencia de una cuenta real.** Las dos identidades son `@psico.test`
  y sus contraseñas se generaron en esta sesión y se guardaron antes de usarse.
- **Ninguna imagen podada**, aunque el disco bajó al 56 %: los candidatos de
  reversión siguen los tres servicios cubiertos.
