---
"@psico/types": minor
---

Experience Player V2 — the presentation contract (ADR 0021).

Adds `ExperienceSceneKind` (twelve ordered panels) alongside the four
`GuideStepKind` values, which are unchanged. A scene may bind to at most one
pinned Guide step; six of the twelve kinds can never bind at all, so a summary
or an intro is structurally incapable of moving somebody's record.

Also adds `ChapterExperienceDefinition`, `ExperiencePin` and the
scene/step binding matrix as data.
