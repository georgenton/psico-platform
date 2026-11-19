import { TOUR_ROUTE, tourFitsRoute } from "./tour-route";

describe("tourFitsRoute · dónde corre el tour en móvil", () => {
  it("corre en Inicio", () => {
    expect(tourFitsRoute(TOUR_ROUTE)).toBe(true);
    expect(tourFitsRoute("/")).toBe(true);
  });

  it("no corre en el libro, que es donde aterriza quien elige uno", () => {
    expect(tourFitsRoute("/books/emociones-en-construccion")).toBe(false);
    expect(
      tourFitsRoute("/books/emociones-en-construccion/lector/1"),
    ).toBe(false);
  });

  it("ni en ninguna otra pestaña", () => {
    for (const ruta of ["/reflexiones", "/eco", "/plan", "/mapa", "/patrones"]) {
      expect(tourFitsRoute(ruta)).toBe(false);
    }
  });

  it("sin ruta no corre — y eso es lo seguro: el tour espera", () => {
    expect(tourFitsRoute(null)).toBe(false);
    expect(tourFitsRoute(undefined)).toBe(false);
    expect(tourFitsRoute("")).toBe(false);
  });

  it("una ruta que sólo EMPIEZA por la de Inicio no cuenta", () => {
    // El control que distingue comparar de «empieza por»: con `startsWith("/")`
    // toda la aplicación sería Inicio y el arreglo no haría nada.
    expect(tourFitsRoute("/books")).toBe(false);
    expect(tourFitsRoute("/eco")).toBe(false);
  });
});
