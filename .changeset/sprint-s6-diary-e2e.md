---
"@psico/types": minor
"@psico/api-client": minor
---

Sprint S6 — DiarioModule with E2E encryption.

`@psico/types`:

- Diary wire format: `DiaryEntryKind`, `DiaryEntrySummary`, `DiaryEntryDetail`,
  `DiaryListResponse`, `DiaryDetailResponse`, `DiaryMoodMap`, `DiaryTagCount`,
  `CreateDiaryEntryRequest`, `UpdateDiaryEntryRequest`,
  `CreateDiaryEntryResponse`, `DeleteDiaryEntryResponse`,
  `DiaryPromptOfTheDay`, `ShareDiaryEntryRequest`, `ShareDiaryEntryResponse`.

`@psico/api-client`:

- New `diarioApi` with 7 methods (list, getDetail, create, update, remove,
  getPromptOfTheDay, share). Ciphertext and nonce pass through unchanged.
- `apiClient.delete<T>()` added — symmetric with get/post/patch.
- `generated.ts` regenerated from the new OpenAPI surface (53 KB → 58 KB).
