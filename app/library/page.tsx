"use client";

import React, { useEffect, useState } from "react";
import ShelfScene, { BookData } from "@/components/ShelfScene";

export default function Page() {
  const [q, setQ] = useState("");
  const [books, setBooks] = useState<BookData[]>([]);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const run = async () => {
      try {
        setStatus("Loading…");
        const url = q ? `/api/books?q=${encodeURIComponent(q)}` : `/api/books`;
        const res = await fetch(url);

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`API ${res.status}: ${text}`);
        }

        const data = await res.json();
        setBooks(Array.isArray(data) ? data : []);
        setStatus("OK");
      } catch (e: any) {
        console.error(e);
        setBooks([]);
        setStatus(e?.message ?? "Failed to fetch /api/books");
      }
    };

    run();
  }, [q]);

  const visibleBooks =
    books.length > 0
      ? books
      : Array.from({ length: 12 }).map((_, i) => ({
          id: `fallback-${i}`,
          title: `Book ${i + 1}`,
          author: "Author",
          // pdfUrl: "/pdfs/example.pdf" // optional fallback
        }));

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-8 py-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-5xl font-semibold tracking-tight">Univault</h1>
            <p className="mt-2 text-gray-500">Your digital bookshelf</p>
            <p className="mt-2 text-xs text-gray-400">
              {books.length} books from API — {status}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              className="w-[460px] max-w-[60vw] rounded-full border border-gray-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
              placeholder="Search title or author…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="rounded-full border border-gray-200 px-5 py-3 text-sm hover:bg-gray-50">
              Search
            </button>
          </div>
        </header>

        {/* BIG shelf area */}
        <section className="mt-8 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="h-[70vh] min-h-[560px] w-full rounded-2xl bg-gray-50">
            <ShelfScene books={visibleBooks} />
          </div>
        </section>
      </div>
    </main>
  );
}
