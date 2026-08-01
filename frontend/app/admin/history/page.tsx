import Link from "next/link";
import { redirect } from "next/navigation";
import BillHistoryClient from "../bills/history/BillHistoryClient";
import OrderHistoryClient from "../orders/history/OrderHistoryClient";
import SessionHistoryClient from "../sessions/history/SessionHistoryClient";

const historyViews = ["orders", "bills", "sessions"] as const;
type HistoryView = (typeof historyViews)[number];

const tabs: ReadonlyArray<{ view: HistoryView; label: string }> = [
  { view: "orders", label: "Orders" },
  { view: "bills", label: "Bills" },
  { view: "sessions", label: "Sessions" },
];

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { view: requestedView } = await searchParams;

  if (typeof requestedView !== "string" || !historyViews.includes(requestedView as HistoryView)) {
    redirect("/admin/history?view=orders");
  }

  const view = requestedView as HistoryView;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div>
        <h1 className="text-2xl font-black text-white">History</h1>
        <nav
          aria-label="History views"
          className="mt-4 flex w-full gap-1 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-1 sm:w-fit"
          role="tablist"
        >
          {tabs.map((tab) => {
            const isActive = tab.view === view;
            return (
              <Link
                key={tab.view}
                href={`/admin/history?view=${tab.view}`}
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? "page" : undefined}
                className={`min-h-11 flex-1 whitespace-nowrap rounded-lg px-5 py-2.5 text-center text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 sm:flex-none ${
                  isActive
                    ? "bg-orange-600 text-white"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {view === "orders" ? (
        <OrderHistoryClient />
      ) : view === "bills" ? (
        <BillHistoryClient />
      ) : (
        <SessionHistoryClient />
      )}
    </div>
  );
}
