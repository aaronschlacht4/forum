"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ShelfScene, { BookData } from "@/components/ShelfScene";
import { useAuth } from "@/lib/AuthContext";
import {
  LibraryItem,
  ShelvesNotSetUpError,
  duplicateItem,
  loadLibrary,
  removeItem,
  savePositions,
} from "@/lib/library";

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
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [books, setBooks] = useState<BookData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedItems, setItems] = useState<LibraryItem[] | null>(null);
  const [arranging, setArranging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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

  // The catalogue keyed by id, so a shelf entry can find its book — including
  // the second entry a duplicated book produces.
  const byId = useMemo(() => {
    const m = new Map<string, BookData>();
    books.forEach((b) => m.set(String(b.id), b));
    return m;
  }, [books]);

  const catalogueIds = useMemo(() => books.map((b) => String(b.id)), [books]);
  const catalogueKey = catalogueIds.join(",");

  // Load the shelf once the catalogue is known: a first-time shelf is seeded
  // from it, so the two have to arrive in order.
  useEffect(() => {
    if (!user || q || catalogueIds.length === 0) return;
    let cancelled = false;
    loadLibrary(user.id, catalogueIds)
      .then((rows) => { if (!cancelled) setItems(rows); })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ShelvesNotSetUpError) {
          // Expected until the migration is run — say what to do, don't shout.
          console.warn(`[library] ${e.message}`);
          setNotice(
            "Arrange away — but run sql-migrations/10-create-library-items.sql in Supabase to keep it."
          );
          return;
        }
        console.error(
          "[library] could not load shelf:",
          e instanceof Error ? `${e.name}: ${e.message}` : e
        );
        setNotice("Could not load your shelf — showing the catalogue.");
      });
    return () => { cancelled = true; };
    // catalogueKey rather than the array: same ids, same shelf.
  }, [user, q, catalogueKey, catalogueIds]);

  // Signing out or searching falls back to the catalogue without discarding the
  // loaded shelf, so clearing the search brings the arrangement straight back.
  const persisted = user && !q ? loadedItems : null;

  // Arranging doesn't wait on storage. Where there is no saved shelf — signed
  // out, or the shelf table not created yet — the books get stand-in items so
  // every path below is identical, and the order simply lives for the session.
  const sessionSeed = useMemo<LibraryItem[]>(
    () =>
      books.map((b, i) => ({
        id: `session:${b.id}:${i}`,
        bookId: String(b.id),
        position: i,
      })),
    [books]
  );
  const [sessionItems, setSessionItems] = useState<LibraryItem[] | null>(null);

  const items = persisted ?? (q ? null : sessionItems ?? sessionSeed);
  const savesShelf = persisted !== null;
  const canArrange = !q && books.length > 0 && (items?.length ?? 0) > 0;

  const setShelf = useCallback(
    (next: LibraryItem[]) => (savesShelf ? setItems(next) : setSessionItems(next)),
    [savesShelf]
  );

  /** The shelf as the reader arranged it, or the plain catalogue otherwise. */
  const shelf = useMemo<BookData[]>(() => {
    if (!items) return books;
    return items
      .map((it): BookData | null => {
        const b = byId.get(it.bookId);
        return b ? { ...b, itemId: it.id, slot: it.position } : null;
      })
      .filter((b): b is BookData => b !== null);
  }, [items, byId, books]);

  // Keep the last good shelf so a failed write can be rolled back to it.
  const lastGood = useRef<LibraryItem[] | null>(null);
  useEffect(() => { lastGood.current = items; }, [items]);

  const persist = useCallback(
    async (next: LibraryItem[], work: () => Promise<void>) => {
      const previous = lastGood.current;
      setShelf(next); // optimistic: the shelf should move under the hand at once
      if (!savesShelf) return; // session-only shelf; nothing to write to
      try {
        await work();
        setNotice(null);
      } catch (e) {
        console.error(
          "[library] change failed:",
          e instanceof Error ? `${e.name}: ${e.message}` : e
        );
        setShelf(previous ?? next);
        setNotice("That change didn't save — put back.");
      }
    },
    [savesShelf, setShelf]
  );

  const handleMove = useCallback(
    (from: number, toSlot: number) => {
      const current = lastGood.current;
      const moving = current?.[from];
      if (!current || !moving || moving.position === toSlot) return;

      // Slots hold one book. Dropping onto an occupied one trades places with
      // its occupant, which keeps every book on the case — nothing is pushed
      // off the end or silently stacked two deep.
      const occupant = current.findIndex(
        (it, i) => i !== from && it.position === toSlot
      );
      const next = current.map((it, i) => {
        if (i === from) return { ...it, position: toSlot };
        if (i === occupant) return { ...it, position: moving.position };
        return it;
      });
      persist(next, () => savePositions(user!.id, next));
    },
    [user, persist]
  );

  const handleDuplicate = useCallback(
    (index: number) => {
      const current = lastGood.current;
      const source = current?.[index];
      if (!current || !source) return;

      // Stand the copy in the nearest free slot to its original.
      const taken = new Set(current.map((it) => it.position));
      let slot = source.position + 1;
      while (taken.has(slot)) slot++;

      if (!savesShelf) {
        // A stand-in copy needs its own id, or the two would key to one book.
        persist(
          [
            ...current,
            {
              id: `session:${source.bookId}:${slot}`,
              bookId: source.bookId,
              position: slot,
            },
          ],
          async () => {}
        );
        return;
      }

      persist(current, async () => {
        const copy = await duplicateItem(user!.id, source, slot);
        const next = [...current, copy];
        await savePositions(user!.id, next);
        setShelf(next);
      });
    },
    [user, persist, savesShelf, setShelf]
  );

  const handleRemove = useCallback(
    (index: number) => {
      const current = lastGood.current;
      const gone = current?.[index];
      if (!current || !gone) return;
      // Removing leaves a gap rather than closing it up: the other books stay
      // exactly where they were put.
      const next = current.filter((_, i) => i !== index);
      persist(next, async () => {
        await removeItem(gone.id);
      });
    },
    [persist]
  );

  const visible = shelf.length > 0 ? shelf : FALLBACK;

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
        <ShelfScene
          books={visible}
          editable={arranging && canArrange}
          onMove={handleMove}
          onDuplicate={handleDuplicate}
          onRemove={handleRemove}
        />
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

        {/* Arrange toggle + book count */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            minWidth: 80,
            justifyContent: "flex-end",
          }}
        >
          {canArrange && (
            <button
              onClick={() => setArranging((v) => !v)}
              style={{
                background: arranging
                  ? "rgba(255,200,120,0.22)"
                  : "rgba(255,232,180,0.09)",
                border: `1px solid rgba(255,218,150,${arranging ? 0.6 : 0.28})`,
                borderRadius: 40,
                color: "#ffe8c0",
                cursor: "pointer",
                fontFamily: "system-ui",
                fontSize: 12,
                padding: "7px 15px",
              }}
            >
              {arranging ? "Done" : "Arrange"}
            </button>
          )}
          <div
            style={{
              color: "rgba(255,220,160,0.65)",
              fontSize: 12,
              fontFamily: "system-ui",
              textAlign: "right",
            }}
          >
            {shelf.length > 0 ? `${shelf.length} books` : ""}
          </div>
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
        {arranging && canArrange
          ? `Drag a book into any slot, on any shelf · Click one for duplicate and remove${
              savesShelf ? "" : " · Not saved"
            }`
          : "Scroll to browse · Click to read"}
      </div>

      {notice && (
        <div
          style={{
            position: "absolute",
            bottom: 52,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(60,20,10,0.92)",
            border: "1px solid rgba(255,170,140,0.45)",
            borderRadius: 8,
            color: "#ffd9c8",
            fontFamily: "system-ui",
            fontSize: 12,
            padding: "8px 14px",
            zIndex: 20,
          }}
        >
          {notice}
        </div>
      )}
    </main>
  );
}
