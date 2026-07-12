import KitchenDashboardClient from "./KitchenDashboardClient";
import { requireStaffRole } from "@/lib/serverAuth";

type Params = Promise<{ restaurantSlug: string }>;

interface PageProps {
  params: Params;
}

export default async function KitchenPage({ params }: PageProps) {
  const { restaurantSlug } = await params;
  await requireStaffRole(["owner", "admin", "kitchen"]);
  return <KitchenDashboardClient restaurantSlug={restaurantSlug} />;
}
