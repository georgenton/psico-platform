/**
 * Lo que una persona lee cuando algo falla en Eco o en Voz.
 *
 * EL FALLO QUE ESTO IMPIDE (#741). Las cuatro pantallas —Eco y Voz, web y
 * móvil— preferían el `message` que venía del servidor sobre su propio texto.
 * Ese campo es diagnóstico, no copy: en QA la pantalla de Voz llegó a mostrar
 * `WHISPER_HTTP_401` en rojo, que además nombra al proveedor y su código de
 * estado. El texto humano ya estaba escrito en las cuatro; sólo se usaba cuando
 * el servidor no mandaba nada, que es justo al revés.
 *
 * LA REGLA. Un mensaje técnico NO es texto de pantalla por defecto. Sólo entra
 * a la interfaz el copy que está escrito aquí. Un código que no conozcamos cae
 * al genérico; no hay forma de que un código nuevo del backend se cuele como
 * texto, que es lo que pasaría con un filtro por regex del estilo «si contiene
 * HTTP, ocúltalo».
 *
 * El diagnóstico no se pierde: sigue en los logs del servidor y en la consola
 * del navegador, que es donde sirve. Lo que cambia es sólo la presentación.
 *
 * El molde viene de `guide-errors.ts`, que ya resolvió esto mismo para el
 * reproductor de guías: un conjunto cerrado de frases, elegidas por estado y
 * código, y el `message` leído como código y descartado en cualquier caso.
 */

/** Qué puede hacer la persona a continuación. La UI decide cómo mostrarlo. */
export type ErrorCopyKind =
  /** Reintentar tal cual tiene sentido. */
  | "retryable"
  /** No se arregla reintentando: falta plan, cuota o permiso. */
  | "blocked"
  /** La sesión del navegador caducó. */
  | "unauthenticated"
  /** Lo que se pedía ya no existe. */
  | "gone";

export interface ErrorCopy {
  readonly kind: ErrorCopyKind;
  readonly message: string;
}

/** Lo que se dice cuando no sabemos más. Nunca menciona proveedor ni código. */
const ECO_GENERICO: ErrorCopy = {
  kind: "retryable",
  message: "No pudimos enviar tu mensaje. Inténtalo de nuevo.",
};

const ECO_POR_ESTADO: Record<number, ErrorCopy> = {
  401: {
    kind: "unauthenticated",
    message: "Tu sesión caducó. Recarga la página para continuar.",
  },
  402: {
    kind: "blocked",
    message:
      "Llegaste al límite de mensajes con Eco por ahora. Se renueva al empezar tu próximo ciclo.",
  },
  403: {
    kind: "blocked",
    message: "Eco no está disponible con tu plan actual.",
  },
  404: {
    kind: "gone",
    message: "No encontramos esta conversación. Empieza una nueva.",
  },
  429: {
    kind: "retryable",
    message: "Vas muy rápido para Eco. Espera unos segundos e inténtalo.",
  },
};

/**
 * La frase para un fallo al enviar un mensaje a Eco.
 *
 * `status` es el HTTP que devolvió la petición, o `null` cuando ni siquiera
 * llegó a haber respuesta (red caída, petición abortada). `code` se acepta para
 * poder afinar en el futuro sin cambiar las llamadas; hoy el estado basta.
 */
export function ecoErrorCopy(
  status: number | null,
  _code?: string | null,
): ErrorCopy {
  if (status === null) return ECO_GENERICO;
  return ECO_POR_ESTADO[status] ?? ECO_GENERICO;
}

/** Lo que se dice de Voz cuando no sabemos más. */
const VOZ_GENERICO: ErrorCopy = {
  kind: "retryable",
  message: "No pudimos transcribir el audio. Inténtalo de nuevo.",
};

const VOZ_POR_ESTADO: Record<number, ErrorCopy> = {
  400: {
    kind: "retryable",
    message: "No recibimos audio. Graba de nuevo e inténtalo.",
  },
  401: {
    kind: "unauthenticated",
    message: "Tu sesión caducó. Vuelve a iniciar sesión.",
  },
  402: {
    kind: "blocked",
    message:
      "Ya usaste tus minutos de voz para este período. Se renuevan al empezar tu próximo ciclo.",
  },
  403: {
    kind: "blocked",
    message: "Voz es una función Pro. Mejora tu plan para usarla.",
  },
  413: {
    kind: "blocked",
    message: "El audio es demasiado largo. Graba menos de 20 minutos.",
  },
  415: {
    kind: "blocked",
    message: "Tu navegador grabó en un formato que no soportamos.",
  },
  429: {
    kind: "retryable",
    message: "Demasiadas transcripciones seguidas. Espera un momento.",
  },
};

/**
 * La frase para un fallo al transcribir.
 *
 * El 502 de un proveedor caído —el `WHISPER_HTTP_401` del informe— no está en
 * la tabla a propósito: cae al genérico. Que el proveedor esté mal configurado
 * es asunto nuestro, y quien graba un audio no tiene nada que hacer con ese
 * dato salvo alarmarse.
 */
export function vozErrorCopy(
  status: number | null,
  _code?: string | null,
): ErrorCopy {
  if (status === null) return VOZ_GENERICO;
  return VOZ_POR_ESTADO[status] ?? VOZ_GENERICO;
}
