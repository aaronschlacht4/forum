import React from "react";
import {
  Home,
  ChevronLeft,
  ChevronRight,
  MousePointer2,
  Highlighter,
  Pencil,
  MessageCirclePlus,
  Eraser,
} from "lucide-react";

interface ToolbarProps {
  currentTool: "none" | "highlight" | "pen" | "text";
  pageNumber: number;
  numPages: number;
  hasSelectedText: boolean;
  onToolChange: (tool: "none" | "highlight" | "pen" | "text") => void;
  onChangePage: (delta: number) => void;
  onAddComment: () => void;
  onClearAnnotations: () => void;
  onHomeClick: () => void;
}

export default function Toolbar({
  currentTool,
  pageNumber,
  numPages,
  hasSelectedText,
  onToolChange,
  onChangePage,
  onAddComment,
  onClearAnnotations,
  onHomeClick,
}: ToolbarProps) {
  const iconBtn = (active = false, disabled = false) => {
    return {
      className: "flex items-center justify-center transition-all duration-300",
      style: {
        width: "51px",
        height: "51px",
        borderRadius: "13px",
        border: "1px solid rgba(255, 255, 255, 0.3)",
        background: active
          ? "linear-gradient(135deg, rgba(102, 126, 234, 0.7) 0%, rgba(118, 75, 162, 0.7) 100%)"
          : "rgba(255, 255, 255, 0.18)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        boxShadow: active
          ? "0 4px 20px rgba(102, 126, 234, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.5), 0 0 20px rgba(102, 126, 234, 0.3)"
          : "0 2px 10px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      },
    };
  };

  const iconClass = "transition-all duration-300";
  const iconStyle = {
    width: "23px",
    height: "23px",
    strokeWidth: 1.4,
    color: "#ffffff",
    filter: "drop-shadow(0 1px 1px rgba(0, 0, 0, 0.12))",
  };

  return (
    <div
      className="absolute flex flex-col items-center z-40"
      style={{
        right: "28px",
        top: "50%",
        transform: "translateY(-50%)",
        height: "80%",
        padding: "19px 13px",
        background: "rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(80px) saturate(200%)",
        WebkitBackdropFilter: "blur(80px) saturate(200%)",
        border: "1px solid rgba(255, 255, 255, 0.25)",
        borderRadius: "22px",
        boxShadow: "0 20px 60px rgba(0, 0, 0, 0.12), inset 0 2px 0 rgba(255, 255, 255, 0.3)",
        gap: "10px",
        justifyContent: "space-between",
      }}
    >
      {/* Top section - Home & Comments */}
      <button onClick={onHomeClick} {...iconBtn(false)} title="Home">
        <Home className={iconClass} style={iconStyle} />
      </button>

      {/* Page Navigation */}
      <button
        onClick={() => onChangePage(-1)}
        disabled={pageNumber <= 1}
        {...iconBtn(false, pageNumber <= 1)}
        title="Previous page"
      >
        <ChevronLeft className={iconClass} style={iconStyle} />
      </button>

      <div
        className="text-xs font-medium flex items-center justify-center"
        style={{
          fontFamily: "'Crimson Text', serif",
          background: "rgba(255, 255, 255, 0.18)",
          borderRadius: "13px",
          border: "1px solid rgba(255, 255, 255, 0.3)",
          width: "51px",
          height: "51px",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
          color: "#ffffff",
          textShadow: "0 0 3px rgba(0, 0, 0, 0.25), 0 0 1px rgba(0, 0, 0, 0.3)",
        }}
      >
        {pageNumber}/{numPages || "—"}
      </div>

      <button
        onClick={() => onChangePage(1)}
        disabled={pageNumber >= numPages}
        {...iconBtn(false, pageNumber >= numPages)}
        title="Next page"
      >
        <ChevronRight className={iconClass} style={iconStyle} />
      </button>

      {/* Annotation Tools */}
      <button
        onClick={() => onToolChange(currentTool === "none" ? "none" : "none")}
        {...iconBtn(currentTool === "none")}
        title="Select"
      >
        <MousePointer2 className={iconClass} style={iconStyle} />
      </button>

      <button
        onClick={() => onToolChange(currentTool === "highlight" ? "none" : "highlight")}
        {...iconBtn(currentTool === "highlight")}
        title="Highlight"
      >
        <Highlighter className={iconClass} style={iconStyle} />
      </button>

      <button
        onClick={() => onToolChange(currentTool === "pen" ? "none" : "pen")}
        {...iconBtn(currentTool === "pen")}
        title="Pen"
      >
        <Pencil className={iconClass} style={iconStyle} />
      </button>

      <button
        onClick={onAddComment}
        disabled={!hasSelectedText}
        {...iconBtn(false, !hasSelectedText)}
        title="Add comment"
      >
        <MessageCirclePlus className={iconClass} style={iconStyle} />
      </button>

      <div className="flex-1 min-h-4" />

      {/* Bottom section */}
      <button onClick={onClearAnnotations} {...iconBtn(false)} title="Clear page">
        <Eraser className={iconClass} style={iconStyle} />
      </button>
    </div>
  );
}
