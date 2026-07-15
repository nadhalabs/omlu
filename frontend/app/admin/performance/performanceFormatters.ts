export function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "₹0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num) || num < 0) return "₹0";
  
  const hasDecimals = num % 1 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatAverageOrderValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "₹0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num) || num < 0) return "₹0";
  
  const hasDecimals = num % 1 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatDurationMinutes(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value) || value <= 0) return "0m";
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}
