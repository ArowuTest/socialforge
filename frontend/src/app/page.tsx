"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Zap, Menu, X, Check, Star, ChevronDown, ChevronRight,
  Twitter, Linkedin, Github, Sparkles, Calendar, RefreshCw,
  Building2, Globe, ArrowRight, Play, Users, Briefcase,
  Shield, Cpu, BarChart3, Layers, MessageSquare, Image,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth";

const HeroDemoPlayer = dynamic(() => import("@/components/remotion/HeroDemoPlayer"), { ssr: false });
const HowItWorksPlayer = dynamic(() => import("@/components/remotion/HowItWorksPlayer"), { ssr: false });
const RepurposePlayer = dynamic(() => import("@/components/remotion/RepurposePlayer"), { ssr: false });
const AIStudioPlayer = dynamic(() => import("@/components/remotion/AIStudioPlayer"), { ssr: false });

/* ─── GLOBAL STYLES ─── */
const GLOBAL_STYLES = `
@keyframes fadeUp { from { opacity:0; transform:translateY(32px); } to { opacity:1; transform:translateY(0); } }
@keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
@keyframes float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-12px); } }
@keyframes glow { 0%,100% { box-shadow:0 0 20px rgba(124,58,237,0.3); } 50% { box-shadow:0 0 60px rgba(124,58,237,0.7), 0 0 100px rgba(124,58,237,0.3); } }
@keyframes gradientMove { 0% { background-position:0% 50%; } 50% { background-position:100% 50%; } 100% { background-position:0% 50%; } }
@keyframes shimmer { from { transform:translateX(-100%); } to { transform:translateX(100%); } }
@keyframes marquee { from { transform:translateX(0); } to { transform:translateX(-50%); } }
@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
@keyframes spin { to { transform:rotate(360deg); } }
@keyframes drawLine { from { stroke-dashoffset:1000; } to { stroke-dashoffset:0; } }

.animate-fade-up { animation: fadeUp 0.7s ease forwards; }
.animate-glow { animation: glow 3s ease-in-out infinite; }
.animate-float { animation: float 5s ease-in-out infinite; }
.animate-gradient { background-size:200% 200%; animation: gradientMove 4s ease infinite; }
.animate-marquee { animation: marquee 30s linear infinite; }
.animate-pulse { animation: pulse 2s ease-in-out infinite; }

.grain::after {
  content:''; position:fixed; inset:0; pointer-events:none; z-index:999;
  opacity:0.035;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
}

.text-gradient-violet { background: linear-gradient(135deg, #a78bfa, #7c3aed, #4f46e5); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
.text-gradient-hero { background: linear-gradient(135deg, #f8fafc 0%, #a78bfa 40%, #34d399 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
.text-gradient-emerald { background: linear-gradient(135deg, #34d399, #10b981); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }

.glass { background:rgba(15,23,42,0.6); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.06); }
.glass-hover { transition:all 0.3s ease; }
.glass-hover:hover { background:rgba(15,23,42,0.8); border-color:rgba(124,58,237,0.4); transform:translateY(-2px); box-shadow:0 20px 60px rgba(0,0,0,0.4), 0 0 40px rgba(124,58,237,0.1); }

.bento-card { position:relative; overflow:hidden; transition:all 0.4s cubic-bezier(0.4,0,0.2,1); }
.bento-card::before { content:''; position:absolute; inset:0; opacity:0; transition:opacity 0.4s; background:radial-gradient(600px circle at var(--mouse-x,50%) var(--mouse-y,50%), rgba(124,58,237,0.06), transparent 40%); pointer-events:none; z-index:0; }
.bento-card:hover::before { opacity:1; }
.bento-card:hover { border-color:rgba(124,58,237,0.3) !important; transform:translateY(-4px); box-shadow:0 30px 80px rgba(0,0,0,0.5), 0 0 60px rgba(124,58,237,0.08); }
.bento-card > * { position:relative; z-index:1; }

.shimmer-btn { position:relative; overflow:hidden; }
.shimmer-btn::after { content:''; position:absolute; top:0; left:-100%; width:60%; height:100%; background:linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent); animation: shimmer 3s ease-in-out infinite; }
`;

/* ─── VIDEO WRAPPER ─── */
function VideoFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "1px",
        background: "linear-gradient(135deg, rgba(124,58,237,0.5), rgba(52,211,153,0.3))",
        borderRadius: 20,
        boxShadow: "0 0 0 1px rgba(124,58,237,0.3), 0 50px 100px rgba(0,0,0,0.7), 0 0 80px rgba(124,58,237,0.2)",
      }}
    >
      <div style={{ background: "#020617", borderRadius: 19, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

/* ─── NAVBAR ─── */
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={
        scrolled
          ? { background: "rgba(2,6,23,0.85)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }
          : {}
      }
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center animate-glow flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
            >
              <Zap size={18} className="text-white" fill="white" />
            </div>
            <span className="text-white font-bold text-xl tracking-tight">SocialForge</span>
          </Link>

          {/* Center nav */}
          <div className="hidden md:flex items-center gap-8">
            {[
              { label: "Features", href: "#features" },
              { label: "Pricing", href: "#pricing" },
              { label: "How it works", href: "#how-it-works" },
              { label: "Testimonials", href: "#testimonials" },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-slate-400 hover:text-white text-sm font-medium transition-colors duration-200"
              >
                {item.label}
              </a>
            ))}
          </div>

          {/* Right */}
          <div className="hidden md:flex items-center gap-3">
            <Link href="/login" className="text-slate-400 hover:text-white text-sm font-medium transition-colors px-3 py-2">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="shimmer-btn animate-glow bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all duration-200"
            >
              Start free →
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-slate-400 hover:text-white p-2 rounded-lg transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden glass border-t border-white/5">
          <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-2">
            {[
              { label: "Features", href: "#features" },
              { label: "Pricing", href: "#pricing" },
              { label: "How it works", href: "#how-it-works" },
              { label: "Testimonials", href: "#testimonials" },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-slate-300 hover:text-white py-2.5 px-3 rounded-lg hover:bg-white/5 text-sm font-medium transition-all"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <div className="border-t border-white/5 pt-3 mt-1 flex flex-col gap-2">
              <Link
                href="/login"
                className="text-slate-400 hover:text-white py-2.5 px-3 rounded-lg hover:bg-white/5 text-sm font-medium transition-all"
                onClick={() => setMobileOpen(false)}
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold px-4 py-3 rounded-xl text-center transition-all"
                onClick={() => setMobileOpen(false)}
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

/* ─── HERO ─── */
function Hero() {
  const avatarColors = [
    { bg: "#7c3aed", initials: "AO" },
    { bg: "#0ea5e9", initials: "DK" },
    { bg: "#10b981", initials: "SM" },
    { bg: "#f59e0b", initials: "TA" },
    { bg: "#ef4444", initials: "MT" },
  ];

  return (
    <section
      className="grain relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{ background: "#020617" }}
    >
      {/* Radial gradient backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(109,40,217,0.18) 0%, transparent 70%)",
        }}
      />
      {/* Glow orbs */}
      <div
        className="absolute top-20 left-10 rounded-full blur-3xl pointer-events-none animate-float"
        style={{ width: 500, height: 500, background: "rgba(124,58,237,0.12)", animationDelay: "0s" }}
      />
      <div
        className="absolute bottom-20 right-10 rounded-full blur-3xl pointer-events-none animate-float"
        style={{ width: 420, height: 420, background: "rgba(52,211,153,0.07)", animationDelay: "2.5s" }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20 flex flex-col items-center text-center">
        {/* Badge */}
        <div
          className="animate-fade-up inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm text-violet-300 mb-8"
          style={{
            border: "1px solid rgba(124,58,237,0.3)",
            background: "rgba(109,40,217,0.15)",
            animationDelay: "0.1s",
            opacity: 0,
          }}
        >
          <Globe size={14} className="text-violet-400" />
          Trusted by 500+ teams across Africa &amp; the world
          <ArrowRight size={13} className="text-violet-400" />
        </div>

        {/* Headline */}
        <h1
          className="animate-fade-up font-black tracking-tighter leading-none"
          style={{
            fontSize: "clamp(3rem, 9vw, 6.5rem)",
            animationDelay: "0.2s",
            opacity: 0,
          }}
        >
          <span className="text-white block">One platform.</span>
          <span className="text-gradient-hero animate-gradient block">Eight networks.</span>
          <span className="text-white block">Zero limits.</span>
        </h1>

        {/* Subheadline */}
        <p
          className="animate-fade-up text-slate-400 max-w-2xl mt-6 leading-relaxed"
          style={{ fontSize: "clamp(1rem, 2.5vw, 1.35rem)", animationDelay: "0.35s", opacity: 0 }}
        >
          The AI-powered social media platform that writes your content, schedules it across 8 platforms,
          and grows your audience — in Naira or Dollars.
        </p>

        {/* CTA Row */}
        <div
          className="animate-fade-up flex flex-wrap gap-4 justify-center mt-10"
          style={{ animationDelay: "0.5s", opacity: 0 }}
        >
          <Link
            href="/signup"
            className="shimmer-btn bg-violet-600 hover:bg-violet-500 text-white text-lg font-bold px-8 py-4 rounded-2xl transition-all duration-200 hover:-translate-y-0.5"
            style={{ boxShadow: "0 8px 32px rgba(124,58,237,0.35)" }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 16px 48px rgba(124,58,237,0.55)")}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 8px 32px rgba(124,58,237,0.35)")}
          >
            Start for free →
          </Link>
          <Link
            href="#demo"
            className="flex items-center gap-2 border border-white/20 text-white px-6 py-4 rounded-2xl hover:bg-white/5 transition-all text-lg font-medium"
          >
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <Play size={14} className="text-white ml-0.5" fill="white" />
            </div>
            Watch demo
          </Link>
        </div>

        {/* Social proof */}
        <div
          className="animate-fade-up flex items-center gap-3 mt-8"
          style={{ animationDelay: "0.65s", opacity: 0 }}
        >
          <div className="flex items-center -space-x-3">
            {avatarColors.map((a) => (
              <div
                key={a.initials}
                className="w-8 h-8 rounded-full border-2 border-slate-900 flex items-center justify-center text-white text-xs font-bold"
                style={{ background: a.bg }}
              >
                {a.initials}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400">500+ teams growing faster</span>
            <span className="text-amber-400 font-semibold">★★★★★ 4.9</span>
          </div>
        </div>

        {/* Hero Video */}
        <div
          id="demo"
          className="animate-fade-up w-full max-w-5xl mt-16"
          style={{ animationDelay: "0.8s", opacity: 0 }}
        >
          <VideoFrame>
            <HeroDemoPlayer />
          </VideoFrame>
        </div>
      </div>
    </section>
  );
}

/* ─── MARQUEE ─── */
const PLATFORMS = [
  { name: "Instagram", color: "#e1306c" },
  { name: "TikTok", color: "#69c9d0" },
  { name: "YouTube", color: "#ff0000" },
  { name: "LinkedIn", color: "#0a66c2" },
  { name: "Twitter / X", color: "#ffffff" },
  { name: "Facebook", color: "#1877f2" },
  { name: "Pinterest", color: "#e60023" },
  { name: "Threads", color: "#a78bfa" },
];

function Marquee() {
  const pills = [...PLATFORMS, ...PLATFORMS];
  return (
    <div className="py-10 overflow-hidden" style={{ background: "rgba(15,23,42,0.4)" }}>
      <div
        className="flex gap-4"
        style={{
          maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
          WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
        }}
      >
        <div className="flex gap-4 animate-marquee flex-shrink-0">
          {pills.map((p, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/8 flex-shrink-0"
              style={{ background: "rgba(15,23,42,0.8)" }}
            >
              <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              <span className="text-slate-300 text-sm font-medium whitespace-nowrap">{p.name}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-4 animate-marquee flex-shrink-0" aria-hidden>
          {pills.map((p, i) => (
            <div
              key={`dup-${i}`}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/8 flex-shrink-0"
              style={{ background: "rgba(15,23,42,0.8)" }}
            >
              <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              <span className="text-slate-300 text-sm font-medium whitespace-nowrap">{p.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── STATS BAR ─── */
function StatsBar() {
  const stats = [
    { number: "500+", label: "Creators & agencies", color: "text-violet-400" },
    { number: "8", label: "Social platforms", color: "text-emerald-400" },
    { number: "10M+", label: "Posts scheduled", color: "text-sky-400" },
    { number: "30+", label: "Countries", color: "text-pink-400" },
  ];
  return (
    <div className="border-y border-white/5" style={{ background: "rgba(15,23,42,0.3)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s, i) => (
            <div
              key={i}
              className={`text-center ${i < 3 ? "md:border-r md:border-white/5" : ""}`}
            >
              <div className={`text-5xl font-black text-white tabular-nums`}>{s.number}</div>
              <div className={`text-sm mt-1.5 font-medium ${s.color}`}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── BENTO FEATURES ─── */
function Features() {
  const bentoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cards = bentoRef.current?.querySelectorAll(".bento-card");
    const handler = (e: MouseEvent) => {
      const card = (e.currentTarget as HTMLElement);
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
      card.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
    };
    cards?.forEach((c) => c.addEventListener("mousemove", handler as EventListener));
    return () => cards?.forEach((c) => c.removeEventListener("mousemove", handler as EventListener));
  }, []);

  return (
    <section id="features" className="py-24 md:py-32" style={{ background: "#020617" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <div className="text-center mb-16">
          <h2 className="text-5xl font-black text-white tracking-tight">Built different. Built better.</h2>
          <p className="text-slate-400 text-lg mt-4 max-w-xl mx-auto">
            Every feature designed for creators who are serious about growth.
          </p>
        </div>

        {/* Grid */}
        <div ref={bentoRef} className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-auto">

          {/* AI Content Engine — col-span-2 */}
          <div className="glass bento-card rounded-3xl p-8 md:col-span-2 border border-white/8">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(79,70,229,0.2))", border: "1px solid rgba(124,58,237,0.3)" }}>
                <Sparkles size={20} className="text-violet-400" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white">AI Content Engine</h3>
              </div>
            </div>
            <p className="text-slate-400 leading-relaxed mb-6">
              Our AI writes captions, hashtags, and full thread series. One brief → 8 platform-optimised posts in seconds.
            </p>
            {/* Mini mockup */}
            <div className="rounded-2xl p-4 mb-6" style={{ background: "rgba(2,6,23,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-start gap-3 mb-3">
                <div className="text-xs text-slate-500 mt-0.5 w-16 flex-shrink-0">Prompt</div>
                <div className="text-sm text-slate-300 font-mono">"write a viral hook about our launch"</div>
              </div>
              <div className="h-px bg-white/5 mb-3" />
              <div className="flex items-start gap-3">
                <div className="text-xs text-violet-400 mt-0.5 w-16 flex-shrink-0 font-semibold">Output</div>
                <div className="text-sm text-emerald-300 font-mono">
                  🚀 We just changed the game...
                  <span className="inline-block w-0.5 h-4 bg-emerald-400 ml-0.5 animate-pulse align-middle" />
                </div>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-violet-300" style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.25)" }}>
              <Cpu size={12} />
              Powered by SocialForge AI
            </div>
          </div>

          {/* Smart Scheduling — tall */}
          <div className="glass bento-card rounded-3xl p-8 border border-white/8 md:row-span-1">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(14,165,233,0.3), rgba(79,70,229,0.15))", border: "1px solid rgba(14,165,233,0.25)" }}>
                <Calendar size={20} className="text-sky-400" />
              </div>
              <h3 className="text-xl font-bold text-white">Smart Scheduling</h3>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">Set it once. Post forever.</p>
            {/* Mini calendar */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {["M","T","W","T","F","S","S"].map((d,i) => (
                <div key={i} className="text-center text-xs text-slate-600 font-medium py-1">{d}</div>
              ))}
              {Array.from({ length: 28 }, (_, i) => {
                const dotColors = [2,5,9,11,15,18,22,25,27].includes(i) ?
                  ["#7c3aed","#0ea5e9","#10b981","#f59e0b","#7c3aed","#10b981","#0ea5e9","#7c3aed","#10b981"][
                    [2,5,9,11,15,18,22,25,27].indexOf(i)
                  ] : null;
                return (
                  <div key={i} className="aspect-square rounded-lg flex items-center justify-center" style={{ background: dotColors ? `${dotColors}22` : "rgba(255,255,255,0.03)" }}>
                    {dotColors && <div className="w-2 h-2 rounded-full" style={{ background: dotColors }} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Repurpose Engine — col-span-2 with video */}
          <div className="glass bento-card rounded-3xl p-8 md:col-span-2 border border-white/8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(52,211,153,0.3), rgba(16,185,129,0.15))", border: "1px solid rgba(52,211,153,0.25)" }}>
                <RefreshCw size={20} className="text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold text-white">♻️ Repurpose Engine</h3>
            </div>
            <p className="text-slate-400 text-sm mb-5">Paste any URL → 8 platform-ready posts in 30 seconds</p>
            <div className="rounded-2xl overflow-hidden" style={{ maxHeight: 200 }}>
              <RepurposePlayer />
            </div>
          </div>

          {/* Agency Tools */}
          <div className="glass bento-card rounded-3xl p-8 border border-white/8">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(251,146,60,0.3), rgba(245,158,11,0.15))", border: "1px solid rgba(251,146,60,0.25)" }}>
                <Building2 size={20} className="text-orange-400" />
              </div>
              <h3 className="text-xl font-bold text-white">Agency Tools</h3>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed mb-5">
              Manage 50+ client workspaces from one dashboard. White-label it as your own brand.
            </p>
            <div className="flex flex-col gap-2">
              {[{ initials: "AF", name: "Afrique Media", color: "#7c3aed" }, { initials: "CG", name: "CoolGigs Agency", color: "#0ea5e9" }, { initials: "BS", name: "BrandSpark Ltd", color: "#10b981" }].map((ws) => (
                <div key={ws.name} className="flex items-center gap-2.5 px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: ws.color }}>{ws.initials}</div>
                  <span className="text-slate-300 text-sm">{ws.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Built for Nigeria — col-span-2 */}
          <div className="glass bento-card rounded-3xl p-8 md:col-span-2 border border-white/8">
            <div className="text-4xl mb-4">🇳🇬</div>
            <h3 className="text-2xl font-bold text-white mb-2">Pay in Naira. Post everywhere.</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Paystack integration, NGN pricing, local payment methods. Zero FX friction.
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1 rounded-2xl p-4 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="text-slate-400 text-xs mb-1">Global</div>
                <div className="text-white font-bold text-lg">USD $79/mo</div>
              </div>
              <div className="text-slate-600 font-bold">⟷</div>
              <div className="flex-1 rounded-2xl p-4 text-center" style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)" }}>
                <div className="text-emerald-400 text-xs mb-1">Nigeria</div>
                <div className="text-emerald-300 font-bold text-lg">₦127,000/mo</div>
              </div>
            </div>
            <p className="text-slate-600 text-xs mt-3">Switch currency based on your location automatically</p>
          </div>

          {/* AI Media Studio */}
          <div className="glass bento-card rounded-3xl p-8 border border-white/8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(236,72,153,0.3), rgba(168,85,247,0.15))", border: "1px solid rgba(236,72,153,0.25)" }}>
                <Image size={20} className="text-pink-400" />
              </div>
              <h3 className="text-lg font-bold text-white">AI Media Studio</h3>
            </div>
            <p className="text-slate-400 text-xs mb-4">Generate images and videos with FLUX AI. No Canva needed.</p>
            <div className="rounded-2xl overflow-hidden" style={{ maxHeight: 160 }}>
              <AIStudioPlayer />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── HOW IT WORKS ─── */
function HowItWorks() {
  const steps = [
    { num: "01", title: "Connect", desc: "Link your social accounts in seconds." },
    { num: "02", title: "Create", desc: "Let AI write & design your content." },
    { num: "03", title: "Schedule", desc: "Post at peak times, automatically." },
  ];
  return (
    <section id="how-it-works" className="py-24 md:py-32" style={{ background: "rgba(9,14,31,0.8)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-5xl font-black text-white tracking-tight">Simple enough to start in minutes.</h2>
          <p className="text-slate-400 text-lg mt-4">Powerful enough to run your entire content operation.</p>
        </div>

        <div className="max-w-5xl mx-auto mb-12">
          <VideoFrame>
            <HowItWorksPlayer />
          </VideoFrame>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {steps.map((s) => (
            <div
              key={s.num}
              className="flex items-start gap-4 p-5 rounded-2xl"
              style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0"
                style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(79,70,229,0.2))", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.25)" }}
              >
                {s.num}
              </div>
              <div>
                <div className="text-white font-bold text-sm">{s.title}</div>
                <div className="text-slate-500 text-xs mt-0.5">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── REPURPOSE SPOTLIGHT ─── */
function RepurposeSpotlight() {
  const bullets = [
    "YouTube → 8 posts across every platform",
    "TikTok → Threads + LinkedIn + Twitter",
    "Blog post → carousel + caption + hook",
    "Podcast → tweet thread + LinkedIn article",
  ];
  return (
    <section className="py-24 md:py-32" style={{ background: "#020617" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <div>
            <div className="text-5xl mb-5">♻️</div>
            <h2 className="text-4xl font-black text-white leading-tight mb-5">
              One piece of content.<br />
              Eight platforms.<br />
              Zero extra work.
            </h2>
            <p className="text-slate-400 leading-relaxed mb-8">
              SocialForge&apos;s Repurpose Engine takes any piece of content — a video, an article, a tweet — and
              intelligently transforms it into platform-native posts. No copy-pasting. No reformatting. Just paste and go.
            </p>
            <ul className="space-y-3 mb-8">
              {bullets.map((b) => (
                <li key={b} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(52,211,153,0.2)" }}>
                    <Check size={11} className="text-emerald-400" strokeWidth={3} />
                  </div>
                  <span className="text-slate-300 text-sm">{b}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold px-6 py-3 rounded-xl transition-all"
            >
              Try repurpose free →
            </Link>
          </div>
          {/* Right */}
          <div>
            <VideoFrame>
              <RepurposePlayer />
            </VideoFrame>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── PRICING ─── */
type BillingCycle = "monthly" | "yearly";

function Pricing() {
  const [billing, setBilling] = useState<BillingCycle>("monthly");

  const plans = [
    {
      name: "Free",
      badge: "Free",
      monthly: { usd: 0, ngn: 0 },
      yearly: { usd: 0, ngn: 0 },
      features: ["2 social platforms", "50 AI credits/mo", "1 workspace", "Basic analytics"],
      cta: "Start free",
      ctaStyle: "border",
      popular: false,
    },
    {
      name: "Starter",
      badge: "Starter",
      monthly: { usd: 29, ngn: 46400 },
      yearly: { usd: 23, ngn: 36800 },
      features: ["5 social platforms", "500 AI credits/mo", "3 workspaces", "All platforms", "Email support"],
      cta: "Get Starter",
      ctaStyle: "border",
      popular: false,
    },
    {
      name: "Pro",
      badge: "Most Popular",
      monthly: { usd: 79, ngn: 126400 },
      yearly: { usd: 63, ngn: 100800 },
      features: ["15 social platforms", "2,000 AI credits/mo", "10 workspaces", "Advanced analytics", "Templates library", "Priority support"],
      cta: "Start Pro →",
      ctaStyle: "filled",
      popular: true,
    },
    {
      name: "Agency",
      badge: "Agency",
      monthly: { usd: 199, ngn: 318400 },
      yearly: { usd: 159, ngn: 254400 },
      features: ["Unlimited platforms", "10,000 AI credits/mo", "Unlimited workspaces", "White-label", "API access", "Dedicated support"],
      cta: "Contact sales",
      ctaStyle: "border",
      popular: false,
    },
  ];

  return (
    <section id="pricing" className="py-24 md:py-32" style={{ background: "rgba(9,14,31,0.9)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-5xl font-black text-white tracking-tight">Transparent pricing. No surprises.</h2>
          {/* Toggle */}
          <div className="flex items-center justify-center gap-3 mt-8">
            <button
              onClick={() => setBilling("monthly")}
              className={`text-sm font-semibold px-4 py-2 rounded-xl transition-all ${billing === "monthly" ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling("yearly")}
              className={`text-sm font-semibold px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${billing === "yearly" ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              Yearly
              <span className="text-xs px-2 py-0.5 rounded-full text-emerald-300 font-bold" style={{ background: "rgba(52,211,153,0.15)" }}>2 months free</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => {
            const price = billing === "monthly" ? plan.monthly : plan.yearly;
            return (
              <div
                key={plan.name}
                className="glass bento-card rounded-3xl p-8 flex flex-col border"
                style={
                  plan.popular
                    ? { borderColor: "#7c3aed", boxShadow: "0 0 40px rgba(124,58,237,0.3), 0 0 0 1px rgba(124,58,237,0.2)" }
                    : { borderColor: "rgba(255,255,255,0.08)" }
                }
              >
                {/* Badge */}
                <div className="mb-5">
                  <span
                    className="text-xs font-bold px-2.5 py-1 rounded-full"
                    style={
                      plan.popular
                        ? { background: "rgba(124,58,237,0.2)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.3)" }
                        : { background: "rgba(255,255,255,0.06)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.08)" }
                    }
                  >
                    {plan.badge}
                  </span>
                </div>

                {/* Price */}
                <div className="mb-6">
                  {price.usd === 0 ? (
                    <div className="text-4xl font-black text-white">Free</div>
                  ) : (
                    <>
                      <div className="text-4xl font-black text-white">${price.usd}<span className="text-lg text-slate-500 font-normal">/mo</span></div>
                      <div className="text-slate-500 text-sm mt-1">₦{price.ngn.toLocaleString()}/mo</div>
                    </>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-2.5 flex-1 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5">
                      <Check size={14} className={plan.popular ? "text-violet-400" : "text-emerald-400"} strokeWidth={2.5} />
                      <span className="text-slate-300 text-sm">{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  href={plan.name === "Agency" ? "/contact" : "/signup"}
                  className={`w-full text-center py-3 rounded-xl font-semibold text-sm transition-all ${
                    plan.ctaStyle === "filled"
                      ? "bg-violet-600 hover:bg-violet-500 text-white animate-pulse"
                      : "border border-white/15 text-slate-300 hover:border-white/30 hover:text-white"
                  }`}
                  style={plan.popular ? { boxShadow: "0 0 20px rgba(124,58,237,0.3)" } : {}}
                >
                  {plan.cta}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── TESTIMONIALS ─── */
const TESTIMONIALS = [
  { name: "Amara O.", flag: "🇳🇬", role: "Content Creator, Lagos", text: "SocialForge cut our content production time by 70%. The AI understands Nigerian slang and culture — it's not generic like other tools." },
  { name: "David K.", flag: "🇬🇭", role: "Digital Agency Owner", text: "Finally a tool that understands African creators. The local pricing is genuinely game-changing for our market." },
  { name: "Sarah M.", flag: "🇬🇧", role: "Social Media Manager", text: "We manage 23 client accounts from one dashboard. The white-label feature means our clients see our brand, not SocialForge." },
  { name: "Taiwo A.", flag: "🇳🇬", role: "E-commerce Founder", text: "The Paystack integration changed everything for us. No more painful FX conversions. We pay in Naira, post everywhere." },
  { name: "Marcus T.", flag: "🇺🇸", role: "Marketing Consultant", text: "Best Buffer alternative I've tried. The AI is genuinely impressive — it sounds human, not robotic." },
  { name: "Fatima B.", flag: "🇲🇦", role: "Agency Director", text: "Arabic content support + 8 platforms = game changer for our agency. We've 3x'd our client roster since switching." },
];

function Testimonials() {
  const [page, setPage] = useState(0);
  const total = Math.ceil(TESTIMONIALS.length / 3);

  useEffect(() => {
    const timer = setInterval(() => setPage((p) => (p + 1) % total), 5000);
    return () => clearInterval(timer);
  }, [total]);

  const visibleDesktop = TESTIMONIALS.slice(page * 3, page * 3 + 3);
  const visibleMobile = TESTIMONIALS[page % TESTIMONIALS.length];

  return (
    <section id="testimonials" className="py-24 md:py-32" style={{ background: "#020617" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-5xl font-black text-white tracking-tight">
            Loved by creators worldwide 🇳🇬🇬🇭🇬🇧🇺🇸
          </h2>
        </div>

        {/* Desktop: 3 cards */}
        <div className="hidden md:grid grid-cols-3 gap-5">
          {visibleDesktop.map((t, i) => (
            <div
              key={`${t.name}-${i}`}
              className="glass glass-hover rounded-3xl p-7"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {t.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <div>
                  <div className="text-white text-sm font-semibold">{t.flag} {t.name}</div>
                  <div className="text-slate-500 text-xs">{t.role}</div>
                </div>
              </div>
              <div className="flex gap-0.5 mb-3">
                {Array(5).fill(null).map((_, j) => <Star key={j} size={12} className="text-amber-400" fill="#f59e0b" />)}
              </div>
              <p className="text-slate-300 text-sm leading-relaxed">&ldquo;{t.text}&rdquo;</p>
            </div>
          ))}
        </div>

        {/* Mobile: 1 card */}
        <div className="md:hidden">
          <div className="glass rounded-3xl p-7">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold text-sm">
                {visibleMobile.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <div>
                <div className="text-white text-sm font-semibold">{visibleMobile.flag} {visibleMobile.name}</div>
                <div className="text-slate-500 text-xs">{visibleMobile.role}</div>
              </div>
            </div>
            <div className="flex gap-0.5 mb-3">
              {Array(5).fill(null).map((_, j) => <Star key={j} size={12} className="text-amber-400" fill="#f59e0b" />)}
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">&ldquo;{visibleMobile.text}&rdquo;</p>
          </div>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2 mt-8">
          {Array.from({ length: total }).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              className="rounded-full transition-all"
              style={{
                width: i === page ? 24 : 8,
                height: 8,
                background: i === page ? "#7c3aed" : "rgba(255,255,255,0.15)",
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── FAQ ─── */
const FAQS = [
  { q: "Is there a free plan?", a: "Yes — forever free with 2 social platforms, 50 AI credits per month, and 1 workspace. No credit card required to start." },
  { q: "How does Paystack work?", a: "We detect your location automatically. Nigerian users are offered Paystack at NGN prices. International users pay via Stripe in USD. Both experiences are seamless." },
  { q: "Which platforms do you support?", a: "Instagram, TikTok, YouTube, LinkedIn, Twitter/X, Facebook, Pinterest, and Threads — all 8 from one dashboard." },
  { q: "How do AI credits work?", a: "Each AI generation (caption, post, image, thread) uses 1 credit. Credits refresh monthly. Unused credits don't roll over, but we offer generous limits at every tier." },
  { q: "Can I white-label for clients?", a: "Yes — available on the Agency plan. You can replace the SocialForge branding with your own logo, domain, and colours. Clients see your product, not ours." },
  { q: "Is my data secure?", a: "We are SOC2 compliant. All social account tokens are encrypted at rest with AES-256. We never post without your explicit approval, and you can revoke access at any time." },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="py-24 md:py-32" style={{ background: "rgba(9,14,31,0.9)" }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-5xl font-black text-white tracking-tight text-center mb-12">Common questions</h2>
        <div className="flex flex-col gap-3">
          {FAQS.map((faq, i) => (
            <div
              key={i}
              className="glass rounded-2xl overflow-hidden transition-all"
              style={{ border: open === i ? "1px solid rgba(124,58,237,0.3)" : "1px solid rgba(255,255,255,0.06)" }}
            >
              <button
                className="w-full flex items-center justify-between p-6 text-left gap-4"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span className="text-white font-semibold text-sm">{faq.q}</span>
                <ChevronDown
                  size={18}
                  className="text-slate-400 flex-shrink-0 transition-transform duration-300"
                  style={{ transform: open === i ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </button>
              {open === i && (
                <div className="px-6 pb-6">
                  <p className="text-slate-400 text-sm leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── FINAL CTA ─── */
function FinalCTA() {
  return (
    <section className="py-24 md:py-32 relative overflow-hidden">
      {/* Animated gradient bg */}
      <div
        className="absolute inset-0 animate-gradient"
        style={{
          background: "linear-gradient(135deg, #3b0764, #4c1d95, #312e81, #3b0764)",
          backgroundSize: "300% 300%",
        }}
      />
      {/* Blobs */}
      <div className="absolute top-0 left-0 w-96 h-96 rounded-full blur-3xl pointer-events-none" style={{ background: "rgba(124,58,237,0.35)", transform: "translate(-40%, -40%)" }} />
      <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full blur-3xl pointer-events-none" style={{ background: "rgba(52,211,153,0.2)", transform: "translate(40%, 40%)" }} />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-5xl md:text-6xl font-black text-white leading-tight mb-2">
          Stop managing social media manually.
        </h2>
        <h2 className="text-5xl md:text-6xl font-black leading-tight mb-6 text-gradient-emerald">
          Start growing with SocialForge.
        </h2>
        <p className="text-violet-200 text-lg mb-10">
          Join 500+ teams who&apos;ve already made the switch.
        </p>
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 bg-white text-violet-700 font-black text-lg px-10 py-5 rounded-2xl hover:bg-violet-50 transition-all hover:-translate-y-0.5"
          style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.3)" }}
        >
          Start free — no card needed →
        </Link>
        <p className="text-violet-300/70 text-sm mt-5">
          🇳🇬 NGN pricing available • Cancel anytime • Takes 2 minutes to set up
        </p>
      </div>
    </section>
  );
}

/* ─── FOOTER ─── */
function Footer() {
  const cols = [
    { title: "Product", links: ["Features", "Pricing", "Changelog", "Roadmap"] },
    { title: "Company", links: ["About", "Blog", "Careers", "Press"] },
    { title: "Resources", links: ["Docs", "API", "Templates", "Community"] },
    { title: "Legal", links: ["Privacy", "Terms", "Cookies", "Security"] },
  ];
  return (
    <footer className="border-t border-white/5" style={{ background: "#020617" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
                <Zap size={18} className="text-white" fill="white" />
              </div>
              <span className="text-white font-bold text-xl">SocialForge</span>
            </div>
            <p className="text-slate-500 text-sm leading-relaxed max-w-xs">
              The AI-powered social media platform for creators and agencies worldwide.
            </p>
            <div className="flex items-center gap-2 mt-5">
              {[Twitter, Linkedin, Github].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                  style={{ background: "rgba(30,41,59,1)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(51,65,85,1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(30,41,59,1)")}
                >
                  <Icon size={15} />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {cols.map((col) => (
            <div key={col.title}>
              <div className="text-white text-sm font-semibold mb-4">{col.title}</div>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">{l}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/5 pt-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-slate-600 text-sm">© 2026 SocialForge. All rights reserved.</p>
          <p className="text-slate-600 text-sm">Made with ❤️ for creators everywhere 🌍</p>
        </div>
      </div>
    </footer>
  );
}

/* ─── PAGE ─── */
export default function LandingPage() {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) router.push("/dashboard");
  }, [isAuthenticated, router]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_STYLES }} />
      <div className="bg-slate-950 text-white" style={{ background: "#020617" }}>
        <Navbar />
        <Hero />
        <Marquee />
        <StatsBar />
        <Features />
        <HowItWorks />
        <RepurposeSpotlight />
        <Pricing />
        <Testimonials />
        <FAQ />
        <FinalCTA />
        <Footer />
      </div>
    </>
  );
}
