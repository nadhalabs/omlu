import Link from "next/link";
import { redirect } from "next/navigation";
import { LandingThemeToggle } from "@/components/LandingThemeToggle";
import { authenticatedHomePath } from "@/lib/publicAuth";

function RestaurantIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" className="h-7 w-7"><path d="M5 3v7M8 3v7M5 7h3M6.5 10v11M15 3v18M15 3c3 1.5 4 4 4 7h-4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function CinemaIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" className="h-7 w-7"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m8 5 3 4 3-4 3 4 3-4M7 19v2M17 19v2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default async function GetStartedPage() {
  const destination = await authenticatedHomePath();
  if (destination && destination !== "/login") redirect(destination);
  const venues = [
    { type: "restaurant", title: "Restaurant", description: "For restaurants, cafés, food courts, and dining operations.", cta: "Create Restaurant", icon: <RestaurantIcon /> },
    { type: "cinema", title: "Cinema", description: "For theatres and cinema venues with seat-based concession ordering.", cta: "Create Cinema", icon: <CinemaIcon /> },
  ] as const;

  return <div className="flex min-h-screen items-center bg-[var(--omlu-muted-surface)] px-4 py-10 text-[var(--omlu-text-primary)] sm:px-6">
    <main className="mx-auto w-full max-w-4xl">
      <div className="flex items-center justify-between"><Link href="/" className="text-sm font-black uppercase tracking-widest text-orange-700">OMLU</Link><LandingThemeToggle /></div>
      <div className="mx-auto mt-12 max-w-2xl text-center sm:mt-16"><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-700">Get started</p><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Choose your venue</h1><p className="mt-3 text-sm leading-6 text-[var(--omlu-text-secondary)]">Create the workspace that fits how you serve guests.</p></div>
      <div className="mt-9 grid gap-4 md:grid-cols-2">
        {venues.map((venue) => <article key={venue.type} className="flex min-h-64 flex-col rounded-3xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-6 shadow-sm sm:p-8"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--omlu-muted-surface)] text-orange-700">{venue.icon}</div><h2 className="mt-6 text-2xl font-black tracking-tight">{venue.title}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-[var(--omlu-text-secondary)]">{venue.description}</p><Link href={`/register?type=${venue.type}`} className="mt-auto inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--omlu-primary-action)] px-5 text-sm font-black text-[var(--omlu-primary-action-text)] transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--omlu-focus-ring)]">{venue.cta}</Link></article>)}
      </div>
      <p className="mt-8 text-center text-sm text-[var(--omlu-text-secondary)]">Already have an account? <Link href="/login" className="font-bold text-[var(--omlu-text-primary)] underline underline-offset-4">Sign in</Link></p>
    </main>
  </div>;
}
