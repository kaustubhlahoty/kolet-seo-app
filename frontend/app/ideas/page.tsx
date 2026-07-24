"use client";
import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "@/lib/api";
import { Lightbulb, Loader, Sparkles, CheckCircle, X, RefreshCw, Wand2 } from "lucide-react";
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

const LANG_OPTIONS = [
  { code: "all", label: "All" },
  { code: "en",  label: "🇬🇧 EN" },
  { code: "fr",  label: "🇫🇷 FR" },
  { code: "de",  label: "🇩🇪 DE" },
  { code: "es",  label: "🇪🇸 ES" },
  { code: "nl",  label: "🇳🇱 NL" },
];

export default function IdeasPage() {
  const router = useRouter();

  const [tab, setTab]         = useState<"ideas" | "suggestions" | "mine">("ideas");
  const [filterLang, setFilterLang] = useState("all");

  // Keyword Ideas tab
  const [topics, setTopics]   = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [lang, setLang]       = useState("fr");

  // AI Suggestions tab
  const [suggestions, setSuggestions]   = useState<Topic[]>([]);
  const [sugLoading, setSugLoading]     = useState(false);
  const [sugError, setSugError]         = useState("");
  const [sugLang, setSugLang]           = useState("en");

  // My Idea tab
  const [myIdea, setMyIdea]         = useState("");
  const [myKeywords, setMyKeywords] = useState("");
  const [myLang, setMyLang]         = useState("en");
  const [myTopics, setMyTopics]     = useState<Topic[]>([]);
  const [myLoading, setMyLoading]   = useState(false);
  const [myDbLoading, setMyDbLoading] = useState(false);
  const [myError, setMyError]       = useState("");
  const [myInsight, setMyInsight]   = useState("");

  // Shared
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);

  // ── Data loading ────────────────────────────────────────────────────────

  const loadSuggestions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/topics?status=suggested&source=auto`);
      if (!res.ok) return;
      const data = await res.json();
      setSuggestions(data.topics || []);
    } catch {}
  }, []);

  const loadMyTopics = useCallback(async () => {
    setMyDbLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/topics?status=suggested&source=manual`);
      if (!res.ok) return;
      const data = await res.json();
      setMyTopics(data.topics || []);
    } catch {} finally {
      setMyDbLoading(false);
    }
  }, []);

  useEffect(() => {
    const kws = sessionStorage.getItem("selectedKeywords");
    const l   = sessionStorage.getItem("lang") || "fr";
    setLang(l);
    if (kws) generateIdeas(JSON.parse(kws), l);
    loadSuggestions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload My Idea list from DB each time the tab is entered
  useEffect(() => {
    if (tab === "mine") loadMyTopics();
  }, [tab, loadMyTopics]);

  // ── Actions ─────────────────────────────────────────────────────────────

  async function generateIdeas(keywords: any[], l: string) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/ideas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords, lang: l }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      setTopics((await res.json()).topics);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
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

  async function generateFromIdea() {
    if (!myIdea.trim()) return;
    setMyLoading(true); setMyError(""); setMyInsight("");
    try {
      const keywords = myKeywords.split(",").map(k => k.trim()).filter(Boolean);
      const res = await fetch(`${API_BASE}/api/suggestions/from-idea`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: myIdea, keywords, lang: myLang, count: 5 }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to generate");
      const data = await res.json();
      // Merge new topics at the top, avoid duplicates
      setMyTopics(prev => {
        const newIds = new Set((data.topics || []).map((t: Topic) => t.id));
        return [...(data.topics || []), ...prev.filter(t => !newIds.has(t.id))];
      });
      setMyInsight(data.insight || "");
    } catch (e: any) {
      setMyError(e.message);
    } finally {
      setMyLoading(false);
    }
  }

  async function approveSuggestion(topic: Topic) {
    setApproving(topic.id);
    try {
      await fetch(`${API_BASE}/api/topics/${topic.id}/approve`, { method: "POST" });
    } catch {}
    sessionStorage.setItem("activeTopic", JSON.stringify({ ...topic, status: "pending" }));
    router.push("/generate");
  }

  async function rejectSuggestion(id: string) {
    setRejecting(id);
    try {
      await fetch(`${API_BASE}/api/topics/${id}/reject`, { method: "POST" });
    } catch {} finally {
      setRejecting(null);
    }
    setSuggestions(prev => prev.filter(t => t.id !== id));
    setMyTopics(prev => prev.filter(t => t.id !== id));
  }

  function validate(topic: Topic) {
    sessionStorage.setItem("activeTopic", JSON.stringify(topic));
    router.push("/generate");
  }

  // ── Filtered views ───────────────────────────────────────────────────────

  const filteredSuggestions = filterLang === "all"
    ? suggestions
    : suggestions.filter(t => t.lang === filterLang);

  const filteredMyTopics = filterLang === "all"
    ? myTopics
    : myTopics.filter(t => t.lang === filterLang);

  // ── Sub-components ───────────────────────────────────────────────────────

  function LangFilter() {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-gray-400 mr-1">Language:</span>
        {LANG_OPTIONS.map(l => (
          <button
            key={l.code}
            onClick={() => setFilterLang(l.code)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              filterLang === l.code
                ? "bg-kolet-yellow text-kolet-black"
                : "bg-stone-100 text-gray-500 hover:bg-stone-200"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
    );
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
              {topic.lang && (
                <span className="text-xs bg-stone-100 text-gray-400 px-1.5 py-0.5 rounded uppercase">{topic.lang}</span>
              )}
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
              disabled={approving === topic.id}
              className="bg-kolet-yellow hover:bg-kolet-yellow/85 text-kolet-black px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-60"
            >
              {approving === topic.id ? <Loader size={13} className="animate-spin" /> : <CheckCircle size={13} />}
              Write
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

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Article Ideas</h1>
        <p className="text-gray-500 text-sm">Topic recommendations based on your keyword research</p>
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
        <button
          onClick={() => setTab("mine")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${tab === "mine" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"}`}
        >
          <Wand2 size={14} />
          My Ideas
          {myTopics.length > 0 && (
            <span className="bg-stone-300 text-gray-700 text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">{myTopics.length}</span>
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
          {error && <div className="bg-red-700 border border-red-800 rounded-xl p-4 text-white text-sm">{error}</div>}
          {!loading && topics.length > 0 && (
            <div className="space-y-4">
              {topics.map((topic, i) => (
                <TopicCard key={topic.id} topic={topic} i={i} onWrite={() => validate(topic)} />
              ))}
            </div>
          )}
          {!loading && topics.length === 0 && !error && (
            <div className="text-center py-20 text-gray-500">
              <Lightbulb size={40} className="mx-auto mb-4 opacity-30" />
              <p className="text-sm">No topics yet — go to Research to get started</p>
              <button onClick={() => router.push("/research")} className="mt-4 text-kolet-yellow text-sm hover:text-kolet-yellow/80">
                ← Back to Research
              </button>
            </div>
          )}
        </>
      )}

      {/* ── AI Suggestions tab ── */}
      {tab === "suggestions" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <LangFilter />
            <div className="flex items-center gap-2">
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

          {sugError && <div className="bg-red-700 border border-red-800 rounded-xl p-4 text-white text-sm mb-4">{sugError}</div>}

          {sugLoading && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <Loader className="animate-spin mb-4" size={28} />
              <p className="text-sm">Claude is researching current travel trends and generating topic ideas...</p>
            </div>
          )}

          {!sugLoading && filteredSuggestions.length > 0 && (
            <>
              {filterLang !== "all" && suggestions.length !== filteredSuggestions.length && (
                <p className="text-xs text-gray-400 mb-3">Showing {filteredSuggestions.length} of {suggestions.length} ideas</p>
              )}
              <div className="space-y-4">
                {filteredSuggestions.map((topic, i) => (
                  <TopicCard
                    key={topic.id} topic={topic} i={i}
                    onWrite={() => approveSuggestion(topic)}
                    onReject={() => rejectSuggestion(topic.id)}
                  />
                ))}
              </div>
            </>
          )}

          {!sugLoading && filteredSuggestions.length === 0 && !sugError && (
            <div className="text-center py-20 text-gray-500">
              <Sparkles size={40} className="mx-auto mb-4 opacity-30" />
              {filterLang !== "all" && suggestions.length > 0
                ? <p className="text-sm">No {filterLang.toUpperCase()} suggestions — try a different language or generate new ones</p>
                : <>
                    <p className="text-sm mb-2">No pending suggestions yet</p>
                    <p className="text-xs text-gray-400">Click "Generate now" or wait for the daily 8am run</p>
                  </>
              }
            </div>
          )}
        </>
      )}

      {/* ── My Ideas tab ── */}
      {tab === "mine" && (
        <>
          {/* Input form */}
          <div className="bg-white border border-stone-200 rounded-xl p-6 mb-6 shadow-sm">
            <label className="block text-sm font-semibold text-gray-800 mb-1">Describe your idea</label>
            <p className="text-xs text-gray-400 mb-3">A topic, angle, keyword, or rough prompt — Claude will research and expand it into 5 article angles.</p>
            <textarea
              value={myIdea}
              onChange={e => setMyIdea(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generateFromIdea(); }}
              placeholder='e.g. "eSIM for Japan trip" or "comparison between Kolet and buying a local SIM card"'
              rows={3}
              className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-kolet-yellow resize-none"
            />
            <div className="mt-3 flex flex-wrap gap-3">
              <div className="flex-1 min-w-48">
                <label className="block text-xs text-gray-500 mb-1">Keywords <span className="text-gray-400">(optional, comma-separated)</span></label>
                <input
                  value={myKeywords}
                  onChange={e => setMyKeywords(e.target.value)}
                  placeholder="esim japan, travel sim, prepaid data japan"
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-kolet-yellow"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Article language</label>
                <select
                  value={myLang}
                  onChange={e => setMyLang(e.target.value)}
                  className="bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-kolet-yellow"
                >
                  <option value="en">🇬🇧 English</option>
                  <option value="fr">🇫🇷 French</option>
                  <option value="de">🇩🇪 German</option>
                  <option value="es">🇪🇸 Spanish</option>
                  <option value="nl">🇳🇱 Dutch</option>
                </select>
              </div>
            </div>
            <button
              onClick={generateFromIdea}
              disabled={myLoading || !myIdea.trim()}
              className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-kolet-yellow hover:bg-kolet-yellow/85 text-kolet-black text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {myLoading ? <Loader size={14} className="animate-spin" /> : <Wand2 size={14} />}
              {myLoading ? "Analysing…" : "Analyse & generate angles"}
            </button>
          </div>

          {myError && <div className="bg-red-700 border border-red-800 rounded-xl p-4 text-white text-sm mb-4">{myError}</div>}

          {myLoading && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <Loader className="animate-spin mb-4" size={28} />
              <p className="text-sm">Claude is researching your idea and generating angles…</p>
              <p className="text-xs text-gray-400 mt-1">Takes about 15–20 seconds</p>
            </div>
          )}

          {!myLoading && myInsight && (
            <div className="bg-stone-50 border border-stone-200 rounded-xl px-5 py-4 mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Claude's analysis</p>
              <p className="text-sm text-gray-700 leading-relaxed">{myInsight}</p>
            </div>
          )}

          {!myLoading && (myTopics.length > 0 || myDbLoading) && (
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <LangFilter />
              {myDbLoading
                ? <span className="text-xs text-gray-400 flex items-center gap-1"><Loader size={11} className="animate-spin" /> Loading saved ideas…</span>
                : <span className="text-xs text-gray-400">
                    {filteredMyTopics.length} saved idea{filteredMyTopics.length !== 1 ? "s" : ""}
                    {filterLang !== "all" && myTopics.length !== filteredMyTopics.length && ` (${myTopics.length} total)`}
                  </span>
              }
            </div>
          )}

          {!myLoading && filteredMyTopics.length > 0 && (
            <div className="space-y-4">
              {filteredMyTopics.map((topic, i) => (
                <TopicCard
                  key={topic.id} topic={topic} i={i}
                  onWrite={() => approveSuggestion(topic)}
                  onReject={() => rejectSuggestion(topic.id)}
                />
              ))}
            </div>
          )}

          {!myLoading && !myDbLoading && filteredMyTopics.length === 0 && !myError && (
            <div className="text-center py-16 text-gray-500">
              <Wand2 size={40} className="mx-auto mb-4 opacity-20" />
              {filterLang !== "all" && myTopics.length > 0
                ? <p className="text-sm">No {filterLang.toUpperCase()} ideas saved — try a different language filter</p>
                : <p className="text-sm">Describe your idea above and Claude will expand it into multiple article angles</p>
              }
            </div>
          )}
        </>
      )}
    </div>
  );
}
