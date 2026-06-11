# Sprint Cleanup Redundant ApiProperty — Plugin deduce de `@IsIn`

**Fecha:** 2026-06-11
**Rama:** `feature/sprint-cleanup-redundant-apiprop`
**Tests:** 635/636 API · 122/122 web · 20/20 mobile · 34/34 crypto (sin cambios — refactor)

---

## Lo que se construyó

Cierra deuda del sprint Swagger CLI plugin (#269). Después de habilitar el plugin, los 3 `@ApiProperty({ enum: DIARY_MOOD_IDS })` que sembramos en el sprint #267 (OpenAPI Mood Enum) quedaron como decorators redundantes — el plugin lee `@IsIn(DIARY_MOOD_IDS)` y emite el mismo `enum: [...]` en el schema.

### Cambios

3 archivos limpios (`apps/api/src/diario/dto/`):

- `create-entry.dto.ts` — removed `@ApiProperty` import + decorator del `mood` field.
- `update-entry.dto.ts` — ídem.
- `list-entries-query.dto.ts` — ídem.

Comments actualizados para explicar que el plugin deduce el enum automáticamente.

### Verification

OpenAPI re-emitido. Mood field sigue con enum:

```json
"mood": {
  "type": "string",
  "enum": ["calma", "foco", "energia", "reflexion", "alegria", "ansiedad", "tristeza"]
}
```

Pérdida menor: el `example: "calma"` que tenía cada `@ApiProperty` ya no surface (el plugin no infiere examples del primer enum value). Aceptable — Swagger UI muestra el dropdown del enum, que es más útil que un example string.

Cliente generado: 168.7 KB → 168.6 KB (≈ 0.1 KB diff por el example removido).

---

## Decisiones

1. **Removed comments largos** — el inline comment defendiendo el `@ApiProperty` no aplica más. Mantengo línea corta explicando que el plugin deduce el enum.
2. **NO restaurar `example`** — el dropdown del enum cumple la misma función UI sin overhead de decorator.
3. **Sin cambios en tests** — comportamiento runtime backend idéntico; OpenAPI metadata 99% idéntica.
4. **Sin cambios en frontend** — los TS enums generados (`CreateDiaryEntryDtoMood`, etc) siguen exactamente iguales.

---

## Smoke verification

- API tests **635/636** (sin cambios).
- @psico/crypto **34/34**.
- Web tests **122/122** (sin cambios).
- Mobile tests **20/20** (sin cambios).
- Typecheck + lint OK en API + Web + Mobile.
- OpenAPI generate:check OK.
- Verified manually: `enum: [...]` sigue presente en `CreateDiaryEntryDto.mood` del openapi.json.

---

## Deuda técnica abierta

- **Cualquier futuro `@IsIn`** en DTOs nuevos NO necesita `@ApiProperty` — el plugin lo deduce. Documentado en bitácora #267.
- **Response types narrowing** — sigue diferido al próximo sprint.

---

## Próximo paso

1. Commit + PR + merge a develop → sync main → push.
2. Sin deploy bloqueante — refactor metadata-only.
3. Próximos sprints: **Observability (Sentry)**, **Response types narrowing**, **JSDoc introspection**, **`SessionPrep.checkInMood` narrowing**.
