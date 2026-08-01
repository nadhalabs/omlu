import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import React from "react";
import AdminSidebarLink from "./AdminSidebarLink";
import AdminLogoutButton from "./AdminLogoutButton";
import { backendUrl } from "@/lib/backendUrl";
import PendingPaymentsSidebarLink from "./PendingPaymentsSidebarLink";
import { WebAuthScope } from "@/components/WebAuthScope";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get("staff_token");

  // Redirect to login if token cookie is missing
  if (!tokenCookie || !tokenCookie.value) {
    redirect("/login");
  }

  let staffInfo = null;
  let pendingPaymentCount = 0;

  try {
    const res = await fetch(backendUrl("/auth/staff/me"), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${tokenCookie.value}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      // Token is invalid/expired
      redirect("/login");
    }

    staffInfo = await res.json();
    if (["owner", "admin"].includes(staffInfo.role)) {
      const pendingResponse = await fetch(backendUrl("/staff/bills/pending-payments"), {
        headers: { Authorization: `Bearer ${tokenCookie.value}` },
        cache: "no-store",
      });
      if (pendingResponse.ok) {
        const pending = await pendingResponse.json();
        pendingPaymentCount = Array.isArray(pending.items) ? pending.items.length : 0;
      }
    }
  } catch {
    // If backend connection fails, redirect to login
    redirect("/login");
  }

  // Only owner and admin roles are permitted to access administrative tools.
  if (staffInfo.must_change_password) {
    redirect("/staff/change-password");
  }

  // Only owner and admin roles are permitted to access administrative tools.
  const allowedRoles = ["owner", "admin"];
  if (!allowedRoles.includes(staffInfo.role)) {
    return (
      <div className="omlu-light-shell flex flex-col flex-1 items-center justify-center min-h-screen p-6 text-center">
        <div className="max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl">
          <div className="text-red-500 text-5xl mb-4">⛔</div>
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-sm text-zinc-500 mb-6">
            You do not have administrative permissions to access the admin panel.
          </p>
          <a
            href="/login"
            className="inline-block px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-xl transition"
          >
            Return to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <WebAuthScope scope={staffInfo.scope}>
    <div className="omlu-light-shell flex min-h-screen min-w-0 flex-col lg:flex-row">
      {/* Sidebar Navigation */}
      <aside className="sticky top-0 z-30 flex w-full shrink-0 flex-col justify-between border-b border-zinc-850 bg-zinc-950 p-4 shadow-sm lg:static lg:w-64 lg:border-b-0 lg:border-r lg:p-6 lg:shadow-none print:hidden">
        <div>
          {/* Brand/Logo */}
          <div className="mb-3 min-w-0 lg:mb-8">
            <span className="text-orange-500 font-extrabold uppercase tracking-widest text-[10px]">
              OMLU Admin
            </span>
            <h2 className="text-lg font-black text-white mt-1">Control Panel</h2>
            <p className="max-w-full truncate text-[10px] font-bold text-zinc-500 mt-1" title={staffInfo.restaurant_name}>
              🏢 {staffInfo.restaurant_name}
            </p>
          </div>

          {/* Navigation Links */}
          <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0" aria-label="Admin navigation">
            <AdminSidebarLink href="/admin/dashboard" label="📊 Dashboard" />
            <AdminSidebarLink href="/admin/tables" label="📋 Tables Map" />
            <AdminSidebarLink href="/admin/requests" label="🔔 Service Requests" />
            <PendingPaymentsSidebarLink initialCount={pendingPaymentCount} />
            <AdminSidebarLink href="/admin/quick-sale" label="🧾 Quick Sale" />
            <AdminSidebarLink href={`/kitchen/${staffInfo.restaurant_slug}`} label="🧑‍🍳 Kitchen Dashboard" />
            <AdminSidebarLink href="/admin/history?view=orders" label="History" />
            <AdminSidebarLink href="/admin/menu" label="🍔 Menu Items" />
            <AdminSidebarLink href="/admin/staff" label="👥 Staff Management" />
            <AdminSidebarLink href="/admin/performance" label="Performance" />
            <AdminSidebarLink href="/admin/settings" label="⚙️ Settings" />
          </nav>
        </div>

        {/* User Info & Logout Button */}
        <div className="mt-6 hidden border-t border-zinc-850 pt-4 lg:block">
          <div className="mb-4">
            <p className="text-xs font-black text-zinc-200 truncate">{staffInfo.name}</p>
            <p className="text-[9px] text-orange-500 uppercase font-extrabold tracking-wider mt-0.5">
              Role: {staffInfo.role}
            </p>
          </div>
          <AdminLogoutButton />
        </div>
      </aside>

      {/* Admin Content Area */}
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6 print:p-0 print:bg-white print:text-black">
        {children}
      </main>
    </div>
    </WebAuthScope>
  );
}
