"use client";

import { useEffect, useRef, useState } from "react";
import { Annotation } from "@/lib/annotations";
import { Reply } from "@/lib/replies";

/**
 * Comments, docked beside the pages.
 *
 * A modal over the book was the wrong shape for this: it hid the passage being
 * discussed, and it had to be dismissed before anything could be read. A panel
 * alongside keeps the text and the conversation on screen together, so a thread
 * can be followed while reading.
 */
export default function CommentsPanel({
  width,
  draft,
  comments,
  replies,
  currentUserId,
  onDraftCancel,
  onDraftSubmit,
  onReply,
  onDeleteComment,
  onClose,
  onFocusComment,
}: {
  width: number;
  /** The passage waiting for a comment, if one has just been selected. */
  draft: { text: string; page: number } | null;
  comments: Annotation[];
  replies: { [annotationId: string]: Reply[] };
  currentUserId?: string;
  onDraftCancel: () => void;
  onDraftSubmit: (body: string, visibility: "public" | "private") => void;
  onReply: (annotationId: string, body: string) => void;
  onDeleteComment: (annotationId: string) => void;
  onClose: () => void;
  onFocusComment: (annotation: Annotation) => void;
}) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const composer = useRef<HTMLTextAreaElement>(null);

  // A new draft should be ready to type into without reaching for the mouse.
  useEffect(() => {
    if (draft) composer.current?.focus();
  }, [draft]);

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    onDraftSubmit(text, visibility);
    setBody("");
  };

  return (
    <aside data-ui-panel style={{ ...panel, width }}>
      <header style={head}>
        <span style={{ letterSpacing: 0.3 }}>
          Comments
          <span style={{ opacity: 0.45, marginLeft: 7 }}>{comments.length}</span>
        </span>
        <button onClick={onClose} style={iconButton} title="Close">
          ✕
        </button>
      </header>

      <div style={body_}>
        {draft && (
          <section style={draftCard}>
            <div style={quote}>{trim(draft.text, 220)}</div>
            <textarea
              ref={composer}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                if (e.key === "Escape") onDraftCancel();
              }}
              placeholder="Add a comment…"
              rows={4}
              style={input}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 8,
                flexWrap: "wrap",
              }}
            >
              <div style={segmented} role="group" aria-label="Who can see this">
                {(["public", "private"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setVisibility(v)}
                    style={{
                      ...segment,
                      background:
                        visibility === v ? "rgba(255,200,120,0.22)" : "transparent",
                      color:
                        visibility === v ? "#ffe8c0" : "rgba(255,228,192,0.6)",
                    }}
                  >
                    {v === "public" ? "Everyone" : "Only me"}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1 }} />
              <button onClick={onDraftCancel} style={ghostButton}>Cancel</button>
              <button onClick={submit} disabled={!body.trim()} style={primaryButton}>
                Comment
              </button>
            </div>
            <div style={hint}>⌘↵ to post</div>
          </section>
        )}

        {comments.length === 0 && !draft && (
          <p style={empty}>
            Select a passage and choose <em>Add comment</em> to start a thread.
          </p>
        )}

        {comments.map((c) => {
          const thread = replies[c.id] ?? [];
          return (
            <article key={c.id} style={card}>
              <button onClick={() => onFocusComment(c)} style={quoteButton} title="Show in the text">
                {trim((c.data as { quote?: string })?.quote ?? "", 160)}
              </button>

              <div style={meta}>
                <span style={{ color: "#ffe0b0" }}>{c.displayName || c.username || "Someone"}</span>
                {c.visibility === "private" && <span style={badge}>only me</span>}
                {c.userId && c.userId === currentUserId && (
                  <button onClick={() => onDeleteComment(c.id)} style={deleteButton} title="Delete">
                    Delete
                  </button>
                )}
              </div>

              <p style={commentBody}>{c.comment}</p>

              {thread.map((r) => (
                <div key={r.id} style={replyRow}>
                  <span style={{ color: "rgba(255,214,150,0.85)" }}>
                    {r.isAnonymous ? "Anonymous" : r.displayName || r.username || "Someone"}
                  </span>
                  <span style={{ opacity: 0.85 }}>{r.content}</span>
                </div>
              ))}

              {replyTo === c.id ? (
                <div style={{ marginTop: 8 }}>
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        onReply(c.id, replyBody.trim());
                        setReplyBody("");
                        setReplyTo(null);
                      }
                      if (e.key === "Escape") setReplyTo(null);
                    }}
                    placeholder="Reply…"
                    rows={3}
                    style={input}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 6, justifyContent: "flex-end" }}>
                    <button onClick={() => setReplyTo(null)} style={ghostButton}>Cancel</button>
                    <button
                      onClick={() => {
                        if (!replyBody.trim()) return;
                        onReply(c.id, replyBody.trim());
                        setReplyBody("");
                        setReplyTo(null);
                      }}
                      style={primaryButton}
                    >
                      Reply
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setReplyTo(c.id)} style={replyLink}>
                  Reply{thread.length ? ` · ${thread.length}` : ""}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </aside>
  );
}

const trim = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

/* ---- An editor's side panel, in the library's own warm palette rather than a
   neutral grey, so it reads as part of the book rather than bolted on. ---- */

const panel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  height: "100%",
  background: "rgba(24,16,6,0.98)",
  borderLeft: "1px solid rgba(255,218,150,0.18)",
  color: "#ffe8c0",
  fontFamily:
    'ui-sans-serif, system-ui, "Segoe UI", -apple-system, "Helvetica Neue", sans-serif',
  fontSize: 12.5,
};

const head: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 12px",
  borderBottom: "1px solid rgba(255,218,150,0.16)",
  textTransform: "uppercase",
  fontSize: 11,
  letterSpacing: 0.6,
  color: "rgba(255,220,160,0.6)",
};

const body_: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 10,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const card: React.CSSProperties = {
  background: "rgba(255,232,180,0.05)",
  border: "1px solid rgba(255,218,150,0.16)",
  borderRadius: 6,
  padding: "10px 11px",
};

const draftCard: React.CSSProperties = {
  ...card,
  borderColor: "rgba(255,200,120,0.42)",
  background: "rgba(255,200,120,0.09)",
};

const quote: React.CSSProperties = {
  borderLeft: "2px solid rgba(255,190,90,0.55)",
  paddingLeft: 8,
  marginBottom: 9,
  color: "rgba(255,225,175,0.75)",
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11.5,
  lineHeight: 1.5,
};

const quoteButton: React.CSSProperties = {
  ...quote,
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "none",
  border: "none",
  borderLeft: "2px solid rgba(255,190,90,0.55)",
  cursor: "pointer",
};

const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "rgba(10,6,2,0.6)",
  border: "1px solid rgba(255,218,150,0.24)",
  borderRadius: 5,
  color: "#ffe8c0",
  fontFamily: "inherit",
  fontSize: 12.5,
  lineHeight: 1.5,
  padding: "8px 9px",
  resize: "vertical",
  outline: "none",
};

/**
 * A pair of buttons rather than a `select`. A native dropdown draws its own
 * system chrome — the arrow, the popup, the focus ring — none of which takes
 * the panel's colours, so it stood out as the one control from somewhere else.
 */
const segmented: React.CSSProperties = {
  display: "flex",
  // Sits in a row with the Cancel and Comment buttons, which would otherwise
  // squeeze it until its second label was cut in half.
  flexShrink: 0,
  border: "1px solid rgba(255,218,150,0.24)",
  borderRadius: 999,
  overflow: "hidden",
};

const segment: React.CSSProperties = {
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 11.5,
  padding: "5px 11px",
  whiteSpace: "nowrap",
};

const primaryButton: React.CSSProperties = {
  background: "rgba(255,200,120,0.9)",
  border: "1px solid rgba(255,225,170,0.9)",
  borderRadius: 5,
  color: "#241703",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 600,
  padding: "5px 12px",
};

const ghostButton: React.CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(255,218,150,0.26)",
  borderRadius: 5,
  color: "#ffe8c0",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12,
  padding: "5px 10px",
};

const iconButton: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "rgba(255,220,160,0.65)",
  cursor: "pointer",
  fontSize: 13,
  lineHeight: 1,
  padding: 2,
};

const meta: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 11,
  color: "rgba(255,220,160,0.5)",
  marginBottom: 5,
};

const badge: React.CSSProperties = {
  border: "1px solid rgba(255,218,150,0.24)",
  borderRadius: 4,
  fontSize: 10,
  padding: "1px 5px",
  color: "rgba(255,220,160,0.6)",
};

const deleteButton: React.CSSProperties = {
  marginLeft: "auto",
  background: "none",
  border: "none",
  color: "#e8907c",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 11,
  padding: 0,
};

const commentBody: React.CSSProperties = {
  margin: 0,
  color: "rgba(255,236,206,0.92)",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
};

const replyRow: React.CSSProperties = {
  display: "flex",
  gap: 7,
  marginTop: 7,
  paddingTop: 7,
  borderTop: "1px solid rgba(255,218,150,0.14)",
  fontSize: 12,
  lineHeight: 1.5,
};

const replyLink: React.CSSProperties = {
  marginTop: 8,
  background: "none",
  border: "none",
  color: "rgba(255,200,120,0.85)",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 11.5,
  padding: 0,
};

const hint: React.CSSProperties = {
  marginTop: 6,
  fontSize: 10.5,
  color: "rgba(255,220,160,0.4)",
  textAlign: "right",
};

const empty: React.CSSProperties = {
  color: "rgba(255,220,160,0.45)",
  fontSize: 12,
  lineHeight: 1.6,
  margin: "6px 2px",
};
