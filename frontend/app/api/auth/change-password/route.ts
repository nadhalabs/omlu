import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const tokenCookie = request.cookies.get("staff_token");
  if (!tokenCookie?.value) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  const backendBaseUrl = process.env.BACKEND_API_BASE_URL || "http://localhost:8000";
  try {
    const res = await fetch(`${backendBaseUrl}/auth/staff/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tokenCookie.value}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail = "Password change failed";
      try {
        const err = await res.json();
        if (err && typeof err.detail === "string") detail = err.detail;
      } catch {}
      return NextResponse.json({ detail }, { status: res.status });
    }

    const data = await res.json();
    const response = NextResponse.json({ staff: data.staff });
    response.cookies.set({
      name: "staff_token",
      value: data.access_token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: data.expires_in,
    });
    return response;
  } catch {
    return NextResponse.json(
      { detail: "Could not connect to the backend server." },
      { status: 500 }
    );
  }
}
