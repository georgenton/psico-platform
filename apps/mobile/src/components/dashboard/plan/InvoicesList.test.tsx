import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";
import type {
  InvoiceListResponse,
  InvoiceStatus,
  InvoiceSummary,
} from "@psico/types";
import { InvoicesList } from "./InvoicesList";

function invoice(overrides: Partial<InvoiceSummary> = {}): InvoiceSummary {
  return {
    id: "in_1",
    date: "2026-05-01T10:00:00.000Z",
    amount: 700, // 7.00 USD in cents
    currency: "USD",
    status: "paid" as InvoiceStatus,
    pdfUrl: "https://stripe.example.com/invoice/in_1.pdf",
    ...overrides,
  } as InvoiceSummary;
}

function buildResponse(invoices: InvoiceSummary[] = []): InvoiceListResponse {
  return { invoices } as InvoiceListResponse;
}

describe("InvoicesList (mobile)", () => {
  it("renders nothing when the prop is null", () => {
    const { toJSON } = render(<InvoicesList invoices={null} />);
    // The component returns `null` — RNTL renders nothing.
    expect(toJSON()).toBeNull();
  });

  it("renders the empty state copy when there are zero invoices", () => {
    render(<InvoicesList invoices={buildResponse([])} />);
    expect(screen.getByText("Facturas")).toBeOnTheScreen();
    expect(screen.getByText(/Aún no hay facturas/i)).toBeOnTheScreen();
  });

  it("renders one row per invoice with its amount + status", () => {
    // `amount` is in MAJOR units (dollars, not cents) per InvoiceSummary
    // type doc. Pro is $7/mo, Annual is $59/yr.
    render(
      <InvoicesList
        invoices={buildResponse([
          invoice({ id: "in_1", amount: 7, status: "paid" as InvoiceStatus }),
          invoice({ id: "in_2", amount: 59, status: "open" as InvoiceStatus }),
        ])}
      />,
    );
    // es-EC currency format yields `$7,00` or `$7.00` depending on Node's
    // ICU build. Match either separator.
    expect(screen.getByText(/7[.,]00/)).toBeOnTheScreen();
    expect(screen.getByText(/59[.,]00/)).toBeOnTheScreen();
  });

  it("opens the PDF url with Linking.openURL when the row's button is pressed", () => {
    const spy = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValue(undefined as never);
    render(
      <InvoicesList
        invoices={buildResponse([
          invoice({
            id: "in_1",
            pdfUrl: "https://stripe.example.com/invoice/in_1.pdf",
          }),
        ])}
      />,
    );
    fireEvent.press(screen.getByText("PDF"));
    expect(spy).toHaveBeenCalledWith(
      "https://stripe.example.com/invoice/in_1.pdf",
    );
    spy.mockRestore();
  });

  it("omits the PDF button when pdfUrl is null", () => {
    render(
      <InvoicesList
        invoices={buildResponse([invoice({ id: "in_1", pdfUrl: null })])}
      />,
    );
    expect(screen.queryByText("PDF")).toBeNull();
  });
});
