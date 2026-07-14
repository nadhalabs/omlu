import { requireStaffRole } from "@/lib/serverAuth";
import NewStaffOrderClient from "./NewStaffOrderClient";

export const metadata = {
  title: "New Staff Order - Nadha Serve",
};

export default async function NewStaffOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ tableId?: string }>;
}) {
  await requireStaffRole(["owner", "admin", "staff"]);
  const { tableId } = await searchParams;
  const parsedTableId = tableId ? Number(tableId) : null;
  const initialTableId = parsedTableId !== null && Number.isFinite(parsedTableId) ? parsedTableId : null;

  return <NewStaffOrderClient initialTableId={initialTableId} />;
}
