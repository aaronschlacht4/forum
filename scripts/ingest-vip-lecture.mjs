#!/usr/bin/env node
/**
 * VIP commentary from a real lecture: pull the transcript of a talk about
 * one of the library's books, find the moments where the speaker engages a
 * specific passage, and post those moments — the speaker's own words — as
 * public comments anchored to the pages they discuss. Readers follow the
 * book with the real person's commentary in the margin.
 *
 * The rules that make this honest, all enforced here:
 *
 * - The posted text is the speaker's VERBATIM transcript words. Claude is
 *   used to find the moments and to lightly clean transcription artifacts
 *   (punctuation, a garbled proper name) for display — never to write or
 *   embellish. The raw verbatim excerpt is stored alongside in `data` and
 *   the cleaned text is rejected unless nearly all its words match it.
 * - Every comment carries its source: video title, channel and a URL that
 *   opens at the exact timestamp. Excerpts are short quotations with
 *   attribution and a link — commentary quoting, not transcript
 *   republishing. Keep --count modest for the same reason.
 * - Anchoring is validated like every comment in this app: the book quote
 *   must be a verbatim substring of the page it claims, or it's dropped.
 *
 * Mechanics mirror the annotation system exactly (no schema changes): the
 * speaker gets an auth user via the Admin API (display_name flows to
 * profiles through the existing sync trigger), rows are what
 * BookReader.addComment writes, and the VIP/source marking travels in
 * `data` the same way data.anonymous does.
 *
 *   node scripts/ingest-vip-lecture.mjs \
 *     --video "https://www.youtube.com/watch?v=..." \
 *     --speaker "Jordan Peterson" \
 *     --book "crime and punishment" \
 *     --count 8 [--dry-run | --purge]
 *
 * Needs yt-dlp on PATH, and ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

// ---- Env / flags --------------------------------------------------------

function readEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) throw new Error("No .env.local in this directory");
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i === -1 || line.trim().startsWith("#")) continue;
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!env[k]) throw new Error(`${k} missing from .env.local`);
  }
  if (!env.ANTHROPIC_API_KEY) env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
  return env;
}

const env = readEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const AUTH = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
};
const MODEL = "claude-sonnet-5";

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};
const has = (name) => argv.includes(`--${name}`);

// Matches the naming in scripts/extract-books.mjs.
const slugify = (s) => (s || "x").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---- Supabase helpers (same shapes as the rest of scripts/) -------------

async function findBook(query) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/books?select=id,title,author&title=ilike.*${encodeURIComponent(query)}*`,
    { headers: AUTH }
  );
  if (!res.ok) throw new Error(`Book lookup failed: ${res.status}`);
  const rows = await res.json();
  if (rows.length === 0) throw new Error(`No book matches "${query}"`);
  if (rows.length > 1)
    throw new Error(`"${query}" is ambiguous: ${rows.map((r) => r.title).join(" | ")}`);
  return rows[0];
}

async function loadText(title) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/texts/${slugify(title)}.json`, {
    headers: AUTH,
  });
  if (!res.ok)
    throw new Error(`No extracted text for "${title}" — run scripts/extract-books.mjs --upload first`);
  return res.json();
}

/**
 * The speaker's auth user, created on first use. Internal unroutable email,
 * random discarded password — nobody logs in as the speaker; rows are only
 * written by this script through the service role. The display name is what
 * readers see; the source link on every comment is what says "quoted from a
 * lecture, not posted by them".
 */
async function ensureSpeakerUser(speaker) {
  const email = `${slugify(speaker)}@vip-persona.internal`;
  const lookup = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(email)}`,
    { headers: AUTH }
  );
  const existing = lookup.ok ? await lookup.json() : [];
  if (existing.length > 0) return existing[0].id;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: crypto.randomBytes(24).toString("base64url"),
      email_confirm: true,
      user_metadata: { display_name: speaker },
    }),
  });
  if (!res.ok) throw new Error(`Creating speaker user failed: ${res.status} ${await res.text()}`);
  const user = await res.json();
  console.log(`  created speaker user ${speaker} (${user.id})`);
  return user.id;
}

// ---- Transcript ---------------------------------------------------------

/** Video metadata + caption track via yt-dlp. */
function fetchVideo(url) {
  const meta = JSON.parse(
    execFileSync(
      "yt-dlp",
      ["--no-update", "--skip-download", "-j", "--no-warnings", url],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    )
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vip-lecture-"));
  execFileSync(
    "yt-dlp",
    [
      "--no-update", "--no-warnings", "--skip-download",
      "--write-subs", "--write-auto-subs",
      "--sub-langs", "en.*,en", "--sub-format", "vtt",
      "-o", path.join(dir, "cap"),
      url,
    ],
    { stdio: "pipe" }
  );
  const vttFile = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".vtt"))
    .sort((a, b) => a.length - b.length)[0]; // prefer plain "en" over variants
  if (!vttFile) throw new Error("No English captions available on this video");

  const manual = Array.isArray(meta.subtitles?.en) && meta.subtitles.en.length > 0;
  return {
    id: meta.id,
    title: meta.title,
    channel: meta.channel ?? meta.uploader ?? "",
    url: meta.webpage_url ?? url,
    transcriptKind: manual ? "manual" : "auto",
    vtt: fs.readFileSync(path.join(dir, vttFile), "utf8"),
  };
}

/**
 * YouTube's rolling captions repeat each line in the next cue; keep every
 * line once, with the timestamp of the cue that introduced it.
 */
function parseVtt(vtt) {
  const cues = [];
  const blocks = vtt.split(/\n\n+/);
  let last = "";
  for (const block of blocks) {
    const m = block.match(/(\d{2}):(\d{2}):(\d{2})\.\d{3} -->/);
    if (!m) continue;
    const t = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    const text = block
      .split("\n")
      .slice(1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    // Drop the rolled-over repeat of the previous cue's text.
    let fresh = text;
    if (last && text.startsWith(last)) fresh = text.slice(last.length).trim();
    else if (last && last.endsWith(text)) fresh = "";
    if (fresh) cues.push({ t, text: fresh });
    last = text;
  }
  return cues;
}

/** ~120-word chunks, each stamped with the time its first words are spoken. */
function chunkTranscript(cues, wordsPerChunk = 120) {
  const chunks = [];
  let cur = { t: null, words: [] };
  for (const cue of cues) {
    if (cur.t === null) cur.t = cue.t;
    cur.words.push(...cue.text.split(" "));
    if (cur.words.length >= wordsPerChunk) {
      chunks.push({ t: cur.t, text: cur.words.join(" ") });
      cur = { t: null, words: [] };
    }
  }
  if (cur.words.length) chunks.push({ t: cur.t, text: cur.words.join(" ") });
  return chunks;
}

const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// ---- Matching -----------------------------------------------------------

const STOP = new Set(
  "the a an and or but of to in on for with is was are were be been it its this that he she his her they them i you we not as at by from so if then than there here what which who when out up".split(" ")
);

/** Pages ranked by shared meaningful words with the speaker's reference. */
function candidatePages(pages, reference, take = 3) {
  const refWords = new Set(normalize(reference).split(" ").filter((w) => w.length > 3 && !STOP.has(w)));
  if (refWords.size === 0) return [];
  const scored = pages
    .map((p) => {
      const text = normalize(p.paragraphs.join(" "));
      let score = 0;
      for (const w of refWords) if (text.includes(w)) score++;
      return { page: p, score: score / refWords.size };
    })
    .filter((s) => s.score > 0.2)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, take).map((s) => s.page);
}

async function callClaude(client, system, user, maxTokens = 4000) {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const raw = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const start = raw.indexOf("[");
  return JSON.parse(raw.slice(start, raw.lastIndexOf("]") + 1));
}

/** Pass 1: the moments in the lecture where a specific part of the book is engaged. */
async function findMoments(client, book, speaker, chunks, count) {
  const body = chunks.map((c) => `<chunk t="${Math.floor(c.t)}">\n${c.text}\n</chunk>`).join("\n\n");
  const system =
    `You are indexing a lecture by ${speaker} that discusses "${book.title}" by ${book.author}. ` +
    `Find up to ${count} moments where the speaker engages a SPECIFIC element of the book — a scene, ` +
    `a character's act, a quoted or paraphrased line — not general talk about the author or life advice.\n\n` +
    `For each moment return:\n` +
    `- "t": the chunk's t value where the excerpt begins\n` +
    `- "excerpt": the speaker's words, copied VERBATIM from the transcript — an exact contiguous ` +
    `substring of one chunk (or two adjacent ones), 150-450 characters, a complete thought. No ` +
    `ellipses, no cleanup, no stitching distant sentences.\n` +
    `- "bookRef": 5-25 words naming what in the book is being discussed, using the book's own ` +
    `distinctive words where the speaker quotes or names them (this is used to search the book's text).\n\n` +
    `Answer with ONLY a JSON array: [{"t":..., "excerpt":"...", "bookRef":"..."}]`;
  return callClaude(client, system, body);
}

/** Pass 2: pin each moment to a page and a verbatim anchor quote; clean the excerpt for display. */
async function anchorMoments(client, book, moments, pageSets) {
  const body = moments
    .map((m, i) => {
      const pages = pageSets[i]
        .map((p) => `<page number="${p.page}">\n${p.paragraphs.join("\n\n")}\n</page>`)
        .join("\n");
      return `<moment index="${i}">\n<excerpt>${m.excerpt}</excerpt>\n<bookRef>${m.bookRef}</bookRef>\n${pages}\n</moment>`;
    })
    .join("\n\n");
  const system =
    `Each <moment> holds a lecture excerpt about "${book.title}" and candidate pages from the book. ` +
    `For each, pick the page the excerpt is actually about and return:\n` +
    `- "index": the moment's index\n` +
    `- "page": the chosen page number, or null if no candidate page truly matches\n` +
    `- "anchorQuote": copied VERBATIM from that page — an exact contiguous substring, 40-180 ` +
    `characters, the passage closest to what the speaker is discussing\n` +
    `- "displayText": the excerpt, cleaned ONLY of transcription artifacts — punctuation, ` +
    `capitalisation, an obviously garbled proper name (e.g. "Kirkagard" -> "Kierkegaard"). Do not ` +
    `add, remove or reorder words. Do not paraphrase.\n\n` +
    `Answer with ONLY a JSON array.`;
  return callClaude(client, system, body, 6000);
}

// ---- Validation ---------------------------------------------------------

function validate(moments, anchored, transcriptNorm, pagesById) {
  const good = [];
  for (const a of anchored) {
    const m = moments[a.index];
    if (!m || a.page == null || !a.anchorQuote || !a.displayText) continue;

    if (!transcriptNorm.includes(normalize(m.excerpt))) {
      console.log(`  dropped (excerpt not verbatim in transcript): "${m.excerpt.slice(0, 60)}…"`);
      continue;
    }
    const pageText = pagesById.get(a.page);
    if (!pageText || !pageText.includes(a.anchorQuote)) {
      console.log(`  dropped (anchor not verbatim on page ${a.page}): "${String(a.anchorQuote).slice(0, 60)}…"`);
      continue;
    }
    // The display text may fix punctuation and a proper name, nothing more:
    // word-for-word it must still be ≥90% the raw excerpt.
    const rawWords = normalize(m.excerpt).split(" ");
    const dispWords = new Set(normalize(a.displayText).split(" "));
    const kept = rawWords.filter((w) => dispWords.has(w)).length / rawWords.length;
    if (kept < 0.9) {
      console.log(`  dropped (display text drifted from verbatim, ${(kept * 100).toFixed(0)}%)`);
      continue;
    }
    good.push({ t: m.t, excerpt: m.excerpt, page: a.page, anchorQuote: a.anchorQuote, displayText: a.displayText });
  }
  return good;
}

// ---- Posting ------------------------------------------------------------

async function insertComments(userId, bookId, speaker, video, comments) {
  const rows = comments.map((c) => ({
    user_id: userId,
    book_id: bookId,
    page_number: c.page,
    type: "highlight",
    data: {
      selectedText: c.anchorQuote,
      quote: c.anchorQuote,
      color: "#ffd97a",
      vip: true,
      speaker,
      rawExcerpt: c.excerpt,
      source: {
        kind: "youtube",
        videoId: video.id,
        url: `https://www.youtube.com/watch?v=${video.id}&t=${Math.max(0, Math.floor(c.t) - 5)}s`,
        title: video.title,
        channel: video.channel,
        t: Math.floor(c.t),
        transcript: video.transcriptKind,
      },
    },
    comment: c.displayText,
    color: "#ffd97a",
    visibility: "public",
  }));
  const res = await fetch(`${SUPABASE_URL}/rest/v1/annotations`, {
    method: "POST",
    headers: { ...AUTH, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Insert failed: ${res.status} ${await res.text()}`);
}

async function purge(userId, bookId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/annotations?user_id=eq.${userId}&book_id=eq.${bookId}`,
    { method: "DELETE", headers: { ...AUTH, Prefer: "count=exact" } }
  );
  if (!res.ok) throw new Error(`Purge failed: ${res.status}`);
  console.log(`  purged ${res.headers.get("content-range")?.split("/")[1] ?? "?"} comment(s)`);
}

// ---- Main ---------------------------------------------------------------

async function main() {
  const videoUrl = flag("video");
  const speaker = flag("speaker");
  const bookQuery = flag("book");
  if (!speaker || !bookQuery || (!videoUrl && !has("purge"))) {
    console.log(
      "Usage: node scripts/ingest-vip-lecture.mjs --video <youtube url> --speaker <name> " +
        "--book <title match> [--count 8] [--dry-run | --purge]"
    );
    process.exitCode = 1;
    return;
  }
  const count = Number(flag("count") ?? 8);
  const book = await findBook(bookQuery);

  if (has("purge")) {
    const userId = await ensureSpeakerUser(speaker);
    await purge(userId, book.id);
    return;
  }
  if (!env.ANTHROPIC_API_KEY)
    throw new Error("ANTHROPIC_API_KEY is empty — paste your key into .env.local");

  console.log(`Fetching transcript…`);
  const video = fetchVideo(videoUrl);
  const cues = parseVtt(video.vtt);
  const chunks = chunkTranscript(cues);
  const transcriptNorm = normalize(cues.map((c) => c.text).join(" "));
  console.log(
    `  "${video.title}" (${video.channel}) — ${chunks.length} chunks, ${video.transcriptKind} captions`
  );

  const text = await loadText(book.title);
  const pages = (text.pages ?? []).filter((p) => (p.paragraphs ?? []).join(" ").length > 200);
  const pagesById = new Map(pages.map((p) => [p.page, p.paragraphs.join("\n\n")]));

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  console.log(`Finding the moments where ${speaker} engages the text…`);
  const moments = (await findMoments(client, book, speaker, chunks, count + 4)).slice(0, count + 4);
  console.log(`  ${moments.length} candidate moment(s)`);

  const pageSets = moments.map((m) => candidatePages(pages, `${m.bookRef} ${m.excerpt}`));
  const keep = moments.map((_, i) => pageSets[i].length > 0);
  const kept = moments.filter((_, i) => keep[i]);
  const keptSets = pageSets.filter((_, i) => keep[i]);
  if (kept.length === 0) throw new Error("No moment matched any page of the book");

  console.log(`Anchoring ${kept.length} to pages…`);
  const anchored = await anchorMoments(client, book, kept, keptSets);
  const comments = validate(kept, anchored, transcriptNorm, pagesById).slice(0, count);
  console.log(`  ${comments.length} survived validation`);

  for (const c of comments) {
    console.log(`\n  p.${String(c.page).padStart(3)} @${c.t}s  anchor: “${c.anchorQuote.slice(0, 60)}…”`);
    console.log(`      ${c.displayText.slice(0, 160)}${c.displayText.length > 160 ? "…" : ""}`);
  }

  if (has("dry-run")) {
    console.log("\nDry run — nothing written.");
    return;
  }

  const userId = await ensureSpeakerUser(speaker);
  await insertComments(userId, book.id, speaker, video, comments);
  console.log(`\nPosted ${comments.length} comment(s) as ${speaker}, each linking its source.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
