import KitchenDashboardClient from "./KitchenDashboardClient";
import { requireStaffRole } from "@/lib/serverAuth";
import { WebAuthScope } from "@/components/WebAuthScope";

type Params = Promise<{ restaurantSlug: string }>;

interface PageProps {
  params: Params;
}

export default async function KitchenPage({ params }: PageProps) {
  const { restaurantSlug } = await params;
  const staff = await requireStaffRole(["owner", "admin", "kitchen"]);
  return <WebAuthScope scope={staff.scope}><KitchenDashboardClient restaurantSlug={restaurantSlug} /></WebAuthScope>;
}
