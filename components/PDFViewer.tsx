"use client";

import React, {
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
import Toolbar from "./Toolbar";
import ColorPicker from "./ColorPicker";
import CommentModal from "./CommentModal";
import AnnotationsSidebar from "./AnnotationsSidebar";

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
  const [currentTool, setCurrentTool] = useState<"none" | "highlight" | "pen" | "text">("none");
  const [highlightColor, setHighlightColor] = useState<string>("rgba(255, 235, 59, 0.50)"); // Yellow default
  const [isDrawing, setIsDrawing] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // selectedText is what the modal displays / we store on annotation
  const [selectedText, setSelectedText] = useState<string>("");
  // Ref keeps the last non-empty selection so it doesn't get wiped when clicking buttons
  const selectedTextRef = useRef<string>("");

  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentPosition, setCommentPosition] = useState<Point | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [commentVisibility, setCommentVisibility] = useState<'public' | 'private'>('public');

  // Reply state
  const [replies, setReplies] = useState<{ [annotationId: string]: Reply[] }>({});
  const [showReplyInput, setShowReplyInput] = useState<string | null>(null); // annotation ID or reply ID
  const [replyText, setReplyText] = useState("");
  const [replyAnonymous, setReplyAnonymous] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ type: 'annotation' | 'reply', id: string, parentReplyId?: string } | null>(null);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageWrapRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null); // area we fit into (height fits screen)
  const drawingDataRef = useRef<Point[]>([]);

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

      // Available space inside viewer (fits screen). Small padding so it doesn't touch edges.
      const pad = 64; // padding around the page container
      const availW = Math.max(1, viewer.clientWidth - pad);
      const availH = Math.max(1, viewer.clientHeight - pad);

      // Fit the PDF page into available area without changing aspect ratio.
      const fit = Math.min(availW / base.w, availH / base.h);

      const w = Math.floor(base.w * fit);
      const h = Math.floor(base.h * fit);

      setRenderSize({ w, h });
    },
    []
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

  // --- HIGHLIGHT (text-selection based) ---
  const makeHighlightFromSelection = useCallback(() => {
    if (currentTool !== "highlight") return;
    if (showCommentModal) return;

    const wrap = pageWrapRef.current;
    const sel = window.getSelection();
    if (!wrap || !sel || sel.rangeCount === 0) return;

    const text = (sel.toString() || "").trim();
    if (!text) return;

    const range = sel.getRangeAt(0);

    // Ensure selection is inside this page wrapper
    const common = range.commonAncestorContainer;
    const commonEl =
      common.nodeType === 1 ? (common as Element) : (common.parentElement as Element | null);
    if (!commonEl || !wrap.contains(commonEl)) return;

    const wrapRect = wrap.getBoundingClientRect();
    const clientRects = Array.from(range.getClientRects());

    const rects: Rect[] = clientRects
      .map((r) => {
        const x = (r.left - wrapRect.left) / wrapRect.width;
        const y = (r.top - wrapRect.top) / wrapRect.height;
        const w = r.width / wrapRect.width;
        const h = r.height / wrapRect.height;
        return { x, y, w, h };
      })
      // Filter out tiny/noise rects
      .filter((r) => r.w > 0.002 && r.h > 0.002)
      // Clamp to [0,1] so weird selections don't overflow
      .map((r) => ({
        x: Math.max(0, Math.min(1, r.x)),
        y: Math.max(0, Math.min(1, r.y)),
        w: Math.max(0, Math.min(1, r.w)),
        h: Math.max(0, Math.min(1, r.h)),
      }));

    if (rects.length === 0) return;

    // Helper function to check if two rectangles overlap
    const rectsOverlap = (r1: Rect, r2: Rect): boolean => {
      return !(
        r1.x + r1.w < r2.x || // r1 is left of r2
        r2.x + r2.w < r1.x || // r2 is left of r1
        r1.y + r1.h < r2.y || // r1 is above r2
        r2.y + r2.h < r1.y    // r2 is above r1
      );
    };

    // Remove any existing highlights that overlap with the new selection
    const overlappingIds: string[] = [];
    annotations.forEach((annotation) => {
      if (annotation.type !== "highlight" || annotation.pageNumber !== pageNumber) {
        return;
      }

      const existingRects = (annotation.data as HighlightData)?.rects || [];

      // Check if any rect from existing highlight overlaps with any new rect
      for (const existingRect of existingRects) {
        for (const newRect of rects) {
          if (rectsOverlap(existingRect, newRect)) {
            overlappingIds.push(annotation.id);
            return;
          }
        }
      }
    });

    // Delete overlapping annotations from database
    if (overlappingIds.length > 0 && user) {
      deleteAnnotations(overlappingIds).then((success) => {
        if (success) {
          setAnnotations((prev) => prev.filter((a) => !overlappingIds.includes(a.id)));
        }
      });
    }

    // Keep selected text available for comment modal even if selection disappears
    selectedTextRef.current = text;
    setSelectedText(text);

    // Save to database and add to state
    if (user) {
      saveAnnotation(bookId, {
        pageNumber,
        type: "highlight",
        data: { rects, selectedText: text, color: highlightColor },
        color: highlightColor,
      }).then((saved) => {
        if (saved) {
          setAnnotations((prev) => [...prev, saved]);
        }
      });
    }

    // Optional: clear visible selection (prevents accidental re-highlighting)
    try {
      sel.removeAllRanges();
    } catch {
      // ignore
    }
  }, [currentTool, pageNumber, showCommentModal, highlightColor, annotations]);

  // Track text selection + create highlight on mouseup when tool is highlight
  useEffect(() => {
    const handleMouseUp = () => {
      if (showCommentModal) return;

      // If highlighting tool is active, convert selection to highlight rectangles
      if (currentTool === "highlight") {
        makeHighlightFromSelection();
        return;
      }

      // Otherwise just track selected text for the comment button
      const selection = window.getSelection();
      const text = selection?.toString() || "";
      const trimmed = text.trim();
      if (!trimmed) return;

      selectedTextRef.current = trimmed;
      setSelectedText(trimmed);
    };

    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [currentTool, makeHighlightFromSelection, showCommentModal]);

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

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (currentTool !== "pen") return;

    setIsDrawing(true);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    drawingDataRef.current = [{ x, y }];

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = "#FF6B6B";
    ctx.lineWidth = 2;
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || currentTool !== "pen") return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    drawingDataRef.current.push({ x, y });

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;

    setIsDrawing(false);

    if (currentTool !== "pen") {
      drawingDataRef.current = [];
      return;
    }

    if (drawingDataRef.current.length > 1 && user) {
      saveAnnotation(bookId, {
        pageNumber,
        type: "pen",
        data: [...drawingDataRef.current],
      }).then((saved) => {
        if (saved) {
          setAnnotations((prev) => [...prev, saved]);
        }
      });
      drawingDataRef.current = [];
    } else {
      drawingDataRef.current = [];
    }
  };

  const clearAnnotations = () => {
    if (!user) return;

    // Get IDs of annotations on this page
    const pageAnnotationIds = annotations
      .filter((a) => a.pageNumber === pageNumber)
      .map((a) => a.id);

    // Delete from database
    if (pageAnnotationIds.length > 0) {
      deleteAnnotations(pageAnnotationIds).then((success) => {
        if (success) {
          // Remove from local state
          setAnnotations((prev) => prev.filter((a) => a.pageNumber !== pageNumber));

          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      });
    }
  };

  const changePage = (offset: number) => {
    setPageNumber((prev) => Math.max(1, Math.min(prev + offset, numPages || 1)));
  };

  const handleAddComment = (e: React.MouseEvent) => {
    const nowSelected = (window.getSelection()?.toString() || "").trim();
    const effectiveSelected = nowSelected || selectedTextRef.current || selectedText;

    if (!effectiveSelected.trim()) {
      alert("Please select some text first");
      return;
    }

    selectedTextRef.current = effectiveSelected;
    setSelectedText(effectiveSelected);

    const wrap = pageWrapRef.current;
    if (wrap) {
      const rect = wrap.getBoundingClientRect();
      setCommentPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      setCommentPosition({ x: 40, y: 40 });
    }

    setShowCommentModal(true);
  };

  const saveComment = () => {
    if (!commentText.trim() || !commentPosition || !user) return;

    const frozenText = (selectedTextRef.current || selectedText || "").trim();

    saveAnnotation(bookId, {
      pageNumber,
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

  // Helper to organize replies into a tree structure
  const organizeReplies = (allReplies: Reply[]) => {
    const topLevel: Reply[] = [];
    const children: { [parentId: string]: Reply[] } = {};

    allReplies.forEach(reply => {
      if (!reply.parentReplyId) {
        topLevel.push(reply);
      } else {
        if (!children[reply.parentReplyId]) {
          children[reply.parentReplyId] = [];
        }
        children[reply.parentReplyId].push(reply);
      }
    });

    return { topLevel, children };
  };


  return (
    <div
      className="flex h-screen flex-col"
      style={{
        background: "linear-gradient(180deg, #E8F5E9 0%, #C8E6C9 15%, #E0F2F1 35%, #F1F8E9 100%)"
      }}
    >
      {/* Dark Green Navbar */}
      <nav
        className="w-full z-50 flex items-center justify-between px-8"
        style={{
          background: "#1a3d2e",
          boxShadow: "inset 0 0 20px rgba(100, 255, 150, 0.3), 0 2px 10px rgba(0, 0, 0, 0.1)",
          padding: "12px 32px",
          borderBottom: "1px solid rgba(100, 255, 150, 0.2)",
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

        {/* Right Side - Back to Library */}
        <a
          href="/library"
          className="px-4 py-2 text-white hover:text-green-200 transition-all duration-200"
          style={{
            fontSize: "14px",
            fontWeight: 500,
            letterSpacing: "-0.01em",
          }}
        >
          ← Back to Library
        </a>
      </nav>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Comments Sidebar */}
      <AnnotationsSidebar
        show={showSidebar}
        pageNumber={pageNumber}
        annotations={textAnnotations}
        replies={replies}
        expandedComments={expandedComments}
        showReplyInput={showReplyInput}
        replyText={replyText}
        replyAnonymous={replyAnonymous}
        currentUserId={user?.id}
        onClose={() => setShowSidebar(false)}
        onToggleExpanded={toggleCommentExpanded}
        onReplyClick={(id, type, parentReplyId) => {
          if (showReplyInput === id) {
            setShowReplyInput(null);
            setReplyingTo(null);
          } else {
            setShowReplyInput(id);
            setReplyingTo({ type, id, parentReplyId });
          }
        }}
        onDeleteAnnotation={(annotationId) => {
          deleteAnnotation(annotationId).then((success) => {
            if (success) {
              setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
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

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* PDF Viewer - Takes full space */}
        <div
          ref={viewerRef}
          className="flex-1 flex items-center justify-center overflow-auto"
          style={{ padding: "32px" }}
        >
          <div
            ref={pageWrapRef}
            className="relative bg-white"
            style={{
              width: renderSize ? `${renderSize.w}px` : "auto",
              height: renderSize ? `${renderSize.h}px` : "auto",
              borderRadius: "8px",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.15), 0 0 0 0.5px rgba(0, 0, 0, 0.05)",
              overflow: "hidden"
            }}
          >
            {loadErr && <div className="p-4 text-sm text-red-600 break-all border-b">{loadErr}</div>}

            <Document
              key={resolvedPdfUrl}
              file={resolvedPdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={(err) => {
                console.error("PDF load error:", err);
                setLoadErr(`PDF load error: ${String(err)} | URL: ${resolvedPdfUrl}`);
              }}
              onSourceError={(err) => {
                console.error("PDF source error:", err);
                setLoadErr(`PDF source error: ${String(err)} | URL: ${resolvedPdfUrl}`);
              }}
              loading={
                <div className="flex items-center justify-center h-[60vh] w-[60vw] max-w-[900px]">
                  <div className="text-gray-500">Loading PDF...</div>
                </div>
              }
              error={
                <div className="flex items-center justify-center h-[60vh] w-[60vw] max-w-[900px]">
                  <div className="text-red-500 break-all">Error loading PDF. URL: {resolvedPdfUrl}</div>
                </div>
              }
            >
              <Page
                pageNumber={pageNumber}
                width={renderSize?.w}
                renderTextLayer
                renderAnnotationLayer
                onLoadSuccess={onPageLoadSuccess}
                onRenderSuccess={() => syncCanvasToPage()}
              />
            </Document>

            {/* Highlights layer */}
            <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 6 }}>
              {highlightAnnotations.flatMap((a) => {
                const data = a.data as HighlightData;
                const rects = data?.rects || [];
                const color = a.color || data?.color || "rgba(255, 235, 59, 0.50)";
                return rects.map((r, i) => (
                  <div
                    key={`${a.id}-${i}`}
                    className="absolute rounded-sm cursor-pointer hover:opacity-75 transition-opacity pointer-events-auto"
                    style={{
                      left: `${r.x * 100}%`,
                      top: `${r.y * 100}%`,
                      width: `${r.w * 100}%`,
                      height: `${r.h * 100}%`,
                      background: color,
                    }}
                    title={data?.selectedText ? `Click to delete: "${data.selectedText}"` : "Click to delete highlight"}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (user) {
                        deleteAnnotation(a.id).then((success) => {
                          if (success) {
                            setAnnotations((prev) => prev.filter((ann) => ann.id !== a.id));
                          }
                        });
                      }
                    }}
                  />
                ));
              })}
            </div>

            {/* Pen canvas */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0"
              style={{
                zIndex: 7,
                pointerEvents: currentTool === "pen" ? "auto" : "none",
                cursor: currentTool === "pen" ? "crosshair" : "default",
              }}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
            />

            {/* Comment markers */}
            {textAnnotations.map((annotation, index) => (
              <div
                key={annotation.id}
                className="absolute bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold cursor-pointer hover:bg-purple-700 shadow-lg"
                style={{
                  left: annotation.data?.position?.x ?? 0,
                  top: annotation.data?.position?.y ?? 0,
                  transform: "translate(-50%, -50%)",
                  zIndex: 10,
                }}
                title={`Comment ${index + 1}`}
              >
                {index + 1}
              </div>
            ))}
          </div>
        </div>

        {/* Toolbar */}
        <Toolbar
          currentTool={currentTool}
          pageNumber={pageNumber}
          numPages={numPages}
          showSidebar={showSidebar}
          hasSelectedText={!!(selectedTextRef.current.trim() || selectedText.trim())}
          onToolChange={setCurrentTool}
          onToggleSidebar={() => setShowSidebar((s) => !s)}
          onChangePage={changePage}
          onAddComment={() => handleAddComment({} as React.MouseEvent)}
          onClearAnnotations={clearAnnotations}
          onHomeClick={() => (window.location.href = "/")}
        />

        {/* Color Picker */}
        {currentTool === "highlight" && (
          <ColorPicker currentColor={highlightColor} onColorChange={setHighlightColor} />
        )}
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
