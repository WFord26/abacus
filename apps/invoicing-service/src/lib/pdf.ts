import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { InvoiceDetail } from "@wford26/shared-types";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value);
}

export async function renderInvoicePdf(invoice: InvoiceDetail): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const titleColor = rgb(0.09, 0.2, 0.55);
  let y = 740;

  page.drawText("Abacus Invoice", {
    color: titleColor,
    font: bold,
    size: 24,
    x: 48,
    y,
  });

  y -= 34;
  page.drawText(invoice.invoiceNumber, {
    font: bold,
    size: 18,
    x: 48,
    y,
  });
  page.drawText(invoice.status.toUpperCase(), {
    color: rgb(0.4, 0.45, 0.55),
    font: regular,
    size: 11,
    x: 470,
    y: y + 4,
  });

  y -= 36;
  page.drawText("Bill to", {
    color: titleColor,
    font: bold,
    size: 11,
    x: 48,
    y,
  });
  page.drawText("Invoice details", {
    color: titleColor,
    font: bold,
    size: 11,
    x: 330,
    y,
  });

  y -= 18;
  page.drawText(invoice.customer?.name ?? "No customer selected", {
    font: bold,
    size: 14,
    x: 48,
    y,
  });
  const addressLines = [
    invoice.customer?.email ?? null,
    invoice.customer?.phone ?? null,
    invoice.customer?.address
      ? Object.values(invoice.customer.address)
          .filter((value): value is string => Boolean(value))
          .join(", ")
      : null,
  ].filter((value): value is string => Boolean(value));
  let customerY = y - 16;

  for (const line of addressLines) {
    page.drawText(line, {
      font: regular,
      size: 10,
      x: 48,
      y: customerY,
    });
    customerY -= 14;
  }

  const metaLines = [
    `Issue date: ${invoice.issueDate ?? "Not set"}`,
    `Due date: ${invoice.dueDate ?? "Not set"}`,
    `Tax rate: ${invoice.taxRate.toFixed(2)}%`,
  ];
  let metaY = y;

  for (const line of metaLines) {
    page.drawText(line, {
      font: regular,
      size: 10,
      x: 330,
      y: metaY,
    });
    metaY -= 16;
  }

  y = Math.min(customerY, metaY) - 18;
  page.drawLine({
    color: rgb(0.87, 0.89, 0.94),
    end: { x: 564, y },
    start: { x: 48, y },
    thickness: 1,
  });

  y -= 24;
  page.drawText("Description", {
    font: bold,
    size: 10,
    x: 48,
    y,
  });
  page.drawText("Qty", {
    font: bold,
    size: 10,
    x: 348,
    y,
  });
  page.drawText("Unit", {
    font: bold,
    size: 10,
    x: 418,
    y,
  });
  page.drawText("Amount", {
    font: bold,
    size: 10,
    x: 500,
    y,
  });

  y -= 18;
  for (const line of invoice.lineItems) {
    page.drawText(line.description, {
      font: regular,
      size: 11,
      x: 48,
      y,
    });
    page.drawText(String(line.quantity), {
      font: regular,
      size: 11,
      x: 348,
      y,
    });
    page.drawText(formatCurrency(line.unitPrice), {
      font: regular,
      size: 11,
      x: 418,
      y,
    });
    page.drawText(formatCurrency(line.amount), {
      font: regular,
      size: 11,
      x: 500,
      y,
    });
    y -= 18;
  }

  y -= 12;
  page.drawLine({
    color: rgb(0.87, 0.89, 0.94),
    end: { x: 564, y },
    start: { x: 300, y },
    thickness: 1,
  });
  y -= 18;

  const totals: Array<[string, string]> = [
    ["Subtotal", formatCurrency(invoice.subtotal)],
    ["Tax", formatCurrency(invoice.tax)],
    ["Total", formatCurrency(invoice.total)],
  ];

  for (const [label, value] of totals) {
    page.drawText(label, {
      font: label === "Total" ? bold : regular,
      size: 11,
      x: 380,
      y,
    });
    page.drawText(value, {
      font: label === "Total" ? bold : regular,
      size: 11,
      x: 500,
      y,
    });
    y -= 18;
  }

  if (invoice.notes) {
    y -= 12;
    page.drawText("Notes", {
      color: titleColor,
      font: bold,
      size: 11,
      x: 48,
      y,
    });
    y -= 16;
    page.drawText(invoice.notes, {
      font: regular,
      maxWidth: 516,
      size: 10,
      x: 48,
      y,
    });
  }

  return Buffer.from(await pdf.save());
}
