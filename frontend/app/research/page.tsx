"use client";
import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "@/lib/api";
import {
  Search, TrendingUp, Target, Zap, ChevronRight, Globe,
  Clock, X, Lightbulb, BarChart2, RefreshCw, Loader, Eye,
  ExternalLink, Cpu,
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
};

type ResearchResult = {
  keywords: Keyword[];
  summary: {
    total_keywords: number;
    total_monthly_volume: number;
    avg_competition: number;
    easy_wins_count: number;
    top_opportunity: string;
  };
  recommendations: string[];
};

type SeedCategory = { name: string; seeds: string[] };
type GapTopic = { topic: string; article_count: number; langs: string[]; articles: {id:string;title:string;lang:string}[] };
type GapCategory = { name: string; topics: GapTopic[] };
type GapData = { categories: GapCategory[]; total_topics: number; covered_count: number; gap_count: number };

type CompArticle = { url: string; title: string; date: string; competitor: string };
type Competitor = { name: string; color: string; articles: CompArticle[]; count: number; status?: string };
type IntelData = { competitors: Competitor[]; total: number; days: number };
type IntelAnalysis = {
  topic_clusters: { cluster: string; count: number; competitors: string[] }[];
  most_invested: string[];
  kolet_opportunities: string[];
  summary: string;
};

function loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
  catch { return []; }
}
function saveHistory(entries: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
}
function addToHistory(seed: string, lang: string) {
  const entries = loadHistory().filter(e => !(e.seed === seed && e.lang === lang));
  saveHistory([{ seed, lang, ts: Date.now() }, ...entries]);
}
function removeFromHistory(seed: string, lang: string) {
  saveHistory(loadHistory().filter(e => !(e.seed === seed && e.lang === lang)));
}
function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
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

export default function ResearchPage() {
  const router = useRouter();
  const [seed, setSeed]         = useState("");
  const [lang, setLang]         = useState("fr");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [result, setResult]     = useState<ResearchResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [history, setHistory]   = useState<HistoryEntry[]>([]);

  // Discovery panel
  const [discoveryTab, setDiscoveryTab] = useState<"seeds" | "gaps" | "intel">("seeds");
  const [seedCategories, setSeedCategories] = useState<SeedCategory[]>([]);
  const [seedsLoading, setSeedsLoading]     = useState(false);
  const [seedsError, setSeedsError]         = useState("");
  const [gapData, setGapData]               = useState<GapData | null>(null);
  const [gapsLoading, setGapsLoading]       = useState(false);
  const [gapFilter, setGapFilter]           = useState<"all" | "gaps">("all");

  // Competitor intel
  const [intelData, setIntelData]           = useState<IntelData | null>(null);
  const [intelLoading, setIntelLoading]     = useState(false);
  const [intelError, setIntelError]         = useState("");
  const [intelDays, setIntelDays]           = useState(60);
  const [analysis, setAnalysis]             = useState<IntelAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [expandedComp, setExpandedComp]     = useState<string | null>(null);

  useEffect(() => { setHistory(loadHistory()); }, []);

  // Load gap data on mount
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
    try {
      const res = await fetch(`${API_BASE}/api/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: s, lang: l }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Research failed");
      }
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
    setSeedsLoading(true);
    setSeedsError("");
    try {
      const res = await fetch(`${API_BASE}/api/research/suggest-seeds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to generate seeds");
      }
      const data = await res.json();
      setSeedCategories(data.categories || []);
    } catch (e: any) {
      setSeedsError(e.message);
    } finally {
      setSeedsLoading(false);
    }
  }

  function clickSeed(s: string) {
    setSeed(s);
    runResearch(s, lang);
  }

  function clickGapTopic(topic: GapTopic) {
    const s = topic.topic.toLowerCase();
    setSeed(s);
    runResearch(s, lang);
  }

  async function fetchIntel(days?: number) {
    const d = days ?? intelDays;
    setIntelLoading(true);
    setIntelError("");
    setAnalysis(null);
    try {
      const res = await fetch(`${API_BASE}/api/research/competitor-intel?days=${d}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setIntelData(data);
      // Auto-expand the competitor with the most articles
      if (data.competitors?.length) {
        const top = [...data.competitors].sort((a, b) => b.count - a.count)[0];
        setExpandedComp(top.name);
      }
    } catch (e: any) {
      setIntelError(e.message);
    } finally {
      setIntelLoading(false);
    }
  }

  async function analyzeIntel() {
    if (!intelData) return;
    const allArticles = intelData.competitors.flatMap(c => c.articles);
    setAnalysisLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/research/competitor-analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articles: allArticles }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAnalysis(data);
    } catch (e: any) {
      setIntelError(e.message);
    } finally {
      setAnalysisLoading(false);
    }
  }

  function deleteHistory(entry: HistoryEntry, e: React.MouseEvent) {
    e.stopPropagation();
    removeFromHistory(entry.seed, entry.lang);
    setHistory(loadHistory());
  }

  function toggle(kw: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(kw) ? next.delete(kw) : next.add(kw);
      return next;
    });
  }

  function goToIdeas() {
    if (!result) return;
    const chosen = result.keywords.filter(k => selected.has(k.keyword));
    sessionStorage.setItem("selectedKeywords", JSON.stringify(chosen));
    sessionStorage.setItem("lang", lang);
    router.push("/ideas");
  }

  const diffColor = (comp: number) =>
    comp < 35 ? "text-green-400" : comp < 65 ? "text-yellow-400" : "text-red-400";
  const diffLabel = (comp: number) =>
    comp < 35 ? "Easy" : comp < 65 ? "Medium" : "Hard";

  const visibleGapTopics = (gapData?.categories ?? []).flatMap(c =>
    (c.topics ?? []).map(t => ({ ...t, category: c.name }))
  ).filter(t => gapFilter === "gaps" ? t.article_count === 0 : true);

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

        {/* History */}
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
                  <span
                    role="button"
                    onClick={e => deleteHistory(entry, e)}
                    className="text-gray-400 hover:text-gray-500 transition-colors ml-0.5 leading-none"
                  >
                    <X size={10} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Discovery panel ── */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden mb-6 shadow-sm">
        {/* Tab bar */}
        <div className="flex border-b border-stone-200">
          <button
            onClick={() => setDiscoveryTab("seeds")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
              discoveryTab === "seeds"
                ? "border-kolet-yellow text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-600"
            }`}
          >
            <Lightbulb size={14} /> Seed Ideas
          </button>
          <button
            onClick={() => setDiscoveryTab("gaps")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
              discoveryTab === "gaps"
                ? "border-kolet-yellow text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-600"
            }`}
          >
            <BarChart2 size={14} /> Coverage Gaps
            {gapData && gapData.gap_count > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded text-xs bg-red-900/50 text-red-400 font-mono">
                {gapData.gap_count}
              </span>
            )}
          </button>
          <button
            onClick={() => setDiscoveryTab("intel")}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
              discoveryTab === "intel"
                ? "border-kolet-yellow text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-600"
            }`}
          >
            <Eye size={14} /> Competitor Intel
            {intelData && (
              <span className="ml-1 px-1.5 py-0.5 rounded text-xs bg-stone-100 text-gray-500 font-mono">
                {intelData.total}
              </span>
            )}
          </button>
        </div>

        {/* ── Seed Ideas tab ── */}
        {discoveryTab === "seeds" && (
          <div className="p-5">
            {seedCategories.length === 0 && !seedsLoading && (
              <div className="flex flex-col items-center py-8 gap-3">
                <p className="text-sm text-gray-500 text-center">
                  Not sure where to start? Get AI-powered seed keyword ideas for <strong className="text-gray-700">{LANGS.find(l => l.code === lang)?.label}</strong>.
                </p>
                <button
                  onClick={loadSeeds}
                  className="flex items-center gap-2 bg-kolet-yellow hover:bg-kolet-yellow/85 text-kolet-black px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Lightbulb size={14} /> Generate seed ideas
                </button>
              </div>
            )}

            {seedsLoading && (
              <div className="flex items-center justify-center py-10 gap-3 text-gray-500">
                <Loader size={16} className="animate-spin text-kolet-yellow" />
                <span className="text-sm">Generating seed ideas…</span>
              </div>
            )}

            {seedsError && (
              <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3 text-xs text-red-400 m-2">
                {seedsError}
              </div>
            )}

            {seedCategories.length > 0 && !seedsLoading && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    Click any seed to run research instantly · Language: <span className="text-gray-700">{LANGS.find(l => l.code === lang)?.label}</span>
                  </p>
                  <button
                    onClick={loadSeeds}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <RefreshCw size={11} /> Regenerate
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {seedCategories.map(cat => (
                    <div key={cat.name} className={`border rounded-xl p-4 ${CAT_COLORS[cat.name] || "text-gray-500 border-stone-300 bg-stone-50"}`}>
                      <div className="text-xs font-semibold uppercase tracking-wider mb-3">{cat.name}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {cat.seeds.map(s => (
                          <button
                            key={s}
                            onClick={() => clickSeed(s)}
                            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${PILL_COLORS[cat.name] || "bg-stone-100 text-gray-600 border-stone-300 hover:bg-stone-200"}`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Coverage Gaps tab ── */}
        {discoveryTab === "gaps" && (
          <div className="p-5">
            {gapsLoading && (
              <div className="flex items-center justify-center py-10 gap-3 text-gray-500">
                <Loader size={16} className="animate-spin text-kolet-yellow" />
                <span className="text-sm">Scanning library…</span>
              </div>
            )}

            {!gapData && !gapsLoading && (
              <div className="text-center py-10 text-gray-500">
                <BarChart2 size={28} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">Coverage data unavailable — make sure the backend is running.</p>
              </div>
            )}

            {gapData && !gapsLoading && (
              <div className="space-y-4">
                {/* Summary bar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-gray-500">
                      <span className="text-gray-900 font-semibold">{gapData.covered_count}</span>
                      <span className="text-gray-500">/{gapData.total_topics}</span> topics covered
                    </span>
                    <span className="text-red-400 font-semibold">{gapData.gap_count} gaps</span>
                    <div className="w-32 h-1.5 rounded-full bg-stone-200 overflow-hidden">
                      <div
                        className="h-full bg-green-600 rounded-full"
                        style={{ width: `${(gapData.covered_count / gapData.total_topics) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setGapFilter("all")}
                      className={`text-xs px-3 py-1 rounded-lg transition-colors ${
                        gapFilter === "all" ? "bg-stone-200 text-gray-900" : "text-gray-500 hover:text-gray-600"
                      }`}
                    >
                      All topics
                    </button>
                    <button
                      onClick={() => setGapFilter("gaps")}
                      className={`text-xs px-3 py-1 rounded-lg transition-colors ${
                        gapFilter === "gaps" ? "bg-red-900/50 text-red-300" : "text-gray-500 hover:text-gray-600"
                      }`}
                    >
                      Gaps only
                    </button>
                  </div>
                </div>

                {/* All-covered empty state */}
                {gapFilter === "gaps" && visibleGapTopics.length === 0 && (
                  <div className="text-center py-10 text-gray-500">
                    <BarChart2 size={28} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm text-gray-500">No uncovered topics — great coverage!</p>
                    <button
                      onClick={() => setGapFilter("all")}
                      className="mt-2 text-xs text-kolet-yellow hover:text-kolet-yellow/80 underline"
                    >
                      Show all topics
                    </button>
                  </div>
                )}

                {/* Topic grid */}
                {(gapData?.categories ?? []).map(cat => {
                  const topics = (cat.topics ?? []).filter(t =>
                    gapFilter === "gaps" ? t.article_count === 0 : true
                  );
                  if (topics.length === 0) return null;
                  return (
                    <div key={cat.name}>
                      <div className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                        CAT_COLORS[cat.name]?.split(" ")[0] || "text-gray-500"
                      }`}>{cat.name}</div>
                      <div className="grid grid-cols-4 gap-2">
                        {topics.map(t => (
                          <button
                            key={t.topic}
                            onClick={() => clickGapTopic(t)}
                            title={t.article_count > 0 ? `${t.article_count} article(s): ${(t.langs ?? []).join(", ")}` : "No coverage — click to research"}
                            className={`text-left px-3 py-2.5 rounded-xl border text-xs transition-colors group ${
                              t.article_count === 0
                                ? "bg-stone-50 border-stone-300 hover:border-kolet-yellow text-gray-500 hover:text-gray-900"
                                : "bg-green-900/20 border-green-800/40 text-green-300 hover:bg-green-900/40"
                            }`}
                          >
                            <div className="font-medium truncate">{t.topic}</div>
                            <div className="mt-1 flex items-center gap-1.5">
                              {t.article_count === 0 ? (
                                <span className="text-gray-500 group-hover:text-kolet-yellow transition-colors">
                                  → Research
                                </span>
                              ) : (
                                <>
                                  <span className="text-green-600">{t.article_count} article{t.article_count > 1 ? "s" : ""}</span>
                                  <span className="text-gray-500 font-mono">{(t.langs ?? []).map(l => l.toUpperCase()).join(" ")}</span>
                                </>
                              )}
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

        {/* ── Competitor Intel tab ── */}
        {discoveryTab === "intel" && (
          <div className="p-5">

            {/* Toolbar */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Look back:</span>
                {[7, 30, 60, 90].map(d => (
                  <button
                    key={d}
                    onClick={() => { setIntelDays(d); if (intelData) fetchIntel(d); }}
                    className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                      intelDays === d ? "bg-stone-200 text-gray-900" : "text-gray-500 hover:text-gray-600"
                    }`}
                  >{d}d</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {intelData && !analysisLoading && (
                  <button
                    onClick={analyzeIntel}
                    className="flex items-center gap-1.5 text-xs bg-kolet-yellow/10 hover:bg-kolet-yellow/20 border border-kolet-yellow/20 text-kolet-yellow/80 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Cpu size={11} /> Analyse with AI
                  </button>
                )}
                {analysisLoading && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Loader size={11} className="animate-spin" /> Analysing…
                  </span>
                )}
                <button
                  onClick={() => fetchIntel()}
                  disabled={intelLoading}
                  className="flex items-center gap-1.5 text-xs bg-stone-100 hover:bg-stone-200 text-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                >
                  {intelLoading
                    ? <><Loader size={11} className="animate-spin" /> Fetching…</>
                    : <><RefreshCw size={11} /> {intelData ? "Refresh" : "Fetch competitor data"}</>}
                </button>
              </div>
            </div>

            {/* Error */}
            {intelError && (
              <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3 text-xs text-red-400 mb-4">
                {intelError}
              </div>
            )}

            {/* Empty prompt */}
            {!intelData && !intelLoading && !intelError && (
              <div className="flex flex-col items-center py-10 gap-3">
                <Eye size={28} className="text-gray-400" />
                <p className="text-sm text-gray-500 text-center">
                  See what Airalo, Holafly and Saily have been publishing lately.
                </p>
                <button
                  onClick={() => fetchIntel()}
                  className="flex items-center gap-2 bg-stone-100 hover:bg-stone-200 text-gray-600 px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Eye size={14} /> Fetch competitor data
                </button>
              </div>
            )}

            {/* AI analysis panel */}
            {analysis && (
              <div className="bg-kolet-yellow/5 border border-kolet-yellow/20 rounded-xl p-5 mb-5 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-kolet-yellow/80">
                  <Cpu size={14} /> AI Strategy Analysis
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{analysis.summary}</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Most invested topics</div>
                    <ul className="space-y-1">
                      {(analysis.most_invested ?? []).map((t, i) => (
                        <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                          <span className="text-gray-500 shrink-0 mt-0.5">·</span>{t}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Kolet opportunities</div>
                    <ul className="space-y-1">
                      {(analysis.kolet_opportunities ?? []).map((o, i) => (
                        <li key={i} className="text-xs text-green-300 flex items-start gap-1.5">
                          <span className="text-green-700 shrink-0 mt-0.5">→</span>{o}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                {(analysis.topic_clusters ?? []).length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Topic clusters</div>
                    <div className="flex flex-wrap gap-2">
                      {analysis.topic_clusters.map((c, i) => (
                        <div key={i} className="flex items-center gap-1.5 bg-stone-100 border border-stone-200 rounded-lg px-2.5 py-1 shadow-sm">
                          <span className="text-xs text-gray-900">{c.cluster}</span>
                          <span className="text-xs text-gray-500 font-mono">{c.count}</span>
                          <span className="text-xs text-gray-500">{c.competitors.join(", ")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Competitor columns */}
            {intelData && !intelLoading && (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  {intelData.total} articles published in the last {intelData.days} days · click any title to research that topic
                </p>
                {intelData.competitors.map(comp => {
                  const isOpen = expandedComp === comp.name;
                  const borderColor = comp.color === "green" ? "border-green-800/50"
                    : comp.color === "blue" ? "border-kolet-yellow/20" : "border-purple-800/50";
                  const textColor = comp.color === "green" ? "text-green-400"
                    : comp.color === "blue" ? "text-kolet-yellow" : "text-purple-400";
                  const bgColor = comp.color === "green" ? "bg-green-900/15"
                    : comp.color === "blue" ? "bg-kolet-yellow/5" : "bg-purple-900/15";

                  return (
                    <div key={comp.name} className={`border rounded-xl overflow-hidden ${borderColor} ${bgColor}`}>
                      {/* Competitor header */}
                      <button
                        onClick={() => setExpandedComp(isOpen ? null : comp.name)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-semibold ${textColor}`}>{comp.name}</span>
                          {comp.status === "blocked" ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/30 border border-yellow-800/40 text-yellow-500 font-mono">
                              bot-protected
                            </span>
                          ) : (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${bgColor} border ${borderColor} ${textColor} font-mono`}>
                              {comp.count} article{comp.count !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <ChevronRight size={14} className={`text-gray-500 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      </button>

                      {/* Article list */}
                      {isOpen && (
                        <div className="border-t border-stone-200/50 divide-y divide-stone-200/30">
                          {comp.articles.length === 0 ? (
                            <div className="px-4 py-4 text-xs text-center">
                              {comp.status === "blocked"
                                ? <span className="text-yellow-600">Sitemap blocked by bot protection (Cloudflare). Cannot fetch automatically.</span>
                                : <span className="text-gray-500">No articles found in the last {intelData?.days} days.</span>
                              }
                            </div>
                          ) : comp.articles.map((art, i) => (
                            <div key={i} className="flex items-center justify-between px-4 py-2.5 group hover:bg-white/5">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                {art.date && (
                                  <span className="text-xs text-gray-500 font-mono shrink-0 w-20">{art.date}</span>
                                )}
                                <span className="text-xs text-gray-600 truncate">{art.title}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 ml-3">
                                <button
                                  onClick={() => runResearch(art.title.toLowerCase(), lang)}
                                  className="text-xs text-kolet-yellow hover:text-kolet-yellow/80 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  Research →
                                </button>
                                <a
                                  href={art.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="text-gray-400 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <ExternalLink size={11} />
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Results ── */}
      {result && (
        <>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: "Keywords Found",   value: result.summary.total_keywords,                         icon: Search },
              { label: "Monthly Searches", value: result.summary.total_monthly_volume.toLocaleString(),  icon: TrendingUp },
              { label: "Easy Wins",        value: result.summary.easy_wins_count,                        icon: Target },
              { label: "Avg Competition",  value: `${result.summary.avg_competition}/100`,               icon: Zap },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={14} className="text-kolet-yellow" />
                  <span className="text-xs text-gray-500">{label}</span>
                </div>
                <div className="text-xl font-bold text-gray-900">{value}</div>
              </div>
            ))}
          </div>

          <div className="bg-kolet-yellow/5 border border-kolet-yellow/20 rounded-xl p-5 mb-6">
            <h3 className="text-sm font-semibold text-kolet-yellow/80 mb-3 flex items-center gap-2">
              <Target size={14} /> Recommendations
            </h3>
            <ul className="space-y-1.5">
              {result.recommendations.map((r, i) => (
                <li key={i} className="text-sm text-gray-600">{r}</li>
              ))}
            </ul>
          </div>

          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden mb-6 shadow-sm">
            <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                Keywords ({result.keywords.length}) — select the ones you want to target
              </h3>
              <button
                onClick={() => setSelected(new Set(result.keywords.slice(0, 10).map(k => k.keyword)))}
                className="text-xs text-kolet-yellow hover:text-kolet-yellow/80"
              >
                Select top 10
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-xs text-gray-500">
                    <th className="px-4 py-2 text-left w-8"></th>
                    <th className="px-4 py-2 text-left">Keyword</th>
                    <th className="px-4 py-2 text-right">Volume</th>
                    <th className="px-4 py-2 text-right">Difficulty</th>
                    <th className="px-4 py-2 text-right">CPC</th>
                    <th className="px-4 py-2 text-right">Opportunity</th>
                  </tr>
                </thead>
                <tbody>
                  {result.keywords.map(kw => (
                    <tr
                      key={kw.keyword}
                      onClick={() => toggle(kw.keyword)}
                      className={`border-b border-stone-200/50 cursor-pointer transition-colors ${
                        selected.has(kw.keyword) ? "bg-kolet-yellow/10" : "hover:bg-stone-50"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(kw.keyword)}
                          onChange={() => toggle(kw.keyword)}
                          onClick={e => e.stopPropagation()}
                          className="accent-kolet-yellow"
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-900 font-medium">{kw.keyword}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{kw.volume.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-medium ${diffColor(kw.competition)}`}>{diffLabel(kw.competition)}</span>
                        <span className="text-gray-500 text-xs ml-1">({kw.competition})</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">${kw.cpc.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-kolet-yellow font-medium">{kw.opportunity_score}</span>
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
