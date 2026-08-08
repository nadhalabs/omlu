import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  return proxyAdminRequest(request, `/gst/export/ca-package?${searchParams.toString()}`, { isBinary: true });
}
