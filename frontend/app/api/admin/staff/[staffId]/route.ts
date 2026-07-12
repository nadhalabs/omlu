import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  const { staffId } = await params;
  return proxyAdminRequest(request, `/staff/${encodeURIComponent(staffId)}`);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  const { staffId } = await params;
  return proxyAdminRequest(request, `/staff/${encodeURIComponent(staffId)}`);
}
