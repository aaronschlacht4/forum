"use client";

import Link from "next/link";

type Book = {
  id: string;
  title: string;
  author: string;
  tags?: string[];
};

export default function Bookshelf2D({
  books,
}: {
  books: Book[];
  perShelf?: number;
}) {
  return (
    <div style={{ padding: 24, border: "4px solid lime" }}>
      <h2>✅ BOOKSHELF IS RENDERING</h2>
      <p>Books loaded: {books.length}</p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
        {books.map((b) => (
          <Link
            key={b.id}
            href={`/book/${b.id}`}
            style={{
              display: "inline-block",
              width: 180,
              padding: 12,
              border: "1px solid #444",
              borderRadius: 10,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ fontWeight: 700 }}>{b.title}</div>
            <div style={{ opacity: 0.8 }}>{b.author}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
