import { NextRequest, NextResponse } from "next/server";
import { backendUrl, getBackendBaseUrl } from "@/lib/backendUrl";

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

  try {
    const res = await fetch(backendUrl("/auth/staff/change-password"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tokenCookie.value}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail: unknown = "Password change failed";
      try {
        const err = await res.json();
        if (err && (typeof err.detail === "string" || typeof err.detail === "object")) detail = err.detail;
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    return NextResponse.json(
      { detail: `Could not connect to the backend server at ${getBackendBaseUrl()}. ${message}` },
      { status: 500 }
    );
  }
}
