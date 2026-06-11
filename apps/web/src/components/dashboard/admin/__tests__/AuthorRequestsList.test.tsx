import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PulsoAuthorRequestListResponse } from "@psico/types";
import { AuthorRequestsList } from "../AuthorRequestsList";

vi.mock("@/app/dashboard/admin/author-requests/actions", () => ({
  approveAuthorRequestAction: vi.fn(),
  rejectAuthorRequestAction: vi.fn(),
}));

function makeRow(
  overrides: Partial<PulsoAuthorRequestListResponse["items"][number]> = {},
): PulsoAuthorRequestListResponse["items"][number] {
  return {
    id: "r1",
    bookId: "b1",
    reviewState: "PENDING",
    submittedAt: new Date("2026-06-10T12:00:00Z"),
    reviewedAt: null,
    feedback: null,
    book: {
      id: "b1",
      title: "Mi libro de prueba",
      subtitle: null,
      summary:
        "Un resumen suficientemente largo para mostrar la metadata del libro al admin.",
      cover: "warm",
      coverArtUrl: null,
      status: "IN_REVIEW",
      language: "es",
      categoryId: null,
      chapters: 5,
      author: {
        id: "u1",
        email: "autor@psico.com",
        name: "Alice",
      },
    },
    ...overrides,
  };
}

describe("AuthorRequestsList", () => {
  it("empty state — PENDING", () => {
    render(
      <AuthorRequestsList
        data={{ total: 0, items: [] }}
        status="PENDING"
      />,
    );
    expect(screen.getByText(/Pulso al día/i)).toBeInTheDocument();
  });

  it("empty state — ALL", () => {
    render(
      <AuthorRequestsList data={{ total: 0, items: [] }} status="ALL" />,
    );
    expect(screen.getByText(/Aún no hay pedidos/i)).toBeInTheDocument();
  });

  it("renders row metadata + actions when PENDING", () => {
    render(
      <AuthorRequestsList
        data={{ total: 1, items: [makeRow()] }}
        status="PENDING"
      />,
    );
    expect(screen.getByText("Mi libro de prueba")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("autor@psico.com")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText(/PENDING/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Aprobar y publicar/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Rechazar/i }),
    ).toBeInTheDocument();
  });

  it("hides actions when row is APPROVED or REJECTED", () => {
    render(
      <AuthorRequestsList
        data={{
          total: 1,
          items: [makeRow({ reviewState: "APPROVED" })],
        }}
        status="ALL"
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Aprobar/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Rechazar/i }),
    ).not.toBeInTheDocument();
  });

  it("surfaces feedback when rejected", () => {
    render(
      <AuthorRequestsList
        data={{
          total: 1,
          items: [
            makeRow({
              reviewState: "REJECTED",
              feedback: "El libro necesita mejor cierre.",
            }),
          ],
        }}
        status="ALL"
      />,
    );
    expect(
      screen.getByText(/El libro necesita mejor cierre/i),
    ).toBeInTheDocument();
  });

  it("shows fallback when summary is null", () => {
    render(
      <AuthorRequestsList
        data={{
          total: 1,
          items: [makeRow({ book: { ...makeRow().book, summary: null } })],
        }}
        status="ALL"
      />,
    );
    expect(screen.getByText(/Sin resumen/i)).toBeInTheDocument();
  });
});
