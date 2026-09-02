import { NextRequest, NextResponse } from "next/server";
import { backendUrl } from "@/lib/backendUrl";

async function proxy(request: NextRequest, path: string[]) {
  const token = request.cookies.get("staff_token")?.value;
  if (!token) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const query = new URL(request.url).search;
  const response = await fetch(backendUrl(`/api/cinema/${path.map(encodeURIComponent).join("/")}${query}`), {
    method: request.method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: ["POST", "PUT", "PATCH"].includes(request.method) ? await request.text() : undefined,
    cache: "no-store",
  });
  if (response.status === 204) return new NextResponse(null, { status: 204 });
  return NextResponse.json(await response.json(), { status: response.status });
}

type Context = { params: Promise<{ path?: string[] }> };
export async function GET(r: NextRequest, c: Context) { return proxy(r, (await c.params).path ?? []); }
export async function POST(r: NextRequest, c: Context) { return proxy(r, (await c.params).path ?? []); }
export async function PUT(r: NextRequest, c: Context) { return proxy(r, (await c.params).path ?? []); }
export async function PATCH(r: NextRequest, c: Context) { return proxy(r, (await c.params).path ?? []); }
export async function DELETE(r: NextRequest, c: Context) { return proxy(r, (await c.params).path ?? []); }
