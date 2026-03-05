import React from "react";
import { Reply } from "@/lib/replies";

interface ReplyItemProps {
  reply: Reply;
  currentUserId?: string;
  annotationId: string;
  showReplyInput: string | null;
  replyText: string;
  replyAnonymous: boolean;
  onReplyClick: (replyId: string) => void;
  onDelete: (replyId: string, annotationId: string) => void;
  onReplyTextChange: (text: string) => void;
  onReplyAnonymousChange: (anonymous: boolean) => void;
  onSubmitReply: (annotationId: string) => void;
  nestedReplies?: Reply[];
}

export default function ReplyItem({
  reply,
  currentUserId,
  annotationId,
  showReplyInput,
  replyText,
  replyAnonymous,
  onReplyClick,
  onDelete,
  onReplyTextChange,
  onReplyAnonymousChange,
  onSubmitReply,
  nestedReplies = [],
}: ReplyItemProps) {
  const isOwner = reply.userId === currentUserId;
  const showInput = showReplyInput === reply.id;

  return (
    <div className="mb-3">
      <div
        className="p-3"
        style={{
          background: "rgba(255, 255, 255, 0.08)",
          borderRadius: "12px",
        }}
      >
        {/* Reply Header */}
        <div className="flex items-center gap-2 mb-2">
          <div
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              overflow: "hidden",
              border: "1px solid rgba(255, 255, 255, 0.3)",
            }}
          >
            {reply.isAnonymous ? (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "linear-gradient(135deg, #9e9e9e 0%, #757575 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: "10px",
                  fontWeight: "600",
                }}
              >
                ?
              </div>
            ) : reply.avatarUrl ? (
              <img
                src={reply.avatarUrl}
                alt={reply.displayName || reply.username}
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
                  fontSize: "10px",
                  fontWeight: "600",
                }}
              >
                {(reply.displayName || reply.username || "U")[0].toUpperCase()}
              </div>
            )}
          </div>
          <p
            className="text-xs font-semibold"
            style={{ color: "rgba(255, 255, 255, 0.9)", fontFamily: "'Crimson Text', serif" }}
          >
            {reply.isAnonymous ? "Anonymous" : reply.displayName || reply.username || "Anonymous"}
          </p>
        </div>

        {/* Reply Content */}
        <p className="text-sm mb-2" style={{ color: "#ffffff", fontFamily: "'Crimson Text', serif" }}>
          {reply.content}
        </p>

        {/* Reply Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => onReplyClick(reply.id)}
            className="text-xs transition-all hover:scale-105"
            style={{
              color: "rgba(255, 255, 255, 0.7)",
              fontFamily: "'Crimson Text', serif",
              fontWeight: "500",
            }}
          >
            Reply
          </button>
          {isOwner && (
            <button
              onClick={() => onDelete(reply.id, annotationId)}
              className="text-xs transition-all hover:scale-105"
              style={{
                color: "#ff6b6b",
                fontFamily: "'Crimson Text', serif",
              }}
            >
              Delete
            </button>
          )}
        </div>

        {/* Reply Input */}
        {showInput && (
          <div className="mt-3">
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => onReplyTextChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onSubmitReply(annotationId)}
                placeholder={`Replying to ${reply.isAnonymous ? "Anonymous" : reply.displayName}...`}
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
                onClick={() => onSubmitReply(annotationId)}
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
                style={{ accentColor: "#667eea", cursor: "pointer" }}
              />
              Post anonymously
            </label>
          </div>
        )}
      </div>

      {/* Nested Replies */}
      {nestedReplies.length > 0 && (
        <div className="mt-3 pl-4 border-l-2" style={{ borderColor: "rgba(255, 255, 255, 0.15)" }}>
          {nestedReplies.map((nestedReply) => (
            <div
              key={nestedReply.id}
              className="mb-2 p-2"
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                borderRadius: "8px",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    overflow: "hidden",
                    border: "1px solid rgba(255, 255, 255, 0.3)",
                  }}
                >
                  {nestedReply.isAnonymous ? (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        background: "linear-gradient(135deg, #9e9e9e 0%, #757575 100%)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        fontSize: "8px",
                        fontWeight: "600",
                      }}
                    >
                      ?
                    </div>
                  ) : nestedReply.avatarUrl ? (
                    <img
                      src={nestedReply.avatarUrl}
                      alt={nestedReply.displayName || nestedReply.username}
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
                        fontSize: "8px",
                        fontWeight: "600",
                      }}
                    >
                      {(nestedReply.displayName || nestedReply.username || "U")[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <p
                  className="text-xs font-semibold"
                  style={{ color: "rgba(255, 255, 255, 0.9)", fontFamily: "'Crimson Text', serif" }}
                >
                  {nestedReply.isAnonymous
                    ? "Anonymous"
                    : nestedReply.displayName || nestedReply.username || "Anonymous"}
                </p>
              </div>
              <p className="text-sm" style={{ color: "#ffffff", fontFamily: "'Crimson Text', serif" }}>
                {nestedReply.content}
              </p>
              {nestedReply.userId === currentUserId && (
                <button
                  onClick={() => onDelete(nestedReply.id, annotationId)}
                  className="mt-1 text-xs transition-all hover:scale-105"
                  style={{
                    color: "#ff6b6b",
                    fontFamily: "'Crimson Text', serif",
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
