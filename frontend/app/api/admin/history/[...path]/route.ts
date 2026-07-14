import { NextRequest, NextResponse } from "next/server";
import { backendUrl, getBackendBaseUrl } from "@/lib/backendUrl";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const tokenCookie = request.cookies.get("staff_token");
  if (!tokenCookie?.value) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const { path } = await params;
  const targetUrl = new URL(backendUrl(`/admin/history/${path.map(encodeURIComponent).join("/")}`));
  request.nextUrl.searchParams.forEach((value, key) => targetUrl.searchParams.set(key, value));

  try {
    const res = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenCookie.value}` },
      cache: "no-store",
    });
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/csv")) {
      const text = await res.text();
      return new NextResponse(text, {
        status: res.status,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": res.headers.get("content-disposition") || "attachment",
        },
      });
    }
    if (contentType.includes("application/pdf")) {
      const bytes = await res.arrayBuffer();
      return new NextResponse(bytes, {
        status: res.status,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": res.headers.get("content-disposition") || "attachment",
        },
      });
    }
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    return NextResponse.json({ detail: `Could not connect to the backend server at ${getBackendBaseUrl()}. ${message}` }, { status: 500 });
  }
}
