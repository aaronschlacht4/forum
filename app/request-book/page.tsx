"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";

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
    <main
      className="min-h-screen"
      style={{
        background: "linear-gradient(180deg, #E8F5E9 0%, #C8E6C9 15%, #E0F2F1 35%, #F1F8E9 100%)",
      }}
    >
      {/* Dark Green Toolbar */}
      <nav
        className="fixed w-full z-50 flex items-center justify-between px-8"
        style={{
          top: "0",
          background: "#1a3d2e",
          boxShadow: "inset 0 0 20px rgba(100, 255, 150, 0.3), 0 2px 10px rgba(0, 0, 0, 0.1)",
          padding: "12px 32px",
          borderBottom: "1px solid rgba(100, 255, 150, 0.2)",
        }}
      >
        <div className="flex items-center">
          <a href="/" className="flex items-center gap-2">
            <div
              style={{
                width: "32px",
                height: "32px",
                background: "rgba(100, 255, 150, 0.2)",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#64FF96",
                fontWeight: "bold",
                fontSize: "18px",
              }}
            >
              U
            </div>
            <span
              style={{
                color: "#ffffff",
                fontWeight: 600,
                fontSize: "16px",
                letterSpacing: "-0.02em",
              }}
            >
              UNIVAULT
            </span>
          </a>
        </div>

        <a
          href="/"
          className="px-4 py-2 text-white hover:text-green-200 transition-all duration-200"
          style={{
            fontSize: "14px",
            fontWeight: 500,
            letterSpacing: "-0.01em",
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
            background: "rgba(255, 255, 255, 0.8)",
            backdropFilter: "blur(20px)",
            borderRadius: "24px",
            border: "1px solid rgba(255, 255, 255, 0.5)",
            boxShadow: "0 20px 60px rgba(0, 0, 0, 0.1)",
          }}
        >
          <h1
            className="mb-4 text-5xl font-bold"
            style={{
              fontFamily: "'Crimson Text', serif",
              fontWeight: 400,
              color: "#1a3d2e",
              textAlign: "center",
            }}
          >
            Request a New Book
          </h1>
          <p
            className="mb-8 text-center"
            style={{
              fontFamily: "'Crimson Text', serif",
              color: "#4a4a4a",
              fontSize: "18px",
            }}
          >
            Can't find a book you're looking for? Let us know and we'll add it to our collection.
          </p>

          {!user && (
            <div
              className="mb-6 p-4 rounded-lg text-center"
              style={{
                background: "rgba(26, 61, 46, 0.1)",
                border: "1px solid rgba(26, 61, 46, 0.2)",
              }}
            >
              <p style={{ color: "#1a3d2e", fontSize: "14px" }}>
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
                  marginBottom: "8px",
                  fontFamily: "'Crimson Text', serif",
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "#1a3d2e",
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
                  fontSize: "16px",
                  fontFamily: "'Crimson Text', serif",
                  borderRadius: "12px",
                  border: "1px solid rgba(26, 61, 46, 0.3)",
                  background: "rgba(255, 255, 255, 0.9)",
                  outline: "none",
                  transition: "all 0.2s",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#1a3d2e";
                  e.target.style.boxShadow = "0 0 0 3px rgba(26, 61, 46, 0.1)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "rgba(26, 61, 46, 0.3)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            <div className="mb-6">
              <label
                htmlFor="author"
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontFamily: "'Crimson Text', serif",
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "#1a3d2e",
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
                  fontSize: "16px",
                  fontFamily: "'Crimson Text', serif",
                  borderRadius: "12px",
                  border: "1px solid rgba(26, 61, 46, 0.3)",
                  background: "rgba(255, 255, 255, 0.9)",
                  outline: "none",
                  transition: "all 0.2s",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#1a3d2e";
                  e.target.style.boxShadow = "0 0 0 3px rgba(26, 61, 46, 0.1)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "rgba(26, 61, 46, 0.3)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            {submitted && (
              <div
                className="mb-6 p-4 rounded-lg text-center"
                style={{
                  background: "rgba(76, 175, 80, 0.1)",
                  border: "1px solid rgba(76, 175, 80, 0.3)",
                }}
              >
                <p style={{ color: "#2e7d32", fontSize: "14px", fontWeight: 600 }}>
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
                fontSize: "16px",
                fontFamily: "'Crimson Text', serif",
                fontWeight: 600,
                borderRadius: "12px",
                background: user ? "#1a3d2e" : "#cccccc",
                color: "white",
                border: "none",
                cursor: user ? "pointer" : "not-allowed",
                letterSpacing: "-0.01em",
                boxShadow: user ? "0 4px 20px rgba(26, 61, 46, 0.3)" : "none",
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
