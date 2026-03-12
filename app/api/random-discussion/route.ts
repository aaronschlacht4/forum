import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function buildDiscussion(supabase: ReturnType<typeof import("@/lib/supabaseAdmin").getSupabaseAdmin>, annotationId: string) {
  const { data: annotation, error } = await supabase
    .from("annotations_with_users")
    .select("*")
    .eq("id", annotationId)
    .single();
  if (error || !annotation) return null;

  const { data: book } = await supabase
    .from("books")
    .select("title, author")
    .eq("id", annotation.book_id)
    .single();

  const { data: replies } = await supabase
    .from("replies_with_users")
    .select("*")
    .eq("annotation_id", annotationId)
    .is("parent_reply_id", null)
    .order("created_at", { ascending: true })
    .limit(8);

  const replyList = replies || [];
  let votesMap: Record<string, { upvotes: number; downvotes: number }> = {};

  if (replyList.length > 0) {
    const replyIds = replyList.map((r) => r.id);
    const { data: votes } = await supabase
      .from("reply_votes")
      .select("reply_id, vote")
      .in("reply_id", replyIds);

    for (const v of votes || []) {
      if (!votesMap[v.reply_id]) votesMap[v.reply_id] = { upvotes: 0, downvotes: 0 };
      if (v.vote === 1) votesMap[v.reply_id].upvotes++;
      else if (v.vote === -1) votesMap[v.reply_id].downvotes++;
    }
  }

  const enrichedReplies = replyList.map((r) => ({
    id: r.id,
    content: r.content,
    displayName: r.is_anonymous ? "Anonymous" : (r.display_name || r.username || "Reader"),
    avatarUrl: r.is_anonymous ? null : r.avatar_url,
    isAnonymous: r.is_anonymous || false,
    createdAt: r.created_at,
    upvotes: votesMap[r.id]?.upvotes ?? 0,
    downvotes: votesMap[r.id]?.downvotes ?? 0,
  }));

  let highlightedText: string | null = null;
  if (annotation.data?.text) highlightedText = annotation.data.text;
  else if (annotation.data?.selectedText) highlightedText = annotation.data.selectedText;

  return {
    annotationId: annotation.id,
    bookId: annotation.book_id,
    bookTitle: book?.title || "Unknown Book",
    bookAuthor: book?.author || null,
    pageNumber: annotation.page_number,
    annotationComment: annotation.comment,
    highlightedText,
    displayName: annotation.display_name || annotation.username || "Reader",
    replies: enrichedReplies,
  };
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    // Get all annotation IDs that have at least one reply
    const { data: replyAnnotationIds, error: replyError } = await supabase
      .from("replies")
      .select("annotation_id")
      .limit(500);

    if (replyError) throw replyError;
    if (!replyAnnotationIds || replyAnnotationIds.length === 0) {
      return NextResponse.json({ discussions: [] });
    }

    // Shuffle unique annotation IDs and pick up to 3
    const uniqueIds = [...new Set(replyAnnotationIds.map((r) => r.annotation_id))];
    for (let i = uniqueIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [uniqueIds[i], uniqueIds[j]] = [uniqueIds[j], uniqueIds[i]];
    }
    const picked = uniqueIds.slice(0, 3);

    const discussions = (
      await Promise.all(picked.map((id) => buildDiscussion(supabase, id)))
    ).filter(Boolean);

    return NextResponse.json({ discussions });
  } catch (err) {
    console.error("random-discussion error:", err);
    return NextResponse.json({ discussions: [] }, { status: 500 });
  }
}
