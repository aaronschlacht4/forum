import BookReadingView from "@/components/BookReadingView";
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

  // The reader fetches the extracted text itself; the stored filename is only
  // needed for the PDF, which is now the fallback rather than the main view.
  return (
    <BookReadingView
      bookId={book.id.toString()}
      pdfPath={book.pdf_path ?? null}
      title={book.title}
      author={book.author}
    />
  );
}
