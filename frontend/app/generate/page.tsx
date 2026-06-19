"use client";
import { useState, useEffect, useRef } from "react";
import { API_BASE } from "@/lib/api";
import {
  CheckCircle, Image as ImageIcon, FileText, Loader, Edit2,
  Send, Download, Zap, AlertTriangle, BookOpen, ArrowRight,
} from "lucide-react";
import { useRouter } from "next/navigation";

type Phase = "idle" | "briefing" | "brief" | "writing" | "review" | "generating" | "done";
type Stage = { label: string; done: boolean; active: boolean };
type ImagePrompt = { placeholder: string; description: string; prompt: string };
type DuplicateArticle = { id: string; title: string; lang: string; status: string; match_type: string };

function cleanPreview(text: string): string {
  const cutpoints = [
    /^## FAQ/m,
    /^---\s*\n## À propos de l'auteur/m,
    /^## À propos de l'auteur/m,
    /^## Articles liés/m,
  ];
  let end = text.length;
  for (const re of cutpoints) {
    const m = text.search(re);
    if (m !== -1 && m < end) end = m;
  }
  return text.slice(0, end);
}

const STAGES_WRITING: Stage[] = [
  { label: "Starting generation", done: false, active: false },
  { label: "Writing article",     done: false, active: false },
  { label: "Saving article",      done: false, active: false },
];

const STAGES_IMAGES: Stage[] = [
  { label: "Starting generation", done: true,  active: false },
  { label: "Writing article",     done: true,  active: false },
  { label: "Saving article",      done: true,  active: false },
  { label: "Generating images",   done: false, active: false },
  { label: "Done",                done: false, active: false },
];

export default function GeneratePage() {
  const router = useRouter();
  const [topic, setTopic]           = useState<any>(null);
  const [phase, setPhase]           = useState<Phase>("idle");

  const [duplicates, setDuplicates] = useState<DuplicateArticle[]>([]);
  const [brief, setBrief]           = useState("");

  const [stages, setStages]         = useState<Stage[]>(STAGES_WRITING);
  const [articleText, setArticleText] = useState("");
  const [articleId, setArticleId]   = useState<string | null>(null);

  const [imagePrompts, setImagePrompts] = useState<ImagePrompt[]>([]);
  const [images, setImages]         = useState<{ url: string; placeholder: string }[]>([]);
  const [imageProgress, setImageProgress] = useState({ done: 0, total: 0 });
  const [error, setError]           = useState("");
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = sessionStorage.getItem("activeTopic");
    if (!t) { router.push("/ideas"); return; }
    const parsed = JSON.parse(t);
    setTopic(parsed);
    if (parsed.focus_keyword) {
      fetch(`${API_BASE}/api/articles/similar?keyword=${encodeURIComponent(parsed.focus_keyword)}`)
        .then(r => r.json())
        .then(d => setDuplicates(d.similar || []))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (textRef.current) textRef.current.scrollTop = textRef.current.scrollHeight;
  }, [articleText]);

  function markStage(idx: number) {
    setStages(prev => prev.map((s, i) => ({
      ...s,
      active: i === idx,
      done:   i < idx ? true : s.done,
    })));
  }

  async function requestBrief() {
    if (!topic) return;
    setPhase("briefing");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/generate/brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline:           topic.headline,
          focus_keyword:      topic.focus_keyword,
          secondary_keywords: topic.secondary_keywords || [],
          content_format:     topic.content_format,
          kolet_angle:        topic.kolet_angle,
          target_zone:        topic.target_zone,
          lang:               topic.lang,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Brief generation failed");
      }
      const data = await res.json();
      setBrief(data.brief || "");
      setPhase("brief");
    } catch (e: any) {
      setError(e.message);
      setPhase("idle");
    }
  }

  async function startGeneration(withBrief?: string) {
    if (!topic) return;
    setPhase("writing");
    setStages(STAGES_WRITING.map((s, i) => ({ ...s, active: i === 0 })));
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic_id:           topic.id,
          headline:           topic.headline,
          focus_keyword:      topic.focus_keyword,
          secondary_keywords: topic.secondary_keywords || [],
          content_format:     topic.content_format,
          kolet_angle:        topic.kolet_angle,
          word_count:         topic.word_count,
          target_zone:        topic.target_zone,
          lang:               topic.lang,
          brief:              withBrief ?? brief,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Generation failed");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "status") {
              const msg = event.message.toLowerCase();
              if (msg.includes("writing")) markStage(1);
              if (msg.includes("saving"))  markStage(2);
            }
            if (event.type === "chunk") {
              setArticleText(prev => prev + event.text);
            }
            if (event.type === "error") {
              setError(event.message);
            }
            if (event.type === "done") {
              setArticleId(event.article_id);
              setStages(prev => prev.map(s => ({ ...s, active: false, done: true })));
              setImagePrompts(event.image_prompts || []);
              setPhase("review");
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function startImageGeneration() {
    if (!articleId) return;
    setPhase("generating");
    setStages(STAGES_IMAGES.map((s, i) => ({ ...s, active: i === 3 })));
    setImageProgress({ done: 0, total: imagePrompts.length });
    // Signal library page to poll for images
    sessionStorage.setItem(`generating-images-${articleId}`, "true");

    try {
      const res = await fetch(`${API_BASE}/api/articles/${articleId}/generate-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompts: imagePrompts }),
      });

      if (!res.ok || !res.body) throw new Error("Image generation failed");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let done_count = 0;

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "image") {
              done_count++;
              setImages(prev => [...prev, { url: event.url, placeholder: event.placeholder }]);
              setImageProgress(prev => ({ ...prev, done: done_count }));
            }
            if (event.type === "images_done") {
              setStages(STAGES_IMAGES.map(s => ({ ...s, active: false, done: true })));
              if (articleId) sessionStorage.removeItem(`generating-images-${articleId}`);
              setPhase("done");
            }
          } catch { /* skip */ }
        }
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  const displayText = cleanPreview(articleText);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Generating Article</h1>
        {topic && <p className="text-gray-500 text-sm">"{topic.headline}"</p>}
      </div>

      {/* ── Idle ── */}
      {phase === "idle" && topic && (
        <div className="max-w-xl mx-auto mt-12 space-y-4">

          {/* Duplicate warning */}
          {duplicates.length > 0 && (
            <div className="border border-stone-300 rounded-xl overflow-hidden bg-white shadow-sm">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-200">
                <AlertTriangle size={13} className="text-orange-400 shrink-0" />
                <p className="text-xs font-semibold text-orange-300">
                  {duplicates.length === 1 ? "1 similar article already exists" : `${duplicates.length} similar articles already exist`}
                </p>
              </div>
              <div className="divide-y divide-stone-200">
                {duplicates.slice(0, 5).map(d => (
                  <button
                    key={d.id}
                    onClick={() => router.push(`/library/${d.id}`)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-stone-100 transition-colors text-left group"
                  >
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono uppercase shrink-0 ${
                      d.match_type === "exact"
                        ? "bg-red-900/60 text-red-400"
                        : "bg-orange-900/40 text-orange-400"
                    }`}>
                      {d.match_type}
                    </span>
                    <span className="text-xs text-gray-500 shrink-0 w-6">{d.lang?.toUpperCase()}</span>
                    <span className="text-xs text-gray-600 truncate flex-1">{d.title || d.id}</span>
                    <span className="text-xs text-gray-400 group-hover:text-kolet-yellow shrink-0 transition-colors">↗</span>
                  </button>
                ))}
              </div>
              {duplicates.length > 5 && (
                <div className="px-4 py-2 border-t border-stone-200 text-xs text-gray-500">
                  +{duplicates.length - 5} more in library
                </div>
              )}
              <div className="px-4 py-2.5 border-t border-stone-200 text-xs text-gray-500">
                Proceed only if this article has a meaningfully different angle.
              </div>
            </div>
          )}

          {/* Topic card */}
          <div className="bg-white border border-stone-200 rounded-2xl p-8 space-y-5 shadow-sm">
            <div className="space-y-1">
              <div className="text-xs text-gray-500 uppercase tracking-wider font-medium">Ready to write</div>
              <h2 className="text-lg font-semibold text-gray-900 leading-snug">{topic.headline}</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs text-gray-500">
              <div><span className="text-gray-500">Keyword</span><br /><span className="text-gray-900">{topic.focus_keyword}</span></div>
              <div><span className="text-gray-500">Format</span><br /><span className="text-gray-900">{topic.content_format}</span></div>
              <div><span className="text-gray-500">Language</span><br /><span className="text-gray-900">{topic.lang?.toUpperCase()}</span></div>
              <div><span className="text-gray-500">Zone</span><br /><span className="text-gray-900">{topic.target_zone || "global"}</span></div>
            </div>
            <div className="space-y-2 pt-1">
              <button
                onClick={requestBrief}
                className="w-full bg-kolet-yellow hover:bg-kolet-yellow/85 text-kolet-black py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <BookOpen size={15} /> Generate Brief First
              </button>
              <button
                onClick={() => startGeneration("")}
                className="w-full bg-stone-100 hover:bg-stone-200 text-gray-600 hover:text-gray-900 py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
              >
                <Zap size={14} /> Skip Brief — Write Directly
              </button>
            </div>
            <button
              onClick={() => router.push("/ideas")}
              className="w-full text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              ← Back to ideas
            </button>
          </div>
          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-xl p-3 text-red-300 text-xs">{error}</div>
          )}
        </div>
      )}

      {/* ── Briefing (loading) ── */}
      {phase === "briefing" && (
        <div className="max-w-xl mx-auto mt-20 text-center space-y-4">
          <Loader size={28} className="text-kolet-yellow animate-spin mx-auto" />
          <p className="text-gray-600 font-medium">Generating content brief…</p>
          <p className="text-gray-500 text-sm">The AI is mapping out the article structure and angle.</p>
        </div>
      )}

      {/* ── Brief review ── */}
      {phase === "brief" && (
        <div className="max-w-2xl mx-auto mt-8 space-y-4">
          <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-stone-200 flex items-center gap-2">
              <BookOpen size={15} className="text-kolet-yellow" />
              <span className="text-sm font-semibold text-gray-900">Content Brief</span>
              <span className="ml-auto text-xs text-gray-500">Review and edit before writing</span>
            </div>
            <div className="p-6">
              <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                Edit sections, adjust the angle, or rewrite any part before generating the full article.
              </p>
              <textarea
                value={brief}
                onChange={e => setBrief(e.target.value)}
                rows={16}
                className="w-full bg-white border border-stone-300 rounded-xl px-4 py-3 text-sm text-gray-700 leading-relaxed font-mono resize-y focus:outline-none focus:border-kolet-yellow transition-colors"
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => startGeneration(brief)}
                  className="flex-1 bg-kolet-yellow hover:bg-kolet-yellow/85 text-kolet-black py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowRight size={15} /> Write Full Article
                </button>
                <button
                  onClick={() => setPhase("idle")}
                  className="px-4 py-3 bg-stone-100 hover:bg-stone-200 text-gray-500 rounded-xl text-sm transition-colors"
                >
                  Back
                </button>
              </div>
            </div>
          </div>
          {error && (
            <div className="bg-red-900/30 border border-red-800 rounded-xl p-3 text-red-300 text-xs">{error}</div>
          )}
        </div>
      )}

      {/* ── Writing / Review / Generating / Done ── */}
      {(phase === "writing" || phase === "review" || phase === "generating" || phase === "done") && (
        <div className="grid grid-cols-3 gap-6">

          {/* Left column */}
          <div className="col-span-1 space-y-4">
            <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wider">Progress</h3>
              <div className="space-y-3">
                {stages.map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      s.done   ? "bg-green-600"  :
                      s.active ? "bg-kolet-yellow"   : "bg-stone-200"
                    }`}>
                      {s.done   ? <CheckCircle size={12} className="text-white" /> :
                       s.active ? <Loader size={10} className="text-white animate-spin" /> :
                                  <span className="w-1.5 h-1.5 rounded-full bg-stone-400 block" />}
                    </div>
                    <span className={`text-sm ${s.done ? "text-gray-500" : s.active ? "text-gray-900" : "text-gray-400"}`}>
                      {s.label}
                      {s.label === "Generating images" && imageProgress.total > 0 && (
                        <span className="ml-1 text-gray-500">
                          ({imageProgress.done}/{imageProgress.total})
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Generated images */}
            {(phase === "generating" || phase === "done") && (
              <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wider flex items-center gap-1.5">
                  <ImageIcon size={12} /> Generated Images
                </h3>
                <div className="space-y-3">
                  {images.map((img, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-xs text-kolet-yellow font-mono truncate">{img.placeholder}</div>
                        <a
                          href={img.url}
                          download={`${img.placeholder}.jpg`}
                          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 px-2 py-0.5 rounded hover:bg-stone-100 transition-colors shrink-0 ml-2"
                        >
                          <Download size={10} /> Save
                        </a>
                      </div>
                      <img src={img.url} alt={img.placeholder}
                        className="w-full rounded-lg object-cover aspect-video" />
                    </div>
                  ))}
                  {phase === "generating" && images.length < imageProgress.total && (
                    <div className="h-20 rounded-lg bg-stone-100 animate-pulse flex items-center justify-center">
                      <Loader size={16} className="text-stone-400 animate-spin" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {phase === "generating" && articleId && (
              <button
                onClick={() => router.push(`/library/${articleId}`)}
                className="w-full bg-stone-100 hover:bg-stone-200 text-gray-600 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
              >
                <ArrowRight size={14} /> View in Library
                <span className="text-xs text-gray-400">(generation continues)</span>
              </button>
            )}

            {phase === "done" && articleId && (
              <button
                onClick={() => router.push(`/library/${articleId}`)}
                className="w-full bg-green-600 hover:bg-green-500 text-white py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle size={14} /> View Article
              </button>
            )}

            {error && (
              <div className="bg-red-900/30 border border-red-800 rounded-xl p-3 text-red-300 text-xs">{error}</div>
            )}
          </div>

          {/* Right column */}
          <div className="col-span-2 space-y-4">

            {/* Live article preview */}
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden flex flex-col shadow-sm">
              <div className="px-5 py-3 border-b border-stone-200 flex items-center gap-2">
                <FileText size={14} className="text-gray-500" />
                <span className="text-xs text-gray-500 font-medium">Live Article Preview</span>
                {phase === "writing" && articleText && (
                  <span className="ml-auto text-xs text-kolet-yellow animate-pulse">Writing…</span>
                )}
                {phase !== "writing" && (
                  <span className="ml-auto text-xs text-green-400">Complete</span>
                )}
              </div>
              <div
                ref={textRef}
                className="flex-1 overflow-y-auto p-5 font-mono text-xs text-gray-600 leading-relaxed whitespace-pre-wrap max-h-[480px]"
              >
                {displayText || (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader size={14} className="animate-spin" />
                    <span>Waiting for LLM…</span>
                  </div>
                )}
              </div>
            </div>

            {/* Image prompt review */}
            {phase === "review" && imagePrompts.length > 0 && (
              <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-stone-200 flex items-center gap-2">
                  <Edit2 size={14} className="text-yellow-400" />
                  <span className="text-sm font-semibold text-gray-900">Review Image Prompts</span>
                  <span className="ml-auto text-xs text-gray-500">{imagePrompts.length} image{imagePrompts.length !== 1 ? "s" : ""} detected</span>
                </div>
                <div className="p-5 space-y-4">
                  <p className="text-xs text-gray-500 leading-relaxed">
                    The AI has written a Higgsfield prompt for each image. Edit any prompt before generating.
                  </p>
                  {imagePrompts.map((item, i) => (
                    <div key={item.placeholder} className="space-y-1.5">
                      <div className="text-xs text-kolet-yellow font-mono">{item.placeholder}</div>
                      {item.description && (
                        <div className="text-xs text-gray-500 italic leading-relaxed">
                          Source: "{item.description}"
                        </div>
                      )}
                      <textarea
                        value={item.prompt}
                        onChange={e => setImagePrompts(prev => prev.map((p, j) =>
                          j === i ? { ...p, prompt: e.target.value } : p
                        ))}
                        rows={4}
                        className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs text-gray-900 leading-relaxed resize-y focus:outline-none focus:border-kolet-yellow transition-colors"
                      />
                    </div>
                  ))}
                  <button
                    onClick={startImageGeneration}
                    className="w-full bg-kolet-yellow hover:bg-kolet-yellow/85 text-kolet-black py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 mt-2"
                  >
                    <Send size={14} /> Approve &amp; Generate Images
                  </button>
                </div>
              </div>
            )}

            {phase === "review" && imagePrompts.length === 0 && (
              <div className="bg-white border border-stone-200 rounded-xl p-5 text-xs text-gray-500 shadow-sm">
                No image placeholders detected. Article saved to library.
                <button
                  onClick={() => articleId && router.push(`/library/${articleId}`)}
                  className="ml-2 text-kolet-yellow underline"
                >
                  View article →
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
