# Database Setup Order

Run these SQL files in your Supabase SQL Editor in this exact order:

## 1. Main Database Schema
**File**: The SQL you already ran (with replies, profiles, views)
**What it does**:
- ✅ Creates `replies` table for comment threads
- ✅ Creates `profiles` table for user data (safer than auth.users)
- ✅ Sets up RLS policies for replies and profiles
- ✅ Creates views: `replies_with_users` and `annotations_with_users`
- ✅ Creates trigger to sync profiles with auth.users

**Status**: ✅ Already completed

## 2. Storage Bucket Policies
**File**: `supabase-storage-policies.sql`
**What it does**:
- ✅ Creates RLS policies for the avatars storage bucket
- ✅ Allows authenticated users to upload/update/delete avatars
- ✅ Allows everyone to view avatars (public read)

**When to run**: After creating the `avatars` bucket in the Supabase UI (Storage section)

**Status**: ⚠️ NEEDS TO BE RUN - This will fix your RLS error

---

## Quick Setup Checklist

- [x] Run main database SQL (replies + profiles + views)
- [ ] Create `avatars` bucket in Supabase UI (make it public)
- [ ] Run `supabase-storage-policies.sql`
- [ ] Test avatar upload on `/profile` page
- [ ] Test comments and replies on a book page

---

## What Each Component Does

### Replies Table
Stores threaded replies to annotations (comments). Each reply is linked to an annotation and a user.

### Profiles Table
Stores user profile data (display_name, avatar_url) in a client-accessible table. This is safer and more flexible than storing everything in `auth.users.raw_user_meta_data`.

### Views (replies_with_users & annotations_with_users)
Automatically joins user profile data (name, avatar) with replies and annotations, so you don't need to do manual joins in your frontend code.

### Storage Policies
Controls who can upload, view, update, and delete files in the `avatars` bucket. Without these policies, all storage operations will fail with RLS errors.

---

## Troubleshooting

**If you see**: `StorageApiError: new row violates row-level security policy`
**Solution**: Run `supabase-storage-policies.sql` after creating the avatars bucket

**If profile updates fail**:
- Check that the `profiles` table exists
- Check that RLS policies allow updates
- Check browser console for specific error messages

**If avatar images don't load**:
- Make sure the `avatars` bucket is marked as **public** in Supabase UI
- Check that the storage policies include the "viewable by everyone" policy
