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
  const hrefPathname = href.split("?", 1)[0];
  const isActive = pathname === hrefPathname || pathname?.startsWith(hrefPathname + "/");

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-xl px-4 py-3 text-sm font-bold transition lg:w-full ${
        isActive
          ? "bg-orange-600 text-white"
          : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
      }`}
    >
      {label}
    </Link>
  );
}
