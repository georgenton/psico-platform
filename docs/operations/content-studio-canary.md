# Content Studio — production canary

How to put Content Studio in front of real people, starting with the smallest
action that could teach us anything.

There is deliberately **no Railway staging**. A second Postgres and Redis is a
recurring cost, and the hardening pass established that the invariants which
actually protect readers — draft isolation, mark preservation, media identity —
are proven against a real database in CI rather than by clicking. So the first
real-world exposure is a canary on production, kept small on purpose.

That is a trade, and worth naming: the thing we give up is a place to make
mistakes cheaply. Phase A compensates by making the first mistake impossible to
make large.

## Before anything

| Check                                             | Expected                                |
| ------------------------------------------------- | --------------------------------------- |
| The stack is merged and deployed                  | Jorge's call, not this document's       |
| `CLOUDFLARE_STREAM_UPLOADS_ENABLED` in production | absent or `false`                       |
| Production `R2_BUCKET_NAME`                       | **not** `psico-media-dev`               |
| Editor's role                                     | `ADMIN`, strictly — `AUTHOR` is refused |

Stream needs nothing. All three `CLOUDFLARE_STREAM_*` variables are absent from
production, so `uploadsAvailable()` is false without anybody setting anything,
and the CMS shows "Subida de video no disponible todavía". Readers see the
existing **Próximamente** cards, exactly as they do today.

## Phase A — ADMIN pilot

One trusted ADMIN. The first production action is a text edit small enough that
being wrong costs nothing.

1. Open **Pulso → Contenido**. The book list loads.
2. Open one existing book, then one chapter.
3. Change a few words in a single paragraph. Not a rewrite.
4. **Guardar borrador.** The reader sees nothing yet — this is the claim being
   tested, so it is worth confirming from a second browser as a logged-out
   reader.
5. Reload the page. The draft is still there, with the edit.
6. **Guardar y previsualizar.** Preview saves first, by design, so the preview
   is never of something the server does not have.
7. Read the preview as a reader would. Check the surrounding blocks, not just
   the edited one.
8. Decide deliberately: publish it, or leave it as a draft. Both are useful
   outcomes; drifting away without deciding is not.
9. Only after all of the above, and only if the pilot wants to: one image,
   audiobook or podcast operation. Upload never publishes, so the upload and the
   decision to publish are separate acts and can be separated in time.

Stop at the first thing that says something confusing. The question in Phase A
is not "did it work" — the tests answer that — but "did the screen tell the
truth about what just happened".

## Phase B — reader canary

Runs only after Phase A published one intentional, low-risk change.

Two to five people who never open the CMS. Ask them to open the edited chapter
on the web and on a phone, and to report anything that looks off:

- the chapter loads on both;
- the changed text is there, and reads correctly in context;
- images render with their captions;
- the audiobook plays;
- every podcast episode is listed, not just the newest;
- **their own highlights and annotations are still where they left them** — the
  load-bearing one, and the reason block identity is stable;
- nothing plays on its own;
- video says Próximamente.

Someone from the canary group having pre-existing highlights in that chapter is
worth arranging on purpose. A canary of fresh accounts cannot detect the failure
we most care about.

## Rollback

Editorial rollback and code rollback are different things, and conflating them
is how content gets destroyed to fix a bug.

**Text** — publish a corrective revision through Content Studio. The superseded
revision stays resolvable, which is what keeps a reader's mark meaningful.
Do not delete revisions.

**Images** — publish an editorial revision that removes or replaces the image.
Do **not** delete the R2 object: an older published revision may still reference
it, and the object costs nothing next to breaking history.

**Audiobook** — publish the correct master as a _new version_. Never overwrite a
version's identity, and never repoint an old version at new bytes: someone who
finished v1 finished v1. The publish path already freezes the previous version
to its exact bytes before moving the pointer, and that guarantee only holds if
nobody works around it manually.

**Podcast** — add or correct the episode in question. Deleting a different
episode is not a rollback; episodes are independent, and 0..N is the contract.

**Video** — not active.

**Code** — an ordinary deploy rollback, entirely separate from all of the above.
Rolling back a deploy does not un-publish editorial content, and publishing a
corrective revision does not require a deploy.

Nothing in this list is destructive. If a rollback seems to require deleting an
asset, that is a signal to stop and ask, not to proceed carefully.

## When Stream capacity is bought

Set `CLOUDFLARE_STREAM_UPLOADS_ENABLED=true` alongside the three credential
variables. That is the whole change; the C3 code is already deployed and tested.
Then `SMOKE_19c` in `content-studio-smoke.md` becomes runnable for the first
time, and should be run before any editor is told video upload exists.
