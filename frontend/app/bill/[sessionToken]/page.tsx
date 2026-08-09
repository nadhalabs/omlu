import BillClient from "./BillClient";

type Params = Promise<{ sessionToken: string }>;

interface PageProps {
  params: Params;
  searchParams: Promise<{ receipt?: string; quickSale?: string }>;
}

export default async function BillPage({ params, searchParams }: PageProps) {
  const { sessionToken } = await params;
  const { receipt, quickSale } = await searchParams;
  return <BillClient sessionToken={sessionToken} receiptToken={receipt} quickSale={quickSale === "1"} />;
}
