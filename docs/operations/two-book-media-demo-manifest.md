# Demo multimedia de dos libros — manifiesto operativo

`MEDIA_ASSETS_ARE_DEMO=true` · `FINAL_EDITORIAL_ASSETS=false`

Seis activos de **demostración** producidos para comprobar que las tres
modalidades se ven y se reproducen. No son másters. No sustituyen a la
producción editorial y no deben promocionarse como definitivos.

Generados el 2026-08-05 con `say` (voces del sistema, macOS) y `ffmpeg`. El
generador es descartable y vive junto a los archivos, no en el repositorio.

## Estado

```
SUBIDO_A_R2=false
SUBIDO_A_STREAM=false
CATALOGO_ACTUALIZADO=false
```

Los archivos están producidos y verificados, **y todavía no colocados**. El
catálogo no se tocó: `eec-c1-podcast-v1` y `eec-c1-video-v1` siguen en `DRAFT`,
y _Parejas que perduran_ no tiene definiciones de medios. En producción las dos
modalidades siguen diciendo «En producción», que es la verdad.

`PUBLISHED` sin activo y `AVAILABLE` sin acceso verificable no se escriben
nunca, así que el catálogo cambia **después** de que la fuente exista y
responda, no antes.

## Dónde están

```
~/.psico-ops/two-book-media-demo/
```

Fuera del repositorio a propósito: son binarios de prueba, no código. Junto a
ellos queda `make-demo-media.sh`, que los reproduce.

## Los seis activos

| Archivo                     | Libro                     | Cap. | Tipo      | Dur.   | Bytes   |
| --------------------------- | ------------------------- | ---- | --------- | ------ | ------- |
| `eec-c1-audiobook-demo.m4a` | emociones-en-construccion | 1    | AUDIOBOOK | 38.2 s | 480 256 |
| `eec-c1-podcast-demo.m4a`   | emociones-en-construccion | 1    | PODCAST   | 52.4 s | 646 812 |
| `eec-c1-video-demo.mp4`     | emociones-en-construccion | 1    | VIDEO     | 13.1 s | 188 953 |
| `par-c1-audiobook-demo.m4a` | parejas-que-perduran      | 2    | AUDIOBOOK | 26.6 s | 331 594 |
| `par-c1-podcast-demo.m4a`   | parejas-que-perduran      | 2    | PODCAST   | 36.1 s | 444 415 |
| `par-c1-video-demo.mp4`     | parejas-que-perduran      | 2    | VIDEO     | 13.5 s | 192 339 |

Audio: `audio/mp4`, AAC 96 kbps. Video: `video/mp4`, H.264 + AAC, 1280×720,
`+faststart`.

Las duraciones quedan por debajo de los rangos orientativos del encargo
(60–120 s audio, 90–180 s podcast, 45–90 s video) porque la voz del sistema lee
rápido. Se registran las reales; no se inventa ninguna.

### SHA-256

```
de48570333c7ed8e6958862359eb548fb7025d2433bba2c5b5b3ebd65b55739e  eec-c1-audiobook-demo.m4a
2a1c1b5b8ba31908f7a1d0692b3ab4f607f8dfecd21078b624273d5263386a66  eec-c1-podcast-demo.m4a
2e781e3de7bbc8c42eadca7d7aac1bb023fef6f7bc55f4bc4e418477368a8222  eec-c1-video-demo.mp4
ece237e64acca1bdc0cff6c89dc6184e8b79bf9930105b03f5d96a3d9604b886  par-c1-audiobook-demo.m4a
d0c619d28b75387113fc0ea50c040a28bc168ce3bcf0200c27597497cff61334  par-c1-podcast-demo.m4a
cf82455dc29e1e1d67cf4c14ead80b0d10f7a1ac65022f5cc1bfd82a67fa91ae  par-c1-video-demo.mp4
```

## Qué se narra, y por qué

Cada pista abre diciendo «Demostración. Edición provisional. Este no es el
máster final», y los dos videos llevan «DEMO · EDICIÓN PROVISIONAL» impreso en
la tarjeta. Nadie debería confundirlos con la obra.

**Emociones en construcción** — el fragmento del audiolibro narra el arranque
real del capítulo 1, texto de Jorge, unas 120 palabras. El podcast y el video
son copy escrito para esta prueba, no pasajes del manuscrito.

**Parejas que perduran** — nada del texto almacenado se narra. Ese capítulo
proviene de un OCR documentado como provisional en
[`parejas-demo-chapter-1-cleanup-plan.md`](./parejas-demo-chapter-1-cleanup-plan.md),
y la limpieza no está autorizada todavía. Las tres pistas son copy breve escrito
para la demo, que describe el tema del capítulo sin citarlo.

## Destinos previstos

| Tipo               | Destino                           | Requisito                                                        |
| ------------------ | --------------------------------- | ---------------------------------------------------------------- |
| AUDIOBOOK, PODCAST | bucket R2 de producción ya en uso | credenciales R2 productivas                                      |
| VIDEO              | Cloudflare Stream                 | `CLOUDFLARE_STREAM_ACCOUNT_ID` + `_API_TOKEN` + `_CUSTOMER_CODE` |

Sin las tres variables de Stream no hay `embedUrl` firmado, y el catálogo de
video se queda en `COMING_SOON`. Eso NO bloquea audiolibro ni podcast:
`VIDEO_SUBSTEP=BLOCKED_MISSING_EXISTING_PROVIDER_CONFIGURATION` y las otras dos
modalidades siguen su camino.

El orden no admite atajos, y está en
[`chapter-01-media-package.md`](../product/chapter-01-media-package.md) §5:
subir → confirmar que responde → referenciar en el catálogo → `DRAFT` a
`PUBLISHED` → smoke → desplegar.

## Cómo retirarlos

Cuando lleguen los másters reales:

1. Poner las definiciones de demo en `DRAFT` y desplegar. La interfaz vuelve a
   decir «En producción» sola; nadie ve un player roto.
2. Borrar los objetos de R2 y los videos de Stream por sus claves.
3. Subir el máster con `mediaVersion` **incrementado** — nunca reemplazar en
   sitio. La idempotencia de la finalización se deriva de
   `mediaKey + mediaVersion`, así que una versión nueva es una actividad nueva
   y una resubida silenciosa no lo sería.
4. Borrar este manifiesto y `~/.psico-ops/two-book-media-demo/`.
