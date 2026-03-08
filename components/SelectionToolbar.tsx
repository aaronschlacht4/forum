"use client";

import { useEffect, useRef } from "react";
import { X, MessageCirclePlus, Book, Sparkles } from "lucide-react";

const COLORS = [
  { label: "Yellow",  solid: "#F9C905", highlight: "rgba(249, 201,   5, 0.45)" },
  { label: "Pink",    solid: "#FF4F7B", highlight: "rgba(255,  79, 123, 0.40)" },
  { label: "Blue",    solid: "#3B82F6", highlight: "rgba( 59, 130, 246, 0.40)" },
  { label: "Green",   solid: "#22C55E", highlight: "rgba( 34, 197,  94, 0.40)" },
];

interface SelectionToolbarProps {
  position: { x: number; y: number } | null; // screen coords: top-center of selection
  onHighlight: (color: string) => void;
  onComment: () => void;
  onDefine: () => void;
  onAIChat: () => void;
  onDismiss: () => void;
}

export default function SelectionToolbar({ position, onHighlight, onComment, onDefine, onAIChat, onDismiss }: SelectionToolbarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!position) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismissRef.current();
      }
    };
    // Delay so the mouseup that triggered the toolbar doesn't instantly close it
    const t = setTimeout(() => document.addEventListener("mousedown", handle), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handle); };
  }, [position]);

  if (!position) return null;

  const W = 312;
  const left = Math.max(8, Math.min(position.x - W / 2, window.innerWidth - W - 8));
  const top = position.y - 52; // 52px above the selection top edge
  const clampedTop = Math.max(8, top);

  // Arrow x relative to popover left edge, clamped inside
  const arrowX = Math.max(14, Math.min(position.x - left, W - 14));
  const showArrowBelow = top >= 8; // arrow points down toward selection

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left,
        top: clampedTop,
        width: `${W}px`,
        height: "44px",
        zIndex: 200,
        background: "rgba(255, 255, 255, 0.97)",
        backdropFilter: "blur(20px)",
        borderRadius: "8px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.08)",
        border: "1px solid rgba(0,0,0,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        padding: "0 30px 0 30px",
      }}
    >
      {/* Color swatches — grouped as one flex unit */}
      <div style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 }}>
        {COLORS.map((c) => (
          <button
            key={c.label}
            title={`Highlight ${c.label}`}
            onMouseDown={(e) => { e.preventDefault(); onHighlight(c.highlight); }}
            style={{
              width: "22px",
              height: "22px",
              borderRadius: "50%",
              background: c.solid,
              border: "2px solid rgba(0,0,0,0.10)",
              cursor: "pointer",
              flexShrink: 0,
              transition: "transform 0.1s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.2)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          />
        ))}
      </div>

      {/* Divider */}
      <div style={{ width: "1px", height: "26px", background: "rgba(0,0,0,0.12)", flexShrink: 0 }} />

      {/* Dismiss */}
      <button
        title="Dismiss"
        onClick={onDismiss}
        style={{
          width: "34px",
          height: "34px",
          borderRadius: "7px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#888",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#333")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#888")}
      >
        <X size={18} strokeWidth={1.5} />
      </button>

      {/* Divider */}
      <div style={{ width: "1px", height: "26px", background: "rgba(0,0,0,0.12)", flexShrink: 0 }} />

      {/* Comment button */}
      <button
        title="Add comment"
        onClick={onComment}
        style={{
          width: "34px",
          height: "34px",
          borderRadius: "7px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#888",
          flexShrink: 0,
        }}
      >
        <MessageCirclePlus size={18} strokeWidth={1.5} />
      </button>

      {/* Divider */}
      <div style={{ width: "1px", height: "26px", background: "rgba(0,0,0,0.12)", flexShrink: 0 }} />

      {/* Define button */}
      <button
        title="Define"
        onMouseDown={(e) => { e.preventDefault(); onDefine(); }}
        style={{
          width: "34px",
          height: "34px",
          borderRadius: "7px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#888",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#3B82F6")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#888")}
      >
        <Book size={18} strokeWidth={1.5} />
      </button>

      {/* Divider */}
      <div style={{ width: "1px", height: "26px", background: "rgba(0,0,0,0.12)", flexShrink: 0 }} />

      {/* AI Chat button */}
      <button
        title="Ask Claude"
        onMouseDown={(e) => { e.preventDefault(); onAIChat(); }}
        style={{
          width: "34px",
          height: "34px",
          borderRadius: "7px",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#888",
          flexShrink: 0,
          marginLeft: "-3px",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#a855f7")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#888")}
      >
        <Sparkles size={18} strokeWidth={1.5} />
      </button>

      {/* Arrow caret pointing down to selection */}
      {showArrowBelow && (
        <div
          style={{
            position: "absolute",
            bottom: "-7px",
            left: `${arrowX}px`,
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "7px solid transparent",
            borderRight: "7px solid transparent",
            borderTop: "7px solid rgba(255,255,255,0.97)",
            filter: "drop-shadow(0 2px 1px rgba(0,0,0,0.06))",
          }}
        />
      )}
    </div>
  );
}
