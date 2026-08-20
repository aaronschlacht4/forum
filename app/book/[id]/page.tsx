import BookReader from "@/components/BookReader";
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

  // The reader fetches the extracted text itself.
  return (
    <BookReader
      bookId={book.id.toString()}
      title={book.title}
      author={book.author}
    />
  );
}
