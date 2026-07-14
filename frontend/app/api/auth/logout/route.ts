import { NextRequest, NextResponse } from "next/server";
import { backendUrl } from "@/lib/backendUrl";

export async function POST(request: NextRequest) {
  const tokenCookie = request.cookies.get("staff_token");
  if (tokenCookie?.value) {
    try {
      await fetch(backendUrl("/auth/staff/logout"), {
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
