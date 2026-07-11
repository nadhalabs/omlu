import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

type Params = Promise<{ itemId: string }>;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params }
) {
  const { itemId } = await params;
  return proxyAdminRequest(request, `/menu-items/${encodeURIComponent(itemId)}`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Params }
) {
  const { itemId } = await params;
  return proxyAdminRequest(request, `/menu-items/${encodeURIComponent(itemId)}`);
}
