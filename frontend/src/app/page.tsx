"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Zap, Menu, X, Check, Star, ArrowRight, Play,
  Calendar, Sparkles, BarChart3, Building2, Share2, Shield,
  Twitter, Linkedin, Github,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth";
import { cn } from "@/lib/utils";

function Navbar() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={cn(
      "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
      scrolled
        ? "bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 shadow-sm"
        : "bg-transparent"
    )}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-violet-600 flex items-center justify-center shadow-md">
              <Zap className="h-4 w-4 text-white fill-white" />
            </div>
            <span className="font-bold text-lg text-gray-900 dark:text-white">SocialForge</span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-gray-600 dark:text-gray-300 hover:text-violet-600 dark:hover:text-violet-400 transition-colors font-medium">Features</a>
            <a href="#pricing" className="text-sm text-gray-600 dark:text-gray-300 hover:text-violet-600 dark:hover:text-violet-400 transition-colors font-medium">Pricing</a>
            <a href="#testimonials" className="text-sm text-gray-600 dark:text-gray-300 hover:text-violet-600 dark:hover:text-violet-400 transition-colors font-medium">Testimonials</a>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-violet-600 transition-colors px-3 py-1.5">Sign in</Link>
            <Link href="/signup" className="text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm">Start free →</Link>
          </div>

          <button className="md:hidden p-2 rounded-lg text-gray-500" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-4 space-y-3">
          <a href="#features" className="block text-sm font-medium text-gray-700 dark:text-gray-300 py-2" onClick={() => setMobileOpen(false)}>Features</a>
          <a href="#pricing" className="block text-sm font-medium text-gray-700 dark:text-gray-300 py-2" onClick={() => setMobileOpen(false)}>Pricing</a>
          <a href="#testimonials" className="block text-sm font-medium text-gray-700 dark:text-gray-300 py-2" onClick={() => setMobileOpen(false)}>Testimonials</a>
          <div className="flex flex-col gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Link href="/login" className="text-sm font-medium text-center py-2">Sign in</Link>
            <Link href="/signup" className="text-sm font-semibold text-center bg-violet-600 text-white py-2.5 rounded-lg">Start free →</Link>
          </div>
        </div>
      )}
    </nav>
  );
}

function Hero() {
  return (
    <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div className="max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800 rounded-full px-4 py-1.5 mb-8">
          <span className="text-violet-600 dark:text-violet-400 text-xs font-semibold">✦ Trusted by 2,000+ agencies worldwide</span>
        </div>

        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-gray-900 dark:text-white leading-tight tracking-tight mb-6">
          Automate every social{" "}
          <span className="bg-gradient-to-r from-violet-600 to-purple-500 bg-clip-text text-transparent">media account</span>
          {" "}— across 8 platforms
        </h1>

        <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto mb-10 leading-relaxed">
          SocialForge is the all-in-one platform for agencies and creators. Schedule, publish, and analyze content on Instagram, TikTok, YouTube, LinkedIn, Twitter, Facebook, Pinterest, and Threads — powered by AI.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <Link href="/signup" className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-8 py-4 rounded-xl text-base transition-all shadow-lg shadow-violet-500/25 hover:-translate-y-0.5">
            Start for free <ArrowRight className="h-4 w-4" />
          </Link>
          <button className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-semibold px-8 py-4 rounded-xl text-base border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
            <Play className="h-4 w-4 fill-current" /> Watch demo
          </button>
        </div>

        {/* Mock dashboard preview */}
        <div className="relative mx-auto max-w-5xl">
          <div className="rounded-2xl border border-violet-200 dark:border-violet-800/50 bg-white dark:bg-gray-900 shadow-2xl shadow-violet-500/10 overflow-hidden p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-3 w-3 rounded-full bg-red-400" />
              <div className="h-3 w-3 rounded-full bg-yellow-400" />
              <div className="h-3 w-3 rounded-full bg-green-400" />
              <div className="flex-1 mx-4 h-6 bg-gray-100 dark:bg-gray-800 rounded-md" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: "Posts Scheduled", value: "247", trend: "↑ 12%" },
                { label: "Accounts", value: "38", trend: "↑ 5 new" },
                { label: "AI Credits", value: "1,842", trend: "used this month" },
                { label: "Engagement", value: "6.8%", trend: "↑ 0.3%" },
              ].map((s) => (
                <div key={s.label} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-left">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{s.value}</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">{s.trend}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => (
                <div key={day} className="text-center">
                  <p className="text-xs text-gray-400 mb-1.5">{day}</p>
                  <div className="aspect-square rounded-lg bg-gray-100 dark:bg-gray-800 flex flex-col items-center justify-center gap-1">
                    <span className="text-xs text-gray-600 dark:text-gray-400">{i + 14}</span>
                    {[1, 3, 5].includes(i) && (
                      <div className="flex gap-0.5">
                        <div className="h-1 w-1 rounded-full bg-violet-500" />
                        {i === 3 && <div className="h-1 w-1 rounded-full bg-blue-500" />}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SocialProof() {
  const companies = ["Agency Pro", "MediaCo", "BrandLift", "ContentX", "GrowthStack", "ViralHQ"];
  return (
    <section className="py-12 border-y border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
      <div className="max-w-7xl mx-auto px-4">
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-6 font-medium">Trusted by teams at:</p>
        <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
          {companies.map((c) => (
            <span key={c} className="text-gray-400 dark:text-gray-500 font-bold text-lg tracking-tight">{c}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

const features = [
  { icon: Calendar, title: "Smart Scheduling", desc: "AI picks optimal posting times per platform based on your audience activity and past performance." },
  { icon: Sparkles, title: "AI Content Studio", desc: "Generate captions, images, and video scripts with GPT-4o and Fal.ai in seconds." },
  { icon: BarChart3, title: "Unified Analytics", desc: "Cross-platform performance dashboards. Track reach, engagement, growth in one view." },
  { icon: Building2, title: "Agency White-label", desc: "Custom branding, domain, and colours. Offer social scheduling under your own agency brand." },
  { icon: Share2, title: "8 Platforms", desc: "Instagram, TikTok, YouTube, LinkedIn, Twitter/X, Facebook, Pinterest, Threads — all connected." },
  { icon: Shield, title: "Enterprise Security", desc: "AES-256-GCM encrypted tokens, full audit logs, and role-based access control built-in." },
];

function Features() {
  return (
    <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-violet-600 dark:text-violet-400 font-semibold text-sm mb-3">Everything you need</p>
          <h2 className="text-4xl font-extrabold text-gray-900 dark:text-white mb-4">Powerful features, zero complexity</h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">Built for agencies and creators who want to move fast, stay consistent, and grow every channel.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-lg hover:shadow-violet-500/5 transition-all duration-200">
              <div className="h-11 w-11 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center mb-4 group-hover:bg-violet-600 transition-colors">
                <f.icon className="h-5 w-5 text-violet-600 dark:text-violet-400 group-hover:text-white transition-colors" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-2">{f.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const plans = [
  { name: "Free", monthly: 0, yearly: 0, popular: false, features: ["1 workspace", "3 social accounts", "50 AI credits/mo", "Basic analytics", "Email support"] },
  { name: "Starter", monthly: 29, yearly: 23, popular: true, features: ["3 workspaces", "10 social accounts", "500 AI credits/mo", "Advanced analytics", "Priority support", "Bulk scheduling"] },
  { name: "Pro", monthly: 79, yearly: 63, popular: false, features: ["10 workspaces", "Unlimited accounts", "2,000 AI credits/mo", "Custom reports", "Phone + email support", "API access"] },
  { name: "Agency", monthly: 199, yearly: 159, popular: false, features: ["Unlimited workspaces", "Unlimited accounts", "Unlimited AI credits", "White-label branding", "Dedicated support", "Client portals"] },
];

function Pricing() {
  const [yearly, setYearly] = React.useState(false);
  return (
    <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900/50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-violet-600 dark:text-violet-400 font-semibold text-sm mb-3">Simple pricing</p>
          <h2 className="text-4xl font-extrabold text-gray-900 dark:text-white mb-4">Plans for every team size</h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">Start free, upgrade as you grow. No hidden fees.</p>
          <div className="inline-flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1.5">
            <button onClick={() => setYearly(false)} className={cn("px-4 py-1.5 rounded-lg text-sm font-semibold transition-all", !yearly ? "bg-violet-600 text-white shadow-sm" : "text-gray-600 dark:text-gray-400")}>Monthly</button>
            <button onClick={() => setYearly(true)} className={cn("px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2", yearly ? "bg-violet-600 text-white shadow-sm" : "text-gray-600 dark:text-gray-400")}>
              Yearly <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-1.5 py-0.5 rounded-full">-20%</span>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
          {plans.map((plan) => (
            <div key={plan.name} className={cn(
              "relative bg-white dark:bg-gray-900 rounded-2xl p-6 border transition-all",
              plan.popular ? "border-violet-500 shadow-xl shadow-violet-500/10 lg:scale-105" : "border-gray-200 dark:border-gray-800 hover:border-violet-300 hover:shadow-lg"
            )}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-violet-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow">Most Popular</span>
                </div>
              )}
              <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-2">{plan.name}</h3>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-4xl font-extrabold text-gray-900 dark:text-white">${yearly ? plan.yearly : plan.monthly}</span>
                <span className="text-gray-500 mb-1">/mo</span>
              </div>
              {yearly && plan.monthly > 0 && <p className="text-xs text-gray-400 mb-4">billed annually</p>}
              <div className="my-4 border-t border-gray-100 dark:border-gray-800" />
              <ul className="space-y-2.5 mb-6">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-violet-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">{feat}</span>
                  </li>
                ))}
              </ul>
              <Link href="/signup" className={cn("block text-center py-2.5 rounded-xl text-sm font-semibold transition-all", plan.popular ? "bg-violet-600 hover:bg-violet-700 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800")}>
                {plan.monthly === 0 ? "Get started free" : "Get started"}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const testimonials = [
  { quote: "We cut our social media management time by 70%. SocialForge handles scheduling across all our client accounts effortlessly.", name: "Sarah K.", role: "Marketing Director · BrandLift" },
  { quote: "The AI caption generator alone is worth the price. I went from spending 2 hours on captions to 10 minutes. It just works.", name: "James T.", role: "Content Creator · Independent" },
  { quote: "The white-label feature let us offer social scheduling under our own brand to all 40+ of our retainer clients.", name: "Priya M.", role: "Agency Owner · ContentX Studio" },
];

function Testimonials() {
  return (
    <section id="testimonials" className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-violet-600 dark:text-violet-400 font-semibold text-sm mb-3">What teams are saying</p>
          <h2 className="text-4xl font-extrabold text-gray-900 dark:text-white">Loved by agencies worldwide</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((t) => (
            <div key={t.name} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 hover:shadow-lg transition-shadow">
              <div className="flex gap-0.5 mb-4">
                {Array(5).fill(0).map((_, i) => <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />)}
              </div>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-5 italic">&ldquo;{t.quote}&rdquo;</p>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">{t.name[0]}</div>
                <div>
                  <p className="font-semibold text-sm text-gray-900 dark:text-white">{t.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTABanner() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="relative bg-gradient-to-br from-violet-600 via-violet-700 to-purple-700 rounded-3xl p-12 text-center overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_50%)]" />
          <div className="relative z-10">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">Ready to automate your social media?</h2>
            <p className="text-violet-200 text-lg mb-8">Join 2,000+ agencies. No credit card required.</p>
            <Link href="/signup" className="inline-flex items-center gap-2 bg-white text-violet-700 font-bold px-8 py-4 rounded-xl hover:bg-violet-50 transition-colors shadow-lg">
              Start your 14-day free trial <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const cols = [
    { title: "Product", links: ["Features", "Pricing", "Changelog", "Roadmap"] },
    { title: "Company", links: ["About", "Blog", "Careers", "Press"] },
    { title: "Legal", links: ["Privacy Policy", "Terms of Service", "GDPR", "Cookies"] },
  ];
  return (
    <footer className="bg-gray-950 border-t border-gray-800 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-lg bg-violet-600 flex items-center justify-center"><Zap className="h-4 w-4 text-white fill-white" /></div>
              <span className="font-bold text-white">SocialForge</span>
            </Link>
            <p className="text-sm text-gray-400 leading-relaxed max-w-xs mb-5">The all-in-one social media automation platform for agencies and creators.</p>
            <div className="flex items-center gap-3">
              <a href="#" className="h-8 w-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"><Twitter className="h-4 w-4" /></a>
              <a href="#" className="h-8 w-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"><Linkedin className="h-4 w-4" /></a>
              <a href="#" className="h-8 w-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"><Github className="h-4 w-4" /></a>
            </div>
          </div>
          {cols.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-white mb-4">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (<li key={link}><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">{link}</a></li>))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">© {new Date().getFullYear()} SocialForge, Inc. All rights reserved.</p>
          <p className="text-sm text-gray-500">Built with ♥ for agencies worldwide</p>
        </div>
      </div>
    </footer>
  );
}

export default function RootPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();

  React.useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) router.replace("/dashboard");
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) return null;
  if (isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <Navbar />
      <Hero />
      <SocialProof />
      <Features />
      <Pricing />
      <Testimonials />
      <CTABanner />
      <Footer />
    </div>
  );
}
