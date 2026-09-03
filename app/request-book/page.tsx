"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";

/* Same palette as the landing page and the reader itself. */
const BEIGE = "#f1efe3";
const INK = "#3f3828";
const MUTED = "#87816e";
const HAIRLINE = "rgba(35, 29, 21, 0.14)";
const BROWN = "rgba(24, 16, 6, 0.98)";
const CREAM = "#ffe8c0";
const CREAM_DIM = "rgba(255, 228, 192, 0.72)";
const serif = { fontFamily: "'Crimson Text', serif" } as const;

export default function RequestBookPage() {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // TODO: Add actual submission logic (e.g., save to database, send email, etc.)
    // For now, we'll just simulate a submission
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setSubmitted(true);
    setLoading(false);
    setTitle("");
    setAuthor("");

    // Reset success message after 3 seconds
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <main className="min-h-screen" style={{ background: BEIGE }}>
      {/* Same brown bar as the rest of the site */}
      <nav
        className="fixed w-full z-50 flex items-center justify-between"
        style={{
          top: 0,
          background: BROWN,
          padding: "12px 32px",
          borderBottom: "1px solid rgba(255, 228, 192, 0.12)",
        }}
      >
        <a href="/" className="flex items-center gap-2" style={{ textDecoration: "none" }}>
          <div
            style={{
              width: 32,
              height: 32,
              background: "rgba(255, 228, 192, 0.12)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: CREAM,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
            </svg>
          </div>
          <span style={{ color: CREAM, fontWeight: 600, fontSize: 16, letterSpacing: "-0.02em" }}>
            FORUM
          </span>
        </a>

        <a
          href="/"
          style={{
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            color: CREAM_DIM,
            textDecoration: "none",
            padding: "8px 16px",
          }}
        >
          ← Back to Home
        </a>
      </nav>

      {/* Main Content */}
      <div className="flex items-center justify-center px-8" style={{ paddingTop: "120px", paddingBottom: "80px" }}>
        <div
          className="w-full max-w-2xl p-8"
          style={{
            background: "rgba(255, 255, 255, 0.5)",
            borderRadius: 20,
            border: `1px solid ${HAIRLINE}`,
            boxShadow: "0 20px 60px rgba(36, 23, 3, 0.1)",
          }}
        >
          <h1
            className="mb-4 text-5xl"
            style={{ ...serif, fontWeight: 600, color: INK, textAlign: "center" }}
          >
            Request a New Book
          </h1>
          <p className="mb-8 text-center" style={{ ...serif, color: MUTED, fontSize: 18 }}>
            Can&rsquo;t find a book you&rsquo;re looking for? Let us know and we&rsquo;ll add it to our collection.
          </p>

          {!user && (
            <div
              className="mb-6 p-4 rounded-lg text-center"
              style={{
                background: "rgba(36, 23, 3, 0.06)",
                border: `1px solid ${HAIRLINE}`,
              }}
            >
              <p style={{ ...serif, color: INK, fontSize: 14 }}>
                Please <a href="/" style={{ fontWeight: 600, textDecoration: "underline" }}>log in</a> to submit a book request.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label
                htmlFor="title"
                style={{
                  display: "block",
                  marginBottom: 8,
                  ...serif,
                  fontSize: 16,
                  fontWeight: 600,
                  color: INK,
                }}
              >
                Book Title
              </label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                disabled={!user}
                placeholder="Enter the book title"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  fontSize: 16,
                  ...serif,
                  borderRadius: 12,
                  border: `1px solid ${HAIRLINE}`,
                  background: "rgba(255, 255, 255, 0.9)",
                  color: INK,
                  outline: "none",
                  transition: "all 0.2s",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = INK;
                  e.target.style.boxShadow = "0 0 0 3px rgba(63, 56, 40, 0.1)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = HAIRLINE;
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            <div className="mb-6">
              <label
                htmlFor="author"
                style={{
                  display: "block",
                  marginBottom: 8,
                  ...serif,
                  fontSize: 16,
                  fontWeight: 600,
                  color: INK,
                }}
              >
                Author Name
              </label>
              <input
                type="text"
                id="author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                required
                disabled={!user}
                placeholder="Enter the author's name"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  fontSize: 16,
                  ...serif,
                  borderRadius: 12,
                  border: `1px solid ${HAIRLINE}`,
                  background: "rgba(255, 255, 255, 0.9)",
                  color: INK,
                  outline: "none",
                  transition: "all 0.2s",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = INK;
                  e.target.style.boxShadow = "0 0 0 3px rgba(63, 56, 40, 0.1)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = HAIRLINE;
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            {submitted && (
              <div
                className="mb-6 p-4 rounded-lg text-center"
                style={{
                  background: "rgba(76, 133, 80, 0.12)",
                  border: "1px solid rgba(76, 133, 80, 0.3)",
                }}
              >
                <p style={{ color: "#3f6b42", fontSize: 14, fontWeight: 600 }}>
                  ✓ Request submitted successfully!
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !user}
              className="w-full transition-all duration-200 hover:scale-105"
              style={{
                padding: "14px 32px",
                fontSize: 16,
                ...serif,
                fontWeight: 600,
                borderRadius: 12,
                background: user ? BROWN : "#cccccc",
                color: CREAM,
                border: "none",
                cursor: user ? "pointer" : "not-allowed",
                letterSpacing: "-0.01em",
                boxShadow: user ? "0 4px 20px rgba(36, 23, 3, 0.3)" : "none",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Submitting..." : "Submit Request"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
