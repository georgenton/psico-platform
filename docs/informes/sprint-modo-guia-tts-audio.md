# Sprint — Modo Guía: narración TTS + audio real a R2

**Fecha:** 2026-07-13
**Rama:** `feature/modo-guia-tts-audio`
**Cierra:** el placeholder "Audio en producción" de Modo Guía para los 3 capítulos de la Parte I de _Emociones en Construcción_.

---

## 1. Qué se construyó

Modo Guía mostraba un placeholder honesto porque no existía ninguna fila `Audio` ni archivo en R2. Este sprint entrega **audio real reproducible** vía narración TTS, más el pipeline reutilizable para reemplazarlo por grabaciones profesionales sin tocar código.

- **`apps/api/scripts/generate-chapter-audio.mjs`** — lee los bloques narrables de cada capítulo (PARAGRAPH/HEADING/QUOTE/PAUSE), sintetiza con **OpenAI TTS** (voz `nova`, `tts-1`), sube el mp3 a R2 (`audio/<bookSlug>/cap-<order>.mp3`), y hace upsert de la fila `Audio` (idempotente por capítulo, `deleteMany` + `create`). Chunking ≤3800 chars en fronteras de párrafo/oración, concurrencia 4, `--dry-run`.
- **Generación ejecutada en prod** (decisión del usuario: "Generar narración TTS ahora"): 3 capítulos, ~145k chars, 42 chunks, ~2.6h de audio total. `Audio` rows: Cap 1 (48min, 54 MB), Cap 2 (71min), Cap 3 (39min). Transcripciones guardadas en `Audio.transcription`.

## 2. Fix descubierto: `getAudio` → URLs firmadas

`R2_PUBLIC_URL` en prod es el **endpoint S3 autenticado** (`…r2.cloudflarestorage.com/psico-media`), NO una URL pública — un GET sin firma da 400. `getAudio()` devolvía `audio.fileUrl` crudo, lo que nunca habría reproducido.

Fix (implementa el viejo `TODO senior`):

- `Audio.fileUrl` ahora guarda la **KEY** del objeto R2 (`audio/…/cap-1.mp3`).
- `getAudio()` inyecta `StorageService` y **firma** la key con `getSignedUrl(key, 6h)`. Filas legacy con URL completa (`http…`) se devuelven crudas (backward-compat).
- Verificado end-to-end: la URL firmada da **206 Partial Content · audio/mpeg · 54 MB** para cap-1.
- +1 test (`presigns the R2 object when fileUrl is a key`); las 16 instanciaciones del spec reciben el mock de `StorageService`. 17/17 verdes.

## 3. Docs

`apps/api/src/lector/README.md` §audio corregido: `fileUrl` = KEY, `getAudio` presigna (6h TTL, no público), + el flujo ops del script TTS y la ruta de reemplazo por grabaciones profesionales (mismo key → update `fileUrl`).

## 4. Privacidad (ADR 0007)

Los libros son contenido público licenciado, no E2E. La firma existe solo porque el bucket no se sirve público. La narración es prosa del libro; el transcript es contenido público. Nada del Diario/Eco entra al audio.

## 5. Verificación

- API: typecheck + lint OK · 17/17 lector tests.
- Prod: 3 filas `Audio` con keys · mp3 en R2 · presign → 206 audio/mpeg.
- **Requiere el deploy del cambio de `getAudio`** para que el cliente reciba la URL firmada (antes de eso, prod devolvería la key cruda). Nadie usa el audio aún, sin ventana de impacto real.

## 6. Deuda / siguiente

- Migrar a `expo-audio` / `react-native-track-player` para metadata dinámica de lock-screen (hoy lee tags embebidos del archivo; el mp3 TTS no los trae).
- Reemplazar TTS por grabación humana cuando exista (drop-in: mismo key, update `fileUrl`).
- `R2_PUBLIC_URL` apunta al endpoint S3 — si algún día se quiere servir assets públicos (covers reales), habría que configurar el dominio público r2.dev/custom y separar del audio (que se queda firmado).
