import { NextResponse, NextRequest } from "next/server";
import { backendUrl, getBackendBaseUrl } from "@/lib/backendUrl";

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  const targetUrl = backendUrl("/api/v1/platform/auth/login");

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let errDetail: unknown = "Platform authentication failed";
      try {
        const errJson = await res.json();
        if (errJson && (typeof errJson.detail === "string" || typeof errJson.detail === "object")) {
          errDetail = errJson.detail;
        }
      } catch {}
      return NextResponse.json({ detail: errDetail }, { status: res.status });
    }

    const data = await res.json();
    const { access_token, expires_in, user } = data;

    // Set platform_token httpOnly cookie
    const response = NextResponse.json({ user });
    response.cookies.set({
      name: "platform_token",
      value: access_token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: expires_in,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connection error";
    return NextResponse.json(
      { detail: `Could not connect to backend server at ${getBackendBaseUrl()}. ${message}` },
      { status: 500 }
    );
  }
}
