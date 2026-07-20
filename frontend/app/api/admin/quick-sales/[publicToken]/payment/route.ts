import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

export async function POST(request: NextRequest, context: { params: Promise<{ publicToken: string }> }) {
  const { publicToken } = await context.params;
  return proxyAdminRequest(request, `/quick-sales/${encodeURIComponent(publicToken)}/payment`);
}
