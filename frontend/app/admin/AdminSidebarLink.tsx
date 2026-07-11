"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminSidebarLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname?.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={`px-4 py-3 rounded-xl text-sm font-bold transition flex items-center ${
        isActive
          ? "bg-amber-600 text-white shadow-md shadow-amber-900/20"
          : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
      }`}
    >
      {label}
    </Link>
  );
}
