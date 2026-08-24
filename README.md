# Forum

A social reading library. Books live on a 3D shelf; opening one drops you into a
PDF reader where you can highlight passages, leave comments and replies, and ask
an AI panel about what you're reading.

## Features

- **3D library shelf** — books rendered with three.js / react-three-fiber
  ([components/ShelfScene.tsx](components/ShelfScene.tsx)). Each book is a cloned
  glTF model dressed in its own cover art; covers are a single JPG per book laid
  out back-spine-front (see [lib/bookModel.ts](lib/bookModel.ts) for the exact
  layout and how to swap in new artwork or models).
- **PDF reader** with text selection, highlights, and shared annotations
  ([components/BookReader.tsx](components/BookReader.tsx), react-pdf).
- **Discussions** — comment threads with nested replies and voting, anchored to
  passages ([lib/replies.ts](lib/replies.ts), [lib/annotations.ts](lib/annotations.ts)).
- **AI chat** about the current book, backed by the Claude API
  ([app/api/ai-chat/route.ts](app/api/ai-chat/route.ts)).
- **Auth, storage, and data** on Supabase — user accounts, the `covers` storage
  bucket, and the annotation/reply tables (SQL setup scripts in the repo root
  and [sql-migrations/](sql-migrations/)).

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Main routes:

| Route | What it is |
|---|---|
| `/` | Landing page with featured books |
| `/library` | The 3D shelf |
| `/book/[id]` | Reader for one book |
| `/request-book` | Ask for a book to be added |
| `/profile` | Your account |

### Environment

Create `.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=...        # your Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=...   # its anon (public) key
SUPABASE_SERVICE_ROLE_KEY=...       # server-side only, used by admin routes
ANTHROPIC_API_KEY=...               # for the AI chat panel
```

Supabase also needs the tables and storage policies from the SQL scripts in the
repo root (start with `supabase-complete-setup.sql`) and a public `covers`
bucket holding one JPG per book, named `<book id>.jpg` unless the book row sets
`cover_path`.

## Adding a book

1. Insert the book row (id, title, author, PDF URL) in Supabase.
2. Upload its cover to the `covers` bucket as one full-bleed image of the jacket
   unwrapped — back cover, spine, front cover, roughly 1.70 : 1 (e.g.
   2040 × 1200). A bare front-cover crop won't work: its middle would land on
   the spine.

No code change is needed; the shelf picks the book up from the API.

## Stack

Next.js 16 (App Router) · React 19 · three.js + @react-three/fiber/drei ·
Tailwind CSS 4 · Supabase · react-pdf · Anthropic SDK
