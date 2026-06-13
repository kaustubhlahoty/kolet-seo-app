"use client";
import { useState, useEffect, useRef } from "react";
import { Zap, CheckCircle, Image as ImageIcon, FileText, Loader, Edit2, Send } from "lucide-react";
import { useRouter } from "next/navigation";

type Stage = { label: string; done: boolean; active: boolean };

type ImagePrompt = { placeholder: string; prompt: string };

/** Strip author block and articles liés from live preview. */
function cleanPreview(text: string): string {
  const cutpoints = [
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
  const [phase, setPhase]           = useState<"writing" | "review" | "generating" | "done">("writing");

  const [stages, setStages]         = useState<Stage[]>(STAGES_WRITING);
  const [articleText, setArticleText] = useState("");
  const [articleId, setArticleId]   = useState<string | null>(null);

  // Image prompts (review phase)
  const [imagePrompts, setImagePrompts] = useState<ImagePrompt[]>([]);

  // Generated images
  const [images, setImages]         = useState<{ url: string; placeholder: string }[]>([]);
  const [imageProgress, setImageProgress] = useState({ done: 0, total: 0 });

  const [error, setError]           = useState("");
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = sessionStorage.getItem("activeTopic");
    if (!t) { router.push("/ideas"); return; }
    const parsed = JSON.parse(t);
    setTopic(parsed);
    startGeneration(parsed);
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

  async function startGeneration(t: any) {
    markStage(0);
    try {
      const res = await fetch("http://localhost:8000/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic_id:           t.id,
          headline:           t.headline,
          focus_keyword:      t.focus_keyword,
          secondary_keywords: t.secondary_keywords || [],
          content_format:     t.content_format,
          kolet_angle:        t.kolet_angle,
          word_count:         t.word_count,
          target_zone:        t.target_zone,
          lang:               t.lang,
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
              if (msg.includes("writing"))  markStage(1);
              if (msg.includes("saving"))   markStage(2);
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

    try {
      const res = await fetch(`http://localhost:8000/api/articles/${articleId}/generate-images`, {
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
              setImages(prev => [...prev, { url: `http://localhost:8000${event.url}`, placeholder: event.placeholder }]);
              setImageProgress(prev => ({ ...prev, done: done_count }));
            }
            if (event.type === "images_done") {
              setStages(STAGES_IMAGES.map(s => ({ ...s, active: false, done: true })));
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
        <h1 className="text-2xl font-bold text-white mb-1">Generating Article</h1>
        {topic && <p className="text-gray-400 text-sm">"{topic.headline}"</p>}
      </div>

      <div className="grid grid-cols-3 gap-6">

        {/* ── Left column ── */}
        <div className="col-span-1 space-y-4">

          {/* Progress stages */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wider">Progress</h3>
            <div className="space-y-3">
              {stages.map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    s.done   ? "bg-green-600"  :
                    s.active ? "bg-blue-600"   : "bg-gray-800"
                  }`}>
                    {s.done   ? <CheckCircle size={12} className="text-white" /> :
                     s.active ? <Loader size={10} className="text-white animate-spin" /> :
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-600 block" />}
                  </div>
                  <span className={`text-sm ${s.done ? "text-gray-400" : s.active ? "text-white" : "text-gray-600"}`}>
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

          {/* Images */}
          {(phase === "generating" || phase === "done") && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-gray-500 mb-4 uppercase tracking-wider flex items-center gap-1.5">
                <ImageIcon size={12} /> Generated Images
              </h3>
              <div className="space-y-3">
                {images.map((img, i) => (
                  <div key={i}>
                    <div className="text-xs text-blue-400 font-mono mb-1 truncate">{img.placeholder}</div>
                    <img src={img.url} alt={img.placeholder}
                      className="w-full rounded-lg object-cover aspect-video" />
                  </div>
                ))}
                {phase === "generating" && images.length < imageProgress.total && (
                  <div className="h-20 rounded-lg bg-gray-800 animate-pulse flex items-center justify-center">
                    <Loader size={16} className="text-gray-700 animate-spin" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Done CTA */}
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

        {/* ── Right column ── */}
        <div className="col-span-2 space-y-4">

          {/* Live article preview */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2">
              <FileText size={14} className="text-gray-500" />
              <span className="text-xs text-gray-500 font-medium">Live Article Preview</span>
              {phase === "writing" && articleText && (
                <span className="ml-auto text-xs text-blue-400 animate-pulse">Writing…</span>
              )}
              {phase !== "writing" && (
                <span className="ml-auto text-xs text-green-400">Complete</span>
              )}
            </div>
            <div
              ref={textRef}
              className="flex-1 overflow-y-auto p-5 font-mono text-xs text-gray-300 leading-relaxed whitespace-pre-wrap max-h-[480px]"
            >
              {displayText || (
                <div className="flex items-center gap-2 text-gray-600">
                  <Loader size={14} className="animate-spin" />
                  <span>Waiting for LLM…</span>
                </div>
              )}
            </div>
          </div>

          {/* Image prompt review panel */}
          {phase === "review" && imagePrompts.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2">
                <Edit2 size={14} className="text-yellow-400" />
                <span className="text-sm font-semibold text-white">Review Image Prompts</span>
                <span className="ml-auto text-xs text-gray-500">{imagePrompts.length} image{imagePrompts.length !== 1 ? "s" : ""} detected</span>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-xs text-gray-500 leading-relaxed">
                  These prompts will be used to generate images. Edit any prompt before approving.
                </p>
                {imagePrompts.map((item, i) => (
                  <div key={item.placeholder}>
                    <div className="text-xs text-blue-400 font-mono mb-1.5">{item.placeholder}</div>
                    <textarea
                      value={item.prompt}
                      onChange={e => setImagePrompts(prev => prev.map((p, j) =>
                        j === i ? { ...p, prompt: e.target.value } : p
                      ))}
                      rows={3}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white leading-relaxed resize-y focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                ))}
                <button
                  onClick={startImageGeneration}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 mt-2"
                >
                  <Send size={14} /> Approve &amp; Generate Images
                </button>
              </div>
            </div>
          )}

          {phase === "review" && imagePrompts.length === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-xs text-gray-500">
              No image placeholders detected in the article. Article saved to library.
              <button
                onClick={() => articleId && router.push(`/library/${articleId}`)}
                className="ml-2 text-blue-400 underline"
              >
                View article →
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
