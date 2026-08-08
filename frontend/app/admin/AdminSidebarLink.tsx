"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

export default function AdminSidebarLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  const pathname = usePathname();
  const hrefPathname = href.split("?", 1)[0];
  const isActive = pathname === hrefPathname || pathname?.startsWith(hrefPathname + "/");

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`flex min-h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-4 py-3 text-sm font-bold transition lg:w-full ${
        isActive
          ? "bg-orange-600 text-[var(--omlu-primary-action-text)]"
          : "text-[var(--omlu-text-secondary)] hover:bg-[var(--omlu-primary-surface)] hover:text-[var(--omlu-text-secondary)]"
      }`}
    >
      {Icon && <Icon aria-hidden={true} className="h-[18px] w-[18px] shrink-0" />}
      {label}
    </Link>
  );
}
