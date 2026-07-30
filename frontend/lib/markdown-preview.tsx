"use client";
import { Fragment, useMemo } from "react";
import { Image as ImageIcon } from "lucide-react";
import type { Comment } from "./types";

// ── Entity decoding ─────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// ── Inline tokenizer: bold, italic, links, plain text ───────────────────────

type InlineToken =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "link"; value: string; href: string };

function tokenizeInline(raw: string): InlineToken[] {
  const text = decodeEntities(raw);
  const tokens: InlineToken[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) tokens.push({ type: "text", value: text.slice(last, m.index) });
    if (m[1] !== undefined) tokens.push({ type: "link", value: m[1], href: m[2] });
    else if (m[3] !== undefined) tokens.push({ type: "bold", value: m[3] });
    else if (m[4] !== undefined) tokens.push({ type: "italic", value: m[4] });
    last = re.lastIndex;
  }
  if (last < text.length) tokens.push({ type: "text", value: text.slice(last) });
  return tokens;
}

// ── Block parser ─────────────────────────────────────────────────────────────

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "image"; alt: string; src: string }
  | { type: "promo"; title: string; ctaText: string; ctaHref: string; body: string }
  | { type: "hr" };

function parseBlocks(markdown: string): Block[] {
  const lines = (markdown || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const isHeading   = (l: string) => /^#{2,4}\s+/.test(l);
  const isImage     = (l: string) => /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.test(l);
  const isPromo     = (l: string) => /^>\s*\[!PROMO/.test(l);
  const isHr        = (l: string) => /^-{3,}\s*$/.test(l.trim());
  const isListItem  = (l: string) => /^[-*]\s+/.test(l);

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    const headingMatch = line.match(/^(#{2,4})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1].length, text: headingMatch[2].trim() });
      i++; continue;
    }

    const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (imageMatch) {
      blocks.push({ type: "image", alt: imageMatch[1], src: imageMatch[2] });
      i++; continue;
    }

    if (isPromo(line)) {
      const title   = line.match(/title="([^"]*)"/)?.[1] ?? "";
      const ctaText = line.match(/ctaText="([^"]*)"/)?.[1] ?? "";
      const ctaHref = line.match(/ctaHref="([^"]*)"/)?.[1] ?? "";
      let j = i + 1;
      const bodyLines: string[] = [];
      while (j < lines.length && lines[j].trim().startsWith(">")) {
        bodyLines.push(lines[j].replace(/^>\s?/, ""));
        j++;
      }
      blocks.push({ type: "promo", title, ctaText, ctaHref, body: bodyLines.join(" ").trim() });
      i = j; continue;
    }

    if (isHr(line)) {
      blocks.push({ type: "hr" });
      i++; continue;
    }

    if (isListItem(line)) {
      const items: string[] = [];
      while (i < lines.length && isListItem(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, "").trim());
        i++;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length && lines[i].trim() &&
      !isHeading(lines[i]) && !isImage(lines[i]) && !isPromo(lines[i]) && !isHr(lines[i]) && !isListItem(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "paragraph", text: paraLines.join(" ") });
  }

  return blocks;
}

// ── Comment-quote highlighting, applied within a single inline run ─────────

function segmentPlainText(text: string, comments: Comment[]): { text: string; comment: Comment | null }[] {
  const candidates = comments.filter(c => c.quote?.trim() && text.includes(c.quote.trim()));
  if (!candidates.length) return [{ text, comment: null }];

  const marks: Array<{ start: number; end: number; comment: Comment }> = [];
  for (const c of candidates) {
    const q = c.quote.trim();
    let idx = text.indexOf(q);
    while (idx !== -1) {
      marks.push({ start: idx, end: idx + q.length, comment: c });
      idx = text.indexOf(q, idx + 1);
    }
  }
  marks.sort((a, b) => a.start - b.start);

  const segments: { text: string; comment: Comment | null }[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start < cursor) continue;
    if (mark.start > cursor) segments.push({ text: text.slice(cursor, mark.start), comment: null });
    segments.push({ text: text.slice(mark.start, mark.end), comment: mark.comment });
    cursor = mark.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), comment: null });
  return segments;
}

type OnOpen = (c: Comment, rect: DOMRect) => void;

function InlineRun({ tokens, comments, onOpen }: { tokens: InlineToken[]; comments: Comment[]; onOpen: OnOpen }) {
  return (
    <>
      {tokens.map((t, i) => {
        if (t.type === "link") {
          return (
            <a key={i} href={t.href} target="_blank" rel="noopener noreferrer" className="text-kolet-yellow underline hover:text-kolet-yellow/80">
              {t.value}
            </a>
          );
        }
        const segs = segmentPlainText(t.value, comments);
        const content = segs.map((seg, j) =>
          seg.comment ? (
            <mark
              key={j}
              className="bg-kolet-yellow/30 border-b-2 border-kolet-yellow/70 rounded-sm cursor-pointer not-italic hover:bg-kolet-yellow/50 transition-colors"
              onClick={e => { e.stopPropagation(); onOpen(seg.comment!, (e.currentTarget as HTMLElement).getBoundingClientRect()); }}
            >
              {seg.text}
            </mark>
          ) : (
            <Fragment key={j}>{seg.text}</Fragment>
          )
        );
        if (t.type === "bold") return <strong key={i}>{content}</strong>;
        if (t.type === "italic") return <em key={i}>{content}</em>;
        return <Fragment key={i}>{content}</Fragment>;
      })}
    </>
  );
}

// ── Public component ─────────────────────────────────────────────────────────

export function MarkdownPreview({
  content, comments, onOpen,
}: {
  content: string;
  comments: Comment[];
  onOpen: OnOpen;
}) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        if (b.type === "heading") {
          const cls = b.level === 2
            ? "text-lg font-bold text-gray-900 mt-2"
            : "text-base font-semibold text-gray-900 mt-2";
          return b.level === 2 ? (
            <h2 key={i} className={cls}><InlineRun tokens={tokenizeInline(b.text)} comments={comments} onOpen={onOpen} /></h2>
          ) : (
            <h3 key={i} className={cls}><InlineRun tokens={tokenizeInline(b.text)} comments={comments} onOpen={onOpen} /></h3>
          );
        }
        if (b.type === "paragraph") {
          return (
            <p key={i} className="text-sm text-gray-800 leading-7">
              <InlineRun tokens={tokenizeInline(b.text)} comments={comments} onOpen={onOpen} />
            </p>
          );
        }
        if (b.type === "list") {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1 text-sm text-gray-800 leading-7">
              {b.items.map((item, j) => (
                <li key={j}><InlineRun tokens={tokenizeInline(item)} comments={comments} onOpen={onOpen} /></li>
              ))}
            </ul>
          );
        }
        if (b.type === "image") {
          const isRealUrl = /^https?:\/\//.test(b.src);
          return isRealUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={b.src} alt={b.alt} className="w-full rounded-lg" />
          ) : (
            <div key={i} className="flex items-center gap-2 text-xs text-gray-400 bg-stone-50 border border-dashed border-stone-300 rounded-lg px-3 py-2.5">
              <ImageIcon size={13} className="shrink-0" /> {b.alt || "Image placeholder"}
            </div>
          );
        }
        if (b.type === "promo") {
          return (
            <div key={i} className="bg-kolet-yellow/10 border border-kolet-yellow/40 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{decodeEntities(b.title)}</p>
                <p className="text-xs text-gray-600 mt-0.5">{decodeEntities(b.body)}</p>
              </div>
              <span className="shrink-0 text-xs font-semibold bg-kolet-yellow text-kolet-black px-3 py-1.5 rounded-lg whitespace-nowrap">
                {decodeEntities(b.ctaText)}
              </span>
            </div>
          );
        }
        if (b.type === "hr") return <div key={i} className="border-t border-stone-200" />;
        return null;
      })}
    </div>
  );
}
