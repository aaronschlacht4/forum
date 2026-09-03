#!/usr/bin/env node
/**
 * One-time catch-up for books extracted before `books.page_count` existed.
 *
 * Every book already run through scripts/extract-books.mjs --upload has its
 * page count sitting in its JSON in the texts bucket — this just reads that
 * back and writes it onto the row, rather than re-parsing every PDF again.
 * A book still missing its extracted text is left alone; it gets page_count
 * for free the next time extract-books.mjs runs on it.
 *
 *   node scripts/backfill-page-counts.mjs
 */

import fs from "node:fs";
import path from "node:path";

function readEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) throw new Error("No .env.local in this directory");
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i === -1 || line.trim().startsWith("#")) continue;
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  return { url, key };
}

const { url: SUPABASE_URL, key: SERVICE_KEY } = readEnv();
const AUTH = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
const TEXT_BUCKET = "texts";

/** Matches the naming in scripts/extract-books.mjs. */
const slugify = (s) => (s || "book").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function listBooks() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/books?select=id,title,page_count&order=title`,
    { headers: AUTH }
  );
  if (!res.ok) throw new Error(`Listing books failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchPageCount(title) {
  const name = `${slugify(title)}.json`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${TEXT_BUCKET}/${name}`, { headers: AUTH });
  if (!res.ok) return null; // not extracted yet — nothing to backfill from
  const json = await res.json();
  return typeof json.pageCount === "number" ? json.pageCount : null;
}

async function patchPageCount(id, pageCount) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/books?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...AUTH, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ page_count: pageCount }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 140)}`);
}

async function main() {
  const books = await listBooks();
  console.log(`Checking ${books.length} book(s)\n`);

  let updated = 0, skipped = 0, missing = 0;
  for (const book of books) {
    const label = (book.title || book.id).slice(0, 32).padEnd(32);
    if (book.page_count != null) {
      console.log(`  ${label} already has page_count=${book.page_count}`);
      skipped++;
      continue;
    }
    const pageCount = await fetchPageCount(book.title);
    if (pageCount == null) {
      console.log(`  ${label} no extracted text yet — skipped`);
      missing++;
      continue;
    }
    await patchPageCount(book.id, pageCount);
    console.log(`  ${label} page_count ← ${pageCount}`);
    updated++;
  }

  console.log(`\nDone: ${updated} updated, ${skipped} already had it, ${missing} not extracted yet`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
