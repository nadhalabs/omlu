"use client";

const MODULES = [
  {
    id: "qr",
    title: "QR Ordering",
    desc: "Guests scan and order from the table.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    ),
    badge: "Guest QR",
  },
  {
    id: "tables",
    title: "Tables",
    desc: "Track each table through its service lifecycle.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8" />
      </svg>
    ),
    badge: "Table Status",
  },
  {
    id: "kitchen",
    title: "Kitchen",
    desc: "Orders flow directly into kitchen operations.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    badge: "Kitchen Display",
  },
  {
    id: "staff",
    title: "Staff",
    desc: "Staff work from role-appropriate operational views.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    badge: "Role Access",
  },
  {
    id: "billing",
    title: "Billing",
    desc: "Review orders, issue bills and print receipts.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    badge: "GST Billing",
  },
  {
    id: "payment",
    title: "Payment",
    desc: "Record payment and complete the table.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
    badge: "Counter Pay",
  },
];

export function ConnectedOperations() {
  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 shadow-xl transition-all duration-300 sm:p-8"
      aria-label="Connected Restaurant Operations"
    >
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-[var(--omlu-border)] pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-black tracking-tight text-[var(--omlu-text-primary)]">Connected Restaurant Operations</h3>
          <p className="text-xs font-semibold text-[var(--omlu-text-secondary)]">Six core modules synchronized across one platform</p>
        </div>
        <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-orange-500/10 px-3 py-1 text-xs font-black text-orange-600">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
          Unified Architecture
        </span>
      </div>

      {/* Grid of connected modules */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((mod, idx) => (
          <div
            key={mod.id}
            className="group relative flex flex-col justify-between rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-orange-500/40 hover:shadow-md"
          >
            <div>
              <div className="flex items-center justify-between">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 transition-transform duration-300 group-hover:scale-110">
                  {mod.icon}
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--omlu-text-secondary)]">
                  {mod.badge}
                </span>
              </div>
              <h4 className="mt-3 text-base font-black text-[var(--omlu-text-primary)]">{mod.title}</h4>
              <p className="mt-1 text-xs leading-5 text-[var(--omlu-text-secondary)]">{mod.desc}</p>
            </div>

            {/* Connecting flow indicator */}
            <div className="mt-4 flex items-center gap-1.5 text-[11px] font-bold text-orange-600 opacity-80 group-hover:opacity-100">
              <span>Step {idx + 1}</span>
              <span aria-hidden="true">→</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
