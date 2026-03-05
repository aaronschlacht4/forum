# Visibility & Anonymous Features Setup Guide

This guide will help you add Public/Private comments and Anonymous replies to your annotation system.

## What's New

### For Comments (Annotations)
- **Public** - Visible to all users viewing the book
- **Private** - Only visible to you

### For Replies
- **Anonymous** - Reply without showing your profile photo or username
- **Named** - Reply with your profile (default)

## Setup Steps

### Step 1: Run the SQL Migration

1. Go to your **Supabase Dashboard**
2. Click **SQL Editor** in the left sidebar
3. Create a new query
4. Copy and paste the contents of `supabase-add-anonymous-field.sql`
5. Click **Run** or press `Ctrl+Enter`

This will:
- Add `is_anonymous` column to the `replies` table
- Update the `replies_with_users` view to hide user info for anonymous replies
- Show "Anonymous" as the display name for anonymous replies

### Step 2: Test the Features

#### Testing Public/Private Comments
1. Open a book in your app
2. Select some text
3. Click the "Add Comment" button
4. In the modal, you'll see **Public** and **Private** radio buttons
5. Choose your visibility preference
6. Save the comment
7. Default is **Public** (visible to everyone)

#### Testing Anonymous Replies
1. Find a comment with replies enabled
2. Click "Reply"
3. Type your reply
4. Check the "Post anonymously" checkbox
5. Click "Send"
6. Your reply will show as "Anonymous" with a gray avatar containing "?"

## How It Works

### Database Schema

**Replies Table**
```sql
- is_anonymous (boolean, default: false)
```

When `is_anonymous = true`:
- Display name shows as "Anonymous"
- Avatar shows as gray circle with "?"
- Username is hidden
- Avatar URL is not displayed

**Annotations Table**
```sql
- visibility ('public' | 'private')
```

When `visibility = 'private'`:
- Only the comment author can see it
- Other users won't see it in the annotations list

### Views

The `replies_with_users` view uses `CASE` statements to conditionally return:
- `NULL` for username/avatar_url if anonymous
- `"Anonymous"` for display_name if anonymous
- Actual user data if not anonymous

## UI Components

### Comment Modal
Located in PDFViewer component around line 1240:
- Radio buttons for Public/Private selection
- Default: Public
- State: `commentVisibility`

### Reply Input
Located in PDFViewer component around line 810:
- Checkbox for "Post anonymously"
- Default: Unchecked (named reply)
- State: `replyAnonymous`

### Reply Display
Located in PDFViewer component around line 843:
- Shows gray "?" avatar for anonymous replies
- Shows "Anonymous" as the username
- Author can still delete their own anonymous replies

## Privacy Features

### What Anonymous Hides
- ✅ Display name → Shows "Anonymous"
- ✅ Username → Hidden (NULL)
- ✅ Avatar URL → Hidden (NULL)
- ❌ User ID → Still stored (for deletion rights)

### What Private Comments Do
- ✅ Only visible to the comment author
- ✅ Not shown to other users
- ✅ Still stored in database
- ❌ Not encrypted (visible to database admins)

## Important Notes

1. **Author can always delete**: Even anonymous replies can be deleted by their author (user_id is still stored)
2. **Database admins can see**: The `user_id` is always stored, so database admins can identify anonymous posters if needed
3. **Default visibility**: Comments default to **Public**, replies default to **Named** (not anonymous)
4. **Migration is additive**: The SQL migration only adds columns, it won't delete or modify existing data

## Troubleshooting

### Issue: "Column is_anonymous does not exist"
**Solution**: Run the `supabase-add-anonymous-field.sql` migration

### Issue: Anonymous replies still showing user info
**Solution**:
1. Check that the migration was run successfully
2. Verify the `replies_with_users` view was updated
3. Clear your browser cache and refresh

### Issue: Can't see Public/Private options in comment modal
**Solution**: Make sure you're using the latest version of the PDFViewer component

### Issue: Checkbox not working for anonymous replies
**Solution**: Check browser console for errors, ensure state is being updated correctly

## Testing Checklist

- [ ] SQL migration runs without errors
- [ ] Can create public comments
- [ ] Can create private comments
- [ ] Private comments only visible to author
- [ ] Can post named replies (with profile)
- [ ] Can post anonymous replies (shows "Anonymous")
- [ ] Anonymous replies show gray "?" avatar
- [ ] Can delete own anonymous replies
- [ ] Cannot delete other users' replies
