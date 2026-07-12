import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const tokenCookie = request.cookies.get("staff_token");
  if (!tokenCookie?.value) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const backendBaseUrl =
    process.env.BACKEND_API_BASE_URL || "http://localhost:8000";
  const targetUrl = `${backendBaseUrl}/staff/sessions`;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        Authorization: `Bearer ${tokenCookie.value}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      let errDetail = `Backend error: ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson && typeof errJson.detail === "string")
          errDetail = errJson.detail;
      } catch {}
      return NextResponse.json({ detail: errDetail }, { status: res.status });
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
