import type {
  CircleActivityDefinition,
  CircleActivityView,
} from "@psico/types";

/**
 * Fixtures, and only fixtures.
 *
 * The production catalog is empty and stays empty — publishing a template is an
 * editorial act with its own approval, not something a test suite does as a
 * side effect. So these definitions live here, are imported only by tests, and
 * are never registered in `PRODUCTION_CIRCLE_TEMPLATES`.
 */

export const PLANTILLA: CircleActivityDefinition = {
  templateKey: "fixture-duo",
  templateVersion: 1,
  status: "PUBLISHED",
  audience: "DUO_ADULT",
  title: "Una conversación de prueba",
  summary: "Existe para los tests y para nada más.",
  estimatedMinutes: 20,
  source: { bookSlug: "fixture-book", chapterOrder: 1 },
  participants: { min: 2, max: 2, required: 2 },
  privatePreparation: [
    {
      fieldKey: "algo",
      label: "Algo que quieres decir",
      kind: "LONG_TEXT",
      maxLength: 300,
    },
    {
      fieldKey: "otro",
      label: "Algo que te costó",
      kind: "LONG_TEXT",
      maxLength: 300,
    },
  ],
  sharing: {
    allowedModes: ["SELECTED_FIELDS", "EDITED_SUMMARY", "KEEP_PRIVATE"],
  },
  reveal: { strategy: "ALL_CONFIRMED" },
  conversation: { turns: ["Primero uno", "Después el otro"] },
  outcome: { kind: "AGREEMENT" },
  safety: { level: "LOW", privateGateRequired: true, doNotSuggestWhen: [] },
  ecoMode: "NONE",
};

export const BORRADOR: CircleActivityDefinition = {
  ...PLANTILLA,
  templateKey: "fixture-draft",
  status: "DRAFT",
};

export const ARCHIVADA: CircleActivityDefinition = {
  ...PLANTILLA,
  templateKey: "fixture-archived",
  status: "ARCHIVED",
};

/** The activity while both people are still preparing. */
export const PREPARANDO: CircleActivityView = {
  activityId: "act-1",
  status: "PREPARING",
  templateKey: "fixture-duo",
  templateVersion: 1,
  title: "Una conversación de prueba",
  summary: "Existe para los tests y para nada más.",
  conversationTurns: ["Primero uno", "Después el otro"],
  outcomeKind: "AGREEMENT",
  requiredParticipants: 2,
  readyCount: 0,
  revealedAt: null,
  followUpDueAt: null,
  you: {
    status: "ACCEPTED",
    sharingMode: null,
    confirmed: null,
    followUpDecision: null,
  },
  counterpart: { status: "ACCEPTED" },
  revealed: null,
  artifact: null,
};

/** This person has confirmed; the other has not. The waiting state. */
export const ESPERANDO: CircleActivityView = {
  ...PREPARANDO,
  readyCount: 1,
  you: {
    status: "READY",
    sharingMode: "EDITED_SUMMARY",
    confirmed: { mode: "EDITED_SUMMARY", summary: "lo mío" },
    followUpDecision: null,
  },
  counterpart: { status: "ACCEPTED" },
};

/** Both confirmed. The server put the counterpart's words in the payload. */
export const REVELADA: CircleActivityView = {
  ...PREPARANDO,
  status: "REVEALED",
  readyCount: 2,
  revealedAt: "2026-09-11T00:00:00.000Z",
  you: {
    status: "READY",
    sharingMode: "EDITED_SUMMARY",
    confirmed: { mode: "EDITED_SUMMARY", summary: "lo mío" },
    followUpDecision: null,
  },
  counterpart: { status: "READY" },
  revealed: {
    counterpart: { mode: "EDITED_SUMMARY", summary: "lo de la otra persona" },
    participants: [
      {
        label: "Participante 2",
        share: { mode: "EDITED_SUMMARY", summary: "lo de la otra persona" },
      },
    ],
  },
  artifact: null,
};

export const CERRADA: CircleActivityView = {
  ...REVELADA,
  status: "CLOSED",
};

/**
 * The same reveal, but with the mode that carries several answers.
 *
 * `REVELADA` uses `EDITED_SUMMARY` — one passage, no questions around it — so
 * nothing that reads it ever exercised the branch where each answer needs the
 * question it was written under. That is the branch that was printing
 * `fieldKey` at people (#723), and this is the fixture that reaches it.
 *
 * The keys are the ones `PLANTILLA` declares, because the API refuses a
 * confirmation carrying any key the pinned template does not.
 */
export const REVELADA_POR_CAMPOS: CircleActivityView = {
  ...REVELADA,
  you: {
    status: "READY",
    sharingMode: "SELECTED_FIELDS",
    confirmed: {
      mode: "SELECTED_FIELDS",
      fields: [{ fieldKey: "algo", value: "lo mío del primer campo" }],
    },
    followUpDecision: null,
  },
  revealed: {
    participants: [
      {
        label: "Participante 2",
        share: {
          mode: "SELECTED_FIELDS",
          fields: [
            { fieldKey: "algo", value: "lo suyo del primer campo" },
            { fieldKey: "otro", value: "lo suyo del segundo campo" },
          ],
        },
      },
    ],
  },
};

/**
 * Walk the private preparation the way a person does: one question, then the
 * next, then the sharing decision.
 *
 * Lives here rather than in each spec because the shape of the walk is a
 * property of the screen, and four copies of it would each have to be found
 * and fixed the next time a step is added. `answers` is positional: the first
 * string goes in the first question. A missing one leaves that question blank,
 * which is a legitimate way to arrive at the sharing step.
 */
export async function irACompartir(
  user: {
    click(el: Element): Promise<void>;
    type(el: Element, text: string): Promise<void>;
  },
  screen: {
    getByRole(role: string, options?: { name?: RegExp }): HTMLElement;
  },
  answers: readonly string[] = [],
  steps: number = PLANTILLA.privatePreparation.length,
): Promise<void> {
  for (let i = 0; i < steps; i++) {
    const text = answers[i];
    if (text) await user.type(screen.getByRole("textbox"), text);
    await user.click(screen.getByRole("button", { name: /^Continuar$/ }));
  }
}
