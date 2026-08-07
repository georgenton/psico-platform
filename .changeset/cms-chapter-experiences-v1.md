---
"@psico/types": minor
"@psico/api-client": minor
---

CMS V1 (#637): chapter experience definitions can now live in the database.

`@psico/types` gains the back-office view shapes (`AdminChapterExperiences`,
`AdminExperienceRow`, `AdminExperienceDraft`); the generated client picks up the
ADMIN-only endpoints that create, save and publish them. The runtime read
contract is unchanged — `ChapterExperienceDefinition` is still exactly what the
Player consumes, which is why the editor can store it verbatim.
