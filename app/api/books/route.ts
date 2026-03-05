import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

const BUCKET_NAME = "books"; // <-- change if your bucket name is different
const SIGNED_EXPIRES = 60 * 10; // 10 minutes

type BookRow = {
  id: string | number;
  title: string | null;
  author: string | null;
  pdf_path: string | null;
  cover_path: string | null;
};

export async function GET(req: Request) {
  try {
    console.log("📡 API /api/books called");
    const supabaseAdmin = getSupabaseAdmin();

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    let query = supabaseAdmin
      .from("books")
      .select("id,title,author,pdf_path,cover_path")
      .order("title", { ascending: true });

    if (q.length > 0) {
      query = query.or(`title.ilike.%${q}%,author.ilike.%${q}%`);
    }

    const { data, error } = await query;

    console.log("🔍 Supabase query result:", { dataCount: data?.length, error });

    if (error) {
      console.error("❌ Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as BookRow[];
    console.log("📚 Found", rows.length, "books");

    const results = await Promise.all(
      rows.map(async (b) => {
        let pdfUrl: string | null = null;

        if (b.pdf_path) {
          const { data: signed, error: signErr } = await supabaseAdmin.storage
            .from(BUCKET_NAME)
            .createSignedUrl(b.pdf_path, SIGNED_EXPIRES);

          if (!signErr && signed?.signedUrl) {
            pdfUrl = signed.signedUrl;
          }
        }

        return {
          id: String(b.id),
          title: b.title ?? "Untitled",
          author: b.author ?? "Unknown",
          pdfPath: b.pdf_path,
          pdfUrl,
          cover_path: b.cover_path,
        };
      })
    );

    console.log("✅ Returning", results.length, "books");
    return NextResponse.json(results);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
