import { NextResponse, NextRequest } from "next/server";

type Params = Promise<{ restaurantSlug: string; publicToken: string }>;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Params }
) {
  const { restaurantSlug, publicToken } = await params;
  
  // Read staff_token cookie
  const tokenCookie = request.cookies.get("staff_token");
  if (!tokenCookie || !tokenCookie.value) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  const backendBaseUrl = process.env.BACKEND_API_BASE_URL || "http://localhost:8000";

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  const targetUrl = `${backendBaseUrl}/kitchen/restaurants/${encodeURIComponent(
    restaurantSlug
  )}/orders/${encodeURIComponent(publicToken)}/status`;

  try {
    const res = await fetch(targetUrl, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tokenCookie.value}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let errDetail = "Failed to update order status in backend";
      try {
        const errJson = await res.json();
        if (errJson && typeof errJson.detail === "string") {
          errDetail = errJson.detail;
        }
      } catch {}
      return NextResponse.json({ detail: errDetail }, { status: res.status });
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
