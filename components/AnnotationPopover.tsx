"use client";

import React, { useEffect, useRef } from "react";
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

interface AnnotationPopoverProps {
  annotation: Annotation | null;
  position: { x: number; y: number } | null;
  replies: Reply[];
  expandedComments: Set<string>;
  showReplyInput: string | null;
  replyText: string;
  replyAnonymous: boolean;
  currentUserId?: string;
  asSidebar?: boolean;
  onClose: () => void;
  onToggleExpanded: (annotationId: string) => void;
  onReplyClick: (annotationId: string, type: "annotation" | "reply", parentReplyId?: string) => void;
  onDeleteAnnotation: (annotationId: string) => void;
  onDeleteReply: (replyId: string, annotationId: string) => void;
  onReplyTextChange: (text: string) => void;
  onReplyAnonymousChange: (anonymous: boolean) => void;
  onSubmitReply: (annotationId: string) => void;
}

export default function AnnotationPopover({
  annotation,
  position,
  replies,
  expandedComments,
  showReplyInput,
  replyText,
  replyAnonymous,
  currentUserId,
  asSidebar,
  onClose,
  onToggleExpanded,
  onReplyClick,
  onDeleteAnnotation,
  onDeleteReply,
  onReplyTextChange,
  onReplyAnonymousChange,
  onSubmitReply,
}: AnnotationPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!annotation || asSidebar) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay so the click that opened the popover doesn't immediately close it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [annotation, onClose, asSidebar]);

  if (!annotation) return null;
  if (!asSidebar && !position) return null;

  const isExpanded = expandedComments.has(annotation.id);
  const topLevel: Reply[] = [];
  const children: { [parentId: string]: Reply[] } = {};
  replies.forEach((reply) => {
    if (!reply.parentReplyId) {
      topLevel.push(reply);
    } else {
      if (!children[reply.parentReplyId]) children[reply.parentReplyId] = [];
      children[reply.parentReplyId].push(reply);
    }
  });

  const containerStyle: React.CSSProperties = asSidebar
    ? { padding: "16px" }
    : (() => {
        const POPOVER_WIDTH = 320;
        const left = Math.min(position!.x, window.innerWidth - POPOVER_WIDTH - 12);
        const top = Math.max(8, Math.min(position!.y, window.innerHeight - 80));
        return {
          position: "fixed" as const,
          left,
          top,
          width: `${POPOVER_WIDTH}px`,
          maxHeight: "80vh",
          overflowY: "auto" as const,
          zIndex: 100,
          background: "rgba(20, 30, 25, 0.85)",
          backdropFilter: "blur(80px) saturate(200%)",
          WebkitBackdropFilter: "blur(80px) saturate(200%)",
          border: "1px solid rgba(255, 255, 255, 0.25)",
          borderRadius: "16px",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
          padding: "16px",
        };
      })();

  return (
    <div
      ref={popoverRef}
      style={containerStyle}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            style={{
              borderRadius: "50%",
              width: "32px",
              height: "32px",
              overflow: "hidden",
              border: "2px solid rgba(255, 255, 255, 0.3)",
              flexShrink: 0,
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
                  fontSize: "13px",
                  fontWeight: "600",
                }}
              >
                {(annotation.displayName || annotation.username || "U")[0].toUpperCase()}
              </div>
            )}
          </div>
          <p
            style={{
              color: "#ffffff",
              fontFamily: "'Crimson Text', serif",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {annotation.displayName || annotation.username || "Anonymous"}
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            color: "rgba(255,255,255,0.6)",
            fontSize: "18px",
            lineHeight: 1,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 6px",
          }}
        >
          ✕
        </button>
      </div>

      {/* Selected Text Quote */}
      {annotation.data?.selectedText && (
        <p
          style={{
            color: "#ffffff",
            background: "rgba(255, 235, 59, 0.2)",
            border: "1px solid rgba(255, 235, 59, 0.35)",
            borderRadius: "8px",
            padding: "8px 12px",
            fontFamily: "'Crimson Text', serif",
            fontSize: "13px",
            fontStyle: "italic",
            marginBottom: "10px",
          }}
        >
          &quot;{annotation.data.selectedText}&quot;
        </p>
      )}

      {/* Comment Body */}
      <p
        style={{
          color: "#ffffff",
          fontFamily: "'Crimson Text', serif",
          fontSize: "14px",
          marginBottom: "12px",
        }}
      >
        {annotation.comment}
      </p>

      {/* Action Buttons */}
      <div className="flex items-center gap-3" style={{ marginBottom: "10px" }}>
        <button
          onClick={() => onToggleExpanded(annotation.id)}
          style={{
            color: "rgba(255,255,255,0.75)",
            fontFamily: "'Crimson Text', serif",
            fontSize: "13px",
            fontWeight: 500,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {isExpanded ? "Hide" : "Show"} Replies ({replies.length})
        </button>
        <button
          onClick={() => onReplyClick(annotation.id, "annotation")}
          style={{
            color: "rgba(255,255,255,0.75)",
            fontFamily: "'Crimson Text', serif",
            fontSize: "13px",
            fontWeight: 500,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          Reply
        </button>
        {annotation.userId === currentUserId && (
          <button
            onClick={() => onDeleteAnnotation(annotation.id)}
            style={{
              color: "#ff6b6b",
              fontFamily: "'Crimson Text', serif",
              fontSize: "13px",
              fontWeight: 500,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Delete
          </button>
        )}
      </div>

      {/* Reply Input */}
      {showReplyInput === annotation.id && (
        <div style={{ marginBottom: "10px" }}>
          <div className="flex gap-2" style={{ marginBottom: "6px" }}>
            <input
              type="text"
              value={replyText}
              onChange={(e) => onReplyTextChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onSubmitReply(annotation.id)}
              placeholder="Write a reply..."
              style={{
                flex: 1,
                padding: "8px 12px",
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: "8px",
                color: "#ffffff",
                fontFamily: "'Crimson Text', serif",
                fontSize: "13px",
                outline: "none",
              }}
            />
            <button
              onClick={() => onSubmitReply(annotation.id)}
              style={{
                padding: "8px 14px",
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                color: "white",
                borderRadius: "8px",
                border: "none",
                fontFamily: "'Crimson Text', serif",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Send
            </button>
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              color: "rgba(255,255,255,0.75)",
              fontFamily: "'Crimson Text', serif",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={replyAnonymous}
              onChange={(e) => onReplyAnonymousChange(e.target.checked)}
              style={{ accentColor: "#667eea", cursor: "pointer" }}
            />
            Post anonymously
          </label>
        </div>
      )}

      {/* Replies */}
      {isExpanded && topLevel.length > 0 && (
        <div
          style={{
            paddingLeft: "12px",
            borderLeft: "2px solid rgba(255,255,255,0.2)",
            marginTop: "4px",
          }}
        >
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
}
