import Link from "next/link";
import { AndroidDownloadCard } from "@/components/AndroidDownloadCard";

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-zinc-50 text-zinc-950">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-5 py-12 sm:px-8 sm:py-16">
        <section className="max-w-2xl py-8 sm:py-14">
          <p className="mb-3 text-sm font-black uppercase tracking-widest text-orange-700">
            OMLU
          </p>
          <h1 className="text-4xl font-black tracking-tight text-zinc-950 sm:text-5xl">
            OMLU
          </h1>
          <p className="mt-5 text-lg leading-8 text-zinc-700">
            Restaurant ordering, table service, kitchen, billing, and staff
            management in one system.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-zinc-950 px-6 text-sm font-bold text-white transition hover:bg-zinc-800"
            >
              Restaurant Login
            </Link>
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-zinc-300 bg-white px-6 text-sm font-bold text-zinc-950 transition hover:border-zinc-500"
            >
              Create Restaurant
            </Link>
          </div>

          <p className="mt-8 max-w-lg text-sm leading-6 text-zinc-500">
            Customers should scan the QR code placed on their table to view the
            menu and order.
          </p>
        </section>

        <section aria-labelledby="features-title">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-700">One connected workspace</p>
          <h2 id="features-title" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Built for every part of restaurant service</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {["Tables and QR ordering", "Kitchen activity", "Staff operations", "Billing and status"].map((feature) => <div key={feature} className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm font-bold shadow-sm">{feature}</div>)}
          </div>
        </section>

        <AndroidDownloadCard variant="landing" />

        <section className="rounded-2xl border border-zinc-200 bg-white p-7 text-center sm:p-9" aria-labelledby="final-cta-title">
          <h2 id="final-cta-title" className="text-2xl font-black">Ready to run service with OMLU?</h2>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/login" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-zinc-950 px-6 text-sm font-bold text-white hover:bg-zinc-800">Restaurant Login</Link><Link href="/register" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-zinc-300 px-6 text-sm font-bold hover:border-zinc-500">Create Restaurant</Link></div>
        </section>
      </main>
      <footer className="border-t border-zinc-200 px-6 py-7 text-center text-xs font-semibold text-zinc-500">OMLU · Restaurant ordering and operations</footer>
    </div>
  );
}
