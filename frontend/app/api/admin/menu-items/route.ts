import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

export async function GET(request: NextRequest) {
  const { search } = new URL(request.url);
  return proxyAdminRequest(request, `/menu-items${search}`);
}

export async function POST(request: NextRequest) {
  return proxyAdminRequest(request, "/menu-items");
}
