import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

export async function POST(request: NextRequest) {
  return proxyAdminRequest(request, "/menu/options");
}
