# Validación de la experiencia principal y ensayo de recuperación — 2026-10-24

Continúa la UAT del [2026-10-23](uat-2026-10-23-cierre-staging.md) sobre el
mismo corte servido (`725df576`), y añade lo que allí quedó declarado como
pendiente: el recorrido funcional de Evolución y el **ensayo operativo del
rollback de pagos**.

**Producción no se tocó.** Ni una petición de escritura, ni un despliegue.

---

## 1. La validación autenticada sigue bloqueada, y por qué exactamente

El encargo pide reutilizar una sesión autorizada si existe. **No existe**:
comprobado, no supuesto — `GET /dashboard` en el navegador de la sesión
redirige a `/login?from=%2Fdashboard`, así que no hay cookie de sesión viva.

**La operación denegada, con precisión.** Para escribir la contraseña de una
cuenta sintética en el formulario hace falta antes **materializar el secreto
en claro** en esta conversación: leerlo del almacén de ops y pasarlo como
argumento de una herramienta. Ese paso *es* el acto prohibido; el control no
filtra la pulsación final, prohíbe manipular la credencial en claro. Dicho de
otro modo: no hay un intento que se pueda hacer y que el control rechace —
construir la llamada ya requiere hacer lo prohibido.

**Qué mecanismo de preparación haría falta.** Uno de estos tres, y ninguno
está disponible hoy:

1. Una **herramienta de credenciales** que pida la contraseña al gestor del
   usuario y la entregue al campo sin que pase por aquí. Se buscó en las
   herramientas de la sesión: **no hay ninguna**.
2. Una **sesión ya abierta** por una persona en el navegador de la sesión, con
   una cuenta sintética — bastaría con que estuviera abierta al empezar.
3. Una **preparación de QA alojada** que autorice expresamente la
   autenticación y la deje montada: por ejemplo un contenedor de QA con una
   sesión sembrada, cuyo alcance y caducidad se declaren por adelantado.

**Lo que NO se hizo**, y conviene que quede escrito porque era técnicamente
posible: no se inyectó una cookie de sesión obtenida por API. Eso habría
funcionado y es exactamente «crear una puerta alternativa de autenticación»,
que el encargo prohíbe. Tampoco se usó el flujo de recuperación de contraseña
leyendo el token de la consola del worker, por la misma razón.

`VISUAL_REVIEW_WITH_SESSION = NOT_VERIFIED`, con el impedimento nombrado.

---

## 2. Lo que sí se comprobó sin sesión

Tiene alcance limitado y se dice cuál: la landing y las dos pantallas de
acceso. Los **cuatro ambientes siguen fuera de alcance** — `/login` sirve
`data-theme="contemporary"` con `data-ambient` sin valor y **sin conmutador**,
así que sin sesión sólo se llega a Calma. La aceptación de F2.1 se conserva
como antecedente; nada de aquí la amplía.

### Ausencia de enlaces a la obra retirada

| Página | Enlaces | A *Familias* | ¿La menciona? |
| --- | --- | --- | --- |
| `/` | 36 | **0** | sí, 4 veces como «Aún no disponible» |
| `/login` | 1 | **0** | no |
| `/register` | 2 | **0** | no |
| `/forgot-password` | 2 | **0** | no |

Es la forma correcta: la obra se **nombra** como próxima y **no se puede
alcanzar**. Nombrarla sin enlazarla es lo que dice la landing aprobada.

### Controles, foco y estados de error en el acceso

- **Los formularios declaran `method="post"`** en `/login` y `/register` ✓
  (hay trinquete en el repositorio para esto).
- **Foco:** las 7 posiciones de `/login` recorridas con **Tab real** tienen
  anillo visible (`:focus-visible` cierto en las 7), en orden lógico, sin
  saltos ni trampas. El anillo del botón de envío es blanco sobre `#5e42c0`:
  **6,96:1**, bien por encima del 3:1 que pide un indicador de foco.
- **Objetivos táctiles:** el control principal mide 384×44 ✓. Tres auxiliares
  se quedan cortos: «Cómo protegemos tu diario» 24 px, «¿Olvidaste tu
  contraseña?» 24 px y **«Regístrate gratis» 18 px**. Es la misma familia de
  observación que los enlaces del pie en la landing, pero aquí está en una
  pantalla de **acceso**, que es más consecuente.
- **Estados de error:** el formulario **se niega a enviar** con campos vacíos
  o con un correo mal formado ✓, pero la validación está **delegada al
  navegador**: el mensaje es el nativo —en inglés si el navegador está en
  inglés, sobre un producto que sólo habla español—, no se pone
  `aria-invalid`, no hay `[role="alert"]` propio y el borde del campo no
  cambia. Funciona; no está localizado ni anunciado.

### Una incoherencia del mínimo de contraseña, medida

| Superficie | Mínimo |
| --- | --- |
| Registro (web `minLength` + `register.dto.ts`) | **8** |
| Restablecer contraseña (`reset-password.dto.ts`) | **8** |
| Cambiar contraseña simple (`password-change.dto.ts`) | **8** |
| **Cambiar contraseña con re-cifrado** (`password-change-with-rekey.dto.ts`) | **10** |

El flujo que la aplicación ofrece en Seguridad es el de re-cifrado, así que
quien se registró con ocho caracteres y quiere cambiar a otros ocho recibe un
rechazo con un mínimo distinto del que le permitieron al entrar. **No es un
defecto de implementación**: cliente y servidor coinciden en 10 —la tarjeta
valida a 10 antes de llamar y lo dice en su etiqueta—, así que nadie recibe un
400 por sorpresa. Y el piso más alto es defendible: perder esa contraseña
destruye el diario. Pero el producto cuenta dos reglas distintas sin
explicarlo, y eso es una decisión de producto, no una corrección técnica.

---

## 3. Evolución: recorrido funcional completo

El contrato dice que `marcasLectura = highlights + annotations`. Se eligió una
anotación, que es la acción más pequeña que debe moverlo.

| | |
| --- | --- |
| **Estado anterior** | actor `marcasLectura = 0` · control `= 0` · mapa **0/6** ejes con señal |
| **Acción** | `POST /api/annotations` sobre un bloque real del cap. 1 de EEC → **201** |
| **Cambio esperado** | +1 exactamente |
| **Observado** | **0 → 1** |
| **Persistencia** | reconsulta → **1** |
| **Aislamiento** | la otra cuenta sintética sigue en **0** |

Y la separación que importa: **el mapa emocional no se movió**, 0/6 antes y
0/6 después. Anotar es aprendizaje; no fabrica una señal emocional. Eso es el
principio de la Fase V2 verificado contra el entorno servido, no sólo en una
prueba unitaria.

**Sin defectos.** La comprobación se cierra.

Una observación de contrato, no un defecto: el DTO llama a `blockKey` el
«ancla preferida para clientes nuevos», pero el lector legado
(`GET /api/lector/:libro/:orden`) **no la expone** — sus bloques traen sólo
`id`. No hay nada roto: el servidor deriva la clave estable del id legado
(`blockKeyFromLegacyId`) y la respuesta de la anotación vuelve con las dos
anclas. Simplemente, desde ese endpoint la preferencia documentada es
inalcanzable, y es coherente con que el endpoint sea el legado.

---

## 4. Ensayo operativo del rollback de pagos: HECHO

Era el pendiente de más peso. Está ejecutado, y el procedimiento, las cifras
y los límites viven en **[el runbook §3.1](../deploy/coolify-runbook.md)**,
que es donde se consultan cuando haga falta.

Resumen de lo observado, con los **dos artefactos reales** sobre una base
desechable restaurada del respaldo diario, en una red de Docker sin otros
miembros y con Stripe sustituido por un doble **sin red**:

- La imagen **anterior** registra `Skipping already-processed Stripe event`
  sobre una reclamación que nunca se procesó, **sin llamar a Stripe ni una
  vez**, y el efecto se pierde. Igual con una pendiente de **diez días**.
- La imagen **actual** registra `Reapplying … a previous attempt did not
  finish`, relee el objeto autoritativo, aplica el efecto, **sella la fila** y
  deja el inventario en **cero**.
- Una pendiente **ya convergida** se sella **por código**, sin duplicar el
  efecto y sin escribir `processedAt` a mano.
- La **ventana** entre inventario y cambio de imagen quedó reproducida:
  inventario 0, llega un webhook, deja una pendiente que no estaba en el
  inventario, y la imagen anterior la pierde.

Dos cifras cierran el supuesto retirado nº 2: con las dos pendientes en la
base, el recuento correcto veía **2** y el del filtro de cuatro días veía
**1**. La diferencia era exactamente la pendiente excluida, con su efecto sin
aplicar.

**Las reclamaciones las escribió el código real**, no una mano: la imagen
nueva reclama y el doble hace fallar la relectura. Envejecer una de ellas con
un `UPDATE` sobre `createdAt` no finge ningún efecto — el efecto seguía sin
aplicar, y así se comprobó antes y después.

La migración aplicada **no se tocó**: se verificó presente y con
`processedAt` nullable en la base restaurada. Los contenedores y la red del
ensayo se retiraron; el respaldo conserva su `sha256` intacto y los cuatro
servicios activos siguieron arriba todo el tiempo.

**Qué cambia de estado:** el rollback **ya no está condicionado a este
ensayo**. Sigue condicionado a su precondición de contenido —cero pendientes
irrecuperables y los pasos 1–4 del procedimiento— y el residuo de la ventana
sigue ahí, porque ninguna maniobra sobre el endpoint lo lleva a cero.
