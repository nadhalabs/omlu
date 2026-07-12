import { BillResponse } from "./types";

export function buildWhatsAppBillShareUrl(
  bill: BillResponse,
  billUrl: string
): string {
  const message = [
    `${bill.restaurant_name} bill`,
    `Bill: ${bill.bill_number}`,
    `Table: ${bill.table_number}`,
    `Total: ${bill.currency} ${Number(bill.total_amount).toFixed(2)}`,
    billUrl,
  ].join("\n");

  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
