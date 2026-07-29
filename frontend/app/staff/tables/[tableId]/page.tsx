import { requireStaffRole } from "@/lib/serverAuth";
import StaffTableDetailClient from "./StaffTableDetailClient";
import { WebAuthScope } from "@/components/WebAuthScope";

export default async function StaffTableDetailPage({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  const staff = await requireStaffRole(["owner", "admin", "staff"]);
  const { tableId } = await params;
  return <WebAuthScope scope={staff.scope}><StaffTableDetailClient tableId={Number(tableId)} /></WebAuthScope>;
}
