import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PreparacionPrivada, borradorInicial } from "./PreparacionPrivada";
import type { BorradorPrivado } from "./PreparacionPrivada";
import { PreviewCompartir } from "./PreviewCompartir";
import { SalaDuo } from "./SalaDuo";
import { PLANTILLA, REVELADA, irACompartir } from "./__fixtures__/actividad";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

/**
 * Two people, two modalities, two different sets of consequences.
 *
 * ── Why exactly two ───────────────────────────────────────────────────────
 *
 * Because that is the only size at which the bug is visible. Above two, a
 * group is a group and counting people happens to give the right answer; at
 * two, counting says «Dúo» about an activity the API still runs as a group.
 * Every case here therefore fixes the count at two and varies ONLY the
 * modality, so anything that differs between them is the modality talking.
 *
 * What each modality must say about «No compartir»:
 *
 *   · DUO — the other person is told you finished without sharing. That is
 *     the historic promise and it stays exactly as it was.
 *   · GROUP_ADULT — the activity ends for both, what the other person wrote
 *     is discarded unopened, and NOBODY is told who chose it. Said for two
 *     people, because there are two, without ever promising a notice that
 *     names the person who ended it.
 */

const fields = PLANTILLA.privatePreparation;
const allowedModes = PLANTILLA.sharing.allowedModes;

function Preparacion({ modalidad }: { modalidad: "DUO" | "GROUP_ADULT" }) {
  const [draft, setDraft] = useState<BorradorPrivado>(() =>
    borradorInicial(allowedModes),
  );
  return (
    <PreparacionPrivada
      fields={fields}
      allowedModes={allowedModes}
      draft={draft}
      onDraftChange={setDraft}
      busy={false}
      onPreview={vi.fn()}
      onWithdraw={vi.fn()}
      // The group that continued with two: the count says two, the modality
      // says group. Both are true at the same time.
      participantes={2}
      modalidad={modalidad}
    />
  );
}

/** Walk to the sharing step and pick «No compartir». */
async function elegirNoCompartir(user: ReturnType<typeof userEvent.setup>) {
  await irACompartir(user, screen);
  await user.click(screen.getByRole("radio", { name: /No compartir/i }));
}

/**
 * The paragraph that explains what keeping it private DOES.
 *
 * Found by its own sentence rather than by `role="note"`: the screen already
 * carries another note (the one about the draft never leaving the device), so
 * asking for the role finds two and tells you nothing about either.
 */
function avisoDeNoCompartir(): HTMLElement {
  return screen.getByText(
    /termina aquí para las dos personas|La otra persona verá que terminaste/i,
  );
}

describe("preparing: what «No compartir» does, at two people", () => {
  it("a reduced GROUP says the activity ends for both and names nobody", async () => {
    const user = userEvent.setup();
    render(<Preparacion modalidad="GROUP_ADULT" />);
    await elegirNoCompartir(user);

    const aviso = avisoDeNoCompartir();
    // A group's consequence is loud: it renders as a notice, not as prose.
    expect(aviso).toHaveAttribute("role", "note");
    // The group's consequence: it ends for everybody and what the other
    // person wrote is discarded without being opened.
    expect(aviso).toHaveTextContent(/termina aquí para las dos personas/i);
    expect(aviso).toHaveTextContent(/se descarta sin abrirse/i);
    // And the part that must never be promised in a group.
    expect(aviso).toHaveTextContent(/no se le dice a nadie quién lo eligió/i);
    expect(aviso).not.toHaveTextContent(/verá que terminaste/i);

    // Said for TWO people. The count is still doing its own job.
    expect(aviso).not.toHaveTextContent(/todo el grupo/i);
    expect(aviso).not.toHaveTextContent(/las demás personas/i);

    // The option's own label states the consequence too.
    expect(
      screen.getByRole("radio", {
        name: /No compartir nada y terminar la actividad/i,
      }),
    ).toBeInTheDocument();
  });

  it("a real DUO keeps the promise it has always made", async () => {
    const user = userEvent.setup();
    render(<Preparacion modalidad="DUO" />);
    await elegirNoCompartir(user);

    // Historic wording, unchanged: the other person learns you finished.
    const aviso = avisoDeNoCompartir();
    expect(aviso).toHaveTextContent(/La otra persona verá que terminaste/i);
    // And it stays prose. Nothing is ending, so nothing is being warned about.
    expect(aviso).not.toHaveAttribute("role");
    expect(aviso).not.toHaveTextContent(/termina aquí/i);
    expect(aviso).not.toHaveTextContent(/se descarta sin abrirse/i);
    // A Dúo does not end by keeping your half private, so the label does not
    // claim it does.
    expect(
      screen.getByRole("radio", { name: /No compartir nada esta vez/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: /terminar la actividad/i }),
    ).toBeNull();
  });
});

describe("the preview: the same two answers, one step later", () => {
  const preview = (modalidad: "DUO" | "GROUP_ADULT") =>
    render(
      <PreviewCompartir
        confirmation={{ mode: "KEEP_PRIVATE" }}
        fields={fields}
        busy={false}
        onBack={vi.fn()}
        onConfirm={vi.fn()}
        participantes={2}
        modalidad={modalidad}
      />,
    );

  it("a reduced GROUP warns that confirming closes the activity", () => {
    preview("GROUP_ADULT");

    expect(
      screen.getByText(/termina para las dos personas/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/se descarta sin abrirse/i)).toBeInTheDocument();
    expect(
      screen.getByText(/no se le dice a nadie quién lo eligió/i),
    ).toBeInTheDocument();
    // The irreversibility, which only the group's rules produce here.
    expect(
      screen.getByText(/la actividad se cierra\. No se puede deshacer/i),
    ).toBeInTheDocument();
    // Still two people, so the heading speaks about one other person.
    expect(
      screen.getByRole("heading", { name: /lo que verá la otra persona/i }),
    ).toBeInTheDocument();
  });

  it("a real DUO says what the other person will see, and closes nothing", () => {
    preview("DUO");

    expect(
      screen.getByText(/Verá que terminaste tu parte/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No se puede deshacer/i)).toBeNull();
    expect(screen.queryByText(/se descarta sin abrirse/i)).toBeNull();
    // The Dúo's own promise: confirming sends, and the pair opens together.
    expect(
      screen.getByText(/las dos personas hayan confirmado/i),
    ).toBeInTheDocument();
  });
});

describe("the closing screen: who can still open this room", () => {
  const sala = {
    activityId: "act-1",
    initialError: null,
    fields: PLANTILLA.privatePreparation,
    allowedModes: PLANTILLA.sharing.allowedModes,
    noConviene: PLANTILLA.safety.doNotSuggestWhen,
    minutosEstimados: PLANTILLA.estimatedMinutes,
    intro: PLANTILLA.intro ?? null,
    isGuest: true,
  };

  /** A room that opened and is now over for this person. */
  const cerrada = (modalidad: "DUO" | "GROUP_ADULT") => ({
    ...REVELADA,
    kind: modalidad,
    // Offered to six, continued with two. The count is two either way, so
    // only the modality separates these two cases.
    ...(modalidad === "GROUP_ADULT"
      ? {
          requiredParticipants: 6,
          onboarding: {
            policy: "FLEXIBLE" as const,
            capacity: 6,
            accepted: 2,
            group: 2,
            open: false,
            canClose: false,
            roster: [],
          },
        }
      : {}),
    you: { ...REVELADA.you, status: "WITHDRAWN" as const },
  });

  it("a reduced GROUP is told the room will not open again", () => {
    render(<SalaDuo {...sala} initialView={cerrada("GROUP_ADULT")} />);
    // `withdraw` revokes every session in a group, so this is a fact about
    // the product, not a turn of phrase.
    expect(
      screen.getByText(/esta sala ya no se puede volver a abrir/i),
    ).toBeInTheDocument();
  });

  it("a real DUO keeps the sentence it has always had", () => {
    render(<SalaDuo {...sala} initialView={cerrada("DUO")} />);
    expect(
      screen.getByText(/Lo que compartieron queda entre ustedes/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ya no se puede volver a abrir/i)).toBeNull();
  });
});
