import BookCard from "./BookCard";

export type Book = {
  id: string;
  title: string;
  author: string;
  tags: string[];
  pdf_path?: string | null;
};

export default function Shelf({ title, books }: { title: string; books: Book[] }) {
  return (
    <section style={{ marginTop: 18 }}>
      <h2 style={{ marginBottom: 10 }}>{title}</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        {books.map((b) => (
          <BookCard key={b.id} book={b} />
        ))}
      </div>
    </section>
  );
}
