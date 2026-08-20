import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const TEXT_BUCKET = "texts";

/** Matches the naming in scripts/extract-books.mjs. */
function slugify(value: string) {
  return (value || "book")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * The reading text for a book, as extracted from its PDF.
 *
 * Served through the app rather than straight from storage so the bucket can
 * stay private — this is the full text of a book, not a cover thumbnail.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: book, error } = await supabase
      .from("books")
      .select("id,title")
      .eq("id", id)
      .single();

    if (error || !book) {
      return NextResponse.json({ error: "No such book" }, { status: 404 });
    }

    const file = `${slugify(book.title)}.json`;
    const { data, error: downloadError } = await supabase.storage
      .from(TEXT_BUCKET)
      .download(file);

    if (downloadError || !data) {
      // Not an error worth shouting about: a book simply may not have been run
      // through the extractor yet, and the reader falls back to the PDF.
      return NextResponse.json(
        { error: "No extracted text for this book", file },
        { status: 404 }
      );
    }

    return new NextResponse(await data.text(), {
      headers: {
        "Content-Type": "application/json",
        // The text only changes when the extractor is re-run.
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
