#!/usr/bin/env node
/**
 * Turn the library's PDFs into readable text.
 *
 * A PDF is a page of glyphs at coordinates, not prose: lines arrive as
 * fragments, words break across line ends with a hyphen, and every page carries
 * a running header and a page number that nobody wants to read. This pulls the
 * words out and puts the structure back — paragraphs, chapters — so the reader
 * can set them as type instead of showing a picture of a page.
 *
 * The words themselves are left exactly as the author wrote them. Only layout
 * is reconstructed; nothing is paraphrased or summarised.
 *
 * Page boundaries are kept, because annotations are anchored to page numbers —
 * pouring the text into one stream would quietly break every existing
 * highlight.
 *
 *   node scripts/extract-books.mjs                  # every book
 *   node scripts/extract-books.mjs --only frank     # titles matching "frank"
 *   node scripts/extract-books.mjs --out data/books # where the JSON lands
 *   node scripts/extract-books.mjs --upload         # also put it in Supabase
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

/* ---- Options ---- */

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1] ?? true;
};

const OPTIONS = {
  only: flag("only"),
  out: flag("out", "data/books"),
  upload: argv.includes("--upload"),
  bucket: flag("bucket", "books"),
  textBucket: flag("text-bucket", "texts"),
};

/* ---- Supabase ---- */

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

async function listBooks() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/books?select=id,title,author,pdf_path&order=title`,
    { headers: AUTH }
  );
  if (!res.ok) throw new Error(`Listing books failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function downloadPdf(pdfPath) {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${OPTIONS.bucket}/${encodeURI(pdfPath)}`,
    { headers: AUTH }
  );
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
  return new Uint8Array(await res.arrayBuffer());
}

/* ---- pdf.js, wherever it happens to live ---- */

async function loadPdfjs() {
  // Resolved as files rather than by package name: pdf.js restricts its
  // `exports`, and here it is usually a nested dependency of react-pdf rather
  // than a top-level install.
  const roots = [
    "node_modules/pdfjs-dist",
    "node_modules/react-pdf/node_modules/pdfjs-dist",
  ];
  for (const root of roots) {
    for (const build of ["legacy/build/pdf.mjs", "build/pdf.mjs"]) {
      const file = path.join(process.cwd(), root, build);
      if (fs.existsSync(file)) return import(pathToFileURL(file).href);
    }
  }
  throw new Error("Could not find pdf.js. Try: npm install pdfjs-dist");
}

/* ---- Page → lines ---- */

/**
 * Glyph runs come back in drawing order, not reading order, so they are grouped
 * by their baseline and sorted across the page. `y` and the text height are kept
 * so headers, footers and headings can be told apart from body text further on.
 */
function toLines(content) {
  const rows = new Map();

  for (const item of content.items) {
    if (typeof item.str !== "string" || !item.str.trim()) continue;
    const [, , , height, x, y] = item.transform;
    // Round the baseline so glyphs a hair apart still count as one line.
    const key = Math.round(y * 2) / 2;
    if (!rows.has(key)) rows.set(key, { y: key, height: Math.abs(height), runs: [] });
    rows.get(key).runs.push({ x, str: item.str });
  }

  return [...rows.values()]
    .sort((a, b) => b.y - a.y) // PDF y grows upward; reading order is downward
    .map((row) => {
      row.runs.sort((a, b) => a.x - b.x);
      return {
        y: row.y,
        height: row.height,
        left: Math.min(...row.runs.map((r) => r.x)),
        text: row.runs.map((r) => r.str).join("").replace(/\s+/g, " ").trim(),
      };
    })
    .filter((line) => line.text.length > 0);
}

/* ---- Running headers, footers and page numbers ---- */

const looksLikeFolio = (text) =>
  /^[ivxlcdm]+$/i.test(text) || /^\d{1,4}$/.test(text) || /^[-—–\s]*\d{1,4}[-—–\s]*$/.test(text);

/**
 * Lines that recur at the top or bottom of many pages are furniture, not prose.
 * Spotting them by repetition rather than position means a book that puts its
 * title top-left and another that centres it are both handled.
 */
function findFurniture(pages) {
  const seen = new Map();
  for (const lines of pages) {
    const edges = [...lines.slice(0, 2), ...lines.slice(-2)];
    for (const line of edges) {
      // Page numbers vary line to line, so compare the shape, not the digits.
      const shape = line.text.replace(/\d+/g, "#").toLowerCase();
      if (shape.length < 3) continue;
      seen.set(shape, (seen.get(shape) ?? 0) + 1);
    }
  }
  const threshold = Math.max(3, pages.length * 0.25);
  return new Set([...seen].filter(([, n]) => n >= threshold).map(([shape]) => shape));
}

function stripFurniture(lines, furniture) {
  return lines.filter((line, i) => {
    const atEdge = i < 2 || i >= lines.length - 2;
    if (!atEdge) return true;
    if (looksLikeFolio(line.text)) return false;
    return !furniture.has(line.text.replace(/\d+/g, "#").toLowerCase());
  });
}

/* ---- Lines → paragraphs ---- */

const ENDS_SENTENCE = /[.!?…]["'”’)]?$/;

/**
 * How eager the paragraph breaks are. Tuned by sweeping these against the share
 * of paragraphs that end mid-sentence — the tell-tale of a paragraph cut in two.
 * Overridable by env var so they can be swept again on a new set of PDFs.
 */
const BREAK = {
  // A gap this much wider than the usual line pitch starts a paragraph. The
  // first cut of this was 1.6, which fired on a third of all line transitions.
  gap: Number(process.env.PARA_GAP ?? 2.4),
  // An indent this many times the text height counts as a fresh paragraph.
  indent: Number(process.env.PARA_INDENT ?? 0.9),
  // A finished sentence this far short of the margin ends a paragraph.
  short: Number(process.env.PARA_SHORT ?? 0.62),
};

/**
 * Joins wrapped lines back into paragraphs.
 *
 * A new paragraph is started on an indent, on an unusually wide gap between
 * baselines, or after a line that ended a sentence well short of the margin —
 * between them these catch both indented and block-spaced typesetting. Words
 * hyphenated across a line break are put back together.
 */
function toParagraphs(lines) {
  if (!lines.length) return [];

  const widths = lines.map((l) => l.text.length);
  const bodyWidth = widths.sort((a, b) => a - b)[Math.floor(widths.length * 0.9)] || 60;
  const gaps = [];
  for (let i = 1; i < lines.length; i++) gaps.push(Math.abs(lines[i - 1].y - lines[i].y));
  const typicalGap = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] || 12;

  // The margin is where most lines start, not the leftmost thing on the page. A
  // single stray element further left — a folio, a footnote marker — would drag
  // a minimum outwards and make every line of body text look indented, which
  // broke each one into its own paragraph.
  const tally = new Map();
  for (const line of lines) {
    const bucket = Math.round(line.left);
    tally.set(bucket, (tally.get(bucket) ?? 0) + 1);
  }
  const leftEdge = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];

  const paragraphs = [];
  let current = "";

  const flush = () => {
    const text = current.replace(/\s+/g, " ").trim();
    if (text) paragraphs.push(text);
    current = "";
  };

  lines.forEach((line, i) => {
    const previous = lines[i - 1];
    // An indent, not a centred line: something set in the middle of the measure
    // starts far from the margin and is not the start of a paragraph.
    const offset = line.left - leftEdge;
    const indented =
      offset > line.height * BREAK.indent && offset < line.height * BREAK.indent * 6;
    const spaced = previous && Math.abs(previous.y - line.y) > typicalGap * BREAK.gap;
    const ranShort =
      previous &&
      ENDS_SENTENCE.test(previous.text) &&
      previous.text.length < bodyWidth * BREAK.short;

    if (current && (indented || spaced || ranShort)) flush();

    if (/[-‐‑–]$/.test(current) && /^[a-z]/.test(line.text)) {
      current = current.replace(/[-‐‑–]$/, "") + line.text; // word split across lines
    } else {
      current = current ? `${current} ${line.text}` : line.text;
    }
  });

  flush();
  return paragraphs;
}

/* ---- Chapters ---- */

const CHAPTER_WORD = /^(chapter|book|part|canto|letter|volume|act|scene|epilogue|prologue|preface|introduction|appendix|afterword|foreword)\b/i;

/**
 * A heading is short, sits on its own, and either names itself a chapter or is
 * set in capitals. Numerals alone count too, but only alongside one of those,
 * so a stray page number never becomes a chapter.
 */
function findHeading(lines) {
  for (const line of lines.slice(0, 4)) {
    const text = line.text.trim();
    if (!text || text.length > 70 || ENDS_SENTENCE.test(text)) continue;
    const named = CHAPTER_WORD.test(text);
    const shouted = text === text.toUpperCase() && /[A-Z]{3}/.test(text);
    if (named || shouted) return text;
  }
  return null;
}

/* ---- One book ---- */

async function extract(book, pdfjs) {
  const bytes = await downloadPdf(book.pdf_path);
  const doc = await pdfjs.getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  const raw = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    raw.push(toLines(await page.getTextContent()));
    page.cleanup();
  }

  const furniture = findFurniture(raw);
  const chapters = [];
  const pages = raw.map((lines, i) => {
    const body = stripFurniture(lines, furniture);
    const heading = findHeading(body);
    if (heading && !chapters.some((c) => c.title === heading)) {
      chapters.push({ title: heading, page: i + 1 });
    }
    return { page: i + 1, paragraphs: toParagraphs(body) };
  });

  await doc.destroy();

  return {
    id: book.id,
    title: book.title,
    author: book.author,
    source: book.pdf_path,
    format: 1,
    pageCount: pages.length,
    chapters,
    pages,
  };
}

/* ---- Output ---- */

const slugify = (s) =>
  (s || "book").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function upload(name, json) {
  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${OPTIONS.textBucket}/${name}`,
    {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json", "x-upsert": "true" },
      body: json,
    }
  );
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 140)}`);
}

async function main() {
  const pdfjs = await loadPdfjs();
  let books = await listBooks();

  if (OPTIONS.only) {
    const needle = String(OPTIONS.only).toLowerCase();
    books = books.filter((b) => (b.title || "").toLowerCase().includes(needle));
  }
  books = books.filter((b) => b.pdf_path);

  if (!books.length) {
    console.log("No books with a pdf_path matched.");
    return;
  }

  fs.mkdirSync(OPTIONS.out, { recursive: true });
  console.log(`Extracting ${books.length} book(s) into ${OPTIONS.out}\n`);

  let failures = 0;
  for (const book of books) {
    const label = (book.title || book.id).slice(0, 32).padEnd(32);
    try {
      const result = await extract(book, pdfjs);
      const words = result.pages.reduce(
        (n, p) => n + p.paragraphs.reduce((m, t) => m + t.split(/\s+/).length, 0),
        0
      );
      const json = JSON.stringify(result, null, 2);
      const name = `${slugify(book.title)}.json`;
      fs.writeFileSync(path.join(OPTIONS.out, name), json);
      if (OPTIONS.upload) await upload(name, json);

      console.log(
        `  ${label} ${String(result.pageCount).padStart(4)} pages  ` +
          `${String(result.chapters.length).padStart(3)} chapters  ` +
          `${(words / 1000).toFixed(0).padStart(4)}k words  → ${name}` +
          (OPTIONS.upload ? "  (uploaded)" : "")
      );
    } catch (err) {
      failures++;
      console.error(`  ${label} FAILED: ${err.message}`);
    }
  }

  console.log(
    `\nDone: ${books.length - failures} extracted` + (failures ? `, ${failures} failed` : "")
  );
  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
