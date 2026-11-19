/**
 * Una respuesta que llega tarde no puede describir el catálogo de ahora.
 *
 * ── El defecto, tal como lo encontró la revisión ──────────────────────────
 *
 * La nota «Por ahora una obra publicada» se decide con cuatro datos: vista,
 * búsqueda, categoría y total. Tres salían del estado vivo de la pantalla y el
 * cuarto —el total— de la última respuesta que llegara, fuera cual fuera la
 * consulta que la pidió.
 *
 * Basta con lo más corriente del mundo para romperlo: alguien busca algo que
 * devuelve **una** obra, borra la búsqueda, y la red entrega la respuesta de la
 * búsqueda DESPUÉS de la del catálogo. La pantalla queda con diez libros en la
 * rejilla y la frase «por ahora una obra publicada» encima — exactamente lo
 * contrario de lo que esa frase promete.
 *
 * No es hipotético por dos motivos: el rebote de 250 ms dispara una petición
 * por cada pausa al teclear, y **el montaje ya dispara dos** (al recibir las
 * categorías cambia la identidad de `load` y el efecto vuelve a correr). Hay
 * más peticiones en vuelo de las que parece.
 *
 * ── Cómo se reproduce sin depender de la red ──────────────────────────────
 *
 * El doble responde **según la consulta**, no según el orden de llamada: la
 * del catálogo devuelve una promesa ya resuelta con diez obras, y la de
 * búsqueda una que esta prueba resuelve al final, con una. Así el orden de
 * llegada queda invertido por construcción y no por un temporizador.
 */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { CATALOGO_UNA_OBRA_NOTA } from "@psico/types";

const mockList = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock("@psico/api-client", () => ({
  booksApi: {
    list: (...args: unknown[]) => mockList(...args),
  },
}));

jest.mock("@/context/auth", () => ({
  useAuth: () => ({ user: { id: "u1", plan: "FREE" } }),
}));

import BooksScreen from "./index";

const PLACEHOLDER = "Buscar libros, autores…";

function libro(n: number) {
  return {
    id: `b${n}`,
    slug: `libro-${n}`,
    title: `Libro ${n}`,
    subtitle: null,
    cover: "verde",
    coverArtUrl: null,
    author: { id: "a1", name: "Alguien", avatarUrl: null },
    category: { id: "c1", name: "Cat", slug: "cat" },
    totalChapters: 1,
    durationMinutes: 10,
    plan: "FREE",
    progress: null,
    isFavorite: false,
    isBookmarked: false,
    rating: null,
    publishedAt: "2026-01-01T00:00:00.000Z",
  };
}

function respuesta(n: number) {
  return {
    books: Array.from({ length: n }, (_, i) => libro(i + 1)),
    categories: [{ id: "c1", name: "Cat", slug: "cat", bookCount: n }],
    pagination: { page: 1, pageSize: 20, total: n, totalPages: 1 },
  };
}

/** Una promesa cuyo momento de resolución decide la prueba. */
function diferida<T>() {
  let resolver!: (v: T) => void;
  const promesa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

describe("Biblioteca móvil · una respuesta antigua no describe el catálogo actual", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("el catálogo de diez sobrevive a la búsqueda de una que llega después", async () => {
    const busqueda = diferida<ReturnType<typeof respuesta>>();
    // El catálogo contesta al momento; la búsqueda, cuando esta prueba quiera.
    mockList.mockImplementation((q: { q?: string } | undefined) =>
      q?.q ? busqueda.promesa : Promise.resolve(respuesta(10)),
    );

    const pantalla = render(<BooksScreen />);
    await waitFor(() => expect(pantalla.queryByText("Libro 10")).toBeTruthy());
    expect(pantalla.queryByText(CATALOGO_UNA_OBRA_NOTA)).toBeNull();

    jest.useFakeTimers();
    // Se busca algo…
    fireEvent.changeText(pantalla.getByPlaceholderText(PLACEHOLDER), "ensambl");
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    // …y se borra antes de que llegue su respuesta.
    fireEvent.changeText(pantalla.getByPlaceholderText(PLACEHOLDER), "");
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    jest.useRealTimers();
    await act(async () => {});

    // Las dos consultas salieron de verdad: sin esto la prueba sería vacua.
    const consultas = mockList.mock.calls.map(
      (c) => c[0] as { q?: string } | undefined,
    );
    expect(consultas.some((q) => q?.q === "ensambl")).toBe(true);

    // Y ahora llega la respuesta de la búsqueda, tarde. Éste es el orden que
    // rompía la pantalla.
    await act(async () => {
      busqueda.resolver(respuesta(1));
    });

    // La nota NO aparece: el catálogo vigente tiene diez obras.
    expect(pantalla.queryByText(CATALOGO_UNA_OBRA_NOTA)).toBeNull();
    // Y la rejilla tampoco se queda con el único resultado de la búsqueda.
    expect(pantalla.queryByText("Libro 10")).toBeTruthy();
  });

  it("control contrario: un catálogo que de verdad tiene una obra sí lo dice", async () => {
    mockList.mockResolvedValue(respuesta(1));

    const pantalla = render(<BooksScreen />);

    await waitFor(() =>
      expect(pantalla.queryByText(CATALOGO_UNA_OBRA_NOTA)).toBeTruthy(),
    );
  });

  it("y una búsqueda vigente con un resultado NO dispara la nota", async () => {
    // El otro lado de la regla compartida, que esta pantalla ya respetaba:
    // un uno que viene de un filtro no es un catálogo de una obra.
    mockList.mockImplementation((q: { q?: string } | undefined) =>
      Promise.resolve(q?.q ? respuesta(1) : respuesta(10)),
    );

    const pantalla = render(<BooksScreen />);
    await waitFor(() => expect(pantalla.queryByText("Libro 10")).toBeTruthy());

    jest.useFakeTimers();
    fireEvent.changeText(pantalla.getByPlaceholderText(PLACEHOLDER), "ensambl");
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    jest.useRealTimers();
    await act(async () => {});

    expect(pantalla.queryByText("Libro 1")).toBeTruthy();
    expect(pantalla.queryByText(CATALOGO_UNA_OBRA_NOTA)).toBeNull();
  });
});
