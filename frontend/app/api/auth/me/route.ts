import { NextResponse, NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const tokenCookie = request.cookies.get("staff_token");
  if (!tokenCookie || !tokenCookie.value) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const backendBaseUrl = process.env.BACKEND_API_BASE_URL || "http://localhost:8000";
  const targetUrl = `${backendBaseUrl}/auth/staff/me`;

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tokenCookie.value}`,
      },
    });

    if (!res.ok) {
      let errDetail = "Not authenticated";
      try {
        const errJson = await res.json();
        if (errJson && typeof errJson.detail === "string") {
          errDetail = errJson.detail;
        }
      } catch {}
      
      const response = NextResponse.json({ detail: errDetail }, { status: res.status });
      // If unauthorized, clear invalid cookie
      if (res.status === 401) {
        response.cookies.set({
          name: "staff_token",
          value: "",
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 0,
        });
      }
      return response;
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { detail: "Could not connect to the backend server." },
      { status: 500 }
    );
  }
}
