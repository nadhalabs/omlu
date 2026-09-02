import Link from "next/link";

export function PublicFooter() {
  return <footer className="border-t border-[var(--omlu-border)] px-6 py-7 text-xs font-semibold text-[var(--omlu-text-secondary)]"><div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row"><span>OMLU · Operations for modern venues</span><div className="flex flex-wrap items-center justify-center gap-4"><Link href="/faq" className="underline hover:text-orange-600">FAQ</Link><Link href="/terms" className="underline hover:text-orange-600">Terms</Link><Link href="/privacy" className="underline hover:text-orange-600">Privacy</Link><Link href="/refunds" className="underline hover:text-orange-600">Refunds</Link><Link href="/acceptable-use" className="underline hover:text-orange-600">Acceptable Use</Link><Link href="/service-policy" className="underline hover:text-orange-600">Service Policy</Link></div></div></footer>;
}
