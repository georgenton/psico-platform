import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GuideSessionView } from "@psico/types";
import { GuidePlayer } from "./GuidePlayer";
import { GUIDE_STORAGE_KEY, type GuideRecoveryRecord } from "./guide-recovery";
import type * as ApiClientModule from "@psico/api-client";

/**
 * CC-7.5 — the player's contract with the server.
 *
 * Everything here is about who decides: the SERVER says which step is
 * current and how many are done; the browser only renders that and posts
 * commands whose keys it persisted first. So these tests assert what was
 * sent, and that nothing on screen reveals a verdict the response never had.
 */

const {
  createGuideSession,
  completeGuideSessionStep,
  submitGuideStepRecall,
  cancelGuideSession,
  completeGuideSession,
} = vi.hoisted(() => ({
  createGuideSession: vi.fn(),
  completeGuideSessionStep: vi.fn(),
  submitGuideStepRecall: vi.fn(),
  cancelGuideSession: vi.fn(),
  completeGuideSession: vi.fn(),
}));

vi.mock("@psico/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return {
    ...actual,
    guideApi: {
      createGuideSession,
      completeGuideSessionStep,
      submitGuideStepRecall,
      cancelGuideSession,
      completeGuideSession,
    },
  };
});

const SESSION_ID = "cmb0guidesession01";
const START_KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function session(over: Partial<GuideSessionView> = {}): GuideSessionView {
  return {
    sessionId: SESSION_ID,
    guideKey: "eec-c1-cuerpo-antes-que-mente",
    guideVersion: 1,
    status: "ACTIVE",
    stepsCompleted: 0,
    totalSteps: 3,
    currentStepKey: "explorar-cuerpo-antes-que-mente",
    ...over,
  };
}

const ok = (over: Partial<GuideSessionView> = {}) => ({
  created: true,
  replayed: false,
  session: session(over),
});

const replayed = (over: Partial<GuideSessionView> = {}) => ({
  created: false,
  replayed: true,
  session: session(over),
});

/** An ApiError as the real client throws it: the message IS the code. */
async function apiError(statusCode: number, code: string) {
  const { ApiError } = await import("@psico/api-client");
  return new ApiError(statusCode, code);
}

function storeRecord(record: Partial<GuideRecoveryRecord> = {}) {
  window.localStorage.setItem(
    GUIDE_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      guideKey: "eec-c1-cuerpo-antes-que-mente",
      guideVersion: 1,
      startIdempotencyKey: START_KEY,
      ...record,
    }),
  );
}

function readRecord(): GuideRecoveryRecord | null {
  const raw = window.localStorage.getItem(GUIDE_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as GuideRecoveryRecord) : null;
}

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("GuidePlayer · explicit start", () => {
  it("shows the cover and sends NOTHING before a click", async () => {
    render(<GuidePlayer />);
    expect(
      await screen.findByRole("button", { name: "Empezar guía" }),
    ).toBeInTheDocument();
    expect(createGuideSession).not.toHaveBeenCalled();
  });

  it("starts only on click, with a fresh UUID and the pinned version", async () => {
    createGuideSession.mockResolvedValue(ok());
    const user = userEvent.setup();
    render(<GuidePlayer />);

    await user.click(
      await screen.findByRole("button", { name: "Empezar guía" }),
    );

    await waitFor(() => expect(createGuideSession).toHaveBeenCalledTimes(1));
    const body = createGuideSession.mock.calls[0]![0]!;
    expect(body.guideKey).toBe("eec-c1-cuerpo-antes-que-mente");
    expect(body.guideVersion).toBe(1);
    expect(body.idempotencyKey).toMatch(UUID_RE);
    // Nothing else travels — no userId, no context.
    expect(Object.keys(body).sort()).toEqual([
      "guideKey",
      "guideVersion",
      "idempotencyKey",
    ]);
    // The key was persisted so a reload replays this exact START.
    expect(readRecord()?.startIdempotencyKey).toBe(body.idempotencyKey);
  });

  it("does not open a second session on a double click", async () => {
    let resolve!: (v: unknown) => void;
    createGuideSession.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const user = userEvent.setup();
    render(<GuidePlayer />);

    const cta = await screen.findByRole("button", { name: "Empezar guía" });
    await user.click(cta);
    expect(cta).toBeDisabled();
    await user.click(cta);
    expect(createGuideSession).toHaveBeenCalledTimes(1);

    resolve(ok());
    await screen.findByRole("heading", {
      name: "El cuerpo sabe antes que la mente",
      level: 2,
    });
  });
});

describe("GuidePlayer · the server decides the step", () => {
  it("renders the step the server names, not the first one", async () => {
    storeRecord();
    createGuideSession.mockResolvedValue(
      replayed({
        stepsCompleted: 2,
        currentStepKey: "recordar-cuerpo-antes-que-mente",
      }),
    );
    render(<GuidePlayer />);

    expect(
      await screen.findByRole("heading", {
        name: "Recordar lo leído",
        level: 2,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 de 3 pasos registrados")).toBeInTheDocument();
  });

  it("shows progress from the received numbers only", async () => {
    storeRecord();
    createGuideSession.mockResolvedValue(
      replayed({
        stepsCompleted: 1,
        totalSteps: 3,
        currentStepKey: "practicar-escucharte-por-dentro",
      }),
    );
    render(<GuidePlayer />);

    const bar = await screen.findByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    expect(bar).toHaveAttribute("aria-valuemax", "3");
    expect(screen.getByText("1 de 3 pasos registrados")).toBeInTheDocument();
  });

  it("fails closed on a step this build does not know", async () => {
    storeRecord();
    createGuideSession.mockResolvedValue(
      replayed({ currentStepKey: "paso-del-futuro" }),
    );
    render(<GuidePlayer />);

    expect(
      await screen.findByText("No pudimos mostrar el paso actual."),
    ).toBeInTheDocument();
    // Fail-closed means no command leaves from here.
    expect(completeGuideSessionStep).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /explorado|práctica/i }),
    ).toBeNull();
  });
});

describe("GuidePlayer · commands", () => {
  it("the concept step calls completeGuideSessionStep with its exact key", async () => {
    storeRecord();
    createGuideSession.mockResolvedValue(replayed());
    completeGuideSessionStep.mockResolvedValue(
      ok({
        stepsCompleted: 1,
        currentStepKey: "practicar-escucharte-por-dentro",
      }),
    );
    const user = userEvent.setup();
    render(<GuidePlayer />);

    await user.click(
      await screen.findByRole("button", { name: "He explorado esta idea" }),
    );

    await waitFor(() => expect(completeGuideSessionStep).toHaveBeenCalled());
    const [sessionId, stepKey, body] = completeGuideSessionStep.mock.calls[0]!;
    expect(sessionId).toBe(SESSION_ID);
    expect(stepKey).toBe("explorar-cuerpo-antes-que-mente");
    expect(Object.keys(body as object)).toEqual(["idempotencyKey"]);
  });

  it("the practice step calls the same command with its own key", async () => {
    storeRecord();
    createGuideSession.mockResolvedValue(
      replayed({
        stepsCompleted: 1,
        currentStepKey: "practicar-escucharte-por-dentro",
      }),
    );
    completeGuideSessionStep.mockResolvedValue(
      ok({
        stepsCompleted: 2,
        currentStepKey: "recordar-cuerpo-antes-que-mente",
      }),
    );
    const user = userEvent.setup();
    render(<GuidePlayer />);

    await user.click(
      await screen.findByRole("button", { name: "Ya hice esta práctica" }),
    );

    await waitFor(() => expect(completeGuideSessionStep).toHaveBeenCalled());
    expect(completeGuideSessionStep.mock.calls[0]![1]).toBe(
      "practicar-escucharte-por-dentro",
    );
  });

  it("recall sends ONLY the chosen option, and never shows a verdict", async () => {
    storeRecord();
    createGuideSession.mockResolvedValue(
      replayed({
        stepsCompleted: 2,
        currentStepKey: "recordar-cuerpo-antes-que-mente",
      }),
    );
    submitGuideStepRecall.mockResolvedValue(
      ok({ stepsCompleted: 3, currentStepKey: null }),
    );
    const user = userEvent.setup();
    render(<GuidePlayer />);

    const group = await screen.findByRole("radiogroup");
    expect(group).toBeInTheDocument();
    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(3);

    // The action is blocked until an option is chosen.
    const submit = screen.getByRole("button", { name: "Registrar respuesta" });
    expect(submit).toBeDisabled();

    await user.click(options[1]!);
    await user.click(submit);

    await waitFor(() => expect(submitGuideStepRecall).toHaveBeenCalled());
    const [sessionId, stepKey, body] = submitGuideStepRecall.mock.calls[0]!;
    expect(sessionId).toBe(SESSION_ID);
    expect(stepKey).toBe("recordar-cuerpo-antes-que-mente");
    expect(Object.keys(body as object).sort()).toEqual([
      "idempotencyKey",
      "selectedOptionKey",
    ]);
    expect((body as { selectedOptionKey: string }).selectedOptionKey).toBe(
      "opcion-mente-primero",
    );

    // Nothing about correctness anywhere on the resulting screen.
    for (const word of [
      "Correcto",
      "Incorrecto",
      "Puntuación",
      "Respuesta correcta",
    ]) {
      expect(screen.queryByText(new RegExp(word, "i"))).toBeNull();
    }
  });

  it("offers finish only when the server says every step is in", async () => {
    storeRecord();
    createGuideSession.mockResolvedValue(
      replayed({ stepsCompleted: 3, currentStepKey: null }),
    );
    completeGuideSession.mockResolvedValue(
      ok({ status: "COMPLETED", stepsCompleted: 3, currentStepKey: null }),
    );
    const user = userEvent.setup();
    render(<GuidePlayer />);

    const finish = await screen.findByRole("button", {
      name: "Finalizar guía",
    });
    await user.click(finish);

    await waitFor(() => expect(completeGuideSession).toHaveBeenCalledTimes(1));
    expect(completeGuideSession.mock.calls[0]![0]).toBe(SESSION_ID);
    expect(
      await screen.findByRole("heading", { name: "Guía completada", level: 2 }),
    ).toBeInTheDocument();
  });

  it("cancel asks for confirmation and closes the session", async () => {
    storeRecord();
    createGuideSession.mockResolvedValue(replayed());
    cancelGuideSession.mockResolvedValue(
      ok({ status: "CANCELLED", currentStepKey: null }),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<GuidePlayer />);

    await user.click(
      await screen.findByRole("button", { name: "Salir de la guía" }),
    );

    await waitFor(() => expect(cancelGuideSession).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole("heading", { name: "Guía cerrada", level: 2 }),
    ).toBeInTheDocument();
    // Closing is not framed as a failure.
    expect(screen.queryByText(/abandonaste|fracas/i)).toBeNull();
    confirm.mockRestore();
  });

  it("does not cancel when the confirmation is declined", async () => {
    storeRecord();
    createGuideSession.mockResolvedValue(replayed());
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<GuidePlayer />);

    await user.click(
      await screen.findByRole("button", { name: "Salir de la guía" }),
    );
    expect(cancelGuideSession).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});

describe("GuidePlayer · recovery and ambiguous writes", () => {
  it("replays the STORED start key on mount instead of creating a session", async () => {
    storeRecord();
    createGuideSession.mockResolvedValue(replayed({ stepsCompleted: 1 }));
    render(<GuidePlayer />);

    await waitFor(() => expect(createGuideSession).toHaveBeenCalledTimes(1));
    expect(createGuideSession.mock.calls[0]![0]!.idempotencyKey).toBe(
      START_KEY,
    );
  });

  it("clears storage and offers a fresh start when the session is gone", async () => {
    storeRecord();
    createGuideSession.mockRejectedValue(
      await apiError(404, "GUIDE_SESSION_NOT_FOUND"),
    );
    render(<GuidePlayer />);

    expect(
      await screen.findByText("No pudimos recuperar esta sesión."),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem(GUIDE_STORAGE_KEY)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Empezar guía" }),
    ).toBeInTheDocument();
  });

  it("keeps the pending command and its key when the network fails", async () => {
    storeRecord();
    createGuideSession.mockResolvedValue(replayed());
    completeGuideSessionStep.mockRejectedValue(new TypeError("network"));
    const user = userEvent.setup();
    render(<GuidePlayer />);

    await user.click(
      await screen.findByRole("button", { name: "He explorado esta idea" }),
    );

    expect(
      await screen.findByText(
        "No pudimos guardar este paso. Puedes reintentarlo sin perder tu avance.",
      ),
    ).toBeInTheDocument();

    const stored = readRecord();
    expect(stored?.pendingCommand?.commandType).toBe("STEP_COMPLETE");
    const firstKey = completeGuideSessionStep.mock.calls[0]![2]!.idempotencyKey;
    expect(stored?.pendingCommand?.idempotencyKey).toBe(firstKey);
  });

  it("retries the SAME key — never a second attempt", async () => {
    storeRecord();
    createGuideSession.mockResolvedValue(replayed());
    completeGuideSessionStep.mockRejectedValueOnce(new TypeError("network"));
    completeGuideSessionStep.mockResolvedValueOnce(
      ok({
        stepsCompleted: 1,
        currentStepKey: "practicar-escucharte-por-dentro",
      }),
    );
    const user = userEvent.setup();
    render(<GuidePlayer />);

    await user.click(
      await screen.findByRole("button", { name: "He explorado esta idea" }),
    );
    await user.click(await screen.findByRole("button", { name: "Reintentar" }));

    await waitFor(() =>
      expect(completeGuideSessionStep).toHaveBeenCalledTimes(2),
    );
    const first = completeGuideSessionStep.mock.calls[0]![2]!.idempotencyKey;
    const second = completeGuideSessionStep.mock.calls[1]![2]!.idempotencyKey;
    expect(second).toBe(first);
    // Settled ⇒ no pending command left behind.
    expect(readRecord()?.pendingCommand).toBeUndefined();
  });

  it("retries a stored pending command on mount, after the START replay", async () => {
    storeRecord({
      sessionId: SESSION_ID,
      pendingCommand: {
        commandType: "STEP_RECALL",
        idempotencyKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        sessionId: SESSION_ID,
        stepKey: "recordar-cuerpo-antes-que-mente",
        selectedOptionKey: "opcion-cuerpo-primero",
      },
    });
    createGuideSession.mockResolvedValue(
      replayed({
        stepsCompleted: 2,
        currentStepKey: "recordar-cuerpo-antes-que-mente",
      }),
    );
    submitGuideStepRecall.mockResolvedValue(
      // `replayed` is success too: the original attempt had applied.
      {
        created: false,
        replayed: true,
        session: session({ stepsCompleted: 3, currentStepKey: null }),
      },
    );
    render(<GuidePlayer />);

    await waitFor(() => expect(submitGuideStepRecall).toHaveBeenCalledTimes(1));
    const [, , body] = submitGuideStepRecall.mock.calls[0]!;
    expect((body as { idempotencyKey: string }).idempotencyKey).toBe(
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );
    expect((body as { selectedOptionKey: string }).selectedOptionKey).toBe(
      "opcion-cuerpo-primero",
    );
    expect(
      await screen.findByRole("button", { name: "Finalizar guía" }),
    ).toBeInTheDocument();
    expect(readRecord()?.pendingCommand).toBeUndefined();
  });

  it("resyncs with the START replay on a 409 instead of guessing", async () => {
    storeRecord();
    createGuideSession.mockResolvedValueOnce(replayed()).mockResolvedValueOnce(
      replayed({
        stepsCompleted: 1,
        currentStepKey: "practicar-escucharte-por-dentro",
      }),
    );
    completeGuideSessionStep.mockRejectedValue(
      await apiError(409, "GUIDE_STEP_NOT_CURRENT"),
    );
    const user = userEvent.setup();
    render(<GuidePlayer />);

    await user.click(
      await screen.findByRole("button", { name: "He explorado esta idea" }),
    );

    // Two STARTs: the mount replay and the resync — both with the same key.
    await waitFor(() => expect(createGuideSession).toHaveBeenCalledTimes(2));
    expect(createGuideSession.mock.calls[1]![0]!.idempotencyKey).toBe(
      START_KEY,
    );
    // No second, different command was invented.
    expect(completeGuideSessionStep).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("button", { name: "Ya hice esta práctica" }),
    ).toBeInTheDocument();
  });
});

describe("GuidePlayer · terminal states and privacy", () => {
  it("repeat clears the recovery and waits for an explicit click", async () => {
    storeRecord();
    createGuideSession.mockResolvedValue(
      replayed({
        status: "COMPLETED",
        stepsCompleted: 3,
        currentStepKey: null,
      }),
    );
    const user = userEvent.setup();
    render(<GuidePlayer />);

    await user.click(
      await screen.findByRole("button", { name: "Repetir guía" }),
    );

    expect(window.localStorage.getItem(GUIDE_STORAGE_KEY)).toBeNull();
    expect(
      await screen.findByRole("button", { name: "Empezar guía" }),
    ).toBeInTheDocument();
    // The click on "Repetir" is not itself a START.
    expect(createGuideSession).toHaveBeenCalledTimes(1);
  });

  it("maps a 401 to the session-expired copy, never the raw error", async () => {
    storeRecord();
    createGuideSession.mockRejectedValue(await apiError(401, "Unauthorized"));
    render(<GuidePlayer />);

    expect(
      await screen.findByText(
        "Tu sesión caducó. Recarga la página para continuar.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Unauthorized/)).toBeNull();
  });

  it("maps a forbidden guide without leaking the code", async () => {
    storeRecord();
    createGuideSession.mockRejectedValue(
      await apiError(403, "GUIDE_FORBIDDEN"),
    );
    render(<GuidePlayer />);

    expect(
      await screen.findByText(
        "Esta guía no está disponible con tu acceso actual.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/GUIDE_FORBIDDEN/)).toBeNull();
  });

  it("never prints a session id or a step key on screen", async () => {
    storeRecord();
    createGuideSession.mockResolvedValue(
      replayed({
        stepsCompleted: 2,
        currentStepKey: "recordar-cuerpo-antes-que-mente",
      }),
    );
    const { container } = render(<GuidePlayer />);
    await screen.findByRole("radiogroup");

    const visible = container.textContent ?? "";
    expect(visible).not.toContain(SESSION_ID);
    expect(visible).not.toContain("recordar-cuerpo-antes-que-mente");
    expect(visible).not.toContain(START_KEY);
  });

  it("always states what the guide does and does not record", async () => {
    render(<GuidePlayer />);
    expect(
      await screen.findByText(
        "Esta guía registra avance educativo. No interpreta cómo te sientes ni modifica automáticamente tu Mapa Emocional.",
      ),
    ).toBeInTheDocument();
  });
});

/**
 * CC-7.5 fix round — recovery must fail CLOSED.
 *
 * These pin the four ways the previous version could strand a run: a
 * StrictMode remount, an ambiguous START, a storage write nobody checked, and
 * a pending command aimed at another session. Plus the contradictory-server
 * snapshot, which must never be completed on the client's initiative.
 */
describe("GuidePlayer · StrictMode", () => {
  it("recovers under a double mount, always with the SAME start key", async () => {
    storeRecord();
    createGuideSession.mockResolvedValue(
      replayed({
        stepsCompleted: 1,
        currentStepKey: "practicar-escucharte-por-dentro",
      }),
    );

    render(
      <React.StrictMode>
        <GuidePlayer />
      </React.StrictMode>,
    );

    // GUIDE_STRICT_MODE_STUCK_BOOTING=false — the screen must arrive.
    expect(
      await screen.findByRole("button", { name: "Ya hice esta práctica" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Recuperando tu avance…")).toBeNull();

    // More than one call is fine; a second START KEY would not be.
    expect(createGuideSession.mock.calls.length).toBeGreaterThanOrEqual(1);
    for (const [body] of createGuideSession.mock.calls) {
      expect(body.idempotencyKey).toBe(START_KEY);
    }
  });
});

describe("GuidePlayer · ambiguous START", () => {
  it("keeps the stored key after a failed click, and reuses it on retry", async () => {
    createGuideSession.mockRejectedValueOnce(new TypeError("network"));
    createGuideSession.mockResolvedValueOnce(ok());
    const user = userEvent.setup();
    render(<GuidePlayer />);

    await user.click(
      await screen.findByRole("button", { name: "Empezar guía" }),
    );
    const firstKey = createGuideSession.mock.calls[0]![0]!.idempotencyKey;
    expect(readRecord()?.startIdempotencyKey).toBe(firstKey);

    await user.click(await screen.findByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(createGuideSession).toHaveBeenCalledTimes(2));
    // GUIDE_START_NEW_KEY_AFTER_AMBIGUITY=false
    expect(createGuideSession.mock.calls[1]![0]!.idempotencyKey).toBe(firstKey);
  });

  it("after a failed mount replay it offers retry, not a fresh start", async () => {
    storeRecord();
    createGuideSession.mockRejectedValueOnce(new TypeError("network"));
    createGuideSession.mockResolvedValueOnce(replayed({ stepsCompleted: 1 }));
    const user = userEvent.setup();
    render(<GuidePlayer />);

    // The fresh-start CTA would mint a different key — it must not be offered.
    expect(
      await screen.findByRole("button", { name: "Reintentar" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Empezar guía" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(createGuideSession).toHaveBeenCalledTimes(2));
    for (const [body] of createGuideSession.mock.calls) {
      expect(body.idempotencyKey).toBe(START_KEY);
    }
  });
});

describe("GuidePlayer · storage must confirm before the network", () => {
  const STORAGE_COPY =
    "Este navegador no puede guardar la recuperación de la guía.";

  function blockWrites() {
    return vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
  }

  it("does not START when the key cannot be persisted", async () => {
    const spy = blockWrites();
    const user = userEvent.setup();
    render(<GuidePlayer />);

    await user.click(
      await screen.findByRole("button", { name: "Empezar guía" }),
    );

    // GUIDE_STORAGE_FAILURE_API_CALLS=0
    expect(createGuideSession).not.toHaveBeenCalled();
    expect(await screen.findByText(STORAGE_COPY)).toBeInTheDocument();
    spy.mockRestore();
  });

  it("does not send a step or the completion either", async () => {
    const cases: Array<[Partial<GuideSessionView>, string, () => unknown]> = [
      [{}, "He explorado esta idea", () => completeGuideSessionStep],
      [
        {
          stepsCompleted: 1,
          currentStepKey: "practicar-escucharte-por-dentro",
        },
        "Ya hice esta práctica",
        () => completeGuideSessionStep,
      ],
      [
        { stepsCompleted: 3, currentStepKey: null },
        "Finalizar guía",
        () => completeGuideSession,
      ],
    ];

    for (const [over, label, spyOf] of cases) {
      vi.clearAllMocks();
      window.localStorage.clear();
      storeRecord();
      createGuideSession.mockResolvedValue(replayed(over));
      const user = userEvent.setup();
      const view = render(<GuidePlayer />);
      const cta = await screen.findByRole("button", { name: label });

      const spy = blockWrites();
      await user.click(cta);
      expect(spyOf()).not.toHaveBeenCalled();
      expect(await screen.findByText(STORAGE_COPY)).toBeInTheDocument();
      spy.mockRestore();
      view.unmount();
    }
  });

  it("does not send the cancel when its key cannot be persisted", async () => {
    storeRecord();
    createGuideSession.mockResolvedValue(replayed());
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<GuidePlayer />);

    const cta = await screen.findByRole("button", { name: "Salir de la guía" });
    const spy = blockWrites();
    await user.click(cta);

    expect(cancelGuideSession).not.toHaveBeenCalled();
    spy.mockRestore();
    confirm.mockRestore();
  });

  it("does not send the recall when its key cannot be persisted", async () => {
    storeRecord();
    createGuideSession.mockResolvedValue(
      replayed({
        stepsCompleted: 2,
        currentStepKey: "recordar-cuerpo-antes-que-mente",
      }),
    );
    const user = userEvent.setup();
    render(<GuidePlayer />);

    await user.click((await screen.findAllByRole("radio"))[0]!);
    const spy = blockWrites();
    await user.click(
      screen.getByRole("button", { name: "Registrar respuesta" }),
    );

    expect(submitGuideStepRecall).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("treats an unreadable storage as blocked, not as a fresh browser", async () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });
    render(<GuidePlayer />);

    expect(await screen.findByText(STORAGE_COPY)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Empezar guía" })).toBeNull();
    expect(createGuideSession).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("GuidePlayer · a pending command belongs to one session", () => {
  it("drops a pending whose sessionId is not the recovered one", async () => {
    storeRecord({
      sessionId: "cmb0otrasesion999",
      pendingCommand: {
        commandType: "STEP_COMPLETE",
        idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        sessionId: "cmb0otrasesion999",
        stepKey: "explorar-cuerpo-antes-que-mente",
      },
    });
    createGuideSession.mockResolvedValue(
      replayed({
        stepsCompleted: 1,
        currentStepKey: "practicar-escucharte-por-dentro",
      }),
    );
    render(<GuidePlayer />);

    // The recovered snapshot renders…
    expect(
      await screen.findByRole("button", { name: "Ya hice esta práctica" }),
    ).toBeInTheDocument();
    // …and the foreign command is never sent, nor kept.
    expect(completeGuideSessionStep).not.toHaveBeenCalled();
    expect(readRecord()?.pendingCommand).toBeUndefined();
    expect(readRecord()?.sessionId).toBe(SESSION_ID);
  });
});

describe("GuidePlayer · a failed resync keeps the pending", () => {
  it("preserves both keys and applies them on the later retry", async () => {
    storeRecord();
    createGuideSession
      .mockResolvedValueOnce(replayed())
      // The resync after the 409 fails…
      .mockRejectedValueOnce(new TypeError("network"))
      // …and succeeds when the person retries.
      .mockResolvedValueOnce(replayed());
    completeGuideSessionStep
      .mockRejectedValueOnce(await apiError(409, "GUIDE_STEP_NOT_CURRENT"))
      .mockResolvedValueOnce(
        ok({
          stepsCompleted: 1,
          currentStepKey: "practicar-escucharte-por-dentro",
        }),
      );
    const user = userEvent.setup();
    render(<GuidePlayer />);

    await user.click(
      await screen.findByRole("button", { name: "He explorado esta idea" }),
    );

    // GUIDE_RESYNC_FAILURE_PRESERVES_PENDING=true
    const retryBtn = await screen.findByRole("button", { name: "Reintentar" });
    const commandKey =
      completeGuideSessionStep.mock.calls[0]![2]!.idempotencyKey;
    expect(readRecord()?.pendingCommand?.idempotencyKey).toBe(commandKey);

    await user.click(retryBtn);

    await waitFor(() =>
      expect(completeGuideSessionStep).toHaveBeenCalledTimes(2),
    );
    // GUIDE_RESYNC_RETRY_START_KEY_REUSED=true
    for (const [body] of createGuideSession.mock.calls) {
      expect(body.idempotencyKey).toBe(START_KEY);
    }
    // GUIDE_RESYNC_RETRY_COMMAND_KEY_REUSED=true
    expect(completeGuideSessionStep.mock.calls[1]![2]!.idempotencyKey).toBe(
      commandKey,
    );
  });
});

describe("GuidePlayer · a contradictory snapshot is not completed", () => {
  it("refuses to finish an ACTIVE session with steps missing", async () => {
    storeRecord();
    createGuideSession.mockResolvedValue(
      replayed({ status: "ACTIVE", currentStepKey: null, stepsCompleted: 1 }),
    );
    render(<GuidePlayer />);

    expect(
      await screen.findByText("No pudimos mostrar el estado actual."),
    ).toBeInTheDocument();
    // GUIDE_CONTRADICTORY_STATE_COMMAND_CALLS=0
    expect(screen.queryByRole("button", { name: "Finalizar guía" })).toBeNull();
    expect(completeGuideSession).not.toHaveBeenCalled();
    expect(cancelGuideSession).not.toHaveBeenCalled();
    expect(completeGuideSessionStep).not.toHaveBeenCalled();
    expect(submitGuideStepRecall).not.toHaveBeenCalled();
  });

  it("still finishes when the server reports every step accepted", async () => {
    storeRecord();
    createGuideSession.mockResolvedValue(
      replayed({ status: "ACTIVE", currentStepKey: null, stepsCompleted: 3 }),
    );
    render(<GuidePlayer />);

    expect(
      await screen.findByRole("button", { name: "Finalizar guía" }),
    ).toBeInTheDocument();
  });
});
