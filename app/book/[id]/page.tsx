import PDFViewerClient from "@/components/PDFViewerClient";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { notFound } from "next/navigation";

export default async function BookPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  // Fetch book details from Supabase
  const { data: book, error } = await supabase
    .from("books")
    .select("id, title, author, pdf_path")
    .eq("id", id)
    .single();

  if (error || !book) {
    notFound();
  }

  // Just pass the filename from the database - PDFViewerClient will resolve the full URL
  if (!book.pdf_path) {
    return (
      <main className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">{book.title}</h1>
          <p className="text-gray-600">PDF not available for this book.</p>
        </div>
      </main>
    );
  }

  return <PDFViewerClient pdfUrl={book.pdf_path} bookId={book.id.toString()} title={book.title} author={book.author} />;
}
