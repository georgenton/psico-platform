# PR-0.2 — Fail-closed kill switch for the emotional map

**Flag:** `EMOTIONAL_MAP_PUBLIC` (default **on**). A RESPONSE-ONLY flag —
declared in `REQUIRED_DEFINED_FLAGS` of `cache-identity.ts` (must be defined on a
deployed box, no fixed value pinned), and listed in `RESPONSE_ONLY_FLAGS` so it
moves the response fingerprint but **not** the facts fingerprint. Turning it off
changes what we serve, not how snapshots are computed.

**Intent:** a single lever that takes the emotional map down cleanly — 503 on the
direct surface, `null`/maintenance everywhere else — without touching data,
without recomputing, and without leaking through a side door. Fail-closed: when
off, no scoring runs on any path (`assertPublicOrThrow()` is the first line of
`getForUser`, before privacy revision, cache, or compute).

---

## What the switch does

- `GET /api/emotional-map` → **503** with envelope `{ code: "EMOTIONAL_MAP_UNAVAILABLE" }`.
- `getForHome()` (the home aggregator's accessor) → **`null`** (never throws).
- `EmotionalMapSnapshotProcessor` (monthly cron) → **hard no-op** (writes nothing).
- Clients render a **maintenance** state, distinct from "no data yet".

Copy is descriptive, not an absolute promise: **"Tus registros siguen
guardados."** — never "nada se pierde".

---

## A.6 — Surface audit: everything that reads `EmotionalMapResult` / `EmotionalMapSnapshot`

Swept `apps/api/src` for `EmotionalMapService` injection, `EmotionalMapResult`,
and the `emotionalMapSnapshot` Prisma model. Every consumer classified below.

| Surface                                                                | Reads                                                  | Behavior when `EMOTIONAL_MAP_PUBLIC=off`                                                                              | Covered by                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `GET /api/emotional-map` (`EmotionalMapController`)                    | `getForUser`                                           | **503** `EMOTIONAL_MAP_UNAVAILABLE`                                                                                   | `assertPublicOrThrow` (first line)         |
| `GET /api/home` → `HomeService`                                        | `getForHome`                                           | `emotionalMap: null`, rest of Home intact                                                                             | `getForHome` returns null                  |
| `GET /api/eco/suggestions` + Home `ecoMoment` → `EcoSuggestionService` | `getForHome` (was `getForUser` — **fixed in this PR**) | map ignored → no mood-based opener; other rules fire; **no 503**                                                      | switched to `getForHome`; degrades to null |
| `GET /api/evolucion` → `EvolucionService`                              | `emotionalMapSnapshot.findMany`                        | `emotionalMapAvailable:false`, `emotionalSeries:null`, snapshot table **not read**; stats + milestones stay available | `flagEnabled` gate before the query        |
| `EmotionalMapSnapshotProcessor` (cron, worker)                         | writes snapshots                                       | **hard no-op**, writes nothing                                                                                        | `flagEnabled` guard after job-name check   |
| `ResonancesService`                                                    | `invalidateBestEffort` only (cache bust)               | harmless; no read, no throw                                                                                           | write-path only                            |
| `MoodService`                                                          | `invalidateBestEffort` only (cache bust)               | harmless; no read, no throw                                                                                           | write-path only                            |
| `UsersService` (opt-out / delete-account)                              | `emotionalMapSnapshot.deleteMany`                      | delete still works                                                                                                    | write-path only                            |
| **Data export** (`DataExportProcessor`, `exportSchemaVersion: 1`)      | —                                                      | **does not include the emotional map** (exports profile + progress + subscription only) — nothing to gate             | N/A — map absent from export               |
| **Admin reports / Pulso**                                              | —                                                      | Pulso reads `EcoMessageReport` + platform counters, **not** the emotional map                                         | N/A — no map read                          |
| **Recommendations** (`recos` in Home / Books)                          | —                                                      | derived from books/progress, **not** the emotional map                                                                | N/A — no map read                          |

**Bug caught by the audit (fixed here):** `EcoSuggestionService.gatherSignals`
called `emotionalMap.getForUser`, which throws 503 when the map is off. Because
`HomeService` calls `topForHome` (→ `gatherSignals`), turning off the map would
have **503'd `/api/home` and `/api/eco/suggestions`** — collateral damage far
beyond the map surface. Switched to `getForHome` (null when off) + `map?.momento`.
Regression tests added: `eco-suggestions.spec.ts` asserts `getForUser` is never
called on these surfaces and the suggestions still return with no mood opener.

**Net:** the only user-facing surfaces that change under the switch are the map
screen (503 → maintenance), the Home mini-map (`null` → maintenance), the
Evolución emotional-history section (`emotionalMapAvailable:false` → maintenance),
and the Eco mood-based opener (silently omitted). Everything else — Home stats,
Evolución stats + milestones, Eco itself, reports, exports, recommendations —
stays fully available.

---

## A.5 — Runbook: turning the switch off → on after an incident

Turning `EMOTIONAL_MAP_PUBLIC` back **on** is not just a flag flip. While the map
was down, cached maps and (once the cron ran) monthly snapshots may reflect a
different world than the one we now want to serve. Do this in order:

1. **Always bump the cache epoch.** Set `EMOTIONAL_MAP_CACHE_EPOCH` to the next
   integer (API **and** worker). This invalidates every cached map so the first
   read after re-enabling recomputes from live data instead of serving a
   possibly-stale blob produced under the incident.

2. **If facts or eligibility changed while off** — e.g. we fixed a scoring bug,
   changed a model gate, or corrected which observations are eligible — **also
   bump `EMOTIONAL_MAP_FACTS_EPOCH`** (API + worker). This retires the old
   snapshots too (they carry the facts identity; a mismatched epoch drops them
   from the Evolución series), so history plotted after re-enabling reflects the
   corrected model, not the incident's.

3. **Set the flag on** (`EMOTIONAL_MAP_PUBLIC=on`, or remove the override) on the
   API and the worker.

4. **Probe identity parity.** Confirm API and worker report the same
   `runtimeIdentity` (same critical flags, same epochs). A split-brain here means
   the cron writes snapshots the API would reject.

5. **Smoke.** `GET /api/emotional-map` → 200 (not 503); `GET /api/home` →
   `emotionalMap` populated; `GET /api/evolucion` → `emotionalMapAvailable:true`.
   Spot-check one real account.

Rule of thumb: **off→on ⇒ CACHE_EPOCH++ always; FACTS_EPOCH++ if the model or
eligibility moved.** When in doubt, bump both — recomputing is cheap; serving a
map from the incident is not.

---

## Tests

- `emotional-map.public.spec.ts` — unit tripwires: `getForUser` throws 503 +
  code, provider/prisma/redis never called; `getForHome` returns null when off
  and delegates when on; snapshot processor hard no-op.
- `emotional-map.public.e2e-spec.ts` — **real HTTP**: `GET /api/emotional-map`
  with the switch off → 503, `body.code === "EMOTIONAL_MAP_UNAVAILABLE"`, and
  provider/Prisma/Redis never touched on the request path.
- `evolucion.service.spec.ts` — off → `emotionalMapAvailable:false`,
  `emotionalSeries:null`, snapshot table not read; stats + milestones intact.
- `home.service.spec.ts` — off → `emotionalMap:null`, rest of Home works.
- `eco-suggestions.spec.ts` — off → suggestions still return, no mood opener,
  `getForUser` never called.
- `cache-identity.spec.ts` — `PUBLIC` in `RESPONSE_FLAGS`, moves response (not
  facts) fingerprint; deployed box refuses boot without it; boots with off.
- Client (maintenance state, not zeros / not "gathering data"):
  `InicioV2.test.tsx`, `mapa.pr02.test.tsx`.

**Do not merge yet** (per instruction) — this doc + code land together on
`feature/pr-0.2-emotional-map-public`; CI green is the gate, merge is held.
