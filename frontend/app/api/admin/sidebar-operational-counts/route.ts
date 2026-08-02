import { NextRequest, NextResponse } from "next/server";
import { backendUrl } from "@/lib/backendUrl";

const activeTakeawayStatuses = new Set(["pending", "accepted", "preparing", "ready", "served"]);

export async function GET(request: NextRequest) {
  const token = request.cookies.get("staff_token")?.value;
  if (!token) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });
  const options = { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" as const };

  try {
    const [paymentsResponse, quickSalesResponse, requestsResponse] = await Promise.all([
      fetch(backendUrl("/staff/bills/pending-payments"), options),
      fetch(backendUrl("/admin/quick-sales"), options),
      fetch(backendUrl("/staff/service-requests?status_filter=pending"), options),
    ]);
    if (!paymentsResponse.ok || !quickSalesResponse.ok || !requestsResponse.ok) {
      return NextResponse.json({ detail: "Could not refresh operational counts" }, { status: 503 });
    }

    const [payments, quickSales, requests] = await Promise.all([
      paymentsResponse.json(),
      quickSalesResponse.json(),
      requestsResponse.json(),
    ]);
    return NextResponse.json({
      pendingPayments: Array.isArray(payments.items) ? payments.items.length : 0,
      activeTakeaways: Array.isArray(quickSales.active_takeaways)
        ? quickSales.active_takeaways.filter((sale: { sale_type?: string; status?: string }) => sale.sale_type === "takeaway" && activeTakeawayStatuses.has(String(sale.status))).length
        : 0,
      unresolvedRequests: Array.isArray(requests)
        ? requests.filter((serviceRequest: { status?: string }) => serviceRequest.status === "pending").length
        : 0,
    });
  } catch {
    return NextResponse.json({ detail: "The service is temporarily unavailable" }, { status: 503 });
  }
}
