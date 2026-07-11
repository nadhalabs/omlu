import { NextResponse, NextRequest } from "next/server";

type Params = Promise<{ restaurantSlug: string }>;

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  const { restaurantSlug } = await params;
  
  // Read staff_token cookie
  const tokenCookie = request.cookies.get("staff_token");
  if (!tokenCookie || !tokenCookie.value) {
    return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  }

  // Get search params
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const limit = searchParams.get("limit");
  const since = searchParams.get("since");

  const backendBaseUrl = process.env.BACKEND_API_BASE_URL || "http://localhost:8000";

  // Construct target URL
  const targetUrl = new URL(
    `${backendBaseUrl}/kitchen/restaurants/${encodeURIComponent(restaurantSlug)}/orders`
  );
  if (statusParam) targetUrl.searchParams.set("status", statusParam);
  if (limit) targetUrl.searchParams.set("limit", limit);
  if (since) targetUrl.searchParams.set("since", since);

  try {
    const res = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tokenCookie.value}`,
      },
    });

    if (!res.ok) {
      let errDetail = "Failed to fetch orders from backend";
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
