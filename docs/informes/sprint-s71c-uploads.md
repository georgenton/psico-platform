# Sprint S71.C-uploads — Cover image + audio upload al R2

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-s71c-uploads`
**Tests:** 594/595 API (+14 nuevos · 1 skipped sentinel) · 56/56 web · 34/34 crypto
**Design handoff:** [docs/design/handoff/16-author.md §diseño + §editor](../design/handoff/16-author.md)

---

## Lo que se construyó

Cierra los 2 endpoints multipart del módulo Author que estaban pendientes desde el handoff: la portada del libro y el audio del capítulo. Ambos suben a Cloudflare R2 vía `StorageService` (que ya existía global) y actualizan el row correspondiente.

### Backend

**Nuevo servicio `AuthorUploadsService`** dentro de `AuthorModule`:
- Inyecta `PrismaService` y `StorageService`.
- 2 métodos: `uploadCoverImage` y `uploadChapterAudio`.
- Ownership guard explícito + `BOOK_LOCKED` (400) cuando el libro está en IN_REVIEW o ARCHIVED.
- Validación de MIME + size cap antes del upload (no se descarga 50MB para luego rechazar).
- Helper `fileExtension(mime, fallback)` mapea MIME → ext.

**2 endpoints nuevos** bajo `/api/autor/libros/:id/*`:

```
POST /api/autor/libros/:id/cover-image
  Throttle: 10/min/user
  Multipart field: "file"
  Validates: image/jpeg|jpg|png|webp, max 5MB
  Stores: autor-books/<bookId>/cover-<random>.<ext>
  Updates: AuthorBook.coverArtUrl
  Returns: { ok, coverArtUrl }

POST /api/autor/libros/:id/capitulos/:n/audio
  Throttle: 5/min/user
  Multipart: file + optional title
  Validates: audio/mpeg|mp3|mp4|m4a|wav|webm|ogg, max 50MB
  Stores: autor-books/<bookId>/audio/<chapterId>-<random>.<ext>
  Appends: AUDIO block to chapter.blocks JSON (preserves existing)
  Bumps: chapter.version
  Returns: { ok, url, version, block }
```

Bloque AUDIO shape:

```ts
{ kind: "audio", content: title || "Audio del capítulo",
  meta: { url, mimeType, sizeBytes } }
```

Esto es compatible con el `ChapterBlockKind.AUDIO` del lector (S6) — cuando el libro se aprueba, el copy-on-publish ya lo mapea correctamente.

### Tipos compartidos (+3)

- `AuthorCoverUploadResponse`
- `AuthorAudioBlock`
- `AuthorAudioUploadResponse`

### Cliente API

- `authorApi.uploadCover(bookId, file)` con `FormData` + `apiClient.postFormData`.
- `authorApi.uploadChapterAudio(bookId, n, file, title?)`.

### Web — UI

**`CoverImageUpload.tsx`** en `apps/web/src/app/autor/libros/[id]/`:
- Botón "Subir imagen" → input file oculto, accept JPG/PNG/WebP, max 5MB.
- Validación client-side (size + MIME) antes del POST.
- Preview thumbnail 64x96 con `border` + fallback "Sin imagen".
- State machine `idle → uploading → idle | error`.
- Card propia en la página del libro debajo de `BookMetaForm`.

**`AudioUpload.tsx`** en `apps/web/src/app/autor/libros/[id]/capitulos/[n]/`:
- Card lavender al final del `ChapterEditor`.
- Input para título opcional + botón "Elegir archivo".
- Accept de MIMEs + extension whitelist.
- Cuando upload OK: `onUploaded(block, version)` se llama → el editor append-ea el bloque AUDIO localmente y bumpea la version. El backend ya persistió, así que no hay race.
- Flash "Audio agregado al capítulo" 3s.

### Tests (+14)

`author-uploads.service.spec.ts`:
- Cover:
  - 400 FILE_REQUIRED.
  - 400 INVALID_IMAGE_TYPE para MIME no permitido.
  - 400 FILE_TOO_LARGE >5MB.
  - 404 BOOK_NOT_FOUND si no existe.
  - 404 BOOK_NOT_FOUND si pertenece a otro autor.
  - 400 BOOK_LOCKED cuando IN_REVIEW.
  - Happy path: upload + update + return shape.
  - Extension mapping WebP.
- Audio:
  - 400 FILE_REQUIRED.
  - 400 INVALID_AUDIO_TYPE.
  - 400 FILE_TOO_LARGE >50MB.
  - 404 CHAPTER_NOT_FOUND.
  - Happy path: upload + append block + bump version.
  - Default title cuando se omite.

---

## Decisiones

1. **Servicio separado `AuthorUploadsService`** (no extiendo `AuthorService`) — file uploads tienen failure modes muy distintos (network, R2 throttling, MIME spoofing) y mezclarlos contamina la lógica del CRUD.
2. **No CDN signed URLs** — la portada y audio del autor son públicos (van al catálogo). `StorageService.uploadFile` retorna URL pública estable.
3. **Append block en lugar de replace** — el autor puede subir varios audios al mismo capítulo si quiere (intro + outro + ejemplo). Reorderearlos con ↑↓ ya funciona.
4. **Validación double-side** — client side rechaza antes del POST (UX), server-side autoritativo (security). MIME del cliente puede mentir; server check es la barrera real.
5. **BOOK_LOCKED guard** — no se permite cambiar portada ni audio cuando libro está IN_REVIEW o ARCHIVED. El admin está revisando lo que el autor le envió.
6. **Throttle 10/5 per minute** — cover 10 (más casual), audio 5 (más caro de procesar/almacenar).
7. **Sin streaming chunked** — para v1, multipart simple es suficiente. Si autores piden subir 100MB+ audios, agregar tus-pattern uploads.

---

## Privacy

- Texto del autor + audio + portada **NO son E2E** — son contenido público licenciado.
- R2 keys incluyen `bookId` + random suffix — no son adivinables sin acceso al row del DB.
- Sin logs de buffer/content del archivo (solo metadata size).
- Sin telemetría de qué archivos subió cada autor (más allá del row de `AuthorBook`).

---

## Smoke verification (local)

- API typecheck OK.
- API lint clean (4 warnings preexistentes, sin errores nuevos).
- API tests 594/595 (+14 nuevos, 1 skipped sentinel).
- Web typecheck + lint clean.
- Web tests 56/56.
- `@psico/types` y `@psico/api-client` builds OK.

---

## Deuda técnica abierta

- **Revenue share** (`/api/autor/cobros`) sigue pendiente. Probablemente último sprint del módulo Author antes de v2.
- **Image processing** (resize, format conversion, EXIF strip) — la imagen se almacena as-is. Si Pulso detecta covers gigantes, agregar Sharp-based processor en BullMQ.
- **Audio transcoding** — el audio se almacena as-is. iOS Safari pre-16 no toca .ogg/.webm; cuando alguno reporte, agregar transcoder a MP3 vía BullMQ.
- **Drag-reorder de bloques** — para reordenar el audio recién subido, el autor usa ↑↓ existentes. DnD library es S71-front-B.
- **Delete uploaded asset** — si el autor sube y se arrepiente, no hay endpoint para borrar. Append solo. Cuando un libro se archiva, los assets de R2 quedan colgados.
- **Mobile** del editor de autor — sigue desktop-first.
- **Tests UI dedicados** para `CoverImageUpload` y `AudioUpload` — diferidos.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Deploy a Railway (sin migration, sin envs nuevos — R2 ya está configurado).
3. Smoke walk:
   - Como AUTHOR: subir portada JPG <5MB → ver thumbnail renderizado.
   - Crear capítulo → subir audio MP3 <50MB → ver el bloque audio al final.
   - Cambiar a IN_REVIEW (submit) → intentar subir cover → 400 BOOK_LOCKED.

Después: S71.C-revenue (cobros + revenue share) o nuevo sprint.
