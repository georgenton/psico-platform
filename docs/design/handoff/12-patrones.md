# 12 · Patrones

`Patrones.html` — insights derivados del diario y la actividad del usuario. Pro feature.

---

## Pantalla: Patrones

**Ruta sugerida:** `/patrones?period=30d`

### Datos que muestra

- `user.tier`: enum
- `period`: `{ from, to, label }`
- `hourMood[]`: array — distribución de mood por hora del día
  - `hour`: 0-23
  - `moodCounts`: `{ [moodId]: number }`
- `moodMap`: objeto — mood por día del período
  - `byDay`: `{ [iso_date]: { moodId, swatch } }`
- `themes[]`: array — temas recurrentes detectados (NLP sobre diario cifrado, hecho cliente-side)
  - `id`: string
  - `label`: string
  - `count`: number
  - `entryIds[]`: string[]
- `correlations[]`: array — pares de variables con correlación
  - `id`, `label` ("Lectura ↔ Calma"), `coefficient`, `direction` ("+" | "-")
- `ecoNotes[]`: array — observaciones generadas por Eco sobre los datos
  - `id`, `text`, `relatedTheme`
- `weeklySummary`:
  - `headline`: string
  - `narrative`: string (markdown)
  - `generatedAt`: Date
- `vocab[]`: array — palabras recurrentes en diario (extraído cliente-side desde texto plano post-decrypt)
  - `word`, `count`, `delta` vs período anterior

### Acciones del usuario

- **Cambiar período**: querystring.
- **Click theme**: filtra entries del diario.
- **Click correlación**: muestra explicación detallada.
- **Regenerar resumen semanal**: POST.
- **Compartir resumen con terapeuta**: POST con re-encrypt.

### Llamadas HTTP necesarias

- **Método:** GET — `/api/patrones?period=30d` — Auth: Sí (Pro)
  - **Response:** `{ hourMood, moodMap, themes, correlations, ecoNotes, weeklySummary, vocab }`
  - Nota: themes/vocab se calculan en backend con embeddings de los `excerpt` cifrados (técnicas de privacy-preserving NLP) o se calculan en cliente y se mandan agregados anonimizados al servidor.
- **Método:** POST — `/api/patrones/weekly-summary/regenerate` — Auth: Sí (Pro, rate-limit 1/día)
- **Método:** POST — `/api/patrones/share-with-therapist` — Auth: Sí

### Estados de la pantalla

- **Loading:** skeleton de heatmap + cards.
- **Error:** 500 → retry.
- **Empty (sin diario suficiente):** "Necesitas al menos 7 entradas de diario para ver patrones" + CTA.
- **Locked (free):** paywall que muestra una preview blureada con CTA a Pro.

### Notas

- Las correlations no son causales — la UI debe explicitarlo ("Esto es una correlación, no una causa").
- `ecoNotes` es generado por el modelo de Eco con permiso explícito del usuario (toggle en Privacidad).

---

## Endpoints de esta área

| Método | Endpoint                                  | Auth     | Descripción                      |
| ------ | ----------------------------------------- | -------- | -------------------------------- |
| GET    | `/api/patrones`                           | Sí (Pro) | Insights del período             |
| POST   | `/api/patrones/weekly-summary/regenerate` | Sí (Pro) | Re-generar resumen semanal       |
| POST   | `/api/patrones/share-with-therapist`      | Sí (Pro) | Compartir snapshot con terapeuta |
