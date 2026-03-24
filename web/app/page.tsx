import { getSafeServerSession } from "@/lib/auth";
import { Hero, BentoFeatures, Showcase } from "@/components/landing/v3";
import { Footer } from "@/components/landing/Footer";

export default async function HomePage() {
  const session = await getSafeServerSession();
  const isLoggedIn = Boolean(session?.user?.id);

  return (
    <div className="min-h-screen flex flex-col text-slate-900 dark:text-slate-100 font-sans selection:bg-emerald-500/30">
      <main className="flex-1">
        <Hero isLoggedIn={isLoggedIn} />
        
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/5 to-transparent pointer-events-none" />
          <BentoFeatures locale="en" />
          <Showcase locale="en" />
        </div>
      </main>

      <Footer />
    </div>
  );
}
