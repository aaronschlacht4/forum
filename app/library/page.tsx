"use client";

import React, { useEffect, useState } from "react";
import ShelfScene, { BookData } from "@/components/ShelfScene";

const EXAMPLE_TITLES = [
  "Dune", "1984", "Brave New World", "The Great Gatsby", "Crime and Punishment",
  "To Kill a Mockingbird", "Moby-Dick", "War and Peace", "The Odyssey", "Hamlet",
  "Don Quixote", "Anna Karenina", "The Brothers Karamazov", "Ulysses", "Middlemarch",
  "Jane Eyre", "Wuthering Heights", "Pride and Prejudice", "Frankenstein", "Dracula",
  "The Count of Monte Cristo", "Les Misérables", "Madame Bovary", "The Stranger",
  "In Search of Lost Time", "One Hundred Years of Solitude", "Lolita", "The Trial",
  "The Castle", "Metamorphosis", "The Sun Also Rises", "A Farewell to Arms",
  "For Whom the Bell Tolls", "The Old Man and the Sea", "Catch-22", "Slaughterhouse-Five",
  "Beloved", "The Road", "Blood Meridian", "No Country for Old Men", "East of Eden",
  "Of Mice and Men", "The Grapes of Wrath", "Cannery Row", "Their Eyes Were Watching God",
  "Invisible Man", "Native Son", "The Color Purple", "Kindred", "Parable of the Sower",
  "The Left Hand of Darkness", "The Dispossessed", "Fahrenheit 451", "The Martian Chronicles",
  "Foundation", "I Robot", "Do Androids Dream", "Neuromancer", "Snow Crash",
  "The Name of the Rose", "Pillars of the Earth", "A Brief History of Time",
  "Sapiens", "Thinking Fast and Slow", "The Republic", "Meditations", "Nicomachean Ethics",
  "Thus Spoke Zarathustra", "Being and Time", "The Prince", "Leviathan", "Critique of Pure Reason",
  "The Wealth of Nations", "On the Origin of Species", "The Selfish Gene", "Cosmos",
  "Surely You're Joking Mr Feynman", "The Double Helix", "Silent Spring", "The Sixth Extinction",
];

const FALLBACK: BookData[] = EXAMPLE_TITLES.map((title, i) => ({
  id: `fallback-${i}`,
  title,
  author: "Example Author",
}));

export default function LibraryPage() {
  const [q, setQ] = useState("");
  const [books, setBooks] = useState<BookData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const url = q ? `/api/books?q=${encodeURIComponent(q)}` : `/api/books`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setBooks(Array.isArray(d) ? d : []))
      .catch((e) => {
        console.error(e);
        setBooks([]);
      })
      .finally(() => setLoading(false));
  }, [q]);

  const visible = books.length > 0 ? books : FALLBACK;

  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        background: "#140d04",
        overflow: "hidden",
      }}
    >
      <style>{`
        .library-search::placeholder { color: rgba(255,218,160,0.45); }
      `}</style>
      {/* 3D scene — position:relative so the absolute Canvas fills this div */}
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <ShelfScene books={visible} />
      </div>

      {/* Top bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 28px",
          background:
            "linear-gradient(to bottom, rgba(20,13,4,0.9) 0%, transparent 100%)",
          zIndex: 10,
        }}
      >
        {/* Branding */}
        <a href="/" style={{ textDecoration: "none" }}>
          <div
            style={{
              color: "#ffe8c0",
              fontWeight: 600,
              fontSize: 18,
              letterSpacing: -0.3,
              fontFamily: "system-ui",
            }}
          >
            Forum
          </div>
          <div
            style={{
              color: "rgba(255,220,160,0.75)",
              fontSize: 10,
              letterSpacing: 2.5,
              textTransform: "uppercase",
              fontFamily: "system-ui",
              marginTop: 1,
            }}
          >
            Library
          </div>
        </a>

        {/* Search bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(255,232,180,0.11)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255,218,150,0.32)",
            borderRadius: 40,
            padding: "9px 18px",
            minWidth: 320,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,218,160,0.85)"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            style={{
              background: "none",
              border: "none",
              outline: "none",
              color: "#ffe8c0",
              fontSize: 13,
              width: 240,
              caretColor: "#ffc87a",
              fontFamily: "system-ui",
            }}
            className="library-search"
            placeholder="Search title or author…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {loading && (
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "rgba(255,200,120,0.55)",
                flexShrink: 0,
              }}
            />
          )}
        </div>

        {/* Book count */}
        <div
          style={{
            color: "rgba(255,220,160,0.65)",
            fontSize: 12,
            fontFamily: "system-ui",
            minWidth: 80,
            textAlign: "right",
          }}
        >
          {books.length > 0 ? `${books.length} books` : ""}
        </div>
      </div>

      {/* Bottom hint */}
      <div
        style={{
          position: "absolute",
          bottom: 22,
          left: "50%",
          transform: "translateX(-50%)",
          color: "rgba(255,220,160,0.2)",
          fontSize: 10,
          letterSpacing: 2,
          textTransform: "uppercase",
          fontFamily: "system-ui",
          userSelect: "none",
          zIndex: 10,
          whiteSpace: "nowrap",
        }}
      >
        Scroll to browse · Click to read
      </div>
    </main>
  );
}
