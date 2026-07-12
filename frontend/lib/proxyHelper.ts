import { NextRequest, NextResponse } from "next/server";

export async function proxyAdminRequest(
  request: NextRequest,
  subPath: string,
  options: { isBinary?: boolean } = {}
) {
  // 1. Read staff_token cookie
  const tokenCookie = request.cookies.get("staff_token");
  if (!tokenCookie || !tokenCookie.value) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const backendBaseUrl = process.env.BACKEND_API_BASE_URL || "http://localhost:8000";
  const targetUrl = `${backendBaseUrl}/admin${subPath}`;

  const headers: HeadersInit = {
    "Authorization": `Bearer ${tokenCookie.value}`,
  };

  const method = request.method;
  let body: string | undefined = undefined;

  // Forward body if request has one
  if (method === "POST" || method === "PATCH" || method === "PUT") {
    headers["Content-Type"] = "application/json";
    try {
      body = await request.text();
    } catch {
      // Ignore body read failure
    }
  }

  try {
    const res = await fetch(targetUrl, {
      method,
      headers,
      body,
    });

    if (options.isBinary) {
      // Forward raw binary buffer (e.g. dynamic QR PNG images)
      const data = await res.arrayBuffer();
      const headersOut: HeadersInit = {};
      const contentType = res.headers.get("content-type");
      const contentDisposition = res.headers.get("content-disposition");
      
      if (contentType) headersOut["Content-Type"] = contentType;
      if (contentDisposition) headersOut["Content-Disposition"] = contentDisposition;

      return new NextResponse(data, {
        status: res.status,
        headers: headersOut,
      });
    }

    if (!res.ok) {
      let errDetail: unknown = `API Request failed with status ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson && (typeof errJson.detail === "string" || typeof errJson.detail === "object")) {
          errDetail = errJson.detail;
        }
      } catch {}
      return NextResponse.json({ detail: errDetail }, { status: res.status });
    }

    if (res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { detail: "Could not connect to the backend server." },
      { status: 500 }
    );
  }
}
