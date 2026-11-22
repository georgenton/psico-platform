import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
/** Los demás parámetros de la URL, por clave. `token` va aparte, arriba. */
let mockOtros: Record<string, string> = {};

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (k: string) => (k === "token" ? mockToken() : (mockOtros[k] ?? null)),
  }),
}));

// El login sólo se monta para seguir su enlace: lo que haga al enviar —la
// acción de servidor, el botón de Google— no entra en esta prueba.
vi.mock("@/actions/auth", () => ({ loginAction: vi.fn() }));
vi.mock("@/components/auth/GoogleSignInButton", () => ({
  GoogleSignInButton: () => null,
}));
vi.mock("@/components/privacy/PrivacyInfoButton", () => ({
  PrivacyInfoButton: () => null,
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
const LoginForm = (await import("../login/_LoginForm")).default;

/** El formulario de reenvío, por su etiqueta accesible. */
const campoCorreo = () => screen.queryByLabelText("Tu correo");
const botonEnviar = () =>
  screen.queryByRole("button", { name: /pedir un enlace nuevo/i });

/**
 * Lo que la pantalla NO puede decir después de enviar: ni que salió un correo
 * —el servidor pudo retenerlo por el cupo, o el proveedor pudo fallar—, ni
 * nada sobre el estado de la cuenta, que el servidor se cuida de no revelar.
 */
const AFIRMA_ENVIO = /te (lo )?(enviamos|enviaremos|mandamos)/i;
const REVELA_CUENTA =
  /ya (est[áa]|estaba) confirmad|no existe|no (hay|tienes) (una )?cuenta|l[ií]mite|cupo|agot/i;

beforeEach(() => {
  vi.clearAllMocks();
  mockToken.mockReturnValue(null);
  mockOtros = {};
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

    // Confirma lo único que sabe —que la solicitud llegó— y el resto en
    // condicional. El servidor contesta 200 para toda dirección, y puede
    // haber retenido el envío por el cupo de la cuenta o por un fallo del
    // proveedor: afirmar «te enviamos un enlace» sería falso en esos casos, y
    // decir por qué no llegaría filtraría el estado de la cuenta.
    const aviso = await screen.findByRole("status");
    expect(aviso).toHaveTextContent(/recibimos tu solicitud/i);
    expect(aviso).toHaveTextContent(/si podemos procesarla/i);
    expect(aviso).toHaveTextContent(/24 horas/i);
    // Orienta sin revelar: la bandeja, el correo no deseado, y no repetir.
    expect(aviso).toHaveTextContent(/correo no deseado/i);
    expect(aviso).toHaveTextContent(/pediste otro enlace hace poco/i);
    expect(aviso.textContent).not.toMatch(AFIRMA_ENVIO);
    expect(aviso.textContent).not.toMatch(REVELA_CUENTA);

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

describe("VerifyEmailFlow · el mismo aviso pase lo que pase", () => {
  it("dos direcciones cualesquiera producen exactamente la misma pantalla", async () => {
    // El servidor no le dice al cliente qué pasó, y el cliente no debe
    // inventarlo: lo que se ve tras enviar no puede depender de la dirección.
    const avisoPara = async (email: string) => {
      mockToken.mockReturnValue("t".repeat(64));
      mockVerifyEmail.mockRejectedValue(new ApiError(410, "gone"));
      const { unmount } = render(<VerifyEmailFlow />);
      await screen.findByText(/el enlace expiró/i);
      await userEvent.type(campoCorreo()!, email);
      await userEvent.click(botonEnviar()!);
      const texto = (await screen.findByRole("status")).textContent;
      unmount();
      return texto;
    };

    const a = await avisoPara("existe-y-sin-confirmar@example.com");
    const b = await avisoPara("nadie-tiene-esta@example.com");
    expect(a).toBe(b);
  });

  it("ningún estado de la pantalla afirma un envío", async () => {
    // Los cinco textos fijos, antes de enviar nada. Cada caso declara su
    // título, para que un caso mal preparado —un token que gana a `resend`,
    // por ejemplo— no pase midiendo otra pantalla.
    const token = "t".repeat(64);
    const casos: Array<{
      titulo: RegExp;
      token: string | null;
      otros?: Record<string, string>;
      verificar?: () => void;
    }> = [
      { titulo: /confirma tu correo/i, token: null, otros: { resend: "1" } },
      {
        titulo: /el enlace expiró/i,
        token,
        verificar: () =>
          mockVerifyEmail.mockRejectedValue(new ApiError(410, "gone")),
      },
      {
        titulo: /enlace inválido/i,
        token,
        verificar: () =>
          mockVerifyEmail.mockRejectedValue(new ApiError(400, "bad")),
      },
      {
        titulo: /algo salió mal/i,
        token,
        verificar: () =>
          mockVerifyEmail.mockRejectedValue(new Error("red caída")),
      },
      { titulo: /enlace incompleto/i, token: null },
    ];
    for (const caso of casos) {
      mockToken.mockReturnValue(caso.token);
      mockOtros = caso.otros ?? {};
      caso.verificar?.();
      const { container, unmount } = render(<VerifyEmailFlow />);
      expect(await screen.findByText(caso.titulo)).toBeInTheDocument();
      expect(campoCorreo()).toBeInTheDocument();
      expect(container.textContent).not.toMatch(AFIRMA_ENVIO);
      expect(container.textContent).not.toMatch(REVELA_CUENTA);
      unmount();
    }
  });
});

describe("Entrada desde el login, para quien nunca recibió el correo", () => {
  it("el login enlaza al mismo formulario, y se llega siguiendo ese enlace", async () => {
    render(<LoginForm />);

    const enlace = screen.getByRole("link", { name: /pide otro enlace/i });
    const destino = new URL(enlace.getAttribute("href")!, "https://x.test");
    expect(destino.pathname).toBe("/verify-email");

    // La prueba no escribe la URL final: la toma del enlace del login.
    cleanup();
    mockToken.mockReturnValue(destino.searchParams.get("token"));
    mockOtros = Object.fromEntries(destino.searchParams.entries());
    render(<VerifyEmailFlow />);

    expect(await screen.findByText(/confirma tu correo/i)).toBeInTheDocument();
    expect(campoCorreo()).toBeInTheDocument();
    expect(botonEnviar()).toBeInTheDocument();
    // No le habla de un enlace que no tiene, ni intenta verificar nada.
    expect(screen.queryByText(/enlace incompleto/i)).not.toBeInTheDocument();
    expect(mockVerifyEmail).not.toHaveBeenCalled();

    // Y el formulario funciona igual desde aquí.
    await userEvent.type(campoCorreo()!, "nueva@example.com");
    await userEvent.click(botonEnviar()!);
    await waitFor(() =>
      expect(mockResendVerification).toHaveBeenCalledWith("nueva@example.com"),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      /recibimos tu solicitud/i,
    );
  });

  it("CONTROL: sin `resend`, el enlace sin token sigue siendo «incompleto»", async () => {
    // La entrada nueva no puede tragarse el caso del enlace partido.
    render(<VerifyEmailFlow />);
    expect(await screen.findByText(/enlace incompleto/i)).toBeInTheDocument();
    expect(screen.queryByText(/confirma tu correo/i)).not.toBeInTheDocument();
  });

  it("CONTROL: un token presente gana a `resend`", async () => {
    mockToken.mockReturnValue("t".repeat(64));
    mockOtros = { resend: "1" };
    mockVerifyEmail.mockResolvedValue({ ok: true, email: "ana@example.com" });

    render(<VerifyEmailFlow />);

    expect(await screen.findByText(/¡listo!/i)).toBeInTheDocument();
    expect(mockVerifyEmail).toHaveBeenCalledTimes(1);
  });
});
