import { beforeEach, describe, expect, it, vi } from "vitest";

const { serverFetch, revalidatePath } = vi.hoisted(() => ({
  serverFetch: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/api.server", () => ({
  serverFetch,
  isNextThrow: (err: unknown) =>
    typeof (err as { digest?: unknown })?.digest === "string",
}));

import { ApiError } from "@/lib/api";
import {
  cancelAccountDeleteAction,
  requestAccountDeleteAction,
} from "./profile";

/** What the deletion row can learn from its two actions. */
describe("las acciones de la baja", () => {
  beforeEach(() => {
    serverFetch.mockReset();
    revalidatePath.mockReset();
  });

  it("cancela sin cuerpo ni contraseña, y la página deja de servirse vieja", async () => {
    serverFetch.mockResolvedValue({ ok: true, cancelled: true });

    expect(await cancelAccountDeleteAction()).toEqual({ ok: true });
    expect(serverFetch).toHaveBeenCalledWith("/user/delete-request/cancel", {
      method: "POST",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/perfil");
  });

  it("no había nada pendiente también es éxito: la cuenta no se elimina", async () => {
    serverFetch.mockResolvedValue({ ok: true, cancelled: false });

    expect(await cancelAccountDeleteAction()).toEqual({ ok: true });
  });

  it.each([409, 410, 429, 500])(
    "devuelve el estado %s en vez de lanzarlo, que Next lo taparía",
    async (status) => {
      serverFetch.mockRejectedValue(new ApiError(status, "diagnóstico"));

      expect(await cancelAccountDeleteAction()).toEqual({ ok: false, status });
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("sin respuesta no hay estado que contar", async () => {
    serverFetch.mockRejectedValue(new TypeError("fetch failed"));

    expect(await cancelAccountDeleteAction()).toEqual({
      ok: false,
      status: null,
    });
  });

  it("no se traga el salto a /logout de una sesión caducada", async () => {
    const salto = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/logout;307;",
    });
    serverFetch.mockRejectedValue(salto);

    await expect(cancelAccountDeleteAction()).rejects.toBe(salto);
  });

  it("pedirla también renueva la página, con la fecha del servidor intacta", async () => {
    const deleteAt = "2026-12-24T14:05:00.000Z";
    serverFetch.mockResolvedValue({ ok: true, deleteAt });

    expect(await requestAccountDeleteAction("clave")).toEqual({
      ok: true,
      deleteAt,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/perfil");
  });
});
