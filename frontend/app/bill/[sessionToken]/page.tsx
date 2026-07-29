import BillClient from "./BillClient";

type Params = Promise<{ sessionToken: string }>;

interface PageProps {
  params: Params;
  searchParams: Promise<{ receipt?: string }>;
}

export default async function BillPage({ params, searchParams }: PageProps) {
  const { sessionToken } = await params;
  const { receipt } = await searchParams;
  return <BillClient sessionToken={sessionToken} receiptToken={receipt} />;
}
