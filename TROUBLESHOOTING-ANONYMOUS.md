# Troubleshooting: All Replies Show as "Anonymous"

## Problem
After running the SQL migration, all replies still show as "Anonymous" even when the checkbox is unchecked.

## Root Cause
The `profiles` table is empty, so the `replies_with_users` view can't join replies with user data.

## Solution

### Quick Fix (Run This Now)

Run this SQL in your Supabase SQL Editor:

```sql
-- Populate profiles table with existing users
INSERT INTO public.profiles (id, email, display_name, avatar_url)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'display_name', email),
  raw_user_meta_data->>'avatar_url'
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name,
  avatar_url = EXCLUDED.avatar_url,
  updated_at = NOW();
```

### Complete Fix (Recommended)

Run the entire `fix-profiles-sync.sql` file to:
1. Populate existing users
2. Set up automatic sync for future users

## How to Verify It Worked

### Step 1: Check Profiles Table
Run this in SQL Editor:
```sql
SELECT id, email, display_name FROM public.profiles;
```
**Expected:** You should see at least your user account

### Step 2: Check View
Run this in SQL Editor:
```sql
SELECT * FROM public.replies_with_users LIMIT 5;
```
**Expected:** You should see `display_name` and `email` filled in, not NULL

### Step 3: Test in App
1. Refresh your app
2. Post a new reply (with anonymous unchecked)
3. Should show your username and avatar

## Why This Happened

The original SQL you ran from the conversation created:
- ✅ The `profiles` table structure
- ✅ The `is_anonymous` column
- ✅ The updated `replies_with_users` view
- ❌ BUT didn't populate the profiles table with existing users
- ❌ AND didn't set up auto-sync trigger

The `fix-profiles-sync.sql` file fixes both issues.

## Diagnostic Queries

If you want to debug further, run `debug-replies.sql` queries one by one to see exactly what's happening.

### Quick Diagnostic
```sql
-- Check if profiles table is empty
SELECT COUNT(*) FROM public.profiles;
-- If this returns 0, that's your problem!

-- Check your user ID
SELECT id, email FROM auth.users WHERE email = 'your@email.com';

-- Check if any replies exist
SELECT COUNT(*) FROM public.replies;

-- Check what the view returns
SELECT user_id, display_name, username FROM public.replies_with_users LIMIT 3;
```

## After Running Fix

1. ✅ Existing users will be in the profiles table
2. ✅ New users will automatically get profiles
3. ✅ Profile updates will sync automatically
4. ✅ Replies will show correct usernames
5. ✅ Anonymous checkbox will work properly

## Summary

**Problem:** Empty profiles table → View can't join → Shows as "Anonymous"

**Solution:** Run `fix-profiles-sync.sql` → Populates profiles → Everything works!
