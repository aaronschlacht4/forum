# SQL Migrations Guide

Run these SQL files **in order** in your Supabase SQL Editor.

## Order of Execution

### 1. [01-add-visibility-column.sql](01-add-visibility-column.sql)
Adds `visibility` column to annotations table (public/private comments).

### 2. [02-add-anonymous-column.sql](02-add-anonymous-column.sql)
Adds `is_anonymous` column to replies table.

### 3. [03-populate-profiles.sql](03-populate-profiles.sql)
Populates profiles table with existing auth.users data.

### 4. [04-create-annotations-view.sql](04-create-annotations-view.sql)
Creates/updates `annotations_with_users` view (joins annotations with user profiles).

### 5. [05-create-replies-view.sql](05-create-replies-view.sql)
Creates/updates `replies_with_users` view (joins replies with user profiles, handles anonymous).

### 6. [06-setup-profile-sync.sql](06-setup-profile-sync.sql)
Sets up automatic sync between auth.users and profiles table via trigger.

### 7. [07-add-nested-replies.sql](07-add-nested-replies.sql)
Adds support for nested replies (reply-to-reply functionality).

## Quick Setup

If this is your first time setting up, run all files in order:

```bash
# In Supabase SQL Editor, copy and run each file one by one:
# 01 → 02 → 03 → 04 → 05 → 06 → 07
```

## After Running Migrations

1. **Hard refresh your browser**: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. **Test features**:
   - Comments should show your username
   - Anonymous checkbox should work correctly
   - Public/Private visibility should work
   - Nested replies should work (after UI updates)

## Troubleshooting

If something doesn't work:

1. Check if all migrations ran successfully
2. Verify in SQL Editor:
   ```sql
   -- Check profiles populated
   SELECT * FROM public.profiles;

   -- Check views work
   SELECT id, display_name FROM public.annotations_with_users LIMIT 3;
   SELECT id, is_anonymous, display_name FROM public.replies_with_users LIMIT 3;
   ```
3. Hard refresh your browser
4. Check browser console for errors

## Notes

- Each file is idempotent (safe to run multiple times)
- Files 4, 5, and 7 use `DROP VIEW IF EXISTS` so they can be re-run
- File 1, 2, 7 use `ADD COLUMN IF NOT EXISTS` so they're safe to re-run
