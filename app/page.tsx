"use client";

import { useEffect, useState, useRef } from "react";
import SpinningBook from "@/components/SpinningBook";
import ThreadCard from "@/components/ThreadCard";
import ShelfScene, { BookData } from "@/components/ShelfScene";
import AuthModal from "@/components/AuthModal";
import { useAuth } from "@/lib/AuthContext";

// Category mapping for featured books
const categoryMapping: Record<string, string> = {
  "crime and punishment": "Psychological",
  "deuteronomy": "Religious",
  "atomic habits": "Self-Help",
  "1984": "Dystopian",
  "the art of war": "Strategy",
};

const sampleThreads = [
  {
    author: "Sarah Mitchell",
    time: "2 hours ago",
    title: "The existential crisis in Crime and Punishment",
    preview: "I just finished reading Dostoevsky's masterpiece and I'm struck by how Raskolnikov's internal struggle mirrors our modern anxiety...",
    replies: 24,
    likes: 156,
  },
  {
    author: "James Chen",
    time: "5 hours ago",
    title: "Why Atomic Habits changed my productivity system",
    preview: "After implementing James Clear's 1% improvement philosophy, I've seen remarkable changes in my daily routine. Here's what worked...",
    replies: 18,
    likes: 203,
  },
  {
    author: "Emma Rodriguez",
    time: "1 day ago",
    title: "Comparing Orwell's vision to our digital age",
    preview: "1984 feels more relevant than ever. Let's discuss the parallels between Big Brother and modern surveillance capitalism...",
    replies: 67,
    likes: 421,
  },
];

export default function HomePage() {
  const [books, setBooks] = useState<BookData[]>([]);
  const [featuredBooks, setFeaturedBooks] = useState<BookData[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const libraryRef = useRef<HTMLDivElement>(null);
  const { user, signOut, loading } = useAuth();

  useEffect(() => {
    // Fetch all books
    const fetchBooks = async () => {
      try {
        console.log("🔍 Fetching books from /api/books...");
        const res = await fetch("/api/books");
        console.log("📡 Response status:", res.status, res.ok);
        
        if (res.ok) {
          const data = await res.json();
          console.log("📚 Received data:", data);
          const allBooks = Array.isArray(data) ? data : [];
          console.log("📖 Total books:", allBooks.length);
          setBooks(allBooks);

          // Just take the first 5 books as featured (or use all books you have)
          const featured = allBooks.slice(0, 5);
          console.log("⭐ Featured books:", featured.length, featured);
          setFeaturedBooks(featured);
        } else {
          console.error("❌ API response not OK:", res.status);
        }
      } catch (e) {
        console.error("❌ Failed to fetch books:", e);
      }
    };
    fetchBooks();
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShowLibrary(true);
          }
        });
      },
      { threshold: 0.1 }
    );

    if (libraryRef.current) {
      observer.observe(libraryRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const visibleBooks =
    books.length > 0
      ? books
      : Array.from({ length: 12 }).map((_, i) => ({
          id: `fallback-${i}`,
          title: `Book ${i + 1}`,
          author: "Author",
        }));

  // Get category for a book based on title
  const getCategoryForBook = (book: BookData): string => {
    const title = book.title?.toLowerCase() || "";

    // Try exact matches first
    for (const [key, category] of Object.entries(categoryMapping)) {
      if (title.includes(key)) {
        return category;
      }
    }

    // Otherwise assign categories based on common books
    if (title.includes("nietzsche") || title.includes("beyond good")) return "Philosophy";
    if (title.includes("frankenstein")) return "Gothic";
    if (title.includes("meditations") || title.includes("aurelius")) return "Stoicism";
    if (title.includes("plato") || title.includes("republic")) return "Philosophy";

    return "Classic Literature";
  };

  return (
    <main className="min-h-screen" style={{
      background: "linear-gradient(180deg, #E8F5E9 0%, #C8E6C9 15%, #E0F2F1 35%, #F1F8E9 100%)"
    }}>
      {/* Dark Green Toolbar with Inner Glow */}
      <nav
        className="fixed w-full z-50 flex items-center justify-between px-8"
        style={{
          top: "0",
          background: "#1a3d2e",
          boxShadow: "inset 0 0 20px rgba(100, 255, 150, 0.3), 0 2px 10px rgba(0, 0, 0, 0.1)",
          padding: "12px 32px",
          borderBottom: "1px solid rgba(100, 255, 150, 0.2)"
        }}
      >
        {/* Left Side - Logo */}
        <div className="flex items-center">
          <a
            href="/"
            className="flex items-center gap-2"
          >
            <div style={{
              width: "32px",
              height: "32px",
              background: "rgba(100, 255, 150, 0.2)",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#64FF96",
              fontWeight: "bold",
              fontSize: "18px"
            }}>
              U
            </div>
            <span style={{
              color: "#ffffff",
              fontWeight: 600,
              fontSize: "16px",
              letterSpacing: "-0.02em"
            }}>
              UNIVAULT
            </span>
          </a>
        </div>

        {/* Center - Navigation Links */}
        <div className="flex items-center gap-1">
          <a
            href="/"
            className="px-4 py-2 text-white hover:text-green-200 transition-all duration-200"
            style={{
              fontSize: "14px",
              fontWeight: 500,
              letterSpacing: "-0.01em"
            }}
          >
            Product
          </a>
          <a
            href="/library"
            className="px-4 py-2 text-white hover:text-green-200 transition-all duration-200"
            style={{
              fontSize: "14px",
              fontWeight: 500,
              letterSpacing: "-0.01em"
            }}
          >
            Enterprise
          </a>
          <a
            href="#pricing"
            className="px-4 py-2 text-white hover:text-green-200 transition-all duration-200"
            style={{
              fontSize: "14px",
              fontWeight: 500,
              letterSpacing: "-0.01em"
            }}
          >
            Pricing
          </a>
          <button
            className="px-4 py-2 text-white hover:text-green-200 transition-all duration-200"
            style={{
              fontSize: "14px",
              fontWeight: 500,
              letterSpacing: "-0.01em"
            }}
            onClick={() => {/* TODO: Add contact */}}
          >
            Contact us
          </button>
        </div>

        {/* Right Side - Auth Section */}
        <div className="flex items-center gap-3">
          {!loading && (
            user ? (
              <>
                <a
                  href="/profile"
                  className="px-4 py-2 text-white hover:text-green-200 transition-all duration-200"
                  style={{
                    fontSize: "14px",
                    fontWeight: 500
                  }}
                >
                  {user.email?.split('@')[0]}
                </a>
                <button
                  onClick={() => signOut()}
                  className="transition-all duration-200 hover:scale-105"
                  style={{
                    fontSize: "14px",
                    padding: "8px 20px",
                    borderRadius: "8px",
                    background: "rgba(255, 255, 255, 0.15)",
                    color: "white",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    fontWeight: 500,
                    letterSpacing: "-0.01em"
                  }}
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="px-4 py-2 text-white hover:text-green-200 transition-all duration-200"
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    letterSpacing: "-0.01em"
                  }}
                >
                  Log in
                </button>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="transition-all duration-200 hover:scale-105"
                  style={{
                    fontSize: "14px",
                    padding: "8px 20px",
                    borderRadius: "8px",
                    background: "rgba(255, 255, 255, 0.95)",
                    color: "#1a3d2e",
                    border: "none",
                    fontWeight: 600,
                    letterSpacing: "-0.01em"
                  }}
                >
                  Sign up
                </button>
              </>
            )
          )}
        </div>
      </nav>

      {/* Auth Modal */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      {/* Hero Section */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-8 py-20">
        <div className="relative z-10 text-center">
          {/* Request Book Banner */}
          <a
            href="/request-book"
            className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-full transition-all duration-200 hover:scale-105"
            style={{
              background: "rgba(255, 255, 255, 0.5)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(26, 61, 46, 0.2)",
              textDecoration: "none"
            }}
          >
            <span style={{
              fontSize: "13px",
              color: "#1a3d2e",
              fontWeight: 600,
              letterSpacing: "-0.01em"
            }}>
              Request a new book →
            </span>
          </a>

          <h1
            className="mb-8 text-8xl font-bold tracking-tight sm:text-9xl"
            style={{
              fontFamily: "'Crimson Text', serif",
              fontWeight: 400,
              color: "#1a3d2e",
              textShadow: "0 0 40px rgba(26, 61, 46, 0.4), 0 0 20px rgba(26, 61, 46, 0.3), 2px 2px 4px rgba(0,0,0,0.2)"
            }}
          >
            The Modern Salon.
          </h1>
        </div>

        {/* Spinning Books Carousel */}
        <div className="relative z-10 mb-20 grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          {featuredBooks.length > 0 ? (
            featuredBooks.map((book, index) => (
              <SpinningBook
                key={book.id}
                id={book.id}
                title={book.title || "Untitled"}
                category={getCategoryForBook(book)}
                cover_path={book.cover_path}
                pdfUrl={book.pdfUrl}
                index={index}
                onClick={() => {
                  window.location.href = `/book/${book.id}`;
                }}
              />
            ))
          ) : (
            <div className="col-span-full text-center" style={{ fontFamily: "'Crimson Text', serif" }}>
              Loading books...
            </div>
          )}
        </div>

        {/* Scroll indicator */}
        <div className="relative z-10 animate-bounce">
          <svg
            className="h-6 w-6 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </div>
      </section>

      {/* Threads Section */}
      <section className="px-8 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2
              className="mb-4 text-5xl font-bold tracking-tight"
              style={{
                fontFamily: "'Crimson Text', serif",
                fontWeight: 400,
                color: "#000000",
                textShadow: "1px 1px 2px rgba(0,0,0,0.2)"
              }}
            >
              Active Discussions
            </h2>
            <p
              className="text-lg"
              style={{
                fontFamily: "'Crimson Text', serif",
                color: "#2D2D2D"
              }}
            >
              Join the conversation with fellow readers and thinkers
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sampleThreads.map((thread, index) => (
              <ThreadCard key={index} {...thread} />
            ))}
          </div>

          <div className="mt-12 text-center">
            <button className="rounded-full bg-gray-900 px-8 py-4 font-semibold text-white transition hover:bg-gray-800">
              View All Discussions
            </button>
          </div>
        </div>
      </section>

      {/* 3D Library Section */}
      <section
        ref={libraryRef}
        className="px-8 py-20"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center">
            <h2
              className="mb-4 text-5xl font-bold tracking-tight"
              style={{
                fontFamily: "'Crimson Text', serif",
                fontWeight: 400,
                color: "#000000",
                textShadow: "1px 1px 2px rgba(0,0,0,0.2)"
              }}
            >
              Your Library
            </h2>
            <p
              className="text-lg"
              style={{
                fontFamily: "'Crimson Text', serif",
                color: "#2D2D2D"
              }}
            >
              Explore your collection in immersive 3D
            </p>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-xl">
            <div className="h-[80vh] min-h-[600px] w-full overflow-hidden rounded-2xl bg-gray-50">
              {showLibrary && <ShelfScene books={visibleBooks} />}
            </div>
          </div>

          <div className="mt-8 text-center">
            <a
              href="/library"
              className="inline-block rounded-full bg-gray-900 px-8 py-4 font-semibold text-white transition hover:bg-gray-800"
            >
              Open Full Library View
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-8 py-12" style={{ backgroundColor: "#3D3D3D", color: "#FFFFFF" }}>
        <div className="mx-auto max-w-6xl text-center">
          <h3
            className="mb-4 text-2xl font-bold"
            style={{
              fontFamily: "'Crimson Text', serif",
              fontWeight: 400
            }}
          >
            The Modern Salon
          </h3>
          <p
            style={{
              fontFamily: "'Crimson Text', serif",
              color: "#CCCCCC"
            }}
          >
            A space for intellectual curiosity and meaningful discourse
          </p>
        </div>
      </footer>

      {/* Removed float animation - books stay still */}
    </main>
  );
}
