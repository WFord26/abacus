import { InvoiceEditorPage } from "../../../../src/components/invoicing/invoice-editor-page";

export default function InvoiceDetailPage({
  params,
}: Readonly<{
  params: {
    invoiceId: string;
  };
}>) {
  return <InvoiceEditorPage invoiceId={params.invoiceId} />;
}
