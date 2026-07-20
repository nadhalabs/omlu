import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

export async function POST(request: NextRequest, context: { params: Promise<{ staffId: string; action: string }> }) {
  const { staffId, action } = await context.params;
  if (!/^\d+$/.test(staffId) || (action !== "lock" && action !== "unlock")) return new Response(null, { status: 404 });
  return proxyAdminRequest(request, `/staff/${staffId}/${action}`);
}
