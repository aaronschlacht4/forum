export type Shelf = "read" | "current" | "trending" | "recommended";

export type Book = {
  id: string;
  title: string;
  author: string;
  tags: string[];
};

export const books: Book[] = [
  { id: "1", title: "Rhapsody in Blue", author: "George Gershwin", tags: ["music", "jazz"] },
  { id: "2", title: "The Great Gatsby", author: "F. Scott Fitzgerald", tags: ["classic", "1920s"] },
  { id: "3", title: "Sapiens", author: "Yuval Noah Harari", tags: ["history", "nonfiction"] },
];

export const shelves: Record<Shelf, string[]> = {
  read: ["2"],
  current: ["1"],
  trending: ["3", "1"],
  recommended: ["2", "3"],
};
