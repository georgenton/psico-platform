import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EcoPersona } from "@psico/types";
import { MASTER_KEY_LEN } from "@psico/crypto";

import * as diaryKeyContext from "@/lib/crypto/diary-key-context";

import { ChatArea } from "./ChatArea";
import { EcoShell } from "./EcoShell";

/**
 * La caja de escritura de Eco tiene que quedar a la vista.
 *
 * El chat medía `100vh - 180px` por su cuenta, sin contar lo que tenía encima:
 * con una sola sugerencia la caja acababa 56 px por debajo del borde a
 * 1440×900, y en un teléfono con tres, 156. Aquí se fija el REPARTO que lo
 * evita —una columna con alto, sugerencias que ceden y un chat que toma el
 * resto—; los píxeles se miden en el navegador, porque jsdom no maqueta.
 */

const CSS = readFileSync(
  join(__dirname, "..", "..", "..", "app", "dashboard-design.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/** Todas las declaraciones de una regla, en orden y sin perder repetidas. */
function regla(selector: string): Array<[string, string]> {
  const i = CSS.search(
    new RegExp(
      `(^|[\\n}])\\s*${selector.replace(/[.>]/g, (c) => `\\${c}`)}\\s*\\{`,
    ),
  );
  if (i < 0) throw new Error(`no se encontró la regla ${selector}`);
  const abre = CSS.indexOf("{", i);
  return CSS.slice(abre + 1, CSS.indexOf("}", abre))
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const k = d.indexOf(":");
      return [d.slice(0, k).trim(), d.slice(k + 1).trim()] as [string, string];
    });
}

const valor = (sel: string, prop: string) =>
  regla(sel).filter(([k]) => k === prop);

const PERSONA: EcoPersona = { name: "Eco", voice: "Companion.", caps: [] };

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const cuerpo = String(url).includes("/eco/suggestions")
      ? {
          suggestions: [
            {
              id: "a",
              title: "Sigue tu lectura",
              reason: "Vas por…",
              prompt: "x",
            },
          ],
        }
      : { messages: [], hasMore: false };
    return new Response(JSON.stringify(cuerpo), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.spyOn(diaryKeyContext, "useDiaryKey").mockReturnValue({
    key: new Uint8Array(32),
    ecoKey: new Uint8Array(32),
    masterKey: new Uint8Array(MASTER_KEY_LEN),
    isLegacyAccount: false,
    remember: true,
    unlocking: false,
    restoring: false,
    error: null,
    unlock: vi.fn(),
    lock: vi.fn(),
    adoptMasterKey: vi.fn(),
    setRemember: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("la pantalla de Eco reparte el alto que queda", () => {
  it("la columna cuenta la barra superior REAL y usa dvh, con vh de respaldo", () => {
    const altos = valor(".eco-columna", "height").map(([, v]) => v);
    expect(altos).toHaveLength(2);
    // El respaldo va primero: si no, taparía al bueno.
    expect(altos[0]).toContain("100vh");
    expect(altos[1]).toContain("100dvh");
    for (const a of altos) expect(a).toContain("var(--app-topbar-h");
  });

  it("si falta sitio ceden las sugerencias, no la caja", () => {
    const tira = Object.fromEntries(regla(".eco-columna > .eco-sugerencias"));
    // Puede encoger y, cuando encoge, lo que no cabe se desplaza por dentro.
    expect(tira.flex).toMatch(/^0 1 /);
    expect(tira["min-height"]).toBe("0");
    expect(tira["overflow-y"]).toMatch(/^(auto|scroll)$/);

    const chat = Object.fromEntries(regla(".eco-columna > .eco-chat-caja"));
    expect(chat.flex).toMatch(/^1 0 \d+px$/);
    // Sin esto, el alto propio del panel del lector ganaría dentro de la columna.
    expect(chat["min-height"]).toBe("0");
    expect(chat["max-height"]).toBe("none");
  });

  it("el panel del lector conserva el alto que tenía", () => {
    const caja = Object.fromEntries(regla(".eco-chat-caja"));
    expect(caja["min-height"]).toBe("calc(100vh - 180px)");
    expect(caja["max-height"]).toBe("calc(100vh - 180px)");
  });
});

describe("el chat no decide su alto", () => {
  it("lo deja en manos de quien lo monta, sin estilos en línea que lo pisen", () => {
    const { container } = render(
      <ChatArea
        threadId="t1"
        caps={PERSONA}
        apiBase="http://api.test"
        token="tok"
        ecoKey={new Uint8Array(32).fill(3)}
        onMessageSent={() => {}}
      />,
    );
    const caja = container.querySelector<HTMLElement>("section.eco-chat-caja");
    expect(caja).not.toBeNull();
    expect(caja?.style.minHeight).toBe("");
    expect(caja?.style.maxHeight).toBe("");
    expect(caja?.style.height).toBe("");
  });

  it("sugerencias y chat son hermanos dentro de la columna, o el reparto no aplica", async () => {
    const { container, findByText } = render(
      <EcoShell
        caps={PERSONA}
        initialRail={[
          {
            id: "t1",
            titleCiphertext: null,
            titleNonce: null,
            lastMessageAt: new Date("2026-06-21T12:00:00Z"),
            messageCount: 0,
          },
        ]}
        apiBase="http://api.test"
        token="t"
      />,
    );
    await findByText("Sigue tu lectura");
    const columna = container.querySelector(".eco-layout > .eco-columna");
    expect(columna).not.toBeNull();
    const hijos = [...(columna?.children ?? [])].map((h) => h.className);
    expect(hijos[0]).toBe("eco-sugerencias");
    expect(hijos[1]).toContain("eco-chat-caja");
  });
});

describe("lo que dice la caja cabe en la caja", () => {
  it("el texto de ayuda es corto y no habla de teclas", () => {
    // En un teléfono ocupaba tres líneas en una caja de dos, y la última salía
    // cortada; además, ahí no hay Shift.
    const fuente = readFileSync(join(__dirname, "ChatArea.tsx"), "utf8");
    const textos = [...fuente.matchAll(/placeholder="([^"]+)"/g)].map(
      (m) => m[1]!,
    );
    expect(textos).toContain("Escribe lo que necesites…");
    for (const t of textos) expect(t).not.toMatch(/Enter|Shift/);
  });
});
