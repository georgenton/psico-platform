// author/blocks.jsx — Block-level UI for the editor.
// Two sibling components per block kind:
//   • <Edit{Kind}Block>   — the form/inline editor inside the edit pane
//   • <Preview{Kind}Block> — the rendered preview that mirrors the reader
//
// Both modes share the same data shape (the `block` object). Editing
// mutates a draft object the host owns; the preview reads the same draft.
//
// This file is intentionally large but flat — each kind has its own small
// pair of components. The dispatcher at the bottom routes by `block.kind`.

const { IcoGrip, IcoMore, IcoTrash, IcoDup, IcoPlus, IcoSpark, IcoCheck,
        IcoArrow, IcoEye } = window.EditorIcons;
const BLOCK_ICONS = window.BLOCK_ICONS;

const KIND_LABELS = {
  title:            "Título de sección",
  prose:            "Texto largo",
  goal:             "Callout · Objetivo",
  "author-insight": "Cita del autor",
  sidebar:          "Sidebar · aforismo",
  flip:             "Flip card · concepto/ejemplo",
  quiz:             "Quiz · una pregunta",
  assessment:       "Assessment · multi-pregunta",
  checklist:        "Checklist al cierre",
  exercise:         "Ejercicio de journaling",
  video:            "Video",
  audio:            "Audio guiado",
  image:            "Imagen",
  pdf:              "PDF descargable",
  separator:        "Separador visual",
  placeholder:      "Bloque pendiente",
};

// ── Block frame (used by every editable block) ───────────────────────────
function BlockFrame({ kind, children, onDelete, onDuplicate, onMoreActions }) {
  const Icon = BLOCK_ICONS[kind];
  return (
    <div className="ed-block" data-kind={kind}>
      <div className="ed-block-head">
        <span className="ed-block-grip" aria-hidden><IcoGrip/></span>
        <span className="ed-block-icon">{Icon ? <Icon/> : null}</span>
        <span className="ed-block-kind">{KIND_LABELS[kind] || kind}</span>
        <div className="ed-block-actions">
          {onDuplicate && <button className="ed-block-mini" aria-label="Duplicar" onClick={onDuplicate}><IcoDup/></button>}
          {onDelete    && <button className="ed-block-mini" aria-label="Borrar"   onClick={onDelete}><IcoTrash/></button>}
          {onMoreActions && <button className="ed-block-mini" aria-label="Más"    onClick={onMoreActions}><IcoMore/></button>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="ed-field">
      {label && <label className="ed-field-lbl">{label}</label>}
      {children}
    </div>
  );
}

// ── Per-kind edit components ─────────────────────────────────────────────
function EditTitleBlock({ block, onChange, ...rest }) {
  return (
    <BlockFrame kind="title" {...rest}>
      <Field><input className="ed-input" placeholder="Título de la sección" value={block.text || ""} onChange={(e) => onChange({ text: e.target.value })}/></Field>
    </BlockFrame>
  );
}
function EditProseBlock({ block, onChange, ...rest }) {
  return (
    <BlockFrame kind="prose" {...rest}>
      <Field label="Encabezado (opcional)">
        <input className="ed-input" placeholder="Encabezado de la sección" value={block.heading || ""} onChange={(e) => onChange({ heading: e.target.value })}/>
      </Field>
      <Field label="Párrafos">
        <textarea
          className="ed-textarea"
          rows={5}
          placeholder="Escribe el cuerpo… Separa con una línea en blanco para nuevos párrafos."
          value={(block.paragraphs || []).join("\n\n")}
          onChange={(e) => onChange({ paragraphs: e.target.value.split(/\n\n+/) })}
        />
      </Field>
      <Field label="Bullets (opcional · una línea por bullet)">
        <textarea
          className="ed-textarea"
          rows={2}
          placeholder="• Punto uno&#10;• Punto dos"
          value={(block.bullets || []).join("\n")}
          onChange={(e) => onChange({ bullets: e.target.value.split("\n").filter(Boolean) })}
        />
      </Field>
    </BlockFrame>
  );
}
function EditGoalBlock({ block, onChange, ...rest }) {
  return (
    <BlockFrame kind="goal" {...rest}>
      <Field label="Título corto">
        <input className="ed-input" placeholder="Tu objetivo" value={block.title || ""} onChange={(e) => onChange({ title: e.target.value })}/>
      </Field>
      <Field label="Cuerpo">
        <textarea className="ed-textarea" rows={2} placeholder="Una frase ancla — qué aprenderá el lector." value={block.body || ""} onChange={(e) => onChange({ body: e.target.value })}/>
      </Field>
    </BlockFrame>
  );
}
function EditAuthorInsightBlock({ block, onChange, ...rest }) {
  return (
    <BlockFrame kind="author-insight" {...rest}>
      <Field label="Cita del autor">
        <textarea className="ed-textarea" rows={2} placeholder='"La mayoría de las personas con las que trabajo no necesitan controlar sus emociones..."' value={block.quote || ""} onChange={(e) => onChange({ quote: e.target.value })}/>
      </Field>
      <Field label="Atribución / contexto">
        <input className="ed-input" placeholder="Marina, sobre los primeros años de su práctica" value={block.attribution || ""} onChange={(e) => onChange({ attribution: e.target.value })}/>
      </Field>
    </BlockFrame>
  );
}
function EditSidebarBlock({ block, onChange, ...rest }) {
  return (
    <BlockFrame kind="sidebar" {...rest}>
      <Field label="Texto"><textarea className="ed-textarea" rows={2} placeholder="Una frase para enmarcar." value={block.body || ""} onChange={(e) => onChange({ body: e.target.value })}/></Field>
    </BlockFrame>
  );
}
function EditFlipBlock({ block, onChange, ...rest }) {
  const front = block.front || { label: "Concepto", title: "", body: "" };
  const back  = block.back  || { label: "Ejemplo",  title: "", body: "" };
  return (
    <BlockFrame kind="flip" {...rest}>
      <Field label="Cara A · concepto">
        <input className="ed-input" placeholder="Título del concepto" value={front.title || ""} onChange={(e) => onChange({ front: { ...front, title: e.target.value }})}/>
      </Field>
      <Field><textarea className="ed-textarea" rows={2} placeholder="Explicación breve del concepto." value={front.body || ""} onChange={(e) => onChange({ front: { ...front, body: e.target.value }})}/></Field>
      <Field label="Cara B · ejemplo">
        <input className="ed-input" placeholder="Título del ejemplo" value={back.title || ""} onChange={(e) => onChange({ back: { ...back, title: e.target.value }})}/>
      </Field>
      <Field><textarea className="ed-textarea" rows={2} placeholder="Cómo se vería en la vida diaria." value={back.body || ""} onChange={(e) => onChange({ back: { ...back, body: e.target.value }})}/></Field>
    </BlockFrame>
  );
}
function EditVideoBlock({ block, onChange, ...rest }) {
  return (
    <BlockFrame kind="video" {...rest}>
      <Field label="Título"><input className="ed-input" placeholder="Cómo se construye un disparador" value={block.title || ""} onChange={(e) => onChange({ title: e.target.value })}/></Field>
      <Field label="Caption"><input className="ed-input" placeholder="Marina explica el modelo de los tres tiempos." value={block.caption || ""} onChange={(e) => onChange({ caption: e.target.value })}/></Field>
      <Field label="URL (YouTube · Vimeo · subido)"><input className="ed-input" placeholder="https://…" value={block.url || ""} onChange={(e) => onChange({ url: e.target.value })}/></Field>
      <div style={{ display: "flex", gap: 8 }}>
        <Field label="Duración"><input className="ed-input" placeholder="2:14" value={block.duration || ""} onChange={(e) => onChange({ duration: e.target.value })}/></Field>
        <Field label="Poster">
          <select className="ed-select" value={block.poster || "lavender"} onChange={(e) => onChange({ poster: e.target.value })}>
            <option value="lavender">Lavender</option>
            <option value="mixed">Mixto</option>
            <option value="sage">Sage</option>
          </select>
        </Field>
      </div>
    </BlockFrame>
  );
}
function EditAudioBlock({ block, onChange, ...rest }) {
  return (
    <BlockFrame kind="audio" {...rest}>
      <Field label="Título"><input className="ed-input" placeholder="Práctica guiada · Notar el disparador" value={block.title || ""} onChange={(e) => onChange({ title: e.target.value })}/></Field>
      <Field label="Caption"><input className="ed-input" placeholder="Una pausa breve para entrenar la atención." value={block.caption || ""} onChange={(e) => onChange({ caption: e.target.value })}/></Field>
      <Field label="Duración"><input className="ed-input" placeholder="3:24" value={block.duration || ""} onChange={(e) => onChange({ duration: e.target.value })}/></Field>
      <button className="ebtn ebtn-sm"><IcoSpark/> Grabar in-app (próximamente)</button>
    </BlockFrame>
  );
}
function EditQuizBlock({ block, onChange, ...rest }) {
  const opts = block.options || [{ id: "a", text: "", correct: false }, { id: "b", text: "", correct: true }, { id: "c", text: "", correct: false }];
  const setOption = (i, patch) => {
    const next = opts.map((o, j) => j === i ? { ...o, ...patch } : o);
    onChange({ options: next });
  };
  const setCorrect = (i) => onChange({ options: opts.map((o, j) => ({ ...o, correct: j === i })) });
  return (
    <BlockFrame kind="quiz" {...rest}>
      <Field label="Pregunta"><textarea className="ed-textarea" rows={2} placeholder="¿Cuál de estas situaciones describe mejor un disparador?" value={block.question || ""} onChange={(e) => onChange({ question: e.target.value })}/></Field>
      <Field label="Opciones · marca la correcta">
        <div className="ed-quiz-options">
          {opts.map((o, i) => (
            <div key={i} className={"ed-quiz-option " + (o.correct ? "is-correct" : "")}>
              <span className="ed-quiz-bullet">{String.fromCharCode(65 + i)}</span>
              <input
                className="ed-input"
                placeholder={"Opción " + String.fromCharCode(65 + i)}
                value={o.text || ""}
                onChange={(e) => setOption(i, { text: e.target.value })}
              />
              <button
                className={"ed-quiz-correct-toggle " + (o.correct ? "is-on" : "")}
                onClick={() => setCorrect(i)}
                title="Marcar como correcta"
              >
                <IcoCheck/>
              </button>
            </div>
          ))}
        </div>
      </Field>
      <Field label="Feedback opcional cuando aciertan">
        <textarea className="ed-textarea" rows={1} placeholder="Exacto. La interrupción es el disparador…" value={block.feedbackOk || ""} onChange={(e) => onChange({ feedbackOk: e.target.value })}/>
      </Field>
    </BlockFrame>
  );
}
function EditAssessmentBlock({ block, onChange, ...rest }) {
  return (
    <BlockFrame kind="assessment" {...rest}>
      <Field label="Título"><input className="ed-input" placeholder="Mini autoevaluación · 4 preguntas" value={block.title || ""} onChange={(e) => onChange({ title: e.target.value })}/></Field>
      <Field label="Descripción"><textarea className="ed-textarea" rows={2} placeholder="Responde con honestidad. Sin puntajes — solo claridad para ti." value={block.description || ""} onChange={(e) => onChange({ description: e.target.value })}/></Field>
      <button className="ebtn ebtn-sm"><IcoPlus/> Agregar pregunta</button>
    </BlockFrame>
  );
}
function EditChecklistBlock({ block, onChange, ...rest }) {
  const items = block.items || ["", "", "", ""];
  return (
    <BlockFrame kind="checklist" {...rest}>
      <Field label="Título"><input className="ed-input" placeholder="Antes de continuar" value={block.title || ""} onChange={(e) => onChange({ title: e.target.value })}/></Field>
      <Field label="Subtítulo"><input className="ed-input" placeholder="Marca lo que sí pudiste hacer en esta lección." value={block.subtitle || ""} onChange={(e) => onChange({ subtitle: e.target.value })}/></Field>
      <Field label="Items">
        <textarea
          className="ed-textarea"
          rows={4}
          placeholder="Identifiqué la diferencia entre disparador y emoción.&#10;Reconocí al menos una señal del cuerpo."
          value={items.join("\n")}
          onChange={(e) => onChange({ items: e.target.value.split("\n") })}
        />
      </Field>
    </BlockFrame>
  );
}
function EditExerciseBlock({ block, onChange, ...rest }) {
  return (
    <BlockFrame kind="exercise" {...rest}>
      <Field label="Título"><input className="ed-input" placeholder="Tu cuaderno · El disparador de hoy" value={block.title || ""} onChange={(e) => onChange({ title: e.target.value })}/></Field>
      <Field label="Prompt"><textarea className="ed-textarea" rows={2} placeholder="Recuerda un momento del día…" value={block.prompt || ""} onChange={(e) => onChange({ prompt: e.target.value })}/></Field>
      <Field label="Placeholder"><input className="ed-input" placeholder="Hoy reaccioné cuando…" value={block.placeholder || ""} onChange={(e) => onChange({ placeholder: e.target.value })}/></Field>
      <Field label="Consejo bajo el campo"><input className="ed-input" placeholder="No te exijas precisión." value={block.tip || ""} onChange={(e) => onChange({ tip: e.target.value })}/></Field>
    </BlockFrame>
  );
}
function EditImageBlock({ block, onChange, ...rest }) {
  return (
    <BlockFrame kind="image" {...rest}>
      <Field label="URL o subir imagen"><input className="ed-input" placeholder="https://…" value={block.url || ""} onChange={(e) => onChange({ url: e.target.value })}/></Field>
      <Field label="Alt"><input className="ed-input" placeholder="Descripción para accesibilidad" value={block.alt || ""} onChange={(e) => onChange({ alt: e.target.value })}/></Field>
      <button className="ebtn ebtn-sm"><IcoSpark/> Generar con IA · paleta del libro</button>
    </BlockFrame>
  );
}
function EditPdfBlock({ block, onChange, ...rest }) {
  return (
    <BlockFrame kind="pdf" {...rest}>
      <Field label="Título"><input className="ed-input" placeholder="Hoja de trabajo · mapa corporal" value={block.title || ""} onChange={(e) => onChange({ title: e.target.value })}/></Field>
      <Field label="URL del PDF"><input className="ed-input" placeholder="https://…" value={block.url || ""} onChange={(e) => onChange({ url: e.target.value })}/></Field>
    </BlockFrame>
  );
}
function EditSeparatorBlock({ ...rest }) {
  return (
    <BlockFrame kind="separator" {...rest}>
      <div className="ed-field" style={{ color: "var(--ink-tertiary)", fontSize: 12, marginBottom: 0 }}>
        Una pausa visual entre secciones. No tiene contenido propio.
      </div>
    </BlockFrame>
  );
}
function EditPlaceholderBlock({ block, onPickKind, ...rest }) {
  // Renders as a different look — the dotted "add a block here" state.
  const Icon = BLOCK_ICONS[block.forKind] || IcoPlus;
  return (
    <button className="ed-block-placeholder" onClick={() => onPickKind?.()}>
      <span className="ed-block-placeholder-icon"><Icon/></span>
      <div className="ed-block-placeholder-meta">
        <div className="ed-block-placeholder-title">{block.hint || "Agrega un bloque"}</div>
        <div className="ed-block-placeholder-sub">Click para elegir un tipo · o usa "/" para abrir el menú</div>
      </div>
      <IcoArrow/>
    </button>
  );
}

// ── Dispatcher ───────────────────────────────────────────────────────────
function EditBlock({ block, onChange, onDelete, onDuplicate, onPickPlaceholder }) {
  const props = { block, onChange, onDelete, onDuplicate };
  switch (block.kind) {
    case "title":            return <EditTitleBlock {...props}/>;
    case "prose":            return <EditProseBlock {...props}/>;
    case "goal":             return <EditGoalBlock {...props}/>;
    case "author-insight":   return <EditAuthorInsightBlock {...props}/>;
    case "sidebar":          return <EditSidebarBlock {...props}/>;
    case "flip":             return <EditFlipBlock {...props}/>;
    case "video":            return <EditVideoBlock {...props}/>;
    case "audio":            return <EditAudioBlock {...props}/>;
    case "quiz":             return <EditQuizBlock {...props}/>;
    case "assessment":       return <EditAssessmentBlock {...props}/>;
    case "checklist":        return <EditChecklistBlock {...props}/>;
    case "exercise":         return <EditExerciseBlock {...props}/>;
    case "image":            return <EditImageBlock {...props}/>;
    case "pdf":              return <EditPdfBlock {...props}/>;
    case "separator":        return <EditSeparatorBlock {...props}/>;
    case "placeholder":      return <EditPlaceholderBlock block={block} onPickKind={onPickPlaceholder} {...props}/>;
    default:                 return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Preview renderers — compact reader-like display
// ─────────────────────────────────────────────────────────────────────────
function PreviewTitleBlock({ block })  { return <h3 className="pv-title">{block.text || "Título de sección"}</h3>; }
function PreviewSeparatorBlock()       { return <hr className="pv-sep"/>; }

function PreviewProseBlock({ block }) {
  return (
    <div className="ed-preview-block">
      {block.heading && <h4 className="pv-prose-h">{block.heading}</h4>}
      {(block.paragraphs || []).map((p, i) => <p key={i} className="pv-prose-p">{p || "Texto del párrafo."}</p>)}
      {block.bullets && block.bullets.length > 0 && (
        <ul className="pv-prose-bullets">{block.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
      )}
    </div>
  );
}

function PreviewGoalBlock({ block }) {
  return (
    <div className="ed-preview-block pv-goal">
      <div className="pv-goal-eye">{block.title || "Tu objetivo"}</div>
      <p className="pv-goal-body">{block.body || "Una frase ancla — qué aprenderá el lector."}</p>
    </div>
  );
}

function PreviewAuthorInsightBlock({ block }) {
  return (
    <div className="ed-preview-block pv-author">
      <span className="pv-author-avatar">{window.AUTHOR_PROFILE.avatarInitials}</span>
      <div>
        <p className="pv-author-quote">"{block.quote || "Una cita memorable del autor."}"</p>
        <div className="pv-author-meta">{window.AUTHOR_PROFILE.name} · {block.attribution || "contexto"}</div>
      </div>
    </div>
  );
}

function PreviewSidebarBlock({ block }) {
  return (
    <div className="ed-preview-block pv-sidebar">
      <div className="pv-sidebar-eye">Aforismo</div>
      <p className="pv-sidebar-body">{block.body || "Una frase que enmarca el resto."}</p>
    </div>
  );
}

function PreviewFlipBlock({ block }) {
  const front = block.front || {};
  return (
    <div className="ed-preview-block pv-flip">
      <div className="pv-flip-eye">{(front.label || "Concepto") + " · " + ((block.back && block.back.label) || "Ejemplo")}</div>
      <div className="pv-flip-title">{front.title || "Título del concepto"}</div>
      <p className="pv-flip-body">{front.body || "Una breve descripción del concepto."}</p>
      <div className="pv-flip-hint">Toca para ver el ejemplo →</div>
    </div>
  );
}

function PreviewVideoBlock({ block }) {
  return (
    <div className="ed-preview-block">
      <div className={"pv-video poster-" + (block.poster || "lavender")}>
        <button className="pv-video-play" aria-hidden>
          <svg viewBox="0 0 24 24" width="20" height="20"><path d="M8 5v14l11-7L8 5z" fill="currentColor"/></svg>
        </button>
        {block.duration && <span className="pv-video-duration">{block.duration}</span>}
      </div>
      <h4 className="pv-video-title">{block.title || "Título del video"}</h4>
      {block.caption && <p className="pv-video-caption">{block.caption}</p>}
    </div>
  );
}

function PreviewAudioBlock({ block }) {
  return (
    <div className="ed-preview-block pv-audio">
      <span className="pv-audio-play">
        <svg viewBox="0 0 24 24" width="14" height="14"><path d="M8 5v14l11-7L8 5z" fill="currentColor"/></svg>
      </span>
      <div className="pv-audio-body">
        <div className="pv-audio-title">{block.title || "Práctica guiada"}</div>
        {block.caption && <div className="pv-audio-cap">{block.caption}</div>}
        <div className="pv-audio-track"><div style={{ width: "22%" }}></div></div>
      </div>
    </div>
  );
}

function PreviewQuizBlock({ block }) {
  const opts = block.options || [
    { id: "a", text: "Opción A" }, { id: "b", text: "Opción B" }, { id: "c", text: "Opción C" }
  ];
  return (
    <div className="ed-preview-block pv-quiz">
      <h4 className="pv-quiz-q">{block.question || "¿Tu pregunta aquí?"}</h4>
      {opts.map((o, i) => (
        <div key={i} className="pv-quiz-opt">
          <span className="pv-quiz-opt-bullet">{String.fromCharCode(65 + i)}</span>
          <span>{o.text || "Opción " + String.fromCharCode(65 + i)}</span>
        </div>
      ))}
    </div>
  );
}

function PreviewAssessmentBlock({ block }) {
  return (
    <div className="ed-preview-block pv-quiz">
      <h4 className="pv-quiz-q">{block.title || "Autoevaluación"}</h4>
      <p style={{ font: "400 13px/1.5 var(--font-sans)", color: "var(--ink-muted)", margin: "0 0 10px" }}>
        {block.description || "Responde con honestidad — sin puntajes, solo claridad."}
      </p>
      <div className="pv-quiz-opt">1 · ¿Qué tan presente está esta sensación hoy?</div>
      <div className="pv-quiz-opt">2 · ¿Te identificas con la situación descrita?</div>
      <div className="pv-quiz-opt">3 · ¿Has notado este patrón antes?</div>
    </div>
  );
}

function PreviewChecklistBlock({ block }) {
  const items = (block.items || []).filter(Boolean);
  const fallback = ["Identifiqué algo nuevo.", "Lo escribí en mi cuaderno.", "Estoy listo para la siguiente lección."];
  const rows = items.length > 0 ? items : fallback;
  return (
    <div className="ed-preview-block pv-checklist">
      <div className="pv-checklist-title">{block.title || "Antes de continuar"}</div>
      <p className="pv-checklist-sub">{block.subtitle || "Marca lo que sí pudiste hacer en esta lección."}</p>
      {rows.map((it, i) => (
        <div key={i} className="pv-checklist-row">
          <span className="pv-checklist-box"></span>
          <span>{it}</span>
        </div>
      ))}
    </div>
  );
}

function PreviewExerciseBlock({ block }) {
  return (
    <div className="ed-preview-block pv-exercise">
      <h4 className="pv-exercise-title">{block.title || "Tu ejercicio"}</h4>
      <p className="pv-exercise-prompt">{block.prompt || "Una invitación a escribir o reflexionar."}</p>
      <div className="pv-exercise-input">{block.placeholder || "Empieza a escribir aquí…"}</div>
    </div>
  );
}

function PreviewImageBlock({ block }) {
  return (
    <div className="ed-preview-block pv-image">
      {block.url ? <img src={block.url} alt={block.alt || ""} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }}/> : "Imagen pendiente"}
    </div>
  );
}

function PreviewPdfBlock({ block }) {
  return (
    <div className="ed-preview-block pv-pdf">
      <span className="pv-pdf-icon">PDF</span>
      <div>
        <div className="pv-pdf-title">{block.title || "Hoja de trabajo"}</div>
        <div className="pv-pdf-sub">PDF descargable · Marina Salazar</div>
      </div>
    </div>
  );
}

function PreviewPlaceholderBlock({ block }) {
  return (
    <div className="ed-preview-block" style={{
      padding: 14, borderRadius: 10, background: "var(--paper-2)",
      border: "1px dashed var(--line-2)", color: "var(--ink-muted)",
      font: "500 12.5px/1.4 var(--font-sans)", textAlign: "center"
    }}>
      Aquí irá un {KIND_LABELS[block.forKind] || "bloque"} cuando lo agregues.
    </div>
  );
}

function PreviewBlock({ block }) {
  switch (block.kind) {
    case "title":            return <PreviewTitleBlock block={block}/>;
    case "prose":            return <PreviewProseBlock block={block}/>;
    case "goal":             return <PreviewGoalBlock block={block}/>;
    case "author-insight":   return <PreviewAuthorInsightBlock block={block}/>;
    case "sidebar":          return <PreviewSidebarBlock block={block}/>;
    case "flip":             return <PreviewFlipBlock block={block}/>;
    case "video":            return <PreviewVideoBlock block={block}/>;
    case "audio":            return <PreviewAudioBlock block={block}/>;
    case "quiz":             return <PreviewQuizBlock block={block}/>;
    case "assessment":       return <PreviewAssessmentBlock block={block}/>;
    case "checklist":        return <PreviewChecklistBlock block={block}/>;
    case "exercise":         return <PreviewExerciseBlock block={block}/>;
    case "image":            return <PreviewImageBlock block={block}/>;
    case "pdf":              return <PreviewPdfBlock block={block}/>;
    case "separator":        return <PreviewSeparatorBlock block={block}/>;
    case "placeholder":      return <PreviewPlaceholderBlock block={block}/>;
    default:                 return null;
  }
}

Object.assign(window, { EditBlock, PreviewBlock, KIND_LABELS });
