# EEC-C01 · guided suite v1.0 — manifests

Five microguides over *Emociones en Construcción*, chapter 1. These files are
the **declaration**: what each microguide is, which passage it anchors to, which
catalog targets it walks, and what it is allowed to do. Nothing here runs; the
CLI reads them and refuses anything they do not describe.

| File | What it is |
|---|---|
| `manifest.schema.json` | The JSON Schema every `mgNN` file is checked against. |
| `mg01…mg05.manifest.json` | One microguide each, in route order. |
| `chapter-guided-suite.manifest.json` | The suite: the five, the chapter they belong to, and the flag that hides them. |
| `SHA256SUMS.txt` | The checksums of the files above, for a second opinion. |

## The identity these files are pinned to

Every manifest declares `canonicalSha256`, the hash of the immutable source
`content/books/eec/C01/chapter.md`:

```
e10f42cedf881838578b7337355887c0e8cb2fe37b75dfa4204db509ac023018
```

The CLI recomputes it from the file and refuses when they differ. That is what
makes "these guides are about *this* chapter" a fact rather than a claim.

## Regenerating — HISTORICAL, do not run

`node scripts/eec/build-guide-manifests.mjs` was the recipe, and it no longer
applies to this package. Two independent reasons, both measured on 2026-11-16:

1. **The canonical source moved on.** The chapter was reopened as
   `EEC_C01_v1.1_TEXT_LOCKED_2026-11-13` (heading renamed to "Referencias", the
   internal reference-manager note withdrawn), so `content/books/eec/C01/chapter.md`
   now hashes to `6c3be6b3…`. These manifests are sealed against `e10f42ce…`,
   which is the revision the five approvals signed. The generator **refuses**,
   and it is right to: regenerating would emit manifests about a different text.
2. **Even with the right canonical it would not reproduce these files.** The
   2026-11-12 reseal wrote `publishAllowed: true` and recomputed every
   `manifestSha256`; the generator emits `publishAllowed: false`.

Nothing here is edited to silence that refusal. `v1.0/` is frozen — manifests,
approvals and `SHA256SUMS.txt` — because `checkApprovals` builds what it expects
from **the manifest each approval signed**, not from the live chapter file, which
is why reopening the chapter did not invalidate a single act.

### What to run instead

```bash
node scripts/eec/verify-guide-manifests.mjs --chapter=C01
```

Read-only, and it never looks at the live manuscript. It reports **four separate
guarantees**, because collapsing them was itself a defect:

| Guarantee | When |
|---|---|
| **Internal consistency** — the declared inventory is complete (five manifests, the suite, five approvals, *by `manifestId`*), every file hashes what `SHA256SUMS.txt` says, every `manifestSha256` recomputes from its own content with that field removed, required fields are present, and all six files declare one canonical revision | always |
| **Manifest ↔ approval correspondence** — `canonicalVersion`, `canonicalSha256` and `manifestSha256` agree; the three fields `checkApprovals` compares | where approvals are declared (only C01) |
| **Cryptographic verification** | **never here.** The public key lives in `EDITORIAL_APPROVAL_KEYS`, in the environment. `checkApprovals` acredits a valid signature against that keyring; this script does not |
| **Historical comparison** — every sealed file against its blob at a *declared* commit (`2bee9db5`, #844, where the five approvals were written) | when git can read that ref |

The distinction in the last two rows is the point. Internal consistency alone
says the package agrees **with itself** — and a package rewritten end to end
would agree with itself too. Only the historical comparison, against a reference
independent of these files, supports saying the signed material is the one that
was approved. The script's own output says which of the four it performed.

> **Why the inventory is declared and not discovered.** On 2026-11-16 the first
> version of this script, run against a directory containing only an **empty**
> `SHA256SUMS.txt` — zero manifests, zero approvals — answered `exit 0` and "the
> sealed package matches what was signed". It derived coverage from the files it
> found, so finding nothing was indistinguishable from finding everything. A
> count would not have fixed it either: five files carrying five *other*
> `manifestId`s still count five. The expectation is now written down, identity
> by identity, and `apps/api/src/content-core/verify-guide-manifests.spec.ts`
> keeps it that way.

The determinism rules above still describe how these files were built: keys in a
declared order, two-space indent, `manifestSha256` over the manifest without
itself.

## Running them

From `apps/api`, dry-run everywhere by default:

```bash
pnpm content:eec:c01:guides validate          # no database at all
pnpm content:eec:c01:guides plan              # read-only; resolves real ids
pnpm content:eec:c01:guides apply-targets --apply
pnpm content:eec:c01:guides create-drafts --apply
pnpm content:eec:c01:guides verify-drafts
pnpm content:eec:c01:guides preview-report --out=preview.json
```

On production or staging a write additionally needs
`--environment=<env> --confirm-production-draft`. Exit codes: `0` ok, `1`
refused or failed, `2` drift found.

## Si `create-drafts` se interrumpe a la mitad

Las cinco altas son cinco transacciones: `createDraft` toma el cerrojo del
capítulo y abre la suya, así que no hay envoltorio que las convierta en una. Lo
que sí está garantizado es la recuperación.

Un fallo inesperado devuelve `outcome: "PARTIAL_APPLY"`, **código de salida 3**,
la lista de las que sí quedaron creadas y `pending` con las que faltan.

**Compensación:** vuelve a ejecutar el mismo comando.

```bash
pnpm content:eec:c01:guides create-drafts --apply   # y en producción, con la ceremonia
```

La segunda pasada inspecciona antes de escribir: las que existen se reportan
`NOOP` y solo se crean las que faltan. No duplica, no reescribe y **no borra
nada automáticamente** — deshacer un alta es una decisión de una persona, no el
efecto secundario de un reintento.

Si en lugar de 3 devuelve 2, no es lo mismo: hay una fila que no coincide con su
manifiesto, no se escribió nada, y eso necesita que alguien lo mire antes de
insistir.

## What these manifests may not do

- **Publish.** `status` is `DRAFT` and `publishAllowed` is `false` in all five.
  This phase creates drafts; making one visible is a separate, later decision.
- **Be visible.** The route stays dark behind `EEC_C01_GUIDED_SUITE_V1`, which
  is off by default.
- **Touch the pilot.** `eec-c1-cuerpo-antes-que-mente` keeps serving the V1
  binary through the legacy adapter, and a manifest that so much as names it is
  refused.
- **Carry a correct answer.** `correctOptionKey` is a grading datum; it lives in
  the server-side exercise catalog and never in an artifact a client can read.
- **Store what a reader writes.** Every field in `privacyPolicy` is `false`.
