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
  // Absent entirely until sql-migrations/11-add-page-count.sql has run.
  page_count?: number | null;
  // Absent entirely until sql-migrations/12-add-cover-calibrated.sql has run.
  cover_calibrated?: boolean;
};

export async function GET(req: Request) {
  try {
    console.log("📡 API /api/books called");
    const supabaseAdmin = getSupabaseAdmin();

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    // Tried richest-select first, falling back a column at a time — each of
    // these migrations may or may not have been run yet (see
    // ShelvesNotSetUpError in lib/library.ts for the same pattern), and the
    // catalogue has to keep working regardless of exactly where things stand.
    const selects = [
      "id,title,author,pdf_path,cover_path,page_count,cover_calibrated",
      "id,title,author,pdf_path,cover_path,page_count",
      "id,title,author,pdf_path,cover_path",
    ];

    let data: any;
    let error: any;
    for (const select of selects) {
      let query = supabaseAdmin.from("books").select(select).order("title", { ascending: true });
      if (q.length > 0) query = query.or(`title.ilike.%${q}%,author.ilike.%${q}%`);
      ({ data, error } = await query);
      if (error?.code !== "42703") break;
    }

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
          pageCount: b.page_count,
          coverCalibrated: b.cover_calibrated ?? false,
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
