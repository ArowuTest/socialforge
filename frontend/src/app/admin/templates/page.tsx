"use client";

import * as React from "react";
import {
  BookTemplate, Plus, Edit2, Trash2, Save, X, Star, StarOff,
  Search, Eye, EyeOff, Tag, ChevronDown, Loader2, CheckCircle2,
  Building2, ShoppingBag, Code2, Dumbbell, Home, Utensils, Heart,
  Camera, Briefcase, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────
type ContentMix = { image: number; video: number; text: number };

type IndustryTemplate = {
  id: string;
  industry: string;
  icon: React.ElementType;
  color: string;
  label: string;
  description: string;
  featured: boolean;
  usageCount: number;
  // Campaign defaults
  recommendedFrequency: Record<string, number>; // platform → posts/week
  contentMix: ContentMix;
  contentPillars: string[];
  brandVoiceHints: string;
  typicalGoals: string[];
  hashtagSuggestions: string[];
  briefTemplate: string;
};

// ── Built-in templates ─────────────────────────────────────────────────────
const BUILTIN_TEMPLATES: IndustryTemplate[] = [
  {
    id: "restaurant",
    industry: "restaurant",
    icon: Utensils,
    color: "from-orange-500 to-red-500",
    label: "Restaurant & Food",
    description: "Showcase dishes, behind-the-scenes kitchen content, and special promotions.",
    featured: true,
    usageCount: 342,
    recommendedFrequency: { instagram: 7, facebook: 5, tiktok: 4 },
    contentMix: { image: 60, video: 25, text: 15 },
    contentPillars: ["Dish Showcase", "Behind the Scenes", "Specials & Offers", "Customer Stories", "Chef's Pick", "Seasonal Menu"],
    brandVoiceHints: "Warm, inviting, sensory language. Make food sound delicious. Use descriptive words that evoke taste and smell.",
    typicalGoals: ["Awareness", "Engagement", "Foot Traffic"],
    hashtagSuggestions: ["#foodie", "#restaurant", "#eats", "#foodphotography", "#chef"],
    briefTemplate: "We are a [type] restaurant serving [cuisine]. Our target customers are [audience]. This campaign should highlight [focus areas] and drive more [goal].",
  },
  {
    id: "ecommerce",
    industry: "ecommerce",
    icon: ShoppingBag,
    color: "from-blue-500 to-cyan-500",
    label: "E-Commerce & Retail",
    description: "Product launches, promotions, reviews, and lifestyle content for online stores.",
    featured: true,
    usageCount: 518,
    recommendedFrequency: { instagram: 7, facebook: 5, pinterest: 5, twitter: 7 },
    contentMix: { image: 55, video: 30, text: 15 },
    contentPillars: ["Product Showcase", "Customer Reviews", "Behind the Brand", "Promotions & Sales", "Education/How-To", "Lifestyle"],
    brandVoiceHints: "Confident, aspirational, benefit-focused. Highlight what makes your products special. Use social proof liberally.",
    typicalGoals: ["Sales", "Awareness", "Engagement"],
    hashtagSuggestions: ["#shopnow", "#onlineshopping", "#fashion", "#sale", "#newcollection"],
    briefTemplate: "We sell [products] to [audience]. Our brand positioning is [positioning]. This campaign should focus on [collection/promotion] with a goal of [goal].",
  },
  {
    id: "saas",
    industry: "saas",
    icon: Code2,
    color: "from-violet-500 to-purple-600",
    label: "SaaS & Tech",
    description: "Product features, customer success stories, thought leadership, and demos.",
    featured: true,
    usageCount: 287,
    recommendedFrequency: { linkedin: 5, twitter: 7, youtube: 2 },
    contentMix: { image: 40, video: 35, text: 25 },
    contentPillars: ["Product Features", "Customer Success", "Thought Leadership", "How-To/Tutorial", "Team & Culture", "Industry News"],
    brandVoiceHints: "Professional but approachable. Lead with outcomes and ROI. Use clear, jargon-free language. Data and specifics build credibility.",
    typicalGoals: ["Awareness", "Lead Generation", "Education"],
    hashtagSuggestions: ["#saas", "#software", "#productivity", "#startup", "#tech"],
    briefTemplate: "We make [software] that helps [audience] to [outcome]. Our competitors are [competitors]. This campaign should demonstrate [key differentiator] and generate [goal].",
  },
  {
    id: "fitness",
    industry: "fitness",
    icon: Dumbbell,
    color: "from-green-500 to-emerald-600",
    label: "Fitness & Wellness",
    description: "Workout content, transformation stories, nutrition tips, and community building.",
    featured: false,
    usageCount: 203,
    recommendedFrequency: { instagram: 7, tiktok: 7, youtube: 3 },
    contentMix: { image: 45, video: 45, text: 10 },
    contentPillars: ["Workout of the Day", "Transformation Stories", "Nutrition Tips", "Motivation", "Community", "Product/Service"],
    brandVoiceHints: "Energetic, motivating, inclusive. Celebrate progress over perfection. Use action verbs. Make people feel capable and supported.",
    typicalGoals: ["Engagement", "Community", "Sales"],
    hashtagSuggestions: ["#fitness", "#workout", "#health", "#gym", "#motivation"],
    briefTemplate: "We offer [fitness product/service] for [audience]. Our brand ethos is [values]. This campaign should inspire [action] and help with [goal].",
  },
  {
    id: "realestate",
    industry: "realestate",
    icon: Home,
    color: "from-amber-500 to-orange-500",
    label: "Real Estate",
    description: "Property listings, market insights, agent branding, and buyer/seller tips.",
    featured: false,
    usageCount: 176,
    recommendedFrequency: { instagram: 5, facebook: 7, linkedin: 3 },
    contentMix: { image: 65, video: 25, text: 10 },
    contentPillars: ["Property Listings", "Market Updates", "Buyer Tips", "Seller Tips", "Neighborhood Spotlights", "Success Stories"],
    brandVoiceHints: "Trustworthy, knowledgeable, local expertise. Reassure buyers and sellers. Use aspirational language for listings. Share genuine market knowledge.",
    typicalGoals: ["Awareness", "Lead Generation", "Engagement"],
    hashtagSuggestions: ["#realestate", "#property", "#homeforsale", "#dreamhome", "#realtor"],
    briefTemplate: "I am a real estate agent/agency in [location] specialising in [property type]. My clients are [audience]. This campaign should highlight [listings/services] and generate [goal].",
  },
  {
    id: "healthcare",
    industry: "healthcare",
    icon: Heart,
    color: "from-red-400 to-pink-500",
    label: "Healthcare & Medical",
    description: "Patient education, wellness tips, provider spotlights, and trust-building content.",
    featured: false,
    usageCount: 134,
    recommendedFrequency: { facebook: 5, instagram: 3, linkedin: 3 },
    contentMix: { image: 50, video: 30, text: 20 },
    contentPillars: ["Patient Education", "Health Tips", "Provider Stories", "Community Health", "Services Overview", "FAQ"],
    brandVoiceHints: "Compassionate, reassuring, authoritative. Prioritise clarity over medical jargon. Build trust through evidence and empathy.",
    typicalGoals: ["Awareness", "Education", "Engagement"],
    hashtagSuggestions: ["#health", "#wellness", "#healthcare", "#doctor", "#patientcare"],
    briefTemplate: "We provide [healthcare services] to [audience]. Our approach is [philosophy]. This campaign should educate on [topics] and build trust with [goal].",
  },
  {
    id: "photography",
    industry: "photography",
    icon: Camera,
    color: "from-gray-600 to-slate-700",
    label: "Photography & Creative",
    description: "Portfolio showcases, behind-the-scenes, booking promotions, and creative education.",
    featured: false,
    usageCount: 98,
    recommendedFrequency: { instagram: 7, pinterest: 5, tiktok: 3 },
    contentMix: { image: 75, video: 15, text: 10 },
    contentPillars: ["Portfolio Work", "Behind the Scenes", "Client Stories", "Photography Tips", "Booking & Pricing", "Gear & Process"],
    brandVoiceHints: "Artistic, personal, storytelling-focused. Let the images speak first. Share the story behind each shot. Express your unique creative vision.",
    typicalGoals: ["Awareness", "Bookings", "Engagement"],
    hashtagSuggestions: ["#photography", "#photographer", "#portrait", "#wedding", "#photoshoot"],
    briefTemplate: "I am a [type] photographer based in [location]. My style is [aesthetic]. This campaign should showcase [work type] and attract [target clients].",
  },
  {
    id: "consulting",
    industry: "consulting",
    icon: Briefcase,
    color: "from-slate-600 to-slate-800",
    label: "Consulting & Services",
    description: "Thought leadership, case studies, service highlights, and expertise positioning.",
    featured: false,
    usageCount: 145,
    recommendedFrequency: { linkedin: 5, twitter: 5, instagram: 3 },
    contentMix: { image: 40, video: 25, text: 35 },
    contentPillars: ["Insights & Opinion", "Case Studies", "Service Highlights", "Team Expertise", "Industry Trends", "Client Wins"],
    brandVoiceHints: "Expert, insightful, confident. Back claims with data and case studies. Position as the authoritative voice in your space. Be specific, not generic.",
    typicalGoals: ["Lead Generation", "Awareness", "Thought Leadership"],
    hashtagSuggestions: ["#consulting", "#business", "#strategy", "#leadership", "#growth"],
    briefTemplate: "We are a [type] consulting firm serving [audience]. Our expertise is [specialisation]. This campaign should demonstrate [value] and generate [goal].",
  },
];

export default function TemplatesPage() {
  const [templates, setTemplates] = React.useState<IndustryTemplate[]>(BUILTIN_TEMPLATES);
  const [search, setSearch] = React.useState("");
  const [showFeaturedOnly, setShowFeaturedOnly] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [showAddForm, setShowAddForm] = React.useState(false);

  // New template form state
  const [newLabel, setNewLabel] = React.useState("");
  const [newDescription, setNewDescription] = React.useState("");
  const [newPillars, setNewPillars] = React.useState("");
  const [newVoice, setNewVoice] = React.useState("");
  const [newBriefTemplate, setNewBriefTemplate] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const filtered = templates.filter((t) => {
    const matchesSearch =
      t.label.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.industry.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (!showFeaturedOnly || t.featured);
  });

  const toggleFeatured = (id: string) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, featured: !t.featured } : t))
    );
    toast.success("Template updated");
  };

  const handleAddTemplate = async () => {
    if (!newLabel.trim()) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600)); // simulated save
    const newTemplate: IndustryTemplate = {
      id: `custom_${Date.now()}`,
      industry: newLabel.toLowerCase().replace(/\s+/g, "_"),
      icon: BookTemplate,
      color: "from-violet-500 to-purple-600",
      label: newLabel.trim(),
      description: newDescription.trim(),
      featured: false,
      usageCount: 0,
      recommendedFrequency: { instagram: 5, linkedin: 3 },
      contentMix: { image: 50, video: 30, text: 20 },
      contentPillars: newPillars.split(",").map((s) => s.trim()).filter(Boolean),
      brandVoiceHints: newVoice.trim(),
      typicalGoals: ["Awareness", "Engagement"],
      hashtagSuggestions: [],
      briefTemplate: newBriefTemplate.trim(),
    };
    setTemplates((prev) => [...prev, newTemplate]);
    setNewLabel(""); setNewDescription(""); setNewPillars(""); setNewVoice(""); setNewBriefTemplate("");
    setShowAddForm(false);
    setSaving(false);
    toast.success(`Template "${newTemplate.label}" created`);
  };

  const handleDelete = (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    toast.success(`"${tpl.label}" template removed`);
  };

  const featuredCount = templates.filter((t) => t.featured).length;
  const totalUsage = templates.reduce((sum, t) => sum + t.usageCount, 0);
  const previewTemplate = templates.find((t) => t.id === previewId);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BookTemplate className="h-5 w-5 text-violet-400" />
            Industry Templates Library
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage campaign templates for different industries. Templates pre-fill campaign parameters for users.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
          New Template
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Templates", value: templates.length },
          { label: "Featured", value: featuredCount },
          { label: "Total Uses", value: totalUsage.toLocaleString() },
        ].map((stat) => (
          <div key={stat.label} className="bg-slate-900 rounded-xl border border-slate-800 p-4 text-center">
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-xs text-slate-400 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Add template form */}
      {showAddForm && (
        <div className="bg-slate-900 rounded-xl border border-violet-800/40 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Create Custom Template</h3>
            <button onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Industry Name *</label>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Pet Care, Legal Services"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Content Pillars (comma-separated)</label>
              <input
                value={newPillars}
                onChange={(e) => setNewPillars(e.target.value)}
                placeholder="Education, Behind Scenes, Promotions"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Description</label>
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Describe what type of content this template focuses on..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Brand Voice Hints</label>
            <textarea
              value={newVoice}
              onChange={(e) => setNewVoice(e.target.value)}
              placeholder="Guidance for AI about tone, style, and communication approach for this industry..."
              rows={2}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Brief Template (shown to users as a starting point)</label>
            <textarea
              value={newBriefTemplate}
              onChange={(e) => setNewBriefTemplate(e.target.value)}
              placeholder="We are a [type] business serving [audience]. This campaign should..."
              rows={2}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddTemplate}
              disabled={!newLabel.trim() || saving}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Create Template
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <button
          onClick={() => setShowFeaturedOnly(!showFeaturedOnly)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all",
            showFeaturedOnly
              ? "bg-amber-900/30 border-amber-700/50 text-amber-400"
              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
          )}
        >
          <Star className="h-4 w-4" />
          Featured only
        </button>
        <p className="text-sm text-slate-500 ml-auto">{filtered.length} template{filtered.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((template) => (
          <div
            key={template.id}
            className="bg-slate-900 rounded-xl border border-slate-800 hover:border-slate-700 transition-all overflow-hidden"
          >
            {/* Card header */}
            <div className={cn("h-1.5 w-full bg-gradient-to-r", template.color)} />
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className={cn("h-10 w-10 rounded-xl bg-gradient-to-br flex items-center justify-center flex-shrink-0", template.color)}>
                  <template.icon className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-white">{template.label}</h3>
                    {template.featured && (
                      <span className="text-xs bg-amber-900/30 border border-amber-700/50 text-amber-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Star className="h-2.5 w-2.5 fill-current" /> Featured
                      </span>
                    )}
                    {template.id.startsWith("custom_") && (
                      <span className="text-xs bg-violet-900/30 border border-violet-700/50 text-violet-400 px-2 py-0.5 rounded-full">Custom</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{template.description}</p>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-800">
                <div className="text-center">
                  <p className="text-xs font-bold text-white">{template.usageCount}</p>
                  <p className="text-[10px] text-slate-500">uses</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-white">{template.contentPillars.length}</p>
                  <p className="text-[10px] text-slate-500">pillars</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-white">{template.contentMix.image}%</p>
                  <p className="text-[10px] text-slate-500">image</p>
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-white">{template.contentMix.video}%</p>
                  <p className="text-[10px] text-slate-500">video</p>
                </div>

                {/* Actions */}
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    onClick={() => setPreviewId(previewId === template.id ? null : template.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    title="Preview"
                  >
                    {previewId === template.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => toggleFeatured(template.id)}
                    className={cn(
                      "p-1.5 rounded-lg transition-colors",
                      template.featured
                        ? "text-amber-400 hover:text-amber-200 hover:bg-amber-900/20"
                        : "text-slate-400 hover:text-amber-400 hover:bg-slate-800"
                    )}
                    title={template.featured ? "Unfeature" : "Feature"}
                  >
                    {template.featured ? <Star className="h-3.5 w-3.5 fill-current" /> : <StarOff className="h-3.5 w-3.5" />}
                  </button>
                  {template.id.startsWith("custom_") && (
                    <button
                      onClick={() => handleDelete(template.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-900/10 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded preview */}
              {previewId === template.id && (
                <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Content Pillars</p>
                    <div className="flex flex-wrap gap-1.5">
                      {template.contentPillars.map((p) => (
                        <span key={p} className="text-xs bg-slate-800 border border-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{p}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Typical Goals</p>
                    <div className="flex flex-wrap gap-1.5">
                      {template.typicalGoals.map((g) => (
                        <span key={g} className="text-xs bg-violet-900/20 border border-violet-800/40 text-violet-400 px-2 py-0.5 rounded-full">{g}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Brand Voice Hints</p>
                    <p className="text-xs text-slate-400 leading-relaxed italic">&ldquo;{template.brandVoiceHints}&rdquo;</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Brief Template</p>
                    <p className="text-xs text-slate-400 leading-relaxed bg-slate-800/50 rounded-lg px-3 py-2">{template.briefTemplate}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Recommended Frequency</p>
                    <div className="flex gap-3 flex-wrap">
                      {Object.entries(template.recommendedFrequency).map(([platform, freq]) => (
                        <span key={platform} className="text-xs text-slate-300">
                          <span className="capitalize font-medium">{platform}</span>
                          <span className="text-slate-500"> {freq}×/wk</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <BookTemplate className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No templates found</p>
          <p className="text-xs mt-1">Try adjusting your search or create a new template.</p>
        </div>
      )}

      {/* Usage note */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-500 flex items-start gap-2">
        <Sparkles className="h-4 w-4 text-violet-400 flex-shrink-0 mt-0.5" />
        <span>
          <strong className="text-slate-400">How templates work:</strong> When users create a new campaign, they can pick an industry template to pre-fill content pillars, brand voice hints, and a brief starter.
          Featured templates appear first in the campaign wizard. Custom templates are stored locally for this session.
        </span>
      </div>
    </div>
  );
}
