/**
 * Datos de la landing pública: catálogo, oferta y preguntas frecuentes.
 *
 * El encargo aprobado exige que esto viva separado de su presentación —
 * «deja catálogo, precios y FAQ en datos editables» — así que aquí sólo hay
 * datos y ni una decisión de maquetación.
 *
 * ── Procedencia, y las dos adaptaciones ────────────────────────────────────
 *
 * La referencia es `docs/design/web-publica-f2-1/data-f21.js`, de la entrega
 * aprobada el 27-09-2026 con su ajuste 2.1. Se copia tal cual salvo en dos
 * puntos, que se identifican aquí porque el encargo pide identificarlos:
 *
 * 1 · CATÁLOGO. La maqueta lista cuatro títulos («Parejas que perdonan»,
 *     «Familias ensambladas», «Emociones en construcción», «Crianza digital»).
 *     Jorge confirmó después TRES obras: Emociones en construcción y Familias
 *     ensambladas, de Jorge Quizamanchuro, y Parejas que perduran, de David
 *     Jaramillo. Los cuatro nombres de septiembre quedan como historia, no como
 *     catálogo autorizado, así que aquí van las tres confirmadas.
 *
 *     «Parejas que perduran» NO hereda nada de «Parejas que perdonan»: no se ha
 *     demostrado que sean la misma obra, y copiarle la frase, la cubierta o el
 *     identificador sería inventar una equivalencia. Entra con su título y su
 *     autoría confirmados, sin frase temática: derivar de qué trata un libro a
 *     partir de su título es precisamente lo que el encargo prohíbe.
 *
 *     «Crianza digital» no entra: no está entre las obras confirmadas.
 *
 * 2 · AUTORÍA. La maqueta no llevaba autor y el sembrado del producto todavía
 *     dice «Marina Quintana», que es relleno de los primeros sprints. Se usa la
 *     autoría confirmada por Jorge, que es la fuente más reciente.
 *
 * ── Lo que estos importes NO son ───────────────────────────────────────────
 *
 * Son los de la maqueta, hipótesis del documento de negocio, y no están
 * validados: no autorizan cobros, ni acceso vitalicio, ni cuotas de IA, ni
 * participantes. La página los muestra con su aviso y sin ninguna ruta de
 * compra, igual que la referencia. Las condiciones que faltan se dicen con
 * «Por definir» en vez de rellenarse.
 */

import type { NombreIcono } from "./sprite-iconos";

/** Paleta de la cubierta conceptual. No es una portada definitiva. */
export type TonoCubierta = "lav" | "sage" | "deep" | "warm";

export interface FormatoObra {
  /** `leer` abre la lectura; `guia` abre el modo guiado. */
  readonly clave: "leer" | "guia";
  readonly etiqueta: string;
  readonly icono: NombreIcono;
}

/**
 * Disponibilidad real de la obra, dicha como la leería alguien de fuera.
 *
 * No son etiquetas de trabajo interno. «Estado por confirmar» o «ficha de
 * demostración» describen en qué punto está el equipo, no qué puede hacer
 * quien visita, y no tienen sitio en la página pública.
 */
export type Disponibilidad = "probar-aqui" | "aun-no";

export const TEXTO_DISPONIBILIDAD: Record<Disponibilidad, string> = {
  "probar-aqui": "Puedes probarla en esta página",
  "aun-no": "Aún no disponible",
};

export interface Obra {
  readonly id: string;
  readonly titulo: string;
  /** Autoría confirmada. `null` cuando todavía no lo está. */
  readonly autoria: string | null;
  /** Etiqueta de tema. Es una categorización, no una afirmación de contenido. */
  readonly tema: string;
  /**
   * Frase de orientación. `null` cuando no hay una verificada.
   *
   * La tarjeta entonces no dice nada en su lugar: ni una sinopsis inventada ni
   * un aviso de que la ficha llegará. Un hueco en silencio es más honesto que
   * una promesa editorial.
   */
  readonly frase: string | null;
  readonly cubierta: TonoCubierta;
  readonly disponibilidad: Disponibilidad;
  /** Temas que explora. Vacío cuando no hay material aprobado que citar. */
  readonly explora: readonly string[];
  readonly formatos: readonly FormatoObra[];
  readonly tieneGuia: boolean;
  readonly notaGuia?: string;
}

export const OBRAS: readonly Obra[] = [
  {
    id: "emociones-en-construccion",
    titulo: "Emociones en construcción",
    autoria: "Jorge Quizamanchuro",
    tema: "Emociones",
    frase:
      "Descubre cómo se construye lo que sientes y explora nuevas formas de comprenderlo.",
    cubierta: "deep",
    disponibilidad: "probar-aqui",
    explora: [
      "Teorías de la emoción como lentes",
      "El rostro como pista",
      "Emoción, impulso y elección",
    ],
    formatos: [
      { clave: "leer", etiqueta: "Lectura", icono: "book" },
      { clave: "guia", etiqueta: "Modo guiado", icono: "bulb" },
    ],
    tieneGuia: true,
    // La versión anterior decía «El capítulo 1 tiene cinco microguías. Puedes
    // probar una en esta página.» La segunda frase es cierta —la muestra de
    // abajo funciona— y la primera prometía disponibilidad en la aplicación
    // que no existe: las cinco microguías del capítulo 1 están en borrador y
    // el lector las enseña como «No disponible ahora».
    //
    // Se corrige la afirmación, no la estética: el botón, el escenario y la
    // muestra son los mismos. Y se distingue lo que esta página hace de lo
    // que el producto todavía no sirve, que es justo lo que confundía.
    notaGuia:
      "El modo guiado está en preparación: sus microguías del capítulo 1 " +
      "aún no están disponibles en la aplicación. La muestra de esta página " +
      "sí funciona.",
  },
  {
    id: "familias-ensambladas",
    titulo: "Familias ensambladas",
    autoria: "Jorge Quizamanchuro",
    tema: "Familia",
    frase:
      "Comprende los vínculos, acuerdos y retos de una familia que se construye de nuevo.",
    cubierta: "sage",
    disponibilidad: "aun-no",
    explora: [
      "Vínculos nuevos y previos",
      "Acuerdos de convivencia",
      "Retos frecuentes",
    ],
    formatos: [],
    tieneGuia: false,
  },
  {
    id: "parejas-que-perduran",
    titulo: "Parejas que perduran",
    autoria: "David Jaramillo",
    tema: "Pareja",
    frase: null,
    cubierta: "lav",
    disponibilidad: "aun-no",
    explora: [],
    formatos: [],
    tieneGuia: false,
  },
];

/** Fila de la comparación entre los dos alcances. */
export interface FilaComparacion {
  readonly concepto: string;
  readonly unLibro: string;
  readonly catalogo: string;
}

export interface Prestacion {
  readonly texto: string;
  /** `false` se dibuja como exclusión, no como carencia escondida. */
  readonly incluida: boolean;
}

export interface Periodicidad {
  readonly importe: string;
  readonly por: string;
  readonly equivalencia: string;
  readonly cobro: string;
}

export const OFERTA = {
  moneda: "USD",
  pase: {
    importe: "14,99",
    por: "pago único",
    nota: "Importe de ejemplo por título.",
    prestaciones: [
      { texto: "Lectura completa de la obra elegida", incluida: true },
      {
        texto:
          "Su modo guiado y ejercicios publicados, si el libro los incluye",
        incluida: true,
      },
      {
        texto: "El audio, video o podcast publicados de ese título",
        incluida: true,
      },
      { texto: "Tu progreso y tus reflexiones sobre esa obra", incluida: true },
      {
        texto:
          "Eco centrado en ese libro, con una cuota incluida en el paquete",
        incluida: true,
      },
      { texto: "No incluye el resto del catálogo", incluida: false },
    ] as readonly Prestacion[],
  },
  membresia: {
    mensual: {
      importe: "6,99",
      por: "al mes",
      equivalencia: "Sin compromiso anual.",
      cobro: "Se cobra USD 6,99 cada mes.",
    } as Periodicidad,
    anual: {
      importe: "59",
      por: "al año",
      equivalencia: "Equivale a USD 4,92/mes",
      cobro: "Un pago anual de USD 59. No se cobra en cuotas.",
    } as Periodicidad,
    prestaciones: [
      {
        texto:
          "El catálogo digital publicado de la membresía, mientras esté activa",
        incluida: true,
      },
      {
        texto: "Modos guiados, ejercicios y recursos de ese catálogo",
        incluida: true,
      },
      {
        texto: "Eco en tus contenidos, con una cuota que se renueva",
        incluida: true,
      },
      { texto: "Mapa Emocional, historial y Mi Evolución", incluida: true },
      {
        texto: "Dúo y Círculos habilitados para el plan, con sus condiciones",
        incluida: true,
      },
    ] as readonly Prestacion[],
    exclusiones: "No incluye libros físicos, obras sin publicar ni terapia.",
  },
  comparacion: [
    {
      concepto: "Contenido",
      unLibro: "La obra elegida y los recursos de su paquete",
      catalogo: "El catálogo digital publicado de la membresía",
    },
    {
      concepto: "Cómo se paga",
      unLibro: "USD 14,99, pago único por título",
      catalogo: "USD 6,99 al mes o USD 59 al año",
    },
    {
      concepto: "Duración del acceso",
      unLibro: "Por definir",
      catalogo: "Mientras la membresía esté activa",
    },
    {
      concepto: "Eco",
      unLibro: "Cuota del paquete · cantidad por definir",
      catalogo: "Cuota renovable · cantidad por definir",
    },
    {
      concepto: "Mapa, historial y Mi Evolución",
      unLibro: "Progreso y reflexiones de esa obra",
      catalogo: "Incluidos",
    },
    {
      concepto: "Dúo y Círculos",
      unLibro: "No incluidos",
      catalogo: "Modalidades y participantes por definir",
    },
    {
      concepto: "Renovación",
      unLibro: "No corresponde (pago único)",
      catalogo: "Por definir",
    },
    {
      concepto: "Cancelación y cambios",
      unLibro: "Por definir",
      catalogo: "Por definir",
    },
    {
      concepto: "Impuestos y otros cargos",
      unLibro: "Por definir",
      catalogo: "Por definir",
    },
  ] as readonly FilaComparacion[],
} as const;

export interface Pregunta {
  readonly pregunta: string;
  readonly respuesta: string;
}

export const PREGUNTAS: readonly Pregunta[] = [
  {
    pregunta: "¿Qué es FeelVerse?",
    respuesta:
      "Es una plataforma de psicoeducación para aprender sobre emociones y relaciones mediante libros y experiencias guiadas. Puedes leer, explorar recursos, hacer preguntas a Eco y realizar actividades personales o compartidas.",
  },
  {
    pregunta: "¿Qué aporta frente a un libro, un video o un podcast?",
    respuesta:
      "Esos recursos pueden ser muy útiles. FeelVerse los conecta con una forma de trabajar las ideas: seguir una guía, preguntar, practicar y retomar lo aprendido, sin tener que organizar por tu cuenta todo ese recorrido.",
  },
  {
    pregunta: "¿Puedo utilizarlo solamente para leer?",
    respuesta:
      "Sí. Puedes leer a tu ritmo. El modo guiado y las demás herramientas son opciones, no requisitos para disfrutar del libro.",
  },
  {
    pregunta: "¿Qué encuentro en el modo guiado?",
    respuesta:
      "Explicaciones, ejemplos y actividades para explorar las ideas paso a paso. El modo guiado admite además audio, video y podcast, pero todavía no hay ninguno publicado: cada ficha indicará los suyos cuando los tenga.",
  },
  {
    pregunta: "¿Todos los libros incluyen todos los formatos?",
    respuesta:
      "No necesariamente. Cada libro indica los modos y recursos que tiene disponibles. Hoy sólo hay lectura y modo guiado publicados, y únicamente en una obra.",
  },
  {
    pregunta: "¿Para qué sirve Eco?",
    respuesta:
      "Es el asistente de IA de FeelVerse. Puede ayudarte a explorar el contenido, pedir otra explicación o encontrar un ejemplo. Puede equivocarse y no sustituye una evaluación profesional.",
  },
  {
    pregunta: "¿Qué muestra el Mapa Emocional?",
    respuesta:
      "Organiza señales procedentes de los registros que eliges aportar y confirmar. Permite volver a mirarlas con contexto; no es un diagnóstico ni una nota sobre quién eres.",
  },
  {
    pregunta: "¿Qué puede ver otra persona en Dúo o Círculos?",
    respuesta:
      "Participar en una actividad no abre todo tu espacio personal. Cada experiencia distingue la preparación privada de lo que eliges compartir.",
  },
  {
    pregunta: "¿Puedo acceder a un solo libro?",
    respuesta:
      "Esa opción es una propuesta en revisión: todavía no se puede comprar ni contratar nada. Tal como está planteada, se centraría en la obra elegida y en los recursos de su paquete, mientras que la membresía ampliaría el acceso al catálogo y a las herramientas del plan.",
  },
  {
    pregunta: "¿Qué diferencia hay entre un libro y la membresía?",
    respuesta:
      "Son las dos formas de acceso que se proponen, ninguna disponible todavía. El pase se limitaría a un título y sus recursos; la membresía permitiría explorar el catálogo incluido mientras estuviera activa. El uso de Eco y las modalidades compartidas tendrían condiciones específicas.",
  },
  {
    pregunta: "¿Mensual y anual incluyen cosas distintas?",
    respuesta:
      "Son dos formas de pago de la misma membresía; la diferencia aquí es la frecuencia y el importe. El acceso por libro es otra modalidad.",
  },
  {
    pregunta: "¿Qué sucede si dejo la membresía?",
    respuesta:
      "Esta es una propuesta de planes y no admite compras. Antes de abrir suscripciones se publicarán las condiciones de cancelación y qué ocurre con los libros adquiridos por separado, tus notas, tu historial y tu cuota de Eco.",
  },
  {
    pregunta: "¿Puedo cancelar o cambiar mi plan?",
    respuesta:
      "Esta es una propuesta de planes y no admite compras. Las condiciones de cambio y cancelación deben estar disponibles antes de abrir las suscripciones.",
  },
  {
    pregunta: "¿FeelVerse es terapia?",
    respuesta:
      "No. Ofrece psicoeducación y aprendizaje; no realiza diagnósticos ni reemplaza psicoterapia, tratamiento o servicios de emergencia.",
  },
];

/** Las seis dimensiones del Mapa, en el orden del radar del producto. */
export const EJES = [
  "Calma",
  "Claridad",
  "Conexión",
  "Propósito",
  "Compasión",
  "Consciencia",
] as const;

export type Eje = (typeof EJES)[number];

/**
 * Los dos ejemplos del mapa, con datos sintéticos.
 *
 * Respetan el contrato del `MapRadar` real: una dimensión sin señal no recibe
 * un valor inventado, y el área sólo se dibuja con tres o más.
 */
export const EJEMPLOS_MAPA: Readonly<
  Record<"a" | "b", { valores: Partial<Record<Eje, number>>; nota: string }>
> = {
  a: {
    valores: { Calma: 0.55, Claridad: 0.48 },
    nota: "Primeras semanas: solo dos dimensiones tienen señal. Con menos de tres no se dibuja área.",
  },
  b: {
    valores: { Calma: 0.58, Claridad: 0.62, Conexión: 0.44, Consciencia: 0.5 },
    nota: "Con más registros: cuatro dimensiones con señal y dos reuniendo datos. Más señal significa más registros, no más bienestar.",
  },
};
