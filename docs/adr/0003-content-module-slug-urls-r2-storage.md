# ADR 0003 — ContentModule: slugs en URLs y Cloudflare R2 como storage

**Fecha:** 2026-04-27
**Estado:** Aceptado
**Autores:** Jorge Quizamanchuro

---

## Contexto

El módulo de contenido (ContentModule) introduce libros y capítulos que necesitan:

1. **URLs legibles** para compartir en redes sociales y para SEO (web app en Next.js).
2. **Almacenamiento de archivos de audio y video** sin costo de egress en la fase de validación (Ecuador → LATAM).

Se evaluaron dos decisiones independientes:

### Decisión A — Identificador público en URLs: `slug` vs `id`

| Opción      | Ejemplo URL                        | Consideraciones                      |
| ----------- | ---------------------------------- | ------------------------------------ |
| `id` (CUID) | `/books/clx3k2j0000001`            | Opaco, no compartible, sin SEO value |
| `slug`      | `/books/emociones-en-construccion` | Legible, compartible, indexable      |

### Decisión B — Proveedor de object storage

| Opción           | Egress    | SDK                  | Complejidad                  |
| ---------------- | --------- | -------------------- | ---------------------------- |
| AWS S3           | $0.09/GB  | `@aws-sdk/client-s3` | Estándar                     |
| Cloudflare R2    | $0        | S3-compatible        | Mismo SDK, distinto endpoint |
| Supabase Storage | $0.021/GB | Custom SDK           | Vendor lock-in adicional     |
| Backblaze B2     | ~$0.01/GB | S3-compatible        | Menor ecosistema             |

---

## Decisiones

### A — Slugs en URLs de contenido

Usamos **slugs únicos** como identificador público para libros. Las URLs de contenido siguen el patrón:

```
GET /content/books/:slug
GET /content/books/:slug/chapters/:order
POST /content/books/:slug/chapters
```

El campo `slug` es único en la tabla `Book` e indexado. Internamente, el servicio resuelve `slug → id` en una sola consulta antes de operar sobre capítulos y ejercicios.

Los capítulos se identifican por su campo `order` dentro de un libro (entero 1-based), no por un slug propio. Un capítulo no tiene identidad independiente del libro — esta decisión simplifica las URLs y evita gestionar slugs anidados.

### B — Cloudflare R2 como object storage

Usamos **Cloudflare R2** con el SDK `@aws-sdk/client-s3` configurando un endpoint custom:

```
endpoint: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

El `StorageModule` abstrae el proveedor detrás de un único método `uploadFile()`. La migración futura a AWS S3 o cualquier S3-compatible requiere únicamente cambiar las variables de entorno (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`) sin modificar código de aplicación.

---

## Consecuencias

### Slugs

**Positivas:**

- URLs humanas y compartibles desde el día 1, sin trabajo adicional de marketing.
- SEO disponible para la web app Next.js sin slugs artificiales.
- El campo `slug` es inmutable una vez publicado el libro — los links externos no se rompen.

**Negativas / trade-offs:**

- El slug debe ser único globalmente. Se valida en el DTO (`IsSlug`, unicidad en BD).
- Un cambio de título no actualiza el slug automáticamente (comportamiento correcto: los links no deben romperse).
- Requiere una columna adicional indexada en `Book`.

### Cloudflare R2

**Positivas:**

- Costo de egress: **$0** — crítico para una startup en fase de validación con usuarios consumiendo audio/video.
- Mismo SDK que S3: la curva de aprendizaje del equipo es nula.
- Integración nativa con Cloudflare CDN para baja latencia en LATAM.
- La abstracción en `StorageModule` garantiza portabilidad sin vendor lock-in.

**Negativas / trade-offs:**

- R2 no tiene todas las funcionalidades de S3 (sin S3 Transfer Acceleration, sin Glacier). No relevante para este caso de uso.
- Requiere cuenta Cloudflare y configuración de CORS en el bucket para uploads directos desde el cliente (si se implementa en el futuro).

---

## Alternativas descartadas

**IDs en URLs:** Un CUID como `clx3k2j0000001` no aporta valor semántico al usuario ni al motor de búsqueda. El costo de agregar un campo `slug` es mínimo comparado con el beneficio de URLs compartibles.

**AWS S3:** El costo de egress en LATAM ($0.09/GB) sería significativo a escala. R2 ofrece el mismo API con egress gratuito — no hay razón para pagar más durante la validación.

**Supabase Storage:** Introduce un segundo proveedor de base de datos (Supabase) en un stack que ya usa PostgreSQL en Railway. Complejidad sin beneficio.

---

## Referencias

- [Cloudflare R2 — S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/)
- [AWS SDK v3 — S3Client custom endpoint](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-s3/)
