import { NextRequest, NextResponse } from "next/server";
import { backendUrl } from "./backendUrl";

export async function proxyPlatformRequest(
  request: NextRequest,
  subPath: string
) {
  // 1. Read platform_token cookie
  const tokenCookie = request.cookies.get("platform_token");
  if (!tokenCookie || !tokenCookie.value) {
    return NextResponse.json({ detail: "Not authenticated as platform operator" }, { status: 401 });
  }

  const targetUrl = backendUrl(`/api/v1/platform${subPath}`);

  const headers: HeadersInit = {
    "Authorization": `Bearer ${tokenCookie.value}`,
  };

  const method = request.method;
  let body: string | undefined = undefined;

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
      cache: "no-store",
    });

    if (!res.ok) {
      let errDetail: unknown = `Platform API request failed with status ${res.status}`;
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
      { detail: "The platform service is temporarily unavailable. Please try again." },
      { status: 503 }
    );
  }
}
