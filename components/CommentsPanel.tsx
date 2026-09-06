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
  floating = false,
  draft,
  comments,
  replies,
  currentUserId,
  focusedId,
  onDraftCancel,
  onDraftSubmit,
  onReply,
  onDeleteComment,
  onClose,
  onFocusComment,
}: {
  width: number;
  /** Sits over the pages rather than in the layout, so they never resize. */
  floating?: boolean;
  /** The passage waiting for a comment, if one has just been selected. */
  draft: { text: string; page: number } | null;
  comments: Annotation[];
  replies: { [annotationId: string]: Reply[] };
  currentUserId?: string;
  /** The thread just opened from the text, so it can be picked out of the list. */
  focusedId?: string | null;
  onDraftCancel: () => void;
  onDraftSubmit: (body: string, visibility: "public" | "private", anonymous: boolean) => void;
  onReply: (annotationId: string, body: string, anonymous: boolean) => void;
  onDeleteComment: (annotationId: string) => void;
  onClose: () => void;
  onFocusComment: (annotation: Annotation) => void;
}) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [anonymous, setAnonymous] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyAnonymous, setReplyAnonymous] = useState(false);
  const [focused, setFocused] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);

  // A new draft should be ready to type into without reaching for the mouse.
  useEffect(() => {
    if (draft) composer.current?.focus();
  }, [draft]);

  const sendReply = (annotationId: string) => {
    const text = replyBody.trim();
    if (!text) return;
    onReply(annotationId, text, replyAnonymous);
    setReplyBody("");
    setReplyTo(null);
  };

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    onDraftSubmit(text, visibility, anonymous);
    setBody("");
  };

  return (
    <aside
      data-ui-panel
      style={{
        ...panel,
        width,
        ...(floating
          ? ({ position: "absolute", top: 0, right: 0, bottom: 0, zIndex: 6 } as const)
          : null),
      }}
    >
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
            <blockquote style={quote}>“{trim(draft.text, 220)}”</blockquote>

            <textarea
              ref={composer}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                // Grows with what is written, so a long note isn't typed
                // through a four-line window.
                const el = e.target;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                if (e.key === "Escape") onDraftCancel();
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Add a comment…"
              rows={3}
              style={{
                ...input,
                borderColor: focused
                  ? "rgba(255,200,120,0.55)"
                  : "rgba(255,218,150,0.24)",
              }}
            />

            {/* Captioned, because "Everyone / Only me" and "As me / Anonymous"
                are two different questions and the pair of them side by side
                gave no clue which was which. */}
            <div style={choiceRow}>
              <span style={choiceLabel}>Visible to</span>
              <Segmented
                label="Who can see this"
                options={[
                  ["public", "Everyone"],
                  ["private", "Only me"],
                ]}
                value={visibility}
                onChange={(v) => setVisibility(v as "public" | "private")}
              />
            </div>

            <div style={choiceRow}>
              <span style={choiceLabel}>Post as</span>
              <Segmented
                label="Whose name is on this"
                options={[
                  ["named", "Me"],
                  ["anon", "Anonymous"],
                ]}
                value={anonymous ? "anon" : "named"}
                onChange={(v) => setAnonymous(v === "anon")}
              />
            </div>

            <div style={actionRow}>
              <span style={hint}>⌘↵ to post · esc to cancel</span>
              <button onClick={onDraftCancel} style={ghostButton}>Cancel</button>
              <button
                onClick={submit}
                disabled={!body.trim()}
                style={{
                  ...primaryButton,
                  ...(body.trim() ? null : disabledButton),
                }}
              >
                Comment
              </button>
            </div>
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
            <article
              key={c.id}
              style={{
                ...card,
                ...(c.id === focusedId
                  ? {
                      borderColor: "rgba(255,200,120,0.5)",
                      background: "rgba(255,200,120,0.09)",
                    }
                  : null),
              }}
            >
              <button onClick={() => onFocusComment(c)} style={quoteButton} title="Show in the text">
                “{trim((c.data as { quote?: string })?.quote ?? "", 160)}”
              </button>

              <div style={meta}>
                <Avatar
                  name={commenter(c)}
                  anonymous={Boolean((c.data as { anonymous?: boolean })?.anonymous)}
                  vip={Boolean((c.data as { vip?: boolean })?.vip)}
                />
                <span style={{ color: isVip(c) ? "#ffd98a" : "#ffe0b0" }}>{commenter(c)}</span>
                {/* Honest labelling is the whole deal. A sourced comment is a
                    verbatim excerpt from a real lecture and links to it at
                    the timestamp — quoted from them, not posted by them. */}
                {vipSource(c) ? (
                  <a
                    href={vipSource(c)!.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...vipBadge, textDecoration: "none", cursor: "pointer" }}
                    title={`${vipSource(c)!.title ?? "Source"} — ${vipSource(c)!.channel ?? ""}`}
                  >
                    ▶ lecture
                  </a>
                ) : (
                  isVip(c) && <span style={vipBadge}>AI persona</span>
                )}
                {c.visibility === "private" && <span style={badge}>only me</span>}
                {c.userId && c.userId === currentUserId && (
                  <button onClick={() => onDeleteComment(c.id)} style={deleteButton} title="Delete">
                    Delete
                  </button>
                )}
              </div>

              <p style={commentBody}>{c.comment}</p>

              {/* Replies sit indented under the comment they answer, on a rail,
                  so a thread looks like a thread rather than a run of separate
                  remarks stacked in a column. */}
              {(thread.length > 0 || replyTo === c.id) && (
                <div style={rail}>
                  {thread.length > 0 && (
                    <div style={threadCount}>
                      {thread.length} {thread.length === 1 ? "reply" : "replies"}
                    </div>
                  )}

                  {thread.map((r) => {
                    const who = r.isAnonymous
                      ? "Anonymous"
                      : r.displayName || r.username || "Someone";
                    return (
                      <div key={r.id} style={replyRow}>
                        <Avatar name={who} anonymous={r.isAnonymous} />
                        <div style={{ minWidth: 0 }}>
                          <div style={replyWho}>{who}</div>
                          <div style={replyText}>{r.content}</div>
                        </div>
                      </div>
                    );
                  })}

                  {replyTo === c.id && (
                    <div style={{ marginTop: 9 }}>
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply(c.id);
                          if (e.key === "Escape") setReplyTo(null);
                        }}
                        placeholder="Reply…"
                        rows={3}
                        style={input}
                      />
                      <div style={replyActions}>
                        <Segmented
                          label="Whose name is on this reply"
                          options={[
                            ["named", "As me"],
                            ["anon", "Anonymous"],
                          ]}
                          value={replyAnonymous ? "anon" : "named"}
                          onChange={(v) => setReplyAnonymous(v === "anon")}
                        />
                        <div style={{ flex: 1 }} />
                        <button onClick={() => setReplyTo(null)} style={ghostButton}>Cancel</button>
                        <button onClick={() => sendReply(c.id)} style={primaryButton}>Reply</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {replyTo !== c.id && (
                <button onClick={() => setReplyTo(c.id)} style={replyLink}>
                  {thread.length ? "Add a reply" : "Reply"}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </aside>
  );
}

function commenter(c: Annotation) {
  if ((c.data as { anonymous?: boolean })?.anonymous) return "Anonymous";
  return c.displayName || c.username || "Someone";
}

/** VIP commentary — see scripts/ingest-vip-lecture.mjs. */
function isVip(c: Annotation) {
  return Boolean((c.data as { vip?: boolean })?.vip);
}

type VipSource = { url: string; title?: string; channel?: string };

/** The lecture a sourced VIP comment quotes, if it carries one. */
function vipSource(c: Annotation): VipSource | null {
  const source = (c.data as { source?: VipSource })?.source;
  return source?.url ? source : null;
}

/** A small initial, so a thread can be scanned by who said what. */
function Avatar({ name, anonymous, vip }: { name: string; anonymous?: boolean; vip?: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        ...avatar,
        background: anonymous
          ? "rgba(255,228,192,0.12)"
          : vip
            ? "rgba(255,196,90,0.38)"
            : "rgba(255,200,120,0.22)",
        ...(vip ? { border: "1px solid rgba(255,214,130,0.55)" } : null),
      }}
    >
      {anonymous ? "?" : name.charAt(0).toUpperCase()}
    </span>
  );
}

function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [string, string][];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={segmented} role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{
            ...segment,
            background: value === key ? "rgba(255,200,120,0.22)" : "transparent",
            color: value === key ? "#ffe8c0" : "rgba(255,228,192,0.6)",
          }}
        >
          {text}
        </button>
      ))}
    </div>
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
  margin: 0,
  color: "rgba(255,225,175,0.78)",
  // The passage is the book speaking, so it is set in the book's face.
  fontFamily: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  fontStyle: "italic",
  fontSize: 12,
  lineHeight: 1.55,
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
  padding: "9px 10px",
  resize: "none",
  outline: "none",
  transition: "border-color 140ms",
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
  fontSize: 11,
  padding: "4px 10px",
  whiteSpace: "nowrap",
};

/** A caption and its control on one line, so the pair reads as a question. */
const choiceRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginTop: 9,
};

const choiceLabel: React.CSSProperties = {
  width: 62,
  flexShrink: 0,
  color: "rgba(255,220,160,0.5)",
  fontSize: 11,
};

const actionRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 14,
};

const disabledButton: React.CSSProperties = {
  background: "rgba(255,228,192,0.08)",
  border: "1px solid rgba(255,218,150,0.16)",
  color: "rgba(255,228,192,0.35)",
  cursor: "not-allowed",
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

/* Gold-edged and unmissable: a VIP comment is written in a real person's
   voice, and the label carrying "this is generated" must never be subtle. */
const vipBadge: React.CSSProperties = {
  border: "1px solid rgba(255,196,90,0.55)",
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.5,
  padding: "1px 6px",
  color: "#ffd98a",
  background: "rgba(255,196,90,0.12)",
  textTransform: "uppercase",
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

/** The rail is the thread: one line down the left, everything hanging off it. */
const rail: React.CSSProperties = {
  marginTop: 10,
  marginLeft: 4,
  paddingLeft: 11,
  borderLeft: "2px solid rgba(255,200,120,0.28)",
};

const threadCount: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  color: "rgba(255,220,160,0.45)",
  marginBottom: 7,
};

const replyRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-start",
  marginBottom: 9,
};

const replyWho: React.CSSProperties = {
  color: "rgba(255,214,150,0.85)",
  fontSize: 11,
  marginBottom: 2,
};

const replyText: React.CSSProperties = {
  color: "rgba(255,236,206,0.9)",
  fontSize: 12,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
};

const replyActions: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 7,
  flexWrap: "wrap",
};

const avatar: React.CSSProperties = {
  flexShrink: 0,
  width: 20,
  height: 20,
  borderRadius: "50%",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 10.5,
  fontWeight: 600,
  color: "#ffe8c0",
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
  flex: 1,
  fontSize: 10.5,
  color: "rgba(255,220,160,0.38)",
};

const empty: React.CSSProperties = {
  color: "rgba(255,220,160,0.45)",
  fontSize: 12,
  lineHeight: 1.6,
  margin: "6px 2px",
};
