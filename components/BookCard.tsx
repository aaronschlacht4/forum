import Link from "next/link";
import { Book } from "./Shelf";

export default function BookCard({ book }: { book: Book }) {
  return (
    <Link href={`/book/${book.id}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{ border: "1px solid #ccc", padding: 12, borderRadius: 8 }}>
        <h3 style={{ margin: 0 }}>{book.title}</h3>
        <p style={{ margin: "6px 0 0 0", opacity: 0.8 }}>{book.author}</p>
      </div>
    </Link>
  );
}
