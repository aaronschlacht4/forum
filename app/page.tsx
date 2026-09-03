"use client";

import { useEffect, useState } from "react";
import LiveDiscussionDemo from "@/components/LiveDiscussionDemo";
import AuthModal from "@/components/AuthModal";
import { useAuth } from "@/lib/AuthContext";
import { coverUrlFor } from "@/lib/bookModel";

/* ---- Palette: the reader's own colours, brought out front.
   The page sits on the paper beige; the chrome (nav, footer) wears the
   reading window's brown, with the same warm cream for its type. ---- */
const BEIGE = "#f1efe3";
const BEIGE_RAISED = "#e6e3d3"; // the pressed segment of a control
const INK = "#3f3828"; // headings: the paper's ink warmed toward the chrome
const MUTED = "#87816e"; // secondary type on beige
const HAIRLINE = "rgba(35, 29, 21, 0.14)";
const BROWN = "rgba(24, 16, 6, 0.98)"; // the reader's bar
const CREAM = "#ffe8c0";
const CREAM_DIM = "rgba(255, 228, 192, 0.72)";

const serif = { fontFamily: "'Crimson Text', serif" } as const;

type Book = { id: string; title?: string; author?: string; cover_path?: string };

const navLink: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  letterSpacing: "-0.01em",
  color: CREAM_DIM,
  padding: "8px 16px",
  background: "none",
  border: "none",
  cursor: "pointer",
  textDecoration: "none",
};

/* The segmented control from the reader's world: one rounded rail, a hairline
   around it, the current choice sitting on a slightly deeper beige. Purely a
   set of anchors down the page now, so nothing in it is ever "active". */
const segmentRail: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: 6,
  borderRadius: 14,
  border: `1px solid ${HAIRLINE}`,
  background: "rgba(255, 255, 255, 0.25)",
};

const segment: React.CSSProperties = {
  ...serif,
  fontSize: 19,
  fontWeight: 600,
  color: MUTED,
  padding: "8px 20px",
  borderRadius: 9,
  textDecoration: "none",
  transition: "color 160ms ease, background 160ms ease",
};

/* The one button on the page that outranks everything else in it — the
   library is where the app actually happens, so its door is the biggest
   thing in the hero. */
const libraryButton: React.CSSProperties = {
  ...serif,
  display: "inline-block",
  fontSize: 24,
  fontWeight: 600,
  color: "#241703",
  background: CREAM,
  padding: "18px 52px",
  borderRadius: 16,
  textDecoration: "none",
  letterSpacing: "-0.01em",
  boxShadow: "0 10px 30px rgba(36,23,3,0.22)",
  transition: "transform 160ms ease, box-shadow 160ms ease",
};

function sectionHeading(title: string, subtitle: string) {
  return (
    <div className="reveal mb-12 text-center">
      <h2 className="text-5xl" style={{ ...serif, fontWeight: 600, color: INK, letterSpacing: "-0.01em", margin: 0 }}>
        {title}
      </h2>
      <p style={{ ...serif, fontSize: 18, color: MUTED, marginTop: 12 }}>{subtitle}</p>
      <hr
        style={{
          border: "none",
          borderTop: `1px solid ${HAIRLINE}`,
          margin: "36px auto 0",
          width: 420,
          maxWidth: "80%",
        }}
      />
    </div>
  );
}

export default function HomePage() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { user, signOut, loading } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);

  useEffect(() => {
    fetch("/api/books")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setBooks(Array.isArray(data) ? data.slice(0, 6) : []))
      .catch(() => setBooks([]));
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.target.classList.toggle("visible", e.isIntersecting)),
      { threshold: 0.08, rootMargin: "0px 0px -60px 0px" }
    );
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <main className="min-h-screen" style={{ background: BEIGE }}>
      <style>{`
        .nav-item:hover { color: ${CREAM} !important; }
        .seg-item:hover { color: ${INK}; background: rgba(230, 227, 211, 0.6); }
        .library-cta:hover { transform: translateY(-2px); box-shadow: 0 14px 36px rgba(36,23,3,0.28); }
        .book-card:hover { transform: translateY(-3px); border-color: rgba(35,29,21,0.28); }
      `}</style>

      {/* The reading window's bar, worn as the site's nav */}
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

        <div className="flex items-center gap-1">
          <a href="/" className="nav-item" style={navLink}>Product</a>
          <a href="/library" className="nav-item" style={navLink}>Library</a>
          <a href="#pricing" className="nav-item" style={navLink}>Pricing</a>
          <button className="nav-item" style={navLink} onClick={() => {/* TODO: Add contact */}}>
            Contact us
          </button>
        </div>

        <div className="flex items-center gap-3">
          {!loading &&
            (user ? (
              <>
                <a href="/profile" className="nav-item" style={navLink}>
                  {user.email?.split("@")[0]}
                </a>
                <button
                  onClick={() => signOut()}
                  style={{
                    fontSize: 14,
                    padding: "8px 20px",
                    borderRadius: 8,
                    background: "rgba(255, 228, 192, 0.12)",
                    color: CREAM,
                    border: "1px solid rgba(255, 228, 192, 0.2)",
                    fontWeight: 500,
                    letterSpacing: "-0.01em",
                    cursor: "pointer",
                  }}
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <button className="nav-item" style={navLink} onClick={() => setShowAuthModal(true)}>
                  Log in
                </button>
                <button
                  onClick={() => setShowAuthModal(true)}
                  style={{
                    fontSize: 14,
                    padding: "8px 20px",
                    borderRadius: 8,
                    background: CREAM,
                    color: "#241703",
                    border: "none",
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                    cursor: "pointer",
                  }}
                >
                  Sign up
                </button>
              </>
            ))}
        </div>
      </nav>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      {/* Hero: type on paper, nothing floating */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-8 py-20">
        <div className="reveal text-center" style={{ maxWidth: 760 }}>
          <h1
            className="text-7xl sm:text-8xl"
            style={{ ...serif, fontWeight: 600, color: INK, letterSpacing: "-0.01em", margin: 0 }}
          >
            The Modern Salon.
          </h1>

          <p style={{ ...serif, fontSize: 21, color: MUTED, marginTop: 20 }}>
            A library read together — margins, arguments and all.
          </p>

          {/* The one door into the actual app, sized to say so */}
          <a href="/library" className="library-cta" style={{ ...libraryButton, marginTop: 40 }}>
            Enter the Library →
          </a>

          <hr
            style={{
              border: "none",
              borderTop: `1px solid ${HAIRLINE}`,
              margin: "44px auto 40px",
              width: "72%",
            }}
          />

          <div style={segmentRail}>
            <a href="#discussions" className="seg-item" style={segment}>
              Discussions
            </a>
            <a href="#top-books" className="seg-item" style={segment}>
              Top Books
            </a>
            <a href="#request" className="seg-item" style={segment}>
              Request a Book
            </a>
          </div>
        </div>
      </section>

      {/* Discussions */}
      <section id="discussions" className="px-8 py-20">
        <div className="mx-auto max-w-6xl">
          {sectionHeading("Discussions", "Real conversations happening right now in the vault")}
          <div className="reveal reveal-delay-1">
            <LiveDiscussionDemo />
          </div>
        </div>
      </section>

      {/* Top Books Being Read */}
      <section id="top-books" className="px-8 py-20">
        <div className="mx-auto max-w-6xl">
          {sectionHeading("Top Books Being Read", "Where the shelf is busiest this week")}

          <div className="reveal reveal-delay-1 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
            {books.length > 0
              ? books.map((book) => {
                  const cover = coverUrlFor(book);
                  return (
                    <a
                      key={book.id}
                      href={`/book/${book.id}`}
                      className="book-card"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        textDecoration: "none",
                        borderRadius: 12,
                        border: `1px solid ${HAIRLINE}`,
                        background: "rgba(255,255,255,0.4)",
                        overflow: "hidden",
                        transition: "transform 160ms ease, border-color 160ms ease",
                      }}
                    >
                      <div
                        style={{
                          aspectRatio: "2 / 3",
                          background: cover ? `${BEIGE_RAISED} url(${cover}) center/cover no-repeat` : BEIGE_RAISED,
                        }}
                      />
                      <div style={{ padding: "10px 12px 14px" }}>
                        <div
                          style={{
                            ...serif,
                            fontSize: 14,
                            fontWeight: 600,
                            color: INK,
                            lineHeight: 1.3,
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {book.title || "Untitled"}
                        </div>
                        {book.author && (
                          <div style={{ ...serif, fontSize: 12, color: MUTED, marginTop: 3 }}>
                            {book.author}
                          </div>
                        )}
                      </div>
                    </a>
                  );
                })
              : (
                <div className="col-span-full text-center" style={{ ...serif, color: MUTED, padding: "24px 0" }}>
                  Loading the shelf…
                </div>
              )}
          </div>
        </div>
      </section>

      {/* Request a Book */}
      <section id="request" className="px-8 py-20">
        <div className="mx-auto max-w-2xl text-center reveal">
          <h2 className="text-5xl" style={{ ...serif, fontWeight: 600, color: INK, letterSpacing: "-0.01em", margin: 0 }}>
            Request a Book
          </h2>
          <p style={{ ...serif, fontSize: 18, color: MUTED, marginTop: 12 }}>
            Can&rsquo;t find a book you&rsquo;re looking for? Tell us and we&rsquo;ll add it to the shelf.
          </p>
          <a
            href="/request-book"
            style={{
              ...serif,
              display: "inline-block",
              marginTop: 32,
              fontSize: 17,
              fontWeight: 600,
              color: CREAM,
              background: BROWN,
              padding: "14px 36px",
              borderRadius: 12,
              textDecoration: "none",
              letterSpacing: "-0.01em",
            }}
          >
            Request a book →
          </a>
        </div>
      </section>

      {/* Footer in the same brown as the nav */}
      <footer className="px-8 py-12" style={{ background: BROWN, color: CREAM }}>
        <div className="mx-auto max-w-6xl text-center">
          <h3 className="mb-3 text-2xl" style={{ ...serif, fontWeight: 600 }}>
            The Modern Salon
          </h3>
          <p style={{ ...serif, color: CREAM_DIM }}>
            A space for intellectual curiosity and meaningful discourse
          </p>
        </div>
      </footer>
    </main>
  );
}
