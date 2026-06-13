"use client";
import { useState } from "react";
import { Search, TrendingUp, Target, Zap, ChevronRight, Globe } from "lucide-react";
import { useRouter } from "next/navigation";

const LANGS = [
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "nl", label: "Dutch" },
];

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

export default function ResearchPage() {
  const router = useRouter();
  const [seed, setSeed]       = useState("");
  const [lang, setLang]       = useState("fr");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [result, setResult]   = useState<ResearchResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function runResearch() {
    if (!seed.trim()) return;
    setLoading(true); setError(""); setResult(null); setSelected(new Set());
    try {
      const res = await fetch("http://localhost:8000/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: seed.trim(), lang }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Research failed");
      }
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Keyword Research</h1>
        <p className="text-gray-400">Find keywords where Kolet can outrank Airalo, Holafly, and Saily</p>
      </div>

      {/* Search bar */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              value={seed}
              onChange={e => setSeed(e.target.value)}
              onKeyDown={e => e.key === "Enter" && runResearch()}
              placeholder="Enter seed keyword (e.g. esim voyage, carte sim étrangère)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <select
            value={lang}
            onChange={e => setLang(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            {LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
          <button
            onClick={runResearch}
            disabled={loading || !seed.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {loading ? (
              <><span className="animate-spin">⟳</span> Searching...</>
            ) : (
              <><Search size={14} /> Search</>
            )}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: "Keywords Found",   value: result.summary.total_keywords,                         icon: Search },
              { label: "Monthly Searches", value: result.summary.total_monthly_volume.toLocaleString(),  icon: TrendingUp },
              { label: "Easy Wins",        value: result.summary.easy_wins_count,                        icon: Target },
              { label: "Avg Competition",  value: `${result.summary.avg_competition}/100`,               icon: Zap },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={14} className="text-blue-400" />
                  <span className="text-xs text-gray-500">{label}</span>
                </div>
                <div className="text-xl font-bold text-white">{value}</div>
              </div>
            ))}
          </div>

          {/* Recommendations */}
          <div className="bg-blue-950/40 border border-blue-800/40 rounded-xl p-5 mb-6">
            <h3 className="text-sm font-semibold text-blue-300 mb-3 flex items-center gap-2">
              <Target size={14} /> Recommendations
            </h3>
            <ul className="space-y-1.5">
              {result.recommendations.map((r, i) => (
                <li key={i} className="text-sm text-gray-300">{r}</li>
              ))}
            </ul>
          </div>

          {/* Keyword table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                Keywords ({result.keywords.length}) — select the ones you want to target
              </h3>
              <button
                onClick={() => setSelected(new Set(result.keywords.slice(0, 10).map(k => k.keyword)))}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Select top 10
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-xs text-gray-500">
                    <th className="px-4 py-2 text-left w-8"></th>
                    <th className="px-4 py-2 text-left">Keyword</th>
                    <th className="px-4 py-2 text-right">Volume</th>
                    <th className="px-4 py-2 text-right">Difficulty</th>
                    <th className="px-4 py-2 text-right">CPC</th>
                    <th className="px-4 py-2 text-right">Opportunity</th>
                  </tr>
                </thead>
                <tbody>
                  {result.keywords.map((kw, i) => (
                    <tr
                      key={kw.keyword}
                      onClick={() => toggle(kw.keyword)}
                      className={`border-b border-gray-800/50 cursor-pointer transition-colors ${
                        selected.has(kw.keyword) ? "bg-blue-600/10" : "hover:bg-gray-800/50"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(kw.keyword)}
                          onChange={() => toggle(kw.keyword)}
                          onClick={e => e.stopPropagation()}
                          className="accent-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-white font-medium">{kw.keyword}</td>
                      <td className="px-4 py-3 text-right text-gray-300">{kw.volume.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-medium ${diffColor(kw.competition)}`}>
                          {diffLabel(kw.competition)}
                        </span>
                        <span className="text-gray-600 text-xs ml-1">({kw.competition})</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400">${kw.cpc.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-blue-400 font-medium">{kw.opportunity_score}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* CTA */}
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">
              {selected.size > 0 ? `${selected.size} keyword${selected.size > 1 ? "s" : ""} selected` : "Select keywords to continue"}
            </p>
            <button
              onClick={goToIdeas}
              disabled={selected.size === 0}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              Generate Article Ideas <ChevronRight size={14} />
            </button>
          </div>
        </>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div className="text-center py-20 text-gray-600">
          <Globe size={40} className="mx-auto mb-4 opacity-30" />
          <p className="text-sm">Enter a seed keyword to discover opportunities</p>
          <p className="text-xs mt-1 text-gray-700">Try: "esim voyage", "carte sim pays étranger", "internet roaming"</p>
        </div>
      )}
    </div>
  );
}
