#!/usr/bin/env node
/**
 * Computes and stores each calibrated book's cover_aspect_ratio and
 * cover_spine_px (sql-migrations/13-add-cover-metrics.sql) — read off the
 * actual file in the `covers` bucket, the same way makeCoverMaterial reads
 * them at render time (lib/bookModel.ts), not typed in by hand.
 *
 * spineThickness below mirrors ShelfScene.tsx's own copy — that file is a
 * "use client" component this plain-Node script can't import, so, same as
 * scripts/backfill-page-counts.mjs already does for slugify, it's kept in
 * sync by hand rather than shared. If the thickness formula changes there,
 * update it here too.
 *
 *   node scripts/backfill-cover-metrics.mjs
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
const COVERS_BUCKET = "covers";

// Mirrors ShelfScene.tsx's spineThickness — see the file-level comment.
const DEFAULT_PAGE_COUNT = 300;
const THICKNESS_MIN = 0.55;
const THICKNESS_MAX = 1.7;
function spineThickness(pageCount) {
  if (!pageCount || pageCount <= 0) return 1;
  const raw = Math.sqrt(pageCount / DEFAULT_PAGE_COUNT);
  return Math.min(THICKNESS_MAX, Math.max(THICKNESS_MIN, raw));
}

// Mirrors lib/bookModel.ts's spineFractionOfWidth constants — see that
// file's SPINE_CURVE_MAGNIFICATION comment for why 1.17 is there at all.
const SPINE_PX_PER_REFERENCE_HEIGHT = 203;
const REFERENCE_HEIGHT = 1200;
const SPINE_CURVE_MAGNIFICATION = 1.17;

/**
 * Pixel dimensions straight out of a JPEG's own byte stream — no
 * dependency needed for something this small. Walks the marker segments
 * looking for a Start-Of-Frame marker (0xC0–0xCF, except the four that
 * aren't actually SOF: DHT/JPG/DAC/DHP), whose payload always starts with
 * 1 byte of precision then big-endian height, then width.
 */
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null; // not a JPEG
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2; // markers with no length field
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    const isSOF = marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      return { width, height };
    }
    i += 2 + len;
  }
  return null;
}

async function listBooks() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/books?select=id,title,cover_path,page_count,cover_calibrated,cover_aspect_ratio,cover_spine_px&order=title`,
    { headers: AUTH }
  );
  if (!res.ok) throw new Error(`Listing books failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchCoverBytes(coverPath) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${COVERS_BUCKET}/${coverPath}`, { headers: AUTH });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
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
  console.log(`Checking ${books.length} book(s)\n`);

  let updated = 0, skipped = 0, missing = 0, notCalibrated = 0;
  for (const book of books) {
    const label = (book.title || book.id).slice(0, 32).padEnd(32);

    if (!book.cover_calibrated) {
      console.log(`  ${label} not cover_calibrated — skipped`);
      notCalibrated++;
      continue;
    }
    if (!book.cover_path) {
      console.log(`  ${label} no cover_path — skipped`);
      missing++;
      continue;
    }

    const bytes = await fetchCoverBytes(book.cover_path);
    if (!bytes) {
      console.log(`  ${label} cover file not found in storage — skipped`);
      missing++;
      continue;
    }

    const size = jpegSize(bytes);
    if (!size) {
      console.log(`  ${label} couldn't read JPEG dimensions — skipped`);
      missing++;
      continue;
    }

    const thickness = spineThickness(book.page_count);
    const aspectRatio = size.width / size.height;
    const spinePx =
      SPINE_PX_PER_REFERENCE_HEIGHT *
      SPINE_CURVE_MAGNIFICATION *
      thickness *
      (size.height / REFERENCE_HEIGHT);

    await patchMetrics(book.id, aspectRatio, spinePx);
    console.log(
      `  ${label} ${size.width}×${size.height} → aspect ${aspectRatio.toFixed(4)}, spine ${spinePx.toFixed(1)}px`
    );
    updated++;
  }

  console.log(
    `\nDone: ${updated} updated, ${notCalibrated} not calibrated, ${missing} missing file/dims, ${skipped} skipped`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
