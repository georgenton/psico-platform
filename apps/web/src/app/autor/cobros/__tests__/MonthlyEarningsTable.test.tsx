import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AuthorMonthlyRevenueRow } from "@psico/types";
import { MonthlyEarningsTable } from "../MonthlyEarningsTable";

function row(
  overrides: Partial<AuthorMonthlyRevenueRow> = {},
): AuthorMonthlyRevenueRow {
  return {
    month: new Date(Date.UTC(2026, 0, 1)),
    grossCents: 10000,
    platformFeeCents: 3000,
    netCents: 7000,
    status: "PAID",
    paidAt: new Date(Date.UTC(2026, 1, 5)),
    paymentReference: "TX-001",
    ...overrides,
  };
}

describe("MonthlyEarningsTable", () => {
  it("renders empty state when no rows", () => {
    render(<MonthlyEarningsTable rows={[]} />);
    expect(
      screen.getByText(/Aún no tienes earnings registrados/i),
    ).toBeInTheDocument();
  });

  it("renders header columns when rows exist", () => {
    render(<MonthlyEarningsTable rows={[row()]} />);
    expect(screen.getByText("Mes")).toBeInTheDocument();
    expect(screen.getByText("Bruto")).toBeInTheDocument();
    expect(screen.getByText("Comisión")).toBeInTheDocument();
    expect(screen.getByText("Neto")).toBeInTheDocument();
    expect(screen.getByText("Estado")).toBeInTheDocument();
  });

  it("formats USD amounts as currency", () => {
    render(<MonthlyEarningsTable rows={[row()]} />);
    // 10000 cents → $100.00 in es-EC locale
    expect(screen.getByText(/100[,.]00/)).toBeInTheDocument();
    // net 7000 cents → $70.00
    expect(screen.getByText(/70[,.]00/)).toBeInTheDocument();
  });

  it("renders PAID status with sage badge", () => {
    render(<MonthlyEarningsTable rows={[row({ status: "PAID" })]} />);
    expect(screen.getByText("PAID")).toBeInTheDocument();
  });

  it("renders PENDING status with warm badge", () => {
    render(<MonthlyEarningsTable rows={[row({ status: "PENDING" })]} />);
    expect(screen.getByText("PENDING")).toBeInTheDocument();
  });

  it("shows payment reference when present", () => {
    render(
      <MonthlyEarningsTable rows={[row({ paymentReference: "TX-ABC-123" })]} />,
    );
    expect(screen.getByText(/TX-ABC-123/)).toBeInTheDocument();
  });

  it("hides reference when null", () => {
    render(
      <MonthlyEarningsTable rows={[row({ paymentReference: null })]} />,
    );
    expect(screen.queryByText(/Ref:/)).not.toBeInTheDocument();
  });

  it("renders multiple rows", () => {
    const rows = [
      row({ month: new Date(Date.UTC(2026, 0, 1)), netCents: 11100 }),
      row({ month: new Date(Date.UTC(2025, 11, 1)), netCents: 22200 }),
    ];
    render(<MonthlyEarningsTable rows={rows} />);
    // Both rows render distinct net amounts
    expect(screen.getByText(/111[,.]00/)).toBeInTheDocument();
    expect(screen.getByText(/222[,.]00/)).toBeInTheDocument();
  });
});
