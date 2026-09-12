import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CircleActivityDefinition } from "@psico/types";
import { CircleTemplateRegistry, toCircleTemplatePreview } from "@psico/types";

const headerStore: Record<string, string | undefined> = {
  origin: "https://app.test",
  host: "app.test",
};
const cookieStore = new Map<string, string>([["psico_at", "member-access"]]);

vi.mock("next/headers", () => ({
  headers: () => ({ get: (k: string) => headerStore[k] ?? null }),
  cookies: () => ({
    get: (k: string) =>
      cookieStore.has(k) ? { value: cookieStore.get(k) } : undefined,
    delete: (k: string) => cookieStore.delete(k),
  }),
}));
vi.mock("server-only", () => ({}));

import { POST as duoPOST } from "./duo/route";
import {
  resolveDuoEntry,
  resolvePublishedTemplateByKey,
  type DuoEligibilityDeps,
} from "@/lib/circulos/eligibility";
import { DuoEntryPoint } from "@/components/circulos/DuoEntryPoint";
import { CrearDuo } from "@/components/circulos/CrearDuo";
import { PLANTILLA } from "@/components/circulos/__fixtures__/actividad";

/**
 * The whole entry path, end to end, against the REAL Route Handler.
 *
 * Only the upstream API is simulated. Everything between the reader's screen
 * and that boundary — eligibility, the CTA, the preview, the minting, the
 * closed payload parser — is the code that ships.
 */

const PIN = { experienceKey: "fixture-experience", experienceVersion: 1 };

const PUBLISHED: CircleActivityDefinition = {
  ...PLANTILLA,
  source: {
    bookSlug: "fixture-book",
    chapterOrder: 1,
    experiencePin: { ...PIN },
  },
};

const DEPS: DuoEligibilityDeps = {
  catalog: [{ ...PIN, templateKey: "fixture-duo", templateVersion: 1 }],
  registry: new CircleTemplateRegistry([PUBLISHED]),
};

/** Requests the simulated upstream API received. */
let upstream: Array<{
  url: string;
  body: unknown;
  idempotencyKey: string | null;
}>;
let upstreamStatus: number;

beforeEach(() => {
  upstream = [];
  upstreamStatus = 201;
  cookieStore.set("psico_at", "member-access");

  vi.spyOn(globalThis, "fetch").mockImplementation((async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = String(input);

    // The browser's call: hand it to the real handler, unchanged.
    if (url.startsWith("/api/circulos/duo")) {
      return duoPOST(
        new Request("https://app.test/api/circulos/duo", {
          method: "POST",
          body: String(init?.body ?? ""),
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    // The upstream API — the ONLY simulated boundary.
    const headers = new Headers(init?.headers);
    upstream.push({
      url,
      body: JSON.parse(String(init?.body ?? "{}")),
      idempotencyKey: headers.get("idempotency-key"),
    });
    return new Response(
      JSON.stringify(
        upstreamStatus === 201
          ? { circleId: "cir-9", activityId: "act-9" }
          : { code: "CIRCLE_TEMPLATE_UNAVAILABLE" },
      ),
      {
        status: upstreamStatus,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch);
});

describe("LOCAL_E2E · eligible source → CTA → preview → create → copy", () => {
  it("walks the whole path and calls the BFF exactly once", async () => {
    const user = userEvent.setup();

    // 1 · an eligible source renders the CTA, server-resolved.
    const cta = render(<DuoEntryPoint pin={PIN} deps={DEPS} />);
    const link = screen.getByRole("link", { name: "Hacer esto con alguien" });
    expect(link).toHaveAttribute(
      "href",
      "/dashboard/circulos/nuevo/fixture-duo",
    );
    cta.unmount();

    // 2 · that href resolves, server-side, to exactly one PUBLISHED template.
    const definition = resolvePublishedTemplateByKey("fixture-duo", DEPS);
    expect(definition).not.toBeNull();
    const preview = toCircleTemplatePreview(definition!);
    expect(preview.title).toBe(PLANTILLA.title);
    expect(preview.participants.required).toBe(2);

    // 3 · the organiser confirms. Nothing existed before this click.
    render(
      <CrearDuo
        templateKey={preview.templateKey}
        templateVersion={preview.templateVersion}
      />,
    );
    expect(upstream).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /Crear Dúo/ }));
    await screen.findByText(/Comparte este enlace/);

    // 4 · exactly one upstream creation, carrying the closed payload.
    expect(upstream).toHaveLength(1);
    const sent = upstream[0]!.body as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual([
      "invitationToken",
      "templateKey",
      "templateVersion",
    ]);
    expect(upstream[0]!.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    // 5 · the link carries the token in the fragment, and can be copied.
    const token = sent.invitationToken as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const shown = screen.getByText(new RegExp(`/i#${token}$`));
    expect(new URL(shown.textContent!).hash).toBe(`#${token}`);

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    await user.click(screen.getByRole("button", { name: /Copiar enlace/ }));
    expect(writeText).toHaveBeenCalledOnce();
    expect(String(writeText.mock.calls[0]![0])).toContain(`/i#${token}`);
  });
});

describe("12 · a DRAFT or ARCHIVED template never reaches the Route Handler", () => {
  it("is not offered, and its key does not resolve for the organiser", () => {
    for (const status of ["DRAFT", "ARCHIVED"] as const) {
      const deps: DuoEligibilityDeps = {
        catalog: DEPS.catalog,
        registry: new CircleTemplateRegistry([{ ...PUBLISHED, status }]),
      };
      // No CTA…
      expect(resolveDuoEntry(PIN, deps), status).toBeNull();
      // …and the organiser route refuses the key outright, so the screen that
      // would issue the request never renders.
      expect(resolvePublishedTemplateByKey("fixture-duo", deps)).toBeNull();
    }
    // Nothing above performed any request at all.
    expect(upstream).toHaveLength(0);
  });
});

describe("9 · the handler refuses extra fields and asserted identity", () => {
  async function post(body: unknown): Promise<Response> {
    return duoPOST(
      new Request("https://app.test/api/circulos/duo", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  const TOKEN = "A".repeat(43);
  const KEY = "3f1c2b8a-5d4e-4a7b-9c2d-6e8f0a1b2c3d";
  const VALID = {
    payload: {
      templateKey: "fixture-duo",
      templateVersion: 1,
      invitationToken: TOKEN,
    },
    idempotencyKey: KEY,
  };

  it("accepts the exact shape", async () => {
    const res = await post(VALID);
    expect(res.status).toBe(201);
    expect(upstream).toHaveLength(1);
  });

  it("refuses an identity the browser asserted", async () => {
    for (const claimed of [
      "userId",
      "participantId",
      "circleId",
      "memberId",
      "role",
      "contentUnitId",
    ]) {
      const res = await post({
        ...VALID,
        payload: { ...VALID.payload, [claimed]: "smuggled" },
      });
      expect(res.status, claimed).toBe(400);
      expect(await res.json()).toMatchObject({
        code: "CIRCLE_INVALID_PAYLOAD",
      });
    }
    // Not one of them was forwarded.
    expect(upstream).toHaveLength(0);
  });

  it("refuses an extra key on the wrapper too", async () => {
    const res = await post({ ...VALID, source: "eec-c1" });
    expect(res.status).toBe(400);
    expect(upstream).toHaveLength(0);
  });

  it("refuses a token that is not 256 bits of base64url", async () => {
    for (const bad of ["A".repeat(42), "A".repeat(44), `${"A".repeat(42)}!`]) {
      const res = await post({
        ...VALID,
        payload: { ...VALID.payload, invitationToken: bad },
      });
      expect(res.status, bad.length.toString()).toBe(400);
    }
    expect(upstream).toHaveLength(0);
  });

  it("refuses a request with no session", async () => {
    cookieStore.delete("psico_at");
    const res = await post(VALID);
    expect(res.status).toBe(401);
    expect(upstream).toHaveLength(0);
  });
});
