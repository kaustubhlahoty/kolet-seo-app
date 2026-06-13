"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen, Search, ExternalLink, CheckCircle, AlertCircle,
  Clock, Loader, Globe, Eye, Trash2, FileText, X
} from "lucide-react";

type Article = {
  id: string;
  title: string;
  slug: string;
  lang: string;
  focus_keyword: string;
  target_zone: string;
  status: "draft" | "reviewed" | "needs_revision" | "published";
  seo_score: number | null;
  eeat_score: number | null;
  drive_url: string | null;
  created_at: string;
  published_at: string | null;
  images: string;
  content?: string;
};

type AuditResult = {
  seo_score: number;
  eeat_score: number;
  verdict: string;
  issues: string[];
  fixes: string[];
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft:          { label: "Draft",          color: "text-gray-400 bg-gray-800 border-gray-700",         icon: Clock },
  needs_revision: { label: "Needs Revision", color: "text-yellow-400 bg-yellow-900/30 border-yellow-800", icon: AlertCircle },
  reviewed:       { label: "Reviewed",       color: "text-blue-400 bg-blue-900/30 border-blue-800",       icon: CheckCircle },
  published:      { label: "Published",      color: "text-green-400 bg-green-900/30 border-green-800",    icon: CheckCircle },
};

const LANG_FLAGS: Record<string, string> = { en: "🇬🇧", fr: "🇫🇷", de: "🇩🇪", es: "🇪🇸", nl: "🇳🇱" };

function ScoreBadge({ score, label }: { score: number | null; label: string }) {
  if (score === null) return <span className="text-xs text-gray-600">—</span>;
  const color = score >= 70 ? "text-green-400" : score >= 50 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="text-center">
      <div className={`text-sm font-bold ${color}`}>{score}</div>
      <div className="text-xs text-gray-600">{label}</div>
    </div>
  );
}

function ArticleViewer({ article, onClose }: { article: Article; onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`http://localhost:8000/api/articles/${article.id}`)
      .then(r => r.json())
      .then(d => { setContent(d.content || "(no content)"); setLoading(false); })
      .catch(() => { setContent("Failed to load article content."); setLoading(false); });
  }, [article.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative ml-auto w-full max-w-4xl bg-gray-950 border-l border-gray-800 flex flex-col h-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-800 shrink-0">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm">{LANG_FLAGS[article.lang] || "🌐"}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_CONFIG[article.status]?.color}`}>
                {STATUS_CONFIG[article.status]?.label}
              </span>
            </div>
            <h2 className="text-white font-semibold text-base leading-tight truncate">{article.title || "Untitled"}</h2>
            <p className="text-xs text-gray-500 mt-0.5">🎯 {article.focus_keyword}</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-gray-500 hover:text-white p-1 rounded transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 py-8">
              <Loader size={16} className="animate-spin" /> Loading…
            </div>
          ) : (
            <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap leading-relaxed break-words">
              {content}
            </pre>
          )}
        </div>

        {/* Footer scores */}
        <div className="shrink-0 border-t border-gray-800 px-6 py-3 flex items-center gap-6 text-xs text-gray-500">
          {article.seo_score != null && <span>SEO <span className="text-white font-medium">{article.seo_score}</span>/100</span>}
          {article.eeat_score != null && <span>EEAT <span className="text-white font-medium">{article.eeat_score}</span>/100</span>}
          <span className="ml-auto">{new Date(article.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

export default function LibraryPage() {
  const router = useRouter();
  const [articles, setArticles]       = useState<Article[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [filterStatus, setFilter]     = useState("");
  const [filterLang, setLangFilter]   = useState("");
  const [auditing, setAuditing]       = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<{ id: string; data: AuditResult } | null>(null);
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [deleting, setDeleting]       = useState(false);

  const fetchArticles = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterLang)   params.set("lang",   filterLang);
      const res = await fetch(`http://localhost:8000/api/articles?${params}`);
      const data = await res.json();
      setArticles(data.articles);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filterStatus, filterLang]);

  useEffect(() => { fetchArticles(); }, [fetchArticles]);

  // Clear selection when filter changes
  useEffect(() => { setSelected(new Set()); }, [filterStatus, filterLang, search]);

  async function runAudit(id: string) {
    setAuditing(id);
    try {
      const res = await fetch(`http://localhost:8000/api/articles/${id}/audit`, { method: "POST" });
      const data = await res.json();
      setAuditResult({ id, data });
      fetchArticles();
    } catch { /* ignore */ }
    setAuditing(null);
  }

  async function publish(id: string) {
    await fetch(`http://localhost:8000/api/articles/${id}/publish`, { method: "POST" });
    fetchArticles();
  }

  async function deleteSelected() {
    if (!selected.size) return;
    setDeleting(true);
    try {
      await fetch("http://localhost:8000/api/articles/batch-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      setSelected(new Set());
      fetchArticles();
    } catch { /* ignore */ }
    setDeleting(false);
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(a => a.id)));
    }
  }

  const filtered = articles.filter(a => {
    const q = search.toLowerCase();
    return !q || a.title?.toLowerCase().includes(q) || a.focus_keyword?.toLowerCase().includes(q);
  });

  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  return (
    <>
      <div className="p-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Article Library</h1>
            <p className="text-gray-400 text-sm">{articles.length} article{articles.length !== 1 ? "s" : ""} total</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {selected.size > 0 && (
              <button
                onClick={deleteSelected}
                disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors text-xs font-medium"
              >
                {deleting ? <Loader size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete {selected.size} selected
              </button>
            )}
            {["", "draft", "reviewed", "published"].map(s => (
              <button key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-lg border transition-colors ${
                  filterStatus === s ? "bg-blue-600/20 border-blue-600 text-blue-400" : "border-gray-700 text-gray-500 hover:border-gray-600"
                }`}>
                {s === "" ? "All" : STATUS_CONFIG[s]?.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search + lang filter */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by title or keyword…"
              className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-8 pr-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <select
            value={filterLang}
            onChange={e => setLangFilter(e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
          >
            <option value="">All languages</option>
            <option value="en">🇬🇧 English</option>
            <option value="fr">🇫🇷 French</option>
            <option value="de">🇩🇪 German</option>
          </select>
        </div>

        {/* Select-all bar */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-3 mb-3 px-1">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
            />
            <span className="text-xs text-gray-500">
              {allSelected ? "Deselect all" : `Select all ${filtered.length}`}
            </span>
          </div>
        )}

        {/* Articles */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-600">
            <Loader className="animate-spin mr-2" size={18} /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-600">
            <BookOpen size={40} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">No articles yet. Start by researching keywords.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(article => {
              const cfg = STATUS_CONFIG[article.status] || STATUS_CONFIG.draft;
              const StatusIcon = cfg.icon;
              const imgList: string[] = (() => { try { return JSON.parse(article.images || "[]"); } catch { return []; } })();
              const isSelected = selected.has(article.id);

              return (
                <div
                  key={article.id}
                  className={`bg-gray-900 border rounded-xl p-5 transition-colors ${
                    isSelected ? "border-blue-600/60 bg-blue-950/20" : "border-gray-800 hover:border-gray-700"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Checkbox */}
                    <div className="flex items-center pt-1 shrink-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(article.id)}
                        className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
                      />
                    </div>

                    {/* Thumbnail */}
                    {imgList[0] ? (
                      <img src={`http://localhost:8000${imgList[0]}`} alt=""
                        className="w-24 h-16 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-24 h-16 rounded-lg bg-gray-800 shrink-0 flex items-center justify-center">
                        <Globe size={16} className="text-gray-700" />
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">{LANG_FLAGS[article.lang] || "🌐"}</span>
                        <h3 className="text-sm font-semibold text-white truncate">{article.title || "Untitled"}</h3>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${cfg.color}`}>
                          <StatusIcon size={10} /> {cfg.label}
                        </span>
                        <span className="text-xs text-gray-600">🎯 {article.focus_keyword}</span>
                        {article.target_zone && <span className="text-xs text-gray-600">📍 {article.target_zone}</span>}
                        <span className="text-xs text-gray-700">{new Date(article.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {/* Scores */}
                    <div className="flex items-center gap-4 shrink-0">
                      <ScoreBadge score={article.seo_score} label="SEO" />
                      <ScoreBadge score={article.eeat_score} label="EEAT" />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => router.push(`/library/${article.id}`)}
                        className="text-xs px-3 py-1.5 border border-gray-700 hover:border-purple-500 hover:text-purple-400 rounded-lg text-gray-400 transition-colors flex items-center gap-1"
                      >
                        <Eye size={10} /> View
                      </button>
                      {article.status !== "published" && (
                        <button
                          onClick={() => runAudit(article.id)}
                          disabled={auditing === article.id}
                          className="text-xs px-3 py-1.5 border border-gray-700 hover:border-blue-600 hover:text-blue-400 rounded-lg text-gray-400 transition-colors flex items-center gap-1"
                        >
                          {auditing === article.id ? <Loader size={10} className="animate-spin" /> : <FileText size={10} />}
                          Audit
                        </button>
                      )}
                      {(article.status === "reviewed" || article.status === "draft") && (
                        <button
                          onClick={() => publish(article.id)}
                          className="text-xs px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded-lg text-white transition-colors"
                        >
                          Publish
                        </button>
                      )}
                      {article.drive_url && (
                        <a href={article.drive_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs px-3 py-1.5 border border-gray-700 hover:border-gray-600 rounded-lg text-gray-400 transition-colors flex items-center gap-1">
                          <ExternalLink size={10} /> Drive
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Audit result panel */}
                  {auditResult?.id === article.id && (
                    <div className="mt-4 pt-4 border-t border-gray-800">
                      <div className="flex items-center gap-4 mb-2">
                        <span className={`text-sm font-medium ${auditResult.data.verdict === "PASS" ? "text-green-400" : "text-yellow-400"}`}>
                          {auditResult.data.verdict === "PASS" ? "✓ Passed" : "⚠ Needs Revision"}
                        </span>
                        <span className="text-xs text-gray-500">SEO: {auditResult.data.seo_score}/100</span>
                        <span className="text-xs text-gray-500">EEAT: {auditResult.data.eeat_score}/100</span>
                      </div>
                      {auditResult.data.fixes.length > 0 && (
                        <ul className="space-y-1">
                          {auditResult.data.fixes.map((fix, i) => (
                            <li key={i} className="text-xs text-gray-400">→ {fix}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
