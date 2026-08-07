---
"@psico/types": minor
"@psico/api-client": minor
---

Experience Player V2 — the presentation contract (ADR 0021) and server-owned
session recovery.

Adds `ExperienceSceneKind` (twelve ordered panels) alongside the four
`GuideStepKind` values, which are unchanged. A scene may bind to at most one
pinned Guide step; six of the twelve kinds can never bind at all, so a summary
or an intro is structurally incapable of moving somebody's record.

Also adds `ChapterExperienceDefinition`, `ExperiencePin` and the
scene/step binding matrix as data.

Adds `RecoverableGuideSessionResponse` and
`guideApi.getRecoverableSession({ guideKey, guideVersion })` — the read that
lets a reader pick a journey back up on another device. The answer is derived
from the accepted-step ledger rather than from anything a client stored, and
"not recoverable" is one indistinguishable answer for every situation that
produces it, so the read cannot be used to learn about sessions that are not
the caller's.
