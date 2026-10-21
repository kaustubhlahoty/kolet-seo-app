"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { API_BASE } from "@/lib/api";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Copy, Check, Image as ImageIcon, Link2, Loader, Wand2, Download, Sparkles, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, MessageSquare, CheckCheck, Send, Pencil, Trash2, X, GitPullRequest, GitMerge, History } from "lucide-react";
import { diffWords } from "@/lib/diff";
import { placeholdersPreserved } from "@/lib/image-placeholders";
import type { Comment } from "@/lib/types";
import { MarkdownPreview, findRawSpan } from "@/lib/markdown-preview";

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
  initialValue, urlMap, copiedKey, activeCopied, onCopy, onChange,
}: {
  initialValue: string;
  urlMap: Record<string, string>;
  copiedKey: string;
  activeCopied: string | null;
  onCopy: (key: string, value: string) => void;
  onChange?: (value: string) => void;
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
        onChange={e => { setValue(e.target.value); onChange?.(e.target.value); }}
        rows={22}
        className="w-full bg-transparent px-4 py-3 text-sm text-gray-800 font-mono leading-relaxed resize-y focus:outline-none"
      />
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Suggestion = {
  id: string;
  article_id: string;
  source: "direct_edit" | "ai_rewrite";
  original_text: string;
  proposed_text: string;
  author: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};

type Revision = {
  id: string;
  article_id: string;
  content: string;
  source: string | null;
  author: string | null;
  created_at: string;
};

const REVISION_SOURCE_LABELS: Record<string, string> = {
  save: "Manual save",
  rewrite: "AI rewrite (audit fixes)",
  apply_review: "Applied review fixes",
  ai_edit: "AI edit (free-text prompt)",
  suggestion_merge: "Suggestion merged",
  fix_image_format: "Image format fix (admin tool)",
  pre_restore: "Snapshot before a restore",
};

/** GitHub-style split diff: removed words in red on the left, added words in green on the right. */
function SideBySideDiff({ original, proposed }: { original: string; proposed: string }) {
  const ops = diffWords(original, proposed);
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="text-xs leading-relaxed whitespace-pre-wrap bg-red-50/60 border border-red-100 rounded-lg p-3">
        {ops.filter(op => op.type !== 'added').map((op, i) =>
          op.type === 'removed'
            ? <span key={i} className="bg-red-100 text-red-700 line-through">{op.value}</span>
            : <span key={i}>{op.value}</span>
        )}
      </div>
      <div className="text-xs leading-relaxed whitespace-pre-wrap bg-green-50/60 border border-green-100 rounded-lg p-3">
        {ops.filter(op => op.type !== 'removed').map((op, i) =>
          op.type === 'added'
            ? <span key={i} className="bg-green-100 text-green-800">{op.value}</span>
            : <span key={i}>{op.value}</span>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ArticleDetailPage() {
  const router = useRouter();
  const { id } = useParams() as { id: string };
  const { data: session, status: sessionStatus } = useSession();
  const isAdmin = (session?.user as any)?.role === "admin";

  const [suggestions, setSuggestions]   = useState<Suggestion[]>([]);
  const [suggestionActioning, setSuggestionActioning] = useState<string | null>(null);
  const [suggestionError, setSuggestionError] = useState("");
  const [reviewActioning, setReviewActioning] = useState(false);
  const [reviewActionError, setReviewActionError] = useState('');

  const [showHistory, setShowHistory] = useState(false);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [expandedRevisionId, setExpandedRevisionId] = useState<string | null>(null);

  const [rawContent, setRawContent]   = useState("");
  const [meta, setMeta]               = useState<any>(null);
  const [loading, setLoading]         = useState(true);
  const [urlMap, setUrlMap]           = useState<Record<string, string>>({});
  const [activeCopied, setCopied]     = useState<string | null>(null);
  const [serpTitle, setSerpTitle]     = useState("");
  const [serpDesc, setSerpDesc]       = useState("");
  const [imagesGenerating, setImagesGenerating] = useState(false);
  const [generatingSingle, setGeneratingSingle] = useState<Record<string, boolean>>({});
  const [errorSingle, setErrorSingle] = useState<Record<string, string>>({});
  const [needsAsset, setNeedsAsset] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | null>(null);
  const [review, setReview]             = useState<any>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError]   = useState('');
  const [applyingFixes, setApplyingFixes] = useState(false);
  const [applyError, setApplyError]     = useState('');
  const [contentKey, setContentKey]     = useState(0);
  const [seoFieldsKey, setSeoFieldsKey] = useState(0);
  const [selectedTitle, setSelectedTitle] = useState('');
  const [selectedMeta, setSelectedMeta]   = useState('');
  const [applyingCtr, setApplyingCtr]     = useState(false);
  const [editPrompt, setEditPrompt]     = useState('');
  const [editing, setEditing]           = useState(false);
  const [editError, setEditError]       = useState('');
  const [editSuccess, setEditSuccess]   = useState(false);
  // Comments
  const [comments, setComments]         = useState<Comment[]>([]);
  const [commentAuthor, setCommentAuthor] = useState('');
  const [commentBody, setCommentBody]   = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentsPanelOpen, setCommentsPanelOpen] = useState(true);
  const [showResolvedSuggestions, setShowResolvedSuggestions] = useState(false);
  // Replies
  const [replyingTo, setReplyingTo]     = useState<string | null>(null);
  const [replyBody, setReplyBody]       = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);
  // Inline comment thread popover (click-to-open, anchored on the highlight)
  const [activeThread, setActiveThread]     = useState<Comment | null>(null);
  const [activeThreadRect, setActiveThreadRect] = useState<DOMRect | null>(null);
  const activeThreadRef = useRef<HTMLDivElement>(null);
  // Review mode (inline highlighting)
  const [reviewMode, setReviewMode]     = useState(false);
  // Reviewers only ever see Review Mode — no CMS fields, no way to exit it.
  // Wait for the session to actually resolve so this doesn't fire during the loading state.
  useEffect(() => { if (sessionStatus === 'authenticated' && !isAdmin) setReviewMode(true); }, [sessionStatus, isAdmin]);
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingQuote, setPendingQuote] = useState('');
  const [showInlineForm, setShowInlineForm] = useState(false);
  const reviewRef = useRef<HTMLDivElement>(null);
  const inlineFormRef = useRef<HTMLDivElement>(null);
  // AI rewrite-selection
  const [showAiForm, setShowAiForm]     = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiLoading, setAiLoading]       = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiError, setAiError]           = useState('');
  const aiFormRef = useRef<HTMLDivElement>(null);
  // Manual suggest-edit-selection (type your own replacement, no AI, no full Edit-directly)
  const [showManualForm, setShowManualForm]   = useState(false);
  const [manualDraft, setManualDraft]         = useState('');
  const [manualError, setManualError]         = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const manualFormRef = useRef<HTMLDivElement>(null);
  // Content save state
  const [isDirty, setIsDirty]           = useState(false);
  const [isSaving, setIsSaving]         = useState(false);
  const [saveError, setSaveError]       = useState('');
  const [lastSavedAt, setLastSavedAt]   = useState('');
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstLoad   = useRef(true);
  // Refs for closure-safe access inside autosave callback
  const rawContentRef  = useRef('');
  const liveContentRef = useRef('');
  const liveTitleRef = useRef('');
  const liveReadTimeRef = useRef('');
  const liveIntroRef = useRef('');
  const liveKeyTakeawaysRef = useRef('');
  const serpTitleRef   = useRef('');
  const serpDescRef    = useRef('');
  const urlMapRef      = useRef<Record<string, string>>({});
  const sectionsRef    = useRef<ReturnType<typeof parseArticle>>({ title: '', readTime: '', intro: '', keyTakeaways: '', content: '', seoTitle: '', seoDescription: '' });

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

  // Fetch comments — auto-enable review mode if any open comment has a quoted passage
  useEffect(() => {
    fetch(`${API_BASE}/api/articles/${id}/comments`)
      .then(r => r.json())
      .then(d => {
        const fetched: Comment[] = d.comments || [];
        setComments(fetched);
        const hasHighlights = fetched.some(c => !c.resolved && !c.parent_id && c.quote?.trim());
        if (hasHighlights) setReviewMode(true);
      })
      .catch(() => {});
  }, [id]);

  const loadSuggestions = useCallback(() => {
    fetch(`${API_BASE}/api/articles/${id}/suggestions`)
      .then(r => r.json())
      .then(d => setSuggestions(d.suggestions || []))
      .catch(() => {});
  }, [id]);

  useEffect(() => { loadSuggestions(); }, [loadSuggestions]);

  async function openHistory() {
    setShowHistory(true);
    setRevisionsLoading(true);
    setHistoryError('');
    try {
      const res = await fetch(`${API_BASE}/api/articles/${id}/revisions`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load history');
      setRevisions(data.revisions || []);
    } catch (e: any) {
      setHistoryError(e.message);
    } finally {
      setRevisionsLoading(false);
    }
  }

  async function restoreRevision(revisionId: string) {
    if (!window.confirm('Restore this version? The current content will be saved as a new revision first, so this can be undone.')) return;
    setRestoringId(revisionId);
    setHistoryError('');
    try {
      const res = await fetch(`${API_BASE}/api/articles/${id}/revisions/${revisionId}/restore`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Restore failed');
      setRawContent(data.content);
      setContentKey(k => k + 1);
      setShowHistory(false);
    } catch (e: any) {
      setHistoryError(e.message);
    } finally {
      setRestoringId(null);
    }
  }

  async function approveSuggestion(suggestionId: string) {
    setSuggestionActioning(suggestionId);
    setSuggestionError("");
    try {
      const res = await fetch(`${API_BASE}/api/articles/${id}/suggestions/${suggestionId}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approve failed");
      setRawContent(data.content);
      setContentKey(k => k + 1);
      loadSuggestions();
    } catch (e: any) {
      setSuggestionError(e.message);
    } finally {
      setSuggestionActioning(null);
    }
  }

  async function rejectSuggestion(suggestionId: string) {
    setSuggestionActioning(suggestionId);
    setSuggestionError("");
    try {
      const res = await fetch(`${API_BASE}/api/articles/${id}/suggestions/${suggestionId}/reject`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reject failed");
      loadSuggestions();
    } catch (e: any) {
      setSuggestionError(e.message);
    } finally {
      setSuggestionActioning(null);
    }
  }

  // ── Reviewer's finish-review action — label/behaviour depends on whether they flagged anything ──
  async function approveForPublish() {
    setReviewActioning(true);
    setReviewActionError('');
    try {
      const res = await fetch(`${API_BASE}/api/articles/${id}/approve`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to approve');
      router.push('/library');
    } catch (e: any) {
      setReviewActionError(e.message);
    } finally {
      setReviewActioning(false);
    }
  }

  // Comments and suggestions are already persisted the moment they're created — there's
  // nothing further to submit over the network. This just closes out the review session.
  function submitChanges() {
    router.push('/library');
  }

  // In review mode, clear the floating button when the user's selection collapses
  useEffect(() => {
    if (!reviewMode) return;
    function onGlobalMouseUp() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        if (!showInlineForm && !showAiForm && !showManualForm) setSelectionPos(null);
      }
    }
    document.addEventListener('mouseup', onGlobalMouseUp);
    return () => document.removeEventListener('mouseup', onGlobalMouseUp);
  }, [reviewMode, showInlineForm, showAiForm, showManualForm]);

  // Dismiss the floating inline form when clicking outside it
  useEffect(() => {
    if (!showInlineForm && !showAiForm && !showManualForm) return;
    function onMouseDown(e: MouseEvent) {
      if (showInlineForm && inlineFormRef.current && !inlineFormRef.current.contains(e.target as Node)) {
        dismissInlineComment();
      }
      if (showAiForm && aiFormRef.current && !aiFormRef.current.contains(e.target as Node)) {
        dismissAiForm();
      }
      if (showManualForm && manualFormRef.current && !manualFormRef.current.contains(e.target as Node)) {
        dismissManualForm();
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [showInlineForm, showAiForm, showManualForm]);

  // Dismiss the inline comment-thread popover when clicking outside it
  useEffect(() => {
    if (!activeThread) return;
    function onMouseDown(e: MouseEvent) {
      if (activeThreadRef.current && !activeThreadRef.current.contains(e.target as Node)) {
        closeActiveThread();
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [activeThread]);

  function openThread(c: Comment, rect: DOMRect) {
    setActiveThread(c);
    setActiveThreadRect(rect);
  }

  function closeActiveThread() {
    setActiveThread(null);
    setActiveThreadRect(null);
    setReplyingTo(null);
    setReplyBody('');
  }

  async function submitComment(quote = '') {
    if (!commentBody.trim()) return;
    setCommentSubmitting(true);
    const res = await fetch(`${API_BASE}/api/articles/${id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: commentAuthor, body: commentBody, quote }),
    });
    const d = await res.json();
    if (d.comment) { setComments(prev => [...prev, d.comment]); setCommentBody(''); }
    setCommentSubmitting(false);
  }

  async function resolveComment(commentId: string, resolved: boolean) {
    const res = await fetch(`${API_BASE}/api/articles/${id}/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved }),
    });
    const d = await res.json();
    if (d.comment) setComments(prev => prev.map(c => c.id === commentId ? d.comment : c));
  }

  async function deleteComment(commentId: string, cascadeIds: string[] = []) {
    if (!window.confirm(cascadeIds.length ? 'Delete this comment and its replies?' : 'Delete this comment?')) return;
    const ids = [commentId, ...cascadeIds];
    await Promise.all(ids.map(cid =>
      fetch(`${API_BASE}/api/articles/${id}/comments/${cid}`, { method: 'DELETE' }).catch(() => {})
    ));
    setComments(prev => prev.filter(c => !ids.includes(c.id)));
    if (activeThread && ids.includes(activeThread.id)) closeActiveThread();
  }

  async function submitReply(parentId: string) {
    if (!replyBody.trim()) return;
    setReplySubmitting(true);
    const res = await fetch(`${API_BASE}/api/articles/${id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author: commentAuthor, body: replyBody, parent_id: parentId }),
    });
    const d = await res.json();
    if (d.comment) {
      setComments(prev => [...prev, d.comment]);
      setReplyBody('');
      setReplyingTo(null);
    }
    setReplySubmitting(false);
  }

  function handleReviewMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setSelectionPos({ x: rect.left + rect.width / 2, y: rect.top });
    setShowInlineForm(false);
    setShowAiForm(false);
    setShowManualForm(false);
  }

  function openInlineForm() {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    setPendingQuote(text);
    setShowInlineForm(true);
  }

  function dismissInlineComment() {
    setSelectionPos(null);
    setShowInlineForm(false);
    setPendingQuote('');
    setCommentBody('');
  }

  async function submitInlineComment() {
    await submitComment(pendingQuote);
    dismissInlineComment();
  }

  function openAiForm() {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    setPendingQuote(text);
    setAiInstruction('');
    setAiSuggestion(null);
    setAiError('');
    setShowAiForm(true);
  }

  function dismissAiForm() {
    setSelectionPos(null);
    setShowAiForm(false);
    setPendingQuote('');
    setAiInstruction('');
    setAiSuggestion(null);
    setAiError('');
  }

  function openManualForm() {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    setPendingQuote(text);
    setManualDraft(text);
    setManualError('');
    setShowManualForm(true);
  }

  function dismissManualForm() {
    setSelectionPos(null);
    setShowManualForm(false);
    setPendingQuote('');
    setManualDraft('');
    setManualError('');
  }

  /**
   * The single gate every content-changing action goes through: admins write straight
   * to the article, everyone else submits a suggestion for an admin to merge/reject.
   * Never lets an edit silently drop an IMAGE_PLACEHOLDER token either way.
   */
  async function proposeChange(
    original: string,
    proposed: string,
    source: 'direct_edit' | 'ai_rewrite' = 'direct_edit'
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    // `original` was captured from the rendered preview (decoded entities, stripped
    // markdown markers) — resolve it back to the exact raw substring before touching content.
    const rawOriginal = findRawSpan(rawContentRef.current, original) ?? original;

    if (!rawOriginal || !proposed.trim() || rawOriginal === proposed) {
      return { ok: false, error: 'No change to apply' };
    }
    if (!rawContentRef.current.includes(rawOriginal)) {
      return { ok: false, error: 'Could not locate that text in the article — it may have changed. Try selecting again.' };
    }
    const placeholderCheck = placeholdersPreserved(rawOriginal, proposed);
    if (!placeholderCheck.ok) {
      return { ok: false, error: `This would remove an image reference (${placeholderCheck.missing.join(', ')}).` };
    }
    if (isAdmin) {
      const updated = rawContentRef.current.replace(rawOriginal, proposed);
      rawContentRef.current = updated;
      setRawContent(updated);
      setContentKey(k => k + 1);
      try {
        await fetch(`${API_BASE}/api/articles/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: updated }),
        });
      } catch {}
      return { ok: true };
    }
    try {
      const res = await fetch(`${API_BASE}/api/articles/${id}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original_text: rawOriginal, proposed_text: proposed, source }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || 'Failed to submit' };
      loadSuggestions();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message || 'Failed to submit' };
    }
  }

  async function submitManualEdit() {
    if (!pendingQuote || !manualDraft.trim() || manualDraft === pendingQuote) return;
    setManualSubmitting(true);
    const result = await proposeChange(pendingQuote, manualDraft, 'direct_edit');
    setManualSubmitting(false);
    if (!result.ok) { setManualError(result.error); return; }
    dismissManualForm();
  }

  async function requestAiRewrite() {
    if (!pendingQuote) return;
    setAiLoading(true); setAiError(''); setAiSuggestion(null);
    try {
      const res = await fetch(`${API_BASE}/api/articles/${id}/edit-selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selection: pendingQuote, instruction: aiInstruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rewrite failed');
      setAiSuggestion(data.replacement);
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  }

  async function acceptAiRewrite() {
    if (!aiSuggestion || !pendingQuote) return;
    const result = await proposeChange(pendingQuote, aiSuggestion, 'ai_rewrite');
    if (!result.ok) { setAiError(result.error); return; }
    dismissAiForm();
  }

  async function submitBlockEdit(original: string, proposed: string): Promise<{ ok: boolean; error?: string }> {
    return proposeChange(original, proposed, 'direct_edit');
  }

  // Auto-save urlMap to DB whenever it changes (skip the initial populate from DB)
  useEffect(() => {
    if (isFirstLoad.current) { isFirstLoad.current = false; return; }
    if (Object.keys(urlMap).length === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus('saving');
    saveTimer.current = setTimeout(() => {
      fetch(`${API_BASE}/api/articles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: urlMap }),
      }).then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus(null));
    }, 1000);
  }, [urlMap]);

  function hasImages(images: any): boolean {
    if (!images) return false;
    if (typeof images === 'string') {
      try { return Object.keys(JSON.parse(images)).length > 0; } catch { return false; }
    }
    return typeof images === 'object' && !Array.isArray(images) && Object.keys(images).length > 0;
  }

  const sections     = useMemo(() => parseArticle(rawContent), [rawContent]);
  const placeholders = useMemo(() => findPlaceholders(sections.content), [sections.content]);

  // Keep refs in sync so autosave callback always reads latest values
  useEffect(() => { rawContentRef.current = rawContent; sectionsRef.current = sections; }, [rawContent, sections]);
  useEffect(() => { serpTitleRef.current = serpTitle; }, [serpTitle]);
  useEffect(() => { serpDescRef.current = serpDesc; }, [serpDesc]);
  useEffect(() => { urlMapRef.current = urlMap; }, [urlMap]);

  // Reset dirty tracking whenever content changes via a different mechanism (in-place
  // edit, suggestion merge, AI rewrite, etc). Also cancel any pending autosave and clear
  // every live*Ref — otherwise a late-firing timer, or a later unrelated save, would
  // re-splice this now-stale typed snapshot over the newer content.
  useEffect(() => {
    liveContentRef.current = '';
    liveTitleRef.current = '';
    liveReadTimeRef.current = '';
    liveIntroRef.current = '';
    liveKeyTakeawaysRef.current = '';
    setIsDirty(false);
    if (autoSaveRef.current) { clearTimeout(autoSaveRef.current); autoSaveRef.current = null; }
  }, [contentKey]);

  // ── Splice a new body into rawContent while preserving CMS header + SEO footer + FAQ tail ──
  function replaceContentBody(raw: string, newBody: string): string {
    const ci = raw.indexOf("POST CONTENT");
    const si = raw.indexOf("SEO METADATA");
    if (ci === -1) return raw;
    const slice = raw.slice(ci);
    const nl1 = slice.indexOf("\n") + 1;
    const nl2 = slice.indexOf("\n", nl1) + 1;
    const bodyStart = ci + nl2;
    const bodyEnd   = si !== -1 ? si : raw.length;

    // Preserve FAQ/author tail so AI-generated sections aren't lost
    const originalBody = raw.slice(bodyStart, bodyEnd);
    const tailPatterns = [/^## FAQ/m, /^---\s*\n## À propos de l'auteur/m, /^## À propos de l'auteur/m, /^## Articles liés/m];
    let tailStart = originalBody.length;
    for (const re of tailPatterns) {
      const m = originalBody.search(re);
      if (m !== -1 && m < tailStart) tailStart = m;
    }
    const tail = tailStart < originalBody.length ? '\n\n' + originalBody.slice(tailStart).trim() : '';

    return raw.slice(0, bodyStart) + newBody + tail + '\n\n' + raw.slice(bodyEnd);
  }

  // ── Save content to DB (reads from refs — safe inside setTimeout/useCallback) ──
  // Admins write straight through. Anyone else submits the diff as a suggestion —
  // the stored content never changes until an admin approves it in the panel below.
  const saveContent = useCallback(async () => {
    if (!rawContentRef.current) return;
    setIsSaving(true);
    setSaveError('');
    try {
      const before = rawContentRef.current;
      let updatedRaw = before;

      let liveBody = liveContentRef.current;
      if (liveBody) {
        // Restore placeholders — ContentField displays URLs in place of placeholders,
        // but rawContent must always store placeholder names (URLs live in the images column).
        for (const [ph, url] of Object.entries(urlMapRef.current)) {
          if (url) liveBody = liveBody.split(url).join(ph);
        }
        updatedRaw = replaceContentBody(updatedRaw, liveBody);
      }

      const title       = serpTitleRef.current;
      const desc        = serpDescRef.current;
      const postTitle    = liveTitleRef.current;
      const readTime     = liveReadTimeRef.current;
      const intro        = liveIntroRef.current;
      const keyTakeaways = liveKeyTakeawaysRef.current;
      if (title?.trim())          updatedRaw = replaceSeoLine(updatedRaw, 'SEO TITLE', title);
      if (desc?.trim())           updatedRaw = replaceSeoLine(updatedRaw, 'SEO DESCRIPTION', desc);
      if (postTitle?.trim())      updatedRaw = replaceSeoLine(updatedRaw, 'POST TITLE', postTitle);
      if (readTime?.trim())       updatedRaw = replaceSeoLine(updatedRaw, 'READ TIME', readTime);
      if (intro?.trim())          updatedRaw = replaceBlockField(updatedRaw, /INTRO\s*[\(（]/, /KEY TAKEAWAYS|COVER IMAGE|═{5}/, intro);
      if (keyTakeaways?.trim())   updatedRaw = replaceBlockField(updatedRaw, /KEY TAKEAWAYS/, /COVER IMAGE|═{5}/, keyTakeaways);

      if (isAdmin) {
        // Always confirm for admins, even if nothing textually changed — a click on Save
        // should never appear to do nothing.
        await fetch(`${API_BASE}/api/articles/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: updatedRaw }),
        });
        rawContentRef.current = updatedRaw;
        setRawContent(updatedRaw);
      } else {
        if (updatedRaw === before) {
          setIsDirty(false);
          setSaveError('Nothing to submit — no changes detected.');
          return;
        }
        const result = await proposeChange(before, updatedRaw, 'direct_edit');
        if (!result.ok) { setSaveError(result.error); return; }
        // Pending admin approval — stored content is untouched until merged.
      }

      // Clear every live*Ref now that this exact snapshot has been persisted (or submitted) —
      // otherwise it could get blindly re-applied by a later, unrelated save call.
      liveContentRef.current = '';
      liveTitleRef.current = '';
      liveReadTimeRef.current = '';
      liveIntroRef.current = '';
      liveKeyTakeawaysRef.current = '';

      setIsDirty(false);
      setLastSavedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    } catch (e: any) {
      setSaveError(e.message || 'Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [id, isAdmin]);

  // ── Track content edits ── admins autosave on a debounce; everyone else must click
  // Save explicitly, since every autosave tick would otherwise open a new suggestion.
  function handleContentChange(value: string) {
    liveContentRef.current = value;
    setIsDirty(true);
    if (!isAdmin) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => saveContent(), 2000);
  }

  const handleCopy = useCallback((key: string, value: string) => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleUrlChange = (ph: string, url: string) =>
    setUrlMap(prev => ({ ...prev, [ph]: url }));

  // Extract description from markdown alt-text in content, or build a title-enriched fallback
  function descriptionForPlaceholder(ph: string): string {
    const mdMatch = rawContent.match(new RegExp(`!\\[([^\\]]+)\\]\\(${ph}\\)`, 'i'));
    if (mdMatch?.[1]) return mdMatch[1];
    const rawName = ph.replace(/^IMAGE_PLACEHOLDER_/i, '').replace(/[_-]/g, ' ');
    return meta?.title ? `${rawName} — ${meta.title}` : rawName;
  }

  async function generateSingleImage(ph: string) {
    if (generatingSingle[ph]) return;
    setGeneratingSingle(prev => ({ ...prev, [ph]: true }));
    setErrorSingle(prev => ({ ...prev, [ph]: '' }));
    const description = descriptionForPlaceholder(ph);
    try {
      const res = await fetch(`${API_BASE}/api/articles/${id}/generate-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompts: [{ placeholder: ph, description, prompt: '' }] }),
      });
      if (!res.body) {
        setErrorSingle(prev => ({ ...prev, [ph]: 'No response from server' }));
        setGeneratingSingle(prev => ({ ...prev, [ph]: false }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'image') setUrlMap(prev => ({ ...prev, [event.placeholder]: event.url }));
            if (event.type === 'error') setErrorSingle(prev => ({ ...prev, [ph]: event.message }));
            if (event.type === 'needs_asset') setNeedsAsset(prev => ({ ...prev, [event.placeholder]: event.message }));
          } catch {}
        }
      }
      if (buf.startsWith('data: ')) { try { const e = JSON.parse(buf.slice(6)); if (e.type === 'image') setUrlMap(prev => ({ ...prev, [e.placeholder]: e.url })); if (e.type === 'needs_asset') setNeedsAsset(prev => ({ ...prev, [e.placeholder]: e.message })); } catch {} }
    } catch (e: any) {
      setErrorSingle(prev => ({ ...prev, [ph]: e.message || 'Generation failed' }));
    }
    setGeneratingSingle(prev => ({ ...prev, [ph]: false }));
  }

  async function generateImages() {
    if (imagesGenerating || placeholders.images.length === 0) return;
    const prompts = placeholders.images.map(ph => ({
      placeholder: ph,
      description: descriptionForPlaceholder(ph),
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
      let imgBuf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        imgBuf += decoder.decode(value, { stream: true });
        const lines = imgBuf.split('\n'); imgBuf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'image') {
              setUrlMap(prev => ({ ...prev, [event.placeholder]: event.url }));
            }
            if (event.type === 'needs_asset') {
              setNeedsAsset(prev => ({ ...prev, [event.placeholder]: event.message }));
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

  async function applyEdit() {
    if (!editPrompt.trim()) return;
    setEditing(true); setEditError(''); setEditSuccess(false);
    try {
      const res = await fetch(`${API_BASE}/api/articles/${id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: editPrompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Edit failed');
      setRawContent(data.content);
      setContentKey(k => k + 1);
      setEditPrompt('');
      setEditSuccess(true);
      setTimeout(() => setEditSuccess(false), 3000);
    } catch (e: any) {
      setEditError(e.message);
    } finally {
      setEditing(false);
    }
  }

  function replaceSeoLine(content: string, field: string, newValue: string): string {
    return content.replace(
      new RegExp(`(${field}[^\\n]*:\\n)([^\\n═]+)`),
      `$1${newValue}`
    );
  }

  // Same start/end boundary logic as parseArticle's block() extractor, so a multi-line
  // field (Intro, Key Takeaways) gets spliced back into the exact span it was read from.
  function replaceBlockField(content: string, startRe: RegExp, endRe: RegExp, newValue: string): string {
    const si = content.search(startRe);
    if (si === -1) return content;
    const labelLineEnd = content.indexOf('\n', si) + 1;
    const rest = content.slice(labelLineEnd);
    const ei = rest.search(endRe);
    const blockEnd = ei === -1 ? content.length : labelLineEnd + ei;
    return content.slice(0, labelLineEnd) + newValue.trim() + '\n\n' + content.slice(blockEnd);
  }

  async function applyCtrVariants() {
    if (!selectedTitle && !selectedMeta) return;
    setApplyingCtr(true);
    try {
      let content = rawContent;
      if (selectedTitle) content = replaceSeoLine(content, 'SEO TITLE', selectedTitle);
      if (selectedMeta)  content = replaceSeoLine(content, 'SEO DESCRIPTION', selectedMeta);
      await fetch(`${API_BASE}/api/articles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      setRawContent(content);
      setSeoFieldsKey(k => k + 1);
      setSelectedTitle('');
      setSelectedMeta('');
    } catch {}
    finally { setApplyingCtr(false); }
  }

  async function runReview() {
    setReviewLoading(true); setReviewError(''); setReview(null);
    try {
      const res = await fetch(`${API_BASE}/api/articles/${id}/review`, { method: 'POST' });
      if (!res.ok) throw new Error('Review failed');
      setReview(await res.json());
    } catch (e: any) {
      setReviewError(e.message || 'Review failed');
    } finally {
      setReviewLoading(false);
    }
  }

  async function applyFixes(voiceOnly = false) {
    if (!review) return;
    setApplyingFixes(true); setApplyError('');
    try {
      const res = await fetch(`${API_BASE}/api/articles/${id}/apply-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice_rewrites: review.voice?.rewrites || [],
          fact_issues: voiceOnly ? [] : (review.facts?.flagged_claims || []),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Apply failed');
      if (data.content) {
        setRawContent(data.content);
        setContentKey(k => k + 1);
        setReview(null);
      }
    } catch (e: any) {
      setApplyError(e.message);
    } finally {
      setApplyingFixes(false);
    }
  }

  const today = new Date().toISOString().split("T")[0];
  const filledCount = Object.values(urlMap).filter(Boolean).length;
  const totalCount  = placeholders.images.length + placeholders.urls.length;

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-500 text-sm">Loading…</div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Back + Save bar */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/library")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={14} /> Back to Library
        </button>
        {meta?.title && <>
          <span className="text-gray-400">·</span>
          <span className="text-sm text-gray-500 truncate max-w-xs">{meta.title}</span>
        </>}

        <button
          onClick={isAdmin ? () => { setReviewMode(v => !v); dismissInlineComment(); } : undefined}
          disabled={!isAdmin}
          title={isAdmin ? undefined : 'Reviewers always work in Review Mode'}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
            reviewMode
              ? 'bg-orange-500/10 border-orange-400 text-orange-600'
              : 'border-stone-300 text-gray-500 hover:border-stone-400 hover:text-gray-700'
          } ${!isAdmin ? 'cursor-default' : ''}`}
        >
          <MessageSquare size={11} />
          {isAdmin ? (reviewMode ? 'Exit Review' : 'Review Mode') : 'Review Mode'}
        </button>
        {comments.filter(c => !c.resolved && !c.parent_id).length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500 text-white font-semibold">
            {comments.filter(c => !c.resolved && !c.parent_id).length} open
          </span>
        )}
        {suggestions.filter(s => s.status === 'pending').length > 0 && (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-kolet-yellow/20 text-kolet-black border border-kolet-yellow/40 font-semibold">
            <GitPullRequest size={10} /> {suggestions.filter(s => s.status === 'pending').length} pending
          </span>
        )}

        <div className="ml-auto flex items-center gap-2.5">
          {isAdmin ? (
            <>
              <button
                onClick={openHistory}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-stone-300 hover:border-stone-400 text-gray-500 hover:text-gray-700 text-xs font-semibold rounded-lg transition-colors"
              >
                <History size={11} /> History
              </button>
              {saveError && <span className="text-xs text-red-400">{saveError}</span>}
              {isSaving && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Loader size={11} className="animate-spin" /> Saving…
                </span>
              )}
              {!isSaving && lastSavedAt && !isDirty && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Check size={11} /> Saved {lastSavedAt}
                </span>
              )}
              {isDirty && !isSaving && (
                <span className="text-xs text-amber-500">Unsaved changes</span>
              )}
              <button
                onClick={saveContent}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-kolet-yellow hover:bg-kolet-yellow/85 disabled:opacity-40 text-kolet-black text-xs font-semibold rounded-lg transition-colors"
              >
                {isSaving ? <Loader size={11} className="animate-spin" /> : <Check size={11} />}
                Save
              </button>
            </>
          ) : (() => {
            const openCount = comments.filter(c => !c.resolved && !c.parent_id).length;
            const pendingCount = suggestions.filter(s => s.status === 'pending').length;
            const hasOpenWork = openCount > 0 || pendingCount > 0;
            const canAct = meta?.status === 'needs_proofreading' || meta?.status === 'needs_revision';
            if (!canAct) {
              return <span className="text-xs text-gray-400">No action needed right now</span>;
            }
            return (
              <>
                {reviewActionError && <span className="text-xs text-red-400">{reviewActionError}</span>}
                <button
                  onClick={hasOpenWork ? submitChanges : approveForPublish}
                  disabled={reviewActioning}
                  className={`flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-40 text-xs font-semibold rounded-lg transition-colors ${
                    hasOpenWork ? 'bg-sky-600 hover:bg-sky-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  }`}
                >
                  {reviewActioning ? <Loader size={11} className="animate-spin" /> : hasOpenWork ? <GitPullRequest size={11} /> : <Check size={11} />}
                  {hasOpenWork ? 'Submit changes' : 'Approve for Publish'}
                </button>
              </>
            );
          })()}
        </div>
      </div>

      {/* All open comments — includes ones whose quoted text no longer exists in the
          current content (e.g. edited since the comment was made) and so can't render
          as an inline highlight. Without this list those comments are unreachable. */}
      {(() => {
        const openTopLevel = comments.filter(c => !c.resolved && !c.parent_id);
        if (openTopLevel.length === 0) return null;
        const fullText = `${sections.intro}\n${sections.keyTakeaways}\n${sections.content}`;
        return (
          <div className="mb-4 bg-white border border-stone-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setCommentsPanelOpen(v => !v)}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-stone-50 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <MessageSquare size={12} />
                {openTopLevel.length} open comment{openTopLevel.length === 1 ? '' : 's'}
              </span>
              {commentsPanelOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {commentsPanelOpen && (
              <div className="divide-y divide-stone-100 border-t border-stone-100">
                {openTopLevel.map(c => {
                  const quote = c.quote?.trim();
                  const foundInText = !!quote && fullText.includes(quote);
                  return (
                    <button
                      key={c.id}
                      onClick={e => openThread(c, (e.currentTarget as HTMLElement).getBoundingClientRect())}
                      className="w-full text-left px-4 py-2.5 hover:bg-stone-50 transition-colors flex items-start gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-semibold text-gray-900">{c.author}</span>
                          <span className="text-xs text-gray-400">
                            {new Date(c.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                          </span>
                          {quote && !foundInText && (
                            <span className="flex items-center gap-1 text-xs text-amber-600" title="The text this comment was attached to has since changed, so it isn't highlighted above.">
                              <AlertTriangle size={10} /> not shown in text
                            </span>
                          )}
                        </div>
                        {quote && (
                          <p className="text-xs text-gray-400 italic truncate mb-0.5">&ldquo;{quote}&rdquo;</p>
                        )}
                        <p className="text-xs text-gray-600 truncate">{c.body}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {imagesGenerating && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-kolet-yellow/10 border border-kolet-yellow/30 rounded-xl text-sm text-gray-700">
          <Loader size={13} className="animate-spin text-kolet-yellow shrink-0" />
          Images are generating in the background — this page will update automatically when ready.
        </div>
      )}

      {/* Review Mode — readable prose with inline text selection */}
      {reviewMode && (() => {
        const openQuoted = comments.filter(c => !c.resolved && !c.parent_id);
        const pendingOriginals = suggestions.filter(s => s.status === 'pending').map(s => s.original_text);
        return (
          <div
            ref={reviewRef}
            onMouseUp={handleReviewMouseUp}
            className="mb-6 bg-white border-2 border-orange-200 rounded-xl p-8 shadow-sm cursor-text select-text"
          >
            <div className="flex items-center gap-2 mb-6 text-xs text-orange-600 font-semibold">
              <MessageSquare size={13} />
              Review mode — select text for Comment/Suggest edit/Ask AI, or hover any line for the ✏️ to edit it in place
            </div>
            {sections.title && (
              <h1 className="text-2xl font-bold text-gray-900 mb-5 leading-tight">{sections.title}</h1>
            )}
            {sections.intro && (
              <div className="text-gray-600 text-base leading-relaxed mb-6 border-l-4 border-kolet-yellow pl-4">
                <MarkdownPreview content={sections.intro} comments={openQuoted} onOpen={openThread} editable onSubmitEdit={submitBlockEdit} pendingOriginals={pendingOriginals} />
              </div>
            )}
            {sections.keyTakeaways && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Key Takeaways</p>
                <MarkdownPreview content={sections.keyTakeaways} comments={openQuoted} onOpen={openThread} editable onSubmitEdit={submitBlockEdit} pendingOriginals={pendingOriginals} />
              </div>
            )}
            <MarkdownPreview content={sections.content} comments={openQuoted} onOpen={openThread} editable onSubmitEdit={submitBlockEdit} pendingOriginals={pendingOriginals} />
          </div>
        );
      })()}

      {/* Inline comment thread popover — click a highlight to open; reply, resolve, or delete without scrolling down */}
      {activeThread && activeThreadRect && (() => {
        const above = activeThreadRect.top > 240;
        const threadReplies = comments.filter(r => r.parent_id === activeThread.id);
        const isReplying = replyingTo === activeThread.id;
        const FORM_W = 320;
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
        const safeLeft = Math.max(FORM_W / 2 + 12, Math.min(activeThreadRect.left + activeThreadRect.width / 2, vw - FORM_W / 2 - 12));
        return (
          <div
            ref={activeThreadRef}
            style={{
              position: 'fixed',
              left: safeLeft,
              top: above ? activeThreadRect.top - 10 : activeThreadRect.bottom + 10,
              transform: `translateX(-50%)${above ? ' translateY(-100%)' : ''}`,
              zIndex: 9999,
            }}
            className="w-80 max-h-[70vh] overflow-y-auto bg-white border border-stone-300 rounded-xl shadow-2xl p-4 space-y-3"
          >
            {/* Top-level comment */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-900">{activeThread.author}</span>
                <span className="text-xs text-gray-400">
                  {new Date(activeThread.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => { resolveComment(activeThread.id, true); closeActiveThread(); }}
                  title="Mark as resolved"
                  className="text-gray-400 hover:text-emerald-500 p-1 rounded-lg hover:bg-emerald-50 transition-colors"
                >
                  <CheckCheck size={13} />
                </button>
                <button
                  onClick={() => deleteComment(activeThread.id, threadReplies.map(r => r.id))}
                  title="Delete comment"
                  className="text-gray-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
                <button onClick={closeActiveThread} title="Close" className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-stone-100 transition-colors">
                  <X size={13} />
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{activeThread.body}</p>

            {/* Replies */}
            {threadReplies.map(r => (
              <div key={r.id} className="ml-3 pl-3 border-l-2 border-stone-200 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-gray-900">{r.author}</span>
                    <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                  </div>
                  <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{r.body}</p>
                </div>
                <button onClick={() => deleteComment(r.id)} title="Delete reply" className="shrink-0 text-gray-300 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-colors">
                  <Trash2 size={11} />
                </button>
              </div>
            ))}

            {/* Reply form */}
            {isReplying ? (
              <div className="space-y-2 pt-1 border-t border-stone-100">
                <input
                  value={commentAuthor}
                  onChange={e => setCommentAuthor(e.target.value)}
                  placeholder="Your name (optional)"
                  className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-kolet-yellow transition-colors"
                />
                <textarea
                  value={replyBody}
                  onChange={e => setReplyBody(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitReply(activeThread.id); }}
                  placeholder="Write a reply…"
                  rows={2}
                  autoFocus
                  className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-kolet-yellow transition-colors resize-none"
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => { setReplyingTo(null); setReplyBody(''); }}
                    className="text-xs text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-stone-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => submitReply(activeThread.id)}
                    disabled={replySubmitting || !replyBody.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-kolet-yellow hover:bg-kolet-yellow/85 text-kolet-black text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                  >
                    {replySubmitting ? <Loader size={11} className="animate-spin" /> : <Send size={11} />}
                    {replySubmitting ? 'Posting…' : 'Post Reply'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setReplyingTo(activeThread.id); setReplyBody(''); }}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-stone-100 transition-colors"
              >
                <Send size={11} /> Reply
              </button>
            )}
          </div>
        );
      })()}

      {/* Floating selection action buttons */}
      {selectionPos && !showInlineForm && !showAiForm && !showManualForm && (
        <div
          style={{ position: 'fixed', left: selectionPos.x, top: selectionPos.y - 40, transform: 'translateX(-50%)', zIndex: 9999 }}
          className="flex items-center gap-1.5"
        >
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={openInlineForm}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-700 text-white text-xs font-semibold rounded-full shadow-lg transition-colors whitespace-nowrap"
          >
            <MessageSquare size={11} /> Comment
          </button>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={openManualForm}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-full shadow-lg transition-colors whitespace-nowrap"
          >
            <Pencil size={11} /> Suggest edit
          </button>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={openAiForm}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-full shadow-lg transition-colors whitespace-nowrap"
          >
            <Sparkles size={11} /> Ask AI
          </button>
        </div>
      )}

      {/* Floating manual suggest-edit form */}
      {showManualForm && selectionPos && (() => {
        const FORM_W = 320;
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
        const safeLeft = Math.max(FORM_W / 2 + 12, Math.min(selectionPos.x, vw - FORM_W / 2 - 12));
        const safeTop  = Math.max(12, Math.min(selectionPos.y - 8, vh - 320));
        return (
          <div
            ref={manualFormRef}
            style={{ position: 'fixed', left: safeLeft, top: safeTop, transform: 'translateX(-50%)', zIndex: 9999 }}
            className="w-80 bg-white border border-stone-300 rounded-xl shadow-2xl p-4 space-y-3"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-600">
              <Pencil size={12} /> Suggest an edit
            </div>
            <p className="text-xs text-gray-400">Type your own replacement for the highlighted text below.</p>
            <textarea
              value={manualDraft}
              onChange={e => setManualDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitManualEdit(); }}
              rows={4}
              autoFocus
              className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-sky-400 transition-colors resize-none"
            />
            {manualError && <p className="text-xs text-red-500">{manualError}</p>}
            <div className="flex items-center justify-between gap-2">
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={dismissManualForm}
                className="text-xs text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-stone-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={submitManualEdit}
                disabled={manualSubmitting || !manualDraft.trim() || manualDraft === pendingQuote}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {manualSubmitting ? <Loader size={11} className="animate-spin" /> : isAdmin ? <Check size={11} /> : <GitPullRequest size={11} />}
                {manualSubmitting ? 'Submitting…' : isAdmin ? 'Apply' : 'Submit for approval'}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Floating AI rewrite-selection form */}
      {showAiForm && selectionPos && (() => {
        const FORM_W = 320;
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
        const safeLeft = Math.max(FORM_W / 2 + 12, Math.min(selectionPos.x, vw - FORM_W / 2 - 12));
        const safeTop  = Math.max(12, Math.min(selectionPos.y - 8, vh - 360));
        return (
          <div
            ref={aiFormRef}
            style={{ position: 'fixed', left: safeLeft, top: safeTop, transform: 'translateX(-50%)', zIndex: 9999 }}
            className="w-80 bg-white border border-stone-300 rounded-xl shadow-2xl p-4 space-y-3"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-600">
              <Sparkles size={12} /> Ask AI to rewrite
            </div>
            {pendingQuote && (
              <div className="text-xs text-gray-600 bg-stone-50 border-l-2 border-stone-300 px-3 py-2 rounded-r-md leading-relaxed italic break-words max-h-24 overflow-y-auto">
                &ldquo;{pendingQuote.length > 200 ? pendingQuote.slice(0, 197) + '…' : pendingQuote}&rdquo;
              </div>
            )}

            {!aiSuggestion && (
              <>
                <textarea
                  value={aiInstruction}
                  onChange={e => setAiInstruction(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) requestAiRewrite(); }}
                  placeholder="How should this change? (optional — leave blank to just polish it)"
                  rows={2}
                  autoFocus
                  className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-400 transition-colors resize-none"
                />
                {aiError && <p className="text-xs text-red-500">{aiError}</p>}
                <div className="flex items-center justify-between gap-2">
                  <button
                    onMouseDown={e => e.preventDefault()}
                    onClick={dismissAiForm}
                    className="text-xs text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-stone-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onMouseDown={e => e.preventDefault()}
                    onClick={requestAiRewrite}
                    disabled={aiLoading}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {aiLoading ? <Loader size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    {aiLoading ? 'Rewriting…' : 'Rewrite'}
                  </button>
                </div>
              </>
            )}

            {aiSuggestion && (
              <>
                <div className="text-xs text-gray-800 bg-emerald-50 border-l-2 border-emerald-400 px-3 py-2 rounded-r-md leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {aiSuggestion}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => setAiSuggestion(null)}
                    className="text-xs text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-stone-100 transition-colors"
                  >
                    Try again
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onMouseDown={e => e.preventDefault()}
                      onClick={dismissAiForm}
                      className="text-xs text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-stone-100 transition-colors"
                    >
                      Discard
                    </button>
                    <button
                      onMouseDown={e => e.preventDefault()}
                      onClick={acceptAiRewrite}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      {isAdmin ? <><Check size={11} /> Apply</> : <><GitPullRequest size={11} /> Submit for approval</>}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Floating inline comment form */}
      {showInlineForm && selectionPos && (() => {
        const FORM_W = 288; // w-72
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
        const safeLeft = Math.max(FORM_W / 2 + 12, Math.min(selectionPos.x, vw - FORM_W / 2 - 12));
        const safeTop  = Math.max(12, Math.min(selectionPos.y - 8, vh - 280));
        return (
        <div
          ref={inlineFormRef}
          style={{ position: 'fixed', left: safeLeft, top: safeTop, transform: 'translateX(-50%)', zIndex: 9999 }}
          className="w-72 bg-white border border-stone-300 rounded-xl shadow-2xl p-4 space-y-3"
        >
          {pendingQuote && (
            <div className="text-xs text-gray-600 bg-kolet-yellow/10 border-l-2 border-kolet-yellow px-3 py-2 rounded-r-md leading-relaxed italic break-words">
              &ldquo;{pendingQuote.length > 120 ? pendingQuote.slice(0, 117) + '…' : pendingQuote}&rdquo;
            </div>
          )}
          <input
            value={commentAuthor}
            onChange={e => setCommentAuthor(e.target.value)}
            placeholder="Your name (optional)"
            className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-kolet-yellow transition-colors"
          />
          <textarea
            value={commentBody}
            onChange={e => setCommentBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitInlineComment(); }}
            placeholder="Describe the change needed…"
            rows={3}
            autoFocus
            className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:border-kolet-yellow transition-colors resize-none"
          />
          <div className="flex items-center justify-between gap-2">
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={dismissInlineComment}
              className="text-xs text-gray-400 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-stone-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={submitInlineComment}
              disabled={commentSubmitting || !commentBody.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-kolet-yellow hover:bg-kolet-yellow/85 text-kolet-black text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
            >
              {commentSubmitting ? <Loader size={11} className="animate-spin" /> : <Send size={11} />}
              {commentSubmitting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
        );
      })()}

      {isAdmin && (
      <>
      <div className="grid grid-cols-3 gap-6 items-start">

        {/* ── CMS fields ── */}
        <div className="col-span-2 space-y-4">

          <Field label="Title"          initialValue={sections.title}          copiedKey="title"    activeCopied={activeCopied} onCopy={handleCopy} type="plain"
            onChange={v => { liveTitleRef.current = v; if (v !== sections.title) setIsDirty(true); }} />
          <Field label="Publish Date"   initialValue={today}                   copiedKey="date"     activeCopied={activeCopied} onCopy={handleCopy} type="date" />
          <Field label="Language"       initialValue={LANG_LABELS[meta?.lang] ?? meta?.lang ?? ""} copiedKey="lang" activeCopied={activeCopied} onCopy={handleCopy} type="plain" />
          <Field label="Read Time"      initialValue={sections.readTime}       copiedKey="readTime" activeCopied={activeCopied} onCopy={handleCopy} type="plain"
            onChange={v => { liveReadTimeRef.current = v; if (v !== sections.readTime) setIsDirty(true); }} />
          <Field label="Intro"          initialValue={sections.intro}          copiedKey="intro"    activeCopied={activeCopied} onCopy={handleCopy} type="multiline" rows={4}
            onChange={v => { liveIntroRef.current = v; if (v !== sections.intro) setIsDirty(true); }} />
          <Field label="Key Takeaways"  initialValue={sections.keyTakeaways}   copiedKey="kt"       activeCopied={activeCopied} onCopy={handleCopy} type="multiline" rows={5}
            onChange={v => { liveKeyTakeawaysRef.current = v; if (v !== sections.keyTakeaways) setIsDirty(true); }} />

          <ContentField
            key={contentKey}
            initialValue={sections.content}
            urlMap={urlMap}
            copiedKey="content"
            activeCopied={activeCopied}
            onCopy={handleCopy}
            onChange={handleContentChange}
          />

          <Field key={`seoTitle-${seoFieldsKey}`}  label="SEO Title"       initialValue={sections.seoTitle}       copiedKey="seoTitle" activeCopied={activeCopied} onCopy={handleCopy} type="plain"      onChange={v => { setSerpTitle(v); if (v !== sections.seoTitle) setIsDirty(true); }} />
          <Field key={`seoDesc-${seoFieldsKey}`}   label="SEO Description" initialValue={sections.seoDescription} copiedKey="seoDesc"  activeCopied={activeCopied} onCopy={handleCopy} type="multiline" rows={3} onChange={v => { setSerpDesc(v); if (v !== sections.seoDescription) setIsDirty(true); }} />

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
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-xs text-kolet-yellow font-mono truncate" title={ph}>{ph}</div>
                    {!urlMap[ph] && (
                      <button
                        onClick={() => generateSingleImage(ph)}
                        disabled={generatingSingle[ph] || imagesGenerating}
                        className="flex items-center gap-1 text-xs px-2 py-0.5 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-gray-600 rounded-md transition-colors shrink-0 ml-2"
                        title="Generate this image with AI"
                      >
                        {generatingSingle[ph]
                          ? <><Loader size={9} className="animate-spin" /> Generating…</>
                          : <><Wand2 size={9} /> Generate</>}
                      </button>
                    )}
                  </div>
                  <input
                    type="url"
                    placeholder="Paste image URL…"
                    value={urlMap[ph] ?? ""}
                    onChange={e => handleUrlChange(ph, e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs text-gray-900 placeholder-gray-500 focus:outline-none focus:border-kolet-yellow transition-colors"
                  />
                  {errorSingle[ph] && (
                    <div className="mt-1 text-xs text-red-400 leading-relaxed">{errorSingle[ph]}</div>
                  )}
                  {needsAsset[ph] && !urlMap[ph] && (
                    <div className="mt-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-amber-800 leading-relaxed">
                      <span className="font-semibold block mb-0.5">📸 Asset needed from you:</span>
                      {needsAsset[ph]}
                    </div>
                  )}
                  {urlMap[ph] && (
                    <div className="mt-1.5 rounded-md overflow-hidden border border-stone-300 bg-stone-100 relative group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={urlMap[ph]} alt=""
                        className="w-full h-20 object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <a
                        href={urlMap[ph]}
                        download={`${ph}.jpg`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs bg-black/60 hover:bg-black/80 text-white px-2 py-1 rounded-md"
                        onClick={e => e.stopPropagation()}
                      >
                        <Download size={10} /> Save
                      </a>
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
            <div className="flex items-center justify-between">
              <div className={`text-xs font-medium ${filledCount === totalCount ? "text-green-400" : "text-gray-500"}`}>
                {filledCount}/{totalCount} placeholders filled
                {filledCount === totalCount && " ✓"}
              </div>
              {saveStatus === 'saving' && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Loader size={10} className="animate-spin" /> Saving…
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-xs text-green-500 flex items-center gap-1">
                  <Check size={10} /> Saved
                </span>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Make changes with AI ── */}
      <div className="mt-6">
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-stone-200 flex items-center gap-3">
            <Wand2 size={16} className="text-kolet-yellow" />
            <h2 className="text-sm font-semibold text-gray-900">Make changes with AI</h2>
          </div>
          <div className="p-5">
            <textarea
              value={editPrompt}
              onChange={e => { setEditPrompt(e.target.value); setEditError(''); setEditSuccess(false); }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) applyEdit(); }}
              placeholder={`Describe the changes you want — e.g. "Make the intro more punchy and conversational", "Add a comparison table for eSIM plans in Japan", "Shorten the conclusion to 2 sentences", "Translate the tone to sound more casual for a French audience"…`}
              rows={3}
              className="w-full bg-stone-50 border border-stone-200 rounded-lg px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-kolet-yellow resize-y leading-relaxed"
            />
            <div className="flex items-center justify-between mt-3">
              <div className="text-xs text-gray-500">
                {editError && <span className="text-red-400">{editError}</span>}
                {editSuccess && <span className="text-emerald-500 flex items-center gap-1"><CheckCircle2 size={12} /> Changes applied successfully</span>}
                {!editError && !editSuccess && <span>⌘↵ to apply</span>}
              </div>
              <button
                onClick={applyEdit}
                disabled={editing || !editPrompt.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-kolet-yellow hover:bg-kolet-yellow/85 text-kolet-black text-sm font-semibold rounded-lg transition-colors disabled:opacity-40"
              >
                {editing
                  ? <><Loader size={13} className="animate-spin" /> Applying…</>
                  : <><Wand2 size={13} /> Apply Changes</>
                }
              </button>
            </div>
          </div>
        </div>
      </div>
      </>
      )}

      {/* ── Suggested Edits (merge-request style review) ── */}
      {(() => {
        const pendingSuggestions  = suggestions.filter(s => s.status === 'pending');
        const resolvedSuggestions = suggestions.filter(s => s.status !== 'pending');
        return (
          <div className="mt-6">
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-stone-200 flex items-center gap-3">
                <GitPullRequest size={16} className="text-kolet-yellow" />
                <h2 className="text-sm font-semibold text-gray-900">Suggested Edits</h2>
                {pendingSuggestions.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500 text-white font-semibold">{pendingSuggestions.length} pending</span>
                )}
              </div>

              <div className="p-5 space-y-4">
                {suggestionError && (
                  <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertTriangle size={12} /> {suggestionError}
                  </div>
                )}

                {suggestions.length === 0 && (
                  <p className="text-xs text-gray-400">
                    No suggested edits yet. In Review Mode, select text and use &ldquo;Edit directly&rdquo; or &ldquo;Ask AI&rdquo; to propose a change.
                  </p>
                )}

                {pendingSuggestions.map(s => (
                  <div key={s.id} className="space-y-2 p-3 bg-stone-50 border border-stone-200 rounded-lg">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="font-semibold text-gray-900">{s.author}</span>
                        <span>{new Date(s.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="px-1.5 py-0.5 rounded-full bg-stone-200 text-gray-500">
                          {s.source === 'ai_rewrite' ? '✨ AI rewrite' : '✏️ Direct edit'}
                        </span>
                      </div>
                      {isAdmin ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => rejectSuggestion(s.id)}
                            disabled={suggestionActioning === s.id}
                            className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40"
                          >
                            <X size={12} /> Reject
                          </button>
                          <button
                            onClick={() => approveSuggestion(s.id)}
                            disabled={suggestionActioning === s.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                          >
                            {suggestionActioning === s.id ? <Loader size={11} className="animate-spin" /> : <GitMerge size={11} />}
                            Merge
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Awaiting admin review</span>
                      )}
                    </div>
                    <SideBySideDiff original={s.original_text} proposed={s.proposed_text} />
                  </div>
                ))}

                {resolvedSuggestions.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowResolvedSuggestions(v => !v)}
                      className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                    >
                      {showResolvedSuggestions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {showResolvedSuggestions ? 'Hide' : 'Show'} {resolvedSuggestions.length} resolved
                    </button>
                    {showResolvedSuggestions && (
                      <div className="mt-3 space-y-2">
                        {resolvedSuggestions.map(s => (
                          <div key={s.id} className="p-3 bg-stone-50 border border-stone-200 rounded-lg opacity-60">
                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1.5">
                              {s.status === 'approved' ? <CheckCheck size={11} className="text-emerald-500" /> : <X size={11} className="text-red-400" />}
                              <span className="font-semibold text-gray-700">{s.author}</span>
                              <span>{s.status} by {s.resolved_by}</span>
                            </div>
                            <p className="text-xs text-gray-400 line-through">{s.original_text}</p>
                            <p className="text-xs text-gray-500">{s.proposed_text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Add a general comment (not anchored to a passage) ── */}
      <div className="mt-6">
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm p-5 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare size={14} className="text-kolet-yellow" />
            <h2 className="text-sm font-semibold text-gray-900">Add a general comment</h2>
          </div>
          <p className="text-xs text-gray-400 mb-2">
            Not about a specific passage? Leave overall feedback here — or highlight text above in Review Mode to comment on something specific.
          </p>
          <input
            value={commentAuthor}
            onChange={e => setCommentAuthor(e.target.value)}
            placeholder="Your name (optional)"
            className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-kolet-yellow transition-colors"
          />
          <textarea
            value={commentBody}
            onChange={e => setCommentBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitComment(); }}
            placeholder="Overall feedback on this article…"
            rows={3}
            className="w-full bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-kolet-yellow transition-colors resize-y"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">⌘↵ to submit</span>
            <button
              onClick={() => submitComment()}
              disabled={commentSubmitting || !commentBody.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-kolet-yellow hover:bg-kolet-yellow/85 text-kolet-black text-sm font-semibold rounded-lg transition-colors disabled:opacity-40"
            >
              {commentSubmitting ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
              {commentSubmitting ? 'Posting…' : 'Post Comment'}
            </button>
          </div>
        </div>
      </div>


      {/* ── AI Review Panel ── */}
      <div className="mt-6">
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
          {/* Header */}
          <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles size={16} className="text-kolet-yellow" />
              <h2 className="text-sm font-semibold text-gray-900">AI Review</h2>
              {review?.overall_score != null && (
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                  review.overall_score >= 80 ? "bg-emerald-600 text-white" :
                  review.overall_score >= 60 ? "bg-amber-500 text-stone-900" :
                  "bg-red-600 text-white"
                }`}>
                  Score: {review.overall_score}/100
                </span>
              )}
            </div>
            <button
              onClick={runReview}
              disabled={reviewLoading}
              className="flex items-center gap-1.5 px-4 py-2 border border-stone-300 hover:border-kolet-yellow hover:text-kolet-yellow text-sm text-gray-500 rounded-lg transition-colors disabled:opacity-50"
            >
              {reviewLoading ? <><Loader size={13} className="animate-spin" /> Running…</> : 'Run Review'}
            </button>
          </div>

          {reviewError && (
            <div className="px-5 py-3 text-sm text-red-400 bg-red-700/10 border-b border-red-800/20">{reviewError}</div>
          )}

          {!review && !reviewLoading && (
            <div className="px-5 py-10 text-center text-gray-500 text-sm">
              <Sparkles size={28} className="mx-auto mb-3 opacity-30" />
              <p>Run a review to check voice &amp; tone, facts, and get CTR-optimised title variants.</p>
            </div>
          )}

          {reviewLoading && (
            <div className="px-5 py-10 flex flex-col items-center gap-3 text-gray-500 text-sm">
              <Loader size={24} className="animate-spin text-kolet-yellow" />
              <p>Claude is reviewing Voice &amp; Tone, Facts, and CTR opportunities…</p>
            </div>
          )}

          {review && (
            <div className="divide-y divide-stone-200">

              {/* Voice & Tone */}
              {review.voice && (
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-900">Voice &amp; Tone</span>
                    <span className={`text-sm font-bold ${
                      review.voice.score >= 80 ? "text-emerald-500" :
                      review.voice.score >= 60 ? "text-amber-500" : "text-red-500"
                    }`}>{review.voice.score}/100</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-4 leading-relaxed">{review.voice.verdict}</p>

                  {/* AI patterns */}
                  {review.voice.ai_patterns?.length > 0 && (
                    <div className="mb-4">
                      {review.voice.ai_patterns.map((p: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 bg-red-600 border border-red-700 text-white rounded-lg px-3 py-2 mb-2 text-xs">
                          <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                          "{p}"
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Rewrites */}
                  {review.voice.rewrites?.length > 0 && (
                    <div className="space-y-3">
                      {review.voice.rewrites.map((rw: any, i: number) => (
                        <div key={i} className="bg-stone-50 border border-stone-200 rounded-lg p-3 text-xs">
                          <p className="line-through text-gray-400 leading-relaxed mb-1.5">{rw.original}</p>
                          <p className="text-emerald-700 leading-relaxed">→ {rw.suggestion}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Fact Check */}
              {review.facts && (
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-900">Fact Check</span>
                    <span className={`text-sm font-bold ${
                      review.facts.score >= 80 ? "text-emerald-500" :
                      review.facts.score >= 60 ? "text-amber-500" : "text-red-500"
                    }`}>{review.facts.score}/100</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-4 leading-relaxed">{review.facts.verdict}</p>

                  {review.facts.flagged_claims?.length > 0 && (
                    <div className="space-y-2">
                      {review.facts.flagged_claims.map((fc: any, i: number) => (
                        <div key={i} className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5 text-xs">
                          <div className="flex items-start gap-2">
                            <AlertTriangle size={11} className="shrink-0 mt-0.5 text-amber-500" />
                            <div>
                              <span className="text-amber-700 font-medium">"{fc.claim}"</span>
                              <p className="text-gray-600 mt-1 leading-relaxed">{fc.issue}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {review.facts.flagged_claims?.length === 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                      <CheckCircle2 size={13} /> All claims verified — no factual issues found.
                    </div>
                  )}
                </div>
              )}

              {/* CTR Variants */}
              {review.ctr && (review.ctr.title_variants?.length > 0 || review.ctr.meta_variants?.length > 0) && (
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-semibold text-gray-900">CTR Optimisation</span>
                    {(selectedTitle || selectedMeta) && (
                      <button
                        onClick={applyCtrVariants}
                        disabled={applyingCtr}
                        className="flex items-center gap-1.5 px-4 py-2 bg-kolet-yellow hover:bg-kolet-yellow/85 text-kolet-black text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                      >
                        {applyingCtr
                          ? <><Loader size={13} className="animate-spin" /> Applying…</>
                          : <><Check size={13} /> Apply to Article</>
                        }
                      </button>
                    )}
                  </div>

                  {review.ctr.title_variants?.length > 0 && (
                    <div className="mb-5">
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-medium">Title Variants</div>
                      <div className="space-y-2">
                        {review.ctr.title_variants.map((v: any, i: number) => {
                          const isSelected = selectedTitle === v.text;
                          return (
                            <button
                              key={i}
                              onClick={() => setSelectedTitle(isSelected ? '' : v.text)}
                              className={`w-full text-left rounded-lg px-3 py-2.5 text-xs border transition-all ${
                                isSelected
                                  ? 'bg-kolet-yellow/10 border-kolet-yellow ring-1 ring-kolet-yellow'
                                  : 'bg-stone-50 border-stone-200 hover:border-stone-400'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-gray-900 font-medium mb-0.5 leading-snug">{v.text}</p>
                                  <p className="text-gray-500">{v.reasoning}</p>
                                </div>
                                <div className={`shrink-0 w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center ${
                                  isSelected ? 'border-kolet-yellow bg-kolet-yellow' : 'border-stone-300'
                                }`}>
                                  {isSelected && <Check size={9} className="text-kolet-black" />}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {review.ctr.meta_variants?.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-medium">Meta Description Variants</div>
                      <div className="space-y-2">
                        {review.ctr.meta_variants.map((v: any, i: number) => {
                          const isSelected = selectedMeta === v.text;
                          return (
                            <button
                              key={i}
                              onClick={() => setSelectedMeta(isSelected ? '' : v.text)}
                              className={`w-full text-left rounded-lg px-3 py-2.5 text-xs border transition-all ${
                                isSelected
                                  ? 'bg-kolet-yellow/10 border-kolet-yellow ring-1 ring-kolet-yellow'
                                  : 'bg-stone-50 border-stone-200 hover:border-stone-400'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-gray-900 mb-0.5 leading-snug">{v.text}</p>
                                  <p className="text-gray-500">{v.reasoning}</p>
                                </div>
                                <div className={`shrink-0 w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center ${
                                  isSelected ? 'border-kolet-yellow bg-kolet-yellow' : 'border-stone-300'
                                }`}>
                                  {isSelected && <Check size={9} className="text-kolet-black" />}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Apply fixes footer */}
              {((review.voice?.rewrites?.length > 0) || (review.facts?.flagged_claims?.length > 0)) && (
                <div className="px-5 py-4 bg-stone-50 flex items-center gap-3 flex-wrap">
                  {applyError && (
                    <span className="text-xs text-red-400 flex-1">{applyError}</span>
                  )}
                  <p className="text-xs text-gray-500 flex-1">
                    {(review.voice?.rewrites?.length || 0) + (review.facts?.flagged_claims?.length || 0)} fixes available
                    — Claude will apply them directly to the article content.
                  </p>
                  {review.voice?.rewrites?.length > 0 && (
                    <button
                      onClick={() => applyFixes(true)}
                      disabled={applyingFixes}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-stone-300 hover:border-kolet-yellow hover:text-kolet-yellow text-gray-500 text-xs rounded-lg transition-colors disabled:opacity-50"
                    >
                      {applyingFixes ? <Loader size={11} className="animate-spin" /> : <Sparkles size={11} />}
                      Apply Voice Fixes only
                    </button>
                  )}
                  <button
                    onClick={() => applyFixes(false)}
                    disabled={applyingFixes}
                    className="flex items-center gap-1.5 px-4 py-2 bg-kolet-yellow hover:bg-kolet-yellow/85 text-kolet-black text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {applyingFixes
                      ? <><Loader size={13} className="animate-spin" /> Applying…</>
                      : <><Wand2 size={13} /> Apply All Fixes</>
                    }
                  </button>
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {/* ── Version History ── */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-stretch bg-black/80 backdrop-blur-sm" onClick={() => setShowHistory(false)}>
          <div
            className="relative ml-auto w-full max-w-2xl bg-white border-l border-stone-200 flex flex-col h-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 shrink-0">
              <div className="flex items-center gap-2">
                <History size={16} className="text-kolet-yellow" />
                <h2 className="text-sm font-semibold text-gray-900">Version History</h2>
              </div>
              <button onClick={() => setShowHistory(false)} className="text-gray-500 hover:text-gray-900 p-1 rounded transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {historyError && (
                <p className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertTriangle size={12} /> {historyError}
                </p>
              )}
              {revisionsLoading && (
                <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
                  <Loader size={16} className="animate-spin" /> Loading…
                </div>
              )}
              {!revisionsLoading && revisions.length === 0 && !historyError && (
                <p className="text-sm text-gray-400 text-center py-8">No previous versions yet — one gets saved every time content changes.</p>
              )}
              {revisions.map(rev => {
                const expanded = expandedRevisionId === rev.id;
                return (
                  <div key={rev.id} className="border border-stone-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-xs text-gray-500">
                        <span className="font-semibold text-gray-900">
                          {REVISION_SOURCE_LABELS[rev.source ?? ''] ?? rev.source ?? 'Change'}
                        </span>
                        {' · '}
                        {new Date(rev.created_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {rev.author && <> · {rev.author}</>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpandedRevisionId(expanded ? null : rev.id)}
                          className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-stone-100 transition-colors"
                        >
                          {expanded ? 'Hide diff' : 'Preview diff'}
                        </button>
                        <button
                          onClick={() => restoreRevision(rev.id)}
                          disabled={restoringId === rev.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                        >
                          {restoringId === rev.id ? <Loader size={11} className="animate-spin" /> : <History size={11} />}
                          Restore this version
                        </button>
                      </div>
                    </div>
                    {expanded && (
                      <div className="pt-1">
                        <p className="text-xs text-gray-400 mb-1.5">This version (left) vs. current content (right):</p>
                        <SideBySideDiff original={rev.content} proposed={rawContent} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
