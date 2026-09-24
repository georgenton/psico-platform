import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { CircleActivityView } from "@psico/types";
import { productionCircleTemplateRegistry } from "@psico/types";

vi.mock("server-only", () => ({}));

import { Reveal } from "./Reveal";
import { PreviewCompartir } from "./PreviewCompartir";
import { PLANTILLA, REVELADA_POR_CAMPOS } from "./__fixtures__/actividad";

/**
 * Lo que se lee bajo cada respuesta es la pregunta que se hizo — no su clave.
 *
 * EL FALLO QUE ESTO IMPIDE. El revelado pintaba `fieldKey` como si fuera el
 * enunciado, así que después de confirmar, la persona leía «que-ayuda» sobre la
 * respuesta de la otra — la misma respuesta que la pantalla anterior le había
 * enseñado bajo «En ese momento, me ayuda que…». Issue #723.
 *
 * Estas pruebas miran lo que ve la persona, no cómo está construido: piden el
 * texto por pantalla. Si mañana el enunciado se resuelve de otra forma pero
 * sigue llegando a la pantalla, no se enteran — y así debe ser.
 */

const FIELDS = PLANTILLA.privatePreparation;

/**
 * La sección por su encabezado. Hace falta acotar porque el enunciado aparece
 * dos veces en la misma pantalla —sobre la respuesta de la otra persona y sobre
 * la propia— y eso es correcto: son dos respuestas a la misma pregunta.
 */
const seccion = (nombre: string) =>
  within(screen.getByRole("heading", { name: nombre }).closest("section")!);

describe("el revelado enseña la pregunta, nunca la clave", () => {
  it("pone el enunciado de la plantilla sobre lo que compartió la otra persona", () => {
    render(<Reveal view={REVELADA_POR_CAMPOS} fields={FIELDS} />);
    const suyo = seccion("Lo que compartió la otra persona");

    expect(suyo.getByText("Algo que quieres decir")).toBeVisible();
    expect(suyo.getByText("Algo que te costó")).toBeVisible();
    expect(suyo.getByText("lo suyo del primer campo")).toBeVisible();
    expect(suyo.getByText("lo suyo del segundo campo")).toBeVisible();
  });

  it("no deja ninguna clave interna a la vista", () => {
    const { container } = render(
      <Reveal view={REVELADA_POR_CAMPOS} fields={FIELDS} />,
    );
    // Por pantalla…
    expect(screen.queryByText("algo")).toBeNull();
    expect(screen.queryByText("otro")).toBeNull();
    // …y en el marcado, por si alguna se colara en un atributo visible.
    for (const dt of container.querySelectorAll("dt")) {
      expect(FIELDS.map((f) => f.fieldKey)).not.toContain(dt.textContent);
    }
  });

  it("también sobre lo que compartió quien está mirando", () => {
    render(<Reveal view={REVELADA_POR_CAMPOS} fields={FIELDS} />);
    const mio = seccion("Lo que compartiste tú");
    expect(mio.getByText("Algo que quieres decir")).toBeVisible();
    expect(mio.getByText("lo mío del primer campo")).toBeVisible();
    expect(mio.queryByText("algo")).toBeNull();
  });

  it("y sobre la respuesta de cada asiento cuando son más de dos", () => {
    const sala: CircleActivityView = {
      ...REVELADA_POR_CAMPOS,
      requiredParticipants: 3,
      readyCount: 3,
      revealed: {
        participants: [
          {
            label: "Participante 1",
            share: {
              mode: "SELECTED_FIELDS",
              fields: [{ fieldKey: "algo", value: "lo de quien invitó" }],
            },
          },
          {
            label: "Participante 3",
            share: {
              mode: "SELECTED_FIELDS",
              fields: [{ fieldKey: "otro", value: "lo de la tercera" }],
            },
          },
        ],
      },
    };
    render(<Reveal view={sala} fields={FIELDS} />);

    expect(
      screen.getAllByText("Algo que quieres decir").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Algo que te costó")).toBeVisible();
    expect(screen.queryByText("algo")).toBeNull();
    expect(screen.queryByText("otro")).toBeNull();
  });
});

describe("el enunciado es el de SU plantilla, no el de un diccionario global", () => {
  /**
   * La prueba que descarta el atajo. `que-ayuda` no significa lo mismo en la v1
   * que en la v2 de la misma plantilla: la v2 pregunta antes por el momento y
   * reformula el resto. Un mapa `clave → enunciado` le pondría a una actividad
   * de la v1 la pregunta de la v2, o sea, una respuesta bajo una pregunta que
   * nadie hizo. Aquí se pinta la MISMA respuesta dos veces, sólo cambiando la
   * definición, y se exige que el texto cambie con ella.
   */
  const v1 = productionCircleTemplateRegistry.getExact(
    "duo-lo-que-me-ayuda",
    1,
  );
  const v2 = productionCircleTemplateRegistry.getExact(
    "duo-lo-que-me-ayuda",
    2,
  );

  const conPlantilla = (templateVersion: number): CircleActivityView => ({
    ...REVELADA_POR_CAMPOS,
    templateKey: "duo-lo-que-me-ayuda",
    templateVersion,
    you: { ...REVELADA_POR_CAMPOS.you, confirmed: null },
    revealed: {
      participants: [
        {
          label: "Participante 2",
          share: {
            mode: "SELECTED_FIELDS",
            fields: [
              { fieldKey: "que-ayuda", value: "que me escuchen sin arreglar" },
            ],
          },
        },
      ],
    },
  });

  it("el catálogo enuncia la misma clave de dos maneras", () => {
    // Si esto dejara de ser cierto, la prueba de abajo se volvería vacía sin
    // avisar: estaría comparando un texto consigo mismo.
    const enunciado = (d: typeof v1) =>
      d.privatePreparation.find((f) => f.fieldKey === "que-ayuda")!.label;
    expect(enunciado(v1)).not.toBe(enunciado(v2));
  });

  it("una actividad anclada a la v1 lee la pregunta de la v1", () => {
    render(<Reveal view={conPlantilla(1)} fields={v1.privatePreparation} />);
    expect(screen.getByText("Cuando estoy así, me ayuda que…")).toBeVisible();
    expect(screen.queryByText("En ese momento, me ayuda que…")).toBeNull();
    expect(screen.queryByText("que-ayuda")).toBeNull();
  });

  it("una actividad anclada a la v2 lee la de la v2", () => {
    render(<Reveal view={conPlantilla(2)} fields={v2.privatePreparation} />);
    expect(screen.getByText("En ese momento, me ayuda que…")).toBeVisible();
    expect(screen.queryByText("Cuando estoy así, me ayuda que…")).toBeNull();
    expect(screen.queryByText("que-ayuda")).toBeNull();
  });
});

describe("la vista previa promete exactamente lo que se revelará", () => {
  it("usa el mismo enunciado que verá la otra persona", () => {
    const respuestas = [{ fieldKey: "algo", value: "lo mío del primer campo" }];

    const { unmount } = render(
      <PreviewCompartir
        confirmation={{ mode: "SELECTED_FIELDS", fields: respuestas }}
        fields={FIELDS}
        busy={false}
        onBack={() => {}}
        onConfirm={() => {}}
      />,
    );
    const enPrevia = screen.getByText("Algo que quieres decir").textContent;
    unmount();

    render(<Reveal view={REVELADA_POR_CAMPOS} fields={FIELDS} />);
    const enRevelado = seccion("Lo que compartiste tú").getByText(
      "Algo que quieres decir",
    ).textContent;

    expect(enPrevia).toBe(enRevelado);
  });
});

describe("cuando este build no lleva la plantilla anclada", () => {
  /**
   * La página ya decidió qué hacer aquí: manda `fields: []` en vez de inventar
   * preguntas. Lo que no puede pasar es que el hueco se rellene con la clave
   * interna, que es justo el fallo. Se enseña la respuesta y nada más.
   */
  it("enseña las respuestas sin pregunta, y sin la clave", () => {
    const { container } = render(
      <Reveal view={REVELADA_POR_CAMPOS} fields={[]} />,
    );
    expect(screen.getByText("lo suyo del primer campo")).toBeVisible();
    expect(screen.getByText("lo suyo del segundo campo")).toBeVisible();
    expect(screen.queryByText("algo")).toBeNull();
    expect(screen.queryByText("otro")).toBeNull();
    // Sin enunciado no hay lista de definiciones que sostener.
    expect(container.querySelectorAll("dt")).toHaveLength(0);
  });
});
