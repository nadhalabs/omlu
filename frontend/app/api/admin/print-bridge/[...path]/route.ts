import { NextRequest, NextResponse } from "next/server";
import { backendUrl } from "@/lib/backendUrl";

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const token = request.cookies.get("staff_token")?.value;
  if (!token) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const { path } = await context.params;
  const target = backendUrl(`/api/admin/print-bridge/${path.map(encodeURIComponent).join("/")}`);
  const response = await fetch(target, {
    method: request.method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: request.method === "GET" ? undefined : await request.text(),
    cache: "no-store",
  });
  const body = await response.text();
  return new NextResponse(body, { status: response.status, headers: { "Content-Type": response.headers.get("content-type") || "application/json" } });
}

export const GET = proxy;
export const POST = proxy;
