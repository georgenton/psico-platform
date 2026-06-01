// suggestor.js — Heurística determinística que decide el mood sugerido a
// partir de señales bioinspiradas. Devuelve { mood, theme, signals, confidence }.
//
// Diseño:
//   - 5 señales: hora, ritmo de lectura, journal sentiment, streak, check-in.
//   - Cada señal "vota" por uno o más moods con un peso.
//   - El mood con mayor score gana.
//   - El "tema del día" (Cercanía, Claridad, Acción, etc.) sale de combinar
//     mood + señal dominante.
//   - Cold start (sin señales) → null, el host muestra fallback.

window.MOOD_THEMES = {
  calma:     ["Pausa", "Suelta", "Bienestar", "Compañía", "Cuidado"],
  foco:      ["Claridad", "Trabajo", "Decisión", "Estructura", "Lente"],
  energia:   ["Acción", "Impulso", "Apertura", "Encuentro", "Caminar"],
  reflexion: ["Cercanía", "Recuerdo", "Hondura", "Silencio", "Mirar atrás"],
};

const HOUR_VOTES = (h) => {
  if (h >= 5  && h < 10) return { foco: 3, energia: 2 };
  if (h >= 10 && h < 14) return { foco: 2, calma: 1 };
  if (h >= 14 && h < 18) return { calma: 2, foco: 1 };
  if (h >= 18 && h < 22) return { reflexion: 2, calma: 2 };
  return { reflexion: 3, calma: 1 }; // late night
};

const PACE_VOTES = (pace) => {
  // pace = "short-fast" | "long-slow" | "balanced" | "stuck" | "absent"
  switch (pace) {
    case "short-fast": return { energia: 2 };
    case "long-slow":  return { reflexion: 2, calma: 1 };
    case "stuck":      return { foco: 2, calma: 1 };
    case "balanced":   return { calma: 1, foco: 1 };
    case "absent":     return { energia: 2 };
    default: return {};
  }
};

const SENTIMENT_VOTES = (sent) => {
  // sent = "warm" | "tense" | "heavy" | "neutral" | "open"
  switch (sent) {
    case "warm":    return { calma: 2, reflexion: 1 };
    case "tense":   return { foco: 2, calma: 1 };
    case "heavy":   return { reflexion: 3 };
    case "neutral": return { calma: 1 };
    case "open":    return { energia: 2, calma: 1 };
    default: return {};
  }
};

const STREAK_VOTES = (n) => {
  if (n <= 1)  return { energia: 2 };
  if (n <= 6)  return { foco: 1, energia: 1 };
  if (n <= 14) return { foco: 2, calma: 1 };
  return { calma: 2, reflexion: 1 };
};

const CHECKIN_VOTES = (id) => {
  // id = "tranquilo" | "neutral" | "tenso" | "cansado"
  switch (id) {
    case "tranquilo": return { calma: 3 };
    case "neutral":   return { foco: 2, calma: 1 };
    case "tenso":     return { calma: 2, reflexion: 1 };
    case "cansado":   return { reflexion: 2, calma: 1 };
    default: return {};
  }
};

const SIGNAL_LABEL = {
  hour:      (s) => ({
    icon: "clock",
    label: hourLabel(s.hour),
    detail: hourDetail(s.hour),
  }),
  pace:      (s) => ({
    icon: "pace",
    label: paceLabel(s.pace),
    detail: paceDetail(s.pace),
  }),
  sentiment: (s) => ({
    icon: "journal",
    label: sentimentLabel(s.sentiment),
    detail: sentimentDetail(s.sentiment),
  }),
  streak:    (s) => ({
    icon: "streak",
    label: streakLabel(s.streak),
    detail: streakDetail(s.streak),
  }),
  checkin:   (s) => ({
    icon: "heart",
    label: checkinLabel(s.checkin),
    detail: checkinDetail(s.checkin),
  }),
};

function hourLabel(h) {
  if (h >= 5  && h < 12) return "Mañana";
  if (h >= 12 && h < 18) return "Tarde";
  if (h >= 18 && h < 22) return "Atardecer";
  return "Noche";
}
function hourDetail(h) {
  if (h >= 5  && h < 12) return "Tu mente suele estar más despierta a esta hora.";
  if (h >= 12 && h < 18) return "Buena hora para sostener lecturas pausadas.";
  if (h >= 18 && h < 22) return "El día se cierra — bueno para revisar lo vivido.";
  return "La noche pide silencio interior.";
}
function paceLabel(p) {
  return ({
    "short-fast":"Lecturas cortas y rápidas",
    "long-slow":"Sesiones largas y lentas",
    "stuck":"Avance pausado",
    "balanced":"Lectura constante",
    "absent":"Reencuentro tras una pausa",
  })[p] || "Sin datos de ritmo";
}
function paceDetail(p) {
  return ({
    "short-fast":"Aprovechas tiempos cortos — buen momento para impulso.",
    "long-slow":"Estás leyendo con calma — terreno fértil para reflexionar.",
    "stuck":"Llevas días con poco avance — quizás un poco de foco ayude.",
    "balanced":"Tu ritmo se mantiene parejo.",
    "absent":"Llevas varios días sin abrir el libro — empezar de a poco.",
  })[p] || "";
}
function sentimentLabel(s) {
  return ({
    "warm":"Tu último journal fue cálido",
    "tense":"Tu último journal fue tenso",
    "heavy":"Tu último journal fue intenso",
    "neutral":"Tu último journal fue sereno",
    "open":"Tu último journal fue expansivo",
  })[s] || "Sin journal reciente";
}
function sentimentDetail(s) {
  return ({
    "warm":"Sigue con esa apertura.",
    "tense":"Vale la pena hacer espacio.",
    "heavy":"Hoy puede ser día de mirar despacio.",
    "neutral":"Buen punto de partida.",
    "open":"Tu día parece estar abierto a experiencias.",
  })[s] || "";
}
function streakLabel(n) {
  if (n <= 1)  return "Apenas empezando";
  if (n <= 6)  return n + " días seguidos leyendo";
  if (n <= 14) return n + " días en racha";
  return n + " días sostenidos";
}
function streakDetail(n) {
  if (n <= 1)  return "El primer paso es el más importante.";
  if (n <= 6)  return "Estás formando un ritmo.";
  if (n <= 14) return "Tu práctica se está consolidando.";
  return "Llevas un proceso profundo — cuídalo.";
}
function checkinLabel(c) {
  return ({
    tranquilo:"Te sientes tranquilo",
    neutral:"Te sientes neutral",
    tenso:"Te sientes tenso",
    cansado:"Te sientes cansado",
  })[c] || "Sin check-in hoy";
}
function checkinDetail(c) {
  return ({
    tranquilo:"Aprovecha el reposo.",
    neutral:"Buen punto medio para empezar.",
    tenso:"Hagamos espacio sin presión.",
    cansado:"El descanso también es proceso.",
  })[c] || "";
}

// Pick a theme for the mood, biased by which signal dominated.
function pickTheme(mood, signals, _topSignal) {
  const themes = window.MOOD_THEMES[mood] || ["Hoy"];
  // Deterministic pick based on the date so the same day shows the same theme.
  const seed = signals.dayOfYear || (new Date()).getDate();
  return themes[seed % themes.length];
}

// Main heuristic — returns null on cold start (no signals at all).
window.suggestMood = function suggestMood(signals) {
  if (!signals || (signals.hasJournal === false &&
                   signals.streak === 0 &&
                   signals.pace === "absent" &&
                   !signals.checkin)) {
    return null; // cold start → host shows fallback
  }

  const buckets = { calma: 0, foco: 0, energia: 0, reflexion: 0 };
  const used = [];

  // Always count hour — it's a passive signal we always have.
  add(buckets, HOUR_VOTES(signals.hour));
  used.push("hour");

  if (signals.pace && signals.pace !== "absent") {
    add(buckets, PACE_VOTES(signals.pace));
    used.push("pace");
  }
  if (signals.hasJournal && signals.sentiment) {
    add(buckets, SENTIMENT_VOTES(signals.sentiment));
    used.push("sentiment");
  }
  if (typeof signals.streak === "number") {
    add(buckets, STREAK_VOTES(signals.streak));
    used.push("streak");
  }
  if (signals.checkin) {
    add(buckets, CHECKIN_VOTES(signals.checkin));
    used.push("checkin");
  }

  const sorted = Object.entries(buckets).sort((a, b) => b[1] - a[1]);
  const [topMood, topScore] = sorted[0];
  const totalScore = sorted.reduce((s, [, v]) => s + v, 0);
  const confidence = totalScore === 0 ? 0 : (topScore / totalScore);

  // Build human-readable explanation list (top 2 signals by vote contribution).
  const signalContrib = used.map((sig) => {
    const votes = (sig === "hour"      ? HOUR_VOTES(signals.hour)        :
                   sig === "pace"      ? PACE_VOTES(signals.pace)         :
                   sig === "sentiment" ? SENTIMENT_VOTES(signals.sentiment):
                   sig === "streak"    ? STREAK_VOTES(signals.streak)     :
                                         CHECKIN_VOTES(signals.checkin));
    return { sig, weight: votes[topMood] || 0 };
  }).sort((a, b) => b.weight - a.weight);

  const signalCards = used.map((sig) => SIGNAL_LABEL[sig](signals));

  return {
    mood: topMood,
    theme: pickTheme(topMood, signals, signalContrib[0].sig),
    confidence,
    signals: signalCards,
    topSignals: signalContrib.slice(0, 2).map((c) => c.sig),
    scores: buckets,
  };
};

function add(dst, votes) {
  for (const k of Object.keys(votes || {})) {
    dst[k] = (dst[k] || 0) + votes[k];
  }
}

// Demo signal state — adjustable from Tweaks so the prototype can show every
// branch of the heuristic without waiting for real data.
window.PSICO_DEMO_SIGNALS = {
  hour: new Date().getHours(),
  pace: "balanced",
  hasJournal: true,
  sentiment: "neutral",
  streak: 6,
  checkin: null, // null until the user does the check-in
  dayOfYear: Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 864e5),
};

// Friendly Spanish summaries for theme + mood combos.
window.SUGGESTION_HEADLINES = {
  calma:     ["Hoy te servirá Calma", "Vamos despacio hoy", "Calma · " + ""],
  foco:      ["Hoy te servirá Foco", "Empecemos con Foco", "Hora de Foco"],
  energia:   ["Hoy te servirá Energía", "Algo de Energía para hoy"],
  reflexion: ["Hoy te servirá Reflexión", "Es momento de Reflexión", "Reflexión nocturna"],
};

window.suggestionHeadline = function (mood, theme) {
  const phrases = window.SUGGESTION_HEADLINES[mood] || ["Tu mood sugerido"];
  return phrases[0] + (theme ? " · " + theme : "");
};

window.suggestionShort = function (mood, theme) {
  return ({
    calma:     "Para soltar el ritmo del día.",
    foco:      "Para concentrarte sin ruido.",
    energia:   "Para encender el día.",
    reflexion: "Para mirar adentro con espacio.",
  })[mood] + (theme ? " Tema sugerido: " + theme + "." : "");
};
