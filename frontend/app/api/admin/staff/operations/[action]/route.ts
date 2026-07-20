import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  if (!(["lock", "unlock", "status"] as string[]).includes(action)) return new Response(null, { status: 404 });
  return proxyAdminRequest(request, `/staff/operations/${action}`);
}
