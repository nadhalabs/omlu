import OrderTrackingClient from "./OrderTrackingClient";

type Params = Promise<{ publicToken: string }>;

interface PageProps {
  params: Params;
}

export default async function OrderPage({ params }: PageProps) {
  const { publicToken } = await params;
  return <OrderTrackingClient publicToken={publicToken} />;
}
