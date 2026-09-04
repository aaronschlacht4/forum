#!/usr/bin/env node
/**
 * Computes each book's target wraparound-cover dimensions and stores them in
 * books.cover_aspect_ratio / books.cover_spine_px
 * (sql-migrations/13-add-cover-metrics.sql).
 *
 * These are a SPEC FOR BUILDING a cover, not a measurement of one that
 * already exists — everything is computed against the fixed 1200px reference
 * height the whole convention is defined in terms of, so the numbers say
 * "draw this book's jacket at these proportions" rather than "this file
 * happens to be this big". That means a book with no cover file yet still
 * gets a meaningful answer, which is the point: the numbers come first, the
 * artwork is built to match, and cover_calibrated goes true once it is.
 *
 * The layout, against a 1200px-tall canvas (see BOOK_MODEL_URL's doc comment
 * in lib/bookModel.ts):
 *
 *   [ 921px back cover | 203px x thickness spine | 921px front cover ]
 *
 *   spinePx    = 203 x thickness
 *   totalWidth = 921 + spinePx + 921
 *   aspect     = totalWidth / 1200
 *
 * spineThickness below mirrors ShelfScene.tsx's own copy — that file is a
 * "use client" component this plain-Node script can't import, so, same as
 * scripts/backfill-page-counts.mjs already does for slugify, it's kept in
 * sync by hand rather than shared. If the thickness formula changes there,
 * update it here too.
 *
 *   node scripts/backfill-cover-metrics.mjs           # write to the database
 *   node scripts/backfill-cover-metrics.mjs --dry-run # print only
 */

import fs from "node:fs";
import path from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");

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

// Mirrors ShelfScene.tsx's spineThickness — see the file-level comment.
const DEFAULT_PAGE_COUNT = 300;
const THICKNESS_MIN = 0.55;
const THICKNESS_MAX = 1.7;
function spineThickness(pageCount) {
  if (!pageCount || pageCount <= 0) return 1;
  const raw = Math.sqrt(pageCount / DEFAULT_PAGE_COUNT);
  return Math.min(THICKNESS_MAX, Math.max(THICKNESS_MIN, raw));
}

// The convention's own constants, all defined against REFERENCE_HEIGHT.
const REFERENCE_HEIGHT = 1200;
const SPINE_PX_PER_REFERENCE_HEIGHT = 203;
const COVER_WIDTH = 921;

function coverSpec(pageCount) {
  const thickness = spineThickness(pageCount);
  const spinePx = SPINE_PX_PER_REFERENCE_HEIGHT * thickness;
  const totalWidth = COVER_WIDTH * 2 + spinePx;
  return {
    thickness,
    spinePx,
    totalWidth,
    aspectRatio: totalWidth / REFERENCE_HEIGHT,
  };
}

async function listBooks() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/books?select=id,title,page_count,cover_calibrated&order=title`,
    { headers: AUTH }
  );
  if (!res.ok) throw new Error(`Listing books failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function patchMetrics(id, aspectRatio, spinePx) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/books?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...AUTH, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ cover_aspect_ratio: aspectRatio, cover_spine_px: spinePx }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 140)}`);
}

async function main() {
  const books = await listBooks();
  console.log(
    `Cover build spec for ${books.length} book(s), at ${REFERENCE_HEIGHT}px height` +
      (DRY_RUN ? " (dry run, nothing written)\n" : "\n")
  );

  const pad = (s, n) => String(s).padEnd(n);
  const padL = (s, n) => String(s).padStart(n);
  console.log(
    pad("title", 26) + padL("pages", 6) + padL("thick", 8) + padL("spine px", 10) +
      padL("build size", 14) + padL("aspect", 9) + "  calibrated"
  );
  console.log("-".repeat(87));

  let updated = 0;
  for (const book of books) {
    const { thickness, spinePx, totalWidth, aspectRatio } = coverSpec(book.page_count);

    console.log(
      pad((book.title || book.id).slice(0, 25), 26) +
        padL(book.page_count ?? "?", 6) +
        padL(thickness.toFixed(3), 8) +
        padL(spinePx.toFixed(1), 10) +
        padL(`${Math.round(totalWidth)}x${REFERENCE_HEIGHT}`, 14) +
        padL(aspectRatio.toFixed(4), 9) +
        "  " + (book.cover_calibrated ? "yes" : "no")
    );

    if (!DRY_RUN) {
      await patchMetrics(book.id, aspectRatio, spinePx);
      updated++;
    }
  }

  console.log(
    `\nLayout: ${COVER_WIDTH}px back | spine | ${COVER_WIDTH}px front, on a ${REFERENCE_HEIGHT}px canvas.`
  );
  console.log(
    "A book with no page_count falls back to thickness 1 — the classic 203px spine on 2045px."
  );
  if (!DRY_RUN) console.log(`\nDone: ${updated} row(s) written.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
