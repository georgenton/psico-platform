import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EcoPersona } from "@psico/types";
import { ChatArea } from "./ChatArea";

/**
 * El título del chat de Eco y su nivel — #732.
 *
 * POR QUÉ ESTE TEST EXISTE APARTE. El mismo chat se monta en dos sitios con
 * jerarquías distintas: en `/dashboard/eco` la conversación ES la pantalla, así
 * que su título es el `<h1>`; en el panel del lector cuelga de una pestaña
 * dentro de una página cuyo `<h1>` es el capítulo, y ahí un `<h1>` sería el
 * segundo de la ruta. Fijar el nivel dentro del componente obligaba a elegir
 * uno de los dos y equivocarse en el otro.
 *
 * Se comprueba que el componente HONRA el nivel que le pasan, no sólo que lo
 * acepta: que el defecto no introduce un heading donde antes no había, y que con
 * `h1` el texto visible es el que se anuncia.
 */

const PERSONA: EcoPersona = {
  name: "Eco",
  voice: "Companion conversacional. Acompaña sin diagnosticar.",
  caps: [],
};

function montar(tituloComo?: "p" | "h1") {
  return render(
    <ChatArea
      threadId="t1"
      caps={PERSONA}
      apiBase="http://api.test"
      token="tok"
      ecoKey={new Uint8Array(32).fill(3)}
      onMessageSent={() => {}}
      {...(tituloComo ? { tituloComo } : {})}
    />,
  );
}

describe("ChatArea · el nivel del título lo decide quien lo monta", () => {
  beforeEach(() => {
    // El historial se carga con un fetch al montar; para hablar del título basta
    // con que no reviente. Un hilo vacío es una respuesta legítima del API.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [], hasMore: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("con `h1` el título visible es el encabezado de la pantalla", () => {
    montar("h1");
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("Eco");
  });

  it("por defecto NO introduce ningún heading — el dock del lector no cambia", () => {
    // El `<h1>` de la ruta del lector es el capítulo. Si este componente trajera
    // el suyo, esa página tendría dos.
    montar();
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
    // Y el texto sigue ahí: cambia el tag, no lo que se lee.
    expect(screen.getByText("Eco")).toBeInTheDocument();
  });
});
