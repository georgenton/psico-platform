/**
 * Landing page markup — Sprint A redesign.
 *
 * Sourced verbatim from docs/design/redesign-v2/landing/index.html with two
 * mechanical edits: placeholder href="#" CTAs replaced with the auth routes
 * (/login, /register, /), and the body wrapper unwrapped since the page
 * mounts it inside <main className="psico">.
 *
 * To update: re-run the extraction in the PR description, OR edit this file
 * directly. The associated styles live in ./landing.css and the interactive
 * behaviour (reveal-on-scroll, radar SVG) in ./_landing-client.tsx.
 */
export const LANDING_HTML = String.raw`

  <!-- ── NAVBAR ─────────────────────────────────────────────────── -->
  <header class="nav">
    <div class="wrap nav-inner">
      <a href="/" class="wordmark">
        <span class="mk"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5" opacity="0.65"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg></span>
        Psico
      </a>
      <nav class="nav-links">
        <a href="#mapa">Mapa Emocional</a>
        <a href="#eco">Eco IA</a>
        <a href="#patrones">Patrones</a>
        <a href="#evolucion">Tu evolución</a>
        <a href="#planes">Planes</a>
      </nav>
      <div class="nav-cta">
        <a href="/login" class="nav-login">Iniciar sesión</a>
        <a href="#planes" class="btn primary">Comienza tu mapa</a>
      </div>
    </div>
  </header>

  <!-- ── HERO ───────────────────────────────────────────────────── -->
  <section class="hero">
    <div class="wrap">
      <div class="hero-grid">
        <div class="hero-copy">
          <span class="hero-badge"><span class="pulse"></span> Autoconocimiento impulsado por IA emocional</span>
          <h1>No estás leyendo.<br><span class="accent">Te estás descubriendo.</span></h1>
          <p class="hero-lead">Psico transforma cada lectura, reflexión y conversación en un <b>mapa vivo de quién eres</b>. No una biblioteca — un sistema de transformación personal guiado por IA emocional.</p>
          <div class="hero-actions">
            <a href="#planes" class="btn primary btn-lg">Comienza tu mapa →</a>
            <a href="#mapa" class="btn outline btn-lg">Ver cómo funciona</a>
          </div>
          <div class="hero-reassure">
            <span><svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17.5 L19 6.5"/></svg> Gratis para empezar</span>
            <span><svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17.5 L19 6.5"/></svg> Privado por diseño</span>
            <span><svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17.5 L19 6.5"/></svg> Guiado por psicólogos</span>
          </div>
        </div>

        <!-- Living emotional map -->
        <div class="reveal d1">
          <div class="radar-card">
            <div class="radar-card-head">
              <div class="radar-card-title"><span class="dot"></span> Tu Mapa Emocional</div>
              <div class="radar-card-meta">En vivo · hoy</div>
            </div>
            <div class="radar-holder" id="heroRadar"></div>
            <div class="radar-floats" id="heroFloats">
              <span class="float-chip" style="top:6%; left:-4%; animation-delay:.6s">
                <svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5" opacity="0.65"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>
                Autoexigencia
              </span>
              <span class="float-chip sage" style="bottom:24%; right:-6%; animation-delay:.85s">
                <svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20 V11"/><path d="M12 13 C12 9 9 7 5 7 c0 4 3 6 7 6 Z"/><path d="M12 11 C12 8 14.5 6.5 18 6.5 c0 3.5-2.5 5-6 5 Z"/></svg>
                Autocompasión ↑
              </span>
              <span class="float-chip" style="bottom:2%; left:8%; animation-delay:1.05s">
                <svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 L13.7 10.3 L21 12 L13.7 13.7 L12 21 L10.3 13.7 L3 12 L10.3 10.3 Z"/></svg>
                Nuevo insight
              </span>
            </div>
            <div class="radar-foot">
              <div class="radar-score"><b>74%</b><span>Comprensión emocional</span></div>
              <div class="bar"><i></i></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── PROOF STRIP ────────────────────────────────────────────── -->
  <section class="proof">
    <div class="wrap">
      <div class="proof-stat"><b>8</b><span>patrones identificados</span></div>
      <div class="proof-div"></div>
      <div class="proof-stat"><b>41</b><span>insights generados</span></div>
      <div class="proof-div"></div>
      <div class="proof-stat"><b>128</b><span>reflexiones registradas</span></div>
      <div class="proof-div"></div>
      <div class="proof-stat"><b>21 días</b><span>de práctica constante</span></div>
      <div class="proof-div"></div>
      <div class="proof-stat"><b>+12 pts</b><span>de comprensión este mes</span></div>
    </div>
  </section>

  <!-- ── PARADIGM FLOW ──────────────────────────────────────────── -->
  <section class="sec">
    <div class="wrap">
      <div class="sec-head reveal">
        <span class="kicker">Cambio de paradigma</span>
        <h2>Esto no funciona como una biblioteca</h2>
        <p class="flow-strike"><s>Biblioteca → Libro → Capítulo → Lectura.</s> Ese era el viejo modelo.</p>
        <p>Aquí la lectura es solo el punto de partida de un recorrido hacia ti mismo.</p>
      </div>
      <div class="flow reveal d1">
        <div class="flow-step">
          <span class="flow-glyph"><svg class="ic" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21 L16.7 16.7"/></svg></span>
          <h4>Exploras</h4><p>Eliges un tema que conecta contigo</p>
        </div>
        <span class="flow-arrow"><svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
        <div class="flow-step">
          <span class="flow-glyph"><svg class="ic" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20 H21"/><path d="M16.5 3.5 a2.1 2.1 0 0 1 3 3 L7 19 l-4 1 1-4 Z"/></svg></span>
          <h4>Reflexionas</h4><p>Escribes y respondes a ti mismo</p>
        </div>
        <span class="flow-arrow"><svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
        <div class="flow-step">
          <span class="flow-glyph"><svg class="ic" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 L13.7 10.3 L21 12 L13.7 13.7 L12 21 L10.3 13.7 L3 12 L10.3 10.3 Z"/></svg></span>
          <h4>Descubres</h4><p>La IA revela un insight personal</p>
        </div>
        <span class="flow-arrow"><svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
        <div class="flow-step">
          <span class="flow-glyph"><svg class="ic" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5" opacity="0.65"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg></span>
          <h4>Reconoces</h4><p>Un patrón se vuelve visible</p>
        </div>
        <span class="flow-arrow"><svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
        <div class="flow-step">
          <span class="flow-glyph"><svg class="ic" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 L7 10 H10 L6 16 H18 L14 10 H17 Z"/><path d="M12 16 V21"/></svg></span>
          <h4>Te transformas</h4><p>Cambias cómo te relacionas contigo</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ── MAPA COSMOS (dark) ─────────────────────────────────────── -->
  <section class="sec cosmos" id="mapa">
    <div class="wrap">
      <div class="sec-head reveal">
        <span class="kicker on-dark">El corazón del producto</span>
        <h2>Un mapa vivo de quién eres</h2>
        <p>Cada cosa que haces en Psico alimenta una representación viva de tu mundo interior. No mides cuánto lees — descubres cuánto te comprendes.</p>
      </div>
      <div class="cosmos-grid">
        <div class="cosmos-radar reveal" id="cosmosRadar"></div>
        <div class="reveal d1">
          <p class="cosmos-lead">Tu Mapa Emocional no es una pantalla más: es el centro al que todo regresa. Se actualiza solo, en silencio, mientras vives la plataforma.</p>
          <ul class="feeders">
            <li class="feeder"><span class="fg"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 5 C6 4.2 9 4.2 12 5.5 C15 4.2 18 4.2 20.5 5 V18.5 C18 17.7 15 17.7 12 19 C9 17.7 6 17.7 3.5 18.5 Z"/><path d="M12 5.5 V19"/></svg></span><div><b>Lecturas</b><span>Cada capítulo aporta una pieza</span></div></li>
            <li class="feeder"><span class="fg"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4 H18 a1 1 0 0 1 1 1 V19 a1 1 0 0 1-1 1 H7 Z"/><path d="M11 9 H16" opacity="0.65"/><path d="M11 13 H16" opacity="0.65"/><circle cx="7" cy="9" r="0.9" fill="currentColor" stroke="none"/><circle cx="7" cy="13" r="0.9" fill="currentColor" stroke="none"/></svg></span><div><b>Reflexiones</b><span>Tu diario da forma al mapa</span></div></li>
            <li class="feeder"><span class="fg"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12 a7 7 0 1 0 4.5 -6.5"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/></svg></span><div><b>Conversaciones</b><span>Lo que hablas con Eco</span></div></li>
            <li class="feeder"><span class="fg sage"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12.8 19.6 A2 2 0 1 0 14 16 H2"/><path d="M17.5 8 A2.5 2.5 0 1 1 19.5 12 H2"/><path d="M9.8 4.4 A2 2 0 1 1 11 8 H2"/></svg></span><div><b>Ejercicios</b><span>Prácticas que consolidan</span></div></li>
            <li class="feeder"><span class="fg"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5" opacity="0.65"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg></span><div><b>Patrones</b><span>Tendencias que emergen</span></div></li>
            <li class="feeder"><span class="fg sage"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14 a4 4 0 0 0 7 0"/><circle cx="9" cy="10" r="0.6" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="0.6" fill="currentColor" stroke="none"/></svg></span><div><b>Estados de ánimo</b><span>Tu pulso emocional diario</span></div></li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <!-- ── ECO CORE ───────────────────────────────────────────────── -->
  <section class="sec eco-sec" id="eco">
    <div class="wrap split">
      <div class="reveal">
        <span class="kicker">Eco · el núcleo</span>
        <h2>Eco no es un chatbot. Es quien te ayuda a verte.</h2>
        <p class="lead2">Eco observa, aprende y te devuelve a ti mismo con cuidado. Un compañero reflexivo que conecta lo que lees, escribes y sientes — para mostrarte lo que tú aún no notas.</p>
        <div class="eco-roles">
          <div class="eco-role">
            <div class="er-h"><span class="er-g"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9 a5 5 0 0 1 10 0 c0 3.5-3.5 4-3.5 7 a2.5 2.5 0 0 1-5 0"/><path d="M10.5 9 a1.5 1.5 0 0 1 3 0 c0 1.2-1.5 1.5-1.5 3"/></svg></span><b>Observa</b></div>
            <p>Cómo te expresas, qué temas te detienen, cómo cambia tu ánimo.</p>
          </div>
          <div class="eco-role">
            <div class="er-h"><span class="er-g"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20 V11"/><path d="M12 13 C12 9 9 7 5 7 c0 4 3 6 7 6 Z"/><path d="M12 11 C12 8 14.5 6.5 18 6.5 c0 3.5-2.5 5-6 5 Z"/></svg></span><b>Aprende</b></div>
            <p>Recuerda tu historia y construye contexto sobre ti con el tiempo.</p>
          </div>
          <div class="eco-role">
            <div class="er-h"><span class="er-g"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5" opacity="0.65"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg></span><b>Detecta</b></div>
            <p>Patrones, disparadores y conexiones entre ideas que parecían sueltas.</p>
          </div>
          <div class="eco-role">
            <div class="er-h"><span class="er-g"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 C13.5 7 13.5 9.5 12 12 C10.5 9.5 10.5 7 12 4 Z"/><path d="M12 12 C9 11 6.5 9.5 5 7 C7.5 7 10 8.5 12 12 Z"/><path d="M12 12 C15 11 17.5 9.5 19 7 C16.5 7 14 8.5 12 12 Z"/><path d="M5 14.5 C7.5 16 10 16.5 12 16.5 C14 16.5 16.5 16 19 14.5"/></svg></span><b>Acompaña</b></div>
            <p>Propone preguntas y ejercicios — siempre a tu lado, nunca en tu lugar.</p>
          </div>
        </div>
        <p style="font:500 13px/1.5 var(--font-sans); color:var(--color-warm-400); display:flex; align-items:center; gap:8px;">
          <svg class="ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10 H18 a1 1 0 0 1 1 1 V19 a1 1 0 0 1-1 1 H6 a1 1 0 0 1-1-1 V11 a1 1 0 0 1 1-1 Z"/><path d="M8 10 V7 a4 4 0 0 1 8 0 V10"/></svg>
          Eco complementa, no reemplaza, la terapia profesional.
        </p>
      </div>
      <div class="chat reveal d1">
        <div class="chat-head">
          <span class="chat-avatar"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12 a7 7 0 1 0 4.5 -6.5"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/></svg></span>
          <div>
            <div class="chat-name">Eco</div>
            <div class="chat-status">Construyendo tu mapa · en vivo</div>
          </div>
        </div>
        <div class="bubbles">
          <div class="bubble eco">Buenas tardes, Ana. Releyendo lo que escribiste esta semana, noto algo. ¿Te late explorarlo?</div>
          <div class="bubble me">Sí, dime.</div>
          <span class="insight-tag">Patrón detectado</span>
          <div class="bubble eco">Cuando hablas de tu trabajo, casi siempre aparece la palabra "debería". Tiendes a medir tu valor por lo que produces.</div>
          <div class="bubble me">…nunca lo había visto así.</div>
          <div class="bubble eco">Es un descubrimiento valioso. Lo agregué a tu Mapa Emocional. ¿Probamos un ejercicio breve para mirarlo con más calma?</div>
        </div>
        <div class="chat-input">
          <svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-warm-400)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 a3 3 0 0 0-3 3 v7 a3 3 0 0 0 6 0 V5 a3 3 0 0 0-3-3 Z"/><path d="M19 10 v2 a7 7 0 0 1-14 0 v-2"/><path d="M12 19 v3"/></svg>
          <span>Comparte lo que estás sintiendo…</span>
          <span class="chat-send"><svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
        </div>
      </div>
    </div>
  </section>

  <!-- ── PATRONES IA ────────────────────────────────────────────── -->
  <section class="sec" id="patrones">
    <div class="wrap">
      <div class="sec-head reveal">
        <span class="kicker">Patrones IA</span>
        <h2>Tus patrones son lo más valioso que descubrirás</h2>
        <p>No son una función escondida en un menú. Son los hallazgos que te hacen decir "así soy yo" — y el motivo para volver mañana.</p>
      </div>
      <div class="pat-grid">
        <div class="pat reveal">
          <div class="pat-tag">Patrón predominante</div>
          <div class="pat-head">
            <span class="pat-glyph"><svg class="ic" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5" opacity="0.65"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg></span>
            <div><h3>Autoexigencia</h3><div class="sub">Presente en 6 de tus últimas 8 reflexiones</div></div>
          </div>
          <p>Tiendes a asociar el error con una pérdida de valor personal. Aparece sobre todo cuando hablas de trabajo y productividad.</p>
          <div class="pat-meter"><div class="bar"><i data-w="82%"></i></div><span class="pct">82%</span></div>
          <div class="pat-link"><span>Explorar este patrón</span><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>
        </div>

        <div class="pat reveal d1">
          <div class="pat-tag">Nueva conexión detectada</div>
          <div class="pat-head">
            <span class="pat-glyph"><svg class="ic" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 L12 3.5 L21 11"/><path d="M5 12 a7 7 0 1 0 4.5 -6.5"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/></svg></span>
            <div><h3>Perfeccionismo + miedo al juicio</h3><div class="sub">Dos patrones que se alimentan entre sí</div></div>
          </div>
          <p>Cuando temes ser juzgada, subes tus estándares. Y cuando no los alcanzas, el miedo crece. Eco notó el lazo y lo trazó en tu mapa.</p>
          <div class="pat-connect">
            <span class="node">Perfeccionismo</span>
            <span class="plus"><svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg></span>
            <span class="node">Miedo al juicio</span>
          </div>
          <div class="pat-link"><span>Ver la conexión</span><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>
        </div>

        <div class="pat reveal">
          <div class="pat-tag">Disparador recurrente</div>
          <div class="pat-head">
            <span class="pat-glyph"><svg class="ic" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18 a4 4 0 0 1 1-7.9 a5 5 0 0 1 9.6 1.4 A3.5 3.5 0 0 1 16 18 Z"/></svg></span>
            <div><h3>Validación externa</h3><div class="sub">Tu atención se activa con este tema</div></div>
          </div>
          <p>Los contenidos que más te detienen giran en torno a la aprobación de los demás y la autoestima. Una pista de hacia dónde mirar.</p>
          <div class="pat-meter"><div class="bar"><i data-w="64%"></i></div><span class="pct">64%</span></div>
          <div class="pat-link"><span>Profundizar</span><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>
        </div>

        <div class="pat sage reveal d1">
          <div class="pat-tag">Fortaleza emergente</div>
          <div class="pat-head">
            <span class="pat-glyph"><svg class="ic" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20 V11"/><path d="M12 13 C12 9 9 7 5 7 c0 4 3 6 7 6 Z"/><path d="M12 11 C12 8 14.5 6.5 18 6.5 c0 3.5-2.5 5-6 5 Z"/></svg></span>
            <div><h3>Autocompasión</h3><div class="sub">Creció un 18% en las últimas semanas</div></div>
          </div>
          <p>Cada vez te hablas con más amabilidad. Lo que antes era autocrítica empieza a transformarse en comprensión. Tu mapa lo refleja.</p>
          <div class="pat-meter"><div class="bar"><i data-w="71%"></i></div><span class="pct">71%</span></div>
          <div class="pat-link"><span>Ver tu progreso</span><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── INSIGHT DEL DÍA ────────────────────────────────────────── -->
  <section class="sec insight-band">
    <div class="wrap">
      <div class="insight-card reveal">
        <div class="ic-top">
          <span class="kicker">Insight del día</span>
          <span class="ic-date">Jueves · 19 jun</span>
        </div>
        <q>Durante las últimas semanas, tus reflexiones muestran una tendencia recurrente hacia la <b>autoexigencia</b>. Y, sin embargo, cada vez la nombras con más calma — eso también es parte de tu crecimiento.</q>
        <div class="ic-foot">
          <span class="av"><svg class="ic" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12 a7 7 0 1 0 4.5 -6.5"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/></svg></span>
          <span>Generado por Eco a partir de tu actividad reciente · solo tú puedes verlo</span>
        </div>
      </div>
    </div>
  </section>

  <!-- ── TIMELINE / EVOLUCIÓN ───────────────────────────────────── -->
  <section class="sec" id="evolucion">
    <div class="wrap">
      <div class="sec-head reveal">
        <span class="kicker sage">Tu evolución</span>
        <h2>Una línea de tiempo de transformación</h2>
        <p>No de cuántas páginas leíste — de cómo fuiste cambiando. Cada hito es un momento en que entendiste algo nuevo sobre ti.</p>
      </div>
      <div class="tl reveal d1">
        <div class="tl-item">
          <span class="tl-dot"><svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5" opacity="0.65"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg></span>
          <div class="tl-body"><div class="tl-month">Abril</div><h4>Identificaste tu patrón de perfeccionismo</h4><p>Por primera vez le pusiste nombre a esa voz que te exige más de lo que pides a los demás.</p></div>
        </div>
        <div class="tl-item sage">
          <span class="tl-dot"><svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18 a4 4 0 0 1 1-7.9 a5 5 0 0 1 9.6 1.4 A3.5 3.5 0 0 1 16 18 Z"/></svg></span>
          <div class="tl-body"><div class="tl-month">Mayo</div><h4>Reconociste tus principales disparadores emocionales</h4><p>Empezaste a anticipar qué situaciones te activan — y eso te dio margen para responder en vez de reaccionar.</p></div>
        </div>
        <div class="tl-item">
          <span class="tl-dot"><svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20 V11"/><path d="M12 13 C12 9 9 7 5 7 c0 4 3 6 7 6 Z"/><path d="M12 11 C12 8 14.5 6.5 18 6.5 c0 3.5-2.5 5-6 5 Z"/></svg></span>
          <div class="tl-body"><div class="tl-month">Junio</div><h4>Mejoraste tu autocompasión de forma notable</h4><p>El tono con el que te hablas cambió. Tu Mapa Emocional registró el mayor salto del trimestre.</p></div>
        </div>
        <div class="tl-item sage">
          <span class="tl-dot"><svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 L7 10 H10 L6 16 H18 L14 10 H17 Z"/><path d="M12 16 V21"/></svg></span>
          <div class="tl-body"><div class="tl-month">Próximo paso</div><h4>Desafiar tus pensamientos automáticos</h4><p>Eco preparó un recorrido para cuestionar esas ideas que aparecen solas. Cuando quieras, está listo.</p></div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── MÉTRICAS REFRAME ───────────────────────────────────────── -->
  <section class="sec metrics-sec">
    <div class="wrap">
      <div class="sec-head reveal">
        <span class="kicker">Lo que realmente cuenta</span>
        <h2>Medimos comprensión, no consumo</h2>
        <p>Las páginas y el tiempo de lectura pasan a segundo plano. Lo que ves es cuánto te estás conociendo.</p>
      </div>
      <div class="metrics reveal d1">
        <div class="metric"><span class="mg"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20 H21"/><path d="M16.5 3.5 a2.1 2.1 0 0 1 3 3 L7 19 l-4 1 1-4 Z"/></svg></span><b>128</b><span>Reflexiones realizadas</span></div>
        <div class="metric"><span class="mg"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 L13.7 10.3 L21 12 L13.7 13.7 L12 21 L10.3 13.7 L3 12 L10.3 10.3 Z"/></svg></span><b>41</b><span>Insights obtenidos</span></div>
        <div class="metric"><span class="mg"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5" opacity="0.65"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg></span><b>8</b><span>Patrones identificados</span></div>
        <div class="metric"><span class="mg"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12.8 19.6 A2 2 0 1 0 14 16 H2"/><path d="M17.5 8 A2.5 2.5 0 1 1 19.5 12 H2"/><path d="M9.8 4.4 A2 2 0 1 1 11 8 H2"/></svg></span><b>23</b><span>Ejercicios completados</span></div>
        <div class="metric"><span class="mg"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5 A2.5 2.5 0 0 0 11 12 c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5 a7 7 0 1 1-14 0 c0-1.2.4-2.3 1-3 a2.5 2.5 0 0 0 2.5 2.5 Z"/></svg></span><b>21</b><span>Días de práctica seguida</span></div>
      </div>
      <p class="metrics-note">Antes contábamos <s>páginas leídas · libros completados · minutos de lectura</s>. Ya no es lo importante.</p>
    </div>
  </section>

  <!-- ── LECTOR CON IA ──────────────────────────────────────────── -->
  <section class="sec">
    <div class="wrap">
      <div class="sec-head reveal">
        <span class="kicker">Lector con IA</span>
        <h2>La lectura que te responde</h2>
        <p>Mantiene la calma de siempre, pero cada párrafo puede abrir una pregunta, una conexión personal o un micro-ejercicio. Leer deja de ser pasivo.</p>
      </div>
      <div class="reader-mock reveal d1">
        <div class="reader-bar">
          <span class="rb-title">Emociones en Construcción · Capítulo 3 — La pausa antes de responder</span>
          <span class="rb-meta">Lector IA</span>
        </div>
        <div class="reader-body">
          <div class="reader-text">
            <h4>El espacio entre el estímulo y la respuesta</h4>
            <p>Entre lo que nos pasa y lo que hacemos con ello existe un espacio. Pequeño, casi imperceptible, pero real. En ese espacio vive nuestra libertad.</p>
            <p>La mayoría de las veces lo atravesamos sin darnos cuenta: alguien dice algo, y <span class="hl">reaccionamos antes de pensar</span>. La práctica no consiste en no sentir, sino en aprender a habitar ese espacio un instante más.</p>
            <p>Cuanto más lo entrenamos, más amplio se vuelve. Y en esa amplitud aparecen opciones que antes no veíamos.</p>
          </div>
          <div class="reader-aside">
            <div class="ra-card">
              <span class="ra-tag"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 L13.7 10.3 L21 12 L13.7 13.7 L12 21 L10.3 13.7 L3 12 L10.3 10.3 Z"/></svg> Pregunta para ti</span>
              <p class="q">¿Recuerdas la última vez que reaccionaste antes de pensar? ¿Qué había en ese espacio?</p>
            </div>
            <div class="ra-card sage">
              <span class="ra-tag"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12 a7 7 0 1 0 4.5 -6.5"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/></svg> Conexión personal</span>
              <p>Esto se relaciona con tu patrón de <b>autoexigencia</b>: la pausa también sirve para no juzgarte tan rápido.</p>
            </div>
            <div class="ra-card">
              <span class="ra-tag"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12.8 19.6 A2 2 0 1 0 14 16 H2"/><path d="M17.5 8 A2.5 2.5 0 1 1 19.5 12 H2"/><path d="M9.8 4.4 A2 2 0 1 1 11 8 H2"/></svg> Micro-ejercicio</span>
              <p>Antes de tu próxima respuesta difícil hoy, respira una vez. Solo una. Y observa qué cambia.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── TESTIMONIOS ────────────────────────────────────────────── -->
  <section class="sec eco-sec">
    <div class="wrap">
      <div class="sec-head reveal">
        <span class="kicker">Lo que descubren</span>
        <h2>Personas conociéndose de verdad</h2>
        <p>No vienen a leer. Vienen a entenderse — y se quedan porque algo cambia.</p>
      </div>
      <div class="grid-tst">
        <div class="tst reveal">
          <div class="tst-stars">
            <svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 L14.5 8.7 L21 9.3 L16 13.6 L17.6 20 L12 16.5 L6.4 20 L8 13.6 L3 9.3 L9.5 8.7 Z"/></svg>
            <svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 L14.5 8.7 L21 9.3 L16 13.6 L17.6 20 L12 16.5 L6.4 20 L8 13.6 L3 9.3 L9.5 8.7 Z"/></svg>
            <svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 L14.5 8.7 L21 9.3 L16 13.6 L17.6 20 L12 16.5 L6.4 20 L8 13.6 L3 9.3 L9.5 8.7 Z"/></svg>
            <svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 L14.5 8.7 L21 9.3 L16 13.6 L17.6 20 L12 16.5 L6.4 20 L8 13.6 L3 9.3 L9.5 8.7 Z"/></svg>
            <svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 L14.5 8.7 L21 9.3 L16 13.6 L17.6 20 L12 16.5 L6.4 20 L8 13.6 L3 9.3 L9.5 8.7 Z"/></svg>
          </div>
          <p class="tst-quote">"Ver mi patrón de autoexigencia dibujado en el mapa fue un golpe de claridad. Nadie me lo había mostrado así, con mis propias palabras."</p>
          <div class="tst-who">
            <span class="tst-ava" style="background:var(--gradient-cover-lavender);">AL</span>
            <div><div class="tst-name">Ana Lucía</div><div class="tst-city">Quito, Ecuador</div></div>
          </div>
        </div>
        <div class="tst reveal d1">
          <div class="tst-stars">
            <svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 L14.5 8.7 L21 9.3 L16 13.6 L17.6 20 L12 16.5 L6.4 20 L8 13.6 L3 9.3 L9.5 8.7 Z"/></svg>
            <svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 L14.5 8.7 L21 9.3 L16 13.6 L17.6 20 L12 16.5 L6.4 20 L8 13.6 L3 9.3 L9.5 8.7 Z"/></svg>
            <svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 L14.5 8.7 L21 9.3 L16 13.6 L17.6 20 L12 16.5 L6.4 20 L8 13.6 L3 9.3 L9.5 8.7 Z"/></svg>
            <svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 L14.5 8.7 L21 9.3 L16 13.6 L17.6 20 L12 16.5 L6.4 20 L8 13.6 L3 9.3 L9.5 8.7 Z"/></svg>
            <svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 L14.5 8.7 L21 9.3 L16 13.6 L17.6 20 L12 16.5 L6.4 20 L8 13.6 L3 9.3 L9.5 8.7 Z"/></svg>
          </div>
          <p class="tst-quote">"Cada semana Eco me muestra una conexión nueva entre cosas que yo veía sueltas. Es adictivo, pero en el buen sentido: quiero seguir descubriéndome."</p>
          <div class="tst-who">
            <span class="tst-ava" style="background:var(--gradient-cover-sage);">MR</span>
            <div><div class="tst-name">Mateo</div><div class="tst-city">Guayaquil, Ecuador</div></div>
          </div>
        </div>
        <div class="tst reveal d2">
          <div class="tst-stars">
            <svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 L14.5 8.7 L21 9.3 L16 13.6 L17.6 20 L12 16.5 L6.4 20 L8 13.6 L3 9.3 L9.5 8.7 Z"/></svg>
            <svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 L14.5 8.7 L21 9.3 L16 13.6 L17.6 20 L12 16.5 L6.4 20 L8 13.6 L3 9.3 L9.5 8.7 Z"/></svg>
            <svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 L14.5 8.7 L21 9.3 L16 13.6 L17.6 20 L12 16.5 L6.4 20 L8 13.6 L3 9.3 L9.5 8.7 Z"/></svg>
            <svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 L14.5 8.7 L21 9.3 L16 13.6 L17.6 20 L12 16.5 L6.4 20 L8 13.6 L3 9.3 L9.5 8.7 Z"/></svg>
            <svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3 L14.5 8.7 L21 9.3 L16 13.6 L17.6 20 L12 16.5 L6.4 20 L8 13.6 L3 9.3 L9.5 8.7 Z"/></svg>
          </div>
          <p class="tst-quote">"Mi línea de tiempo me hizo llorar. Ver en orden todo lo que entendí sobre mí en seis meses… no sabía que había avanzado tanto."</p>
          <div class="tst-who">
            <span class="tst-ava" style="background:var(--gradient-cover-mixed);">CM</span>
            <div><div class="tst-name">Camila</div><div class="tst-city">Bogotá, Colombia</div></div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ── PLANES ─────────────────────────────────────────────────── -->
  <section class="sec" id="planes">
    <div class="wrap">
      <div class="sec-head reveal">
        <span class="kicker sage">Planes</span>
        <h2>Empieza tu mapa gratis</h2>
        <p>Sin permanencia. Desbloquea a Eco y tus patrones cuando estés listo para ir más profundo.</p>
      </div>
      <div class="grid-price">
        <div class="plan reveal">
          <div class="plan-name">Explora</div>
          <div class="plan-price"><b>Gratis</b><span>para siempre</span></div>
          <p class="plan-desc">Empieza a construir tu mapa emocional</p>
          <ul class="plan-feats">
            <li><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17.5 L19 6.5"/></svg>Tu Mapa Emocional básico</li>
            <li><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17.5 L19 6.5"/></svg>Lectura introductoria + ejercicios</li>
            <li><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17.5 L19 6.5"/></svg>Diario y reflexiones</li>
          </ul>
          <a href="/register" class="plan-cta">Comenzar gratis</a>
        </div>

        <div class="plan featured reveal d1">
          <span class="plan-pop">El más elegido</span>
          <div class="plan-name">Transformación</div>
          <div class="plan-price"><b>$7</b><span>/mes · o $59/año</span></div>
          <p class="plan-desc">Todo el poder de la IA emocional</p>
          <ul class="plan-feats">
            <li><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17.5 L19 6.5"/></svg>Mapa Emocional completo y en vivo</li>
            <li><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17.5 L19 6.5"/></svg>Eco, tu compañero IA reflexivo</li>
            <li><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17.5 L19 6.5"/></svg>Patrones, conexiones e insights IA</li>
            <li><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17.5 L19 6.5"/></svg>Línea de tiempo de tu evolución</li>
            <li><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17.5 L19 6.5"/></svg>Biblioteca y audios completos</li>
          </ul>
          <a href="/register" class="plan-cta">Empezar mi transformación</a>
        </div>

        <div class="plan reveal d2">
          <div class="plan-name">Acompañado</div>
          <div class="plan-price"><b>$59</b><span>/año</span></div>
          <p class="plan-desc">Tu evolución con apoyo humano cuando lo necesites</p>
          <ul class="plan-feats">
            <li><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17.5 L19 6.5"/></svg>Todo lo de Transformación</li>
            <li><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17.5 L19 6.5"/></svg>Ahorra 30% vs. mensual</li>
            <li><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17.5 L19 6.5"/></svg>Terapia 1:1 con psicólogos titulados</li>
            <li><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17.5 L19 6.5"/></svg>Acceso anticipado a nuevos recorridos</li>
          </ul>
          <a href="/register" class="plan-cta">Elegir este plan</a>
        </div>
      </div>
    </div>
  </section>

  <!-- ── FAQ ────────────────────────────────────────────────────── -->
  <section class="sec eco-sec">
    <div class="wrap">
      <div class="sec-head reveal">
        <span class="kicker">Preguntas frecuentes</span>
        <h2>Lo que quizá te estás preguntando</h2>
      </div>
      <div class="faq-wrap">
        <details class="faq reveal">
          <summary>¿Entonces no es una app de libros? <svg class="ic chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></summary>
          <div class="faq-a">No. Hay libros, sí — pero son el vehículo, no el destino. Psico es una plataforma de autoconocimiento: la lectura, tus reflexiones y la IA alimentan un Mapa Emocional que te ayuda a comprenderte mejor.</div>
        </details>
        <details class="faq reveal">
          <summary>¿Qué es exactamente el Mapa Emocional? <svg class="ic chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></summary>
          <div class="faq-a">Es una representación viva de tu mundo interior — tus patrones, fortalezas, disparadores y tu nivel de comprensión emocional. Se construye solo a partir de lo que lees, escribes y conversas, y evoluciona contigo.</div>
        </details>
        <details class="faq reveal">
          <summary>¿Reemplaza la terapia? <svg class="ic chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></summary>
          <div class="faq-a">No. Es psicoeducación y autoconocimiento guiado. Eco es un complemento, nunca un sustituto. Y cuando quieras dar el paso, puedes reservar terapia 1:1 con psicólogos titulados desde la plataforma.</div>
        </details>
        <details class="faq reveal">
          <summary>¿Qué tan privado es todo esto? <svg class="ic chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></summary>
          <div class="faq-a">Privado por diseño. Tu diario, tu mapa y tus insights solo los ves tú. Eco únicamente guarda algo si tú se lo permites, y los patrones se calculan sin exponer tu identidad.</div>
        </details>
        <details class="faq reveal">
          <summary>¿Necesito tarjeta para empezar? <svg class="ic chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></summary>
          <div class="faq-a">No. El plan Explora es gratuito y sin tarjeta. Empiezas a construir tu mapa hoy y subes de plan solo si quieres desbloquear a Eco y tus patrones completos.</div>
        </details>
      </div>
    </div>
  </section>

  <!-- ── CTA BAND ───────────────────────────────────────────────── -->
  <section class="sec cta-band">
    <div class="wrap">
      <span class="kicker on-dark" style="justify-content:center;">Tu mapa te está esperando</span>
      <h2>Empieza a descubrir quién eres</h2>
      <p>No necesitas tener todo claro. Solo dar el primer paso — y dejar que tu Mapa Emocional crezca contigo, día a día.</p>
      <div class="actions">
        <a href="/register" class="btn white btn-lg">Comienza tu mapa — gratis</a>
        <a href="/login" class="btn ghost-w btn-lg">Ya tengo cuenta →</a>
      </div>
    </div>
  </section>

  <!-- ── FOOTER ─────────────────────────────────────────────────── -->
  <footer class="foot">
    <div class="wrap">
      <div class="foot-top">
        <div class="foot-brand">
          <a href="/" class="wordmark">
            <span class="mk"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5" opacity="0.65"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg></span>
            Psico
          </a>
          <p>Una plataforma de transformación personal basada en psicoeducación e inteligencia artificial emocional. Para Ecuador y LATAM.</p>
        </div>
        <div class="foot-col">
          <h4>Producto</h4>
          <a href="#mapa">Mapa Emocional</a>
          <a href="#eco">Eco IA</a>
          <a href="#patrones">Patrones</a>
          <a href="#evolucion">Tu evolución</a>
        </div>
        <div class="foot-col">
          <h4>Cuenta</h4>
          <a href="/login">Iniciar sesión</a>
          <a href="/register">Crear cuenta</a>
          <a href="mailto:hola@psicoplatform.com">Plan Empresarial</a>
        </div>
        <div class="foot-col">
          <h4>Soporte</h4>
          <a href="mailto:hola@psicoplatform.com">Contacto</a>
          <a href="#">Privacidad</a>
          <a href="#">Términos</a>
        </div>
      </div>
      <div class="foot-bottom">
        <p>© 2026 Psico · Ecuador y LATAM</p>
        <p>La lectura es la herramienta. La transformación es el producto.</p>
      </div>
    </div>
  </footer>
`;
