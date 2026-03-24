import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { FadeIn } from "@/components/animations/FadeIn";
import { Twitter, Mail, Github, CheckCircle2, XCircle, Linkedin } from "lucide-react";
import Image from "next/image";
import { mt } from "@/lib/site-i18n/marketing";

export default function AboutPage() {
  return (
    <MarketingLayout activeNav="about">
      {/* Background Dot Grid */}
      <div className="fixed inset-0 bg-dot-grid-masked opacity-40 dark:opacity-20 pointer-events-none" />

      <div className="mx-auto max-w-4xl space-y-12 relative z-10">
        {/* Hero Section */}
        <FadeIn>
          <header className="text-center space-y-4 relative">
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <FadeIn delay={0.1} distance={10}>
              <span className="inline-block rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-4 py-1.5 text-xs sm:text-sm text-emerald-700 dark:text-emerald-300 font-medium relative z-10">
                {mt("en", "about_badge")}
              </span>
            </FadeIn>
            <FadeIn delay={0.2} distance={20}>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white tracking-tight relative z-10">
                {mt("en", "about_title")}
              </h1>
            </FadeIn>
            <FadeIn delay={0.3} distance={20}>
              <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto relative z-10">
                {mt("en", "about_subtitle")}
              </p>
            </FadeIn>
          </header>
        </FadeIn>

        {/* Manifesto Section */}
        <FadeIn delay={0.1}>
          <section className="rounded-2xl glass-card glass-card-hover p-8 md:p-10 space-y-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-emerald-500/10 transition-colors duration-500" />
            <div className="relative z-10">
              <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-4">{mt("en", "about_idea_label")}</h2>
              <p className="text-xl md:text-2xl text-slate-800 dark:text-slate-200 leading-relaxed font-medium">
                {mt("en", "about_idea_headline").split("process")[0]}<span className="italic text-emerald-600 dark:text-emerald-400">process</span>{mt("en", "about_idea_headline").split("process")[1]}
              </p>
              <p className="text-slate-600 dark:text-slate-400 mt-4 text-lg">
                {mt("en", "about_idea_body")}
              </p>
              
              <div className="grid sm:grid-cols-3 gap-6 mt-10 pt-10 border-t border-slate-200 dark:border-slate-800">
                {[
                  mt("en", "about_value_1"),
                  mt("en", "about_value_2"),
                  mt("en", "about_value_3")
                ].map((text, i) => (
                  <FadeIn key={i} delay={0.2 + i * 0.1} distance={10}>
                    <div className="space-y-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{text}</p>
                    </div>
                  </FadeIn>
                ))}
              </div>
            </div>
          </section>
        </FadeIn>

        {/* Who it's for / What it's not */}
        <div className="grid gap-6 md:grid-cols-2">
          <FadeIn delay={0.3}>
            <section className="h-full rounded-2xl glass-card glass-card-hover p-8 space-y-4 group">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-6 bg-emerald-500 rounded-full group-hover:scale-y-125 transition-transform" />
                {mt("en", "about_for_title")}
              </h2>
              <ul className="space-y-3">
                {[
                  mt("en", "about_for_1"),
                  mt("en", "about_for_2"),
                  mt("en", "about_for_3")
                ].map((item, i) => (
                  <FadeIn key={i} delay={0.4 + i * 0.1} distance={5} direction="left">
                    <li className="flex items-start gap-3 text-slate-600 dark:text-slate-400 text-sm">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-500 shrink-0" />
                      {item}
                    </li>
                  </FadeIn>
                ))}
              </ul>
            </section>
          </FadeIn>
          <FadeIn delay={0.4}>
            <section className="h-full rounded-2xl glass-card glass-card-hover p-8 space-y-4 group">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="w-1.5 h-6 bg-slate-400 rounded-full group-hover:scale-y-125 transition-transform" />
                {mt("en", "about_not_title")}
              </h2>
              <ul className="space-y-3">
                {[
                  mt("en", "about_not_1"),
                  mt("en", "about_not_2"),
                  mt("en", "about_not_3")
                ].map((item, i) => (
                  <FadeIn key={i} delay={0.5 + i * 0.1} distance={5} direction="left">
                    <li className="flex items-start gap-3 text-slate-600 dark:text-slate-400 text-sm">
                      <XCircle className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                      {item}
                    </li>
                  </FadeIn>
                ))}
              </ul>
            </section>
          </FadeIn>
        </div>

        {/* Founder Section */}
        <FadeIn delay={0.5}>
          <section className="rounded-2xl glass-card glass-card-hover p-8 md:p-10">
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <FadeIn delay={0.6} direction="none">
                <div className="flex-shrink-0">
                  <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-emerald-500/20 shadow-xl group-hover:border-emerald-500/50 transition-colors">
                    <Image
                      src="/images/founder.jpg"
                      alt="WUSHANG CHEN"
                      fill
                      className="object-cover"
                    />
                  </div>
                </div>
              </FadeIn>
              <div className="space-y-4 flex-1">
                <FadeIn delay={0.6} direction="up" distance={10}>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{mt("en", "about_founder_title")}</h2>
                </FadeIn>
                <div className="space-y-4 text-slate-600 dark:text-slate-400 leading-relaxed">
                  <FadeIn delay={0.7} direction="up" distance={10}>
                    <p>{mt("en", "about_founder_bio_1")}</p>
                  </FadeIn>
                  <FadeIn delay={0.8} direction="up" distance={10}>
                    <p>{mt("en", "about_founder_bio_2")}</p>
                  </FadeIn>
                </div>
                
                <FadeIn delay={0.9} direction="up" distance={10}>
                  <div className="flex items-center gap-4 pt-4">
                    {[
                      { href: "https://github.com/isbeingto", icon: Github, label: "GitHub" },
                      { href: "https://x.com/isbeingto", icon: Twitter, label: "Twitter" },
                      { href: "https://www.linkedin.com/in/wushang-chen-b12293393/", icon: Linkedin, label: "LinkedIn" },
                      { href: "mailto:contact@omytree.com", icon: Mail, label: "Email" }
                    ].map((social, i) => (
                      <a
                        key={i}
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/20 transition-all duration-300 hover:scale-110"
                        aria-label={social.label}
                      >
                        <social.icon className="w-5 h-5" />
                      </a>
                    ))}
                  </div>
                </FadeIn>
              </div>
            </div>
          </section>
        </FadeIn>

        {/* Status Section */}
        <FadeIn delay={0.6}>
          <div className="text-center py-12 border-t border-slate-200 dark:border-slate-800 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/5 to-transparent opacity-50" />
            <div className="relative z-10 space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500 dark:text-slate-500">{mt("en", "about_status_label")}</h2>
              <p className="text-slate-600 dark:text-slate-400 text-sm max-w-md mx-auto">
                {mt("en", "about_status_text")}
              </p>
            </div>
          </div>
        </FadeIn>
      </div>
    </MarketingLayout>
  );
}
