"use client";

import dynamic from "next/dynamic";

const PDFViewer = dynamic(() => import("@/components/PDFViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen">
      <div className="text-gray-500">Loading PDF viewer...</div>
    </div>
  ),
});

interface PDFViewerClientProps {
  // pass DB value like "Shelley_Frankenstein.pdf"
  pdfUrl: string;
  bookId: string;
  title: string;
  author: string | null;
}

export default function PDFViewerClient({ pdfUrl, bookId, title, author }: PDFViewerClientProps) {
  return <PDFViewer pdfUrl={pdfUrl} bookId={bookId} title={title} author={author} />;
}
