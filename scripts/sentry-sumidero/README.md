# ¿Qué sale hacia Sentry?

Un receptor en 127.0.0.1 hace de Sentry, se arrancan los artefactos construidos y
se mira **cada byte** que llega: cuerpo, cabeceras y ruta.

```bash
pnpm turbo run build --filter=@psico/api      # una vez
node scripts/sentry-sumidero/ensayo.mjs todo  # api, worker y web
```

`api`, `worker` y `web` por separado; `--n=60` repeticiones por caso de traza;
`--sesiones` espera un minuto más a que el SDK vacíe las sesiones. Termina con 0 si
todo pasa.

`web` se puede acotar con `--hasta=servidor|edge|navegador|trazas`: hace las partes
en ese orden y para después de la que se diga. La última línea pone `PARCIAL` y lo
que faltó; un parcial no sustituye al ensayo entero.

- API y worker: `node dist/main` y `node dist/worker`, con un Postgres y un Redis
  **desechables** en Docker. Los fallos se provocan con una precarga
  (`sonda-api.cjs`), sin tocar el código; uno de ellos es natural: se le quita una
  tabla a la base.
- Web: copia cuatro páginas dentro de la aplicación, añade una línea al middleware,
  `next build` + `next start`, Chromium, y lo deja todo como estaba. **Reemplaza
  `apps/web/.next`.**
- Todos los valores son ficticios. No hace falta ningún secreto y no se conecta con
  ningún entorno.

Los señuelos se generan **al ejecutar**. Si fueran literales del guion, un SDK que
adjunta líneas de código los encontraría en él y acusaría una fuga que no hay.

## Web, lote a lote

Cada parte cierra su lote de sobres y lo revisa **en ese momento**, antes de que
empiece la siguiente (`compruebaLote`). Para aprobar, un lote tiene que:

- traer el evento del contexto que dice comprobar;
- poderse leer;
- haber recibido algún señuelo;
- no dejar salir ninguno.

Un lote vacío, o el de otro proceso, no aprueba: la línea dice `SIN RESPALDO` en
lugar de un cero. Y al final no puede quedar ningún sobre sin revisar.

### El «0 de 18» del servidor de Web no tenía respaldo

Hasta el 2026-11-24 el ensayo vaciaba los sobres del servidor —el componente y el
manejador de ruta— sin buscar nada en ellos. La línea «señuelos en los sobres del
servidor: 0 de 18» se calculaba sobre el lote de **Edge**. El número que se publicó
para el servidor de Web **no tenía respaldo**.

Reproducido: con un señuelo saliendo a propósito en el error del manejador de ruta,
aquel ensayo terminaba en verde, 20 de 20, y seguía diciendo «0 de 18».

Repetido el 2026-11-24 sobre la aplicación en `26eb115e`, con cada lote revisado al
cerrarlo:

| Lote                                    | Señuelos que salen | Introducidos en el lote | Eventos |
| --------------------------------------- | ------------------ | ----------------------- | ------- |
| servidor inicial                        | 0 de 18            | 12                      | 3       |
| Edge                                    | 0 de 18            | 11                      | 2       |
| navegador                               | 0 de 18            | 5                       | 6       |
| acción de servidor                      | 0 de 18            | 3                       | 1       |
| trazas del servidor, SIN `sentry-trace` | 0 de 18            | 9                       | 30      |
| trazas del servidor, CON `sentry-trace` | 0 de 18            | 10                      | 30      |

24 de 24 comprobaciones; 72 sobres revisados y ninguno sin revisar. En todos los
lotes se buscan los 18 valores, aunque no todos se introduzcan en todos: dos
(`textoEco` y `tituloEdge`) no se usan en el ensayo de Web. Es un ensayo finito: se
afirma lo que dice la tabla.

El hueco era sólo de ese lote: los de Edge, navegador —con la acción de servidor— y
trazas sí se revisaban antes de vaciarse. Los guiones de API y worker no cambian, y
sus baterías no se repitieron.

## Control negativo

Un ensayo que no encuentra nada tiene que demostrar que sabría encontrarlo.
`--control` espera fallos, y termina con 0 sólo si los hay:

```bash
# API y worker: cualquier binario anterior
node scripts/sentry-sumidero/ensayo.mjs api --control --dist=/ruta/apps/api/dist
# Web: una copia del código anterior, con el paquete que usaba
node scripts/sentry-sumidero/ensayo.mjs web --control --web=/ruta/apps/web --sdk=@sentry/nextjs
```

Y uno por lote, que no necesita código anterior:

```bash
node scripts/sentry-sumidero/ensayo.mjs web --fuga=servidor
```

Deja salir un señuelo **sólo** en el error inicial del servidor. `sonda-fuga.cjs` lo
mete en el sobre cuando ya va hacia el socket, después de las dos puertas del
proceso, y lo encuentra la comprobación de siempre. Termina con 0 únicamente si cae
«servidor inicial», por ese señuelo, y siguen en pie Edge, navegador y la acción de
servidor. Si no cae nada, o cae otra cosa, termina con 1.

La comprobación de lotes tiene además su prueba, que corre en la CI:
`apps/api/src/observability/ensayo-lotes.spec.ts`.

## Lo que este ensayo no es

Es local. **Sentry sigue sin activar**: la organización, la región y la recepción en
el proveedor real están pendientes, y nada de lo de arriba las sustituye. Al
activarlo hay que comprobar **cinco** superficies, un evento controlado en cada una:
API, worker, servidor de Web, Edge y navegador. Qué falta, en
[`apps/api/src/observability`](../../apps/api/src/observability/README.md).
