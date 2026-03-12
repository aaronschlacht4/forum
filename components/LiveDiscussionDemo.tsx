"use client";

import { useEffect, useState, useCallback } from "react";
import { voteOnReply } from "@/lib/replies";
import { useAuth } from "@/lib/AuthContext";

interface DemoReply {
  id: string;
  content: string;
  displayName: string;
  avatarUrl: string | null;
  isAnonymous: boolean;
  createdAt: string;
  upvotes: number;
  downvotes: number;
  userVote?: 1 | -1 | null;
}

interface Discussion {
  annotationId: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string | null;
  pageNumber: number;
  annotationComment: string | null;
  highlightedText: string | null;
  displayName: string;
  replies: DemoReply[];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function VoteBar({
  upvotes, downvotes, userVote, canVote,
  onUp, onDown,
}: {
  upvotes: number; downvotes: number; userVote?: 1 | -1 | null;
  canVote: boolean; onUp: () => void; onDown: () => void;
}) {
  const score = upvotes - downvotes;
  const scoreColor = userVote === 1 ? "#ff4500" : userVote === -1 ? "#7193ff" : "#878a8c";

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
      <button
        onClick={onUp}
        title={canVote ? "Upvote" : "Log in to vote"}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 24, height: 24, borderRadius: 4,
          background: "none", border: "none",
          cursor: canVote ? "pointer" : "default",
          color: userVote === 1 ? "#ff4500" : "#878a8c",
          transition: "color 0.1s", padding: 0,
        }}
        onMouseEnter={e => canVote && (e.currentTarget.style.color = "#ff4500")}
        onMouseLeave={e => (e.currentTarget.style.color = userVote === 1 ? "#ff4500" : "#878a8c")}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill={userVote === 1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4L3 15h6v5h6v-5h6z" />
        </svg>
      </button>
      <span style={{
        fontSize: 12, fontWeight: 700, fontFamily: "system-ui, -apple-system, sans-serif",
        color: scoreColor, minWidth: 20, textAlign: "center", lineHeight: 1,
      }}>
        {score}
      </span>
      <button
        onClick={onDown}
        title={canVote ? "Downvote" : "Log in to vote"}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 24, height: 24, borderRadius: 4,
          background: "none", border: "none",
          cursor: canVote ? "pointer" : "default",
          color: userVote === -1 ? "#7193ff" : "#878a8c",
          transition: "color 0.1s", padding: 0,
        }}
        onMouseEnter={e => canVote && (e.currentTarget.style.color = "#7193ff")}
        onMouseLeave={e => (e.currentTarget.style.color = userVote === -1 ? "#7193ff" : "#878a8c")}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill={userVote === -1 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20L3 9h6V4h6v5h6z" />
        </svg>
      </button>
    </div>
  );
}

function Avatar({ displayName, avatarUrl, size = 26 }: { displayName: string; avatarUrl: string | null; size?: number }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={displayName} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "white", fontSize: size * 0.38, fontWeight: 600, flexShrink: 0,
    }}>
      {displayName === "Anonymous" ? "?" : displayName[0]?.toUpperCase() || "?"}
    </div>
  );
}

function DiscussionCard({
  discussion,
  onVote,
  user,
}: {
  discussion: Discussion;
  onVote: (annotationId: string, replyId: string, vote: 1 | -1 | null) => void;
  user: { id: string } | null;
}) {
  const bookUrl = `/book/${discussion.bookId}`;

  return (
    <div style={{
      background: "rgba(255,255,255,0.82)",
      backdropFilter: "blur(12px)",
      borderRadius: 16,
      border: "1px solid rgba(26,61,46,0.13)",
      overflow: "hidden",
      boxShadow: "0 4px 20px rgba(26,61,46,0.08)",
      display: "flex",
      flexDirection: "column",
      height: "100%",
    }}>
      {/* Header — click to go to book */}
      <a href={bookUrl} style={{ textDecoration: "none" }}>
        <div
          style={{ background: "#1a3d2e", padding: "12px 16px", cursor: "pointer", transition: "background 0.15s" }}
          onMouseEnter={e => (e.currentTarget.style.background = "#224d3a")}
          onMouseLeave={e => (e.currentTarget.style.background = "#1a3d2e")}
        >
          <div style={{ color: "rgba(100,255,150,0.75)", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", marginBottom: 2 }}>
            LIVE FROM THE VAULT
          </div>
          <div style={{ color: "#fff", fontFamily: "'Crimson Text', serif", fontSize: 16, lineHeight: 1.3 }}>
            {discussion.bookTitle}
            {discussion.bookAuthor && (
              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}> · {discussion.bookAuthor}</span>
            )}
          </div>
        </div>
      </a>

      {/* Annotation quote */}
      {(discussion.highlightedText || discussion.annotationComment) && (
        <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid rgba(26,61,46,0.08)", background: "rgba(26,61,46,0.02)" }}>
          {discussion.highlightedText && (
            <blockquote style={{
              margin: 0, paddingLeft: 10,
              borderLeft: "2px solid #1a3d2e",
              color: "#2D5A3D", fontFamily: "'Crimson Text', serif",
              fontStyle: "italic", fontSize: 13, lineHeight: 1.5,
            }}>
              &ldquo;{discussion.highlightedText.slice(0, 140)}{discussion.highlightedText.length > 140 ? "…" : ""}&rdquo;
            </blockquote>
          )}
          {discussion.annotationComment && (
            <p style={{ margin: discussion.highlightedText ? "6px 0 0" : 0, color: "#1a3d2e", fontFamily: "'Crimson Text', serif", fontSize: 13, lineHeight: 1.4 }}>
              {discussion.annotationComment}
            </p>
          )}
          <div style={{ marginTop: 4, color: "#aaa", fontSize: 11, fontFamily: "'Crimson Text', serif" }}>
            p.&nbsp;{discussion.pageNumber} · {discussion.displayName}
          </div>
        </div>
      )}

      {/* Replies */}
      <div style={{ padding: "8px 14px 12px", flex: 1, display: "flex", flexDirection: "column" }}>
        {discussion.replies.length === 0 ? (
          <p style={{ color: "#bbb", fontFamily: "'Crimson Text', serif", fontSize: 14, textAlign: "center", padding: "12px 0" }}>
            No replies yet.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {discussion.replies.slice(0, 4).map((reply) => (
              <div key={reply.id} style={{
                display: "flex", gap: 8, padding: "8px 10px",
                borderRadius: 10, background: "rgba(26,61,46,0.03)",
                border: "1px solid rgba(26,61,46,0.07)",
              }}>
                <Avatar displayName={reply.displayName} avatarUrl={reply.avatarUrl} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                    <span style={{ fontFamily: "'Crimson Text', serif", fontWeight: 600, fontSize: 13, color: "#1a3d2e" }}>
                      {reply.displayName}
                    </span>
                    <span style={{ color: "#bbb", fontSize: 11, fontFamily: "'Crimson Text', serif" }}>
                      {timeAgo(reply.createdAt)}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontFamily: "'Crimson Text', serif", fontSize: 14, color: "#333", lineHeight: 1.4 }}>
                    {reply.content.slice(0, 120)}{reply.content.length > 120 ? "…" : ""}
                  </p>
                  {/* Votes */}
                  <div style={{ marginTop: 5 }}>
                    <VoteBar
                      upvotes={reply.upvotes}
                      downvotes={reply.downvotes}
                      userVote={reply.userVote}
                      canVote={!!user}
                      onUp={() => onVote(discussion.annotationId, reply.id, reply.userVote === 1 ? null : 1)}
                      onDown={() => onVote(discussion.annotationId, reply.id, reply.userVote === -1 ? null : -1)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <div style={{ marginTop: "auto", paddingTop: 10 }}>
          <a
            href={bookUrl}
            style={{
              display: "block", textAlign: "center",
              padding: "7px 0", borderRadius: 8,
              background: "rgba(26,61,46,0.07)",
              border: "1px solid rgba(26,61,46,0.12)",
              color: "#1a3d2e", fontFamily: "'Crimson Text', serif",
              fontSize: 13, textDecoration: "none", transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(26,61,46,0.12)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(26,61,46,0.07)")}
          >
            Join discussion →
          </a>
        </div>
      </div>
    </div>
  );
}

export default function LiveDiscussionDemo() {
  const { user } = useAuth();
  const [pages, setPages] = useState<Discussion[][]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (): Promise<Discussion[]> => {
    const res = await fetch("/api/random-discussion");
    const json = await res.json();
    return json.discussions || [];
  }, []);

  useEffect(() => {
    fetchPage().then((discussions) => {
      setPages([discussions]);
      setPageIndex(0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [fetchPage]);

  const handleNext = async () => {
    if (pageIndex + 1 < pages.length) {
      setPageIndex((i) => i + 1);
    } else {
      setLoadingMore(true);
      try {
        const discussions = await fetchPage();
        setPages((prev) => [...prev, discussions]);
        setPageIndex((i) => i + 1);
      } finally {
        setLoadingMore(false);
      }
    }
  };

  const handlePrev = () => {
    if (pageIndex > 0) setPageIndex((i) => i - 1);
  };

  const handleVote = async (annotationId: string, replyId: string, vote: 1 | -1 | null) => {
    if (!user) return;
    setPages((prev) =>
      prev.map((page) =>
        page.map((disc) => {
          if (disc.annotationId !== annotationId) return disc;
          return {
            ...disc,
            replies: disc.replies.map((r) => {
              if (r.id !== replyId) return r;
              const prevVote = r.userVote ?? null;
              let upvotes = r.upvotes;
              let downvotes = r.downvotes;
              if (prevVote === 1) upvotes--;
              if (prevVote === -1) downvotes--;
              if (vote === 1) upvotes++;
              if (vote === -1) downvotes++;
              return { ...r, upvotes, downvotes, userVote: vote };
            }),
          };
        })
      )
    );
    await voteOnReply(replyId, vote);
  };

  const currentPage = pages[pageIndex] || [];

  if (loading) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ height: 320, borderRadius: 16, background: "rgba(255,255,255,0.4)", border: "1px solid rgba(26,61,46,0.1)" }} />
        ))}
      </div>
    );
  }

  if (currentPage.length === 0) {
    return (
      <div style={{ minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontFamily: "'Crimson Text', serif", fontSize: 18 }}>
        No discussions yet. Be the first to annotate a book!
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, alignItems: "start" }}>
        {currentPage.map((disc) => (
          <DiscussionCard key={disc.annotationId} discussion={disc} onVote={handleVote} user={user} />
        ))}
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 24 }}>
        <button
          onClick={handlePrev}
          disabled={pageIndex === 0}
          style={{
            width: 40, height: 40, borderRadius: "50%",
            background: pageIndex === 0 ? "rgba(26,61,46,0.04)" : "rgba(26,61,46,0.1)",
            border: "1px solid rgba(26,61,46,0.15)",
            color: pageIndex === 0 ? "rgba(26,61,46,0.25)" : "#1a3d2e",
            fontSize: 18, cursor: pageIndex === 0 ? "default" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          ←
        </button>
        <span style={{ fontFamily: "'Crimson Text', serif", color: "#888", fontSize: 14 }}>
          {pageIndex + 1} / {pages.length}
        </span>
        <button
          onClick={handleNext}
          disabled={loadingMore}
          style={{
            width: 40, height: 40, borderRadius: "50%",
            background: "rgba(26,61,46,0.1)",
            border: "1px solid rgba(26,61,46,0.15)",
            color: "#1a3d2e",
            fontSize: 18, cursor: loadingMore ? "default" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            opacity: loadingMore ? 0.5 : 1,
          }}
        >
          {loadingMore ? "…" : "→"}
        </button>
      </div>
    </div>
  );
}
