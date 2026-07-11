import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-950 px-6 py-12 text-center">
      <main className="max-w-md w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
        <h1 className="text-3xl font-extrabold text-amber-600 tracking-tight mb-2">
          Nadha Serve
        </h1>
        <p className="text-base text-zinc-500 dark:text-zinc-400 font-medium mb-8">
          Restaurant QR Ordering System
        </p>

        <div className="flex flex-col gap-4">
          <Link
            href="/menu/nadha-demo-cafe/T1-DEMO"
            className="flex items-center justify-center gap-2 h-12 w-full rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-sm transition cursor-pointer"
          >
            🚀 Open Demo Menu (Table 1)
          </Link>
        </div>
      </main>
    </div>
  );
}
