import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  const { staffId } = await params;
  return proxyAdminRequest(request, `/staff/${encodeURIComponent(staffId)}/sessions/revoke`);
}
