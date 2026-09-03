"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SelectionToolbar from "./SelectionToolbar";
import AIChatPanel from "./AIChatPanel";
import CommentsPanel from "./CommentsPanel";
import { useAuth } from "@/lib/AuthContext";
import {
  Annotation,
  deleteAnnotation,
  loadAnnotations,
  saveAnnotation,
} from "@/lib/annotations";
import {
  Reply,
  deleteReply,
  getVotesForReplies,
  loadReplies,
  saveReply,
  voteOnReply,
} from "@/lib/replies";

export type BookText = {
  title: string;
  author: string;
  pageCount: number;
  /** The source page's dimensions, so sheets keep the book's real shape. */
  pageSize?: { width: number; height: number } | null;
  chapters: { title: string; page: number }[];
  pages: { page: number; paragraphs: string[] }[];
};

type Status = "loading" | "ready" | "missing" | "error";

/** Used only for books extracted before page sizes were recorded. */
const FALLBACK_ASPECT = 0.72;

type Block = { kind: "heading" | "para"; text: string; page: number };
/** One sheet on screen. `from`/`to` record where in the source it came from. */
type Sheet = { blocks: Block[]; from: number; to: number };

/**
 * Lays the text out into sheets that don't scroll.
 *
 * Pages here are the reader's own, not the PDF's: the text is poured into
 * sheets and broken wherever a sheet fills, so nothing has to shrink to fit and
 * nothing needs a scrollbar. Type stays one size throughout, which is the whole
 * point — sizing per page to avoid overflow would set every page differently.
 *
 * Each sheet still records which pages of the source it drew from, so a
 * position in the book can be traced back if anything needs to.
 *
 * Heights come from measuring the real thing in a hidden copy of the sheet's
 * text column, because a paragraph's depth depends on where its words wrap.
 */
function paginate(
  blocks: Block[],
  columnWidth: number,
  columnHeight: number,
  fontSize: number
): Sheet[] {
  if (typeof document === "undefined" || columnWidth < 40 || columnHeight < 40) return [];

  const probe = document.createElement("div");
  Object.assign(probe.style, {
    position: "absolute",
    visibility: "hidden",
    pointerEvents: "none",
    left: "-10000px",
    top: "0",
    width: `${columnWidth}px`,
    fontFamily: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
    fontSize: `${fontSize}px`,
    lineHeight: "1.72",
    textAlign: "justify",
    hyphens: "auto",
  } as CSSStyleDeclaration);

  probe.innerHTML = blocks
    .map((b) =>
      b.kind === "heading"
        ? `<h2 style="font-size:.8em;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;margin:1.4em 0 1em">${escapeHtml(b.text)}</h2>`
        : `<p style="margin:0 0 1.05em;overflow-wrap:anywhere">${escapeHtml(b.text)}</p>`
    )
    .join("");
  document.body.appendChild(probe);

  // One layout pass for the whole book, then arithmetic.
  const heights = [...probe.children].map((el) => {
    const style = getComputedStyle(el);
    return (el as HTMLElement).offsetHeight + parseFloat(style.marginBottom || "0");
  });
  const lineHeight = fontSize * 1.72;
  document.body.removeChild(probe);

  const sheets: Sheet[] = [];
  let current: Block[] = [];
  let used = 0;

  const close = () => {
    if (!current.length) return;
    sheets.push({
      blocks: current,
      from: current[0].page,
      to: current[current.length - 1].page,
    });
    current = [];
    used = 0;
  };

  blocks.forEach((block, i) => {
    const height = heights[i] ?? lineHeight;

    // A paragraph taller than a whole sheet has to be broken mid-flow. Split it
    // by words in proportion to how far it overruns; every word survives, which
    // is what matters.
    if (height > columnHeight) {
      close();
      const pieces = Math.ceil(height / columnHeight);
      const words = block.text.split(" ");
      const per = Math.ceil(words.length / pieces);
      for (let p = 0; p < pieces; p++) {
        const slice = words.slice(p * per, (p + 1) * per).join(" ");
        if (slice) {
          sheets.push({ blocks: [{ ...block, text: slice }], from: block.page, to: block.page });
        }
      }
      return;
    }

    // A heading at the foot of a sheet would be stranded from what it heads.
    const orphanHeading = block.kind === "heading" && used + height * 2.5 > columnHeight;
    if ((used + height > columnHeight || orphanHeading) && current.length) close();

    current.push(block);
    used += height;
  });
  close();

  return sheets;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}
/** Room taken by the bar, the progress line and the breathing space around a sheet. */
const CHROME_HEIGHT = 162;
const GUTTER = 26;

/**
 * Reads a book as text, a page at a time.
 *
 * The PDF viewer drew each page to a canvas, so the words were an image: they
 * didn't reflow, didn't scale with the reader's own type size, and couldn't be
 * selected or searched. It has been removed; this is the reader now. Text is set
 * as real type, with the page kept as the unit you move through — one leaf or a
 * two-page spread, turned by clicking or with the arrow keys.
 *
 * Page numbers are real, not decoration. They are how annotations are anchored
 * and how a passage is found again.
 */
export default function BookReader({
  bookId,
  title,
  author,
}: {
  bookId: string;
  title: string;
  author?: string | null;
}) {
  const [text, setText] = useState<BookText | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [leaf, setLeaf] = useState(1); // leftmost page on screen
  const [spread, setSpread] = useState<1 | 2>(2);
  const [turn, setTurn] = useState<{ dir: "next" | "back"; n: number }>({ dir: "next", n: 0 });
  const [showContents, setShowContents] = useState(false);
  const [viewport, setViewport] = useState({ w: 1280, h: 800 });
  const [sheets, setSheets] = useState<Sheet[]>([]);
  /** Which turn zone the pointer is over, so the cursor can say so. */
  const [zone, setZone] = useState<"back" | "next" | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/books/${encodeURIComponent(bookId)}/text`)
      .then(async (r) => {
        if (r.status === 404) return "missing" as const;
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as BookText;
      })
      .then((result) => {
        if (cancelled) return;
        if (result === "missing") return setStatus("missing");
        setText(result);
        setStatus("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("[reader] could not load text:", e);
        setStatus("error");
      });
    return () => { cancelled = true; };
  }, [bookId]);

  useEffect(() => {
    const measure = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  /* ---- Marking up the text ----
   * Selection is the one thing that gets easier by leaving the PDF behind: the
   * words are real nodes, so the browser hands us the selection directly
   * instead of it having to be reconstructed from glyph rectangles. */

  const { user } = useAuth();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  // A comment is only worth making if it can be read again, so the thread and
  // its replies are opened from the marked passage itself.
  const [focused, setFocused] = useState<string | null>(null);
  const [replies, setReplies] = useState<{ [annotationId: string]: Reply[] }>({});
  const [selection, setSelection] = useState<
    { text: string; page: number; x: number; y: number } | null
  >(null);
  // Clicking into a panel empties the browser's selection, which used to wipe
  // the passage out from under the comment box and close it mid-sentence. The
  // passage is frozen the moment a tool is chosen, and the tools read that copy.
  const [pending, setPending] = useState<{ text: string; page: number } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [chatFor, setChatFor] = useState<{ text: string; x: number; y: number } | null>(null);
  const [define, setDefine] = useState<
    { word: string; definition: string; partOfSpeech?: string; phonetic?: string; x: number; y: number } | null
  >(null);
  const deskRef = useRef<HTMLDivElement>(null);
  const spreadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadAnnotations(bookId)
      .then(setAnnotations)
      .catch((e) => console.warn("[reader] annotations unavailable:", e?.message ?? e));
  }, [bookId]);

  // Reading a selection on mouse-up keeps the toolbar from flickering while the
  // pointer is still dragging across the words.
  useEffect(() => {
    const onUp = (e: MouseEvent) => {
      // A click inside one of our panels is not the reader choosing a new
      // passage, and must not clear the one they already chose.
      if ((e.target as HTMLElement | null)?.closest?.("[data-ui-panel]")) return;
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      if (!text || !sel?.rangeCount) return setSelection(null);

      const range = sel.getRangeAt(0);
      const sheet = (range.startContainer.parentElement as HTMLElement | null)?.closest<HTMLElement>("[data-source]");
      if (!sheet || !deskRef.current?.contains(sheet)) return setSelection(null);

      const box = range.getBoundingClientRect();
      setSelection({
        text,
        page: Number(sheet.dataset.source ?? 1),
        x: box.left + box.width / 2,
        y: box.top,
      });
    };
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, []);

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);

  /** Highlights are stored against the words, not a rectangle on a page. */
  const addHighlight = useCallback(
    async (color: string) => {
      if (!selection) return;
      const saved = await saveAnnotation(bookId, {
        pageNumber: selection.page,
        type: "highlight",
        data: { selectedText: selection.text, color, quote: selection.text },
        color,
        visibility: "private",
      });
      if (saved) setAnnotations((all) => [...all, saved]);
      else setNotice("Sign in to highlight.");
      clearSelection();
    },
    [bookId, selection, clearSelection]
  );

  /** Post the comment waiting in the panel against the frozen passage. */
  const addComment = useCallback(
    async (comment: string, visibility: "public" | "private", anonymous: boolean) => {
      if (!pending || !comment) return;
      const saved = await saveAnnotation(bookId, {
        pageNumber: pending.page,
        type: "highlight",
        // `annotations` has no anonymous column, while `replies` does, so this
        // travels in the JSON rather than waiting on a migration.
        data: {
          selectedText: pending.text,
          quote: pending.text,
          color: "#ffd97a",
          anonymous,
        },
        comment,
        color: "#ffd97a",
        visibility,
      });
      if (saved) {
        setAnnotations((all) => [...all, saved]);
        setPending(null);
      } else {
        setNotice("Sign in to leave a comment.");
      }
    },
    [bookId, pending]
  );

  const lookUp = useCallback(async () => {
    if (!selection) return;
    const word = selection.text.split(/\s+/)[0].replace(/[^a-zA-Z'-]/g, "");
    if (!word) return;
    const at = { x: selection.x, y: selection.y };
    clearSelection();
    try {
      const res = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
      );
      if (!res.ok) throw new Error("not found");
      const [entry] = await res.json();
      const meaning = entry?.meanings?.[0];
      setDefine({
        word: entry?.word ?? word,
        phonetic: entry?.phonetic,
        partOfSpeech: meaning?.partOfSpeech,
        definition: meaning?.definitions?.[0]?.definition ?? "No definition found.",
        ...at,
      });
    } catch {
      setDefine({ word, definition: "No definition found.", ...at });
    }
  }, [selection, clearSelection]);

  const openNoteAt = useCallback(
    async (annotation: Annotation) => {
      setPanelOpen(true);
      setFocused(annotation.id);
      try {
        const list = await loadReplies(annotation.id);
        const votes = await getVotesForReplies(list.map((r) => r.id));
        setReplies((all) => ({
          ...all,
          [annotation.id]: list.map((r) => ({ ...r, ...(votes.get(r.id) ?? {}) })),
        }));
      } catch (e) {
        console.warn("[reader] replies unavailable:", e);
      }
    },
    []
  );

  const submitReplyTo = useCallback(
    async (annotationId: string, body: string, anonymous: boolean) => {
      if (!body) return;
      const saved = await saveReply(annotationId, body, anonymous);
      if (!saved) return setNotice("Sign in to reply.");
      setReplies((all) => ({ ...all, [annotationId]: [...(all[annotationId] ?? []), saved] }));
    },
    []
  );

  const removeAnnotation = useCallback(async (annotationId: string) => {
    if (!(await deleteAnnotation(annotationId))) return setNotice("Couldn't delete that.");
    setAnnotations((all) => all.filter((a) => a.id !== annotationId));
    setFocused((cur) => (cur === annotationId ? null : cur));
  }, []);

  /** Every highlighted phrase, longest first so a phrase wins over a word inside it. */
  const marks = useMemo(() => {
    const out = new Map<string, Annotation>();
    for (const a of annotations) {
      const data = a.data as { quote?: string; selectedText?: string } | undefined;
      const quote = data?.quote ?? data?.selectedText;
      if (quote && quote.length > 2) out.set(quote, a);
    }
    return [...out.entries()].sort((x, y) => y[0].length - x[0].length);
  }, [annotations]);

  // A narrow window has no room for two pages side by side.
  const columns = viewport.w < 900 ? 1 : spread;

  // Navigation counts sheets; the book's own page numbers are what get shown.
  const total = Math.max(1, sheets.length);

  const goTo = useCallback(
    (target: number, dir: "next" | "back") => {
      setLeaf(Math.max(1, Math.min(total, target)));
      setTurn((t) => ({ dir, n: t.n + 1 })); // n forces the turn to replay
    },
    [total]
  );

  const next = useCallback(() => {
    if (leaf + columns <= total) goTo(leaf + columns, "next");
  }, [leaf, columns, total, goTo]);

  const back = useCallback(() => {
    if (leaf > 1) goTo(leaf - columns, "back");
  }, [leaf, columns, goTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Someone typing a comment is not asking to turn the page.
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("[data-ui-panel]") || /^(INPUT|TEXTAREA)$/.test(el?.tagName ?? "")) {
        if (e.key === "Escape") setShowContents(false);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); back(); }
      if (e.key === "Escape") setShowContents(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, back]);

  const currentChapter = useMemo(() => {
    if (!text) return null;
    let found: string | null = null;
    const onScreen = sheets[Math.min(leaf, sheets.length) - 1]?.to ?? 1;
    for (const c of text.chapters) {
      if (c.page <= onScreen) found = c.title;
      else break;
    }
    return found;
  }, [text, sheets, leaf]);

  /* ---- Sheet size: a page as large as the window allows, in the book's own
     proportions, so a spread never overflows either dimension. ---- */
  const aspect = text?.pageSize?.height
    ? text.pageSize.width / text.pageSize.height
    : FALLBACK_ASPECT;
  const roomH = Math.max(320, viewport.h - CHROME_HEIGHT);
  const panelWidth = panelOpen && viewport.w >= 760 ? 340 : 0;
  const roomW = Math.max(280, viewport.w - 120 - (columns - 1) * GUTTER) / columns;
  const sheetH = Math.min(roomH, roomW / aspect);
  const sheetW = sheetH * aspect;
  // Type is sized so a sheet carries roughly what a page of the source carries.
  // Characters that fit ~= (column width / average glyph width) * lines, and for
  // this face a glyph runs about half the point size, so solving for the size
  // gives the expression below. Clamped to stay readable either way.
  const perSourcePage = text
    ? Math.max(
        600,
        Math.round(
          text.pages.reduce(
            (n, pg) => n + pg.paragraphs.reduce((m, t) => m + t.length, 0),
            0
          ) / Math.max(text.pageCount, 1)
        )
      )
    : 1800;
  const padX = sheetW * 0.11;
  const padY = sheetH * 0.085;
  const columnW = sheetW - padX * 2;
  const columnH = sheetH - padY - sheetH * 0.11; // foot leaves room for the folio
  const fontSize = Math.max(
    10.5,
    Math.min(16, Math.sqrt((columnW * columnH) / (0.86 * perSourcePage)))
  );

  /** Every heading and paragraph in the book, tagged with the page it came from. */
  const blocks = useMemo<Block[]>(() => {
    if (!text) return [];
    const out: Block[] = [];
    for (const p of text.pages) {
      const heading = text.chapters.find((c) => c.page === p.page)?.title;
      if (heading) out.push({ kind: "heading", text: heading, page: p.page });
      for (const para of p.paragraphs) out.push({ kind: "para", text: para, page: p.page });
    }
    return out;
  }, [text]);

  // Measuring touches the DOM, so it waits for a frame and rides out a resize
  // rather than running on every pixel of a drag.
  useEffect(() => {
    if (!blocks.length) return setSheets([]);
    const id = setTimeout(
      () => setSheets(paginate(blocks, columnW, columnH, fontSize)),
      120
    );
    return () => clearTimeout(id);
  }, [blocks, columnW, columnH, fontSize]);

  if (status === "loading") return <Centered>Setting the type…</Centered>;

  if (status !== "ready" || !text) {
    return (
      <Centered>
        <div style={{ marginBottom: 14 }}>
          {status === "missing"
            ? "This book hasn't been through the extractor yet."
            : "The text couldn't be loaded."}
        </div>
        {status === "missing" && (
          <code style={{ fontSize: 12, opacity: 0.6 }}>
            node scripts/extract-books.mjs --upload
          </code>
        )}
      </Centered>
    );
  }

  const zoneCursor =
    zone === "back" ? "w-resize" : zone === "next" ? "e-resize" : "default";

  /**
   * Which turn a point asks for, the way a real book would take it.
   *
   * Only the outward-facing edge of each page turns: the left third of the
   * leftmost page goes back, the right third of the rightmost page goes on.
   * With two pages open, the edges facing the gutter do nothing — a click
   * near the middle of the spread is reading, not turning. Each page is
   * sheetW wide with a GUTTER between them, so the layout is walked
   * directly rather than re-measuring every leaf. Anything out in the
   * margins beyond the paper turns the way it points.
   */
  const zoneAt = (clientX: number): "back" | "next" | null => {
    const rect = spreadRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || panelOpen) return null;
    if (clientX < rect.left) return "back";
    if (clientX > rect.right) return "next";
    const x = clientX - rect.left;
    for (let i = 0; i < columns; i++) {
      const pageStart = i * (sheetW + GUTTER);
      const pageEnd = pageStart + sheetW;
      const first = i === 0;
      const last = i === columns - 1;
      if (x < pageStart) return null; // in the gutter between pages
      if (x <= pageEnd || last) {
        const across = (x - pageStart) / sheetW;
        if (first && across <= 1 / 3) return "back";
        if (last && across >= 2 / 3) return "next";
        return null;
      }
    }
    return null;
  };

  // Clamped rather than corrected in an effect, so a relayout can't leave the
  // view pointing past the end of the book for a frame.
  const first = Math.max(1, Math.min(leaf, Math.max(1, sheets.length)));
  const visible = sheets.slice(first - 1, first - 1 + columns);
  const progress = Math.round(((first + columns - 1) / total) * 100);
  // Only the threads attached to what is on screen, so the panel follows the
  // reading rather than listing the whole book.
  const shownPages = new Set(visible.flatMap((v) => [v.from, v.to]));
  const pageComments = annotations.filter(
    (a) => a.comment && shownPages.has(a.pageNumber)
  );

  const atStart = first <= 1;
  const atEnd = first + columns > total;

  return (
    <main style={shell}>
      <style>{`
        @keyframes leafInRight { from { opacity: 0; transform: translateX(58px); }
                                 to   { opacity: 1; transform: none; } }
        @keyframes leafInLeft  { from { opacity: 0; transform: translateX(-58px); }
                                 to   { opacity: 1; transform: none; } }
        .rdr-item:hover { background: rgba(255,228,192,0.07); color: #ffe8c0 !important; }
      `}</style>

      <header style={bar}>
        <a href="/library" className="rdr-item" style={barItem} title="Back to the library">
          <svg
            aria-hidden
            width="18"
            height="12"
            viewBox="0 0 36 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            // Centring the arrow on the label's layout box puts it above the
            // word: that box runs ascender to descender, while the ink of
            // "Library" sits 10.4px above the baseline and only 2.6px below.
            // This drops it onto the word's optical centre, in em so it holds
            // if the bar's type size changes again.
            style={{ opacity: 0.75, position: "relative", top: "0.113em" }}
          >
            <path d="M31 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Library
        </a>

        {/* Centred on the bar itself, so it stays put however wide the controls
            either side of it happen to be. */}
        <div style={titleBlock}>
          <span style={barTitle}>{title}</span>
          {(() => {
            const line = [surname(author), meaningfulChapter(currentChapter, title)]
              .filter(Boolean)
              .join(" · ");
            return line ? <span style={barSub}>{line}</span> : null;
          })()}
        </div>

        <div style={barRight}>
          {viewport.w >= 900 && (
            <button
              role="switch"
              aria-checked={spread === 2}
              aria-label={spread === 1 ? "One page at a time" : "Two pages at a time"}
              title={spread === 1 ? "One page" : "Two pages"}
              onClick={() => setSpread(spread === 1 ? 2 : 1)}
              style={toggleTrack}
            >
              <span
                aria-hidden
                style={{
                  ...toggleKnob,
                  transform: `translateX(${spread === 1 ? 0 : TOGGLE_HALF}px)`,
                }}
              />
              <span style={{ ...toggleFace, color: spread === 1 ? "#241703" : "rgba(255,228,192,0.55)" }}>1</span>
              <span style={{ ...toggleFace, color: spread === 2 ? "#241703" : "rgba(255,228,192,0.55)" }}>2</span>
            </button>
          )}

          {text.chapters.length > 0 && (
            <button
              className="rdr-item"
              onClick={() => setShowContents((v) => !v)}
              style={{ ...barItem, color: showContents ? "#ffe8c0" : "rgba(255,228,192,0.72)" }}
            >
              Contents
            </button>
          )}

          <button
            className="rdr-item"
            onClick={() => setPanelOpen((v) => !v)}
            style={{ ...barItem, color: panelOpen ? "#ffe8c0" : "rgba(255,228,192,0.72)" }}
          >
            Comments
          </button>
        </div>
      </header>

      <div style={progressTrack}>
        <div style={{ ...progressFill, width: `${progress}%` }} />
      </div>

      {showContents && (
        <nav style={contents}>
          {text.chapters.map((c) => (
            <button
              key={`${c.title}-${c.page}`}
              onClick={() => {
                // The first sheet that reached the source page this chapter
                // opens on.
                const i = sheets.findIndex((sh) => sh.to >= c.page);
                const target = i === -1 ? 1 : i + 1;
                goTo(target, target >= leaf ? "next" : "back");
                setShowContents(false);
              }}
              style={{
                ...contentsItem,
                color: c.title === currentChapter ? "#ffe8c0" : "rgba(255,228,192,0.62)",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</span>
              <span style={{ opacity: 0.5, marginLeft: 12 }}>{c.page}</span>
            </button>
          ))}
        </nav>
      )}

      <div style={{ position: "relative", display: "flex", flex: 1, minHeight: 0 }}>
      <div
        ref={deskRef}
        style={{ ...desk, cursor: zoneCursor }}
        onMouseMove={(e) => setZone(zoneAt(e.clientX))}
        onMouseLeave={() => setZone(null)}
        onClick={(e) => {
          if (panelOpen) return; // the panel is where the pointer is headed
          // A click that ended a selection was the reader marking a passage.
          if (window.getSelection()?.toString()) return;
          const el = e.target as HTMLElement | null;
          if (el?.closest?.("[data-ui-panel], mark, button, a")) return;
          const side = zoneAt(e.clientX);
          if (side === "back") back();
          if (side === "next") next();
        }}
      >
        {/* Clicking the outer thirds turns the page, so the book can be read
            without going hunting for a control. A click that finished a text
            selection is left alone. */}
        <div
          ref={spreadRef}
          style={{
            display: "flex",
            gap: GUTTER,
            alignItems: "flex-start",
            transform: `translateX(${-panelWidth / 2}px)`,
            transition: "transform 220ms ease-out",
          }}
        >
          {visible.map((sh, i) => (
            <section
              key={`${turn.n}-${leaf}-${i}`}
              data-page={first + i}
              data-source={sh.from}
              style={{
                ...sheet,
                width: sheetW,
                height: sheetH,
                padding: `${padY}px ${padX}px ${sheetH * 0.11}px`,
                fontSize,
                animation: `${turn.dir === "next" ? "leafInRight" : "leafInLeft"} 260ms ease-out both`,
                animationDelay: `${i * 55}ms`,
              }}
            >
              {sh.blocks.map((b, j) =>
                b.kind === "heading" ? (
                  <h2 key={j} style={chapterHeading}>{b.text}</h2>
                ) : (
                  <p key={j} style={paragraph}>{withMarks(b.text, marks, openNoteAt)}</p>
                )
              )}
              <span aria-hidden style={folio}>{first + i}</span>
            </section>
          ))}
        </div>
      </div>

      {panelWidth > 0 && (
        <CommentsPanel
          width={panelWidth}
          floating
          draft={pending}
          comments={pageComments}
          replies={replies}
          currentUserId={user?.id}
          onDraftCancel={() => setPending(null)}
          onDraftSubmit={addComment}
          onReply={(id, body, anonymous) => void submitReplyTo(id, body, anonymous)}
          onDeleteComment={removeAnnotation}
          onClose={() => { setPanelOpen(false); setPending(null); }}
          focusedId={focused}
          onFocusComment={(a) => {
            const i = sheets.findIndex((sh) => sh.to >= a.pageNumber);
            if (i !== -1) goTo(i + 1, i + 1 >= first ? "next" : "back");
          }}
        />
      )}
      </div>

      <footer style={footer}>
        <button onClick={back} disabled={atStart} style={{ ...stepButton, opacity: atStart ? 0.3 : 1 }}>
          ‹ Back
        </button>
        <span style={counter}>
          {columns === 2 && visible.length > 1 ? `${first}–${first + 1}` : first} of {total}
        </span>
        <button onClick={next} disabled={atEnd} style={{ ...stepButton, opacity: atEnd ? 0.3 : 1 }}>
          Next ›
        </button>
      </footer>
      {selection && !chatFor && (
        <SelectionToolbar
          position={{ x: selection.x, y: selection.y }}
          onHighlight={addHighlight}
          onComment={() => {
            setPending({ text: selection.text, page: selection.page });
            setPanelOpen(true);
            clearSelection();
          }}
          onDefine={lookUp}
          onAIChat={() => {
            setChatFor({ text: selection.text, x: selection.x, y: selection.y });
            setSelection(null);
          }}
          onDismiss={clearSelection}
        />
      )}

      {chatFor && (
        <AIChatPanel
          selectedText={chatFor.text}
          position={{ x: chatFor.x, y: chatFor.y }}
          onClose={() => setChatFor(null)}
        />
      )}

      {notice && (
        <div style={noticeStyle} onClick={() => setNotice(null)}>
          {notice}
        </div>
      )}

      {define && (
        <div
          style={{
            ...definition,
            left: Math.min(Math.max(define.x - 140, 12), viewport.w - 292),
            top: Math.max(define.y - 130, 12),
          }}
          onClick={() => setDefine(null)}
        >
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {define.word}
            {define.phonetic && (
              <span style={{ opacity: 0.55, fontWeight: 400 }}> {define.phonetic}</span>
            )}
          </div>
          {define.partOfSpeech && (
            <div style={{ fontStyle: "italic", opacity: 0.6, fontSize: 11, margin: "2px 0 6px" }}>
              {define.partOfSpeech}
            </div>
          )}
          <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{define.definition}</div>
        </div>
      )}
    </main>
  );
}

/**
 * Wraps any highlighted phrases found in a paragraph.
 *
 * Highlights are anchored to the words rather than to a rectangle, so they
 * survive the text being re-broken into different pages at a different size —
 * which a set of coordinates on a PDF page could not.
 */
function withMarks(
  text: string,
  marks: [string, Annotation][],
  onOpen: (a: Annotation) => void
): React.ReactNode {
  const hit = marks.find(([quote]) => text.includes(quote));
  if (!hit) return text;

  const [quote, annotation] = hit;
  const at = text.indexOf(quote);
  const hasComment = Boolean(annotation.comment);

  return (
    <>
      {withMarks(text.slice(0, at), marks, onOpen)}
      <mark
        onClick={(e) => {
          e.stopPropagation();
          onOpen(annotation);
        }}
        style={{
          background: annotation.color || "#ffd97a",
          color: "inherit",
          borderRadius: 2,
          padding: "0 1px",
          cursor: hasComment ? "pointer" : "text",
          // A commented passage is marked as well as coloured, so it can be
          // told apart from a plain highlight without hovering it.
          borderBottom: hasComment ? "2px solid rgba(90,50,10,0.55)" : "none",
          boxDecorationBreak: "clone",
          WebkitBoxDecorationBreak: "clone",
        }}
      >
        {quote}
      </mark>
      {withMarks(text.slice(at + quote.length), marks, onOpen)}
    </>
  );
}

/** "Mary Shelley" → "Shelley". A shelf goes by surnames. */
function surname(author?: string | null) {
  const parts = (author ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

/**
 * Headings pulled out of a PDF are often just the book's own title shouted on
 * the half-title page, which tells the reader nothing they can't already see.
 */
function meaningfulChapter(chapter: string | null, title: string) {
  if (!chapter) return "";
  const plain = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const c = plain(chapter);
  const t = plain(title);
  if (!c || c === t || t.includes(c) || c.includes(t)) return "";
  return chapter;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ ...shell, alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "rgba(255,228,192,0.8)", fontFamily: "system-ui" }}>
        {children}
      </div>
    </main>
  );
}

/* ---- Type ---- */

const PAPER = "#f6efe2";
const INK = "#231d15";

const shell: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  background: "#100a03",
};

/**
 * One rule across the top, with everything on it.
 *
 * Each control used to be its own outlined pill, so the bar read as a row of
 * separate buttons that happened to be near each other. They share a surface
 * now and are parted by hairlines, which is what makes it read as a single bar.
 */
/**
 * One rule across the top, with everything on it.
 *
 * Each control used to be its own outlined pill, so the bar read as a row of
 * separate buttons that happened to be near each other. They share a surface
 * now, spaced evenly, with the book's name centred on the bar rather than
 * pushed off-centre by whatever sits either side of it.
 */
const UI_FONT = 'ui-sans-serif, system-ui, "Segoe UI", -apple-system, sans-serif';
const UI_SIZE = 14;

const bar: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  height: 56,
  padding: "0 12px",
  background: "rgba(20,13,4,0.97)",
  borderBottom: "1px solid rgba(255,218,150,0.16)",
  // Set once here so every control on the bar inherits it, rather than each
  // repeating the family and being one restyle away from drifting apart.
  fontFamily: UI_FONT,
  fontSize: UI_SIZE,
  zIndex: 3,
};

const barRight: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const barItem: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  height: 32,
  padding: "0 13px",
  background: "none",
  border: "none",
  borderRadius: 7,
  color: "rgba(255,228,192,0.72)",
  cursor: "pointer",
  fontFamily: UI_FONT,
  fontSize: UI_SIZE,
  textDecoration: "none",
  whiteSpace: "nowrap",
  transition: "background 140ms, color 140ms",
};

/** Taken out of the flow so it centres on the bar, not on the space left over. */
const titleBlock: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
  display: "flex",
  alignItems: "baseline",
  gap: 9,
  maxWidth: "44%",
  pointerEvents: "none",
};

const barTitle: React.CSSProperties = {
  color: "#ffe8c0",
  fontFamily: UI_FONT,
  fontSize: 18,
  fontWeight: 600,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const barSub: React.CSSProperties = {
  color: "rgba(255,220,160,0.55)",
  fontFamily: UI_FONT,
  fontSize: 15,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

/**
 * One switch that flips between a single leaf and a spread.
 *
 * The numbers are laid out by the flexbox rather than by hand, and the knob is
 * exactly half the track's inner width, so both halves land on whole pixels.
 * Sized by hand it was a 22px knob travelling 22px inside a 50px track, which
 * left each numeral a pixel off its own centre.
 */
const TOGGLE_HALF = 27;
const TOGGLE_INSET = 2;

const toggleTrack: React.CSSProperties = {
  position: "relative",
  display: "inline-flex",
  alignItems: "stretch",
  boxSizing: "border-box",
  width: TOGGLE_HALF * 2 + TOGGLE_INSET * 2 + 2, // halves + inset + border
  height: 28,
  padding: TOGGLE_INSET,
  border: "1px solid rgba(255,218,150,0.22)",
  borderRadius: 999,
  background: "rgba(255,228,192,0.05)",
  cursor: "pointer",
};

const toggleKnob: React.CSSProperties = {
  position: "absolute",
  left: TOGGLE_INSET,
  top: TOGGLE_INSET,
  width: TOGGLE_HALF,
  bottom: TOGGLE_INSET,
  borderRadius: 999,
  background: "rgba(255,200,120,0.9)",
  transition: "transform 160ms ease-out",
};

const toggleFace: React.CSSProperties = {
  position: "relative",
  flex: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: UI_FONT,
  fontSize: UI_SIZE,
  fontWeight: 600,
  lineHeight: 1,
  transition: "color 160ms",
};

const progressTrack: React.CSSProperties = {
  height: 2,
  background: "rgba(255,218,150,0.12)",
  zIndex: 3,
};

const progressFill: React.CSSProperties = {
  height: "100%",
  background: "linear-gradient(90deg, rgba(255,190,90,0.7), rgba(255,225,170,0.95))",
  transition: "width 200ms ease-out",
};

const contents: React.CSSProperties = {
  position: "absolute",
  top: 58,
  right: 20,
  zIndex: 5,
  width: 300,
  maxHeight: "62vh",
  overflowY: "auto",
  background: "rgba(24,16,6,0.98)",
  border: "1px solid rgba(255,218,150,0.24)",
  borderRadius: 12,
  padding: 8,
  boxShadow: "0 18px 50px rgba(0,0,0,0.5)",
};

const contentsItem: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  width: "100%",
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: "system-ui",
  fontSize: 12.5,
  padding: "8px 10px",
  textAlign: "left",
};

const desk: React.CSSProperties = {
  position: "relative",
  flex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

const sheet: React.CSSProperties = {
  position: "relative",
  boxSizing: "border-box",
  background: PAPER,
  color: INK,
  borderRadius: 3,
  boxShadow: "0 18px 50px rgba(0,0,0,0.5), 0 2px 5px rgba(0,0,0,0.35)",
  fontFamily: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  lineHeight: 1.72,
  overflow: "hidden",
};

const chapterHeading: React.CSSProperties = {
  fontSize: "0.8em",
  fontWeight: 600,
  letterSpacing: 1.6,
  textTransform: "uppercase",
  margin: "0 0 1.2em",
  opacity: 0.72,
};

const paragraph: React.CSSProperties = {
  margin: "0 0 1.1em",
  textAlign: "justify",
  hyphens: "auto",
  // Contents pages carry dot leaders — runs of punctuation with no space in
  // them — which would otherwise sail off the edge of the sheet.
  overflowWrap: "anywhere",
};

const folio: React.CSSProperties = {
  position: "absolute",
  bottom: 18,
  left: 0,
  right: 0,
  textAlign: "center",
  fontFamily: "system-ui",
  fontSize: 10.5,
  opacity: 0.34,
  userSelect: "none",
};

const footer: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 18,
  padding: "10px 20px 16px",
  zIndex: 3,
};

const noticeStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 68,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 70,
  background: "rgba(60,20,10,0.95)",
  border: "1px solid rgba(255,170,140,0.45)",
  borderRadius: 8,
  color: "#ffd9c8",
  cursor: "pointer",
  fontFamily: "system-ui",
  fontSize: 12,
  padding: "8px 14px",
};

const definition: React.CSSProperties = {
  position: "fixed",
  zIndex: 60,
  width: 280,
  background: "rgba(24,16,6,0.98)",
  border: "1px solid rgba(255,218,150,0.28)",
  borderRadius: 10,
  color: "#ffe8c0",
  cursor: "pointer",
  fontFamily: "system-ui",
  padding: "12px 14px",
  boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
};

/** Matches the bar's controls, so the two ends of the reader agree. */
const stepButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 32,
  padding: "0 16px",
  background: "rgba(255,228,192,0.05)",
  border: "1px solid rgba(255,218,150,0.2)",
  borderRadius: 7,
  color: "#ffe8c0",
  cursor: "pointer",
  fontFamily: UI_FONT,
  fontSize: UI_SIZE,
  whiteSpace: "nowrap",
};

const counter: React.CSSProperties = {
  color: "rgba(255,220,160,0.6)",
  fontFamily: UI_FONT,
  fontSize: UI_SIZE,
  minWidth: 110,
  textAlign: "center",
};
