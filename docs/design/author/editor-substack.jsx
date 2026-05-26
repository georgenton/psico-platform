// author/editor-substack.jsx — Split editor (left form, right preview).
// Defaults to the "Plantilla guiada" feel — a 4-step stepper at the top,
// blocks below. Right rail shows publication status + AI helpers.

const { IcoSpark, IcoPlus, IcoVersions, IcoEye, IcoSave, IcoArrow,
        IcoCheck, IcoClose, IcoSearch, IcoUndo } = window.EditorIcons;
const { EditBlock, PreviewBlock, KIND_LABELS } = window;

// ── Helper: stable IDs for blocks added on the fly ───────────────────────
let _bid = 100;
const newBlockId = () => "b" + (++_bid);

// ── Default content for a freshly inserted block by kind ─────────────────
const KIND_DEFAULTS = {
  title:            () => ({ text: "" }),
  prose:            () => ({ heading: "", paragraphs: [""], bullets: [] }),
  goal:             () => ({ title: "Tu objetivo", body: "" }),
  "author-insight": () => ({ quote: "", attribution: "" }),
  sidebar:          () => ({ body: "" }),
  flip:             () => ({ front: { label: "Concepto", title: "", body: "" }, back: { label: "Ejemplo", title: "", body: "" } }),
  video:            () => ({ title: "", caption: "", url: "", duration: "", poster: "lavender" }),
  audio:            () => ({ title: "", caption: "", duration: "" }),
  quiz:             () => ({ question: "", options: [
    { id: "a", text: "", correct: false },
    { id: "b", text: "", correct: true },
    { id: "c", text: "", correct: false },
  ], feedbackOk: "" }),
  assessment:       () => ({ title: "", description: "" }),
  checklist:        () => ({ title: "Antes de continuar", subtitle: "", items: ["", ""] }),
  exercise:         () => ({ title: "", prompt: "", placeholder: "", tip: "" }),
  image:            () => ({ url: "", alt: "" }),
  pdf:              () => ({ title: "", url: "" }),
  separator:        () => ({}),
};

// ── Block library sheet (used when adding a block to the lesson) ────────
function BlockLibrarySheet({ open, onPick, onClose }) {
  if (!open) return null;
  const groups = ["Texto", "Interactivo", "Multimedia"];
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="tpl-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="tpl-h">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 className="tpl-h-title">Agregar bloque</h2>
              <p className="tpl-h-sub">15 tipos disponibles. Elige uno o usa "/" en el editor.</p>
            </div>
            <button className="ebtn ebtn-icon" onClick={onClose}><IcoClose/></button>
          </div>
        </div>
        <div className="tpl-grid" style={{ gridTemplateColumns: "1fr 1fr", padding: 14 }}>
          {groups.map((g) => {
            const blocks = window.AUTHOR_BLOCK_LIBRARY.filter((b) => b.group === g);
            return (
              <React.Fragment key={g}>
                <div style={{ gridColumn: "1 / -1", padding: "6px 6px 0", fontWeight: 700, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-tertiary)" }}>
                  {g}
                </div>
                {blocks.map((b) => {
                  const Icon = window.BLOCK_ICONS[b.kind];
                  return (
                    <button key={b.kind} className="tpl-card" onClick={() => onPick(b.kind)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 28, height: 28, borderRadius: 7, background: "var(--paper-2)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--ink-heading)", flex: "0 0 auto" }}>
                        {Icon ? <Icon/> : null}
                      </span>
                      <span className="tpl-card-title" style={{ fontSize: 13 }}>{b.name}</span>
                    </button>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Step header (4-step guided template) ────────────────────────────────
const GUIDED_STEPS = [
  { kind: "goal",     label: "Paso 1 · Objetivo" },
  { kind: "prose",    label: "Paso 2 · Contenido" },
  { kind: "video",    label: "Paso 3 · Multimedia" },
  { kind: "quiz",     label: "Paso 4 · Quiz" },
];

function GuidedStepper({ blocks }) {
  // A step is "done" if there's a block of that kind in the lesson; "is-on" is the next one to fill.
  const states = GUIDED_STEPS.map(s => blocks.some(b => b.kind === s.kind));
  const firstUndoneIdx = states.findIndex(d => !d);
  return (
    <div className="ed-stepper">
      {GUIDED_STEPS.map((s, i) => {
        const done = states[i];
        const isOn = !done && i === firstUndoneIdx;
        return (
          <span key={s.kind} className={"ed-step " + (done ? "done " : "") + (isOn ? "is-on" : "")}>
            <span className="ed-step-dot"></span>
            {done ? "✓ " : ""}{s.label}
          </span>
        );
      })}
    </div>
  );
}

// ── Publication stepper (right rail) ────────────────────────────────────
function PublicationStepper({ current, onSubmitReview, onApprove, onPublish }) {
  const steps = window.PUBLICATION_STEPS;
  const idx = steps.findIndex(s => s.id === current);
  return (
    <div className="rail-card">
      <div className="rail-eyebrow">Publicación</div>
      <h4 className="rail-h">Estado actual: {steps[idx]?.label}</h4>
      <p className="rail-sub">{steps[idx]?.sub}</p>
      <div className="rail-publication">
        {steps.map((s, i) => {
          const stateCls = i < idx ? "done" : i === idx ? "is-on" : "upcoming";
          return (
            <div key={s.id} className={"rail-pub-step " + stateCls}>
              <span className="rail-pub-step-n">{i < idx ? <IcoCheck/> : (i + 1)}</span>
              <div className="rail-pub-step-body">
                <div className="rail-pub-step-title">{s.label}</div>
                <div className="rail-pub-step-sub">{s.sub}</div>
              </div>
            </div>
          );
        })}
      </div>
      {current === "borrador" && (
        <button className="ebtn-accent ebtn rail-publish-cta" onClick={onSubmitReview}>Enviar a revisión <IcoArrow/></button>
      )}
      {current === "en-revision" && (
        <button className="ebtn ebtn rail-publish-cta" onClick={onApprove}>Marcar como aprobado <IcoCheck/></button>
      )}
      {current === "aprobado" && (
        <button className="ebtn-primary ebtn rail-publish-cta" onClick={onPublish}>Publicar <IcoArrow/></button>
      )}
      {current === "publicado" && (
        <button className="ebtn ebtn rail-publish-cta" disabled>Lección publicada</button>
      )}
    </div>
  );
}

// ── AI Helpers (right rail) ─────────────────────────────────────────────
function AIHelpersRail({ helpers, onTrigger }) {
  return (
    <div className="rail-card">
      <div className="rail-eyebrow">✦ Marina IA · asistente del autor</div>
      <h4 className="rail-h">Ayudas inteligentes</h4>
      <p className="rail-sub">Una sola acción ahorra entre 5 y 20 min de trabajo manual.</p>
      <div className="rail-ai">
        {helpers.map((h) => {
          const Icon = window.AI_HELPER_ICONS[h.id] || IcoSpark;
          return (
            <button key={h.id} className="rail-ai-helper" onClick={() => onTrigger(h)}>
              <span className="rail-ai-helper-icon"><Icon/></span>
              <div className="rail-ai-helper-body">
                <div className="rail-ai-helper-title">{h.title}</div>
                <div className="rail-ai-helper-sub">{h.body}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Inline AI result panel (appears at the bottom of the edit pane) ─────
function InlineAIResult({ helper, busy, result, onAccept, onDiscard }) {
  if (!helper) return null;
  return (
    <div className="ai-inline">
      <div className="ai-inline-h">
        <span className="ai-inline-h-dot"></span>
        ✦ Marina IA · {helper.title}
      </div>
      {busy ? (
        <div className="ai-inline-body" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="ai-typing-row"><span></span><span></span><span></span></span>
          Pensando…
        </div>
      ) : (
        <div className="ai-inline-body" style={{ whiteSpace: "pre-wrap" }}>{result}</div>
      )}
      {!busy && (
        <div className="ai-inline-actions">
          <button className="ebtn-accent ebtn ebtn-sm" onClick={onAccept}><IcoCheck/> Aplicar</button>
          <button className="ebtn ebtn-sm" onClick={onDiscard}>Descartar</button>
        </div>
      )}
    </div>
  );
}

// ── Version-history drawer ──────────────────────────────────────────────
function VersionDrawer({ open, onClose, history }) {
  if (!open) return null;
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-h">
          <div className="drawer-h-title">Historial de versiones</div>
          <button className="ebtn-icon ebtn" onClick={onClose}><IcoClose/></button>
        </div>
        <div className="drawer-body">
          <ul className="vlist">
            {history.map((v, i) => (
              <li key={v.id} className={"vlist-item " + (i === 0 ? "is-current" : "")}>
                <div className="vlist-label">{v.label}</div>
                <div className="vlist-meta">{v.time} · {v.actor}</div>
                <div className="vlist-note">{v.note}</div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

// ── Editor Substack split ────────────────────────────────────────────────
function EditorSubstack({ onBack }) {
  const [lesson, setLesson] = React.useState(window.AUTHOR_LESSON_DRAFT);
  const [status, setStatus] = React.useState(lesson.status);
  const [libraryOpen, setLibraryOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [aiState, setAiState] = React.useState({ helper: null, busy: false, result: "" });
  const [pickerTarget, setPickerTarget] = React.useState(null); // index where to insert

  const setBlock = (i, patch) => {
    setLesson((l) => ({ ...l, blocks: l.blocks.map((b, j) => j === i ? { ...b, ...patch } : b) }));
  };
  const replaceBlock = (i, next) => {
    setLesson((l) => ({ ...l, blocks: l.blocks.map((b, j) => j === i ? next : b) }));
  };
  const insertBlock = (atIndex, kind) => {
    const next = { id: newBlockId(), kind, ...KIND_DEFAULTS[kind]() };
    setLesson((l) => {
      const blocks = [...l.blocks];
      blocks.splice(atIndex, 0, next);
      return { ...l, blocks };
    });
  };
  const removeBlock = (i) => setLesson((l) => ({ ...l, blocks: l.blocks.filter((_, j) => j !== i) }));
  const duplicateBlock = (i) => setLesson((l) => ({ ...l, blocks: [...l.blocks.slice(0, i+1), { ...l.blocks[i], id: newBlockId() }, ...l.blocks.slice(i+1)] }));

  const onAddBlock = () => { setPickerTarget(lesson.blocks.length); setLibraryOpen(true); };
  const onPickPlaceholder = (i) => {
    const b = lesson.blocks[i];
    if (b.kind === "placeholder" && b.forKind) {
      // Replace placeholder with the actual block kind it represents.
      replaceBlock(i, { id: newBlockId(), kind: b.forKind, ...KIND_DEFAULTS[b.forKind]() });
    } else {
      setPickerTarget(i);
      setLibraryOpen(true);
    }
  };
  const onPickFromLibrary = (kind) => {
    setLibraryOpen(false);
    if (pickerTarget != null && lesson.blocks[pickerTarget]?.kind === "placeholder") {
      replaceBlock(pickerTarget, { id: newBlockId(), kind, ...KIND_DEFAULTS[kind]() });
    } else {
      insertBlock(pickerTarget ?? lesson.blocks.length, kind);
    }
    setPickerTarget(null);
  };

  const triggerAI = async (helper) => {
    setAiState({ helper, busy: true, result: "" });
    const prompt = aiPromptFor(helper, lesson);
    try {
      const reply = await window.claude.complete({ messages: [{ role: "user", content: prompt }] });
      setAiState({ helper, busy: false, result: reply.trim() });
    } catch (e) {
      setAiState({ helper, busy: false, result: "Tuvimos un problema conectando. Inténtalo en un momento." });
    }
  };
  const discardAI = () => setAiState({ helper: null, busy: false, result: "" });

  const submitReview = () => setStatus("en-revision");
  const approve = () => setStatus("aprobado");
  const publish = () => setStatus("publicado");

  return (
    <div className="editor-app">
      <window.EstudioTopBar
        crumbs={["Estudio", "Emociones en construcción", "Capítulo 1", lesson.title]}
        right={<>
          <button className="ebtn" onClick={() => setHistoryOpen(true)}><IcoVersions/> Historial</button>
          <button className="ebtn" onClick={onBack}>← Estructura</button>
          <button className="ebtn"><IcoEye/> Previsualizar</button>
          <button className="ebtn-primary ebtn"><IcoSave/> Guardado · {lesson.lastSavedAgo}</button>
        </>}
      />
      <div className="edsplit">
        {/* — Edit pane — */}
        <section className="edsplit-edit">
          <div className="ed-h">
            <div className="ed-h-row">
              <span style={{ font: "700 10.5px/1 var(--font-mono)", letterSpacing: ".08em", color: "var(--ink-tertiary)", textTransform: "uppercase" }}>
                Lección {String(lesson.number).padStart(2, "0")} · {lesson.chapterTitle}
              </span>
              <span className={"ed-h-status status-badge status-" + status}>{status.replace("-", " ")}</span>
            </div>
            <input
              className="ed-title-input"
              placeholder="Título de la lección"
              value={lesson.title}
              onChange={(e) => setLesson({ ...lesson, title: e.target.value })}
            />
            <textarea
              className="ed-sub-input"
              placeholder="Subtítulo — una frase corta que describe la lección"
              rows={1}
              value={lesson.subtitle}
              onChange={(e) => setLesson({ ...lesson, subtitle: e.target.value })}
            />
            <GuidedStepper blocks={lesson.blocks}/>
          </div>

          <div className="ed-body">
            {lesson.blocks.map((b, i) => (
              <EditBlock
                key={b.id}
                block={b}
                onChange={(patch) => setBlock(i, patch)}
                onDelete={() => removeBlock(i)}
                onDuplicate={() => duplicateBlock(i)}
                onPickPlaceholder={() => onPickPlaceholder(i)}
              />
            ))}
            <button className="ed-add-block" onClick={onAddBlock}>
              <IcoPlus/> Agregar bloque
            </button>
            <InlineAIResult
              helper={aiState.helper}
              busy={aiState.busy}
              result={aiState.result}
              onAccept={discardAI}
              onDiscard={discardAI}
            />
          </div>
        </section>

        {/* — Preview pane — */}
        <section className="edsplit-preview">
          <div className="ed-preview-h">
            <span className="ed-preview-eyebrow"><IcoEye/> Vista previa · como la verá el lector</span>
            <div className="ed-preview-mode">
              <button className="ed-preview-mode-btn is-on">Guía</button>
              <button className="ed-preview-mode-btn">Libro</button>
            </div>
          </div>
          <div className="ed-preview-body">
            <h1 className="ed-preview-h1">{lesson.title || "Título de la lección"}</h1>
            {lesson.subtitle && <p className="ed-preview-sub">{lesson.subtitle}</p>}
            {lesson.blocks.map((b) => (
              <PreviewBlock key={b.id} block={b}/>
            ))}
          </div>
        </section>

        {/* — Right rail — */}
        <aside className="edsplit-rail">
          <PublicationStepper
            current={status}
            onSubmitReview={submitReview}
            onApprove={approve}
            onPublish={publish}
          />
          <AIHelpersRail helpers={window.AUTHOR_AI_HELPERS} onTrigger={triggerAI}/>
          <div className="rail-card">
            <div className="rail-eyebrow">Tu autor</div>
            <h4 className="rail-h">{window.AUTHOR_PROFILE.name}</h4>
            <p className="rail-sub">{window.AUTHOR_PROFILE.role}<br/>{window.AUTHOR_PROFILE.revShareDescription}</p>
          </div>
        </aside>
      </div>

      <BlockLibrarySheet open={libraryOpen} onPick={onPickFromLibrary} onClose={() => setLibraryOpen(false)}/>
      <VersionDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} history={window.AUTHOR_VERSION_HISTORY}/>
    </div>
  );
}

// ── AI prompts per helper ────────────────────────────────────────────────
function aiPromptFor(helper, lesson) {
  const lessonAsText = lesson.blocks.map((b) => {
    if (b.kind === "prose")   return (b.heading ? "# " + b.heading + "\n" : "") + (b.paragraphs || []).join("\n\n");
    if (b.kind === "goal")    return "OBJETIVO: " + (b.body || "");
    if (b.kind === "exercise")return "EJERCICIO: " + (b.title || "") + " — " + (b.prompt || "");
    if (b.kind === "video")   return "[Video: " + (b.title || "") + "]";
    return "";
  }).filter(Boolean).join("\n\n");

  const base = "Hablas en español neutro latinoamericano, en segunda persona singular (tú), con calidez clínica. Sin diagnóstico. Máximo 60 palabras a menos que se pida otra cosa.\n\nLECCIÓN actual:\n" + lessonAsText + "\n\n";

  switch (helper.id) {
    case "suggest-quiz":
      return base + "Sugiere UN quiz de una pregunta con 3 opciones (A, B, C), marca cuál es correcta y por qué. Formato:\nPregunta: …\nA) …\nB) … (correcta) — porque …\nC) …";
    case "convert-libro-guia":
      return base + "Propón una división de esta prosa en 3-5 bloques interactivos para Modo Guía (callouts, video corto, ejercicio, quiz). Devuelve una lista breve.";
    case "suggest-next":
      return base + "Sugiere QUÉ BLOQUE viene mejor a continuación y por qué (una frase para el bloque, una frase para el porqué).";
    case "tone-review":
      return base + "Lee el último párrafo de prosa de la lección. Si suena clínico o frío, propón una reescritura más cálida. Si ya está bien, dilo y explica por qué.";
    case "summarize":
      return base + "Redacta el bloque 'Tu objetivo' en UNA frase ancla — qué aprenderá el lector. Devuelve solo la frase.";
    case "inclusivity":
      return base + "Detecta cualquier lenguaje estigmatizante o no inclusivo en la lección. Si lo hay, propón alternativas. Si no, di que está bien y por qué.";
    case "image":
      return base + "Describe en 2 frases 3 ideas de imagen abstracta para portada — sin personas, paleta lavender + sage + warm. Devuelve solo las 3 ideas.";
    default:
      return base + "Da una sugerencia breve sobre cómo mejorar esta lección.";
  }
}

window.EditorSubstack = EditorSubstack;
