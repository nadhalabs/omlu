import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 px-6 py-10 text-zinc-950">
      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center">
        <section className="w-full max-w-xl">
          <p className="mb-3 text-sm font-black uppercase tracking-widest text-amber-700">
            Nadha Serve
          </p>
          <h1 className="text-4xl font-black tracking-tight text-zinc-950 sm:text-5xl">
            Nadha Serve
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
      </main>
    </div>
  );
}
