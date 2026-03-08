"use client";

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { useAuth } from "@/lib/AuthContext";
import { loadAnnotations, saveAnnotation, deleteAnnotation, deleteAnnotations } from "@/lib/annotations";
import { loadReplies, saveReply, deleteReply, Reply } from "@/lib/replies";
import CommentModal from "./CommentModal";
import AnnotationPopover from "./AnnotationPopover";
import SelectionToolbar from "./SelectionToolbar";
import AIChatPanel from "./AIChatPanel";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Point = { x: number; y: number };
type PageBaseSize = { w: number; h: number };
type RenderSize = { w: number; h: number };

// Normalized rects (0..1) relative to the fixed page wrapper
type Rect = { x: number; y: number; w: number; h: number };
type HighlightData = { rects: Rect[]; selectedText: string; color?: string };

interface Annotation {
  id: string;
  pageNumber: number;
  type: "highlight" | "pen" | "text";
  data: any; // highlight -> HighlightData, pen -> Point[], text -> { position: Point, selectedText: string }
  comment?: string;
  color?: string;
  userId?: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
}

interface PDFViewerProps {
  pdfUrl: string;
  bookId: string;
  title: string;
  author: string | null;
}

export default function PDFViewer({ pdfUrl, bookId, title, author }: PDFViewerProps) {
  const { user } = useAuth();
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);

  // Lock the rendered page size once so the "page container" never changes.
  const [pageBase, setPageBase] = useState<PageBaseSize | null>(null); // PDF page size at scale=1
  const [renderSize, setRenderSize] = useState<RenderSize | null>(null); // Fixed container size in CSS px

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Selection toolbar state
  const [selectionToolbarPos, setSelectionToolbarPos] = useState<{ x: number; y: number } | null>(null);

  // Define feature state
  const [defineResult, setDefineResult] = useState<{ word: string; phonetic?: string; definition: string; partOfSpeech?: string } | null>(null);
  const [defineLoading, setDefineLoading] = useState(false);
  const [definePos, setDefinePos] = useState<{ x: number; y: number } | null>(null);

  // AI Chat state
  const [aiChatPos, setAiChatPos] = useState<{ x: number; y: number } | null>(null);
  const [aiChatText, setAiChatText] = useState<string>("");

  // Sidebar page — can differ from current PDF page
  const [sidebarPage, setSidebarPage] = useState(1);
  // Two-page view
  const [twoPageView, setTwoPageView] = useState(false);
  const rightPageWrapRef = useRef<HTMLDivElement>(null);

  // Stores captured selection data so it survives after the DOM selection is cleared
  // pageNum records which page the selection was on (important in two-page mode)
  const pendingHighlightRef = useRef<{ rects: Rect[]; text: string; pageNum: number } | null>(null);

  // selectedText is what the modal displays / we store on annotation
  const [selectedText, setSelectedText] = useState<string>("");
  // Ref keeps the last non-empty selection so it doesn't get wiped when clicking buttons
  const selectedTextRef = useRef<string>("");

  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentPosition, setCommentPosition] = useState<Point | null>(null);
  const [commentVisibility, setCommentVisibility] = useState<'public' | 'private'>('public');

  // Comment sidebar state
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [commentSidebarOpen, setCommentSidebarOpen] = useState(true);
  const [sidebarHover, setSidebarHover] = useState(false);

  // Reply state
  const [replies, setReplies] = useState<{ [annotationId: string]: Reply[] }>({});
  const [showReplyInput, setShowReplyInput] = useState<string | null>(null); // annotation ID or reply ID
  const [replyText, setReplyText] = useState("");
  const [replyAnonymous, setReplyAnonymous] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ type: 'annotation' | 'reply', id: string, parentReplyId?: string } | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageWrapRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  // Stores the page-relative position of the selection center for placing comment markers
  const selectionPagePosRef = useRef<Point | null>(null);

  // Resolve URL: absolute URLs pass through; otherwise assume Supabase Storage public bucket
  const resolvedPdfUrl = useMemo(() => {
    if (pdfUrl.startsWith("http://") || pdfUrl.startsWith("https://")) return pdfUrl;

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const filename = pdfUrl.replace(/^\/+/, "");

    // NOTE: if your bucket is NOT "books", change it here.
    return `${SUPABASE_URL}/storage/v1/object/public/books/${encodeURIComponent(filename)}`;
  }, [pdfUrl]);

  // Reset on URL change
  useEffect(() => {
    setLoadErr(null);
    setPageNumber(1);
    setPageBase(null);
    setRenderSize(null);
  }, [resolvedPdfUrl]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  // Load annotations from database
  useEffect(() => {
    if (!user) {
      setAnnotations([]);
      return;
    }

    loadAnnotations(bookId).then((data) => {
      setAnnotations(data);
    });
  }, [bookId, user]);

  // --- Fixed page container sizing (fits screen height once, never changes after init) ---
  const computeAndLockRenderSize = useCallback(
    (base: PageBaseSize) => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      const pad = 64;
      const availW = Math.max(1, viewer.clientWidth - pad);
      const availH = Math.max(1, viewer.clientHeight - pad);

      // In two-page mode each page gets half the width (minus gap between pages)
      const effectiveW = twoPageView ? (availW - 16) / 2 : availW;
      const fit = Math.min(effectiveW / base.w, availH / base.h);

      setRenderSize({ w: Math.floor(base.w * fit), h: Math.floor(base.h * fit) });
    },
    [twoPageView]
  );

  // Called when the PDF page itself loads (we can read its natural size at scale 1)
  const onPageLoadSuccess = useCallback(
    (page: any) => {
      const viewport = page.getViewport({ scale: 1 });
      const base = { w: viewport.width, h: viewport.height };

      if (!pageBase) {
        setPageBase(base);
      }

      // Always recalculate to ensure proper sizing with current viewport
      computeAndLockRenderSize(base);
    },
    [pageBase, computeAndLockRenderSize]
  );

  // Ensure we compute once after layout (viewerRef has dimensions)
  useLayoutEffect(() => {
    if (pageBase) {
      // Add a small delay to ensure navbar has rendered
      setTimeout(() => {
        computeAndLockRenderSize(pageBase);
      }, 100);
    }
  }, [pageBase, computeAndLockRenderSize]);

  const syncCanvasToPage = () => {
    const canvas = canvasRef.current;
    const wrap = pageWrapRef.current;
    if (!canvas || !wrap) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(wrap.clientWidth));
    const h = Math.max(1, Math.floor(wrap.clientHeight));

    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);

    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  useLayoutEffect(() => {
    syncCanvasToPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, renderSize?.w, renderSize?.h]);

  // --- SELECTION → toolbar ---
  // On mouseup, detect which page wrapper the selection is in, capture it, show toolbar
  useEffect(() => {
    const handleMouseUp = () => {
      if (showCommentModal) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) { setSelectionToolbarPos(null); return; }

      const text = (sel.toString() || "").trim();
      if (!text) { setSelectionToolbarPos(null); return; }

      const range = sel.getRangeAt(0);
      const common = range.commonAncestorContainer;
      const commonEl =
        common.nodeType === 1 ? (common as Element) : (common.parentElement as Element | null);
      if (!commonEl) { setSelectionToolbarPos(null); return; }

      // Determine which page wrapper (and thus which page number) the selection is in
      let wrap: HTMLDivElement | null = null;
      let selPageNum = pageNumber;
      if (pageWrapRef.current?.contains(commonEl)) {
        wrap = pageWrapRef.current;
        selPageNum = pageNumber;
      } else if (rightPageWrapRef.current?.contains(commonEl)) {
        wrap = rightPageWrapRef.current;
        selPageNum = pageNumber + 1;
      }
      if (!wrap) { setSelectionToolbarPos(null); return; }

      const wrapRect = wrap.getBoundingClientRect();
      const rects: Rect[] = Array.from(range.getClientRects())
        .map((r) => ({
          x: (r.left - wrapRect.left) / wrapRect.width,
          y: (r.top - wrapRect.top) / wrapRect.height,
          w: r.width / wrapRect.width,
          h: r.height / wrapRect.height,
        }))
        .filter((r) => r.w > 0.002 && r.h > 0.002)
        .map((r) => ({
          x: Math.max(0, Math.min(1, r.x)),
          y: Math.max(0, Math.min(1, r.y)),
          w: Math.max(0, Math.min(1, r.w)),
          h: Math.max(0, Math.min(1, r.h)),
        }));

      if (rects.length === 0) return;

      pendingHighlightRef.current = { rects, text, pageNum: selPageNum };
      selectedTextRef.current = text;
      setSelectedText(text);

      const selBounds = range.getBoundingClientRect();
      selectionPagePosRef.current = {
        x: selBounds.left - wrapRect.left + selBounds.width / 2,
        y: selBounds.top - wrapRect.top + selBounds.height / 2,
      };

      setSelectionToolbarPos({
        x: selBounds.left + selBounds.width / 2,
        y: selBounds.top,
      });
    };

    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [showCommentModal, pageNumber]);

  // Apply a highlight with the chosen color from the selection toolbar
  const applyHighlight = useCallback(
    (color: string) => {
      const pending = pendingHighlightRef.current;
      if (!pending) return;
      if (!user) { alert("Please sign in to save highlights."); return; }

      const rectsOverlap = (r1: Rect, r2: Rect) =>
        !(r1.x + r1.w < r2.x || r2.x + r2.w < r1.x || r1.y + r1.h < r2.y || r2.y + r2.h < r1.y);

      const overlappingIds: string[] = [];
      annotations.forEach((annotation) => {
        if (annotation.type !== "highlight" || annotation.pageNumber !== pending.pageNum) return;
        const existingRects = (annotation.data as HighlightData)?.rects || [];
        for (const er of existingRects) {
          for (const nr of pending.rects) {
            if (rectsOverlap(er, nr)) { overlappingIds.push(annotation.id); return; }
          }
        }
      });

      if (overlappingIds.length > 0) {
        deleteAnnotations(overlappingIds).then((ok) => {
          if (ok) setAnnotations((prev) => prev.filter((a) => !overlappingIds.includes(a.id)));
        });
      }

      saveAnnotation(bookId, {
        pageNumber: pending.pageNum,
        type: "highlight",
        data: { rects: pending.rects, selectedText: pending.text, color },
        color,
      }).then((saved) => {
        if (saved) setAnnotations((prev) => [...prev, saved]);
      });

      pendingHighlightRef.current = null;
      setSelectionToolbarPos(null);
      try { window.getSelection()?.removeAllRanges(); } catch { /* ignore */ }
    },
    [user, annotations, bookId]
  );

  // --- PEN drawing only (canvas) ---
  const redrawPenAnnotations = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // canvas is DPR-scaled; we use CSS px coordinates, transform is already set in syncCanvasToPage()
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pageAnnotations = annotations.filter((a) => a.pageNumber === pageNumber);
    for (const a of pageAnnotations) {
      if (a.type !== "pen") continue;
      const pts = a.data as Point[];
      if (!pts?.length) continue;

      ctx.beginPath();
      ctx.strokeStyle = "#FF6B6B";
      ctx.lineWidth = 2;
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  };

  useEffect(() => {
    redrawPenAnnotations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annotations, pageNumber]);

  const changePage = (offset: number) => {
    try { window.getSelection()?.removeAllRanges(); } catch { /* ignore */ }
    setSelectionToolbarPos(null);
    setDefineResult(null);
    setDefinePos(null);
    setAiChatPos(null);
    pendingHighlightRef.current = null;
    setPageNumber((prev) => Math.max(1, Math.min(prev + offset, numPages || 1)));
  };

  const handleAddComment = () => {
    const text = selectedTextRef.current || selectedText;
    if (!text.trim()) return;

    setCommentPosition(selectionPagePosRef.current ?? { x: 40, y: 40 });
    setSelectionToolbarPos(null);
    setShowCommentModal(true);
  };

  const handleAIChat = () => {
    const text = (selectedTextRef.current || selectedText).trim();
    if (!text) return;
    setAiChatText(text);
    setAiChatPos(selectionToolbarPos);
    setSelectionToolbarPos(null);
    try { window.getSelection()?.removeAllRanges(); } catch { /* ignore */ }
  };

  const handleDefine = async () => {
    const text = (selectedTextRef.current || selectedText).trim();
    if (!text) return;

    // Use first word only for multi-word selections
    const word = text.split(/\s+/)[0].replace(/[^a-zA-Z'-]/g, "");
    if (!word) return;

    setDefinePos(selectionToolbarPos);
    setDefineLoading(true);
    setDefineResult(null);

    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      const entry = data[0];
      const meaning = entry?.meanings?.[0];
      const def = meaning?.definitions?.[0]?.definition;
      setDefineResult({
        word: entry?.word ?? word,
        phonetic: entry?.phonetic,
        partOfSpeech: meaning?.partOfSpeech,
        definition: def ?? "No definition found.",
      });
    } catch {
      setDefineResult({ word, definition: "No definition found." });
    } finally {
      setDefineLoading(false);
    }
  };

  const saveComment = () => {
    if (!commentText.trim() || !commentPosition) return;
    if (!user) { alert("Please sign in to save comments."); return; }

    const frozenText = (selectedTextRef.current || selectedText || "").trim();
    const targetPage = pendingHighlightRef.current?.pageNum ?? pageNumber;

    saveAnnotation(bookId, {
      pageNumber: targetPage,
      type: "text",
      data: { position: commentPosition, selectedText: frozenText },
      comment: commentText.trim(),
      visibility: commentVisibility,
    }).then((saved) => {
      if (saved) {
        setAnnotations((prev) => [...prev, saved]);
      }
    });
    setShowCommentModal(false);
    setCommentText("");
    setCommentVisibility('public');
    setSelectedText("");
    selectedTextRef.current = "";
    setCommentPosition(null);
  };

  const textAnnotations = useMemo(
    () => annotations.filter((a) => a.type === "text" && a.pageNumber === pageNumber),
    [annotations, pageNumber]
  );

  const highlightAnnotations = useMemo(
    () => annotations.filter((a) => a.type === "highlight" && a.pageNumber === pageNumber),
    [annotations, pageNumber]
  );

  // Sync sidebar page with PDF page turns
  useEffect(() => { setSidebarPage(pageNumber); }, [pageNumber]);

  // Annotations shown in the sidebar list (independent of PDF page)
  const sidebarAnnotations = useMemo(
    () => annotations.filter((a) => a.type === "text" && a.pageNumber === sidebarPage),
    [annotations, sidebarPage]
  );

  // Right-page annotations (two-page mode)
  const textAnnotationsRight = useMemo(
    () => annotations.filter((a) => a.type === "text" && a.pageNumber === pageNumber + 1),
    [annotations, pageNumber]
  );
  const highlightAnnotationsRight = useMemo(
    () => annotations.filter((a) => a.type === "highlight" && a.pageNumber === pageNumber + 1),
    [annotations, pageNumber]
  );

  // Load replies for an annotation
  const loadAnnotationReplies = async (annotationId: string) => {
    const annotationReplies = await loadReplies(annotationId);
    setReplies((prev) => ({ ...prev, [annotationId]: annotationReplies }));
  };

  // Handle submitting a reply
  const handleSubmitReply = async (annotationId: string) => {
    if (!replyText.trim() || !user || !replyingTo) return;

    const parentReplyId = replyingTo.type === 'reply' ? replyingTo.parentReplyId : undefined;
    const newReply = await saveReply(annotationId, replyText.trim(), replyAnonymous, parentReplyId);
    if (newReply) {
      setReplies((prev) => ({
        ...prev,
        [annotationId]: [...(prev[annotationId] || []), newReply],
      }));
      setReplyText("");
      setReplyAnonymous(false);
      setShowReplyInput(null);
      setReplyingTo(null);
    }
  };

  // Toggle expanded state for comments
  const toggleCommentExpanded = (annotationId: string) => {
    const newExpanded = new Set(expandedComments);
    if (newExpanded.has(annotationId)) {
      newExpanded.delete(annotationId);
    } else {
      newExpanded.add(annotationId);
      // Load replies when expanding if not already loaded
      if (!replies[annotationId]) {
        loadAnnotationReplies(annotationId);
      }
    }
    setExpandedComments(newExpanded);
  };

  return (
    <div
      className="flex h-screen flex-col"
      style={{
        background: "#061209"
      }}
    >
      {/* Dark Green Navbar */}
      <nav
        className="w-full z-50 flex items-center justify-between px-8"
        style={{
          background: "#1a3d2e",
          boxShadow: "inset 0 0 20px rgba(100, 255, 150, 0.15), 0 2px 24px rgba(0, 0, 0, 0.6), 0 4px 80px 10px rgba(100, 255, 150, 0.12)",
          padding: "12px 32px",
          borderBottom: "1px solid rgba(100, 255, 150, 0.15)",
        }}
      >
        {/* Left Side - Logo */}
        <div className="flex items-center">
          <a href="/" className="flex items-center gap-2">
            <div
              style={{
                width: "32px",
                height: "32px",
                background: "rgba(100, 255, 150, 0.2)",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#64FF96",
                fontWeight: "bold",
                fontSize: "18px",
              }}
            >
              U
            </div>
            <span
              style={{
                color: "#ffffff",
                fontWeight: 600,
                fontSize: "16px",
                letterSpacing: "-0.02em",
              }}
            >
              UNIVAULT
            </span>
          </a>
        </div>

        {/* Center - Book Title */}
        <div
          style={{
            color: "#ffffff",
            fontSize: "14px",
            letterSpacing: "-0.01em",
          }}
        >
          <span style={{ fontWeight: 700 }}>{title}</span>
          {author && (
            <>
              <span style={{ margin: "0 8px", fontWeight: 700 }}>—</span>
              <span style={{ fontWeight: 700 }}>{author}</span>
            </>
          )}
        </div>

        {/* Right Side — two-page toggle + back link */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setTwoPageView((v) => !v)}
            title={twoPageView ? "Single page" : "Two pages"}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "6px 10px",
              borderRadius: "8px",
              background: twoPageView ? "rgba(100,255,150,0.18)" : "rgba(255,255,255,0.08)",
              border: `1px solid ${twoPageView ? "rgba(100,255,150,0.4)" : "rgba(255,255,255,0.2)"}`,
              color: twoPageView ? "#64FF96" : "rgba(255,255,255,0.7)",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {twoPageView ? (
              /* Single page icon */
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="0.5" y="0.5" width="13" height="13" rx="1" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            ) : (
              /* Two-page icon */
              <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
                <rect x="0.5" y="0.5" width="8" height="13" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <rect x="11.5" y="0.5" width="8" height="13" rx="1" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            )}
          </button>
          <a
            href="/library"
            className="px-4 py-2 text-white hover:text-green-200 transition-all duration-200"
            style={{ fontSize: "14px", fontWeight: 500, letterSpacing: "-0.01em" }}
          >
            ← Library
          </a>
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden" style={{ position: "relative" }}>
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* PDF Viewer */}
        <div
          ref={viewerRef}
          className="flex-1 flex items-center justify-center overflow-auto"
          style={{ padding: "32px" }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: twoPageView ? "16px" : "0" }}>

            {/* ── Left / single page ── */}
            <div
              ref={pageWrapRef}
              className="relative bg-white"
              style={{
                width: renderSize ? `${renderSize.w}px` : "auto",
                height: renderSize ? `${renderSize.h}px` : "auto",
                borderRadius: "10px",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 8px 40px rgba(0,0,0,0.8), 0 0 80px rgba(100,255,150,0.08)",
                overflow: "hidden",
              }}
            >
              {loadErr && <div className="p-4 text-sm text-red-600 break-all border-b">{loadErr}</div>}
              <Document
                key={resolvedPdfUrl}
                file={resolvedPdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={(err) => setLoadErr(`PDF load error: ${String(err)}`)}
                onSourceError={(err) => setLoadErr(`PDF source error: ${String(err)}`)}
                loading={<div className="flex items-center justify-center h-[60vh] w-[40vw]"><div className="text-gray-500">Loading PDF...</div></div>}
                error={<div className="flex items-center justify-center h-[60vh] w-[40vw]"><div className="text-red-500">Error loading PDF.</div></div>}
              >
                <Page pageNumber={pageNumber} width={renderSize?.w} renderTextLayer renderAnnotationLayer onLoadSuccess={onPageLoadSuccess} onRenderSuccess={() => syncCanvasToPage()} />
              </Document>

              {/* Highlights */}
              <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 6 }}>
                {highlightAnnotations.flatMap((a) => {
                  const data = a.data as HighlightData;
                  const color = a.color || data?.color || "rgba(255,235,59,0.50)";
                  return (data?.rects || []).map((r, i) => (
                    <div key={`${a.id}-${i}`} className="absolute rounded-sm cursor-pointer hover:opacity-75 transition-opacity pointer-events-auto"
                      style={{ left: `${r.x*100}%`, top: `${r.y*100}%`, width: `${r.w*100}%`, height: `${r.h*100}%`, background: color }}
                      title={data?.selectedText ? `Click to delete: "${data.selectedText}"` : "Click to delete"}
                      onClick={(e) => { e.stopPropagation(); if (user) deleteAnnotation(a.id).then((ok) => { if (ok) setAnnotations((p) => p.filter((x) => x.id !== a.id)); }); }}
                    />
                  ));
                })}
              </div>

              {/* Pen canvas */}
              <canvas ref={canvasRef} className="absolute inset-0" style={{ zIndex: 7, pointerEvents: "none" }} />

              {/* Comment markers */}
              {textAnnotations.map((annotation, index) => (
                <div key={annotation.id}
                  className="absolute bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold cursor-pointer hover:bg-purple-700 shadow-lg"
                  style={{ left: annotation.data?.position?.x ?? 0, top: annotation.data?.position?.y ?? 0, transform: "translate(-50%,-50%)", zIndex: 10 }}
                  title={`Comment ${index + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveAnnotationId(annotation.id);
                    setCommentSidebarOpen(true);
                    if (!replies[annotation.id]) loadAnnotationReplies(annotation.id);
                  }}
                >{index + 1}</div>
              ))}

              {/* Navigation zones — left edge back, right edge forward (only in single-page or as fallback) */}
              {pageNumber > 1 && (
                <div className="absolute left-0 top-0 bottom-0" style={{ width: "8%", zIndex: 15, cursor: "w-resize", userSelect: "none" }} onMouseDown={(e) => e.preventDefault()} onClick={() => changePage(twoPageView ? -2 : -1)} />
              )}
              {(!twoPageView || pageNumber + 1 > numPages) && pageNumber < numPages && (
                <div className="absolute right-0 top-0 bottom-0" style={{ width: "8%", zIndex: 15, cursor: "e-resize", userSelect: "none" }} onMouseDown={(e) => e.preventDefault()} onClick={() => changePage(twoPageView ? 2 : 1)} />
              )}
            </div>

            {/* ── Right page (two-page mode) ── */}
            {twoPageView && pageNumber + 1 <= numPages && (
              <div
                ref={rightPageWrapRef}
                className="relative bg-white"
                style={{
                  width: renderSize ? `${renderSize.w}px` : "auto",
                  height: renderSize ? `${renderSize.h}px` : "auto",
                  borderRadius: "10px",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 8px 40px rgba(0,0,0,0.8), 0 0 80px rgba(100,255,150,0.08)",
                  overflow: "hidden",
                }}
              >
                <Document key={resolvedPdfUrl} file={resolvedPdfUrl} onLoadSuccess={() => {}} loading={null} error={null}>
                  <Page pageNumber={pageNumber + 1} width={renderSize?.w} renderTextLayer renderAnnotationLayer />
                </Document>

                {/* Highlights for right page */}
                <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 6 }}>
                  {highlightAnnotationsRight.flatMap((a) => {
                    const data = a.data as HighlightData;
                    const color = a.color || data?.color || "rgba(255,235,59,0.50)";
                    return (data?.rects || []).map((r, i) => (
                      <div key={`${a.id}-${i}`} className="absolute rounded-sm cursor-pointer hover:opacity-75 transition-opacity pointer-events-auto"
                        style={{ left: `${r.x*100}%`, top: `${r.y*100}%`, width: `${r.w*100}%`, height: `${r.h*100}%`, background: color }}
                        title={data?.selectedText ? `Click to delete: "${data.selectedText}"` : "Click to delete"}
                        onClick={(e) => { e.stopPropagation(); if (user) deleteAnnotation(a.id).then((ok) => { if (ok) setAnnotations((p) => p.filter((x) => x.id !== a.id)); }); }}
                      />
                    ));
                  })}
                </div>

                {/* Comment markers for right page */}
                {textAnnotationsRight.map((annotation, index) => (
                  <div key={annotation.id}
                    className="absolute bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold cursor-pointer hover:bg-purple-700 shadow-lg"
                    style={{ left: annotation.data?.position?.x ?? 0, top: annotation.data?.position?.y ?? 0, transform: "translate(-50%,-50%)", zIndex: 10 }}
                    title={`Comment ${index + 1}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveAnnotationId(annotation.id);
                      setCommentSidebarOpen(true);
                      if (!replies[annotation.id]) loadAnnotationReplies(annotation.id);
                    }}
                  >{index + 1}</div>
                ))}

                {/* Right-edge forward navigation */}
                {pageNumber + 1 < numPages && (
                  <div className="absolute right-0 top-0 bottom-0" style={{ width: "8%", zIndex: 15, cursor: "e-resize", userSelect: "none" }} onMouseDown={(e) => e.preventDefault()} onClick={() => changePage(2)} />
                )}
              </div>
            )}

          </div>
        </div>

        {/* Selection Toolbar — appears above selected text */}
        <SelectionToolbar
          position={selectionToolbarPos}
          onHighlight={applyHighlight}
          onComment={handleAddComment}
          onDefine={handleDefine}
          onAIChat={handleAIChat}
          onDismiss={() => {
            setSelectionToolbarPos(null);
            setDefineResult(null);
            setDefinePos(null);
            pendingHighlightRef.current = null;
          }}
        />

        {/* Definition popover */}
        {(defineLoading || defineResult) && definePos && (
          <div
            style={{
              position: "fixed",
              left: Math.max(8, Math.min(definePos.x - 123, window.innerWidth - 308)),
              top: definePos.y + 4,
              width: "300px",
              zIndex: 201,
              background: "rgba(255,255,255,0.98)",
              backdropFilter: "blur(20px)",
              borderRadius: "10px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.08)",
              border: "1px solid rgba(0,0,0,0.08)",
              padding: "14px 16px",
            }}
          >
            <button
              onClick={() => { setDefineResult(null); setDefinePos(null); }}
              style={{
                position: "absolute",
                top: "8px",
                right: "10px",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#aaa",
                fontSize: "14px",
                lineHeight: 1,
              }}
            >✕</button>
            {defineLoading ? (
              <p style={{ color: "#888", fontSize: "13px", margin: 0 }}>Looking up…</p>
            ) : defineResult ? (
              <>
                <p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: "15px", color: "#111" }}>
                  {defineResult.word}
                  {defineResult.phonetic && (
                    <span style={{ fontWeight: 400, color: "#888", fontSize: "12px", marginLeft: "6px" }}>{defineResult.phonetic}</span>
                  )}
                </p>
                {defineResult.partOfSpeech && (
                  <p style={{ margin: "0 0 6px", fontSize: "11px", color: "#3B82F6", fontStyle: "italic" }}>{defineResult.partOfSpeech}</p>
                )}
                <p style={{ margin: 0, fontSize: "13px", color: "#333", lineHeight: 1.5 }}>{defineResult.definition}</p>
              </>
            ) : null}
          </div>
        )}

        {/* AI Chat Panel */}
        <AIChatPanel
          selectedText={aiChatText}
          position={aiChatPos}
          onClose={() => setAiChatPos(null)}
        />

      </div>

        {/* Hover handle — floats at the sidebar boundary */}
        <div
          onMouseEnter={() => setSidebarHover(true)}
          onMouseLeave={() => setSidebarHover(false)}
          onClick={() => setCommentSidebarOpen((v) => !v)}
          style={{
            position: "absolute",
            right: commentSidebarOpen ? "300px" : "0px",
            top: 0,
            bottom: 0,
            width: "28px",
            cursor: "pointer",
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            transition: "right 0.25s ease",
          }}
        >
          <div style={{
            opacity: sidebarHover ? 1 : 0,
            transition: "opacity 0.18s ease",
            background: "rgba(20, 38, 28, 0.92)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRight: "none",
            borderRadius: "6px 0 0 6px",
            width: "20px",
            height: "44px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.75)",
            fontSize: "15px",
            backdropFilter: "blur(8px)",
          }}>
            {commentSidebarOpen ? "›" : "‹"}
          </div>
        </div>

        {/* Comment Sidebar — always present */}
        <div
          style={{
            width: commentSidebarOpen ? "300px" : "0px",
            minWidth: commentSidebarOpen ? "300px" : "0px",
            transition: "width 0.25s ease, min-width 0.25s ease",
            flexShrink: 0,
            background: "rgba(15, 25, 20, 0.97)",
            borderLeft: "1px solid rgba(255,255,255,0.10)",
            overflow: "hidden",
            zIndex: 30,
          }}
        >
          {/* Content — fixed 300px so it clips correctly during transition */}
          <div style={{ width: "300px", height: "100%", overflowY: "auto" }}>
            {activeAnnotationId ? (
              /* Detail view for a selected annotation */
              <>
                <div style={{ padding: "12px 14px 0" }}>
                  <button
                    onClick={() => setActiveAnnotationId(null)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "rgba(255,255,255,0.45)",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontFamily: "'Crimson Text', serif",
                      padding: 0,
                      letterSpacing: "0.02em",
                    }}
                  >
                    ← All comments
                  </button>
                </div>
                <AnnotationPopover
                  asSidebar
                  annotation={annotations.find((a) => a.type === "text" && a.id === activeAnnotationId) ?? null}
                  position={null}
                  replies={replies[activeAnnotationId] || []}
                  expandedComments={expandedComments}
                  showReplyInput={showReplyInput}
                  replyText={replyText}
                  replyAnonymous={replyAnonymous}
                  currentUserId={user?.id}
                  onClose={() => setActiveAnnotationId(null)}
                  onToggleExpanded={toggleCommentExpanded}
                  onReplyClick={(id, type, parentReplyId) => {
                    if (showReplyInput === id) { setShowReplyInput(null); setReplyingTo(null); }
                    else { setShowReplyInput(id); setReplyingTo({ type, id, parentReplyId }); }
                  }}
                  onDeleteAnnotation={(annotationId) => {
                    deleteAnnotation(annotationId).then((success) => {
                      if (success) {
                        setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
                        setActiveAnnotationId(null);
                      }
                    });
                  }}
                  onDeleteReply={(replyId, annotationId) => {
                    deleteReply(replyId).then((success) => {
                      if (success) {
                        setReplies((prev) => ({
                          ...prev,
                          [annotationId]: prev[annotationId].filter((r) => r.id !== replyId),
                        }));
                      }
                    });
                  }}
                  onReplyTextChange={setReplyText}
                  onReplyAnonymousChange={setReplyAnonymous}
                  onSubmitReply={handleSubmitReply}
                />
              </>
            ) : (
              /* List view */
              <div style={{ padding: "16px 14px" }}>

                {/* Header bar */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "10px",
                  padding: "8px 12px",
                  marginBottom: "14px",
                }}>
                  <span style={{
                    color: "rgba(255,255,255,0.35)",
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}>
                    Comments
                  </span>

                  <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "11px" }}>p.</span>
                    <select
                      value={sidebarPage}
                      onChange={(e) => setSidebarPage(Number(e.target.value))}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "rgba(255,255,255,0.75)",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        outline: "none",
                      }}
                    >
                      {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
                        <option key={p} value={p} style={{ background: "#0f1914" }}>{p}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setSidebarPage(pageNumber)}
                      title="Return to current page"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "rgba(255,255,255,0.35)",
                        fontSize: "13px",
                        padding: "0 0 0 2px",
                        lineHeight: 1,
                        flexShrink: 0,
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.85)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.35)")}
                    >↩</button>
                  </div>
                </div>

                {sidebarAnnotations.length === 0 ? (
                  <p style={{
                    color: "rgba(255,255,255,0.25)",
                    fontSize: "13px",
                    fontStyle: "italic",
                    fontFamily: "'Crimson Text', serif",
                  }}>
                    No comments on this page
                  </p>
                ) : (
                  sidebarAnnotations.map((annotation) => (
                    <div
                      key={annotation.id}
                      onClick={() => {
                        setActiveAnnotationId(annotation.id);
                        if (!replies[annotation.id]) loadAnnotationReplies(annotation.id);
                      }}
                      style={{
                        marginBottom: "8px",
                        padding: "10px 12px",
                        borderRadius: "10px",
                        border: "1px solid rgba(255,255,255,0.09)",
                        background: "rgba(255,255,255,0.04)",
                        cursor: "pointer",
                      }}
                    >
                      {/* Author row with avatar */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                        <div style={{
                          width: "24px", height: "24px", borderRadius: "50%",
                          overflow: "hidden", flexShrink: 0,
                          border: "1px solid rgba(255,255,255,0.2)",
                        }}>
                          {annotation.avatarUrl ? (
                            <img src={annotation.avatarUrl} alt={annotation.displayName || annotation.username}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <div style={{
                              width: "100%", height: "100%",
                              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              color: "white", fontSize: "10px", fontWeight: 600,
                            }}>
                              {(annotation.displayName || annotation.username || "A")[0].toUpperCase()}
                            </div>
                          )}
                        </div>
                        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", fontWeight: 500 }}>
                          {annotation.displayName || annotation.username || "Anonymous"}
                        </p>
                      </div>
                      {annotation.data?.selectedText && (
                        <p style={{
                          color: "rgba(255,235,59,0.65)",
                          fontSize: "11px",
                          fontStyle: "italic",
                          fontFamily: "'Crimson Text', serif",
                          marginBottom: "4px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}>
                          &ldquo;{annotation.data.selectedText}&rdquo;
                        </p>
                      )}
                      <p style={{
                        color: "rgba(255,255,255,0.85)",
                        fontSize: "13px",
                        fontFamily: "'Crimson Text', serif",
                      }}>
                        {annotation.comment}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

      {/* Comment Modal */}
      <CommentModal
        show={showCommentModal}
        selectedText={selectedText}
        commentText={commentText}
        visibility={commentVisibility}
        onCommentTextChange={setCommentText}
        onVisibilityChange={setCommentVisibility}
        onSave={saveComment}
        onClose={() => setShowCommentModal(false)}
      />
      </div>
    </div>
  );
}
