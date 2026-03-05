import React from 'react';
import { Reply } from '@/lib/replies';

interface ReplyThreadProps {
  reply: Reply;
  children?: Reply[];
  annotationId: string;
  currentUserId?: string;
  onReply: (replyId: string) => void;
  onDelete: (replyId: string) => void;
  showReplyInput: string | null;
  replyText: string;
  replyAnonymous: boolean;
  onReplyTextChange: (text: string) => void;
  onReplyAnonymousChange: (anonymous: boolean) => void;
  onSubmitReply: (annotationId: string) => void;
  depth?: number;
}

export default function ReplyThread({
  reply,
  children = [],
  annotationId,
  currentUserId,
  onReply,
  onDelete,
  showReplyInput,
  replyText,
  replyAnonymous,
  onReplyTextChange,
  onReplyAnonymousChange,
  onSubmitReply,
  depth = 0
}: ReplyThreadProps) {
  const isOwner = reply.userId === currentUserId;
  const showInput = showReplyInput === reply.id;

  return (
    <div className="mb-3" style={{ marginLeft: depth > 0 ? '20px' : '0' }}>
      <div className="p-3" style={{
        background: "rgba(255, 255, 255, 0.08)",
        borderRadius: "12px"
      }}>
        {/* Reply Header */}
        <div className="flex items-center gap-2 mb-2">
          <div
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              overflow: "hidden",
              border: "1px solid rgba(255, 255, 255, 0.3)"
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
                  fontWeight: "600"
                }}
              >
                ?
              </div>
            ) : reply.avatarUrl ? (
              <img src={reply.avatarUrl} alt={reply.displayName || reply.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
                  fontWeight: "600"
                }}
              >
                {(reply.displayName || reply.username || "U")[0].toUpperCase()}
              </div>
            )}
          </div>
          <p className="text-xs font-semibold" style={{ color: "rgba(255, 255, 255, 0.9)", fontFamily: "'Crimson Text', serif" }}>
            {reply.isAnonymous ? "Anonymous" : (reply.displayName || reply.username || "Anonymous")}
          </p>
        </div>

        {/* Reply Content */}
        <p className="text-sm mb-2" style={{ color: "#ffffff", fontFamily: "'Crimson Text', serif" }}>
          {reply.content}
        </p>

        {/* Reply Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => onReply(reply.id)}
            className="text-xs transition-all hover:scale-105"
            style={{
              color: "rgba(255, 255, 255, 0.7)",
              fontFamily: "'Crimson Text', serif",
              fontWeight: "500"
            }}
          >
            Reply
          </button>
          {isOwner && (
            <button
              onClick={() => onDelete(reply.id)}
              className="text-xs transition-all hover:scale-105"
              style={{
                color: "#ff6b6b",
                fontFamily: "'Crimson Text', serif"
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
                placeholder="Write a reply..."
                className="flex-1 px-3 py-2 text-sm"
                style={{
                  background: "rgba(255, 255, 255, 0.1)",
                  border: "1px solid rgba(255, 255, 255, 0.3)",
                  borderRadius: "8px",
                  color: "#ffffff",
                  fontFamily: "'Crimson Text', serif",
                  outline: "none"
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
                  fontWeight: "500"
                }}
              >
                Send
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs" style={{ color: "rgba(255, 255, 255, 0.8)", fontFamily: "'Crimson Text', serif" }}>
              <input
                type="checkbox"
                checked={replyAnonymous}
                onChange={(e) => onReplyAnonymousChange(e.target.checked)}
                style={{
                  accentColor: "#667eea",
                  cursor: "pointer"
                }}
              />
              Post anonymously
            </label>
          </div>
        )}
      </div>

      {/* Nested Replies */}
      {children.length > 0 && (
        <div className="mt-2">
          {children.map(childReply => (
            <ReplyThread
              key={childReply.id}
              reply={childReply}
              children={[]} // Children will be handled by parent organizeReplies
              annotationId={annotationId}
              currentUserId={currentUserId}
              onReply={onReply}
              onDelete={onDelete}
              showReplyInput={showReplyInput}
              replyText={replyText}
              replyAnonymous={replyAnonymous}
              onReplyTextChange={onReplyTextChange}
              onReplyAnonymousChange={onReplyAnonymousChange}
              onSubmitReply={onSubmitReply}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
