import { requireStaffRole } from "@/lib/serverAuth";
import { redirect } from "next/navigation";
import NewStaffOrderClient from "./NewStaffOrderClient";
import { WebAuthScope } from "@/components/WebAuthScope";

export const metadata = {
  title: "New Staff Order - OMLU Staff",
};

export default async function NewStaffOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ tableId?: string; mode?: string }>;
}) {
  const staff = await requireStaffRole(["owner", "admin", "staff"]);
  const { tableId, mode } = await searchParams;
  const parsedTableId = tableId ? Number(tableId) : null;
  const initialTableId = parsedTableId !== null && Number.isFinite(parsedTableId) ? parsedTableId : null;
  if (!initialTableId) redirect("/staff/tables");

  return <WebAuthScope scope={staff.scope}><NewStaffOrderClient initialTableId={initialTableId} servedEntry={mode === "served"} /></WebAuthScope>;
}
