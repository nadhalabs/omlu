import { NextRequest, NextResponse } from "next/server";
import { backendUrl, getBackendBaseUrl } from "@/lib/backendUrl";

async function proxyStaffTableRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const tokenCookie = request.cookies.get("staff_token");
  if (!tokenCookie?.value) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }
  const { path } = await params;
  const targetUrl = new URL(backendUrl(`/staff/tables/${path.map(encodeURIComponent).join("/")}`));
  request.nextUrl.searchParams.forEach((value, key) => targetUrl.searchParams.set(key, value));
  const headers: HeadersInit = { Authorization: `Bearer ${tokenCookie.value}` };
  let body: string | undefined;
  if (request.method === "POST") {
    headers["Content-Type"] = "application/json";
    body = await request.text();
  }
  try {
    const res = await fetch(targetUrl.toString(), { method: request.method, headers, body, cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    return NextResponse.json({ detail: `Could not connect to the backend server at ${getBackendBaseUrl()}. ${message}` }, { status: 500 });
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyStaffTableRequest(request, context);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyStaffTableRequest(request, context);
}
