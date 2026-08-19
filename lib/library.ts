import { supabase } from "./supabase";

/**
 * One book standing in one slot of one person's bookcase.
 *
 * `id` identifies the placement, not the book — duplicating a book gives two
 * items with the same `bookId`, so `id` is what moving and removal act on and
 * what the shelf keys its books by.
 *
 * `position` is the slot the book occupies, counted across the whole bookcase
 * from the top-left — not a rank in a list. Slots may be left empty, which is
 * what lets a book be stood on a half-full shelf lower down rather than being
 * packed in behind the last one.
 */
export type LibraryItem = {
  id: string;
  bookId: string;
  position: number;
};

type Row = { id: string; book_id: string; position: number };

const toItem = (r: Row): LibraryItem => ({
  id: r.id,
  bookId: r.book_id,
  position: r.position,
});

/** Raised when the shelf table hasn't been created yet. */
export class ShelvesNotSetUpError extends Error {
  constructor() {
    super(
      "The library_items table does not exist. Run " +
        "sql-migrations/10-create-library-items.sql in the Supabase SQL editor."
    );
    this.name = "ShelvesNotSetUpError";
  }
}

/**
 * Turn a Supabase error into something that survives being logged.
 *
 * Supabase hands back a plain object, so throwing it as-is prints an unhelpful
 * `{}` — the message, code and hint are all lost by the time anyone reads it.
 */
function asError(error: { message?: string; code?: string; hint?: string }): Error {
  // PGRST205 is PostgREST for "no such table".
  if (error?.code === "PGRST205") return new ShelvesNotSetUpError();
  const err = new Error(error?.message || "Unknown Supabase error");
  err.name = error?.code ? `SupabaseError(${error.code})` : "SupabaseError";
  if (error?.hint) err.message += ` — ${error.hint}`;
  return err;
}

/**
 * The user's shelf, seeded from the catalogue the first time they visit.
 *
 * Seeding on read rather than at sign-up means people who registered before
 * shelves existed still get one, and it stays correct if books were added to the
 * catalogue in between. Books already on the shelf are never re-added, so a
 * deliberately removed book does not reappear.
 */
export async function loadLibrary(
  userId: string,
  catalogueIds: string[]
): Promise<LibraryItem[]> {
  const { data, error } = await supabase
    .from("library_items")
    .select("id,book_id,position")
    .eq("user_id", userId)
    .order("position", { ascending: true });

  if (error) throw asError(error);

  const items = (data ?? []).map(toItem);
  if (items.length > 0 || catalogueIds.length === 0) return items;

  const seed = catalogueIds.map((bookId, i) => ({
    user_id: userId,
    book_id: bookId,
    position: i,
  }));
  const { data: created, error: seedError } = await supabase
    .from("library_items")
    .insert(seed)
    .select("id,book_id,position");

  // A failed seed is not fatal: the caller falls back to the catalogue order,
  // and the next load tries again.
  if (seedError) {
    console.warn("[library] could not seed shelf:", seedError.message);
    return [];
  }
  return (created ?? []).map(toItem).sort((a, b) => a.position - b.position);
}

/**
 * Write the bookcase back.
 *
 * Every placement is written with the slot it actually holds, and the whole set
 * goes at once rather than only the book that moved — a swap written by halves
 * would leave two books claiming one slot.
 */
export async function savePositions(
  userId: string,
  items: LibraryItem[]
): Promise<void> {
  if (!items.length) return;
  const rows = items.map((it) => ({
    id: it.id,
    user_id: userId,
    book_id: it.bookId,
    position: it.position,
  }));
  const { error } = await supabase.from("library_items").upsert(rows);
  if (error) throw asError(error);
}

/** Put a second copy of a book into a given slot. */
export async function duplicateItem(
  userId: string,
  item: LibraryItem,
  slot: number
): Promise<LibraryItem> {
  const { data, error } = await supabase
    .from("library_items")
    .insert({ user_id: userId, book_id: item.bookId, position: slot })
    .select("id,book_id,position")
    .single();

  if (error) throw asError(error);
  return toItem(data as Row);
}

/** Take one copy off the shelf. The book itself stays in the catalogue. */
export async function removeItem(id: string): Promise<void> {
  const { error } = await supabase.from("library_items").delete().eq("id", id);
  if (error) throw asError(error);
}
