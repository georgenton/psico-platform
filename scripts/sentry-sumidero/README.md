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

## Control negativo

Un ensayo que no encuentra nada tiene que demostrar que sabría encontrarlo.
`--control` espera fallos, y termina con 0 sólo si los hay:

```bash
# API y worker: cualquier binario anterior
node scripts/sentry-sumidero/ensayo.mjs api --control --dist=/ruta/apps/api/dist
# Web: una copia del código anterior, con el paquete que usaba
node scripts/sentry-sumidero/ensayo.mjs web --control --web=/ruta/apps/web --sdk=@sentry/nextjs
```
