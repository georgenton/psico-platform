"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  EXPERIENCE_SCENE_KINDS,
  type ChapterExperienceDefinition,
  type ChapterExperiencePublicView,
  type ExperienceSceneDefinition,
  type ExperienceSceneKind,
} from "@psico/types";

import { ExperiencePreview } from "@/components/dashboard/experience/ExperiencePreview";
import { resolveGuideWebBundle } from "@/components/dashboard/guide/guide-web-bundle";
import {
  previewDraftAction,
  publishDraftAction,
  saveDraftAction,
} from "../../../../actions";

/**
 * CMS V1 (#637) — the draft editor.
 *
 * Deliberately plain: a metadata block, a vertical list of scenes with
 * Move up / Move down / Remove, and one form per scene driven by a `switch` on
 * its kind. No drag-and-drop library, no schema-form engine, no rich text. Each
 * of those is a dependency and a new failure mode in exchange for polish this
 * vertical does not need to prove itself.
 *
 * The editor never invents fields. Everything it writes is a key
 * `ExperienceSceneDefinition` already has, because the thing being edited IS
 * the runtime definition — the server rebuilds it through the same validator
 * the Player trusts, so a shape this screen cannot express is a shape that
 * would have been rejected anyway.
 */

/** Scene kinds that bind to a guide step, so the editor offers the field. */
const CAN_COMPLETE: ReadonlySet<ExperienceSceneKind> = new Set([
  "CONCEPT",
  "PRACTICE",
  "REFLECTION",
  "QUESTION",
  "RECALL",
  "PASSAGE",
]);

/** One line of text becomes one paragraph. Stated once, applied everywhere. */
function toBody(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function fromBody(body: readonly string[] | undefined): string {
  return (body ?? []).join("\n");
}

function blankScene(
  kind: ExperienceSceneKind,
  order: number,
): ExperienceSceneDefinition {
  const base = {
    sceneKey: `${kind.toLowerCase()}-${order}`,
    order,
    kind,
    copy: { title: `Nueva escena ${kind}`, body: ["Escribe el cuerpo aquí."] },
  };
  // Kinds with a required identifier get a placeholder the editor must replace;
  // the server rejects an empty one rather than storing a broken binding.
  switch (kind) {
    case "PASSAGE":
      return { ...base, anchorKey: "anchor" } as ExperienceSceneDefinition;
    case "CONCEPT":
    case "RESONANCE":
      return { ...base, conceptKey: "concepto" } as ExperienceSceneDefinition;
    case "PRACTICE":
      return { ...base, exerciseKey: "practica" } as ExperienceSceneDefinition;
    case "REFLECTION":
    case "QUESTION":
      return { ...base, promptKey: "prompt" } as ExperienceSceneDefinition;
    case "RECALL":
      return { ...base, itemKey: "item" } as ExperienceSceneDefinition;
    case "AUDIO":
      return { ...base, mediaKind: "AUDIOBOOK" } as ExperienceSceneDefinition;
    case "VIDEO":
      return { ...base, mediaKind: "VIDEO" } as ExperienceSceneDefinition;
    default:
      return base as ExperienceSceneDefinition;
  }
}

export function DraftEditor({
  id,
  initial,
  bookSlug,
  chapterOrder,
}: {
  id: string;
  initial: ChapterExperienceDefinition;
  bookSlug: string;
  chapterOrder: number;
}) {
  const router = useRouter();
  const [definition, setDefinition] =
    useState<ChapterExperienceDefinition>(initial);
  /**
   * The body textareas keep their RAW text here.
   *
   * The definition stores paragraphs, and normalising on every keystroke means
   * a trailing space vanishes as you type it and Enter never survives — so you
   * cannot write a second paragraph at all. Display from the raw text, store
   * the normalised array.
   */
  const [bodyText, setBodyText] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      initial.scenes.map((scene, i) => [i, fromBody(scene.copy.body)]),
    ),
  );
  const [busy, setBusy] = useState<null | "save" | "publish" | "preview">(null);
  /** The saved draft as a reader would receive it, mapped by the server. */
  const [preview, setPreview] = useState<ChapterExperiencePublicView | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scenes = definition.scenes;

  /**
   * Order is normalised to 1..N after every move, add or remove. The raw body
   * text is re-keyed alongside it, so a moved scene keeps the words in it.
   */
  function setScenes(next: ExperienceSceneDefinition[]) {
    setDefinition({
      ...definition,
      scenes: next.map((scene, i) => ({ ...scene, order: i + 1 })),
    });
    setBodyText(
      Object.fromEntries(
        next.map((scene, i) => [i, fromBody(scene.copy.body)]),
      ),
    );
    setMessage(null);
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= scenes.length) return;
    const next = [...scenes];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    setScenes(next);
  }

  /**
   * A field edit, NOT a structural change: it must not re-key the raw body
   * text, or every keystroke would reset the textarea it came from.
   */
  function patchScene(index: number, patch: Record<string, unknown>) {
    const next = [...scenes];
    next[index] = { ...next[index]!, ...patch } as ExperienceSceneDefinition;
    setDefinition({
      ...definition,
      scenes: next.map((scene, i) => ({ ...scene, order: i + 1 })),
    });
    setMessage(null);
  }

  function patchCopy(index: number, patch: Record<string, unknown>) {
    const scene = scenes[index]!;
    patchScene(index, { copy: { ...scene.copy, ...patch } });
  }

  async function save() {
    setBusy("save");
    setError(null);
    setMessage(null);
    try {
      await saveDraftAction(id, definition);
      setMessage("Guardado.");
    } catch (err) {
      setError(readError(err, "No pudimos guardar el borrador."));
    } finally {
      setBusy(null);
    }
  }

  async function openPreview() {
    setBusy("preview");
    setError(null);
    setMessage(null);
    try {
      setPreview(await previewDraftAction(id, definition));
    } catch (err) {
      setError(readError(err, "No pudimos abrir la vista previa."));
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    setBusy("publish");
    setError(null);
    setMessage(null);
    try {
      // Save first: publishing what is on screen, not what was on screen.
      await saveDraftAction(id, definition);
      await publishDraftAction(bookSlug, chapterOrder, id);
      router.push(`/dashboard/admin/experiencias/${bookSlug}/${chapterOrder}`);
    } catch (err) {
      setError(readError(err, "No pudimos publicar esta versión."));
      setBusy(null);
    }
  }

  return (
    <div data-testid="draft-editor">
      <section className="mb-7">
        <h2 className="mb-2.5 text-[13px] font-semibold" style={LABEL}>
          Metadatos
        </h2>
        <div
          className="rounded-2xl p-5"
          style={{
            background: "#fff",
            border: "1px solid var(--color-warm-200)",
          }}
        >
          <Field label="Título">
            <input
              value={definition.title}
              onChange={(e) =>
                setDefinition({ ...definition, title: e.target.value })
              }
              style={INPUT}
              data-testid="draft-title"
            />
          </Field>
          <Field label="Resumen">
            <input
              value={definition.summary ?? ""}
              onChange={(e) =>
                setDefinition({
                  ...definition,
                  summary: e.target.value || undefined,
                })
              }
              style={INPUT}
            />
          </Field>
          <Field label="Minutos estimados">
            <input
              type="number"
              min={1}
              value={definition.estimatedMinutes ?? ""}
              onChange={(e) =>
                setDefinition({
                  ...definition,
                  estimatedMinutes: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
              style={INPUT}
            />
          </Field>
          <p
            className="mt-1 text-[12px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            {definition.experienceKey} · v{definition.experienceVersion} · guía{" "}
            {definition.guidePin.guideKey}@{definition.guidePin.guideVersion}
            {" — la clave, la versión y la guía las decide el servidor."}
          </p>
        </div>
      </section>

      <section className="mb-7">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-semibold" style={LABEL}>
            Escenas
          </h2>
          <AddScene
            onAdd={(kind) =>
              setScenes([...scenes, blankScene(kind, scenes.length + 1)])
            }
          />
        </div>

        <ul className="flex flex-col gap-3">
          {scenes.map((scene, index) => (
            <li
              key={`${scene.sceneKey}-${index}`}
              className="rounded-2xl p-5"
              style={{
                background: "#fff",
                border: "1px solid var(--color-warm-200)",
              }}
              data-testid={`scene-row-${index}`}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-semibold" style={LABEL}>
                  {scene.order}. {scene.kind}
                </span>
                <span className="flex items-center gap-2">
                  <SmallButton
                    label="↑"
                    aria="Subir escena"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    testId={`move-up-${index}`}
                  />
                  <SmallButton
                    label="↓"
                    aria="Bajar escena"
                    onClick={() => move(index, 1)}
                    disabled={index === scenes.length - 1}
                    testId={`move-down-${index}`}
                  />
                  <SmallButton
                    label="Quitar"
                    aria="Quitar escena"
                    onClick={() =>
                      setScenes(scenes.filter((_, i) => i !== index))
                    }
                    testId={`remove-${index}`}
                  />
                </span>
              </div>

              <Field label="sceneKey">
                <input
                  value={scene.sceneKey}
                  onChange={(e) =>
                    patchScene(index, { sceneKey: e.target.value })
                  }
                  style={INPUT}
                />
              </Field>
              <Field label="Título">
                <input
                  value={scene.copy.title}
                  onChange={(e) => patchCopy(index, { title: e.target.value })}
                  style={INPUT}
                />
              </Field>
              <Field label="Cuerpo (una línea = un párrafo)">
                <textarea
                  rows={3}
                  value={bodyText[index] ?? fromBody(scene.copy.body)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setBodyText((prev) => ({ ...prev, [index]: raw }));
                    patchCopy(index, { body: toBody(raw) });
                  }}
                  style={{ ...INPUT, resize: "vertical" }}
                />
              </Field>

              <SceneSpecificFields
                scene={scene}
                onPatch={(patch) => patchScene(index, patch)}
                onPatchCopy={(patch) => patchCopy(index, patch)}
              />
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy !== null}
          className="rounded-full px-5 text-[13.5px] font-semibold disabled:opacity-60"
          style={{
            minHeight: 44,
            background: "var(--color-warm-100)",
            color: "var(--color-warm-800)",
          }}
          data-testid="save-draft"
        >
          {busy === "save" ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => void openPreview()}
          disabled={busy !== null}
          className="rounded-full px-5 text-[13.5px] font-semibold disabled:opacity-60"
          style={{
            minHeight: 44,
            background: "var(--color-lavender-50)",
            color: "var(--color-lavender-700)",
          }}
          data-testid="preview-draft"
        >
          {busy === "preview" ? "Abriendo…" : "Vista previa"}
        </button>
        <button
          type="button"
          onClick={() => void publish()}
          disabled={busy !== null}
          className="rounded-full px-5 text-[13.5px] font-semibold text-white disabled:opacity-60"
          style={{ minHeight: 44, background: "var(--color-sage-500)" }}
          data-testid="publish-draft"
        >
          {busy === "publish" ? "Publicando…" : "Publicar"}
        </button>
        {message ? (
          <span
            className="text-[13px]"
            style={{ color: "var(--color-sage-600)" }}
          >
            {message}
          </span>
        ) : null}
        {error ? (
          <span
            className="text-[13px]"
            style={{ color: "#B91C1C" }}
            role="alert"
          >
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Per-kind fields, as a `switch`. Twelve small branches beat a form engine that
 * would have to be taught the same twelve things indirectly.
 */
function SceneSpecificFields({
  scene,
  onPatch,
  onPatchCopy,
}: {
  scene: ExperienceSceneDefinition;
  onPatch: (patch: Record<string, unknown>) => void;
  onPatchCopy: (patch: Record<string, unknown>) => void;
}) {
  const s = scene as unknown as Record<string, unknown>;
  const idField = (name: string, label: string) => (
    <Field label={label}>
      <input
        value={(s[name] as string) ?? ""}
        onChange={(e) => onPatch({ [name]: e.target.value })}
        style={INPUT}
        data-testid={`scene-${name}`}
      />
    </Field>
  );

  return (
    <>
      {scene.kind === "PASSAGE" ? idField("anchorKey", "anchorKey") : null}
      {scene.kind === "CONCEPT" || scene.kind === "RESONANCE"
        ? idField("conceptKey", "conceptKey")
        : null}
      {scene.kind === "PRACTICE" ? idField("exerciseKey", "exerciseKey") : null}
      {scene.kind === "REFLECTION" || scene.kind === "QUESTION"
        ? idField("promptKey", "promptKey")
        : null}
      {scene.kind === "RECALL" ? idField("itemKey", "itemKey") : null}
      {scene.kind === "AUDIO" || scene.kind === "VIDEO"
        ? idField("mediaKind", "mediaKind")
        : null}

      {CAN_COMPLETE.has(scene.kind) ? (
        <Field label="completesGuideStepKey (vacío = no registra nada)">
          <input
            value={(s.completesGuideStepKey as string) ?? ""}
            onChange={(e) =>
              onPatch({
                completesGuideStepKey: e.target.value || undefined,
              })
            }
            style={INPUT}
            data-testid="scene-completesGuideStepKey"
          />
        </Field>
      ) : null}

      <Field label="actionLabel">
        <input
          value={scene.copy.actionLabel ?? ""}
          onChange={(e) =>
            onPatchCopy({ actionLabel: e.target.value || undefined })
          }
          style={INPUT}
        />
      </Field>
      <Field label="note">
        <input
          value={scene.copy.note ?? ""}
          onChange={(e) => onPatchCopy({ note: e.target.value || undefined })}
          style={INPUT}
        />
      </Field>
    </>
  );
}

function AddScene({ onAdd }: { onAdd: (kind: ExperienceSceneKind) => void }) {
  const [kind, setKind] = useState<ExperienceSceneKind>("INTRO");
  return (
    <span className="flex items-center gap-2">
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as ExperienceSceneKind)}
        style={{ ...INPUT, minHeight: 44, width: "auto" }}
        aria-label="Tipo de escena"
        data-testid="add-scene-kind"
      >
        {EXPERIENCE_SCENE_KINDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onAdd(kind)}
        className="rounded-full px-4 text-[13px] font-semibold text-white"
        style={{ background: "var(--color-lavender-500)", minHeight: 44 }}
        data-testid="add-scene"
      >
        Añadir escena
      </button>
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-2.5 block">
      <span
        className="mb-1 block text-[12px] font-medium"
        style={{ color: "var(--color-warm-600)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function SmallButton({
  label,
  aria,
  onClick,
  disabled = false,
  testId,
}: {
  label: string;
  aria: string;
  onClick: () => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      aria-label={aria}
      onClick={onClick}
      disabled={disabled}
      className="rounded-full px-3 text-[13px] font-semibold disabled:opacity-40"
      style={{
        minHeight: 44,
        background: "var(--color-warm-100)",
        color: "var(--color-warm-700)",
      }}
      data-testid={testId}
    >
      {label}
    </button>
  );
}

/** Surface the server's editorial message when there is one. */
function readError(err: unknown, fallback: string): string {
  const message = (err as { message?: unknown })?.message;
  return typeof message === "string" && message.length > 0 ? message : fallback;
}

const LABEL = { color: "var(--color-warm-800)" } as const;

const INPUT: React.CSSProperties = {
  width: "100%",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 13.5,
  background: "var(--color-warm-50)",
  border: "1px solid var(--color-warm-200)",
  color: "var(--color-warm-900)",
};
