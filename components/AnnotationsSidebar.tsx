import React from "react";
import { Reply } from "@/lib/replies";
import ReplyItem from "./ReplyItem";

interface Annotation {
  id: string;
  pageNumber: number;
  type: string;
  data: any;
  comment?: string;
  userId?: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
}

interface AnnotationsSidebarProps {
  show: boolean;
  pageNumber: number;
  annotations: Annotation[];
  replies: { [annotationId: string]: Reply[] };
  expandedComments: Set<string>;
  showReplyInput: string | null;
  replyText: string;
  replyAnonymous: boolean;
  currentUserId?: string;
  onClose: () => void;
  onToggleExpanded: (annotationId: string) => void;
  onReplyClick: (annotationId: string, type: "annotation" | "reply", parentReplyId?: string) => void;
  onDeleteAnnotation: (annotationId: string) => void;
  onDeleteReply: (replyId: string, annotationId: string) => void;
  onReplyTextChange: (text: string) => void;
  onReplyAnonymousChange: (anonymous: boolean) => void;
  onSubmitReply: (annotationId: string) => void;
}

export default function AnnotationsSidebar({
  show,
  pageNumber,
  annotations,
  replies,
  expandedComments,
  showReplyInput,
  replyText,
  replyAnonymous,
  currentUserId,
  onClose,
  onToggleExpanded,
  onReplyClick,
  onDeleteAnnotation,
  onDeleteReply,
  onReplyTextChange,
  onReplyAnonymousChange,
  onSubmitReply,
}: AnnotationsSidebarProps) {
  if (!show) return null;

  // Helper to organize replies into a tree structure
  const organizeReplies = (allReplies: Reply[]) => {
    const topLevel: Reply[] = [];
    const children: { [parentId: string]: Reply[] } = {};

    allReplies.forEach((reply) => {
      if (!reply.parentReplyId) {
        topLevel.push(reply);
      } else {
        if (!children[reply.parentReplyId]) {
          children[reply.parentReplyId] = [];
        }
        children[reply.parentReplyId].push(reply);
      }
    });

    return { topLevel, children };
  };

  return (
    <div
      className="w-80 flex flex-col overflow-hidden"
      style={{
        height: "100%",
        background: "rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(80px) saturate(200%)",
        WebkitBackdropFilter: "blur(80px) saturate(200%)",
        borderRight: "1px solid rgba(255, 255, 255, 0.25)",
      }}
    >
      <div
        className="p-5 flex items-center justify-between"
        style={{
          borderBottom: "1px solid rgba(255, 255, 255, 0.15)",
        }}
      >
        <h3
          className="font-medium px-4 py-2"
          style={{
            fontFamily: "'Crimson Text', serif",
            color: "#ffffff",
            fontSize: "16px",
            background: "rgba(255, 255, 255, 0.18)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            border: "1px solid rgba(255, 255, 255, 0.25)",
            borderRadius: "10px",
            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.15)",
            fontWeight: 600,
          }}
        >
          Comments (Page {pageNumber})
        </h3>
        <button
          onClick={onClose}
          className="transition-all hover:scale-110"
          style={{
            color: "#ffffff",
            width: "32px",
            height: "32px",
            borderRadius: "10px",
            background: "rgba(255, 255, 255, 0.18)",
            backdropFilter: "blur(20px) saturate(180%)",
            WebkitBackdropFilter: "blur(20px) saturate(180%)",
            border: "1px solid rgba(255, 255, 255, 0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "18px",
            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.15)",
            fontWeight: 600,
          }}
        >
          ✕
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto p-4"
        style={{ gap: "12px", display: "flex", flexDirection: "column" }}
      >
        {annotations.length === 0 ? (
          <p
            className="text-sm text-center py-8"
            style={{
              color: "rgba(255, 255, 255, 0.6)",
              fontFamily: "'Crimson Text', serif",
            }}
          >
            No comments on this page
          </p>
        ) : (
          annotations.map((annotation) => {
            const annotationReplies = replies[annotation.id] || [];
            const isExpanded = expandedComments.has(annotation.id);
            const { topLevel, children } = organizeReplies(annotationReplies);

            return (
              <div
                key={annotation.id}
                className="p-4 transition-all duration-200"
                style={{
                  background: "rgba(255, 255, 255, 0.18)",
                  border: "1px solid rgba(255, 255, 255, 0.3)",
                  backdropFilter: "blur(20px) saturate(180%)",
                  WebkitBackdropFilter: "blur(20px) saturate(180%)",
                  borderRadius: "16px",
                  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.4)",
                }}
              >
                {/* User Profile Header */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="flex items-center justify-center flex-shrink-0"
                    style={{
                      borderRadius: "50%",
                      width: "36px",
                      height: "36px",
                      overflow: "hidden",
                      border: "2px solid rgba(255, 255, 255, 0.3)",
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
                    }}
                  >
                    {annotation.avatarUrl ? (
                      <img
                        src={annotation.avatarUrl}
                        alt={annotation.displayName || annotation.username}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "white",
                          fontSize: "14px",
                          fontWeight: "600",
                        }}
                      >
                        {(annotation.displayName || annotation.username || "U")[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p
                      className="text-sm font-semibold"
                      style={{
                        color: "#ffffff",
                        fontFamily: "'Crimson Text', serif",
                      }}
                    >
                      {annotation.displayName || annotation.username || "Anonymous"}
                    </p>
                  </div>
                </div>

                {/* Selected Text */}
                <p
                  className="text-sm italic px-3 py-2 mb-3"
                  style={{
                    color: "#ffffff",
                    background: "rgba(255, 235, 59, 0.25)",
                    borderRadius: "8px",
                    border: "1px solid rgba(255, 235, 59, 0.4)",
                    fontFamily: "'Crimson Text', serif",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  &quot;{annotation.data?.selectedText}&quot;
                </p>

                {/* Comment */}
                <p
                  className="text-sm mb-3"
                  style={{
                    color: "#ffffff",
                    fontFamily: "'Crimson Text', serif",
                  }}
                >
                  {annotation.comment}
                </p>

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => onToggleExpanded(annotation.id)}
                    className="text-xs transition-all hover:scale-105"
                    style={{
                      color: "rgba(255, 255, 255, 0.8)",
                      fontFamily: "'Crimson Text', serif",
                      fontWeight: "500",
                    }}
                  >
                    {isExpanded ? "Hide" : "Show"} Replies ({annotationReplies.length})
                  </button>
                  <button
                    onClick={() => onReplyClick(annotation.id, "annotation")}
                    className="text-xs transition-all hover:scale-105"
                    style={{
                      color: "rgba(255, 255, 255, 0.8)",
                      fontFamily: "'Crimson Text', serif",
                      fontWeight: "500",
                    }}
                  >
                    Reply
                  </button>
                  {annotation.userId === currentUserId && (
                    <button
                      onClick={() => onDeleteAnnotation(annotation.id)}
                      className="text-xs transition-all hover:scale-105"
                      style={{
                        color: "#ff6b6b",
                        fontFamily: "'Crimson Text', serif",
                        fontWeight: "500",
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>

                {/* Reply Input for Annotation */}
                {showReplyInput === annotation.id && (
                  <div className="mt-3">
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={replyText}
                        onChange={(e) => onReplyTextChange(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onSubmitReply(annotation.id)}
                        placeholder="Write a reply..."
                        className="flex-1 px-3 py-2 text-sm"
                        style={{
                          background: "rgba(255, 255, 255, 0.1)",
                          border: "1px solid rgba(255, 255, 255, 0.3)",
                          borderRadius: "8px",
                          color: "#ffffff",
                          fontFamily: "'Crimson Text', serif",
                          outline: "none",
                        }}
                      />
                      <button
                        onClick={() => onSubmitReply(annotation.id)}
                        className="px-4 py-2 text-sm transition-all hover:scale-105"
                        style={{
                          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                          color: "white",
                          borderRadius: "8px",
                          border: "none",
                          fontFamily: "'Crimson Text', serif",
                          fontWeight: "500",
                        }}
                      >
                        Send
                      </button>
                    </div>
                    <label
                      className="flex items-center gap-2 text-xs"
                      style={{ color: "rgba(255, 255, 255, 0.8)", fontFamily: "'Crimson Text', serif" }}
                    >
                      <input
                        type="checkbox"
                        checked={replyAnonymous}
                        onChange={(e) => onReplyAnonymousChange(e.target.checked)}
                        style={{
                          accentColor: "#667eea",
                          cursor: "pointer",
                        }}
                      />
                      Post anonymously
                    </label>
                  </div>
                )}

                {/* Replies List with Nesting */}
                {isExpanded && topLevel.length > 0 && (
                  <div className="mt-3 pl-4 border-l-2" style={{ borderColor: "rgba(255, 255, 255, 0.2)" }}>
                    {topLevel.map((reply) => (
                      <ReplyItem
                        key={reply.id}
                        reply={reply}
                        currentUserId={currentUserId}
                        annotationId={annotation.id}
                        showReplyInput={showReplyInput}
                        replyText={replyText}
                        replyAnonymous={replyAnonymous}
                        onReplyClick={(replyId) => onReplyClick(replyId, "reply", replyId)}
                        onDelete={onDeleteReply}
                        onReplyTextChange={onReplyTextChange}
                        onReplyAnonymousChange={onReplyAnonymousChange}
                        onSubmitReply={onSubmitReply}
                        nestedReplies={children[reply.id] || []}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
