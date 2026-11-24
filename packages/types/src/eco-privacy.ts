/**
 * Lo que pasa con lo que se le escribe a Eco, dicho UNA vez.
 *
 * ── Por qué existe este fichero ───────────────────────────────────────────
 *
 * Registro, acceso, Seguridad, la reja de Eco y el componente común de
 * privacidad decían de Eco lo mismo que del diario: «solo tú puedes verlos,
 * ni siquiera nuestro equipo». Es falso, y lo contaba bien una sola pantalla,
 * el tour. El cifrado de Eco es híbrido (ADR 0007 §C y §D):
 *
 *   - el mensaje de la persona viaja EN CLARO al servidor, que lo usa para
 *     detectar señales de crisis, buscar contexto en los libros y pedir la
 *     respuesta a servicios de inteligencia artificial;
 *   - ese mensaje se GUARDA cifrado;
 *   - la respuesta de Eco y los mensajes de crisis se guardan SIN cifrar
 *     (`EcoMessage.assistantText`).
 *
 * Con una frase por pantalla, cada una puede derivar por su cuenta hasta volver
 * a prometer de Eco lo que sólo es cierto del diario. Compartida, no. El
 * trinquete que lo vigila es `apps/web/src/copy-privacidad.test.ts`.
 */

/** La frase completa. Es, palabra por palabra, la que ya decía el tour. */
export const ECO_PRIVACY_NOTE =
  "Para responderte, Eco procesa lo que escribes mediante servicios de " +
  "inteligencia artificial. Tu mensaje se guarda cifrado; su respuesta, no.";

/** El matiz que sólo cabe donde hay sitio para el detalle. */
export const ECO_PRIVACY_CRISIS_NOTE =
  "Si aparece un mensaje de ayuda en crisis, se guarda como sus respuestas: " +
  "sin cifrar.";
