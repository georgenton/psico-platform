// reader/extras6.jsx — Fifth batch: items #20, #21, #22, #23.
// TTS player, bookclub panel, weekly recap email, author onboarding.

function H6I({ d, size = 16, sw = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p}/>) : <path d={d}/>}
    </svg>
  );
}
const H6 = {
  x:        <H6I d="M6 6l12 12M6 18L18 6"/>,
  arrow:    <H6I d="M5 12h14M13 6l6 6-6 6"/>,
  back:     <H6I d="M15 6l-6 6 6 6"/>,
  play:     <H6I d="M8 5v14l11-7z"/>,
  pause:    <H6I d={["M6 5h4v14H6z","M14 5h4v14h-4z"]} sw={0}/>,
  voice:    <H6I d={["M11 5L6 9H2v6h4l5 4z","M15.5 8.5a5 5 0 0 1 0 7","M19 5a9 9 0 0 1 0 14"]}/>,
  sparkle:  <H6I d={["M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z","M19 14l.7 2L22 17l-2.3 1L19 20l-.7-2L16 17l2.3-1z"]} sw={1.4}/>,
  people:   <H6I d={["M16 14a4 4 0 0 0-8 0","M12 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6z","M3 21a5 5 0 0 1 5-5","M21 21a5 5 0 0 0-5-5"]} sw={1.6}/>,
  invite:   <H6I d={["M14 8a4 4 0 1 0-8 0 4 4 0 0 0 8 0z","M2 21a8 8 0 0 1 14 0","M18 8v6","M15 11h6"]} sw={1.6}/>,
  mail:     <H6I d={["M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z","M3 6l9 7 9-7"]} sw={1.6}/>,
  cal:      <H6I d={["M5 4h14a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z","M16 2v4","M8 2v4","M4 10h16"]}/>,
  pen:      <H6I d={["M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7","M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"]}/>,
  check:    <H6I d="M5 12l5 5L20 7" sw={2.4}/>,
  edit:     <H6I d={["M12 20h9","M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"]}/>,
  layout:   <H6I d={["M3 3h18v18H3z","M3 9h18","M9 9v12"]} sw={1.6}/>,
  globe:    <H6I d={["M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z","M3 12h18","M12 3a13 13 0 0 1 0 18","M12 3a13 13 0 0 0 0 18"]} sw={1.4}/>,
  flame:    <H6I d="M12 2C10 6 6 8 6 12a6 6 0 0 0 12 0c0-2-1-3-2-4 1 3-1 5-2 5 0-4-2-7-2-11z"/>,
  bookm:    <H6I d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>,
  send:     <H6I d="M5 12l14-7-5 14-3-6-6-1z" sw={1.6}/>,
  lock:     <H6I d={["M7 11V7a5 5 0 0 1 10 0v4","M5 11h14v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"]}/>,
};

// ════════════════════════════════════════════════════════════════════════
// #20  TTS player — Marina's voice synthesised. Appears inline for prose
// blocks the user invokes it on, plus a sticky mini-player.
// ════════════════════════════════════════════════════════════════════════
function TTSPanel({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  const [voice, setVoice] = React.useState("marina");
  const [speed, setSpeed] = React.useState(1.0);
  const voices = [
    { id: "marina",   name: "Marina",         meta: "Voz IA entrenada con Marina · 14 hrs",   tag: "Recomendada", pro: false },
    { id: "ines",     name: "Inés",           meta: "Voz neutra latinoamericana",             tag: "Sin acento marcado" },
    { id: "manuel",   name: "Manuel",         meta: "Voz masculina · Bogotá",                 tag: "Bogotá" },
    { id: "neutra",   name: "Sintética",      meta: "Lectura básica sin entonación",          tag: "Gratis", default: true },
  ];
  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext6-tts " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Voz de Marina"
      >
        <header className="ext6-tts-head">
          <div>
            <span className="ext-eyebrow ext6-tts-eyebrow">
              <span className="ext6-tts-glyph">{H6.voice}</span>
              Voz de Marina · Beta
            </span>
            <h2 className="ext6-tts-title">Escucha cualquier pasaje en voz alta</h2>
            <p className="ext6-tts-sub">
              Cuando un audio grabado no existe — Marina lee con su voz IA.
              {" "}Lo aprobamos juntos para que suene como ella.
            </p>
          </div>
          <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{H6.x}</button>
        </header>

        <div className="ext6-tts-now">
          <div className="ext6-tts-now-eyebrow">Estás escuchando</div>
          <div className="ext6-tts-now-body">
            <strong>"La tristeza es una visita.</strong> Llega, se queda lo que tenga que quedarse, y se va. Trae información…"
          </div>
          <div className="ext6-tts-now-meta">Cap. 5 · Lec. 01 · ~1 min con tu voz seleccionada</div>
        </div>

        <section className="ext6-tts-section">
          <div className="ext6-tts-section-h">{H6.voice} Elige una voz</div>
          <div className="ext6-tts-voices">
            {voices.map((v) => (
              <button
                key={v.id}
                type="button"
                className={"ext6-tts-voice " + (voice === v.id ? "is-on" : "")}
                onClick={() => setVoice(v.id)}
              >
                <span className="ext6-tts-voice-wave" aria-hidden>
                  {Array.from({ length: 9 }, (_, i) => (
                    <span key={i} style={{ animationDelay: (i * 80) + "ms" }}></span>
                  ))}
                </span>
                <div className="ext6-tts-voice-meta">
                  <div className="ext6-tts-voice-name">
                    {v.name}
                    {v.tag && <span className={"ext6-tts-voice-tag " + (v.id === "marina" ? "is-feature" : "")}>{v.tag}</span>}
                  </div>
                  <div className="ext6-tts-voice-desc">{v.meta}</div>
                </div>
                <button className="ext6-tts-voice-preview" onClick={(e) => e.stopPropagation()}>
                  {H6.play}
                </button>
              </button>
            ))}
          </div>
        </section>

        <section className="ext6-tts-section">
          <div className="ext6-tts-section-h">Velocidad de lectura · {speed.toFixed(2)}×</div>
          <div className="ext6-tts-speed">
            {[0.75, 0.9, 1.0, 1.1, 1.25, 1.5].map((s) => (
              <button
                key={s}
                type="button"
                className={"ext6-tts-speed-opt " + (Math.abs(speed - s) < 0.05 ? "is-on" : "")}
                onClick={() => setSpeed(s)}
              >{s.toFixed(2)}×</button>
            ))}
          </div>
        </section>

        <section className="ext6-tts-section">
          <div className="ext6-tts-section-h">Aprobado por Marina</div>
          <div className="ext6-tts-approval">
            <span className="ext6-tts-approval-pulse" aria-hidden>
              <span></span><span></span>
            </span>
            <div>
              <div className="ext6-tts-approval-h">
                Marina revisó {voice === "marina" ? "1.420 horas" : "0 horas"} con esta voz
              </div>
              <div className="ext6-tts-approval-s">
                {voice === "marina"
                  ? "Solo se publica cuando ella valida el resultado. Si oyes algo raro, repórtalo y lo corregimos."
                  : "Las otras voces son neutras — no representan a Marina ni a la autora."}
              </div>
            </div>
          </div>
        </section>

        <footer className="ext6-tts-foot">
          <button className="ext-btn-ghost" onClick={onClose}>Volver al texto</button>
          <button className="ext-btn-primary">{H6.play} Empezar a leer {H6.arrow}</button>
        </footer>
      </div>
    </div>
  );
}

// Sticky mini-bar shown while TTS is active.
function TTSMiniBar({ voice = "marina", onOpen, onClose }) {
  return (
    <div className="ext6-tts-mini" role="region" aria-label="Voz reproduciendo">
      <button className="ext6-tts-mini-play" aria-label="Pausar">{H6.pause}</button>
      <div className="ext6-tts-mini-wave" aria-hidden>
        {Array.from({ length: 16 }, (_, i) => (
          <span key={i} style={{ animationDelay: (i * 50) + "ms" }}></span>
        ))}
      </div>
      <div className="ext6-tts-mini-meta">
        <div className="ext6-tts-mini-h">Marina leyendo · Cap. 5</div>
        <div className="ext6-tts-mini-s">1.0× · 1:24 / 4:30</div>
      </div>
      <button className="ext6-tts-mini-cog" aria-label="Opciones" onClick={onOpen}>{H6.sparkle}</button>
      <button className="ext6-tts-mini-close" aria-label="Cerrar" onClick={onClose}>{H6.x}</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// #21  Bookclub — shared annotations panel for a private group.
// ════════════════════════════════════════════════════════════════════════
const CLUB_MEMBERS = [
  { name: "Ana M.",    avatar: "AM", initials: "AM", color: "lav",   role: "Tú",       lastSeen: "leyendo ahora" },
  { name: "Carla R.",  avatar: "CR", initials: "CR", color: "sage",  role: "Amiga",    lastSeen: "hace 2 h"      },
  { name: "Joaco P.",  avatar: "JP", initials: "JP", color: "warm",  role: "Hermano",  lastSeen: "ayer"          },
  { name: "Luis A.",   avatar: "LA", initials: "LA", color: "rose",  role: "Amigo",    lastSeen: "hace 4 días"   },
];

const CLUB_ANNOTATIONS = [
  {
    by: "Carla R.",
    initials: "CR", color: "sage",
    chap: 5, lessonN: 1, time: "hace 1 h",
    kind: "note",
    quote: "tristeza y depresión no son lo mismo",
    note: "Me hizo pensar en cuando murió mi abuela y todo el mundo me decía 'no te deprimas'. Era tristeza, no era depresión, y eso me confundió por años.",
    cheers: 3, replies: 1,
  },
  {
    by: "Joaco P.",
    initials: "JP", color: "warm",
    chap: 5, lessonN: 2, time: "ayer",
    kind: "highlight",
    quote: "Notar el cuerpo cambia todo.",
    note: "",
    cheers: 4, replies: 0,
  },
  {
    by: "Luis A.",
    initials: "LA", color: "rose",
    chap: 5, lessonN: 4, time: "hace 4 días",
    kind: "note",
    quote: "Cuando la tristeza es escuchada, suele cambiar de forma.",
    note: "Quiero acordarme de esto cuando vuelva a pasar. Acompañarla, no apurarla.",
    cheers: 6, replies: 2,
  },
];

function BookclubDrawer({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  const [tab, setTab] = React.useState("anotaciones");
  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext6-club " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Tu círculo de lectura"
      >
        <header className="ext6-club-head">
          <div>
            <span className="ext-eyebrow ext6-club-eyebrow">
              {H6.people} Tu círculo de lectura
            </span>
            <h2 className="ext6-club-title">Cuatro personas, un libro</h2>
            <p className="ext6-club-sub">Las anotaciones se ven solo entre ustedes — Eco no las lee.</p>
          </div>
          <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{H6.x}</button>
        </header>

        <div className="ext6-club-members">
          {CLUB_MEMBERS.map((m) => (
            <div key={m.name} className="ext6-club-member">
              <span className={"ext6-club-avatar tone-" + m.color}>{m.initials}</span>
              <div className="ext6-club-member-meta">
                <div className="ext6-club-member-name">{m.name}</div>
                <div className="ext6-club-member-role">{m.role} · {m.lastSeen}</div>
              </div>
            </div>
          ))}
          <button className="ext6-club-invite" aria-label="Invitar a alguien">
            {H6.invite} Invitar
          </button>
        </div>

        <div className="ext6-club-tabs" role="tablist">
          {[
            { id: "anotaciones", label: "Anotaciones", n: CLUB_ANNOTATIONS.length },
            { id: "lectura",     label: "Qué leen ahora", n: 3 },
            { id: "discusion",   label: "Discusión",       n: 5 },
            { id: "calendario",  label: "Calendario",      n: 1 },
          ].map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              className={"ext6-club-tab " + (tab === t.id ? "is-on" : "")}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              <span className="ext6-club-tab-count">{t.n}</span>
            </button>
          ))}
        </div>

        <div className="ext6-club-body">
          {tab === "anotaciones" && (
            <ul className="ext6-club-anns">
              {CLUB_ANNOTATIONS.map((a, i) => (
                <li key={i} className="ext6-club-ann">
                  <span className={"ext6-club-avatar tone-" + a.color}>{a.initials}</span>
                  <div className="ext6-club-ann-body">
                    <header className="ext6-club-ann-head">
                      <span className="ext6-club-ann-by">{a.by}</span>
                      <span className="ext6-club-ann-meta">
                        {a.kind === "note" ? "Nota" : "Subrayado"} · Cap. {a.chap} · Lec. {String(a.lessonN).padStart(2, "0")} · {a.time}
                      </span>
                    </header>
                    <p className={"ext6-club-ann-quote tone-" + a.color}>"{a.quote}"</p>
                    {a.note && <p className="ext6-club-ann-note">{a.note}</p>}
                    <footer className="ext6-club-ann-foot">
                      <button className="ext6-club-react">💜 {a.cheers}</button>
                      <button className="ext6-club-react">💬 {a.replies}</button>
                      <button className="ext6-club-react">Responder</button>
                      <button className="ext6-club-jump">Ir al pasaje →</button>
                    </footer>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {tab === "lectura" && (
            <div className="ext6-club-reading">
              <div className="ext6-club-reading-row">
                <span className="ext6-club-avatar tone-sage">CR</span>
                <div>
                  <div className="ext6-club-reading-name">Carla R. <span>· hace 30 min</span></div>
                  <div className="ext6-club-reading-loc">Cap. 6 · Lec. 02 · "Rabia útil, rabia que daña"</div>
                  <div className="ext6-club-reading-bar"><div style={{ width: "62%" }}></div></div>
                </div>
              </div>
              <div className="ext6-club-reading-row">
                <span className="ext6-club-avatar tone-warm">JP</span>
                <div>
                  <div className="ext6-club-reading-name">Joaco P. <span>· hace 2 h</span></div>
                  <div className="ext6-club-reading-loc">Cap. 4 · Lec. 03 · "Alegría sin culpa"</div>
                  <div className="ext6-club-reading-bar"><div style={{ width: "88%" }}></div></div>
                </div>
              </div>
              <div className="ext6-club-reading-row">
                <span className="ext6-club-avatar tone-rose">LA</span>
                <div>
                  <div className="ext6-club-reading-name">Luis A. <span>· ayer</span></div>
                  <div className="ext6-club-reading-loc">Cap. 5 · Lec. 04 · "Lo que se va siendo escuchada"</div>
                  <div className="ext6-club-reading-bar"><div style={{ width: "100%" }}></div></div>
                </div>
              </div>
            </div>
          )}
          {tab === "discusion" && (
            <div className="ext6-club-empty">
              Hay 5 hilos abiertos en tu círculo. Última actividad hace 18 min.
            </div>
          )}
          {tab === "calendario" && (
            <div className="ext6-club-cal">
              <div className="ext6-club-cal-h">Próxima conversación · Domingo 7 PM</div>
              <p className="ext6-club-cal-s">
                Acordaron leer los capítulos 4 y 5 antes. Carla agregó una pregunta de partida: <em>"¿En qué cuerpo viven sus tristezas?"</em>
              </p>
              <button className="ext-btn-primary ext-btn-sm">Recordarme {H6.arrow}</button>
            </div>
          )}
        </div>

        <footer className="ext6-club-foot">
          <span className="ext6-club-foot-meta">{H6.lock} Privado · solo entre ustedes 4</span>
          <button className="ext-btn-ghost ext-btn-sm">Salir del círculo</button>
        </footer>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// #22  Weekly recap email preview — overlay with a faux email rendered as
// it would arrive in the inbox.
// ════════════════════════════════════════════════════════════════════════
function WeeklyRecapEmail({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext6-mail " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Resumen semanal"
      >
        <header className="ext6-mail-head">
          <div>
            <span className="ext-eyebrow">{H6.mail} Vista previa · Email</span>
            <h2 className="ext6-mail-title">Tu resumen semanal — domingo 7:00 AM</h2>
            <p className="ext6-mail-sub">Así llega a tu inbox. Lo puedes pausar o cambiar de día en Ajustes.</p>
          </div>
          <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{H6.x}</button>
        </header>

        <div className="ext6-mail-chrome">
          <div className="ext6-mail-chrome-row"><strong>De</strong> <span>Marina, en Psico Platform &lt;hola@psico.app&gt;</span></div>
          <div className="ext6-mail-chrome-row"><strong>Para</strong> <span>ana@gmail.com</span></div>
          <div className="ext6-mail-chrome-row"><strong>Asunto</strong> <span>Tu semana con la tristeza · 12 min · 6 subrayados ✨</span></div>
        </div>

        <div className="ext6-mail-body">
          <div className="ext6-mail-greeting">
            <div className="ext6-mail-avatar">MS</div>
            <div>
              <p className="ext6-mail-hi">Hola Ana 👋</p>
              <p className="ext6-mail-lead">Esta semana leíste 1h 28min y dejaste 6 subrayados en el capítulo de tristeza. Te dejo aquí lo que vi.</p>
            </div>
          </div>

          <section className="ext6-mail-section">
            <h3 className="ext6-mail-section-h">Lo que más te conmovió</h3>
            <blockquote className="ext6-mail-quote">
              "La tristeza no es un error del sistema. Es el sistema funcionando."
              <cite>— Marina, Cap. 5 Lec. 01</cite>
            </blockquote>
            <p className="ext6-mail-p">Lo subrayaste el martes y volviste a leerlo el viernes. Solemos volver a las frases que nos están diciendo algo.</p>
          </section>

          <section className="ext6-mail-section">
            <h3 className="ext6-mail-section-h">Tu semana en números</h3>
            <div className="ext6-mail-stats">
              <div className="ext6-mail-stat">
                <div className="ext6-mail-stat-num">1h 28m</div>
                <div className="ext6-mail-stat-lbl">Lectura total</div>
              </div>
              <div className="ext6-mail-stat">
                <div className="ext6-mail-stat-num">5</div>
                <div className="ext6-mail-stat-lbl">Días seguidos</div>
              </div>
              <div className="ext6-mail-stat">
                <div className="ext6-mail-stat-num">6</div>
                <div className="ext6-mail-stat-lbl">Subrayados</div>
              </div>
              <div className="ext6-mail-stat">
                <div className="ext6-mail-stat-num">1</div>
                <div className="ext6-mail-stat-lbl">Ejercicio escrito</div>
              </div>
            </div>
          </section>

          <section className="ext6-mail-section">
            <h3 className="ext6-mail-section-h">Lo que Marina escogió para ti</h3>
            <div className="ext6-mail-pick">
              <div className="ext6-mail-pick-cover" aria-hidden></div>
              <div>
                <div className="ext6-mail-pick-eyebrow">Cap. 6 · 24 min</div>
                <div className="ext6-mail-pick-title">Rabia útil, rabia que daña</div>
                <p className="ext6-mail-pick-why">
                  Después de la tristeza, la rabia suele asomar. Marina pensó que este capítulo te puede aterrizar lo que viene.
                </p>
                <a href="#" className="ext6-mail-cta">Empezar capítulo {H6.arrow}</a>
              </div>
            </div>
          </section>

          <section className="ext6-mail-section">
            <h3 className="ext6-mail-section-h">Una pregunta para llevarte</h3>
            <p className="ext6-mail-q">
              <em>"¿Qué cosa te importaba tanto que la tristeza vino a contarte que la perdiste?"</em>
            </p>
            <p className="ext6-mail-p">No hay que responder hoy. A veces la pregunta hace su trabajo sola.</p>
          </section>

          <footer className="ext6-mail-foot">
            <p className="ext6-mail-foot-sig">— Marina, y el equipo de Psico Platform</p>
            <div className="ext6-mail-foot-links">
              <a href="#">Cambiar día / hora</a> ·
              <a href="#">Recibir cada 2 semanas</a> ·
              <a href="#">Dejar de recibirlos</a>
            </div>
            <div className="ext6-mail-foot-fine">Psico Platform · Quito, Ecuador · Hecho con cuidado, en español.</div>
          </footer>
        </div>

        <div className="ext6-mail-controls">
          <button className="ext-btn-ghost ext-btn-sm">Cambiar día</button>
          <button className="ext-btn-ghost ext-btn-sm">Pausar 4 semanas</button>
          <button className="ext-btn-primary ext-btn-sm">Mantener activo {H6.check}</button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// #23  Author onboarding — wizard for psychologists writing their first
// lesson. Steps: bienvenida → identidad clínica → primera lección →
// publicación.
// ════════════════════════════════════════════════════════════════════════
const AUTHOR_STEPS = [
  { id: "welcome",   title: "Bienvenida, doctora",        sub: "Antes de empezar a escribir, te ponemos al tanto." },
  { id: "identity",  title: "Tu identidad clínica",       sub: "Esto aparece junto a tus textos. Tus lectores te creen porque te identifican." },
  { id: "voice",     title: "Tu voz",                     sub: "Marcamos tu tono para que la IA respete cómo escribes — no para reemplazarte." },
  { id: "lesson",    title: "Tu primera lección",         sub: "Empezamos con una de 5 minutos. No tiene que ser perfecta — tiene que ser tuya." },
  { id: "review",    title: "Revisión editorial",         sub: "Antes de publicar, alguien lee contigo. Ético y cuidado, no jerárquico." },
];

function AuthorOnboarding({ onClose, surface = "web" }) {
  const isMobile = surface === "mobile";
  const [step, setStep] = React.useState(0);
  const meta = AUTHOR_STEPS[step];

  return (
    <div className={"ext-overlay " + (isMobile ? "is-mobile" : "")} onMouseDown={onClose}>
      <div
        className={"ext6-author " + (isMobile ? "is-mobile" : "")}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Onboarding del autor"
      >
        <header className="ext6-author-head">
          <div className="ext6-author-progress">
            {AUTHOR_STEPS.map((s, i) => (
              <span key={s.id} className={"ext6-author-pill " + (i <= step ? "is-on" : "") + (i === step ? " is-current" : "")}>
                <span className="ext6-author-pill-n">{i + 1}</span>
                <span className="ext6-author-pill-l">{s.title}</span>
              </span>
            ))}
          </div>
          <button className="ext-iconclose" onClick={onClose} aria-label="Cerrar">{H6.x}</button>
        </header>

        <div className="ext6-author-body">
          <div className="ext6-author-step-head">
            <span className="ext-eyebrow">Paso {step + 1} de {AUTHOR_STEPS.length}</span>
            <h2 className="ext6-author-title">{meta.title}</h2>
            <p className="ext6-author-sub">{meta.sub}</p>
          </div>

          {step === 0 && (
            <div className="ext6-author-welcome">
              <div className="ext6-author-welcome-card">
                <span className="ext6-author-welcome-glyph">{H6.sparkle}</span>
                <div>
                  <div className="ext6-author-welcome-h">Psicoeducación, no terapia</div>
                  <div className="ext6-author-welcome-s">Lo que escribes aquí enseña, no diagnostica ni trata. Tu colegiación queda visible junto a tu nombre.</div>
                </div>
              </div>
              <div className="ext6-author-welcome-card">
                <span className="ext6-author-welcome-glyph">{H6.globe}</span>
                <div>
                  <div className="ext6-author-welcome-h">Lectores en 12 países</div>
                  <div className="ext6-author-welcome-s">Español latinoamericano neutro. Te ayudamos a evitar regionalismos sin perder calidez.</div>
                </div>
              </div>
              <div className="ext6-author-welcome-card">
                <span className="ext6-author-welcome-glyph">{H6.people}</span>
                <div>
                  <div className="ext6-author-welcome-h">Compartes el 60% del ingreso</div>
                  <div className="ext6-author-welcome-s">Repartido por minutos leídos de tus contenidos. Pagamos por transferencia o Wise.</div>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="ext6-author-form">
              <label className="ext6-author-field">
                <span className="ext6-author-lbl">Nombre profesional</span>
                <input className="ext6-author-input" defaultValue="Dra. Marina Salazar"/>
              </label>
              <div className="ext6-author-grid">
                <label className="ext6-author-field">
                  <span className="ext6-author-lbl">N° de colegiación / registro</span>
                  <input className="ext6-author-input" placeholder="EC-PSI-04812"/>
                </label>
                <label className="ext6-author-field">
                  <span className="ext6-author-lbl">País</span>
                  <select className="ext6-author-input">
                    <option>Ecuador</option><option>México</option><option>Colombia</option><option>Argentina</option>
                  </select>
                </label>
              </div>
              <label className="ext6-author-field">
                <span className="ext6-author-lbl">Bio corta · 240 caracteres</span>
                <textarea
                  className="ext6-author-textarea"
                  rows="3"
                  defaultValue="Psicóloga clínica con 18 años de práctica. Trabajo con regulación emocional y duelo. Creo que la sensibilidad es un instrumento, no una debilidad."
                />
              </label>
              <label className="ext6-author-field">
                <span className="ext6-author-lbl">Foto</span>
                <div className="ext6-author-photo">
                  <div className="ext6-author-photo-circle">MS</div>
                  <button className="ext-btn-ghost ext-btn-sm">Subir foto</button>
                  <span className="ext6-author-photo-meta">JPG / PNG · mínimo 600px · sin filtros</span>
                </div>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="ext6-author-voice">
              <div className="ext6-author-voice-h">¿Cómo describirías tu tono al escribir?</div>
              <div className="ext6-author-voice-grid">
                {[
                  { id: "intima",   on: true,  h: "Íntima",     s: "Como hablándole a una persona en consulta." },
                  { id: "calida",   on: true,  h: "Cálida",     s: "Con humanidad, sin clinicismo." },
                  { id: "directa",  on: false, h: "Directa",    s: "Va al grano, sin rodeos." },
                  { id: "poetica",  on: false, h: "Poética",    s: "Imágenes y metáforas frecuentes." },
                  { id: "evidente", on: true,  h: "Apoyada en evidencia", s: "Citas estudios, no opina sin base." },
                  { id: "humilde",  on: true,  h: "Humilde",    s: "Admites lo que no sabes." },
                ].map((v) => (
                  <label key={v.id} className={"ext6-author-voice-opt " + (v.on ? "is-on" : "")}>
                    <input type="checkbox" defaultChecked={v.on}/>
                    <div>
                      <div className="ext6-author-voice-opt-h">{v.h}</div>
                      <div className="ext6-author-voice-opt-s">{v.s}</div>
                    </div>
                  </label>
                ))}
              </div>
              <label className="ext6-author-field">
                <span className="ext6-author-lbl">Palabras que evitas en tus textos</span>
                <div className="ext6-author-chips">
                  {["paciente", "trastornado", "loca", "sufre de", "discapacidad mental"].map((c) => (
                    <span key={c} className="ext6-author-chip">{c} <button>{H6.x}</button></span>
                  ))}
                  <input className="ext6-author-chip-input" placeholder="+ agregar"/>
                </div>
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="ext6-author-lesson">
              <div className="ext6-author-lesson-card">
                <div className="ext6-author-lesson-head">
                  <span className="ext-eyebrow">Editor de lección</span>
                  <span className="ext6-author-lesson-tag">{H6.edit} Borrador</span>
                </div>
                <input className="ext6-author-lesson-title" placeholder="Título de tu lección"/>
                <textarea
                  className="ext6-author-lesson-textarea"
                  rows="5"
                  placeholder="Una idea por párrafo. Sin rodeos, sin perderte. Marina IA te ayudará a estructurar si lo pides."
                />
                <div className="ext6-author-lesson-blocks">
                  <button>+ Bloque de prosa</button>
                  <button>+ Pull quote</button>
                  <button>+ Ejercicio</button>
                  <button>+ Checklist</button>
                  <button>+ Audio</button>
                  <button>+ Reflexión rápida</button>
                </div>
              </div>
              <div className="ext6-author-lesson-aside">
                <div className="ext6-author-lesson-aside-h">{H6.sparkle} Marina IA sugiere</div>
                <ul className="ext6-author-lesson-aside-list">
                  <li>"Tu apertura podría empezar con una imagen del cuerpo antes que con la teoría — engancha más."</li>
                  <li>"Cuidado con la palabra 'paciente' — la marcaste como a evitar."</li>
                  <li>"Esta lección tiene 8 min · prueba bajarla a 5 para tu primer lanzamiento."</li>
                </ul>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="ext6-author-review">
              <div className="ext6-author-review-row">
                <span className="ext6-author-review-ico tone-sage">{H6.check}</span>
                <div>
                  <div className="ext6-author-review-h">Revisión editorial · 1 a 3 días hábiles</div>
                  <div className="ext6-author-review-s">Una psicóloga editora revisa tu contenido. No cambia tu voz, sí marca cosas que podrían ser dañinas o que faltan citas.</div>
                </div>
              </div>
              <div className="ext6-author-review-row">
                <span className="ext6-author-review-ico tone-warm">{H6.layout}</span>
                <div>
                  <div className="ext6-author-review-h">Maquetación + preview</div>
                  <div className="ext6-author-review-s">Diseñamos tu portada y un preview de 3 lecciones gratis. Tú apruebas antes de publicar.</div>
                </div>
              </div>
              <div className="ext6-author-review-row">
                <span className="ext6-author-review-ico tone-lav">{H6.globe}</span>
                <div>
                  <div className="ext6-author-review-h">Lanzamiento</div>
                  <div className="ext6-author-review-s">Te avisamos cuando publicamos. Tus primeros 50 lectores reciben acceso gratis por una semana — para que tengan tiempo de leerte sin presión.</div>
                </div>
              </div>
              <p className="ext6-author-review-fine">
                Si algo del proceso no te late, escríbele a Camila (editorial@psico.app). El proceso se ajusta a tu ritmo, no al nuestro.
              </p>
            </div>
          )}
        </div>

        <footer className="ext6-author-foot">
          {step > 0 && (
            <button className="ext-btn-ghost" onClick={() => setStep(step - 1)}>
              {H6.back} Atrás
            </button>
          )}
          <span className="ext6-author-foot-meta">
            {step === 0 && "Lleva 4 min completar"}
            {step === 1 && "Se valida con tu colegio profesional"}
            {step === 2 && "Puedes cambiarlo después de cada lección"}
            {step === 3 && "Guardamos cada 4 segundos"}
            {step === 4 && "Estás a punto de publicar"}
          </span>
          <button
            className="ext-btn-primary"
            onClick={() => step < AUTHOR_STEPS.length - 1 ? setStep(step + 1) : onClose()}
          >
            {step === AUTHOR_STEPS.length - 1 ? "Enviar a revisión" : "Continuar"} {H6.arrow}
          </button>
        </footer>
      </div>
    </div>
  );
}

Object.assign(window, { TTSPanel, TTSMiniBar, BookclubDrawer, WeeklyRecapEmail, AuthorOnboarding });
