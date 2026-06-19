"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { API_BASE } from "@/lib/api";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Copy, Check, Image as ImageIcon, Link2, Loader, Wand2 } from "lucide-react";

// ── Parsing ───────────────────────────────────────────────────────────────────

const stripNbsp = (s: string) => s.replace(/&nbsp;/g, " ").replace(/  +/g, " ").trim();

/** Strip author block and "Articles liés" from content body. */
function cleanContent(c: string): string {
  const cutpoints = [
    /^## FAQ/m,
    /^---\s*\n## À propos de l'auteur/m,
    /^## À propos de l'auteur/m,
    /^## Articles liés/m,
  ];
  let end = c.length;
  for (const re of cutpoints) {
    const m = c.search(re);
    if (m !== -1 && m < end) end = m;
  }
  return c.slice(0, end).trimEnd();
}

function parseArticle(raw: string) {
  if (!raw) return { title: "", readTime: "", intro: "", keyTakeaways: "", content: "", seoTitle: "", seoDescription: "" };

  const line = (label: string) => {
    const m = raw.match(new RegExp(`${label}[^\\n]*:\\s*\\n([^\\n═]+)`));
    return m?.[1]?.trim() ?? "";
  };

  const block = (startRe: RegExp, endRe: RegExp) => {
    const si = raw.search(startRe);
    if (si === -1) return "";
    const after = raw.indexOf("\n", si) + 1;
    const rest  = raw.slice(after);
    const ei    = rest.search(endRe);
    return (ei === -1 ? rest : rest.slice(0, ei)).trim();
  };

  const rawContent = (() => {
    const ci = raw.indexOf("POST CONTENT");
    const si = raw.indexOf("SEO METADATA");
    if (ci === -1) return "";
    const slice = raw.slice(ci);
    const nl1   = slice.indexOf("\n") + 1;
    const nl2   = slice.indexOf("\n", nl1) + 1;
    const body  = raw.slice(ci + nl2, si !== -1 ? si : undefined);
    return body.replace(/^═+$/gm, "").trim();
  })();

  return {
    title:          stripNbsp(line("POST TITLE")),
    readTime:       stripNbsp(line("READ TIME")),
    intro:          stripNbsp(block(/INTRO\s*[\(（]/, /KEY TAKEAWAYS|COVER IMAGE|═{5}/)),
    keyTakeaways:   block(/KEY TAKEAWAYS/, /COVER IMAGE|═{5}/),
    content:        cleanContent(rawContent),
    seoTitle:       stripNbsp(line("SEO TITLE")),
    seoDescription: stripNbsp(line("SEO DESCRIPTION")),
  };
}

/** Find IMAGE_PLACEHOLDER_xxx and URL À CONFIRMER only in cleaned content. */
function findPlaceholders(content: string) {
  const images = [...new Set([...content.matchAll(/IMAGE_PLACEHOLDER_[\w-]+/gi)].map(m => m[0]))];
  const urls   = [...new Set([...content.matchAll(/\[URL [ÀA] CONFIRMER[^\]]*\]/gi)].map(m => m[0]))];
  return { images, urls };
}

const LANG_LABELS: Record<string, string> = {
  en: "English", fr: "French", de: "German", es: "Spanish", nl: "Dutch",
};

// ── Field component ───────────────────────────────────────────────────────────

function Field({
  label, initialValue, copiedKey, activeCopied, onCopy,
  type = "plain", rows = 4, onChange,
}: {
  label: string;
  initialValue: string;
  copiedKey: string;
  activeCopied: string | null;
  onCopy: (key: string, value: string) => void;
  type?: "plain" | "multiline" | "date";
  rows?: number;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const initialised = useRef(false);

  useEffect(() => {
    if (initialValue && !initialised.current) {
      setValue(initialValue);
      initialised.current = true;
      onChange?.(initialValue);
    }
  }, [initialValue]);

  const handleChange = (v: string) => { setValue(v); onChange?.(v); };

  const isCopied = activeCopied === copiedKey;
  const shared   = "w-full bg-transparent px-4 py-3 text-sm text-gray-800 focus:outline-none resize-y";

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-200">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
        <button
          onClick={() => onCopy(copiedKey, value)}
          className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border transition-colors ${
            isCopied
              ? "text-green-400 bg-green-900/40 border-green-800"
              : "text-gray-500 border-transparent hover:text-gray-900 hover:bg-stone-100"
          }`}
        >
          {isCopied ? <Check size={11} /> : <Copy size={11} />}
          {isCopied ? "Copied!" : "Copy"}
        </button>
      </div>

      {type === "date" ? (
        <input
          type="date"
          value={value}
          onChange={e => handleChange(e.target.value)}
          className="w-full bg-transparent px-4 py-3 text-sm text-gray-800 focus:outline-none"
        />
      ) : type === "multiline" ? (
        <textarea
          value={value}
          onChange={e => handleChange(e.target.value)}
          rows={rows}
          className={`${shared} font-mono leading-relaxed`}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => handleChange(e.target.value)}
          className={`${shared}`}
        />
      )}
    </div>
  );
}

// ── Editable content field with incremental URL injection ─────────────────────

function ContentField({
  initialValue, urlMap, copiedKey, activeCopied, onCopy,
}: {
  initialValue: string;
  urlMap: Record<string, string>;
  copiedKey: string;
  activeCopied: string | null;
  onCopy: (key: string, value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const prevUrlMap        = useRef<Record<string, string>>({});
  const initialised       = useRef(false);

  // Seed on first load
  useEffect(() => {
    if (initialValue && !initialised.current) {
      setValue(initialValue);
      initialised.current = true;
    }
  }, [initialValue]);

  // Incremental replacement: undo old URL → apply new URL, preserving manual edits
  useEffect(() => {
    setValue(prev => {
      let next = prev;
      for (const ph of Object.keys({ ...prevUrlMap.current, ...urlMap })) {
        const oldUrl = prevUrlMap.current[ph] ?? "";
        const newUrl = urlMap[ph] ?? "";
        if (oldUrl === newUrl) continue;
        if (oldUrl) next = next.split(oldUrl).join(ph);
        if (newUrl) next = next.split(ph).join(newUrl);
      }
      prevUrlMap.current = { ...urlMap };
      return next;
    });
  }, [urlMap]);

  const isCopied = activeCopied === copiedKey;

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-200">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Content</span>
        <button
          onClick={() => onCopy(copiedKey, value)}
          className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border transition-colors ${
            isCopied
              ? "text-green-400 bg-green-900/40 border-green-800"
              : "text-gray-500 border-transparent hover:text-gray-900 hover:bg-stone-100"
          }`}
        >
          {isCopied ? <Check size={11} /> : <Copy size={11} />}
          {isCopied ? "Copied!" : "Copy"}
        </button>
      </div>
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        rows={22}
        className="w-full bg-transparent px-4 py-3 text-sm text-gray-800 font-mono leading-relaxed resize-y focus:outline-none"
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ArticleDetailPage() {
  const router = useRouter();
  const { id } = useParams() as { id: string };

  const [rawContent, setRawContent]   = useState("");
  const [meta, setMeta]               = useState<any>(null);
  const [loading, setLoading]         = useState(true);
  const [urlMap, setUrlMap]           = useState<Record<string, string>>({});
  const [activeCopied, setCopied]     = useState<string | null>(null);
  const [serpTitle, setSerpTitle]     = useState("");
  const [serpDesc, setSerpDesc]       = useState("");
  const [imagesGenerating, setImagesGenerating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function applyImages(images: any) {
    if (!images) return;
    let map: Record<string, string> = {};
    if (typeof images === 'string') {
      try { map = JSON.parse(images); } catch { return; }
    } else if (typeof images === 'object' && !Array.isArray(images)) {
      map = images;
    }
    if (Object.keys(map).length > 0) setUrlMap(prev => ({ ...map, ...prev }));
  }

  useEffect(() => {
    const isGenerating = sessionStorage.getItem(`generating-images-${id}`) === 'true';
    setImagesGenerating(isGenerating);

    fetch(`${API_BASE}/api/articles/${id}`)
      .then(r => r.json())
      .then(d => {
        setRawContent(d.content || '');
        setMeta(d);
        setLoading(false);
        applyImages(d.images);

        // Poll every 5s if generation is in progress
        if (isGenerating && !hasImages(d.images)) {
          pollRef.current = setInterval(() => {
            fetch(`${API_BASE}/api/articles/${id}`)
              .then(r => r.json())
              .then(fresh => {
                if (hasImages(fresh.images)) {
                  applyImages(fresh.images);
                  setImagesGenerating(false);
                  sessionStorage.removeItem(`generating-images-${id}`);
                  if (pollRef.current) clearInterval(pollRef.current);
                }
              })
              .catch(() => {});
          }, 5000);
          // Stop polling after 3 minutes regardless
          setTimeout(() => {
            if (pollRef.current) clearInterval(pollRef.current);
            setImagesGenerating(false);
            sessionStorage.removeItem(`generating-images-${id}`);
          }, 180000);
        }
      })
      .catch(() => setLoading(false));

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [id]);

  function hasImages(images: any): boolean {
    if (!images) return false;
    if (typeof images === 'string') {
      try { return Object.keys(JSON.parse(images)).length > 0; } catch { return false; }
    }
    return typeof images === 'object' && !Array.isArray(images) && Object.keys(images).length > 0;
  }

  const sections     = useMemo(() => parseArticle(rawContent), [rawContent]);
  const placeholders = useMemo(() => findPlaceholders(sections.content), [sections.content]);

  const handleCopy = useCallback((key: string, value: string) => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleUrlChange = (ph: string, url: string) =>
    setUrlMap(prev => ({ ...prev, [ph]: url }));

  async function generateImages() {
    if (imagesGenerating || placeholders.images.length === 0) return;
    const prompts = placeholders.images.map(ph => ({
      placeholder: ph,
      description: ph.replace(/^IMAGE_PLACEHOLDER_/i, '').replace(/[_-]/g, ' '),
      prompt: '',
    }));
    setImagesGenerating(true);
    sessionStorage.setItem(`generating-images-${id}`, 'true');
    // Fire and forget — server continues even if we navigate away
    fetch(`${API_BASE}/api/articles/${id}/generate-images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompts }),
    }).then(async res => {
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'image') {
              setUrlMap(prev => ({ ...prev, [event.placeholder]: event.url }));
            }
            if (event.type === 'images_done') {
              setImagesGenerating(false);
              sessionStorage.removeItem(`generating-images-${id}`);
              if (pollRef.current) clearInterval(pollRef.current);
            }
          } catch {}
        }
      }
    }).catch(() => {});
    // Also start polling as fallback if user navigates away and comes back
    pollRef.current = setInterval(() => {
      fetch(`${API_BASE}/api/articles/${id}`)
        .then(r => r.json())
        .then(fresh => {
          if (hasImages(fresh.images)) {
            applyImages(fresh.images);
            setImagesGenerating(false);
            sessionStorage.removeItem(`generating-images-${id}`);
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }).catch(() => {});
    }, 5000);
    setTimeout(() => {
      if (pollRef.current) clearInterval(pollRef.current);
      setImagesGenerating(false);
      sessionStorage.removeItem(`generating-images-${id}`);
    }, 180000);
  }

  const today = new Date().toISOString().split("T")[0];
  const filledCount = Object.values(urlMap).filter(Boolean).length;
  const totalCount  = placeholders.images.length + placeholders.urls.length;

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-500 text-sm">Loading…</div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Back */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/library")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={14} /> Back to Library
        </button>
        {meta?.title && <>
          <span className="text-gray-400">·</span>
          <span className="text-sm text-gray-500 truncate max-w-lg">{meta.title}</span>
        </>}
      </div>

      {imagesGenerating && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-kolet-yellow/10 border border-kolet-yellow/30 rounded-xl text-sm text-gray-700">
          <Loader size={13} className="animate-spin text-kolet-yellow shrink-0" />
          Images are generating in the background — this page will update automatically when ready.
        </div>
      )}

      <div className="grid grid-cols-3 gap-6 items-start">

        {/* ── CMS fields ── */}
        <div className="col-span-2 space-y-4">

          <Field label="Title"          initialValue={sections.title}          copiedKey="title"    activeCopied={activeCopied} onCopy={handleCopy} type="plain" />
          <Field label="Publish Date"   initialValue={today}                   copiedKey="date"     activeCopied={activeCopied} onCopy={handleCopy} type="date" />
          <Field label="Language"       initialValue={LANG_LABELS[meta?.lang] ?? meta?.lang ?? ""} copiedKey="lang" activeCopied={activeCopied} onCopy={handleCopy} type="plain" />
          <Field label="Read Time"      initialValue={sections.readTime}       copiedKey="readTime" activeCopied={activeCopied} onCopy={handleCopy} type="plain" />
          <Field label="Intro"          initialValue={sections.intro}          copiedKey="intro"    activeCopied={activeCopied} onCopy={handleCopy} type="multiline" rows={4} />
          <Field label="Key Takeaways"  initialValue={sections.keyTakeaways}   copiedKey="kt"       activeCopied={activeCopied} onCopy={handleCopy} type="multiline" rows={5} />

          <ContentField
            initialValue={sections.content}
            urlMap={urlMap}
            copiedKey="content"
            activeCopied={activeCopied}
            onCopy={handleCopy}
          />

          <Field label="SEO Title"       initialValue={sections.seoTitle}       copiedKey="seoTitle" activeCopied={activeCopied} onCopy={handleCopy} type="plain"      onChange={setSerpTitle} />
          <Field label="SEO Description" initialValue={sections.seoDescription} copiedKey="seoDesc"  activeCopied={activeCopied} onCopy={handleCopy} type="multiline" rows={3} onChange={setSerpDesc} />

          {/* SERP Preview */}
          {(serpTitle || serpDesc) && (
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 border-b border-stone-200">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Google Preview</span>
              </div>
              <div className="p-4">
                {/* Google chrome bar mock */}
                <div className="bg-stone-100 rounded-lg p-3 mb-3 font-sans">
                  <div className="text-xs text-gray-500 mb-2">kolet.com › blog › {meta?.slug || "article"}</div>
                  <div className={`text-base font-medium leading-snug mb-1 ${
                    serpTitle.length > 60 ? "text-yellow-400" : "text-kolet-yellow"
                  }`}>
                    {serpTitle.length > 60 ? serpTitle.slice(0, 57) + "…" : serpTitle || "SEO Title"}
                  </div>
                  <div className={`text-sm leading-relaxed ${
                    serpDesc.length > 155 ? "text-yellow-300/80" : "text-gray-500"
                  }`}>
                    {serpDesc.length > 155 ? serpDesc.slice(0, 152) + "…" : serpDesc || "Meta description will appear here."}
                  </div>
                </div>
                {/* Character counts */}
                <div className="flex gap-4 text-xs">
                  <span className={serpTitle.length > 60 ? "text-yellow-400" : "text-gray-500"}>
                    Title: {serpTitle.length}/60 chars {serpTitle.length > 60 && "— too long"}
                  </span>
                  <span className={serpDesc.length > 155 ? "text-yellow-400" : "text-gray-500"}>
                    Description: {serpDesc.length}/155 chars {serpDesc.length > 155 && "— too long"}
                  </span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ── Placeholder manager ── */}
        <div className="col-span-1 sticky top-6 space-y-4">

          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Placeholder Manager</h2>
            <p className="text-xs text-gray-500 leading-relaxed">
              Paste URLs below — they auto-replace inside the Content field. Your manual edits are preserved.
            </p>
          </div>

          {placeholders.images.length > 0 && (
            <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <ImageIcon size={11} /> Images ({placeholders.images.length})
                </div>
                {filledCount < placeholders.images.length && (
                  <button
                    onClick={generateImages}
                    disabled={imagesGenerating}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-kolet-yellow hover:bg-kolet-yellow/85 disabled:opacity-50 text-kolet-black rounded-lg font-medium transition-colors"
                  >
                    {imagesGenerating
                      ? <><Loader size={10} className="animate-spin" /> Generating…</>
                      : <><Wand2 size={10} /> Generate with AI</>}
                  </button>
                )}
              </div>
              {placeholders.images.map(ph => (
                <div key={ph}>
                  <div className="text-xs text-kolet-yellow font-mono mb-1.5 truncate" title={ph}>{ph}</div>
                  <input
                    type="url"
                    placeholder="Paste image URL…"
                    value={urlMap[ph] ?? ""}
                    onChange={e => handleUrlChange(ph, e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:border-kolet-yellow transition-colors"
                  />
                  {urlMap[ph] && (
                    <div className="mt-1.5 rounded-md overflow-hidden border border-stone-300 bg-stone-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={urlMap[ph]} alt=""
                        className="w-full h-20 object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {placeholders.urls.length > 0 && (
            <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-4 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <Link2 size={11} /> URLs à confirmer ({placeholders.urls.length})
              </div>
              {placeholders.urls.map(ph => (
                <div key={ph}>
                  <div className="text-xs text-yellow-500 font-mono mb-1.5 break-all leading-relaxed">{ph}</div>
                  <input
                    type="url"
                    placeholder="Paste URL…"
                    value={urlMap[ph] ?? ""}
                    onChange={e => handleUrlChange(ph, e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:border-kolet-yellow transition-colors"
                  />
                </div>
              ))}
            </div>
          )}

          {totalCount === 0 && (
            <div className="bg-white border border-stone-200 rounded-xl p-4 text-xs text-gray-500 shadow-sm">
              No placeholders detected in this article.
            </div>
          )}

          {totalCount > 0 && (
            <div className={`text-xs font-medium ${filledCount === totalCount ? "text-green-400" : "text-gray-500"}`}>
              {filledCount}/{totalCount} placeholders filled
              {filledCount === totalCount && " ✓"}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
