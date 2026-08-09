const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  active: "Active",
  pending: "Pending",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  completed: "Completed",
  rejected: "Rejected",
  issued: "Issued",
  unpaid: "Unpaid",
  payment_requested: "Payment Requested",
  payment_pending: "Payment Pending",
  detached_awaiting_payment: "Awaiting Payment",
  paid: "Paid",
  closed: "Closed",
  cancelled: "Cancelled",
  void: "Void",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  online: "Online",
  counter_cash: "Cash",
  counter_upi: "UPI",
  counter_card: "Card",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  staff: "Staff",
  kitchen: "Kitchen",
};

const SOURCE_LABELS: Record<string, string> = {
  dining: "Table Service",
  takeaway: "Takeaway",
  quick_sale: "Quick Sale",
  late_entry: "Late Entry",
};

function mappedLabel(value: string | null | undefined, labels: Record<string, string>, unknown: string): string {
  if (!value) return unknown;
  return labels[value] ?? unknown;
}

export function displayStatus(value: string | null | undefined): string {
  return mappedLabel(value, STATUS_LABELS, "Unknown Status");
}

export function displayPaymentMethod(value: string | null | undefined): string {
  return mappedLabel(value, PAYMENT_METHOD_LABELS, "Other Payment Method");
}

export function displayRole(value: string | null | undefined): string {
  return mappedLabel(value, ROLE_LABELS, "Team Member");
}

export function displaySource(value: string | null | undefined): string {
  return mappedLabel(value, SOURCE_LABELS, "Other Sale");
}

export function displayCustomerTaxType(value: unknown): string {
  if (value === "b2b") return "GST Invoice";
  if (value === "b2c") return "Regular Sale";
  return "Not Available";
}
