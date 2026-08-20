"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type BookText = {
  title: string;
  author: string;
  pageCount: number;
  /** The source page's dimensions, so sheets keep the book's real shape. */
  pageSize?: { width: number; height: number } | null;
  chapters: { title: string; page: number }[];
  pages: { page: number; paragraphs: string[] }[];
};

// Width of a sheet on screen, and the margins printed inside it.
const SHEET_WIDTH = 620;
const SHEET_PADDING = 68;
// Used only for books extracted before page sizes were recorded.
const FALLBACK_ASPECT = 0.72;

type Status = "loading" | "ready" | "missing" | "error";

/**
 * Reads a book as text rather than as pictures of pages.
 *
 * The PDF viewer draws each page to a canvas, so the words are an image: they
 * don't reflow, don't scale with the reader's own type size, and can't be
 * selected or searched by the browser. This sets the extracted text as real
 * type — one measure, continuous, the way a book is actually read.
 *
 * Page numbers are kept as markers down the margin. They are how annotations
 * are anchored, and they're how someone finds a passage again, so losing them
 * to a continuous scroll would cost more than it saved.
 */
export default function BookReader({
  bookId,
  title,
  author,
  onOpenPdf,
}: {
  bookId: string;
  title: string;
  author?: string | null;
  onOpenPdf?: () => void;
}) {
  const [text, setText] = useState<BookText | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [page, setPage] = useState(1);
  const [showContents, setShowContents] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);

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

  /** Chapter headings, keyed by the page they open on. */
  const chapterAt = useMemo(() => {
    const map = new Map<number, string>();
    text?.chapters.forEach((c) => {
      if (!map.has(c.page)) map.set(c.page, c.title);
    });
    return map;
  }, [text]);

  const currentChapter = useMemo(() => {
    if (!text) return null;
    let found: string | null = null;
    for (const c of text.chapters) {
      if (c.page <= page) found = c.title;
      else break;
    }
    return found;
  }, [text, page]);

  // Which page is under the reader's eye, for the progress line and so the
  // contents list can say where they are.
  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const marks = el.querySelectorAll<HTMLElement>("[data-page]");
    const eyeline = el.scrollTop + el.clientHeight * 0.3;
    let seen = 1;
    for (const mark of marks) {
      if (mark.offsetTop <= eyeline) seen = Number(mark.dataset.page);
      else break;
    }
    setPage(seen);
  }, []);

  const goToPage = useCallback((target: number) => {
    const el = scrollerRef.current;
    const mark = el?.querySelector<HTMLElement>(`[data-page="${target}"]`);
    if (el && mark) el.scrollTo({ top: mark.offsetTop - 24, behavior: "smooth" });
    setShowContents(false);
  }, []);

  if (status === "loading") {
    return <Centered>Setting the type…</Centered>;
  }

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
        {onOpenPdf && (
          <button onClick={onOpenPdf} style={linkButton}>
            Read the PDF instead
          </button>
        )}
      </Centered>
    );
  }

  const progress = Math.round((page / Math.max(text.pageCount, 1)) * 100);

  // Sheets take the proportions of the book's own pages.
  const aspect = text.pageSize?.height
    ? text.pageSize.width / text.pageSize.height
    : FALLBACK_ASPECT;
  const sheetHeight = Math.round(SHEET_WIDTH / aspect);

  return (
    <main style={shell}>
      <header style={bar}>
        <a href="/library" style={{ ...linkButton, textDecoration: "none" }}>
          ← Library
        </a>

        <div style={{ textAlign: "center", minWidth: 0 }}>
          <div style={barTitle}>{title}</div>
          <div style={barSub}>
            {currentChapter ?? author ?? ""}
            {currentChapter && author ? ` · ${author}` : ""}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {text.chapters.length > 0 && (
            <button onClick={() => setShowContents((v) => !v)} style={linkButton}>
              Contents
            </button>
          )}
          {onOpenPdf && (
            <button onClick={onOpenPdf} style={linkButton}>
              PDF
            </button>
          )}
        </div>
      </header>

      <div style={{ ...progressTrack }}>
        <div style={{ ...progressFill, width: `${progress}%` }} />
      </div>

      {showContents && (
        <nav style={contents}>
          {text.chapters.map((c) => (
            <button
              key={`${c.title}-${c.page}`}
              onClick={() => goToPage(c.page)}
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

      <div ref={scrollerRef} onScroll={onScroll} style={scroller}>
        <article style={stack}>
          {/* A title page, so the book opens the way a book does. */}
          <section style={{ ...sheet, minHeight: sheetHeight, ...titleSheet }}>
            <h1 style={bookTitle}>{title}</h1>
            {author && <p style={bookAuthor}>{author}</p>}
          </section>

          {text.pages.map((p) => {
            const heading = chapterAt.get(p.page);
            return (
              <section
                key={p.page}
                data-page={p.page}
                style={{ ...sheet, minHeight: sheetHeight }}
              >
                {heading && <h2 style={chapterHeading}>{heading}</h2>}
                {p.paragraphs.map((para, i) => (
                  <p key={i} style={paragraph}>
                    {para}
                  </p>
                ))}
                {/* The page's own number, where a printed book puts it. A sheet
                    grows rather than clipping if reflowed text runs long, so
                    nothing is ever hidden to keep the shape. */}
                <span aria-hidden style={folio}>
                  {p.page}
                </span>
              </section>
            );
          })}

          <footer style={endMark}>{text.pageCount} pages · end</footer>
        </article>
      </div>
    </main>
  );
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

/* ---- Type ----
 * A single measure of about 66 characters, set in a serif at a comfortable
 * size, on warm paper. These are the numbers that decide whether a page is
 * pleasant to read for an hour, so they are here rather than scattered. */

const PAPER = "#f6efe2";
const INK = "#231d15";

const shell: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  background: "#140d04",
};

const bar: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  gap: 16,
  padding: "12px 20px",
  background: "rgba(20,13,4,0.96)",
  borderBottom: "1px solid rgba(255,218,150,0.16)",
  zIndex: 3,
};

const barTitle: React.CSSProperties = {
  color: "#ffe8c0",
  fontFamily: "system-ui",
  fontSize: 14,
  fontWeight: 600,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const barSub: React.CSSProperties = {
  color: "rgba(255,220,160,0.55)",
  fontFamily: "system-ui",
  fontSize: 11,
  letterSpacing: 0.4,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const linkButton: React.CSSProperties = {
  background: "none",
  border: "1px solid rgba(255,218,150,0.28)",
  borderRadius: 999,
  color: "#ffe8c0",
  cursor: "pointer",
  fontFamily: "system-ui",
  fontSize: 12,
  padding: "6px 13px",
  whiteSpace: "nowrap",
};

const progressTrack: React.CSSProperties = {
  height: 2,
  background: "rgba(255,218,150,0.12)",
  zIndex: 3,
};

const progressFill: React.CSSProperties = {
  height: "100%",
  background: "linear-gradient(90deg, rgba(255,190,90,0.7), rgba(255,225,170,0.95))",
  transition: "width 140ms linear",
};

const contents: React.CSSProperties = {
  position: "absolute",
  top: 58,
  right: 20,
  zIndex: 4,
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

const scroller: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  // Sheets sit on a dark surface, the way pages sit on a desk.
  background: "#100a03",
};

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 26,
  padding: "34px 20px 120px",
  color: INK,
  fontFamily: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  fontSize: 19,
  lineHeight: 1.75,
};

/**
 * One page of the book.
 *
 * `minHeight` rather than a fixed height: the shape is what matters, but
 * reflowed text sets to a different depth than the original typesetting did, so
 * a sheet is allowed to run long instead of hiding the overflow.
 */
const sheet: React.CSSProperties = {
  position: "relative",
  width: "100%",
  maxWidth: SHEET_WIDTH,
  boxSizing: "border-box",
  padding: `${SHEET_PADDING}px ${SHEET_PADDING}px ${SHEET_PADDING + 18}px`,
  background: PAPER,
  borderRadius: 3,
  boxShadow: "0 14px 40px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.3)",
  overflow: "hidden",
};

const titleSheet: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
};

const bookTitle: React.CSSProperties = {
  fontSize: 30,
  lineHeight: 1.25,
  margin: "0 0 6px",
  fontWeight: 600,
};

const bookAuthor: React.CSSProperties = {
  margin: "0 0 56px",
  fontSize: 15,
  fontStyle: "italic",
  opacity: 0.62,
};

const chapterHeading: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: 1.6,
  textTransform: "uppercase",
  margin: "58px 0 22px",
  opacity: 0.72,
};

const paragraph: React.CSSProperties = {
  margin: "0 0 1.15em",
  textAlign: "justify",
  hyphens: "auto",
  // Contents pages carry dot leaders — runs of punctuation with no space in
  // them — which would otherwise sail off the edge of the sheet.
  overflowWrap: "anywhere",
};

const folio: React.CSSProperties = {
  position: "absolute",
  bottom: 24,
  left: 0,
  right: 0,
  textAlign: "center",
  fontFamily: "system-ui",
  fontSize: 10.5,
  opacity: 0.32,
  userSelect: "none",
};

const endMark: React.CSSProperties = {
  marginTop: 70,
  textAlign: "center",
  fontFamily: "system-ui",
  fontSize: 11,
  letterSpacing: 2,
  textTransform: "uppercase",
  opacity: 0.4,
};
