import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ importId: string }> },
) {
  const { importId } = await params;
  return proxyAdminRequest(request, `/menu-imports/${encodeURIComponent(importId)}/confirm`);
}

