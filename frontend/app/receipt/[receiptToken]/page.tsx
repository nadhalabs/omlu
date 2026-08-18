import BillClient from "../../bill/[sessionToken]/BillClient";

type Params = Promise<{ receiptToken: string }>;

export default async function PublicReceiptPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ quickSale?: string }>;
}) {
  const { receiptToken } = await params;
  const { quickSale } = await searchParams;
  return (
    <BillClient
      sessionToken={receiptToken}
      receiptToken={receiptToken}
      quickSale={quickSale === "1"}
      publicReceipt
    />
  );
}
