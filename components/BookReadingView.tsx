"use client";

import { useState } from "react";
import BookReader from "./BookReader";
import PDFViewerClient from "./PDFViewerClient";

/**
 * Chooses how a book is read.
 *
 * Text is the default: it reflows, scales with the reader's own type size, and
 * can be selected and searched, none of which is true of a page drawn to a
 * canvas. The PDF stays one click away — highlights are anchored to coordinates
 * on the rendered page, so that is still where existing annotations live.
 */
export default function BookReadingView({
  bookId,
  pdfPath,
  title,
  author,
}: {
  bookId: string;
  pdfPath: string | null;
  title: string;
  author?: string | null;
}) {
  const [mode, setMode] = useState<"text" | "pdf">("text");

  if (mode === "pdf" && pdfPath) {
    return (
      <div style={{ position: "fixed", inset: 0 }}>
        <PDFViewerClient
          pdfUrl={pdfPath}
          bookId={bookId}
          title={title}
          author={author ?? null}
        />
        <button
          onClick={() => setMode("text")}
          style={{
            position: "fixed",
            bottom: 18,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 60,
            background: "rgba(24,16,6,0.95)",
            border: "1px solid rgba(255,218,150,0.32)",
            borderRadius: 999,
            color: "#ffe8c0",
            cursor: "pointer",
            fontFamily: "system-ui",
            fontSize: 12,
            padding: "8px 16px",
          }}
        >
          Back to text
        </button>
      </div>
    );
  }

  return (
    <BookReader
      bookId={bookId}
      title={title}
      author={author}
      onOpenPdf={pdfPath ? () => setMode("pdf") : undefined}
    />
  );
}
