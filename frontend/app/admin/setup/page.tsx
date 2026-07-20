import Link from "next/link";
import { requireStaffRole } from "@/lib/serverAuth";

const setupItems = [
  { label: "Restaurant details", href: "/admin/settings" },
  { label: "Add tables", href: "/admin/tables" },
  { label: "Add menu categories", href: "/admin/menu" },
  { label: "Add menu items", href: "/admin/menu" },
  { label: "Add staff", href: "/admin/staff" },
  { label: "Add kitchen user", href: "/admin/staff" },
  { label: "Generate table QR codes", href: "/admin/tables" },
];

export const metadata = {
  title: "Setup - OMLU Admin",
};

export default async function AdminSetupPage() {
  const staff = await requireStaffRole(["owner", "admin"]);

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-8 text-zinc-950">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8">
          <p className="text-sm font-black uppercase tracking-widest text-amber-700">
            {staff.restaurant_name}
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">Initial Setup</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
            Work through these setup steps as your restaurant gets ready. You can
            leave this page and return any time.
          </p>
        </div>

        <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-200 px-5 py-4">
            <p className="text-sm font-bold text-zinc-600">0 of {setupItems.length} marked complete</p>
          </div>
          <div className="divide-y divide-zinc-200">
            {setupItems.map((item, index) => (
              <Link
                key={`${item.label}-${index}`}
                href={item.href}
                className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-zinc-50"
              >
                <span className="font-semibold text-zinc-900">{item.label}</span>
                <span className="text-sm font-bold text-zinc-500">Open</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
