// perfil/data.js — Datos para la pantalla Perfil.

window.PERFIL_USER = {
  firstName: "Ana",
  fullName: "Ana Lucía Vega",
  email: "ana@correo.com",
  city: "Quito",
  country: "Ecuador",
  joinedAt: "Noviembre 2025",
  joinedMonths: 6,
  avatarSeed: "AV",         // iniciales
  bio: "Aprendiendo a escucharme — un capítulo a la vez.",
};

// Tu camino — síntesis de los stats que viven en Inicio
window.PERFIL_STATS = [
  { id: "streak",   lbl: "Racha actual",         val: 6,  unit: "días",     hint: "Mejor: 11 días" },
  { id: "books",    lbl: "Libros leídos",        val: 1,  unit: "de 8",     hint: "1 más en curso" },
  { id: "chapters", lbl: "Capítulos terminados", val: 4,  unit: "",         hint: "+3 esta semana" },
  { id: "minutes",  lbl: "Minutos en lectura",   val: 384, unit: "min",     hint: "≈ 6 h 24 min total" },
  { id: "journal",  lbl: "Entradas de diario",   val: 12, unit: "",         hint: "12 este mes" },
  { id: "eco",      lbl: "Conversaciones con Eco", val: 23, unit: "",       hint: "5 esta semana" },
];

// Logros / hitos — visuales tipo badges
window.PERFIL_ACHIEVEMENTS = [
  { id: "first-chapter", icon: "📖", label: "Primer capítulo",      sub: "Hace 6 meses",   done: true  },
  { id: "first-week",    icon: "🌱", label: "Una semana seguida",    sub: "Hace 4 meses",   done: true  },
  { id: "first-journal", icon: "✎",  label: "Primera entrada",       sub: "Hace 3 meses",   done: true  },
  { id: "first-eco",     icon: "✦",  label: "Hola, Eco",              sub: "Hace 2 meses",   done: true  },
  { id: "ten-day",       icon: "🔥", label: "10 días seguidos",       sub: "Hace 1 mes",     done: true  },
  { id: "first-book",    icon: "📚", label: "Primer libro completo",  sub: "Hace 2 sem.",    done: true  },
  { id: "twenty-day",    icon: "✨", label: "20 días seguidos",       sub: "En 14 días",     done: false },
  { id: "all-eight",     icon: "🌳", label: "Los 8 libros",           sub: "Bloqueado · Pro",done: false, locked: true },
];

// Preferencias
window.PERFIL_PREFS = {
  voice: "neutro",                   // neutro · ecuador · mexico · colombia
  defaultMood: "calma",              // calma · foco · energia · reflexion
  fontScale: 1,                      // 0.9 - 1.15
  theme: "system",                   // system · light · dark
  readingTime: "15",                 // 5 · 15 · 30+ · var
  reminderTime: "evening",           // morning · afternoon · evening · skip
  language: "es-LATAM",
};

window.PERFIL_VOICE_OPTS = [
  { id: "neutro",   label: "Español neutro latinoamericano" },
  { id: "ecuador",  label: "Español de Ecuador (más cercano)" },
  { id: "mexico",   label: "Español de México" },
  { id: "colombia", label: "Español de Colombia" },
];
window.PERFIL_MOOD_OPTS = [
  { id: "calma",     label: "Calma" },
  { id: "foco",      label: "Foco" },
  { id: "energia",   label: "Energía" },
  { id: "reflexion", label: "Reflexión" },
];
window.PERFIL_TIME_OPTS = [
  { id: "5",   label: "5 min / día"  },
  { id: "15",  label: "15 min / día" },
  { id: "30+", label: "30+ min / día" },
  { id: "var", label: "Varía mucho" },
];
window.PERFIL_REMINDER_OPTS = [
  { id: "morning",   label: "🌅 Mañana"            },
  { id: "afternoon", label: "☕ Tarde"              },
  { id: "evening",   label: "🌙 Noche"             },
  { id: "skip",      label: "Sin recordatorios"   },
];

// Notificaciones
window.PERFIL_NOTIFS = [
  { id: "reminder",   label: "Recordatorio diario",   sub: "A las 21:00, según tu preferencia",    enabled: true  },
  { id: "weekly",     label: "Resumen semanal",        sub: "Los domingos por la mañana",           enabled: true  },
  { id: "newbook",    label: "Libros nuevos",          sub: "Cuando Marina o el equipo publican",   enabled: true  },
  { id: "eco-nudge",  label: "Sugerencias de Eco",     sub: "Cuando hay algo que te pueda servir",  enabled: false },
  { id: "promos",     label: "Promociones",            sub: "Descuentos y ofertas — máximo 1/mes",  enabled: false },
];

// Privacidad
window.PERFIL_PRIVACY = {
  ecoMemory:    true,    // Eco recuerda tus conversaciones
  journalPrivate: true,  // Diario solo lo lees tú
  shareUsage:   false,   // Analítica anónima
};

// Cuenta — campos
window.PERFIL_ACCOUNT_ROWS = [
  { id: "name",  lbl: "Nombre completo",   val: "Ana Lucía Vega",  action: "Editar" },
  { id: "email", lbl: "Correo",            val: "ana@correo.com",  action: "Cambiar" },
  { id: "pw",    lbl: "Contraseña",        val: "Última: hace 3 meses", action: "Actualizar" },
  { id: "2fa",   lbl: "Verificación en dos pasos", val: "Desactivada", action: "Activar", warn: true },
];

// App
window.PERFIL_APP_ROWS = [
  { id: "version",  lbl: "Versión",          val: "2.4.1"            },
  { id: "support",  lbl: "Soporte",          val: "hola@psico.app", link: true },
  { id: "terms",    lbl: "Términos de uso",   val: "",                link: true },
  { id: "privacy",  lbl: "Política de privacidad", val: "",          link: true },
];
