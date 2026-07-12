import BillClient from "./BillClient";

type Params = Promise<{ sessionToken: string }>;

interface PageProps {
  params: Params;
}

export default async function BillPage({ params }: PageProps) {
  const { sessionToken } = await params;
  return <BillClient sessionToken={sessionToken} />;
}
