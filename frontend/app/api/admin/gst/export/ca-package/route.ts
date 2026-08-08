import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("access_token")?.value;
    if (!token) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const backendUrl = `${BACKEND_URL}/admin/gst/export/ca-package?${searchParams.toString()}`;

    const res = await fetch(backendUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const err = await res.text();
      return new NextResponse(err, { status: res.status });
    }

    const contentType = res.headers.get("content-type") || "application/zip";
    const contentDisposition = res.headers.get("content-disposition") || 'attachment; filename="ca-package.zip"';
    const blob = await res.arrayBuffer();

    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": contentDisposition,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to download CA package";
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
