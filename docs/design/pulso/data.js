// pulso/data.js — datos sintéticos pero realistas para Psico Platform
// Etapa: muy temprana (178 usuarios totales, $84 MRR, mes 1 de Terapia).
// Ventana por defecto: 30 días (21 abr → 20 may 2026).

window.P_META = {
  period: "30 días · 21 abr → 20 may 2026",
  weekOf: "Sem 20 · 14 → 20 may",
  generatedAt: "20 may · 09:14",
  user: { firstName: "Jorge", role: "Fundador" },
  totals: {
    users:         178,
    proUsers:      12,
    mrrUsd:        84,
    avgCacUsd:     6.20,
    cogsUsdMonth:  240,
    therapistCount: 4,
    booksLive:      2,
  },
};

// ═════════════════════════════════════════════════════════════
// KPIs · 4 números que miras cada mañana
// ═════════════════════════════════════════════════════════════
window.P_KPIS = [
  {
    id: "wau",
    label: "Activos · 7 días",
    value: 78,
    unit: "personas",
    deltaPct: 14,
    deltaLabel: "+10 vs sem ant",
    deltaDir: "up-good",
    spark: [42, 47, 51, 49, 56, 60, 62, 58, 64, 68, 71, 74, 68, 76, 78],
    sub: "DAU 32 · WAU 78 · MAU 142",
    note: "Domingos son tu día más alto (avg 36). Lunes el más bajo (18).",
  },
  {
    id: "signups",
    label: "Nuevos registros · 30 d",
    value: 64,
    unit: "registros",
    deltaPct: -8,
    deltaLabel: "−6 vs 30 d ant",
    deltaDir: "down-bad",
    spark: [3, 5, 4, 6, 2, 7, 8, 4, 3, 2, 5, 6, 3, 1, 2, 4, 2, 1, 3, 2, 1, 1, 0, 2, 0, 1, 1, 2, 0, 1],
    sub: "vs 70 hace un mes",
    note: "Pausa de Instagram (5 may) coincide con la caída — recupera o sustituye.",
  },
  {
    id: "conv",
    label: "Conversión gratis → Pro",
    value: 6.8,
    unit: "%",
    deltaPct: 21,
    deltaLabel: "+1.2 pt",
    deltaDir: "up-good",
    spark: [4.1, 4.4, 4.8, 5.2, 5.0, 5.4, 5.8, 6.0, 5.7, 6.1, 6.3, 6.5, 6.4, 6.8],
    sub: "12 de 178 pagan",
    note: "Conversión por canal varía 4× — recomendación es la más fuerte (12.5%).",
  },
  {
    id: "lectura",
    label: "Tiempo de lectura · 30 d",
    value: 7100,
    unit: "min",
    deltaPct: 18,
    deltaLabel: "+18% vs mes ant",
    deltaDir: "up-good",
    spark: [180, 195, 220, 240, 215, 260, 280, 270, 295, 310, 290, 320, 340, 335],
    sub: "40 min/usuario · ~12 caps/lector",
    note: "Métrica core del producto v1. Mientras esto suba, lo demás sigue.",
  },
];

// ═════════════════════════════════════════════════════════════
// LO QUE LLAMA LA ATENCIÓN · highlights narrativos
// ═════════════════════════════════════════════════════════════
window.P_HIGHLIGHTS = [
  {
    kind: "good",
    headline: "Cap. 5 del libro de Marina cierra al 89%",
    body: "El promedio de cierre por capítulo es 52%. Algo en ese capítulo retiene mejor — vale entender por qué antes de promoverlo.",
    link: { label: "Ver libro", view: "book" },
  },
  {
    kind: "bad",
    headline: "Pierdes 61% entre cap. 1 y cap. 2",
    body: "Es el único punto crítico del funnel. 106 personas terminan el cap. 1 — solo 41 empiezan el 2. Mira los últimos 90 segundos del cap. 1.",
    link: { label: "Ver funnel", view: "funnel" },
  },
  {
    kind: "watch",
    headline: "Móvil hace el diario, web compra Pro",
    body: "88% del diario sale en móvil. Pero 58% de las compras Pro pasan en web. El checkout móvil probablemente tiene fricción que no estás viendo.",
    link: { label: "Ver desglose", view: "funnel" },
  },
  {
    kind: "ok",
    headline: "Terapia sigue apagada — vá bien así",
    body: "Tres de cuatro gates verdes. Falta retención sem 4 ≥40% (vas en 33%). No abras Terapia hasta cerrar ese gate.",
    link: { label: "Ver gates", view: "terapia" },
  },
];

// ═════════════════════════════════════════════════════════════
// CRECIMIENTO · 30 días, signups + activados
// ═════════════════════════════════════════════════════════════
window.P_GROWTH = {
  series: [
    { d: "21 abr", su: 3, act: 2, ev: null },
    { d: "22 abr", su: 5, act: 3 },
    { d: "23 abr", su: 4, act: 3 },
    { d: "24 abr", su: 6, act: 4, ev: "Post Instagram" },
    { d: "25 abr", su: 2, act: 1 },
    { d: "26 abr", su: 7, act: 5 },
    { d: "27 abr", su: 8, act: 7 },
    { d: "28 abr", su: 4, act: 3 },
    { d: "29 abr", su: 3, act: 3 },
    { d: "30 abr", su: 2, act: 1 },
    { d: "1 may",  su: 5, act: 4 },
    { d: "2 may",  su: 6, act: 4, ev: "Podcast lanza" },
    { d: "3 may",  su: 3, act: 2 },
    { d: "4 may",  su: 1, act: 1 },
    { d: "5 may",  su: 2, act: 1, ev: "Pausa IG" },
    { d: "6 may",  su: 4, act: 3 },
    { d: "7 may",  su: 2, act: 2 },
    { d: "8 may",  su: 1, act: 1 },
    { d: "9 may",  su: 3, act: 2 },
    { d: "10 may", su: 2, act: 2 },
    { d: "11 may", su: 1, act: 0 },
    { d: "12 may", su: 1, act: 1 },
    { d: "13 may", su: 0, act: 0 },
    { d: "14 may", su: 2, act: 1 },
    { d: "15 may", su: 0, act: 0 },
    { d: "16 may", su: 1, act: 1 },
    { d: "17 may", su: 1, act: 1 },
    { d: "18 may", su: 2, act: 1, ev: "Mención podcast 2" },
    { d: "19 may", su: 0, act: 0 },
    { d: "20 may", su: 1, act: 1 },
  ],
  cohorts: [
    { cohort: "Sem 4 mar", size: 18, w1: 13, w2: 11, w3:  9, w4: 7 },
    { cohort: "Sem 1 abr", size: 22, w1: 17, w2: 14, w3: 10, w4: 9 },
    { cohort: "Sem 2 abr", size: 16, w1: 12, w2:  9, w3:  7, w4: 6 },
    { cohort: "Sem 3 abr", size: 24, w1: 19, w2: 13, w3: 10, w4: null },
    { cohort: "Sem 4 abr", size: 21, w1: 16, w2: 11, w3: null, w4: null },
    { cohort: "Sem 1 may", size: 14, w1: 10, w2: null, w3: null, w4: null },
    { cohort: "Sem 2 may", size:  9, w1: null, w2: null, w3: null, w4: null },
  ],
};

// ═════════════════════════════════════════════════════════════
// CANALES de adquisición
// ═════════════════════════════════════════════════════════════
window.P_CHANNELS = [
  { id: "referral",  label: "Recomendación",     signups: 12, pct: 19, conv: 12.5, cacUsd:  0,    note: "El canal que mejor convierte. Pero no escala solo." },
  { id: "organic",   label: "Búsqueda orgánica", signups: 21, pct: 33, conv:  8.2, cacUsd:  0,    note: "Subió 18% mes a mes. SEO está funcionando." },
  { id: "podcast",   label: "Podcast invitado",  signups:  8, pct: 12, conv:  9.0, cacUsd:  0,    note: "2 episodios. Cada uno trajo 4 personas." },
  { id: "instagram", label: "Instagram",         signups: 18, pct: 28, conv:  4.1, cacUsd: 12.50, note: "Vuelves a invertir — convierte la mitad que orgánico." },
  { id: "direct",    label: "Directo",           signups:  5, pct:  8, conv:  6.0, cacUsd:  0,    note: "Casi todos son tu equipo." },
];

// ═════════════════════════════════════════════════════════════
// FUNNEL · 8 pasos, marca rupturas
// ═════════════════════════════════════════════════════════════
window.P_FUNNEL = [
  { step: "Visita landing",          count: 1840, pct: 100,  passPct: 100,  delta: 12,  alert: null },
  { step: "Inicia registro",         count:  412, pct: 22.4, passPct: 22.4, delta: -2,  alert: null },
  { step: "Completa onboarding",     count:  321, pct: 17.4, passPct: 77.9, delta:  1,  alert: null },
  { step: "Abre primer libro",       count:  204, pct: 11.1, passPct: 63.6, delta:  4,  alert: null },
  { step: "Termina cap. 1",          count:  106, pct:  5.8, passPct: 52.0, delta: -3,  alert: null },
  { step: "Empieza cap. 2",          count:   41, pct:  2.2, passPct: 38.7, delta:  0,  alert: "break", break: "Pérdida del 61% — único punto crítico." },
  { step: "Prueba Pro (trial 7 d)",  count:   22, pct:  1.2, passPct: 53.7, delta:  5,  alert: null },
  { step: "Paga Pro",                count:   12, pct:  0.7, passPct: 54.5, delta:  3,  alert: null },
];

// ═════════════════════════════════════════════════════════════
// LIBROS · catálogo completo (2 libros) + drop-off por capítulo
// ═════════════════════════════════════════════════════════════
window.P_BOOKS = [
  {
    id: "emociones",
    title: "Emociones en construcción",
    author: "Dra. Marina Salazar",
    cover: "cool",
    chapters: 12,
    pages: 184,
    publishedOn: "27 ene 2026",
    startedBy:    142,
    completedBy:   38,
    completionPct: 26.8,
    avgMinPerChapter: 14.6,
    totalMinutes: 5240,
    favorites:     56,
    nps:           9.1,
    sharedToTx:    11,
    pickup7d:      18,
    chap: [
      { n: 1,  title: "El idioma del cuerpo",            startedBy: 142, completedBy: 106, avgMin: 14, drop: 25, favPct: 18 },
      { n: 2,  title: "Tristeza no es debilidad",        startedBy:  98, completedBy:  72, avgMin: 16, drop: 27, favPct: 22 },
      { n: 3,  title: "El miedo como brújula",           startedBy:  70, completedBy:  61, avgMin: 13, drop: 13, favPct: 14 },
      { n: 4,  title: "Lo que no se dice",                startedBy:  60, completedBy:  52, avgMin: 12, drop: 13, favPct: 11 },
      { n: 5,  title: "Cuando se rompe algo",             startedBy:  52, completedBy:  46, avgMin: 18, drop:  12, favPct: 31, star: true },
      { n: 6,  title: "Vergüenza",                        startedBy:  42, completedBy:  31, avgMin: 15, drop: 26, favPct: 19 },
      { n: 7,  title: "Rabia que cuida",                  startedBy:  30, completedBy:  24, avgMin: 13, drop: 20, favPct: 12 },
      { n: 8,  title: "Alegría sin razón",                startedBy:  23, completedBy:  19, avgMin: 11, drop: 17, favPct:  9 },
      { n: 9,  title: "El cuerpo recuerda",               startedBy:  18, completedBy:  15, avgMin: 17, drop: 17, favPct: 13 },
      { n: 10, title: "Estar con lo que está",            startedBy:  15, completedBy:  12, avgMin: 14, drop: 20, favPct: 10 },
      { n: 11, title: "Hábitos que sostienen",            startedBy:  12, completedBy:   9, avgMin: 12, drop: 25, favPct:  8 },
      { n: 12, title: "Lo que cambió en ti",              startedBy:   9, completedBy:   8, avgMin: 18, drop: 11, favPct: 15 },
    ],
  },
  {
    id: "familias",
    title: "Familias ensambladas",
    author: "Tomás Aguilar",
    cover: "warm",
    chapters: 10,
    pages: 156,
    publishedOn: "14 mar 2026",
    startedBy:    87,
    completedBy:   21,
    completionPct: 24.1,
    avgMinPerChapter: 11.2,
    totalMinutes: 1860,
    favorites:    19,
    nps:          8.6,
    sharedToTx:    3,
    pickup7d:      6,
    chap: [
      { n: 1,  title: "Cuando dos familias se cruzan",   startedBy: 87, completedBy: 64, avgMin: 11, drop: 26, favPct: 17 },
      { n: 2,  title: "El lugar de los hijos",            startedBy: 58, completedBy: 41, avgMin: 13, drop: 29, favPct: 14 },
      { n: 3,  title: "Permiso para no quererse aún",     startedBy: 38, completedBy: 32, avgMin: 12, drop: 16, favPct: 21 },
      { n: 4,  title: "Reglas que no se hablan",          startedBy: 30, completedBy: 25, avgMin: 10, drop: 17, favPct:  9 },
      { n: 5,  title: "Conflicto sano",                   startedBy: 23, completedBy: 19, avgMin: 11, drop: 17, favPct: 11 },
      { n: 6,  title: "El ex que sigue ahí",              startedBy: 17, completedBy: 13, avgMin: 12, drop: 24, favPct:  7 },
      { n: 7,  title: "Tiempo y paciencia",               startedBy: 13, completedBy: 11, avgMin:  9, drop: 15, favPct:  4 },
      { n: 8,  title: "Rituales nuevos",                  startedBy: 11, completedBy:  9, avgMin: 10, drop: 18, favPct:  6 },
      { n: 9,  title: "Cuando algo no encaja",            startedBy:  8, completedBy:  6, avgMin: 11, drop: 25, favPct:  4 },
      { n: 10, title: "Lo que sí es familia",             startedBy:  6, completedBy:  4, avgMin: 13, drop: 33, favPct:  5 },
    ],
  },
];

// ═════════════════════════════════════════════════════════════
// FUNCIONALIDADES · usadas en los últimos 30 días
// ═════════════════════════════════════════════════════════════
window.P_FEATURES = [
  { id: "lectura",    label: "Lectura",    icon: "◐", users: 142, minutes: 5240, sessionsAvg: 4.2, retentionD7: 48, trend: "up",     trendPct:  8 },
  { id: "diario",     label: "Diario",     icon: "◑", users:  87, minutes: 1860, sessionsAvg: 6.1, retentionD7: 62, trend: "up",     trendPct: 14 },
  { id: "audio",      label: "Audios",     icon: "◓", users:  64, minutes: 1240, sessionsAvg: 3.4, retentionD7: 41, trend: "steady", trendPct:  1 },
  { id: "ejercicios", label: "Ejercicios", icon: "◔", users:  41, minutes:  680, sessionsAvg: 2.1, retentionD7: 28, trend: "down",   trendPct: -6 },
  { id: "terapia",    label: "Terapia",    icon: "◕", users:   8, minutes:  400, sessionsAvg: 1.0, retentionD7: 75, trend: "new",    trendPct: null },
  { id: "voz",        label: "Voz",        icon: "◒", users:  12, minutes:  120, sessionsAvg: 1.3, retentionD7: 17, trend: "down",   trendPct: -22 },
  { id: "eco",        label: "Eco",        icon: "○", users:  29, minutes:  340, sessionsAvg: 2.0, retentionD7: 34, trend: "steady", trendPct:  2 },
];

// ═════════════════════════════════════════════════════════════
// MÓVIL VS WEB · split por evento clave
// ═════════════════════════════════════════════════════════════
window.P_DEVICE = [
  { event: "Registro",          mobile: 56, web: 44, note: "Móvil gana — landing en celular convierte mejor." },
  { event: "Lectura · libro",    mobile: 38, web: 62, note: "Web gana — lecturas largas en escritorio." },
  { event: "Diario",             mobile: 88, web: 12, note: "Casi exclusivo móvil. Confirma intención del feature." },
  { event: "Audio",              mobile: 71, web: 29, note: "Móvil — gente lo usa caminando." },
  { event: "Reservar terapia",   mobile: 67, web: 33, note: "Móvil. Después de las 22:00 sobre todo." },
  { event: "Sesión video",       mobile: 29, web: 71, note: "Web gana — pantalla grande." },
  { event: "Compra Pro",         mobile: 42, web: 58, note: "Web — checkout móvil tiene fricción a revisar." },
  { event: "Cancela Pro",        mobile: 64, web: 36, note: "Móvil — cancelar es más impulsivo." },
];

// ═════════════════════════════════════════════════════════════
// TERAPEUTAS · performance
// ═════════════════════════════════════════════════════════════
window.P_THERAPISTS = [
  {
    id: "marina",
    name: "Dra. Marina Salazar",
    initials: "MS",
    cover: "cool",
    isAutor: true,
    bookedThis30: 6,
    bookedTotal:  18,
    completionRate: 1.0,
    rebookRate:     0.83,
    avgRating:      4.9,
    reviewsN:       12,
    timeToFirstReply: "2 h",
    cancelRate:     0.05,
    payoutThis30:   162,
    note: "Es tu terapeuta ancla. 5 de 6 sesiones son recurrentes.",
  },
  {
    id: "tomas",
    name: "Tomás Aguilar",
    initials: "TA",
    cover: "warm",
    isAutor: true,
    bookedThis30: 1,
    bookedTotal:  3,
    completionRate: 1.0,
    rebookRate:     0.33,
    avgRating:      4.8,
    reviewsN:       3,
    timeToFirstReply: "6 h",
    cancelRate:     0.00,
    payoutThis30:   24,
    note: "Buena evaluación, pero solo 1 sesión nueva en el mes. Visibilidad baja.",
  },
  {
    id: "valeria",
    name: "Dra. Valeria Roca",
    initials: "VR",
    cover: "mixed",
    isAutor: false,
    bookedThis30: 1,
    bookedTotal:  4,
    completionRate: 1.0,
    rebookRate:     0.50,
    avgRating:      4.9,
    reviewsN:       4,
    timeToFirstReply: "1 h",
    cancelRate:     0.10,
    payoutThis30:   34,
    note: "Especialista en trauma — caro ($45). Considera trial 30 min reducido.",
  },
  {
    id: "joaquin",
    name: "Joaquín Luna",
    initials: "JL",
    cover: "cool",
    isAutor: false,
    bookedThis30: 0,
    bookedTotal:  1,
    completionRate: 1.0,
    rebookRate:     0.00,
    avgRating:      4.7,
    reviewsN:       1,
    timeToFirstReply: "12 h",
    cancelRate:     0.00,
    payoutThis30:    0,
    note: "Sin actividad este mes. ¿Sigue activo o se desconectó?",
  },
];

// ═════════════════════════════════════════════════════════════
// SEÑALES DE RIESGO · ética
// ═════════════════════════════════════════════════════════════
window.P_RISK = {
  flagged: 3,
  resolved: 2,
  pending: 1,
  note: "1 usuario marcó ideación en intake esta semana — derivado a guardia.",
};

// ═════════════════════════════════════════════════════════════
// MRR + dinero · 6 meses
// ═════════════════════════════════════════════════════════════
window.P_REVENUE = {
  series: [
    { m: "Dic 25", mrr: 14,  paying:  2, churn: 0 },
    { m: "Ene 26", mrr: 35,  paying:  5, churn: 0 },
    { m: "Feb 26", mrr: 49,  paying:  7, churn: 0 },
    { m: "Mar 26", mrr: 56,  paying:  8, churn: 1 },
    { m: "Abr 26", mrr: 70,  paying: 10, churn: 0 },
    { m: "May 26", mrr: 84,  paying: 12, churn: 1, current: true },
  ],
  arpu: 7.0,
  cogsMonth: 240,
  runwayMonths: 22,
  note: "Cubres 35% de COGS con MRR. Cierra ese gap antes de B2B.",
};

// ═════════════════════════════════════════════════════════════
// TERAPIA · pre-launch. Gates de activación.
// La intuición: encender Terapia solo cuando los libros estén
// probando producto. Cada gate es una condición operativa.
// ═════════════════════════════════════════════════════════════
window.P_TERAPIA = {
  status: "off",              // off | piloto | live
  decidedAt: "20 may 2026",
  hypothesis: "Si los libros retienen y convierten en Pro, Terapia es la extensión natural — no antes. Para empezar quemamos 2 terapeutas piloto en Ecuador, 50 usuarios, 30 días.",
  pilotPlan: {
    therapists: 2,
    users: 50,
    durationDays: 30,
    country: "Ecuador",
  },
  // Lo que tiene que estar en verde antes de encender
  gates: [
    {
      id: "users",
      label: "Usuarios totales",
      target: 300,
      current: 178,
      unit: "personas",
      status: "yellow",
      note: "59% del camino — 2-3 meses más al ritmo actual.",
    },
    {
      id: "retention",
      label: "Retención sem 4",
      target: 40,
      current: 33,
      unit: "%",
      status: "yellow",
      note: "Sube cuando arregles el cap. 1 → cap. 2.",
    },
    {
      id: "pro",
      label: "Conversión Pro",
      target: 5,
      current: 6.8,
      unit: "%",
      status: "green",
      note: "Validas dispoción a pagar. ✓",
    },
    {
      id: "nps",
      label: "NPS de libros",
      target: 8.0,
      current: 9.1,
      unit: "/10",
      status: "green",
      note: "El contenido funciona. ✓",
    },
    {
      id: "mrr",
      label: "MRR mínimo",
      target: 200,
      current: 84,
      unit: "USD",
      status: "yellow",
      note: "Cubre COGS antes de añadir costo operativo (terapeutas, soporte clínico).",
    },
    {
      id: "ops",
      label: "Operativa lista",
      target: 1,
      current: 0,
      unit: "list",
      status: "red",
      note: "Falta: protocolo de crisis, contratos con terapeutas, integración videollamada (Daily.co), facturación split.",
    },
  ],
  // Si decides forzar lanzamiento igual
  ifLaunched: {
    expectedFirstMonth: 8,
    expectedRebook: 60,
    expectedAddCogs: 320,
    note: "Sumar Terapia hoy mueve MRR esperado a -$236/mes hasta cubrir terapeutas piloto.",
  },
  // Lo que el dashboard ya estará listo para mostrar el día 1
  willTrack: [
    "Sesiones agendadas (libro vs onboarding · web vs móvil)",
    "Rebook rate y churn de terapeuta",
    "Recetas (libro/audio/ejercicio sugerido por terapeuta) → completion",
    "Asistencia · no-show · cancelaciones",
    "Tiempo a primera respuesta",
    "Señales éticas (ideación, violencia) — protocolo activo",
  ],
};

// ═════════════════════════════════════════════════════════════
// PODCAST · pre-publicación. Mock para tener el dashboard listo
// el día que publiques el primer episodio.
// ═════════════════════════════════════════════════════════════
window.P_PODCAST = {
  status: "planned",            // planned | live
  plannedLaunch: "Jul 2026",
  hostingCost: 0,               // Spotify for podcasters
  cadenceTarget: "1 episodio / semana",
  rationale: "Trae un canal propio que no depende de algoritmo. Cada episodio es contenido + invitación al libro relacionado. Convierte 9% según la prueba de invitado.",
  // Pilot episodes (planeados — datos sintéticos)
  episodes: [
    {
      n: 1,
      title: "El idioma del cuerpo",
      author: "Dra. Marina Salazar",
      bookLink: "emociones",
      durationMin: 38,
      plannedReleaseAt: "1 jul",
      status: "draft",
      sub: "Conversación con Marina sobre el cap. 1 — qué dice el cuerpo cuando la cabeza no lo nota.",
      // Datos que tendrá el dashboard cuando publique
      mock: { listens: 0, completionPct: 0, signups: 0, proConvPct: 0 },
    },
    {
      n: 2,
      title: "Por qué nos cuesta el domingo",
      author: "Dra. Marina Salazar",
      bookLink: "emociones",
      durationMin: 42,
      plannedReleaseAt: "8 jul",
      status: "outline",
      sub: "Sobre el patrón del 'tengo que' — el capítulo más buscado en el libro.",
      mock: { listens: 0, completionPct: 0, signups: 0, proConvPct: 0 },
    },
    {
      n: 3,
      title: "Familias que se vuelven a hacer",
      author: "Tomás Aguilar",
      bookLink: "familias",
      durationMin: 45,
      plannedReleaseAt: "15 jul",
      status: "outline",
      sub: "Tomás sobre familias ensambladas — qué se rompe y qué se inventa.",
      mock: { listens: 0, completionPct: 0, signups: 0, proConvPct: 0 },
    },
    {
      n: 4,
      title: "Cuando algo se rompe (cap. 5)",
      author: "Dra. Marina Salazar",
      bookLink: "emociones",
      durationMin: 36,
      plannedReleaseAt: "22 jul",
      status: "idea",
      sub: "Aprovechar el capítulo campeón — convertir el 89% de cierre en algo escalable.",
      mock: { listens: 0, completionPct: 0, signups: 0, proConvPct: 0 },
    },
  ],
  willTrack: [
    "Reproducciones (Spotify · Apple · web)",
    "% de finalización por episodio (drop-off curve)",
    "Registros atribuidos al episodio (UTM por feed)",
    "Conversión Pro por episodio (no solo el promedio)",
    "Capítulo del libro abierto tras escuchar",
    "Cuotas de descarga por país (Ecuador, MX, CO, AR, ES)",
  ],
};

// ═════════════════════════════════════════════════════════════
// RECURSOS · contenido adicional dentro de la app
// (artículos, audios cortos, prácticas) — pre-publicación
// ═════════════════════════════════════════════════════════════
window.P_RESOURCES = {
  status: "planned",
  plannedLaunch: "Jun 2026",
  rationale: "Para que abrir la app valga la pena cuando no estás en un libro. Lectura corta, audio corto, una pregunta. Mantiene el hábito vivo entre capítulos.",
  // Tipos de pieza
  formats: [
    { id: "carta",     label: "Carta corta",       desc: "Texto de 2–4 minutos. Una idea, sin moraleja.",          targetPerMonth: 4 },
    { id: "audio",     label: "Audio guiado",      desc: "3–8 min. Voz de un autor + un ejercicio.",               targetPerMonth: 3 },
    { id: "practica",  label: "Práctica diaria",   desc: "30s–2 min. Algo concreto para hoy.",                    targetPerMonth: 8 },
    { id: "pregunta",  label: "Pregunta del día",  desc: "Una sola línea. Aparece en el diario.",                  targetPerMonth: 30 },
  ],
  // Pieza piloto (sintéticas)
  pieces: [
    { id: "r1", format: "carta",    title: "Lo que el silencio sostiene",      author: "Marina S.",  status: "ready",    mins: 3, plannedAt: "5 jun" },
    { id: "r2", format: "audio",    title: "Aterrizar en cinco sentidos",       author: "Marina S.",  status: "ready",    mins: 6, plannedAt: "10 jun" },
    { id: "r3", format: "practica", title: "Tres respiraciones antes del 'sí'", author: "Tomás A.",   status: "draft",    mins: 1, plannedAt: "12 jun" },
    { id: "r4", format: "pregunta", title: "¿Qué dolió esta semana?",           author: "Editorial",  status: "draft",    mins: 1, plannedAt: "15 jun" },
    { id: "r5", format: "carta",    title: "Domingos",                          author: "Marina S.",  status: "outline",  mins: 4, plannedAt: "20 jun" },
    { id: "r6", format: "audio",    title: "Cuando el cuerpo dice no",          author: "Valeria R.", status: "idea",     mins: 7, plannedAt: "—" },
  ],
  willTrack: [
    "Aperturas por pieza (descubrimiento)",
    "% de finalización (especialmente audio)",
    "Reapariciones (¿la gente vuelve a la misma carta?)",
    "Pieza → capítulo del libro abierto después",
    "Pieza → reserva de Terapia (cuando esté live)",
    "Favoritos y compartidos",
  ],
};
