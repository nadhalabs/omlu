import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  return proxyAdminRequest(request, `/gst/sales-register?${searchParams.toString()}`);
}
