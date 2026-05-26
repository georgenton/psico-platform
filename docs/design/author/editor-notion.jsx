// author/editor-notion.jsx — Notion-style WYSIWYG variation.
// One column, no card chrome on blocks. Each block renders inline as the
// reader would see it, but text fields are bare inputs/textareas. A
// slash menu lets you insert new blocks. Right rail mirrors Substack.

const { IcoSpark, IcoPlus, IcoVersions, IcoEye, IcoSave, IcoSearch,
        IcoArrow, IcoCheck, IcoClose, IcoGrip } = window.EditorIcons;
const BLOCK_ICONS_N = window.BLOCK_ICONS;

let _nbid = 200;
const newNotionBlockId = () => "nb" + (++_nbid);

const NOTION_KIND_DEFAULTS = {
  title:            () => ({ text: "Nuevo título" }),
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

// ── Inline editable block — single line of UI per block, looks like reader.
function NotionBlock({ block, onChange, onDelete, onSlash }) {
  switch (block.kind) {
    case "title":
      return (
        <input
          className="ed-prose-h-input"
          placeholder="Título de sección"
          value={block.text || ""}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      );
    case "prose":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {block.heading != null && (
            <input
              className="ed-prose-h-input"
              placeholder="Encabezado opcional"
              value={block.heading || ""}
              onChange={(e) => onChange({ heading: e.target.value })}
            />
          )}
          <textarea
            placeholder="Escribe el cuerpo del párrafo. Separa con una línea en blanco para crear más párrafos."
            value={(block.paragraphs || []).join("\n\n")}
            onChange={(e) => onChange({ paragraphs: e.target.value.split(/\n\n+/) })}
            rows={3}
          />
        </div>
      );
    case "goal":
      return (
        <div className="pv-goal" style={{ borderRadius: 12 }}>
          <input
            className="pv-goal-eye"
            style={{ background: "transparent", border: 0, outline: 0, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--accent-strong)", fontSize: 10, width: "100%", padding: 0 }}
            placeholder="Tu objetivo"
            value={block.title || ""}
            onChange={(e) => onChange({ title: e.target.value })}
          />
          <textarea
            placeholder="Una frase ancla — qué aprenderá el lector."
            value={block.body || ""}
            onChange={(e) => onChange({ body: e.target.value })}
            rows={2}
            style={{ font: "500 14.5px/1.5 var(--font-sans)", color: "var(--ink-heading)", marginTop: 8, padding: 0 }}
          />
        </div>
      );
    case "author-insight":
      return (
        <div className="pv-author" style={{ alignItems: "flex-start" }}>
          <span className="pv-author-avatar">{window.AUTHOR_PROFILE.avatarInitials}</span>
          <div style={{ flex: 1 }}>
            <textarea
              placeholder="Una cita memorable…"
              value={block.quote || ""}
              onChange={(e) => onChange({ quote: e.target.value })}
              rows={2}
              style={{ font: "500 14px/1.5 var(--font-sans)", color: "var(--ink-heading)", fontStyle: "italic", padding: 0 }}
            />
            <input
              placeholder="atribución / contexto"
              value={block.attribution || ""}
              onChange={(e) => onChange({ attribution: e.target.value })}
              style={{ font: "500 11px/1 var(--font-sans)", color: "var(--ink-muted)", marginTop: 6, padding: 0 }}
            />
          </div>
        </div>
      );
    case "video":
      return (
        <div>
          <div className={"pv-video poster-" + (block.poster || "lavender")}>
            <button className="pv-video-play"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M8 5v14l11-7L8 5z" fill="currentColor"/></svg></button>
            {block.duration && <span className="pv-video-duration">{block.duration}</span>}
          </div>
          <input
            placeholder="Título del video"
            value={block.title || ""}
            onChange={(e) => onChange({ title: e.target.value })}
            style={{ font: "600 14.5px/1.3 var(--font-sans)", color: "var(--ink-heading)", marginTop: 10, padding: 0 }}
          />
          <input
            placeholder="Caption opcional"
            value={block.caption || ""}
            onChange={(e) => onChange({ caption: e.target.value })}
            style={{ font: "400 12.5px/1.5 var(--font-sans)", color: "var(--ink-muted)", marginTop: 4, padding: 0 }}
          />
        </div>
      );
    case "audio":
      return (
        <div className="pv-audio">
          <span className="pv-audio-play">
            <svg viewBox="0 0 24 24" width="14" height="14"><path d="M8 5v14l11-7L8 5z" fill="currentColor"/></svg>
          </span>
          <div className="pv-audio-body">
            <input
              placeholder="Título del audio"
              value={block.title || ""}
              onChange={(e) => onChange({ title: e.target.value })}
              style={{ font: "600 13.5px/1.2 var(--font-sans)", color: "var(--ink-heading)", padding: 0 }}
            />
            <input
              placeholder="Caption"
              value={block.caption || ""}
              onChange={(e) => onChange({ caption: e.target.value })}
              style={{ font: "400 12px/1.4 var(--font-sans)", color: "var(--ink-muted)", marginTop: 2, padding: 0 }}
            />
            <div className="pv-audio-track" style={{ marginTop: 8 }}><div style={{ width: "22%" }}></div></div>
          </div>
        </div>
      );
    case "quiz": {
      const opts = block.options || [{ id: "a", text: "" }, { id: "b", text: "", correct: true }, { id: "c", text: "" }];
      const setOption = (i, patch) => onChange({ options: opts.map((o, j) => j === i ? { ...o, ...patch } : o) });
      const setCorrect = (i) => onChange({ options: opts.map((o, j) => ({ ...o, correct: j === i })) });
      return (
        <div className="pv-quiz">
          <textarea
            placeholder="Escribe la pregunta…"
            value={block.question || ""}
            onChange={(e) => onChange({ question: e.target.value })}
            rows={2}
            style={{ font: "600 14.5px/1.3 var(--font-sans)", color: "var(--ink-heading)", padding: 0 }}
          />
          {opts.map((o, i) => (
            <div key={i} className="pv-quiz-opt" style={{ padding: "8px 10px" }}>
              <span className="pv-quiz-opt-bullet">{String.fromCharCode(65 + i)}</span>
              <input
                placeholder={"Opción " + String.fromCharCode(65 + i)}
                value={o.text || ""}
                onChange={(e) => setOption(i, { text: e.target.value })}
                style={{ font: "500 13px/1.4 var(--font-sans)", color: "var(--ink-body)", padding: 0, flex: 1 }}
              />
              <button
                onClick={() => setCorrect(i)}
                className={"ed-quiz-correct-toggle " + (o.correct ? "is-on" : "")}
                title="Marcar correcta"
              >
                <IcoCheck/>
              </button>
            </div>
          ))}
        </div>
      );
    }
    case "exercise":
      return (
        <div className="pv-exercise">
          <input
            placeholder="Título del ejercicio"
            value={block.title || ""}
            onChange={(e) => onChange({ title: e.target.value })}
            style={{ font: "600 15px/1.3 var(--font-sans)", color: "var(--ink-heading)", padding: 0 }}
          />
          <textarea
            placeholder="Prompt — qué invitas a escribir."
            value={block.prompt || ""}
            onChange={(e) => onChange({ prompt: e.target.value })}
            rows={2}
            style={{ font: "400 13.5px/1.55 var(--font-sans)", color: "var(--ink-body)", marginTop: 6, padding: 0 }}
          />
          <div className="pv-exercise-input">{block.placeholder || "Lo que el lector verá como placeholder…"}</div>
        </div>
      );
    case "checklist":
      return (
        <div className="pv-checklist">
          <input
            placeholder="Título"
            value={block.title || ""}
            onChange={(e) => onChange({ title: e.target.value })}
            style={{ font: "600 14px/1.3 var(--font-sans)", color: "var(--ink-heading)", padding: 0 }}
          />
          <textarea
            placeholder="Items, uno por línea…"
            value={(block.items || []).join("\n")}
            onChange={(e) => onChange({ items: e.target.value.split("\n") })}
            rows={4}
            style={{ font: "400 13px/1.5 var(--font-sans)", color: "var(--ink-body)", marginTop: 6, padding: 0 }}
          />
        </div>
      );
    case "sidebar":
      return (
        <div className="pv-sidebar">
          <textarea
            placeholder="Una frase para enmarcar…"
            value={block.body || ""}
            onChange={(e) => onChange({ body: e.target.value })}
            rows={2}
            style={{ font: "400 13.5px/1.55 var(--font-sans)", color: "var(--ink-heading)", fontStyle: "italic", padding: 0 }}
          />
        </div>
      );
    case "flip":
      return (
        <div className="pv-flip">
          <div className="pv-flip-eye">Concepto · Ejemplo (flip card)</div>
          <input
            placeholder="Título del concepto"
            value={block.front?.title || ""}
            onChange={(e) => onChange({ front: { ...block.front, title: e.target.value }})}
            style={{ font: "600 15px/1.3 var(--font-sans)", color: "var(--ink-heading)", marginTop: 8, padding: 0 }}
          />
          <textarea
            placeholder="Explicación del concepto"
            value={block.front?.body || ""}
            onChange={(e) => onChange({ front: { ...block.front, body: e.target.value }})}
            rows={2}
            style={{ font: "400 13.5px/1.55 var(--font-sans)", color: "var(--ink-body)", marginTop: 4, padding: 0 }}
          />
          <hr className="pv-sep" style={{ margin: "12px 0" }}/>
          <input
            placeholder="Título del ejemplo"
            value={block.back?.title || ""}
            onChange={(e) => onChange({ back: { ...block.back, title: e.target.value }})}
            style={{ font: "600 15px/1.3 var(--font-sans)", color: "var(--ink-heading)", padding: 0 }}
          />
          <textarea
            placeholder="Cómo se vería en la vida diaria"
            value={block.back?.body || ""}
            onChange={(e) => onChange({ back: { ...block.back, body: e.target.value }})}
            rows={2}
            style={{ font: "400 13.5px/1.55 var(--font-sans)", color: "var(--ink-body)", marginTop: 4, padding: 0 }}
          />
        </div>
      );
    case "image": return <div className="pv-image">{block.url ? "Imagen subida" : "Suelta una imagen aquí o usa el menú IA"}</div>;
    case "pdf":   return <div className="pv-pdf"><span className="pv-pdf-icon">PDF</span><div><div className="pv-pdf-title">{block.title || "Nombre del PDF"}</div><div className="pv-pdf-sub">Descargable</div></div></div>;
    case "separator": return <hr className="pv-sep"/>;
    default: return null;
  }
}

function SlashMenu({ open, query, onPick, onClose, position }) {
  if (!open) return null;
  const norm = (query || "").toLowerCase();
  const items = window.AUTHOR_BLOCK_LIBRARY.filter((b) =>
    !norm || b.name.toLowerCase().includes(norm) || b.kind.toLowerCase().includes(norm)
  );
  const byGroup = items.reduce((acc, b) => {
    (acc[b.group] = acc[b.group] || []).push(b);
    return acc;
  }, {});
  return (
    <>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 25 }}></div>
      <div className="slashmenu" style={{ left: position.left, top: position.top }}>
        <input
          autoFocus
          className="slashmenu-search"
          placeholder="Buscar bloque..."
          value={query}
          onChange={(e) => onPick._setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && items[0]) onPick(items[0].kind);
          }}
        />
        <div className="slashmenu-list">
          {Object.keys(byGroup).map((g) => (
            <React.Fragment key={g}>
              <div className="slashmenu-group">{g}</div>
              {byGroup[g].map((b) => {
                const Icon = window.BLOCK_ICONS[b.kind];
                return (
                  <button key={b.kind} className="slashmenu-item" onClick={() => onPick(b.kind)}>
                    <span className="slashmenu-item-icon">{Icon ? <Icon/> : null}</span>
                    <span className="slashmenu-item-name">{b.name}</span>
                  </button>
                );
              })}
            </React.Fragment>
          ))}
          {items.length === 0 && (
            <div style={{ padding: "16px 14px", textAlign: "center", color: "var(--ink-tertiary)", fontSize: 12 }}>
              Sin resultados para "{query}"
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function EditorNotion({ onBack }) {
  const seed = window.AUTHOR_LESSON_DRAFT;
  const [lesson, setLesson] = React.useState(() => ({
    ...seed,
    // Strip the placeholder block — Notion variation doesn't need it.
    blocks: seed.blocks.filter(b => b.kind !== "placeholder"),
  }));
  const [slash, setSlash] = React.useState({ open: false, query: "", insertAt: 0, position: { left: 0, top: 0 } });

  const setBlock = (i, patch) => setLesson((l) => ({ ...l, blocks: l.blocks.map((b, j) => j === i ? { ...b, ...patch } : b) }));
  const removeBlock = (i) => setLesson((l) => ({ ...l, blocks: l.blocks.filter((_, j) => j !== i) }));
  const insertBlock = (atIndex, kind) => {
    const next = { id: newNotionBlockId(), kind, ...NOTION_KIND_DEFAULTS[kind]() };
    setLesson((l) => {
      const blocks = [...l.blocks];
      blocks.splice(atIndex, 0, next);
      return { ...l, blocks };
    });
  };

  const openSlash = (atIndex, anchorRect) => {
    const position = anchorRect ? { left: anchorRect.left - 760/2 + 20, top: anchorRect.bottom + 4 } : { left: 100, top: 200 };
    // Clamp to keep menu in view
    setSlash({ open: true, query: "", insertAt: atIndex, position });
  };

  const onPickKind = (kind) => {
    insertBlock(slash.insertAt, kind);
    setSlash({ open: false, query: "", insertAt: 0, position: { left: 0, top: 0 } });
  };
  onPickKind._setQuery = (q) => setSlash((s) => ({ ...s, query: q }));

  return (
    <div className="editor-app">
      <window.EstudioTopBar
        crumbs={["Estudio", "Emociones en construcción", "Capítulo 1", lesson.title]}
        right={<>
          <button className="ebtn" onClick={onBack}>← Estructura</button>
          <button className="ebtn"><IcoEye/> Previsualizar</button>
          <button className="ebtn-primary ebtn"><IcoSave/> Guardado · {lesson.lastSavedAgo}</button>
        </>}
      />
      <div className="ednotion">
        <section className="ednotion-main">
          <div className="ednotion-doc">
            <input
              className="ednotion-title"
              placeholder="Título de la lección"
              value={lesson.title}
              onChange={(e) => setLesson({ ...lesson, title: e.target.value })}
            />
            <textarea
              className="ednotion-sub"
              placeholder="Subtítulo de la lección"
              rows={1}
              value={lesson.subtitle}
              onChange={(e) => setLesson({ ...lesson, subtitle: e.target.value })}
            />

            <div className="ednotion-blocks">
              {lesson.blocks.map((b, i) => (
                <div key={b.id} className="ednotion-block">
                  <span className="ednotion-block-handle" aria-hidden><IcoGrip/></span>
                  <div className="ednotion-block-content">
                    <NotionBlock
                      block={b}
                      onChange={(patch) => setBlock(i, patch)}
                      onDelete={() => removeBlock(i)}
                    />
                  </div>
                </div>
              ))}

              <div
                className="ednotion-empty-line"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  openSlash(lesson.blocks.length, rect);
                }}
              >
                <kbd>/</kbd>
              </div>
            </div>
          </div>
        </section>

        <aside className="ednotion-rail">
          <div className="rail-card">
            <div className="rail-eyebrow">✦ Marina IA</div>
            <h4 className="rail-h">Acciones rápidas</h4>
            <p className="rail-sub">Hover sobre un párrafo y presiona "/" para insertar un bloque.</p>
            <div className="rail-ai" style={{ marginTop: 8 }}>
              {window.AUTHOR_AI_HELPERS.slice(0, 4).map((h) => {
                const Icon = window.AI_HELPER_ICONS[h.id] || IcoSpark;
                return (
                  <button key={h.id} className="rail-ai-helper">
                    <span className="rail-ai-helper-icon"><Icon/></span>
                    <div className="rail-ai-helper-body">
                      <div className="rail-ai-helper-title">{h.title}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rail-card">
            <div className="rail-eyebrow">Plantilla activa</div>
            <h4 className="rail-h">Lección guiada básica</h4>
            <p className="rail-sub">Cambia de plantilla desde el menú "..." arriba a la derecha.</p>
          </div>

          <div className="rail-card">
            <div className="rail-eyebrow">Estado</div>
            <h4 className="rail-h">Borrador · auto-guardado</h4>
            <p className="rail-sub">Última versión hace {lesson.lastSavedAgo}.</p>
            <button className="ebtn ebtn-sm" style={{ marginTop: 8 }}>
              <IcoVersions/> Ver historial
            </button>
          </div>
        </aside>
      </div>

      <SlashMenu open={slash.open} query={slash.query} position={slash.position} onClose={() => setSlash({ ...slash, open: false })} onPick={onPickKind}/>
    </div>
  );
}

window.EditorNotion = EditorNotion;
