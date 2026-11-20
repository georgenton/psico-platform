import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Importación de sólo-tipo: se borra al compilar, así que no interfiere con el
// izado de `vi.mock`, y evita la anotación `typeof import(...)` en línea que
// `consistent-type-imports` prohíbe.
import type * as LibApi from "@/lib/api";

/**
 * La pantalla del enlace de verificación.
 *
 * QUÉ DEFIENDE. Hasta el 2026-11-19 esta pantalla mentía: el estado «el
 * enlace expiró» decía «Iniciá sesión para que te enviemos uno nuevo
 * automáticamente» y ese recorrido no existía —`sendVerificationEmail` sólo se
 * disparaba al registrarse—. La persona iniciaba sesión, no llegaba nada, y la
 * única salida real era borrar la cuenta. Las pruebas de abajo fijan las dos
 * mitades del arreglo: que el remedio esté EN la pantalla, y que la pantalla
 * no vuelva a mandar a nadie a iniciar sesión para conseguir un enlace.
 */

const mockToken = vi.fn<() => string | null>(() => null);

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => mockToken() }),
}));

const mockVerifyEmail = vi.fn();
const mockResendVerification = vi.fn();

// `ApiError` se conserva REAL: el componente discrimina con `instanceof`, así
// que un doble rompería justo la rama que se quiere medir.
vi.mock("@/lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof LibApi>();
  return {
    ...real,
    authApi: {
      verifyEmail: mockVerifyEmail,
      resendVerification: mockResendVerification,
    },
  };
});

const { ApiError } = await import("@/lib/api");
const VerifyEmailFlow = (await import("./_VerifyEmailFlow")).default;

/** El formulario de reenvío, por su etiqueta accesible. */
const campoCorreo = () => screen.queryByLabelText("Tu correo");
const botonEnviar = () =>
  screen.queryByRole("button", { name: /enviar enlace nuevo/i });

beforeEach(() => {
  vi.clearAllMocks();
  mockToken.mockReturnValue(null);
  mockResendVerification.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VerifyEmailFlow · los callejones sin salida ofrecen el remedio real", () => {
  it("el enlace vencido ofrece el formulario, no un viaje al login", async () => {
    mockToken.mockReturnValue("t".repeat(64));
    mockVerifyEmail.mockRejectedValue(new ApiError(410, "gone"));

    render(<VerifyEmailFlow />);

    expect(await screen.findByText(/el enlace expiró/i)).toBeInTheDocument();

    // El remedio está aquí.
    expect(campoCorreo()).toBeInTheDocument();
    expect(botonEnviar()).toBeInTheDocument();

    // Y la promesa falsa no vuelve. Se busca el acto —«iniciar sesión»— en
    // cualquiera de sus formas y no la frase literal de entonces: una prueba
    // contra la frase exacta pasaría en verde sobre «Inicia sesión y te
    // enviamos uno nuevo», que es la misma mentira reescrita. El enlace
    // «← Volver al login» sobrevive a esto a propósito: ofrece volver, no
    // promete un correo.
    expect(screen.queryByText(/inici(a|á|ar) sesión/i)).not.toBeInTheDocument();
  });

  it("un enlace sin token explica qué pasó y deja pedir otro", async () => {
    mockToken.mockReturnValue(null);

    render(<VerifyEmailFlow />);

    expect(await screen.findByText(/enlace incompleto/i)).toBeInTheDocument();
    expect(campoCorreo()).toBeInTheDocument();
    // No se llama a verificar sin token: no hay nada que verificar.
    expect(mockVerifyEmail).not.toHaveBeenCalled();
  });

  it("un enlace inválido también deja pedir otro", async () => {
    mockToken.mockReturnValue("t".repeat(64));
    mockVerifyEmail.mockRejectedValue(new ApiError(400, "bad"));

    render(<VerifyEmailFlow />);

    expect(await screen.findByText(/enlace inválido/i)).toBeInTheDocument();
    expect(campoCorreo()).toBeInTheDocument();
  });

  it("un fallo nuestro no promete un recorrido que no hicimos", async () => {
    mockToken.mockReturnValue("t".repeat(64));
    mockVerifyEmail.mockRejectedValue(new Error("red caída"));

    render(<VerifyEmailFlow />);

    expect(await screen.findByText(/algo salió mal/i)).toBeInTheDocument();
    expect(campoCorreo()).toBeInTheDocument();
    expect(screen.queryByText(/inici(a|á|ar) sesión/i)).not.toBeInTheDocument();
  });

  it("CONTROL: el correo confirmado NO muestra el formulario", async () => {
    // Sin esta, «el formulario está en la página» pasaría por ser siempre
    // cierto, y las cuatro pruebas de arriba no medirían nada.
    mockToken.mockReturnValue("t".repeat(64));
    mockVerifyEmail.mockResolvedValue({ ok: true, email: "ana@example.com" });

    render(<VerifyEmailFlow />);

    expect(await screen.findByText(/¡listo!/i)).toBeInTheDocument();
    expect(campoCorreo()).not.toBeInTheDocument();
    expect(botonEnviar()).not.toBeInTheDocument();
  });
});

describe("VerifyEmailFlow · pedir otro enlace", () => {
  async function abrirVencido() {
    mockToken.mockReturnValue("t".repeat(64));
    mockVerifyEmail.mockRejectedValue(new ApiError(410, "gone"));
    render(<VerifyEmailFlow />);
    await screen.findByText(/el enlace expiró/i);
  }

  it("manda la dirección que se escribió y confirma sin filtrar nada", async () => {
    await abrirVencido();

    await userEvent.type(campoCorreo()!, "  Ana@Example.com  ");
    await userEvent.click(botonEnviar()!);

    await waitFor(() =>
      expect(mockResendVerification).toHaveBeenCalledWith("Ana@Example.com"),
    );

    // El mensaje habla en condicional. El servidor contesta 200 para toda
    // dirección —desconocida, ya confirmada, de Google— y una tarjeta que
    // dijera «te lo enviamos» a secas filtraría por la interfaz lo que el
    // servidor se cuida de no decir.
    const aviso = await screen.findByRole("status");
    expect(aviso).toHaveTextContent(/si ese correo tiene una cuenta/i);
    expect(aviso).toHaveTextContent(/24 horas/i);

    // El formulario se retira: no hay nada más que pulsar.
    expect(campoCorreo()).not.toBeInTheDocument();
  });

  it("un 429 dice que hay que esperar, que es el remedio de verdad", async () => {
    await abrirVencido();
    mockResendVerification.mockRejectedValue(
      new ApiError(429, "too many", "RATE_LIMIT_EXCEEDED"),
    );

    await userEvent.type(campoCorreo()!, "ana@example.com");
    await userEvent.click(botonEnviar()!);

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent(/varios enlaces en poco tiempo/i);
    // Y el formulario sigue ahí para reintentar.
    expect(campoCorreo()).toBeInTheDocument();
  });

  it("cualquier otro fallo no se disfraza de éxito", async () => {
    await abrirVencido();
    mockResendVerification.mockRejectedValue(new ApiError(500, "boom"));

    await userEvent.type(campoCorreo()!, "ana@example.com");
    await userEvent.click(botonEnviar()!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no pudimos procesar tu pedido/i,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
