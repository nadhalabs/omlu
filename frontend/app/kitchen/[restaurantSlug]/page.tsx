import KitchenDashboardClient from "./KitchenDashboardClient";

type Params = Promise<{ restaurantSlug: string }>;

interface PageProps {
  params: Params;
}

export default async function KitchenPage({ params }: PageProps) {
  const { restaurantSlug } = await params;
  return <KitchenDashboardClient restaurantSlug={restaurantSlug} />;
}
