"use client";

import { useEffect, useState } from "react";
import LiveDiscussionDemo from "@/components/LiveDiscussionDemo";
import AuthModal from "@/components/AuthModal";
import { useAuth } from "@/lib/AuthContext";

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
   around it, the current choice sitting on a slightly deeper beige. */
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

const segmentActive: React.CSSProperties = {
  ...segment,
  color: INK,
  background: BEIGE_RAISED,
};

export default function HomePage() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { user, signOut, loading } = useAuth();

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

          <hr
            style={{
              border: "none",
              borderTop: `1px solid ${HAIRLINE}`,
              margin: "44px auto 40px",
              width: "72%",
            }}
          />

          <div style={segmentRail}>
            <a href="/library" className="seg-item" style={segmentActive}>
              Library
            </a>
            <a href="#discussions" className="seg-item" style={segment}>
              Discussions
            </a>
            <a href="/request-book" className="seg-item" style={segment}>
              Request a book
            </a>
          </div>
        </div>
      </section>

      {/* Live Discussions */}
      <section id="discussions" className="px-8 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="reveal mb-12 text-center">
            <h2
              className="text-5xl"
              style={{ ...serif, fontWeight: 600, color: INK, letterSpacing: "-0.01em", margin: 0 }}
            >
              Live Discussions
            </h2>
            <p style={{ ...serif, fontSize: 18, color: MUTED, marginTop: 12 }}>
              Real conversations happening right now in the vault
            </p>
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

          <div className="reveal reveal-delay-1">
            <LiveDiscussionDemo />
          </div>
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
