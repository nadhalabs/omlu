import PerformanceClient, { PerformanceInitialState } from "./PerformanceClient";

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const periodOptions = new Set(["today", "last_7_days", "month", "custom"]);
  const tabOptions = new Set(["overview", "sales", "menu", "kitchen"]);
  const rawPeriod = typeof params.period === "string" ? params.period : "today";
  const rawTab = typeof params.tab === "string" ? params.tab : "overview";
  const initialState: PerformanceInitialState = {
    period: (periodOptions.has(rawPeriod) ? rawPeriod : "today") as PerformanceInitialState["period"],
    tab: (tabOptions.has(rawTab) ? rawTab : "overview") as PerformanceInitialState["tab"],
    start: typeof params.start === "string" ? params.start : undefined,
    end: typeof params.end === "string" ? params.end : undefined,
  };
  return <PerformanceClient initialState={initialState} />;
}
