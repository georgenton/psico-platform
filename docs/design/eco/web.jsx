// eco/web.jsx — Eco chat surface (web dashboard).

const { ECO, ECO_CAPS, ECO_PROMPTS, ECO_CONVERSATIONS, ECO_RAIL } = window;

function Ico({ d, size = 16, sw = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
}
const I = {
  send:    <Ico d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>,
  audio:   <Ico d={["M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z","M19 10v2a7 7 0 0 1-14 0v-2","M12 19v4M8 23h8"]}/>,
  attach:  <Ico d="M21 11.5 12.7 19.8a5.5 5.5 0 1 1-7.8-7.8L14 3a3.7 3.7 0 0 1 5.2 5.2L9.5 18a2 2 0 0 1-2.8-2.8L16 5.9"/>,
  smile:   <Ico d={["M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z","M8 14s1.5 2 4 2 4-2 4-2","M9 9h.01M15 9h.01"]}/>,
  more:    <Ico d={["M12 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2z","M5 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2z","M19 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"]} sw={2.4}/>,
  arrow:   <Ico d="M5 12h14M13 6l6 6-6 6"/>,
  back:    <Ico d="M15 6l-6 6 6 6"/>,
  bookmark:<Ico d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>,
};

// ── Sidebar ──────────────────────────────────────────────────────────────
function WebSidebar({ tier }) {
  const N = window.Icons;
  const items = [
    { icon: <N.home />,    label: "Inicio" },
    { icon: <N.book />,    label: "Mi biblioteca" },
    { icon: <N.eco />,   label: "Eco", on: true, badge: "Nuevo" },
    { icon: <N.plan />,    label: "Mi plan" },
    { icon: <N.user />,    label: "Perfil" },
  ];
  return (
    <aside className="web-side">
      <div className="web-side-head">
        <span className="web-side-wordmark">Psico Platform</span>
      </div>
      <nav className="web-side-nav">
        <div className="web-side-eyebrow">Menú</div>
        {items.map((it) => (
          <a key={it.label} className={"web-side-link " + (it.on ? "is-on" : "")} href="#">
            <span className="web-side-link-icon">{it.icon}</span>
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.badge && (
              <span style={{
                font: "700 9px/1 var(--font-sans)", letterSpacing: ".08em",
                padding: "3px 7px", borderRadius: 9999,
                background: "var(--color-sage-100)", color: "var(--color-sage-700)",
              }}>{it.badge}</span>
            )}
          </a>
        ))}
      </nav>
      <div className="web-side-foot">
        <div className="web-side-user">
          <span className="web-side-avatar">A</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="web-side-user-name">ana@correo.com</div>
            <div className="web-side-user-plan">
              <span className={"plan-dot " + (tier === "pro" ? "pro" : "")}></span>
              Plan {tier === "pro" ? "Pro" : "Gratuito"}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── Eco top header ───────────────────────────────────────────────────────
function EcoTop({ tier, remaining, isTyping }) {
  const free = tier === "free";
  return (
    <header className="eco-top">
      <div className="eco-top-l">
        <span className="eco-avatar">{ECO.initials}</span>
        <div className="eco-top-meta">
          <div className="eco-top-name">{ECO.name}</div>
          <div className="eco-top-status">
            {isTyping ? "Está escribiendo…" : "Disponible · responde en segundos"}
          </div>
        </div>
      </div>
      <div className="eco-top-r">
        {free && (
          <span className={"eco-top-quota " + (remaining <= 1 ? "warn" : "")}>
            Plan Gratuito · te quedan {remaining}/5
          </span>
        )}
        <button className="eco-top-iconbtn" aria-label="Más opciones">{I.more}</button>
      </div>
    </header>
  );
}

// ── Rich card (chapter / exercise) ───────────────────────────────────────
function RichCard({ card }) {
  return (
    <div className={"eco-card kind-" + card.kind}>
      <div className={"eco-card-cover cover-" + (card.cover || "cool")}></div>
      <div className="eco-card-body">
        <span className="eco-card-kind">
          {card.kind === "chapter" ? "Capítulo · " + (card.bookTitle || "") :
           card.kind === "exercise" ? "Ejercicio · audio" : ""}
        </span>
        <div className="eco-card-title">{card.title || card.chapter}</div>
        {card.sub && <div className="eco-card-sub">{card.sub}</div>}
        {card.excerpt && <p className="eco-card-excerpt">{card.excerpt}</p>}
        <div className="eco-card-actions">
          <button className="eco-card-cta primary">{card.cta} {I.arrow}</button>
          {card.ctaAlt && <button className="eco-card-cta ghost">{card.ctaAlt}</button>}
        </div>
      </div>
    </div>
  );
}

// ── Message ──────────────────────────────────────────────────────────────
function Msg({ m }) {
  if (m.from === "system") {
    return <div className="eco-system">{m.text}</div>;
  }
  if (m.card) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <RichCard card={m.card}/>
      </div>
    );
  }
  return (
    <div className={"eco-msg is-" + m.from}>
      {m.from === "eco" && <span className="eco-msg-avatar">{ECO.initials}</span>}
      {m.from === "user" && <span className="eco-msg-avatar" style={{ background: "var(--color-warm-300)", color: "var(--color-warm-700)" }}>A</span>}
      <div>
        <div className="eco-msg-bubble">{m.text}</div>
        <span className="eco-msg-time">{m.time}</span>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="eco-msg is-eco">
      <span className="eco-msg-avatar">{ECO.initials}</span>
      <div className="eco-typing">
        <span className="eco-typing-dot"/>
        <span className="eco-typing-dot"/>
        <span className="eco-typing-dot"/>
      </div>
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────
function EmptyState({ onPrompt }) {
  return (
    <div className="eco-empty">
      <span className="eco-empty-avatar">{ECO.initials}</span>
      <div>
        <h1>Cuéntame cómo llegas hoy.</h1>
        <p className="eco-empty-body">
          Soy {ECO.name}. Escucho lo que sientes y te ayudo a ponerle nombre.
          Estoy entrenado con los textos de la Dra. Marina Salazar — y con los ejercicios de Psico Platform.
        </p>
      </div>

      <div className="eco-empty-caps">
        {ECO_CAPS.can.map((c, i) => (
          <div key={i} className="eco-cap">
            <span className="eco-cap-glyph">{c.icon}</span>
            <div>
              <div className="eco-cap-title">{c.title}</div>
              <div className="eco-cap-sub">{c.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="eco-empty-prompts-h">Empieza con algo concreto</div>
        <div className="eco-empty-prompts">
          {ECO_PROMPTS.slice(0, 4).map((p) => (
            <button key={p.id} className="eco-empty-prompt" onClick={() => onPrompt(p)} type="button">
              <span className="eco-empty-prompt-emoji">{p.icon}</span>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="eco-empty-boundaries">
        <div className="eco-empty-boundaries-h">Antes de empezar — lo que no soy</div>
        {ECO_CAPS.cant.map((c, i) => (
          <div key={i} className="eco-empty-boundary">
            <span className="eco-empty-boundary-x">×</span>
            <div>
              <strong>{c.title}.</strong> {c.sub}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Composer ─────────────────────────────────────────────────────────────
function Composer({ value, onChange, onSend, showSuggestions, onSuggest }) {
  return (
    <div className="eco-composer-wrap">
      {showSuggestions && (
        <div className="eco-composer-suggestions">
          {ECO_PROMPTS.map((p) => (
            <button key={p.id} className="eco-suggest" onClick={() => onSuggest(p)} type="button">
              <span className="eco-suggest-emoji">{p.icon}</span>
              {p.label}
            </button>
          ))}
        </div>
      )}
      <div className="eco-composer">
        <div className="eco-composer-extras">
          <button className="eco-composer-extra" aria-label="Adjuntar">{I.attach}</button>
          <button className="eco-composer-extra" aria-label="Audio">{I.audio}</button>
        </div>
        <textarea
          className="eco-composer-input"
          placeholder="Escribe lo que necesites compartir — Eco escucha."
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
        />
        <button
          className="eco-composer-send"
          onClick={onSend}
          disabled={!value.trim()}
          aria-label="Enviar"
        >{I.send}</button>
      </div>
      <p className="eco-composer-help">
        Lo que escribas aquí no se comparte. <a href="#">Cómo cuidamos tu privacidad</a> · {ECO.name} es un complemento, no reemplaza terapia.
      </p>
    </div>
  );
}

// ── Free limit banner ────────────────────────────────────────────────────
function LimitBanner() {
  return (
    <div className="eco-limit">
      <div>
        <div className="eco-limit-eyebrow">Plan Gratuito</div>
        <h3 className="eco-limit-title">Has usado tus 5 mensajes de hoy con {ECO.name}.</h3>
        <p className="eco-limit-sub">
          Con Pro, conversas sin límite — y Eco puede leer tus capítulos en curso para responder con más contexto.
        </p>
      </div>
      <button className="eco-limit-cta">Actualizar a Pro {I.arrow}</button>
    </div>
  );
}

// ── Rail ─────────────────────────────────────────────────────────────────
function EcoRail() {
  return (
    <aside className="eco-rail">
      <section>
        <h3 className="eco-rail-h">Lo que Eco ha aprendido de ti</h3>
        <div className="eco-mem">
          {ECO_RAIL.memory.map((m, i) => (
            <div key={i} className="eco-mem-row">
              <span className="eco-mem-lbl">{m.lbl}</span>
              <span className="eco-mem-val">{m.val}</span>
            </div>
          ))}
        </div>
        <button className="eco-mem-edit">Editar lo que Eco recuerda →</button>
      </section>

      <section>
        <h3 className="eco-rail-h">Ejercicios para tener a mano</h3>
        <div className="eco-rail-ex">
          {ECO_RAIL.exercises.map((e, i) => (
            <div key={i} className="eco-rail-ex-row">
              <span className={"eco-rail-ex-cover cover-" + e.cover}></span>
              <div style={{ minWidth: 0 }}>
                <div className="eco-rail-ex-title">{e.title}</div>
                <div className="eco-rail-ex-sub">{e.min} min · audio guiado</div>
              </div>
              <span className="eco-rail-ex-go">→</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="eco-rail-h">Conversaciones anteriores</h3>
        {ECO_RAIL.recent.map((r, i) => (
          <div key={i} className="eco-recent-row">
            <div className="eco-recent-title">{r.title}</div>
            <div className="eco-recent-when">{r.when}</div>
            <p className="eco-recent-prev">{r.preview}</p>
          </div>
        ))}
      </section>
    </aside>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────
function WebEco({ tweaks, setTweak }) {
  const [draft, setDraft] = React.useState("");
  const handlePrompt = (p) => setDraft(p.label);

  const conversation =
    tweaks.state === "empty" ? ECO_CONVERSATIONS.empty :
    tweaks.state === "short" ? ECO_CONVERSATIONS.short :
                                ECO_CONVERSATIONS.long;

  const limitHit = tweaks.tier === "free" && tweaks.limitHit;

  return (
    <div className="web">
      <WebSidebar tier={tweaks.tier}/>
      <main className="web-main">
        <EcoTop
          tier={tweaks.tier}
          remaining={tweaks.tier === "free" ? (limitHit ? 0 : 3) : null}
          isTyping={tweaks.isTyping}
        />
        <div className="eco-body">
          <div className="eco-chat">
            <div className="eco-thread">
              <div className="eco-thread-inner">
                {tweaks.state === "empty" ? (
                  <EmptyState onPrompt={handlePrompt}/>
                ) : (
                  <>
                    <div className="eco-day">Hoy · viernes 15 may</div>
                    {conversation.map((m, i) => <Msg key={i} m={m}/>)}
                    {tweaks.isTyping && <TypingIndicator/>}
                  </>
                )}
              </div>
            </div>

            {limitHit && <LimitBanner/>}

            <Composer
              value={draft}
              onChange={setDraft}
              onSend={() => setDraft("")}
              showSuggestions={tweaks.state === "empty" ? false : true}
              onSuggest={(p) => setDraft(p.label)}
            />
          </div>
          {tweaks.showRail && <EcoRail/>}
        </div>
      </main>
    </div>
  );
}

window.WebEco = WebEco;
