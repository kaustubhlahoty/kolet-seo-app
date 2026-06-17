"use client";
import { useState, useEffect } from "react";
import { API_BASE } from "@/lib/api";
import { Lightbulb, ChevronRight, Target, FileText, TrendingUp, Loader } from "lucide-react";
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
};

const diffColors: Record<string, string> = {
  Easy:   "bg-green-900/40 text-green-400 border-green-800",
  Medium: "bg-yellow-900/40 text-yellow-400 border-yellow-800",
  Hard:   "bg-red-900/40 text-red-400 border-red-800",
};

const formatIcons: Record<string, string> = {
  "comparison/review":  "⚖️",
  "how-to guide":       "📋",
  "listicle":           "📝",
  "pillar/explainer":   "🏛️",
  "destination guide":  "🗺️",
  "article":            "📄",
};

export default function IdeasPage() {
  const router = useRouter();
  const [topics, setTopics]   = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [lang, setLang]       = useState("fr");

  useEffect(() => {
    const kws  = sessionStorage.getItem("selectedKeywords");
    const lang = sessionStorage.getItem("lang") || "fr";
    setLang(lang);
    if (kws) generateIdeas(JSON.parse(kws), lang);
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

  function validate(topic: Topic) {
    sessionStorage.setItem("activeTopic", JSON.stringify(topic));
    router.push("/generate");
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Article Ideas</h1>
        <p className="text-gray-500">Claude has analysed your keywords and created these topic recommendations</p>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-24 text-gray-500">
          <Loader className="animate-spin mb-4" size={28} />
          <p className="text-sm">Claude is analysing your keywords and generating ideas...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {!loading && topics.length > 0 && (
        <div className="space-y-4">
          {topics.map((topic, i) => (
            <div key={topic.id}
              className="bg-white border border-stone-200 rounded-xl p-5 hover:border-stone-300 transition-colors shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-gray-500 text-xs font-mono">#{i + 1}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${diffColors[topic.difficulty]}`}>
                      {topic.difficulty}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatIcons[topic.content_format] || "📄"} {topic.content_format}
                    </span>
                    <span className="text-xs text-gray-500 ml-1">~{topic.word_count.toLocaleString()} words</span>
                  </div>

                  {/* Headline */}
                  <h3 className="text-base font-semibold text-gray-900 mb-2">{topic.headline}</h3>

                  {/* Keywords */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className="text-xs bg-kolet-yellow/10 text-kolet-yellow/80 border border-kolet-yellow/20 px-2 py-0.5 rounded-full">
                      🎯 {topic.focus_keyword}
                    </span>
                    {(topic.secondary_keywords || []).slice(0, 4).map(kw => (
                      <span key={kw} className="text-xs bg-stone-100 text-gray-500 px-2 py-0.5 rounded-full">{kw}</span>
                    ))}
                  </div>

                  {/* Kolet angle */}
                  <div className="bg-stone-50 rounded-lg px-3 py-2 text-xs text-gray-500 mb-2">
                    <span className="text-gray-500 mr-1">Kolet angle:</span> {topic.kolet_angle}
                  </div>

                  {/* Rationale */}
                  <p className="text-xs text-gray-500 italic">{topic.rationale}</p>
                </div>

                {/* Validate button */}
                <button
                  onClick={() => validate(topic)}
                  className="shrink-0 bg-kolet-yellow hover:bg-kolet-yellow/85 text-kolet-black px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                >
                  Write <ChevronRight size={14} />
                </button>
              </div>
            </div>
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
    </div>
  );
}
