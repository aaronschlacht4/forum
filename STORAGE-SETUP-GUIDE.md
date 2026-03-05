# Storage Setup Guide - Fix RLS Error

If you're getting the error: `StorageApiError: new row violates row-level security policy`, follow these steps:

## Step 1: Create the Avatars Bucket in Supabase UI

1. Go to your Supabase Dashboard
2. Click **Storage** in the left sidebar
3. Click **"New bucket"**
4. Enter bucket name: `avatars`
5. **IMPORTANT**: Toggle **"Public bucket"** to ON
6. Click **"Create bucket"**

## Step 2: Run the Storage Policies SQL

1. Go to **SQL Editor** in your Supabase Dashboard
2. Create a new query
3. Copy and paste the entire contents of `supabase-storage-policies.sql`
4. Click **"Run"** or press `Ctrl+Enter`

This will create the Row Level Security policies that allow:
- ✅ Anyone to view/download avatars
- ✅ Authenticated users to upload avatars
- ✅ Authenticated users to update their avatars
- ✅ Authenticated users to delete avatars

## Step 3: Verify the Setup

Run this query in the SQL Editor to check if everything is set up correctly:

```sql
-- Check if bucket exists and is public
SELECT * FROM storage.buckets WHERE id = 'avatars';

-- Check if policies exist
SELECT * FROM pg_policies
WHERE tablename = 'objects'
AND policyname LIKE '%avatar%';
```

You should see:
- 1 row for the avatars bucket with `public = true`
- 4 rows for the storage policies

## Step 4: Test Avatar Upload

1. Go to `/profile` in your app
2. Click "Upload New Photo"
3. Select an image file
4. The upload should succeed without errors

## Common Issues

### Issue: "Bucket not found"
**Solution**: Make sure you created the bucket in Step 1 with the exact name `avatars`

### Issue: Still getting RLS error after running SQL
**Solution**:
1. Check that the bucket is marked as **public** (go to Storage > avatars > Settings)
2. Re-run the storage policies SQL
3. Clear your browser cache and try again

### Issue: "403 Forbidden" when viewing avatar
**Solution**: The bucket needs to be public. Go to Storage > avatars > Settings > Make sure "Public bucket" is enabled

## What the SQL Does

The `supabase-storage-policies.sql` file creates 4 policies:

1. **Public avatars are viewable by everyone** - Allows anyone to view/download avatar images
2. **Authenticated users can upload avatars** - Only logged-in users can upload files
3. **Authenticated users can update avatars** - Logged-in users can replace existing avatar files
4. **Authenticated users can delete avatars** - Logged-in users can delete avatar files

These policies work on the `storage.objects` table, which is where Supabase stores metadata about all uploaded files.

## File Structure

After successful upload, your avatars will be stored at:
```
storage.buckets.avatars/
  ├── <user-id>-<random>.jpg
  ├── <user-id>-<random>.png
  └── ...
```

The public URL will look like:
```
https://<your-project>.supabase.co/storage/v1/object/public/avatars/<user-id>-<random>.jpg
```

## Need More Help?

If you're still having issues:
1. Check the browser console for detailed error messages
2. Check the Supabase Dashboard > Storage > Logs
3. Verify your Supabase project URL and anon key in your `.env.local` file
