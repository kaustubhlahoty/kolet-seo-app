"use client";
import { useState, useEffect } from "react";
import { API_BASE } from "@/lib/api";
import { Lightbulb, ChevronRight, Loader, Sparkles, CheckCircle, X, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

type Topic = {
  id: string;
  headline: string;
  focus_keyword: string;
  secondary_keywords: string[];
  content_format: string;
  kolet_angle: string;
  word_count: number;
  difficulty: "Easy" | "Medium" | "Hard";
  target_zone: string;
  lang: string;
  rationale: string;
  status?: string;
  source?: string;
};

const diffColors: Record<string, string> = {
  Easy:   "bg-emerald-600 text-white border-emerald-700",
  Medium: "bg-amber-500 text-stone-900 border-amber-600",
  Hard:   "bg-red-600 text-white border-red-700",
};

export default function IdeasPage() {
  const router = useRouter();
  const [tab, setTab]           = useState<"ideas" | "suggestions">("ideas");
  const [topics, setTopics]     = useState<Topic[]>([]);
  const [suggestions, setSuggestions] = useState<Topic[]>([]);
  const [loading, setLoading]   = useState(false);
  const [sugLoading, setSugLoading] = useState(false);
  const [error, setError]       = useState("");
  const [sugError, setSugError] = useState("");
  const [lang, setLang]         = useState("fr");
  const [sugLang, setSugLang]   = useState("en");
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);

  useEffect(() => {
    const kws = sessionStorage.getItem("selectedKeywords");
    const l   = sessionStorage.getItem("lang") || "fr";
    setLang(l);
    if (kws) generateIdeas(JSON.parse(kws), l);
    loadSuggestions();
  }, []);

  async function generateIdeas(keywords: any[], lang: string) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/ideas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, lang }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      const data = await res.json();
      setTopics(data.topics);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSuggestions() {
    try {
      const res = await fetch(`${API_BASE}/api/topics?status=suggested`);
      if (!res.ok) return;
      const data = await res.json();
      setSuggestions((data.topics || []).filter((t: Topic) => t.source === "auto"));
    } catch {}
  }

  async function generateSuggestions() {
    setSugLoading(true); setSugError("");
    try {
      const res = await fetch(`${API_BASE}/api/suggestions/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: sugLang, count: 7 }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const data = await res.json();
      setSuggestions(prev => {
        const ids = new Set(prev.map(t => t.id));
        return [...(data.topics || []).filter((t: Topic) => !ids.has(t.id)), ...prev];
      });
    } catch (e: any) {
      setSugError(e.message);
    } finally {
      setSugLoading(false);
    }
  }

  async function approveSuggestion(topic: Topic) {
    setApproving(topic.id);
    try {
      await fetch(`${API_BASE}/api/topics/${topic.id}/approve`, { method: "POST" });
      sessionStorage.setItem("activeTopic", JSON.stringify({ ...topic, status: "pending" }));
      router.push("/generate");
    } catch {
      sessionStorage.setItem("activeTopic", JSON.stringify({ ...topic, status: "pending" }));
      router.push("/generate");
    }
  }

  async function rejectSuggestion(id: string) {
    setRejecting(id);
    try {
      await fetch(`${API_BASE}/api/topics/${id}/reject`, { method: "POST" });
      setSuggestions(prev => prev.filter(t => t.id !== id));
    } catch {
      setSuggestions(prev => prev.filter(t => t.id !== id));
    } finally {
      setRejecting(null);
    }
  }

  function validate(topic: Topic) {
    sessionStorage.setItem("activeTopic", JSON.stringify(topic));
    router.push("/generate");
  }

  function TopicCard({ topic, i, onWrite, onReject }: {
    topic: Topic; i: number;
    onWrite: () => void;
    onReject?: () => void;
  }) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-5 hover:border-stone-300 transition-colors shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gray-500 text-xs font-mono">#{i + 1}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${diffColors[topic.difficulty] || "bg-stone-200 text-stone-700 border-stone-300"}`}>
                {topic.difficulty}
              </span>
              <span className="text-xs text-gray-500">📄 {topic.content_format}</span>
              <span className="text-xs text-gray-500 ml-1">~{topic.word_count?.toLocaleString()} words</span>
            </div>

            <h3 className="text-base font-semibold text-gray-900 mb-2">{topic.headline}</h3>

            <div className="flex flex-wrap gap-1.5 mb-3">
              <span className="text-xs bg-kolet-yellow text-kolet-black border border-yellow-400 px-2 py-0.5 rounded-full">
                🎯 {topic.focus_keyword}
              </span>
              {(topic.secondary_keywords || []).slice(0, 4).map(kw => (
                <span key={kw} className="text-xs bg-stone-100 text-gray-500 px-2 py-0.5 rounded-full">{kw}</span>
              ))}
            </div>

            {topic.kolet_angle && (
              <div className="bg-stone-50 rounded-lg px-3 py-2 text-xs text-gray-500 mb-2">
                <span className="text-gray-500 mr-1">Kolet angle:</span> {topic.kolet_angle}
              </div>
            )}

            {topic.rationale && (
              <p className="text-xs text-gray-500 italic">{topic.rationale}</p>
            )}
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <button
              onClick={onWrite}
              className="bg-kolet-yellow hover:bg-kolet-yellow/85 text-kolet-black px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <CheckCircle size={13} /> Write
            </button>
            {onReject && (
              <button
                onClick={onReject}
                disabled={rejecting === topic.id}
                className="border border-stone-300 hover:border-red-400 hover:text-red-500 text-gray-500 px-4 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5"
              >
                {rejecting === topic.id ? <Loader size={11} className="animate-spin" /> : <X size={11} />}
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Article Ideas</h1>
          <p className="text-gray-500 text-sm">Topic recommendations based on your keyword research</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-stone-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setTab("ideas")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === "ideas" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"}`}
        >
          <span className="flex items-center gap-1.5"><Lightbulb size={14} /> Keyword Ideas</span>
        </button>
        <button
          onClick={() => { setTab("suggestions"); loadSuggestions(); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === "suggestions" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"}`}
        >
          <Sparkles size={14} />
          AI Suggestions
          {suggestions.length > 0 && (
            <span className="bg-kolet-yellow text-kolet-black text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">{suggestions.length}</span>
          )}
        </button>
      </div>

      {/* ── Keyword Ideas tab ── */}
      {tab === "ideas" && (
        <>
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 text-gray-500">
              <Loader className="animate-spin mb-4" size={28} />
              <p className="text-sm">Claude is analysing your keywords and generating ideas...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-700 border border-red-800 rounded-xl p-4 text-white text-sm">{error}</div>
          )}

          {!loading && topics.length > 0 && (
            <div className="space-y-4">
              {topics.map((topic, i) => (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  i={i}
                  onWrite={() => validate(topic)}
                />
              ))}
            </div>
          )}

          {!loading && topics.length === 0 && !error && (
            <div className="text-center py-20 text-gray-500">
              <Lightbulb size={40} className="mx-auto mb-4 opacity-30" />
              <p className="text-sm">No topics yet — go to Research to get started</p>
              <button onClick={() => router.push("/research")}
                className="mt-4 text-kolet-yellow text-sm hover:text-kolet-yellow/80">
                ← Back to Research
              </button>
            </div>
          )}
        </>
      )}

      {/* ── AI Suggestions tab ── */}
      {tab === "suggestions" && (
        <>
          <div className="flex items-start justify-between gap-4 mb-5">
            <p className="text-sm text-gray-500 leading-relaxed">
              Claude autonomously generates fresh topic ideas every day at 8am based on travel season, competitor gaps, and your content coverage.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={sugLang}
                onChange={e => setSugLang(e.target.value)}
                className="bg-white border border-stone-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-kolet-yellow"
              >
                <option value="en">🇬🇧 English</option>
                <option value="fr">🇫🇷 French</option>
                <option value="de">🇩🇪 German</option>
                <option value="es">🇪🇸 Spanish</option>
                <option value="nl">🇳🇱 Dutch</option>
              </select>
              <button
                onClick={generateSuggestions}
                disabled={sugLoading}
                className="flex items-center gap-1.5 px-4 py-2 bg-kolet-yellow hover:bg-kolet-yellow/85 text-kolet-black text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
              >
                {sugLoading ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Generate now
              </button>
            </div>
          </div>

          {sugError && (
            <div className="bg-red-700 border border-red-800 rounded-xl p-4 text-white text-sm mb-4">{sugError}</div>
          )}

          {sugLoading && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <Loader className="animate-spin mb-4" size={28} />
              <p className="text-sm">Claude is researching current travel trends and generating topic ideas...</p>
            </div>
          )}

          {!sugLoading && suggestions.length > 0 && (
            <div className="space-y-4">
              {suggestions.map((topic, i) => (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  i={i}
                  onWrite={() => approveSuggestion(topic)}
                  onReject={() => rejectSuggestion(topic.id)}
                />
              ))}
            </div>
          )}

          {!sugLoading && suggestions.length === 0 && !sugError && (
            <div className="text-center py-20 text-gray-500">
              <Sparkles size={40} className="mx-auto mb-4 opacity-30" />
              <p className="text-sm mb-2">No pending suggestions yet</p>
              <p className="text-xs text-gray-400">Click "Generate now" or wait for the daily 8am run</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
