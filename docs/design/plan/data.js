// plan/data.js — Pricing, features, FAQ, billing history.

window.PSICO_PLANS = [
  {
    id: "FREE",
    name: "Gratuito",
    tagline: "Para conocerte.",
    description: "El primer paso. Sin tarjeta de crédito.",
    monthlyUsd: 0,
    yearlyUsd: 0,
    priceLabel: "Gratis",
    priceSub: "Para siempre",
    cta: "Plan actual",
    features: [
      "El primer capítulo de cada libro",
      "Ejercicios prácticos básicos",
      "Mood diario (4 estados)",
      "Sincroniza tu progreso en web y móvil",
    ],
    limits: [
      "Sin acceso a audios profesionales",
      "Sin Eco dentro del libro",
    ],
    tone: "soft",
  },
  {
    id: "PRO",
    name: "Pro",
    tagline: "Para acompañarte.",
    description: "Acceso completo. El plan más elegido.",
    monthlyUsd: 7,
    yearlyUsd: null,
    priceLabel: "$7",
    priceSub: "USD / mes",
    cta: "Empezar Pro",
    features: [
      "Toda la biblioteca — 8 libros y subiendo",
      "Audios profesionales narrados por la autora",
      "Ejercicios prácticos y quizzes",
      "Eco — preguntas dentro del capítulo",
      "Historial completo de progreso",
      "Sin publicidad",
    ],
    badge: "Más elegido",
    tone: "feature",
  },
  {
    id: "ANNUAL",
    name: "Anual",
    tagline: "Para crecer sostenido.",
    description: "Todo lo de Pro · ahorras $25 al año.",
    monthlyUsd: null,
    yearlyUsd: 59,
    priceLabel: "$59",
    priceSub: "USD / año · equiv. $4.92/mes",
    cta: "Empezar Anual",
    features: [
      "Todo lo incluido en Pro",
      "Ahorra 30% vs. mensual",
      "Acceso anticipado a libros nuevos",
      "Soporte prioritario",
      "Descarga de capítulos para offline",
    ],
    badge: "Mejor valor",
    tone: "best",
  },
];

// Comparativa — usado en la tabla
window.PSICO_COMPARE = [
  { row: "Acceso a libros",            free: "1 libro intro",           pro: "Biblioteca completa",     annual: "Biblioteca completa" },
  { row: "Capítulos por libro",        free: "Solo capítulo 1",         pro: "Todos los capítulos",     annual: "Todos los capítulos" },
  { row: "Audios profesionales",       free: false,                     pro: true,                      annual: true },
  { row: "Ejercicios y quizzes",       free: "Básicos",                 pro: "Completos",               annual: "Completos" },
  { row: "Eco — preguntas",            free: false,                     pro: true,                      annual: true },
  { row: "Modo offline",               free: false,                     pro: false,                     annual: true },
  { row: "Acceso anticipado",          free: false,                     pro: false,                     annual: true },
  { row: "Soporte",                    free: "Comunidad",               pro: "Estándar (48 h)",         annual: "Prioritario (24 h)" },
  { row: "Cancelación",                free: "—",                       pro: "Cuando quieras",          annual: "Cuando quieras" },
];

// FAQs
window.PSICO_FAQ = [
  {
    q: "¿Puedo cancelar cuando quiera?",
    a: "Sí — sin penalidad. Tu acceso sigue activo hasta el final del período pagado.",
  },
  {
    q: "¿Cómo cambio de mensual a anual?",
    a: "Desde esta misma pantalla, en Gestionar suscripción. Acreditamos lo que ya pagaste.",
  },
  {
    q: "¿Hay descuento para estudiantes o profesionales?",
    a: "Sí. Si eres psicólogo/a o estudiante de psicología, escríbenos a hola@psico.app y te damos un 40% off.",
  },
  {
    q: "¿Mi progreso se mantiene si cancelo?",
    a: "Siempre. Tu cuenta y notas no se borran — al volver, retomas donde quedaste.",
  },
  {
    q: "¿Puedo regalar Pro a alguien?",
    a: "Estamos trabajando en regalos. Avísanos por correo y te avisamos primero.",
  },
];

// Métricas de confianza
window.PSICO_TRUST = {
  readers: "12.4k",
  rating: 4.8,
  reviewsCount: 1284,
  countries: 14,
};

// ── Estado de suscripción activa ──
window.PSICO_SUBSCRIPTION = {
  PRO_MONTHLY: {
    plan: "PRO",
    cycle: "mensual",
    priceLabel: "$7 USD / mes",
    nextRenewal: "15 de junio, 2026",
    nextAmount: "$7.00 USD",
    startedAt: "15 de noviembre, 2025",
    paymentMethod: { brand: "Visa", last4: "4242", expiry: "08/27" },
    canCancel: true,
    cancelAtPeriodEnd: false,
  },
  PRO_YEARLY: {
    plan: "ANNUAL",
    cycle: "anual",
    priceLabel: "$59 USD / año",
    nextRenewal: "15 de noviembre, 2026",
    nextAmount: "$59.00 USD",
    startedAt: "15 de noviembre, 2025",
    paymentMethod: { brand: "Visa", last4: "4242", expiry: "08/27" },
    canCancel: true,
    cancelAtPeriodEnd: false,
  },
  PRO_CANCELLING: {
    plan: "PRO",
    cycle: "mensual",
    priceLabel: "$7 USD / mes",
    nextRenewal: "15 de junio, 2026",
    nextAmount: "—",
    startedAt: "15 de noviembre, 2025",
    paymentMethod: { brand: "Visa", last4: "4242", expiry: "08/27" },
    canCancel: false,
    cancelAtPeriodEnd: true,
  },
};

// Historial de pagos
window.PSICO_INVOICES = [
  { id: "in_2024_05", date: "15 may 2026", amount: "$7.00", status: "Pagada",   method: "Visa •••• 4242" },
  { id: "in_2024_04", date: "15 abr 2026", amount: "$7.00", status: "Pagada",   method: "Visa •••• 4242" },
  { id: "in_2024_03", date: "15 mar 2026", amount: "$7.00", status: "Pagada",   method: "Visa •••• 4242" },
  { id: "in_2024_02", date: "15 feb 2026", amount: "$7.00", status: "Pagada",   method: "Visa •••• 4242" },
  { id: "in_2024_01", date: "15 ene 2026", amount: "$7.00", status: "Pagada",   method: "Visa •••• 4242" },
];

// Testimonios para la sección de confianza (FREE state)
window.PSICO_TESTIMONIALS = [
  { initials: "PE", name: "Paola E.", country: "Ecuador", quote: "Pasé seis meses pensando en ir a terapia. Mientras decidía, este libro me sostuvo. No reemplaza terapia — pero te enseña a escucharte mientras esperas." },
  { initials: "DR", name: "Diego R.", country: "Colombia", quote: "El precio es ridículo para lo que entregan. Cancelé Netflix antes que esto." },
];
