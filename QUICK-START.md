# Quick Start - Visibility & Anonymous Features

## 🚀 Setup in 2 Minutes

### Step 1: Run SQL (1 minute) - REQUIRED FOR ANONYMOUS REPLIES
1. Open [Supabase Dashboard](https://app.supabase.com)
2. Go to **SQL Editor**
3. Copy contents of `supabase-add-anonymous-field.sql`
4. Paste and click **Run**
5. ✅ Done!

**⚠️ Note:** The app will work without this migration, but:
- ✅ Public/Private comments will work
- ❌ Anonymous replies will NOT work (you'll see a warning in console)
- Run the SQL to enable anonymous replies!

### Step 2: Test It (1 minute)
1. Open a book in your app
2. Create a comment → See **Public/Private** options ✅ (works without migration)
3. Reply to a comment → See **Post anonymously** checkbox (needs migration)
4. ✅ Working!

---

## 📸 What You'll See

### Comment Modal (New)
```
┌─────────────────────────────────────┐
│  Add Comment                        │
├─────────────────────────────────────┤
│  Selected text:                     │
│  "Your selected text here"          │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Write your comment...       │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
│  ○ Public    ○ Private              │  ← NEW!
│                                     │
│         [Cancel]  [Save Comment]    │
└─────────────────────────────────────┘
```

### Reply Input (New)
```
┌─────────────────────────────────────┐
│  [Type your reply...     ] [Send]   │
│  ☑ Post anonymously                 │  ← NEW!
└─────────────────────────────────────┘
```

### Anonymous Reply (New)
```
┌─────────────────────────────────────┐
│  [?] Anonymous                      │  ← Gray avatar + "Anonymous"
│  This is an anonymous reply         │
└─────────────────────────────────────┘
```

### Named Reply (Default)
```
┌─────────────────────────────────────┐
│  [👤] John Doe                      │  ← Profile photo + name
│  This is a named reply              │
└─────────────────────────────────────┘
```

---

## ✨ Features Overview

| Feature | Options | Default | Where |
|---------|---------|---------|-------|
| **Comment Visibility** | Public / Private | Public | Comment modal |
| **Reply Anonymity** | Named / Anonymous | Named | Reply input |

### Comment Visibility
- **Public** → Everyone can see it
- **Private** → Only you can see it

### Reply Anonymity
- **Named** → Shows your profile photo and name
- **Anonymous** → Shows gray "?" and "Anonymous"

---

## 🔧 Troubleshooting

### "Column is_anonymous does not exist"
→ Run the SQL migration file

### "Radio buttons not showing"
→ Clear browser cache and refresh

### "Anonymous replies showing my name"
→ Check that SQL migration ran successfully

---

## 📝 Usage Tips

1. **Default is public** - Comments are public by default, so everyone can see them
2. **Can't change after posting** - Choose visibility before saving (can't edit later)
3. **Authors can always delete** - Even anonymous replies can be deleted by their author
4. **Anonymous ≠ Private** - Database admins can still see who posted anonymous replies

---

## 🎯 What Changed?

### Files Modified
- ✅ `lib/replies.ts` - Added anonymous support
- ✅ `lib/annotations.ts` - Changed default to public
- ✅ `components/PDFViewer.tsx` - Added UI controls

### Files Created
- 📄 `supabase-add-anonymous-field.sql` - Database migration
- 📘 `VISIBILITY-SETUP-GUIDE.md` - Detailed guide
- 📊 `CHANGES-SUMMARY.md` - Technical changes
- 🚀 `QUICK-START.md` - This file!

---

## ✅ Done!

You're all set. Comments now support public/private visibility and replies support anonymous posting.

**Questions?** Check `VISIBILITY-SETUP-GUIDE.md` for detailed troubleshooting.
