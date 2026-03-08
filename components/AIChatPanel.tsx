"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send } from "lucide-react";
import type Anthropic from "@anthropic-ai/sdk";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AIChatPanelProps {
  selectedText: string;
  position: { x: number; y: number } | null;
  onClose: () => void;
}

export default function AIChatPanel({ selectedText, position, onClose }: AIChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: "user", content: text.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedText,
          messages: nextMessages as Anthropic.MessageParam[],
        }),
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: updated[updated.length - 1].content + chunk,
          };
          return updated;
        });
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: "Sorry, something went wrong. Please try again.",
        };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  if (!position) return null;

  const panelW = 340;
  const panelH = 420;
  const left = Math.max(8, Math.min(position.x - panelW / 2, window.innerWidth - panelW - 8));
  const top = Math.max(8, position.y - panelH - 8);

  return (
    <div
      style={{
        position: "fixed",
        left,
        top,
        width: `${panelW}px`,
        height: `${panelH}px`,
        zIndex: 300,
        background: "rgba(255,255,255,0.98)",
        backdropFilter: "blur(20px)",
        borderRadius: "12px",
        boxShadow: "0 8px 40px rgba(0,0,0,0.22), 0 1px 4px rgba(0,0,0,0.10)",
        border: "1px solid rgba(0,0,0,0.08)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid rgba(0,0,0,0.07)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <span style={{ fontSize: "14px" }}>✦</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#111", letterSpacing: "-0.01em" }}>
            Ask Claude
          </span>
        </div>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", padding: "2px", lineHeight: 1, fontSize: "14px" }}
        >
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      {/* Selected text context */}
      <div
        style={{
          padding: "8px 14px",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
          background: "rgba(0,0,0,0.02)",
          flexShrink: 0,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "11px",
            color: "#888",
            fontStyle: "italic",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            lineHeight: 1.4,
          }}
        >
          &ldquo;{selectedText}&rdquo;
        </p>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {messages.length === 0 && (
          <p style={{ color: "#bbb", fontSize: "12px", textAlign: "center", marginTop: "24px", fontStyle: "italic" }}>
            Ask anything about the selected text
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              padding: "8px 11px",
              borderRadius: m.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
              background: m.role === "user" ? "#111" : "rgba(0,0,0,0.05)",
              color: m.role === "user" ? "#fff" : "#222",
              fontSize: "13px",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
            }}
          >
            {m.content || (loading && i === messages.length - 1 ? (
              <span style={{ opacity: 0.5 }}>…</span>
            ) : "")}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        style={{
          padding: "10px 12px",
          borderTop: "1px solid rgba(0,0,0,0.07)",
          display: "flex",
          gap: "8px",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Ask about this passage…"
          disabled={loading}
          style={{
            flex: 1,
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: "8px",
            padding: "7px 11px",
            fontSize: "13px",
            outline: "none",
            background: "rgba(0,0,0,0.03)",
            color: "#111",
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            border: "none",
            background: input.trim() && !loading ? "#111" : "rgba(0,0,0,0.08)",
            color: input.trim() && !loading ? "#fff" : "#bbb",
            cursor: input.trim() && !loading ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "background 0.15s",
          }}
        >
          <Send size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
