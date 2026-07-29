import { NextRequest, NextResponse } from "next/server";
import { backendUrl, getBackendBaseUrl } from "@/lib/backendUrl";

async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const token = request.cookies.get("staff_token")?.value;
  if (!token) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }
  const { path } = await params;
  const target = backendUrl(`/staff/table-sessions/${path.map(encodeURIComponent).join("/")}`);
  const headers: HeadersInit = { Authorization: `Bearer ${token}` };
  let body: string | undefined;
  if (request.method === "POST") {
    headers["Content-Type"] = "application/json";
    body = await request.text();
  }
  try {
    const response = await fetch(target, { method: request.method, headers, body, cache: "no-store" });
    return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    return NextResponse.json(
      { detail: `Could not connect to the backend server at ${getBackendBaseUrl()}. ${message}` },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context);
}
