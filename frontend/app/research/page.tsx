"use client";
import React, { useState, useEffect } from "react";
import { API_BASE } from "@/lib/api";
import {
  Search, TrendingUp, Target, Zap, ChevronRight, Globe,
  Clock, X, Lightbulb, BarChart2, RefreshCw, Loader, Eye,
  ExternalLink, Cpu, Swords, Bot, CheckCircle2,
} from "lucide-react";
import { useRouter } from "next/navigation";

const LANGS = [
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "nl", label: "Dutch" },
];

const HISTORY_KEY = "kolet_research_history";
const MAX_HISTORY = 20;

type HistoryEntry = { seed: string; lang: string; ts: number };

type Keyword = {
  keyword: string;
  volume: number;
  competition: number;
  opportunity_score: number;
  cpc: number;
  trend?: number[];
  covered?: boolean;
  intent?: string;
};

type ResearchResult = {
  keywords: Keyword[];
  summary: {
    total_keywords: number;
    total_monthly_volume: number;
    avg_competition: number;
    easy_wins_count: number;
    covered_count?: number;
    top_opportunity: string;
  };
  recommendations: string[];
};

type SeedCategory  = { name: string; seeds: string[] };
type GapTopic      = { topic: string; article_count: number; langs: string[]; articles: {id:string;title:string;lang:string}[] };
type GapCategory   = { name: string; topics: GapTopic[] };
type GapData       = { categories: GapCategory[]; total_topics: number; covered_count: number; gap_count: number };

type CompArticle   = { url: string; title: string; date: string; competitor: string };
type Competitor    = { name: string; color: string; articles: CompArticle[]; count: number; status?: string };
type IntelData     = { competitors: Competitor[]; total: number; days: number };
type IntelAnalysis = {
  topic_clusters: { cluster: string; count: number; competitors: string[] }[];
  most_invested: string[];
  kolet_opportunities: string[];
  summary: string;
};

type QuickWin = {
  query: string; clicks: number; impressions: number;
  ctr: number; position: number;
  action: string | null; priority: string; type: string | null;
};

type BattlePlan = {
  difficulty: string; kolet_angle: string; recommended_format: string;
  battle_plan: string[]; target_snippet: boolean; target_ai_overview: boolean;
  estimated_effort: string;
};
type SerpOrganic  = { position: number; title: string; url: string; domain: string; isCompetitor: boolean; competitorName: string | null; isKolet: boolean };
type CompPosition = { name: string; position: number | null; url: string | null };
type SerpSnapshot = {
  keyword: string; organic: SerpOrganic[];
  competitor_positions: CompPosition[];
  kolet_position: number | null;
  ai_overview: boolean; featured_snippet: boolean;
  people_also_ask: string[];
  battle_plan: BattlePlan | null;
};

type AiQuickWin = { format: string; example: string; why: string };
type AiVisibility = {
  overall_ai_readiness: string;
  priority_action: string;
  ai_overview_tips: string[];
  perplexity_tips: string[];
  chatgpt_tips: string[];
  llm_training_tips: string[];
  quick_wins: AiQuickWin[];
  schema_markup: string[];
  paa_opportunities: string[];
  ai_overview_keywords: string[];
  featured_snippet_keywords: string[];
};

// ─── helpers ────────────────────────────────────────────────────────────────

function loadHistory(): HistoryEntry[] { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; } }
function saveHistory(e: HistoryEntry[]) { localStorage.setItem(HISTORY_KEY, JSON.stringify(e.slice(0, MAX_HISTORY))); }
function addToHistory(seed: string, lang: string) { const e = loadHistory().filter(x => !(x.seed === seed && x.lang === lang)); saveHistory([{ seed, lang, ts: Date.now() }, ...e]); }
function removeFromHistory(seed: string, lang: string) { saveHistory(loadHistory().filter(e => !(e.seed === seed && e.lang === lang))); }
function relativeTime(ts: number) {
  const d = Date.now() - ts, m = Math.floor(d/60000), h = Math.floor(d/3600000), day = Math.floor(d/86400000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`; if (h < 24) return `${h}h ago`; return `${day}d ago`;
}

const LANG_LABELS: Record<string, string> = { en: "EN", fr: "FR", de: "DE", es: "ES", nl: "NL" };

const CAT_COLORS: Record<string, string> = {
  "Destinations":        "text-amber-700 border-amber-200 bg-amber-50",
  "Use Cases":           "text-purple-700 border-purple-200 bg-purple-50",
  "Comparisons":         "text-emerald-700 border-emerald-200 bg-emerald-50",
  "Comparisons & Value": "text-emerald-700 border-emerald-200 bg-emerald-50",
  "Technical":           "text-orange-700 border-orange-200 bg-orange-50",
};
const PILL_COLORS: Record<string, string> = {
  "Destinations":        "bg-white text-amber-800 border-amber-300 hover:bg-amber-50",
  "Use Cases":           "bg-white text-purple-800 border-purple-300 hover:bg-purple-50",
  "Comparisons":         "bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-50",
  "Comparisons & Value": "bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-50",
  "Technical":           "bg-white text-orange-800 border-orange-300 hover:bg-orange-50",
};

const INTENT_STYLE: Record<string, string> = {
  Destination:   "bg-kolet-yellow text-kolet-black border border-yellow-400",
  Comparison:    "bg-violet-600 text-white border border-violet-700",
  "How-to":      "bg-sky-600 text-white border border-sky-700",
  Technical:     "bg-stone-700 text-white border border-stone-600",
  Transactional: "bg-kolet-magenta text-white border border-pink-600",
  Other:         "bg-stone-300 text-stone-800 border border-stone-400",
};

// ─── Sparkline ──────────────────────────────────────────────────────────────

function Sparkline({ data }: { data?: number[] }) {
  if (!data || data.length < 2) return <span className="text-gray-400 text-xs">—</span>;
  const max = Math.max(...data, 1);
  const w = 64; const h = 24;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 3) - 1}`).join(" ");
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={w} height={h} className={up ? "text-green-500" : "text-red-400"}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function ResearchPage() {
  const router = useRouter();
  const [seed, setSeed]         = useState("");
  const [lang, setLang]         = useState("fr");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [result, setResult]     = useState<ResearchResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [history, setHistory]   = useState<HistoryEntry[]>([]);

  // Keyword table controls
  const [sortBy, setSortBy]             = useState<"opportunity" | "volume" | "competition" | "cpc">("opportunity");
  const [filterIntent, setFilterIntent] = useState<string>("");
  const [uncoveredOnly, setUncoveredOnly] = useState(false);

  // Discovery panel
  const [discoveryTab, setDiscoveryTab]     = useState<"seeds" | "gaps" | "intel" | "quickwins">("seeds");
  const [seedCategories, setSeedCategories] = useState<SeedCategory[]>([]);
  const [seedsLoading, setSeedsLoading]     = useState(false);
  const [seedsError, setSeedsError]         = useState("");
  const [gapData, setGapData]               = useState<GapData | null>(null);
  const [gapsLoading, setGapsLoading]       = useState(false);
  const [gapFilter, setGapFilter]           = useState<"all" | "gaps">("all");

  // Competitor intel
  const [intelData, setIntelData]             = useState<IntelData | null>(null);
  const [intelLoading, setIntelLoading]       = useState(false);
  const [intelError, setIntelError]           = useState("");
  const [intelDays, setIntelDays]             = useState(60);
  const [analysis, setAnalysis]               = useState<IntelAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [expandedComp, setExpandedComp]       = useState<string | null>(null);

  // Quick Wins (GSC near-miss)
  const [quickWins, setQuickWins]           = useState<QuickWin[]>([]);
  const [quickWinsLoading, setQuickWinsLoading] = useState(false);
  const [quickWinsError, setQuickWinsError] = useState("");
  const [quickWinsLoaded, setQuickWinsLoaded] = useState(false);

  // SERP Battle
  const [serpSnapshot, setSerpSnapshot]     = useState<SerpSnapshot | null>(null);
  const [serpLoading, setSerpLoading]       = useState(false);
  const [serpError, setSerpError]           = useState("");

  // Write from SERP
  const [writingSerp, setWritingSerp] = useState(false);

  // AI Visibility
  const [aiVis, setAiVis]                   = useState<AiVisibility | null>(null);
  const [aiVisLoading, setAiVisLoading]     = useState(false);
  const [aiVisError, setAiVisError]         = useState("");

  useEffect(() => { setHistory(loadHistory()); }, []);

  useEffect(() => {
    setGapsLoading(true);
    fetch(`${API_BASE}/api/research/gaps`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { if (d && Array.isArray(d.categories)) setGapData(d); })
      .catch(() => {})
      .finally(() => setGapsLoading(false));
  }, []);

  async function runResearch(overrideSeed?: string, overrideLang?: string) {
    const s = (overrideSeed ?? seed).trim();
    const l = overrideLang ?? lang;
    if (!s) return;
    setSeed(s); setLang(l);
    setLoading(true); setError(""); setResult(null); setSelected(new Set());
    setSerpSnapshot(null); setSerpError(""); setAiVis(null); setAiVisError("");
    try {
      const res = await fetch(`${API_BASE}/api/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: s, lang: l }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Research failed"); }
      const data = await res.json();
      setResult(data);
      addToHistory(s, l);
      setHistory(loadHistory());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSeeds() {
    setSeedsLoading(true); setSeedsError("");
    try {
      const res = await fetch(`${API_BASE}/api/research/suggest-seeds`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "Failed"); }
      const data = await res.json();
      setSeedCategories(data.categories || []);
    } catch (e: any) {
      setSeedsError(e.message);
    } finally {
      setSeedsLoading(false);
    }
  }

  async function loadQuickWins() {
    setQuickWinsLoading(true); setQuickWinsError("");
    try {
      const res = await fetch(`${API_BASE}/api/research/gsc-quick-wins`);
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || `HTTP ${res.status}`); }
      const data = await res.json();
      setQuickWins(data.queries || []);
      setQuickWinsLoaded(true);
    } catch (e: any) {
      setQuickWinsError(e.message);
    } finally {
      setQuickWinsLoading(false);
    }
  }

  async function runSerpAnalysis(keyword?: string) {
    const kw = keyword ?? seed;
    if (!kw) return;
    setSerpLoading(true); setSerpError(""); setSerpSnapshot(null);
    try {
      const res = await fetch(`${API_BASE}/api/research/competitor-serp`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyword: kw, lang }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || `HTTP ${res.status}`); }
      const data = await res.json();
      setSerpSnapshot(data);
    } catch (e: any) {
      setSerpError(e.message);
    } finally {
      setSerpLoading(false);
    }
  }

  async function runAiVisibility() {
    if (!result) return;
    const keywords = result.keywords.slice(0, 10).map(k => k.keyword);
    setAiVisLoading(true); setAiVisError(""); setAiVis(null);
    try {
      const res = await fetch(`${API_BASE}/api/research/ai-visibility`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keywords, lang }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || `HTTP ${res.status}`); }
      const data = await res.json();
      setAiVis(data);
    } catch (e: any) {
      setAiVisError(e.message);
    } finally {
      setAiVisLoading(false);
    }
  }

  async function writeFromSerp() {
    if (!serpSnapshot) return;
    setWritingSerp(true);
    const bp = serpSnapshot.battle_plan;
    const topic = {
      headline: `${serpSnapshot.keyword.charAt(0).toUpperCase()}${serpSnapshot.keyword.slice(1)}: ${bp?.recommended_format || 'Complete Guide'}`,
      focus_keyword: serpSnapshot.keyword,
      secondary_keywords: serpSnapshot.people_also_ask.slice(0, 4),
      content_format: bp?.recommended_format || 'guide',
      kolet_angle: bp?.kolet_angle || '',
      word_count: 1200,
      difficulty: bp?.difficulty || 'Medium',
      target_zone: 'global',
      lang,
      rationale: `SERP Battle: Kolet is ${serpSnapshot.kolet_position ? `#${serpSnapshot.kolet_position}` : 'not ranking'}. ${bp?.battle_plan?.[0] || ''}`,
      source: 'serp',
    };
    try {
      const res = await fetch(`${API_BASE}/api/topics/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(topic),
      });
      const data = await res.json();
      sessionStorage.setItem("activeTopic", JSON.stringify({ ...topic, id: data.id, status: 'pending' }));
    } catch {
      sessionStorage.setItem("activeTopic", JSON.stringify({ ...topic, id: `topic-serp-${Date.now()}`, status: 'pending' }));
    } finally {
      setWritingSerp(false);
    }
    router.push("/generate");
  }

  function clickSeed(s: string) { setSeed(s); runResearch(s, lang); }
  function clickGapTopic(t: GapTopic) { const s = t.topic.toLowerCase(); setSeed(s); runResearch(s, lang); }

  async function fetchIntel(days?: number) {
    const d = days ?? intelDays;
    setIntelLoading(true); setIntelError(""); setAnalysis(null);
    try {
      const res = await fetch(`${API_BASE}/api/research/competitor-intel?days=${d}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setIntelData(data);
      if (data.competitors?.length) setExpandedComp([...data.competitors].sort((a,b)=>b.count-a.count)[0].name);
    } catch (e: any) { setIntelError(e.message); } finally { setIntelLoading(false); }
  }

  async function analyzeIntel() {
    if (!intelData) return;
    setAnalysisLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/research/competitor-analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articles: intelData.competitors.flatMap(c => c.articles) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAnalysis(await res.json());
    } catch (e: any) { setIntelError(e.message); } finally { setAnalysisLoading(false); }
  }

  function deleteHistory(entry: HistoryEntry, e: React.MouseEvent) { e.stopPropagation(); removeFromHistory(entry.seed, entry.lang); setHistory(loadHistory()); }

  function toggle(kw: string) {
    setSelected(prev => { const n = new Set(prev); n.has(kw) ? n.delete(kw) : n.add(kw); return n; });
  }

  function goToIdeas() {
    if (!result) return;
    sessionStorage.setItem("selectedKeywords", JSON.stringify(result.keywords.filter(k => selected.has(k.keyword))));
    sessionStorage.setItem("lang", lang);
    router.push("/ideas");
  }

  const diffColor = (c: number) => c < 35 ? "text-green-500" : c < 65 ? "text-yellow-500" : "text-red-400";
  const diffLabel = (c: number) => c < 35 ? "Easy" : c < 65 ? "Medium" : "Hard";
  const visibleGapTopics = (gapData?.categories ?? []).flatMap(c => (c.topics ?? []).map(t => ({ ...t, category: c.name }))).filter(t => gapFilter === "gaps" ? t.article_count === 0 : true);

  // Sorted + filtered keyword list
  const intents = result ? [...new Set(result.keywords.map(k => k.intent || "Other").filter(Boolean))] : [];
  const displayedKeywords = result
    ? result.keywords
        .filter(k => !filterIntent || k.intent === filterIntent)
        .filter(k => !uncoveredOnly || !k.covered)
        .sort((a, b) => {
          if (sortBy === "volume")      return b.volume - a.volume;
          if (sortBy === "competition") return a.competition - b.competition;
          if (sortBy === "cpc")         return b.cpc - a.cpc;
          return b.opportunity_score - a.opportunity_score;
        })
    : [];

  const difficultyColor: Record<string, string> = { Easy: "text-white bg-emerald-600 border-emerald-700", Medium: "text-stone-900 bg-amber-500 border-amber-600", Hard: "text-white bg-red-600 border-red-700" };
  const effortColor: Record<string, string>     = { Low: "text-emerald-600", Medium: "text-amber-500", High: "text-red-600" };
  const readinessColor: Record<string, string>  = { Low: "text-white bg-red-600 border-red-700", Medium: "text-stone-900 bg-amber-500 border-amber-600", High: "text-white bg-emerald-600 border-emerald-700" };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Keyword Research</h1>
        <p className="text-gray-500">Find keywords where Kolet can outrank Airalo, Holafly, and Saily</p>
      </div>

      {/* ── Search bar ── */}
      <div className="bg-white border border-stone-200 rounded-xl p-6 mb-4 shadow-sm">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              value={seed}
              onChange={e => setSeed(e.target.value)}
              onKeyDown={e => e.key === "Enter" && runResearch()}
              placeholder="Enter seed keyword (e.g. esim voyage, carte sim étrangère)"
              className="w-full bg-white border border-stone-300 rounded-lg pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-kolet-yellow"
            />
          </div>
          <select
            value={lang}
            onChange={e => { setLang(e.target.value); setSeedCategories([]); }}
            className="bg-white border border-stone-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-kolet-yellow"
          >
            {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <button
            onClick={() => runResearch()}
            disabled={loading || !seed.trim()}
            className="bg-kolet-yellow hover:bg-kolet-yellow/85 disabled:opacity-40 text-kolet-black px-5 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {loading ? <><Loader size={14} className="animate-spin" /> Searching…</> : <><Search size={14} /> Search</>}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        {history.length > 0 && !loading && (
          <div className="mt-4 pt-4 border-t border-stone-200">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Clock size={11} className="text-gray-500" />
              <span className="text-xs text-gray-500 uppercase tracking-wider font-medium">Recent searches</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {history.map(entry => (
                <button
                  key={`${entry.seed}-${entry.lang}`}
                  onClick={() => runResearch(entry.seed, entry.lang)}
                  className="group flex items-center gap-2 bg-stone-100 hover:bg-stone-200 border border-stone-300 hover:border-stone-400 rounded-lg px-3 py-1.5 transition-colors"
                >
                  <span className="text-xs font-mono text-kolet-yellow shrink-0">{LANG_LABELS[entry.lang]}</span>
                  <span className="text-xs text-gray-600">{entry.seed}</span>
                  <span className="text-xs text-gray-500">{relativeTime(entry.ts)}</span>
                  <span role="button" onClick={e => deleteHistory(entry, e)} className="text-gray-400 hover:text-gray-500 transition-colors ml-0.5"><X size={10} /></span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Discovery panel ── */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden mb-6 shadow-sm">
        <div className="flex border-b border-stone-200 overflow-x-auto">
          {([
            { id: "seeds",     icon: Lightbulb, label: "Seed Ideas",       badge: null,                       badgeClass: "" },
            { id: "gaps",      icon: BarChart2, label: "Coverage Gaps",    badge: gapData?.gap_count || null, badgeClass: "bg-red-100 text-red-600" },
            { id: "intel",     icon: Eye,       label: "Competitor Intel", badge: intelData?.total || null,   badgeClass: "bg-stone-100 text-gray-500" },
            { id: "quickwins", icon: Target,    label: "Quick Wins",       badge: quickWins.length || null,   badgeClass: "bg-green-100 text-green-700" },
          ] as { id: string; icon: React.ComponentType<{ size: number }>; label: string; badge: number | null; badgeClass: string }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setDiscoveryTab(tab.id as any);
                if (tab.id === "quickwins" && !quickWinsLoaded && !quickWinsLoading) loadQuickWins();
              }}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                discoveryTab === tab.id ? "border-kolet-yellow text-gray-900" : "border-transparent text-gray-500 hover:text-gray-600"
              }`}
            >
              <tab.icon size={14} /> {tab.label}
              {tab.badge ? (
                <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-mono ${tab.badgeClass || "bg-stone-100 text-gray-500"}`}>
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Seeds tab */}
        {discoveryTab === "seeds" && (
          <div className="p-5">
            {seedCategories.length === 0 && !seedsLoading && (
              <div className="flex flex-col items-center py-8 gap-3">
                <p className="text-sm text-gray-500 text-center">
                  Not sure where to start? Get AI-powered seed keyword ideas for <strong className="text-gray-700">{LANGS.find(l => l.code === lang)?.label}</strong>.
                </p>
                <button onClick={loadSeeds} className="flex items-center gap-2 bg-kolet-yellow hover:bg-kolet-yellow/85 text-kolet-black px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                  <Lightbulb size={14} /> Generate seed ideas
                </button>
              </div>
            )}
            {seedsLoading && <div className="flex items-center justify-center py-10 gap-3 text-gray-500"><Loader size={16} className="animate-spin text-kolet-yellow" /><span className="text-sm">Generating seed ideas…</span></div>}
            {seedsError && <div className="bg-red-700 border border-red-800 rounded-lg p-3 text-xs text-white m-2">{seedsError}</div>}
            {seedCategories.length > 0 && !seedsLoading && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">Click any seed to run research instantly</p>
                  <button onClick={loadSeeds} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"><RefreshCw size={11} /> Regenerate</button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {seedCategories.map(cat => (
                    <div key={cat.name} className={`border rounded-xl p-4 ${CAT_COLORS[cat.name] || "text-gray-500 border-stone-300 bg-stone-50"}`}>
                      <div className="text-xs font-semibold uppercase tracking-wider mb-3">{cat.name}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {cat.seeds.map(s => (
                          <button key={s} onClick={() => clickSeed(s)} className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${PILL_COLORS[cat.name] || "bg-stone-100 text-gray-600 border-stone-300 hover:bg-stone-200"}`}>{s}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Coverage Gaps tab */}
        {discoveryTab === "gaps" && (
          <div className="p-5">
            {gapsLoading && <div className="flex items-center justify-center py-10 gap-3 text-gray-500"><Loader size={16} className="animate-spin text-kolet-yellow" /><span className="text-sm">Scanning library…</span></div>}
            {!gapData && !gapsLoading && (
              <div className="text-center py-10 text-gray-500"><BarChart2 size={28} className="mx-auto mb-3 opacity-20" /><p className="text-sm">Coverage data unavailable.</p></div>
            )}
            {gapData && !gapsLoading && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-gray-500"><span className="text-gray-900 font-semibold">{gapData.covered_count}</span>/{gapData.total_topics} topics covered</span>
                    <span className="text-red-500 font-semibold">{gapData.gap_count} gaps</span>
                    <div className="w-32 h-1.5 rounded-full bg-stone-200 overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${(gapData.covered_count / gapData.total_topics) * 100}%` }} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {["all","gaps"].map(f => (
                      <button key={f} onClick={() => setGapFilter(f as any)} className={`text-xs px-3 py-1 rounded-lg transition-colors ${gapFilter === f ? "bg-stone-200 text-gray-900" : "text-gray-500 hover:text-gray-600"}`}>{f === "all" ? "All topics" : "Gaps only"}</button>
                    ))}
                  </div>
                </div>
                {gapFilter === "gaps" && visibleGapTopics.length === 0 && (
                  <div className="text-center py-10 text-gray-500"><BarChart2 size={28} className="mx-auto mb-3 opacity-30" /><p className="text-sm">No uncovered topics — great coverage!</p></div>
                )}
                {(gapData?.categories ?? []).map(cat => {
                  const topics = (cat.topics ?? []).filter(t => gapFilter === "gaps" ? t.article_count === 0 : true);
                  if (!topics.length) return null;
                  return (
                    <div key={cat.name}>
                      <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${CAT_COLORS[cat.name]?.split(" ")[0] || "text-gray-500"}`}>{cat.name}</div>
                      <div className="grid grid-cols-4 gap-2">
                        {topics.map(t => (
                          <button key={t.topic} onClick={() => clickGapTopic(t)} className={`text-left px-3 py-2.5 rounded-xl border text-xs transition-colors group ${t.article_count === 0 ? "bg-stone-50 border-stone-300 hover:border-kolet-yellow text-gray-500 hover:text-gray-900" : "bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-500"}`}>
                            <div className="font-medium truncate">{t.topic}</div>
                            <div className="mt-1">
                              {t.article_count === 0
                                ? <span className="text-gray-400 group-hover:text-kolet-yellow transition-colors">→ Research</span>
                                : <span className="text-green-600">{t.article_count} article{t.article_count > 1 ? "s" : ""} · {(t.langs ?? []).map(l => l.toUpperCase()).join(" ")}</span>
                              }
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Competitor Intel tab */}
        {discoveryTab === "intel" && (
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Look back:</span>
                {[7,30,60,90].map(d => (
                  <button key={d} onClick={() => { setIntelDays(d); if (intelData) fetchIntel(d); }} className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${intelDays === d ? "bg-stone-200 text-gray-900" : "text-gray-500 hover:text-gray-600"}`}>{d}d</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {intelData && !analysisLoading && (
                  <button onClick={analyzeIntel} className="flex items-center gap-1.5 text-xs bg-kolet-yellow hover:bg-yellow-300 border border-yellow-400 text-kolet-black px-3 py-1.5 rounded-lg transition-colors">
                    <Cpu size={11} /> Analyse with AI
                  </button>
                )}
                {analysisLoading && <span className="flex items-center gap-1.5 text-xs text-gray-500"><Loader size={11} className="animate-spin" /> Analysing…</span>}
                <button onClick={() => fetchIntel()} disabled={intelLoading} className="flex items-center gap-1.5 text-xs bg-stone-100 hover:bg-stone-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
                  {intelLoading ? <><Loader size={11} className="animate-spin" /> Fetching…</> : <><RefreshCw size={11} /> {intelData ? "Refresh" : "Fetch competitor data"}</>}
                </button>
              </div>
            </div>
            {intelError && <div className="bg-red-700 border border-red-800 rounded-lg p-3 text-xs text-white mb-4">{intelError}</div>}
            {!intelData && !intelLoading && !intelError && (
              <div className="flex flex-col items-center py-10 gap-3">
                <Eye size={28} className="text-gray-400" />
                <p className="text-sm text-gray-500 text-center">See what Airalo, Holafly and Saily have been publishing lately.</p>
                <button onClick={() => fetchIntel()} className="flex items-center gap-2 bg-stone-100 hover:bg-stone-200 text-gray-600 px-5 py-2 rounded-lg text-sm font-medium transition-colors"><Eye size={14} /> Fetch competitor data</button>
              </div>
            )}
            {analysis && (
              <div className="bg-kolet-yellow/5 border border-kolet-yellow/20 rounded-xl p-5 mb-5 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-kolet-yellow/80"><Cpu size={14} /> AI Strategy Analysis</div>
                <p className="text-sm text-gray-600 leading-relaxed">{analysis.summary}</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Most invested topics</div>
                    <ul className="space-y-1">{(analysis.most_invested ?? []).map((t, i) => <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5"><span className="text-gray-400 shrink-0 mt-0.5">·</span>{t}</li>)}</ul>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Kolet opportunities</div>
                    <ul className="space-y-1">{(analysis.kolet_opportunities ?? []).map((o, i) => <li key={i} className="text-xs text-green-700 flex items-start gap-1.5"><span className="text-green-500 shrink-0 mt-0.5">→</span>{o}</li>)}</ul>
                  </div>
                </div>
              </div>
            )}
            {intelData && !intelLoading && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">{intelData.total} articles published in the last {intelData.days} days · click Research to start</p>
                {intelData.competitors.map(comp => {
                  const isOpen = expandedComp === comp.name;
                  const colors = {
                    green:  { border: "border-green-200",       bg: "bg-green-50",       text: "text-green-700" },
                    blue:   { border: "border-kolet-yellow/20", bg: "bg-kolet-yellow/5", text: "text-kolet-yellow" },
                    purple: { border: "border-purple-200",      bg: "bg-purple-50",      text: "text-purple-700" },
                  }[comp.color] || { border: "border-stone-200", bg: "bg-stone-50", text: "text-gray-600" };
                  return (
                    <div key={comp.name} className={`border rounded-xl overflow-hidden ${colors.border} ${colors.bg}`}>
                      <button onClick={() => setExpandedComp(isOpen ? null : comp.name)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-semibold ${colors.text}`}>{comp.name}</span>
                          {comp.status === "blocked"
                            ? <span className="text-xs px-2 py-0.5 rounded-full bg-stone-700 border border-stone-600 text-kolet-yellow font-mono">bot-protected</span>
                            : <span className={`text-xs px-2 py-0.5 rounded-full ${colors.bg} border ${colors.border} ${colors.text} font-mono`}>{comp.count} article{comp.count !== 1 ? "s" : ""}</span>
                          }
                        </div>
                        <ChevronRight size={14} className={`text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      </button>
                      {isOpen && (
                        <div className="border-t border-stone-200/50 divide-y divide-stone-100">
                          {comp.articles.length === 0
                            ? <div className="px-4 py-4 text-xs text-center text-gray-500">{comp.status === "blocked" ? "Blocked by bot protection." : `No articles in the last ${intelData?.days} days.`}</div>
                            : comp.articles.map((art, i) => (
                                <div key={i} className="flex items-center justify-between px-4 py-2.5 group hover:bg-white/50">
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    {art.date && <span className="text-xs text-gray-400 font-mono shrink-0 w-20">{art.date}</span>}
                                    <span className="text-xs text-gray-600 truncate">{art.title}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 ml-3">
                                    <button onClick={() => runResearch(art.title.toLowerCase(), lang)} className="text-xs text-kolet-yellow hover:text-kolet-yellow/80 opacity-0 group-hover:opacity-100 transition-opacity">Research →</button>
                                    <a href={art.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-gray-400 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"><ExternalLink size={11} /></a>
                                  </div>
                                </div>
                              ))
                          }
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Quick Wins tab (GSC near-miss) */}
        {discoveryTab === "quickwins" && (
          <div className="p-5">
            {quickWinsLoading && <div className="flex items-center justify-center py-10 gap-3 text-gray-500"><Loader size={16} className="animate-spin text-kolet-yellow" /><span className="text-sm">Fetching GSC near-miss keywords…</span></div>}
            {quickWinsError && (
              <div className="bg-red-700 border border-red-800 rounded-lg p-4 text-sm text-white">
                <p className="font-medium mb-1">Could not load Quick Wins</p>
                <p className="text-xs">{quickWinsError}</p>
                <p className="text-xs mt-2 text-gray-500">Make sure GSC is configured (GSC_CREDENTIALS_JSON + GSC_SITE_URL env vars).</p>
              </div>
            )}
            {!quickWinsLoading && !quickWinsError && quickWins.length === 0 && quickWinsLoaded && (
              <div className="text-center py-10 text-gray-500"><Target size={28} className="mx-auto mb-3 opacity-20" /><p className="text-sm">No near-miss keywords found (position 8–20 with 50+ impressions).</p></div>
            )}
            {quickWins.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">{quickWins.length} keywords at position 8–20 with 50+ impressions · small push → page 1</p>
                  <button onClick={loadQuickWins} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"><RefreshCw size={11} /> Refresh</button>
                </div>
                <div className="overflow-x-auto rounded-xl border border-stone-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-stone-200 text-xs text-gray-500 bg-stone-50">
                        <th className="px-4 py-2.5 text-left font-medium">Keyword</th>
                        <th className="px-4 py-2.5 text-right font-medium">Position</th>
                        <th className="px-4 py-2.5 text-right font-medium">Impressions</th>
                        <th className="px-4 py-2.5 text-right font-medium">CTR</th>
                        <th className="px-4 py-2.5 text-left font-medium">Recommended action</th>
                        <th className="px-4 py-2.5 text-left font-medium">Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quickWins.map(qw => (
                        <tr key={qw.query} className="border-b border-stone-100 hover:bg-stone-50 group">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-900 font-medium text-xs">{qw.query}</span>
                              <button onClick={() => runResearch(qw.query, lang)} className="text-xs text-kolet-yellow hover:text-kolet-yellow/80 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Research →</button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-xs font-semibold ${qw.position <= 12 ? "text-amber-600" : "text-gray-500"}`}>{qw.position}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-gray-600">{qw.impressions.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-xs text-gray-500">{qw.ctr}%</td>
                          <td className="px-4 py-3">
                            {qw.action ? (
                              <span className="text-xs text-gray-600">{qw.action}</span>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {qw.priority && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                                qw.priority === "High" ? "bg-red-50 text-red-600 border-red-200" :
                                qw.priority === "Medium" ? "bg-amber-50 text-amber-600 border-amber-200" :
                                "bg-stone-100 text-stone-500 border-stone-200"
                              }`}>{qw.priority}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Results ── */}
      {result && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            {[
              { label: "Keywords Found",   value: result.summary.total_keywords,                         icon: Search },
              { label: "Monthly Searches", value: result.summary.total_monthly_volume.toLocaleString(),  icon: TrendingUp },
              { label: "Easy Wins",        value: result.summary.easy_wins_count,                        icon: Target },
              { label: "Already Covered",  value: result.summary.covered_count ?? "—",                  icon: CheckCircle2 },
              { label: "Avg Competition",  value: `${result.summary.avg_competition}/100`,               icon: Zap },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2"><Icon size={14} className="text-kolet-yellow" /><span className="text-xs text-gray-500">{label}</span></div>
                <div className="text-xl font-bold text-gray-900">{value}</div>
              </div>
            ))}
          </div>

          {/* Recommendations */}
          <div className="bg-kolet-yellow/5 border border-kolet-yellow/20 rounded-xl p-5 mb-6">
            <h3 className="text-sm font-semibold text-kolet-yellow/80 mb-3 flex items-center gap-2"><Target size={14} /> Recommendations</h3>
            <ul className="space-y-1.5">{result.recommendations.map((r, i) => <li key={i} className="text-sm text-gray-600">{r}</li>)}</ul>
          </div>

          {/* SERP Battle + AI Visibility buttons */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => runSerpAnalysis()}
              disabled={serpLoading}
              className="flex items-center gap-2 bg-white hover:bg-stone-50 border border-stone-200 text-gray-700 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
            >
              {serpLoading ? <><Loader size={14} className="animate-spin" /> Analyzing SERP…</> : <><Swords size={14} /> SERP Battle for "{seed}"</>}
            </button>
            <button
              onClick={runAiVisibility}
              disabled={aiVisLoading}
              className="flex items-center gap-2 bg-white hover:bg-stone-50 border border-stone-200 text-gray-700 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
            >
              {aiVisLoading ? <><Loader size={14} className="animate-spin" /> Analyzing…</> : <><Bot size={14} /> AI Search Visibility</>}
            </button>
          </div>

          {serpError && <div className="bg-red-700 border border-red-800 rounded-xl p-4 text-sm text-white mb-6">{serpError}</div>}

          {/* SERP Snapshot card */}
          {serpSnapshot && (
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden mb-6 shadow-sm">
              <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Swords size={16} className="text-kolet-yellow" />
                  <h3 className="text-sm font-semibold text-gray-900">SERP Battle — "{serpSnapshot.keyword}"</h3>
                  <div className="flex items-center gap-2 ml-2">
                    {serpSnapshot.ai_overview && <span className="text-xs px-2 py-0.5 rounded-full bg-sky-600 border border-sky-700 text-white font-medium">AI Overview</span>}
                    {serpSnapshot.featured_snippet && <span className="text-xs px-2 py-0.5 rounded-full bg-violet-600 border border-violet-700 text-white font-medium">Featured Snippet</span>}
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  Kolet: <span className={serpSnapshot.kolet_position ? "text-green-600 font-semibold" : "text-red-500 font-semibold"}>
                    {serpSnapshot.kolet_position ? `#${serpSnapshot.kolet_position}` : "Not ranking"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 divide-x divide-stone-100">
                {/* Competitor positions */}
                <div className="p-4">
                  <div className="text-xs text-gray-500 uppercase tracking-wider mb-3 font-medium">Competitor Positions</div>
                  <div className="space-y-2">
                    {serpSnapshot.competitor_positions.map(c => (
                      <div key={c.name} className="flex items-center justify-between">
                        <span className="text-xs text-gray-700 capitalize">{c.name}</span>
                        {c.position
                          ? <span className={`text-xs font-semibold ${c.position <= 3 ? "text-red-600" : c.position <= 10 ? "text-amber-600" : "text-gray-500"}`}>#{c.position}</span>
                          : <span className="text-xs text-gray-400">—</span>
                        }
                      </div>
                    ))}
                  </div>
                  {serpSnapshot.people_also_ask.length > 0 && (
                    <div className="mt-4">
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-medium">People Also Ask</div>
                      <ul className="space-y-1.5">
                        {serpSnapshot.people_also_ask.map((q, i) => (
                          <li key={i} className="text-xs text-gray-600 flex items-start gap-1"><span className="text-gray-400 shrink-0 mt-0.5">?</span>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Top 10 organic */}
                <div className="p-4 col-span-1">
                  <div className="text-xs text-gray-500 uppercase tracking-wider mb-3 font-medium">Top 10 Organic</div>
                  <div className="space-y-1.5">
                    {serpSnapshot.organic.slice(0, 8).map(r => (
                      <div key={r.position} className={`flex items-center gap-2 text-xs p-1.5 rounded-lg ${r.isKolet ? "bg-kolet-yellow/10 border border-kolet-yellow/20" : r.isCompetitor ? "bg-red-50 border border-red-100" : ""}`}>
                        <span className={`font-mono shrink-0 w-4 ${r.isCompetitor ? "text-red-500 font-bold" : "text-gray-400"}`}>#{r.position}</span>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className={`truncate hover:underline ${r.isKolet ? "text-kolet-yellow font-medium" : r.isCompetitor ? "text-red-700 font-medium" : "text-gray-600"}`}>{r.domain}</a>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Battle plan */}
                {serpSnapshot.battle_plan && (
                  <div className="p-4">
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-3 font-medium">Kolet Battle Plan</div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${difficultyColor[serpSnapshot.battle_plan.difficulty] || "bg-stone-100 text-stone-600 border-stone-200"}`}>{serpSnapshot.battle_plan.difficulty}</span>
                        <span className="text-xs text-gray-500">effort: <span className={effortColor[serpSnapshot.battle_plan.estimated_effort]}>{serpSnapshot.battle_plan.estimated_effort}</span></span>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Format</div>
                        <span className="text-xs font-medium text-gray-700 bg-stone-100 px-2 py-0.5 rounded">{serpSnapshot.battle_plan.recommended_format}</span>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1.5">Kolet angle</div>
                        <p className="text-xs text-gray-700 leading-relaxed">{serpSnapshot.battle_plan.kolet_angle}</p>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1.5">Steps</div>
                        <ol className="space-y-1">
                          {serpSnapshot.battle_plan.battle_plan.map((step, i) => (
                            <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                              <span className="text-kolet-yellow font-bold shrink-0">{i+1}.</span>{step}
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {serpSnapshot.battle_plan.target_snippet && <span className="text-xs px-2 py-0.5 bg-violet-600 border border-violet-700 text-white rounded-full">Target snippet</span>}
                        {serpSnapshot.battle_plan.target_ai_overview && <span className="text-xs px-2 py-0.5 bg-sky-600 border border-sky-700 text-white rounded-full">Target AI Overview</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Write from SERP footer */}
              <div className="px-5 py-3 border-t border-stone-200 flex items-center justify-between bg-stone-50">
                <p className="text-xs text-gray-500">
                  {serpSnapshot.battle_plan
                    ? `Difficulty: ${serpSnapshot.battle_plan.difficulty} · Effort: ${serpSnapshot.battle_plan.estimated_effort}`
                    : "Use this analysis to brief your article"}
                </p>
                <button
                  onClick={writeFromSerp}
                  disabled={writingSerp}
                  className="flex items-center gap-1.5 px-4 py-2 bg-kolet-yellow hover:bg-kolet-yellow/85 text-kolet-black text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
                >
                  {writingSerp ? (
                    <><Loader size={13} className="animate-spin" /> Creating topic…</>
                  ) : (
                    <><ChevronRight size={13} /> Write this Article</>
                  )}
                </button>
              </div>
            </div>
          )}

          {aiVisError && <div className="bg-red-700 border border-red-800 rounded-xl p-4 text-sm text-white mb-6">{aiVisError}</div>}

          {/* AI Visibility card */}
          {aiVis && (
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden mb-6 shadow-sm">
              <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bot size={16} className="text-kolet-yellow" />
                  <h3 className="text-sm font-semibold text-gray-900">AI Search Visibility</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${readinessColor[aiVis.overall_ai_readiness] || "bg-stone-100 text-stone-600 border-stone-200"}`}>{aiVis.overall_ai_readiness} readiness</span>
                </div>
              </div>
              <div className="p-5 space-y-5">
                {/* Priority action */}
                <div className="bg-kolet-yellow/5 border border-kolet-yellow/20 rounded-xl p-4">
                  <div className="text-xs text-kolet-yellow/70 uppercase tracking-wider font-semibold mb-1">Priority action</div>
                  <p className="text-sm text-gray-700">{aiVis.priority_action}</p>
                </div>

                {/* Quick wins */}
                {aiVis.quick_wins?.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">Quick wins for AI citations</div>
                    <div className="grid grid-cols-3 gap-3">
                      {aiVis.quick_wins.map((qw, i) => (
                        <div key={i} className="border border-stone-200 rounded-xl p-3">
                          <div className="text-xs font-semibold text-gray-900 mb-1">{qw.format}</div>
                          <div className="text-xs text-gray-500 italic mb-2">{qw.example}</div>
                          <div className="text-xs text-gray-600">{qw.why}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Three-column tips */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Google AI Overviews", tips: aiVis.ai_overview_tips, color: "text-blue-700 bg-blue-50 border-blue-200" },
                    { label: "Perplexity AI",        tips: aiVis.perplexity_tips,  color: "text-purple-700 bg-purple-50 border-purple-200" },
                    { label: "ChatGPT / Claude",     tips: aiVis.chatgpt_tips,     color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                  ].map(col => (
                    <div key={col.label}>
                      <div className={`text-xs font-semibold px-2 py-0.5 rounded border inline-block mb-2 ${col.color}`}>{col.label}</div>
                      <ul className="space-y-1.5">{(col.tips || []).map((t, i) => <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5"><span className="text-gray-400 shrink-0 mt-0.5">→</span>{t}</li>)}</ul>
                    </div>
                  ))}
                </div>

                {/* Schema + PAA */}
                <div className="grid grid-cols-2 gap-4">
                  {aiVis.schema_markup?.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Structured data to add</div>
                      <div className="flex flex-wrap gap-1.5">
                        {aiVis.schema_markup.map((s, i) => <span key={i} className="text-xs px-2 py-0.5 bg-stone-700 border border-stone-600 text-kolet-cream rounded font-mono">{s}</span>)}
                      </div>
                    </div>
                  )}
                  {aiVis.paa_opportunities?.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Create answer pages for</div>
                      <ul className="space-y-1">{aiVis.paa_opportunities.map((q, i) => <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5"><span className="text-gray-400 shrink-0 mt-0.5">?</span>{q}</li>)}</ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Keyword table */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden mb-6 shadow-sm">
            <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-sm font-semibold text-gray-900">
                Keywords ({displayedKeywords.length}{displayedKeywords.length !== result.keywords.length ? ` / ${result.keywords.length}` : ""}) — select to target
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Intent filter */}
                {intents.length > 1 && (
                  <select
                    value={filterIntent}
                    onChange={e => setFilterIntent(e.target.value)}
                    className="text-xs bg-white border border-stone-300 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:border-kolet-yellow"
                  >
                    <option value="">All intents</option>
                    {intents.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                )}
                {/* Uncovered filter */}
                <button
                  onClick={() => setUncoveredOnly(v => !v)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${uncoveredOnly ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-white border-stone-300 text-gray-500 hover:text-gray-700"}`}
                >
                  {uncoveredOnly ? "✓ " : ""}Uncovered only
                </button>
                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="text-xs bg-white border border-stone-300 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:border-kolet-yellow"
                >
                  <option value="opportunity">Sort: Opportunity</option>
                  <option value="volume">Sort: Volume</option>
                  <option value="competition">Sort: Easiest first</option>
                  <option value="cpc">Sort: CPC</option>
                </select>
                <button
                  onClick={() => setSelected(new Set(displayedKeywords.slice(0, 10).map(k => k.keyword)))}
                  className="text-xs text-kolet-yellow hover:text-kolet-yellow/80"
                >
                  Select top 10
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-xs text-gray-500 bg-stone-50">
                    <th className="px-4 py-2.5 text-left w-8"></th>
                    <th className="px-4 py-2.5 text-left">Keyword</th>
                    <th className="px-4 py-2.5 text-left">Intent</th>
                    <th className="px-4 py-2.5 text-right cursor-pointer hover:text-gray-700" onClick={() => setSortBy("volume")}>Volume {sortBy === "volume" ? "↓" : ""}</th>
                    <th className="px-4 py-2.5 text-right cursor-pointer hover:text-gray-700" onClick={() => setSortBy("competition")}>Difficulty {sortBy === "competition" ? "↑" : ""}</th>
                    <th className="px-4 py-2.5 text-right cursor-pointer hover:text-gray-700" onClick={() => setSortBy("cpc")}>CPC {sortBy === "cpc" ? "↓" : ""}</th>
                    <th className="px-4 py-2.5 text-center">Trend</th>
                    <th className="px-4 py-2.5 text-right cursor-pointer hover:text-gray-700" onClick={() => setSortBy("opportunity")}>Opportunity {sortBy === "opportunity" ? "↓" : ""}</th>
                    <th className="px-4 py-2.5 text-center w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {displayedKeywords.map(kw => (
                    <tr
                      key={kw.keyword}
                      onClick={() => toggle(kw.keyword)}
                      className={`border-b border-stone-100 cursor-pointer transition-colors group ${selected.has(kw.keyword) ? "bg-kolet-yellow/10" : "hover:bg-stone-50"}`}
                    >
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(kw.keyword)} onChange={() => toggle(kw.keyword)} onClick={e => e.stopPropagation()} className="accent-kolet-yellow" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900 font-medium">{kw.keyword}</span>
                          {kw.covered && <span className="text-xs px-1.5 py-0.5 bg-emerald-600 border border-emerald-700 text-white rounded font-medium">covered</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {kw.intent && kw.intent !== "Other" ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${INTENT_STYLE[kw.intent] || INTENT_STYLE.Other}`}>{kw.intent}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{kw.volume.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-medium ${diffColor(kw.competition)}`}>{diffLabel(kw.competition)}</span>
                        <span className="text-gray-400 text-xs ml-1">({kw.competition})</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 tabular-nums">${kw.cpc.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center"><Sparkline data={kw.trend} /></div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-kolet-yellow font-medium">{kw.opportunity_score}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={e => { e.stopPropagation(); runSerpAnalysis(kw.keyword); }}
                          title="SERP Battle"
                          className="text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Swords size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">
              {selected.size > 0 ? `${selected.size} keyword${selected.size > 1 ? "s" : ""} selected` : "Select keywords to continue"}
            </p>
            <button
              onClick={goToIdeas}
              disabled={selected.size === 0}
              className="bg-kolet-yellow hover:bg-kolet-yellow/90 disabled:opacity-40 text-kolet-black px-6 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              Generate Article Ideas <ChevronRight size={14} />
            </button>
          </div>
        </>
      )}

      {!result && !loading && (
        <div className="text-center py-16 text-gray-500">
          <Globe size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-sm">Enter a seed keyword above or pick one from the discovery panel</p>
          <p className="text-xs mt-1 text-gray-400">Try: "esim voyage", "carte sim pays étranger", "internet roaming"</p>
        </div>
      )}
    </div>
  );
}
