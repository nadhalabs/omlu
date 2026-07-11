import { NextRequest } from "next/server";
import { proxyAdminRequest } from "@/lib/proxyHelper";

export async function GET(request: NextRequest) {
  return proxyAdminRequest(request, "/tables");
}

export async function POST(request: NextRequest) {
  return proxyAdminRequest(request, "/tables");
}
