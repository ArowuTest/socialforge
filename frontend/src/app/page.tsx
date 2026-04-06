"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Zap, Menu, X, Check, Star, Play,
  Twitter, Linkedin, Github, Sparkles,
  Calendar, RefreshCw, Video, Building2, Globe,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth";
import HeroDemoVideo from "@/components/HeroDemoVideo";

/* ─────────────────────────────────────────────
   CSS KEYFRAMES (injected once, server-safe)
───────────────────────────────────────────── */
const GLOBAL_STYLES = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50%       { transform: translateY(-10px); }
  }
  @keyframes shimmer {
    0%   { background-position: -200% center; }
    100% { background-position:  200% center; }
  }
  @keyframes gradientShift {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  @keyframes pulseGlow {
    0%, 100% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.4), 0 0 30px rgba(124, 58, 237, 0.15); }
    50%       { box-shadow: 0 0 0 8px rgba(124, 58, 237, 0), 0 0 50px rgba(124, 58, 237, 0.3); }
  }
  .animate-fade-in-up   { animation: fadeInUp 0.6s ease forwards; }
  .animate-float        { animation: float 4s ease-in-out infinite; }
  .animate-pulse-glow   { animation: pulseGlow 2.5s ease-in-out infinite; }
  .gradient-text {
    background: linear-gradient(135deg, #a78bfa, #34d399);
    background-size: 200% 200%;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: gradientShift 4s ease infinite;
  }
  .shimmer-text {
    background: linear-gradient(90deg, #a78bfa 0%, #f0abfc 40%, #34d399 60%, #a78bfa 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: shimmer 3s linear infinite;
  }
  .glass {
    background: rgba(15, 23, 42, 0.8);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }
  .glass-card {
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }
  .scrollbar-hide::-webkit-scrollbar { display: none; }
  .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
  .hero-glow::before {
    content: '';
    position: absolute;
    top: -200px;
    left: 50%;
    transform: translateX(-50%);
    width: 900px;
    height: 600px;
    background: radial-gradient(ellipse at center, rgba(109,40,217,0.18) 0%, transparent 70%);
    pointer-events: none;
  }
  .step-connector {
    position: absolute;
    top: 28px;
    left: calc(50% + 48px);
    right: calc(-50% + 48px);
    border-top: 2px dashed rgba(109,40,217,0.35);
  }
`;

/* ─────────────────────────────────────────────
   NAVBAR
───────────────────────────────────────────── */
function Navbar() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#pricing" },
    { label: "About", href: "#about" },
  ];

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? "rgba(2,6,23,0.85)" : "rgba(2,6,23,0.6)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderBottom: scrolled
          ? "1px solid rgba(255,255,255,0.1)"
          : "1px solid rgba(255,255,255,0.04)",
        boxShadow: scrolled ? "0 4px 40px rgba(0,0,0,0.4)" : "none",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}
            >
              <Zap className="h-4.5 w-4.5 text-white" style={{ height: 18, width: 18 }} strokeWidth={2.5} />
            </div>
            <span className="font-bold text-lg text-white tracking-tight">SocialForge</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="text-sm font-medium text-slate-400 hover:text-white transition-colors duration-200"
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-slate-400 hover:text-white transition-colors px-3 py-2"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold text-white px-5 py-2.5 rounded-xl transition-all duration-200 hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}
            >
              Start free →
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          className="md:hidden border-t"
          style={{
            background: "rgba(2,6,23,0.95)",
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <div className="px-4 py-4 space-y-1">
            {navLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="block text-sm font-medium text-slate-300 hover:text-white py-2.5 px-3 rounded-lg hover:bg-white/5 transition-all"
                onClick={() => setMobileOpen(false)}
              >
                {l.label}
              </a>
            ))}
            <div className="pt-3 mt-3 border-t flex flex-col gap-2" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
              <Link href="/login" className="text-sm font-medium text-center py-2.5 text-slate-300 hover:text-white">
                Sign in
              </Link>
              <Link
                href="/signup"
                className="text-sm font-semibold text-center py-3 rounded-xl text-white"
                style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}
              >
                Start free →
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

/* ─────────────────────────────────────────────
   HERO
───────────────────────────────────────────── */
function Hero() {
  return (
    <section
      className="relative min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 overflow-hidden hero-glow"
      style={{
        background: "radial-gradient(ellipse 120% 80% at 50% 0%, rgba(109,40,217,0.15) 0%, #020617 60%)",
      }}
    >
      {/* Glow orbs */}
      <div
        className="absolute top-20 left-10 w-72 h-72 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)", filter: "blur(40px)" }}
      />
      <div
        className="absolute bottom-32 right-10 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(52,211,153,0.1) 0%, transparent 70%)", filter: "blur(60px)" }}
      />

      <div className="relative z-10 max-w-5xl mx-auto text-center pt-24 pb-12">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-8 animate-fade-in-up"
          style={{ background: "rgba(6,78,59,0.4)", border: "1px solid rgba(52,211,153,0.3)" }}>
          <span className="text-sm font-semibold" style={{ color: "#34d399" }}>
            🇳🇬 Built for Africa &amp; the World
          </span>
        </div>

        {/* Headline */}
        <h1
          className="text-5xl md:text-7xl font-black leading-[1.05] tracking-tight mb-6 animate-fade-in-up"
          style={{ animationDelay: "0.1s" }}
        >
          <span className="block text-white">Schedule once.</span>
          <span className="block gradient-text">Publish everywhere.</span>
          <span className="block text-white">Grow faster.</span>
        </h1>

        {/* Subtitle */}
        <p
          className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in-up"
          style={{ animationDelay: "0.2s" }}
        >
          The AI-powered social media platform used by{" "}
          <span className="text-white font-semibold">500+ creators and agencies</span>{" "}
          across 30 countries.
        </p>

        {/* CTAs */}
        <div
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14 animate-fade-in-up"
          style={{ animationDelay: "0.3s" }}
        >
          <Link
            href="/signup"
            className="animate-pulse-glow inline-flex items-center gap-2 text-white font-bold px-8 py-4 rounded-xl text-base transition-all hover:opacity-90 hover:-translate-y-0.5"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
              transform: "translateZ(0)",
            }}
          >
            Start free — no card needed
          </Link>
          <button
            className="inline-flex items-center gap-2.5 font-semibold px-8 py-4 rounded-xl text-base text-slate-300 hover:text-white transition-all hover:-translate-y-0.5"
            style={{ border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)" }}
          >
            <Play className="h-4 w-4 fill-current text-violet-400" />
            Watch demo
          </button>
        </div>

        {/* Social proof avatars */}
        <div
          className="flex items-center justify-center gap-4 mb-16 animate-fade-in-up"
          style={{ animationDelay: "0.4s" }}
        >
          <div className="flex -space-x-2">
            {[
              { initial: "A", bg: "#059669" },
              { initial: "D", bg: "#2563eb" },
              { initial: "S", bg: "#7c3aed" },
              { initial: "K", bg: "#d97706" },
              { initial: "M", bg: "#db2777" },
            ].map(({ initial, bg }) => (
              <div
                key={initial}
                className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
                style={{ background: bg, border: "2px solid #020617" }}
              >
                {initial}
              </div>
            ))}
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white">500+ teams trust us</p>
            <p className="text-xs text-amber-400">★★★★★ 4.9/5 rating</p>
          </div>
        </div>

        {/* Remotion animated product demo */}
        <div className="mx-auto max-w-3xl animate-fade-in-up" style={{ animationDelay: "0.5s" }}>
          <HeroDemoVideo />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   PLATFORM STRIP
───────────────────────────────────────────── */
const PLATFORMS = [
  { name: "Instagram", dot: "#ec4899" },
  { name: "TikTok", dot: "#06b6d4" },
  { name: "YouTube", dot: "#ef4444" },
  { name: "LinkedIn", dot: "#3b82f6" },
  { name: "Twitter / X", dot: "#94a3b8" },
  { name: "Facebook", dot: "#2563eb" },
  { name: "Pinterest", dot: "#ef4444" },
  { name: "Threads", dot: "#f1f5f9" },
];

function PlatformStrip() {
  return (
    <section className="py-16 px-4" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="max-w-7xl mx-auto">
        <p className="text-center text-sm font-semibold text-slate-500 uppercase tracking-widest mb-8">
          Publish to 8 platforms in one click
        </p>
        <div className="flex overflow-x-auto scrollbar-hide gap-3 justify-start md:justify-center pb-2">
          {PLATFORMS.map((p) => (
            <div
              key={p.name}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium text-slate-300 transition-all hover:text-white"
              style={{
                background: "rgba(15,23,42,0.8)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: p.dot }} />
              {p.name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   FEATURES
───────────────────────────────────────────── */
const FEATURES = [
  {
    emoji: "🤖",
    title: "AI Content Engine",
    desc: "Describe your idea in plain text and get 8 platform-ready versions instantly. Captions, hooks, hashtags — all optimised per channel.",
    iconGradient: "linear-gradient(135deg, rgba(124,58,237,0.4), rgba(109,40,217,0.15))",
    iconBorder: "rgba(124,58,237,0.5)",
  },
  {
    emoji: "📅",
    title: "Smart Scheduling",
    desc: "AI picks your best posting windows based on audience activity. Set it once, let SocialForge publish forever.",
    iconGradient: "linear-gradient(135deg, rgba(59,130,246,0.4), rgba(37,99,235,0.15))",
    iconBorder: "rgba(59,130,246,0.5)",
  },
  {
    emoji: "♻️",
    title: "Repurpose Engine",
    desc: "Turn one long-form video or blog post into 12 different pieces of content across every format in seconds.",
    iconGradient: "linear-gradient(135deg, rgba(52,211,153,0.4), rgba(16,185,129,0.15))",
    iconBorder: "rgba(52,211,153,0.5)",
  },
  {
    emoji: "🎥",
    title: "AI Media Studio",
    desc: "Generate images, short clips, and thumbnails with built-in AI. No Canva subscription required.",
    iconGradient: "linear-gradient(135deg, rgba(236,72,153,0.4), rgba(219,39,119,0.15))",
    iconBorder: "rgba(236,72,153,0.5)",
  },
  {
    emoji: "🏢",
    title: "Agency Tools",
    desc: "Manage 50+ client accounts from one white-label dashboard. Custom branding, team roles, client portals, and audit logs.",
    iconGradient: "linear-gradient(135deg, rgba(251,146,60,0.4), rgba(234,88,12,0.15))",
    iconBorder: "rgba(251,146,60,0.5)",
  },
  {
    emoji: "🇳🇬",
    title: "Built for Nigeria",
    desc: "Local pricing in Naira. Pay seamlessly via Paystack. Support teams in WAT timezone. No dollar card required.",
    iconGradient: "linear-gradient(135deg, rgba(34,197,94,0.4), rgba(22,163,74,0.15))",
    iconBorder: "rgba(34,197,94,0.5)",
    badge: "NGN pricing • Paystack",
  },
];

function Features() {
  return (
    <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#a78bfa" }}>
            Everything you need
          </p>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-5 leading-tight">
            Everything you need to<br />
            <span className="gradient-text">dominate social media</span>
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Built for agencies and creators who want to move fast, stay consistent, and grow every channel.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1 relative"
              style={{
                background: "rgba(15,23,42,0.5)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(124,58,237,0.4)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 40px rgba(109,40,217,0.1)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.08)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
              }}
            >
              {f.badge && (
                <span
                  className="absolute top-4 right-4 text-xs font-bold px-2 py-1 rounded-full"
                  style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)" }}
                >
                  {f.badge}
                </span>
              )}
              <div
                className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl mb-4"
                style={{ background: f.iconGradient, border: `1px solid ${f.iconBorder}` }}
              >
                {f.emoji}
              </div>
              <h3 className="font-bold text-white text-lg mb-2">{f.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   HOW IT WORKS
───────────────────────────────────────────── */
const STEPS = [
  {
    n: "01",
    title: "Connect your socials",
    desc: "OAuth in one click. Instagram, TikTok, YouTube, LinkedIn, and 4 more — connected and ready in under 2 minutes.",
  },
  {
    n: "02",
    title: "Create or generate content",
    desc: "Write it yourself or describe your idea to AI and get 8 platform-ready versions. Images, captions, hashtags — done.",
  },
  {
    n: "03",
    title: "Schedule & track",
    desc: "Set your posting schedule once. SocialForge handles the rest, forever. Watch your analytics climb.",
  },
];

function HowItWorks() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8" style={{ background: "rgba(109,40,217,0.04)" }}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#a78bfa" }}>
            Simple process
          </p>
          <h2 className="text-4xl md:text-5xl font-black text-white">
            Get started in 3 simple steps
          </h2>
        </div>

        {/* Steps */}
        <div className="flex flex-col md:flex-row gap-10 md:gap-0">
          {STEPS.map((step, idx) => (
            <div key={step.n} className="flex-1 relative flex flex-col items-center text-center px-6">
              {/* Connector line (desktop only) */}
              {idx < STEPS.length - 1 && (
                <div
                  className="hidden md:block absolute top-7 left-[calc(50%+48px)] right-[calc(-50%+48px)]"
                  style={{ borderTop: "2px dashed rgba(109,40,217,0.4)", zIndex: 0 }}
                />
              )}

              {/* Number circle */}
              <div
                className="relative z-10 h-14 w-14 rounded-full flex items-center justify-center text-white font-black text-xl mb-5 flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)", boxShadow: "0 0 24px rgba(124,58,237,0.4)" }}
              >
                {step.n}
              </div>

              <h3 className="font-bold text-white text-lg mb-3">{step.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed max-w-xs">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   PRICING
───────────────────────────────────────────── */
const PLANS = [
  {
    name: "Free",
    usd: 0,
    ngn: 0,
    usdYearly: 0,
    ngnYearly: 0,
    popular: false,
    features: [
      "2 social accounts",
      "50 AI credits / mo",
      "Basic scheduling",
      "1 workspace",
    ],
    cta: "Get started free",
    ctaSolid: false,
  },
  {
    name: "Starter",
    usd: 29,
    ngn: 46400,
    usdYearly: 24,
    ngnYearly: 38400,
    popular: false,
    features: [
      "5 social accounts",
      "500 AI credits / mo",
      "All 8 platforms",
      "Analytics dashboard",
      "Email support",
    ],
    cta: "Start Starter",
    ctaSolid: false,
  },
  {
    name: "Pro",
    usd: 79,
    ngn: 126400,
    usdYearly: 65,
    ngnYearly: 104000,
    popular: true,
    features: [
      "15 social accounts",
      "2,000 AI credits / mo",
      "Advanced analytics",
      "Content templates",
      "Priority support",
      "White-label (coming soon)",
    ],
    cta: "Start Pro",
    ctaSolid: true,
  },
  {
    name: "Agency",
    usd: 199,
    ngn: 318400,
    usdYearly: 165,
    ngnYearly: 264000,
    popular: false,
    features: [
      "50 social accounts",
      "10,000 AI credits / mo",
      "White-label dashboard",
      "Developer API",
      "Dedicated support",
      "Custom domain",
    ],
    cta: "Start Agency",
    ctaSolid: false,
  },
];

function fmtNgn(n: number) {
  return n === 0 ? "₦0" : `₦${n.toLocaleString("en-NG")}`;
}

function Pricing() {
  const [yearly, setYearly] = React.useState(false);

  return (
    <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#a78bfa" }}>
            Pricing
          </p>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            Pricing that scales with you
          </h2>
          <p className="text-lg text-slate-400 mb-8">Start free. Upgrade as you grow. Cancel anytime.</p>

          {/* Toggle */}
          <div
            className="inline-flex items-center gap-1 p-1.5 rounded-xl"
            style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <button
              onClick={() => setYearly(false)}
              className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
              style={!yearly ? { background: "linear-gradient(135deg, #7c3aed, #6d28d9)", color: "white" } : { color: "#94a3b8" }}
            >
              Monthly
            </button>
            <button
              onClick={() => setYearly(true)}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all"
              style={yearly ? { background: "linear-gradient(135deg, #7c3aed, #6d28d9)", color: "white" } : { color: "#94a3b8" }}
            >
              Yearly
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(52,211,153,0.2)", color: "#34d399", border: "1px solid rgba(52,211,153,0.3)" }}
              >
                -17%
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className="relative rounded-2xl p-6 flex flex-col transition-all duration-300 hover:-translate-y-1"
              style={{
                background: plan.popular ? "rgba(109,40,217,0.12)" : "rgba(15,23,42,0.6)",
                border: plan.popular ? "1px solid rgba(124,58,237,0.6)" : "1px solid rgba(255,255,255,0.08)",
                boxShadow: plan.popular ? "0 0 60px rgba(109,40,217,0.15)" : "none",
              }}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span
                    className="text-xs font-bold px-4 py-1.5 rounded-full text-white whitespace-nowrap"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}
                  >
                    Most Popular
                  </span>
                </div>
              )}

              <h3 className="font-bold text-white text-lg mb-1">{plan.name}</h3>

              {/* USD price */}
              <div className="flex items-end gap-1 mb-1">
                {yearly && plan.usd > 0 && (
                  <span className="text-slate-600 line-through text-lg font-bold mr-1">${plan.usd}</span>
                )}
                <span className="text-4xl font-black text-white">
                  ${yearly ? plan.usdYearly : plan.usd}
                </span>
                <span className="text-slate-500 pb-1">/mo</span>
              </div>

              {/* NGN price */}
              <p className="text-xs text-slate-500 mb-4">
                {yearly ? fmtNgn(plan.ngnYearly) : fmtNgn(plan.ngn)}/mo
                {yearly && plan.usd > 0 && <span className="ml-2 text-emerald-400">2 months free</span>}
              </p>

              <div className="h-px mb-5" style={{ background: "rgba(255,255,255,0.06)" }} />

              <ul className="space-y-2.5 mb-6 flex-1">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2">
                    <Check className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: plan.popular ? "#a78bfa" : "#34d399" }} />
                    <span className="text-sm text-slate-400">{feat}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                className="block text-center py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 hover:-translate-y-0.5"
                style={
                  plan.ctaSolid
                    ? { background: "linear-gradient(135deg, #7c3aed, #6d28d9)", color: "white" }
                    : { border: "1px solid rgba(255,255,255,0.15)", color: "white", background: "rgba(255,255,255,0.04)" }
                }
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   TESTIMONIALS
───────────────────────────────────────────── */
const TESTIMONIALS = [
  {
    quote: "SocialForge cut our content production time by 70%. The repurpose feature alone is worth every penny.",
    name: "Amara O.",
    role: "Marketing Director",
    flag: "🇳🇬",
    initial: "A",
    avatarBg: "#059669",
  },
  {
    quote: "Finally a tool that understands African creators. Paystack support is a game-changer — no more dollar card stress.",
    name: "David K.",
    role: "Content Creator",
    flag: "🇬🇭",
    initial: "D",
    avatarBg: "#2563eb",
  },
  {
    quote: "We manage 23 client accounts from one dashboard. Our agency couldn't operate without SocialForge.",
    name: "Sarah M.",
    role: "Agency Owner",
    flag: "🇬🇧",
    initial: "S",
    avatarBg: "#7c3aed",
  },
];

function Testimonials() {
  return (
    <section
      id="testimonials"
      className="py-24 px-4 sm:px-6 lg:px-8"
      style={{ background: "rgba(109,40,217,0.04)" }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-5">
          <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: "#a78bfa" }}>
            Testimonials
          </p>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-3">
            Loved by teams worldwide
          </h2>
          <p className="text-lg text-slate-400">🇳🇬 🇬🇭 🇬🇧 🇺🇸 🇨🇦 and more</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-14">
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              className="rounded-2xl p-6 flex flex-col transition-all duration-300 hover:-translate-y-1"
              style={{
                background: "rgba(15,23,42,0.7)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {/* Stars */}
              <div className="flex gap-0.5 mb-4">
                {Array(5).fill(null).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                ))}
              </div>

              <p className="text-slate-300 leading-relaxed mb-6 flex-1 text-[15px]">
                &ldquo;{t.quote}&rdquo;
              </p>

              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                  style={{ background: t.avatarBg }}
                >
                  {t.initial}
                </div>
                <div>
                  <p className="font-bold text-white text-sm">{t.name}</p>
                  <p className="text-xs text-slate-500">
                    {t.role} {t.flag}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   CTA BANNER
───────────────────────────────────────────── */
function CTABanner() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div
          className="relative rounded-3xl p-12 md:p-16 text-center overflow-hidden"
          style={{ background: "linear-gradient(135deg, #4c1d95, #6d28d9, #7c3aed)" }}
        >
          {/* Decorative blobs */}
          <div
            className="absolute top-0 right-0 w-72 h-72 pointer-events-none"
            style={{
              background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)",
              transform: "translate(30%, -30%)",
            }}
          />
          <div
            className="absolute bottom-0 left-0 w-64 h-64 pointer-events-none"
            style={{
              background: "radial-gradient(circle, rgba(52,211,153,0.1) 0%, transparent 70%)",
              transform: "translate(-30%, 30%)",
            }}
          />

          <div className="relative z-10">
            <h2 className="text-3xl md:text-5xl font-black text-white mb-4 leading-tight">
              Ready to 10x your<br />social media output?
            </h2>
            <p className="text-lg mb-10" style={{ color: "rgba(255,255,255,0.7)" }}>
              Join 500+ teams already growing with SocialForge
            </p>
            <Link
              href="/signup"
              className="inline-block font-black text-lg px-10 py-4 rounded-xl transition-all hover:opacity-95 hover:-translate-y-0.5"
              style={{ background: "white", color: "#6d28d9" }}
            >
              Start free today →
            </Link>
            <p className="text-sm mt-5" style={{ color: "rgba(255,255,255,0.45)" }}>
              No credit card required &nbsp;•&nbsp; Cancel anytime &nbsp;•&nbsp; NGN pricing available
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   FOOTER
───────────────────────────────────────────── */
const FOOTER_COLS = [
  {
    title: "Product",
    links: ["Features", "Pricing", "Changelog", "Roadmap"],
  },
  {
    title: "Company",
    links: ["About", "Blog", "Careers", "Press"],
  },
  {
    title: "Resources",
    links: ["Documentation", "API Reference", "Community", "Status"],
  },
  {
    title: "Legal",
    links: ["Privacy Policy", "Terms of Service", "GDPR", "Cookies"],
  },
];

function Footer() {
  return (
    <footer
      className="py-16 px-4 sm:px-6 lg:px-8"
      style={{ background: "#020617", borderTop: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
          {/* Brand col */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4 group">
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #7c3aed, #6d28d9)" }}
              >
                <Zap className="text-white" style={{ height: 18, width: 18 }} strokeWidth={2.5} />
              </div>
              <span className="font-bold text-lg text-white">SocialForge</span>
            </Link>
            <p className="text-sm text-slate-500 leading-relaxed max-w-xs mb-6">
              The AI-powered social media platform built for agencies and creators worldwide.
            </p>
            <div className="flex items-center gap-2">
              {[
                { Icon: Twitter, href: "#" },
                { Icon: Linkedin, href: "#" },
                { Icon: Github, href: "#" },
              ].map(({ Icon, href }, i) => (
                <a
                  key={i}
                  href={href}
                  className="h-9 w-9 rounded-full flex items-center justify-center text-slate-500 hover:text-white transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link cols */}
          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-white mb-4">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-slate-500 hover:text-white transition-colors"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <p className="text-sm text-slate-600">© 2026 SocialForge, Inc. All rights reserved.</p>
          <p className="text-sm text-slate-600">
            Built with ♥ for Africa &amp; the World
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ─────────────────────────────────────────────
   ROOT PAGE
───────────────────────────────────────────── */
export default function RootPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();

  React.useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) router.push("/dashboard");
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) return null;
  if (isAuthenticated) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_STYLES }} />
      <div className="min-h-screen" style={{ background: "#020617", color: "white" }}>
        <Navbar />
        <Hero />
        <PlatformStrip />
        <Features />
        <HowItWorks />
        <Pricing />
        <Testimonials />
        <CTABanner />
        <Footer />
      </div>
    </>
  );
}
