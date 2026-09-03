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

## Regenerating

```bash
node scripts/eec/build-guide-manifests.mjs
```

Deterministic: same inputs, byte-identical output, including `SHA256SUMS.txt`.
Keys are written in a declared order and `manifestSha256` is computed over the
manifest **with that field removed**, so a file cannot certify itself. Editing a
manifest by hand without regenerating is caught on the next `validate`.

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
