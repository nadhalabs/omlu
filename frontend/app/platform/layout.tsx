"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // If on login page, render without layout frame
  if (pathname === "/platform/login") {
    return <>{children}</>;
  }

  const navItems = [
    { label: "Overview", href: "/platform", icon: "📊" },
    { label: "Live Operations", href: "/platform/live", icon: "⚡" },
    { label: "Restaurants Fleet", href: "/platform/restaurants", icon: "🏬" },
    { label: "Orders Analytics", href: "/platform/orders", icon: "🧾" },
    { label: "Table Sessions", href: "/platform/sessions", icon: "🪑" },
    { label: "Pending Payments", href: "/platform/payments", icon: "💳" },
    { label: "Revenue & Reconciliation", href: "/platform/revenue", icon: "💰" },
    { label: "Incidents & Alerts", href: "/platform/incidents", icon: "🚨" },
    { label: "System Health", href: "/platform/system", icon: "🖥️" },
    { label: "Platform Audit Log", href: "/platform/audit-log", icon: "📜" },
    { label: "Platform Settings", href: "/platform/settings", icon: "⚙️" },
  ];

  const handleLogout = async () => {
    await fetch("/api/platform/auth/logout", { method: "POST" });
    router.push("/platform/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div>
          {/* Header Branding */}
          <div className="p-5 border-b border-slate-800 flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white text-base shadow-lg shadow-indigo-600/30">
              Ω
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-100 tracking-tight">OMLU Platform</h2>
              <span className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider">
                Nadha Labs Console
              </span>
            </div>
          </div>

          {/* Nav items */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/platform" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                  }`}
                >
                  <span className="text-sm">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer Operator Badge & Logout */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="text-xs font-medium text-slate-300">Platform Operator</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-slate-400 hover:text-rose-400 transition-colors"
              title="Sign out of platform console"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto min-h-screen">
        <header className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-6 py-3.5 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <span className="text-xs font-mono text-slate-400 uppercase tracking-widest bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md">
              SCOPE: PLATFORM-ADMIN
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-xs text-slate-400">Timezone: UTC / Normalized</span>
          </div>
        </header>

        <div className="p-6 max-w-7xl mx-auto space-y-6">{children}</div>
      </main>
    </div>
  );
}
