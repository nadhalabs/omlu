/**
 * Normalize the dashboard API contract into 24 numeric chart buckets.
 * @param {{hour: number, orders: number}[]} rows
 */
export function buildHourlyChart(rows) {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }));
  for (const row of rows) {
    if (Number.isInteger(row.hour) && row.hour >= 0 && row.hour < 24) {
      buckets[row.hour].orders = Number.isFinite(row.orders) ? Math.max(0, row.orders) : 0;
    }
  }
  const total = buckets.reduce((sum, bucket) => sum + bucket.orders, 0);
  const max = Math.max(1, ...buckets.map((bucket) => bucket.orders));
  return { buckets, total, max };
}
