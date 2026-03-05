import React from "react";

interface CommentModalProps {
  show: boolean;
  selectedText: string;
  commentText: string;
  visibility: "public" | "private";
  onCommentTextChange: (text: string) => void;
  onVisibilityChange: (visibility: "public" | "private") => void;
  onSave: () => void;
  onClose: () => void;
}

export default function CommentModal({
  show,
  selectedText,
  commentText,
  visibility,
  onCommentTextChange,
  onVisibilityChange,
  onSave,
  onClose,
}: CommentModalProps) {
  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
    >
      <div
        className="p-6"
        style={{
          background: "rgba(255, 255, 255, 0.15)",
          backdropFilter: "blur(80px) saturate(200%)",
          WebkitBackdropFilter: "blur(80px) saturate(200%)",
          border: "1px solid rgba(255, 255, 255, 0.25)",
          borderRadius: "24px",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
          minWidth: "400px",
          maxWidth: "500px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          className="text-xl font-semibold mb-4"
          style={{
            fontFamily: "'Crimson Text', serif",
            color: "#ffffff",
            textShadow: "0 0 3px rgba(0, 0, 0, 0.3)",
          }}
        >
          Add Comment
        </h3>
        <div className="mb-4">
          <p
            className="text-sm mb-2"
            style={{
              color: "rgba(255, 255, 255, 0.7)",
              fontFamily: "'Crimson Text', serif",
            }}
          >
            Selected text:
          </p>
          <p
            className="text-sm italic px-3 py-2 mb-4"
            style={{
              color: "#ffffff",
              background: "rgba(255, 235, 59, 0.25)",
              borderRadius: "8px",
              border: "1px solid rgba(255, 235, 59, 0.4)",
              fontFamily: "'Crimson Text', serif",
              backdropFilter: "blur(10px)",
            }}
          >
            &quot;{selectedText}&quot;
          </p>
          <textarea
            value={commentText}
            onChange={(e) => onCommentTextChange(e.target.value)}
            placeholder="Write your comment..."
            rows={4}
            className="w-full px-4 py-3 text-sm"
            style={{
              background: "rgba(255, 255, 255, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              borderRadius: "12px",
              color: "#ffffff",
              fontFamily: "'Crimson Text', serif",
              outline: "none",
              resize: "vertical",
            }}
          />
          <div className="mt-3 flex gap-3">
            <label
              className="flex items-center gap-2 text-sm cursor-pointer"
              style={{ color: "rgba(255, 255, 255, 0.9)", fontFamily: "'Crimson Text', serif" }}
            >
              <input
                type="radio"
                name="visibility"
                checked={visibility === "public"}
                onChange={() => onVisibilityChange("public")}
                style={{
                  accentColor: "#667eea",
                  cursor: "pointer",
                }}
              />
              Public
            </label>
            <label
              className="flex items-center gap-2 text-sm cursor-pointer"
              style={{ color: "rgba(255, 255, 255, 0.9)", fontFamily: "'Crimson Text', serif" }}
            >
              <input
                type="radio"
                name="visibility"
                checked={visibility === "private"}
                onChange={() => onVisibilityChange("private")}
                style={{
                  accentColor: "#667eea",
                  cursor: "pointer",
                }}
              />
              Private
            </label>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm transition-all hover:scale-105"
            style={{
              background: "rgba(255, 255, 255, 0.1)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              borderRadius: "10px",
              color: "#ffffff",
              fontFamily: "'Crimson Text', serif",
              fontWeight: "500",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="px-6 py-2 text-sm transition-all hover:scale-105"
            style={{
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "white",
              borderRadius: "10px",
              border: "none",
              fontFamily: "'Crimson Text', serif",
              fontWeight: "500",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
