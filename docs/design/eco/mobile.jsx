// eco/mobile.jsx — Eco en iPhone.

const { ECO: E_M, ECO_CAPS: EC_M, ECO_PROMPTS: EP_M, ECO_CONVERSATIONS: CV_M } = window;

function MI({ d, size = 14, sw = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
}
const MICO = {
  back:  <MI d="M15 6l-6 6 6 6"/>,
  send:  <MI d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>,
  attach:<MI d="M21 11.5 12.7 19.8a5.5 5.5 0 1 1-7.8-7.8L14 3a3.7 3.7 0 0 1 5.2 5.2L9.5 18a2 2 0 0 1-2.8-2.8L16 5.9"/>,
  audio: <MI d={["M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z","M19 10v2a7 7 0 0 1-14 0v-2","M12 19v4M8 23h8"]}/>,
  more:  <MI d={["M12 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2z","M5 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2z","M19 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"]} sw={2.4}/>,
  arrow: <MI d="M5 12h14M13 6l6 6-6 6"/>,
};

function MobMsg({ m }) {
  if (m.from === "system") return <div className="mob-system">{m.text}</div>;
  if (m.card) {
    const c = m.card;
    return (
      <div className={"mob-card kind-" + c.kind}>
        <div className={"mob-card-cover cover-" + (c.cover || "cool")}></div>
        <div className="mob-card-body">
          <span className="mob-card-kind">
            {c.kind === "chapter" ? "Capítulo" : "Ejercicio · audio"}
          </span>
          <div className="mob-card-title">{c.title || c.chapter}</div>
          {c.sub && <div className="mob-card-sub">{c.sub}</div>}
          {c.excerpt && <p className="mob-card-excerpt">{c.excerpt}</p>}
          <button className="mob-card-cta">{c.cta} {MICO.arrow}</button>
        </div>
      </div>
    );
  }
  return (
    <div className={"mob-msg is-" + m.from}>
      {m.from === "eco" && <span className="mob-msg-avatar">{E_M.initials}</span>}
      {m.from === "user" && <span className="mob-msg-avatar" style={{ background: "var(--color-warm-300)", color: "var(--color-warm-700)" }}>A</span>}
      <div>
        <div className="mob-msg-bubble">{m.text}</div>
        <span className="mob-msg-time">{m.time}</span>
      </div>
    </div>
  );
}

function MobileEco({ tweaks, setTweak }) {
  const [draft, setDraft] = React.useState("");

  const conversation =
    tweaks.state === "empty" ? CV_M.empty :
    tweaks.state === "short" ? CV_M.short : CV_M.long;

  const limitHit = tweaks.tier === "free" && tweaks.limitHit;

  return (
    <div className="mob">
      {/* Header */}
      <header className="mob-top">
        <div className="mob-top-l">
          <button className="mob-top-back" aria-label="Atrás">{MICO.back}</button>
          <span className="mob-top-avatar">{E_M.initials}</span>
          <div className="mob-top-meta">
            <div className="mob-top-name">{E_M.name}</div>
            <div className="mob-top-status">{tweaks.isTyping ? "Escribiendo…" : "Disponible"}</div>
          </div>
        </div>
        <button className="mob-top-iconbtn" aria-label="Más">{MICO.more}</button>
      </header>

      {/* Thread (or empty) */}
      <div className="mob-thread">
        {tweaks.state === "empty" ? (
          <div className="mob-empty">
            <span className="mob-empty-avatar">{E_M.initials}</span>
            <div>
              <h1>Cuéntame cómo llegas hoy.</h1>
              <p className="mob-empty-body">
                Soy {E_M.name}. Escucho lo que sientes y te ayudo a ponerle nombre.
              </p>
            </div>
            <div className="mob-empty-prompts">
              {EP_M.slice(0, 4).map((p) => (
                <button key={p.id} className="mob-empty-prompt" onClick={() => setDraft(p.label)}>
                  <span className="mob-empty-prompt-emoji">{p.icon}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {conversation.map((m, i) => <MobMsg key={i} m={m}/>)}
            {tweaks.isTyping && (
              <div className="mob-msg is-eco">
                <span className="mob-msg-avatar">{E_M.initials}</span>
                <div className="eco-typing">
                  <span className="eco-typing-dot"/>
                  <span className="eco-typing-dot"/>
                  <span className="eco-typing-dot"/>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Composer (or limit) */}
      <div className="mob-composer-wrap">
        {limitHit ? (
          <div className="mob-limit">
            <div>
              <div className="mob-limit-title">Usaste tus 5 mensajes de hoy</div>
              <p className="mob-limit-sub">Pro · conversaciones sin límite con Eco</p>
            </div>
            <button className="mob-limit-cta">Pro →</button>
          </div>
        ) : (
          <>
            {tweaks.state !== "empty" && (
              <div className="mob-composer-suggestions">
                {EP_M.map((p) => (
                  <button key={p.id} className="mob-suggest" onClick={() => setDraft(p.label)}>
                    <span style={{ fontSize: 12 }}>{p.icon}</span>
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            <div className="mob-composer">
              <button className="mob-composer-extra" aria-label="Audio">{MICO.audio}</button>
              <input
                className="mob-composer-input"
                placeholder="Eco escucha…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button
                className="mob-composer-send"
                aria-label="Enviar"
                disabled={!draft.trim()}
                onClick={() => setDraft("")}
              >{MICO.send}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

window.MobileEco = MobileEco;
