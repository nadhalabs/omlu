import { requireStaffRole } from "@/lib/serverAuth";
import StaffTableDetailClient from "./StaffTableDetailClient";

export default async function StaffTableDetailPage({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  await requireStaffRole(["owner", "admin", "staff"]);
  const { tableId } = await params;
  return <StaffTableDetailClient tableId={Number(tableId)} />;
}
