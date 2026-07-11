import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

type Params = Promise<{ tableId: string }>;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params }
) {
  const { tableId } = await params;
  return proxyAdminRequest(request, `/tables/${encodeURIComponent(tableId)}`);
}
