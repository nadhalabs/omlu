import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const tokenCookie = request.cookies.get("staff_token");
  if (tokenCookie?.value) {
    const backendBaseUrl = process.env.BACKEND_API_BASE_URL || "http://localhost:8000";
    try {
      await fetch(`${backendBaseUrl}/auth/staff/logout`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokenCookie.value}`,
        },
      });
    } catch {
      // Always clear the browser cookie even if the backend is temporarily unavailable.
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: "staff_token",
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0, // Clears cookie immediately
  });
  return response;
}
