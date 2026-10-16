import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OBRAS, OFERTA, PREGUNTAS } from "./datos";
import { Landing } from "./Landing";

/**
 * Lo que la landing pública NO puede volver a afirmar.
 *
 * La página implementa la referencia aprobada F2.1, y esa referencia es
 * deliberadamente honesta en los sitios donde una landing suele prometer de
 * más. Esta prueba fija ese comportamiento, no la maquetación: si alguien
 * reactiva una compra, inventa una sinopsis o devuelve un título de la maqueta
 * de septiembre al catálogo, falla aquí.
 *
 * No comprueba píxeles. De eso se encarga el paquete de revisión visual, que
 * compara contra la referencia a los mismos tamaños.
 */

describe("el catálogo es el confirmado, no el de la maqueta", () => {
  it("son las tres obras confirmadas, con su autoría", () => {
    expect(OBRAS.map((o) => o.titulo)).toEqual([
      "Emociones en construcción",
      "Familias ensambladas",
      "Parejas que perduran",
    ]);
    expect(OBRAS.map((o) => o.autoria)).toEqual([
      "Jorge Quizamanchuro",
      "Jorge Quizamanchuro",
      "David Jaramillo",
    ]);
  });

  it("los títulos sólo de la maqueta de septiembre no están", () => {
    const titulos = OBRAS.map((o) => o.titulo);
    // «Parejas que perdonan» y «Crianza digital» se conservan como historia,
    // no como catálogo autorizado. Y «perduran» no hereda nada de «perdonan»:
    // no se ha demostrado que sean la misma obra.
    expect(titulos).not.toContain("Parejas que perdonan");
    expect(titulos).not.toContain("Crianza digital");
  });

  it("una obra sin presentación verificada no la inventa", () => {
    const perduran = OBRAS.find((o) => o.id === "parejas-que-perduran");
    expect(perduran).toBeDefined();
    // Sin frase y sin temas: describir de qué trata un libro a partir de su
    // título es exactamente lo que el encargo prohíbe.
    expect(perduran?.frase).toBeNull();
    expect(perduran?.explora).toHaveLength(0);
  });

  it("la disponibilidad se dice en términos de quien visita", () => {
    // «Estado por confirmar» describía al equipo. Lo que necesita saber quien
    // mira es si puede usarla ahora.
    expect(OBRAS.map((o) => o.disponibilidad)).toEqual([
      "probar-aqui",
      "aun-no",
      "aun-no",
    ]);
  });
});

describe("la oferta se presenta como propuesta, sin vender", () => {
  it("lo que falta por decidir se dice, no se rellena", () => {
    // «por definir» en cualquier parte de la fila, porque unas lo dicen solas
    // («Por definir») y otras dentro de la frase («cuantía por definir»).
    const porDefinir = OFERTA.comparacion.filter((f) =>
      `${f.unLibro} ${f.catalogo}`.toLowerCase().includes("por definir"),
    );
    // Duración del acceso, Eco, Dúo y Círculos, renovación, cancelación e
    // impuestos: son las seis condiciones que bloquean abrir cobros.
    expect(porDefinir.map((f) => f.concepto)).toEqual([
      "Duración del acceso",
      "Eco",
      "Dúo y Círculos",
      "Renovación",
      "Cancelación y cambios",
      "Impuestos y otros cargos",
    ]);
  });

  it("las preguntas sobre planes dicen que no admite compras", () => {
    const sobreCompras = PREGUNTAS.filter((q) =>
      q.respuesta.includes("no admite compras"),
    );
    expect(sobreCompras.length).toBeGreaterThanOrEqual(2);
  });
});

describe("la página servida", () => {
  it("avisa de que los precios son una propuesta y no hay compra", () => {
    render(<Landing />);
    expect(
      screen.getByText(/Propuesta de precios · No disponible para compra/),
    ).toBeInTheDocument();
  });

  it("no ofrece ninguna acción de compra", () => {
    const { container } = render(<Landing />);
    const texto = container.textContent ?? "";
    for (const prohibido of [
      "Comprar",
      "Pagar ahora",
      "Suscribirme",
      "Añadir al carrito",
    ]) {
      expect(texto).not.toContain(prohibido);
    }
  });

  it("no finge navegación con enlaces vacíos", () => {
    const { container } = render(<Landing />);
    expect(container.querySelectorAll('a[href="#"]')).toHaveLength(0);
  });

  it("marca «En preparación» los destinos que todavía no existen", () => {
    const { container } = render(<Landing />);
    // Sobre FeelVerse, Autoría y contenidos, Contacto, Privacidad y Términos.
    expect(container.querySelectorAll(".pend").length).toBe(5);
  });

  it("dice que no sustituye la atención profesional", () => {
    const { container } = render(<Landing />);
    expect((container.textContent ?? "").toLowerCase()).toContain(
      "no sustituye la atención profesional",
    );
  });

  it("muestra la autoría de cada obra confirmada", () => {
    render(<Landing />);
    // Dos veces cada autoría de Jorge (dos obras) y una la de David.
    expect(
      screen.getAllByText("Jorge Quizamanchuro").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByText("David Jaramillo").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("el contenido de los datos viaja en el marcado, sin depender de JavaScript", () => {
    const { container } = render(<Landing />);
    const texto = container.textContent ?? "";
    // En el prototipo esto lo pintaba JavaScript sobre contenedores vacíos.
    expect(texto).toContain("Parejas que perduran");
    expect(texto).toContain(OFERTA.pase.importe);
    expect(texto).toContain(PREGUNTAS[0].pregunta);
  });

  it("declara un único landmark principal", () => {
    const { container } = render(<Landing />);
    expect(container.querySelectorAll("main")).toHaveLength(1);
  });

  it("no publica vocabulario de trabajo interno", () => {
    const { container } = render(<Landing />);
    // El texto de los diálogos cuenta: vive en el documento aunque estén
    // cerrados, y una nota interna escondida en una ficha es igual de pública.
    const todo = (container.textContent ?? "").toLowerCase();
    const anclas = [...container.querySelectorAll("[aria-label]")]
      .map((e) => e.getAttribute("aria-label") ?? "")
      .join(" ")
      .toLowerCase();

    for (const frase of [
      "la ficha publicada",
      "ficha de demostración",
      "cubierta conceptual",
      "cubiertas conceptuales",
      "estado por confirmar",
      "portada pendiente",
      "autor por confirmar",
    ]) {
      expect(`${todo} ${anclas}`).not.toContain(frase);
    }
  });

  it("dice si una obra se puede usar ahora o todavía no", () => {
    const { container } = render(<Landing />);
    const texto = container.textContent ?? "";
    expect(texto).toContain("Puedes probarla en esta página");
    expect(texto).toContain("Aún no disponible");
  });
});
