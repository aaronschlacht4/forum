# Visibility & Anonymous Features - Changes Summary

## Overview
Added public/private visibility for comments and anonymous posting for replies.

## Files Modified

### 1. `/lib/replies.ts`
**Changes:**
- Added `isAnonymous?: boolean` to `Reply` interface
- Added `is_anonymous?: boolean` to `DBReply` interface
- Updated `dbToApp()` function to include `isAnonymous` field
- Updated `saveReply()` to accept `isAnonymous` parameter (default: false)

**Lines changed:** ~15 lines

### 2. `/lib/annotations.ts`
**Changes:**
- Changed default visibility from 'private' to 'public' in `saveAnnotation()` (line 106)
- Updated Omit type to exclude 'avatarUrl' field (line 84)

**Lines changed:** ~2 lines

### 3. `/components/PDFViewer.tsx`
**Major changes:**

#### State additions (lines 77-84):
```typescript
const [commentVisibility, setCommentVisibility] = useState<'public' | 'private'>('public');
const [replyAnonymous, setReplyAnonymous] = useState(false);
```

#### Comment saving (line 478):
- Now includes `visibility: commentVisibility` when saving annotations
- Resets `commentVisibility` to 'public' after saving

#### Reply submission (line 510):
- Now passes `replyAnonymous` parameter to `saveReply()`
- Resets `replyAnonymous` to false after submission

#### Reply input UI (lines 776-823):
- Added checkbox for "Post anonymously"
- Moved input into wrapper div to accommodate checkbox
- Prevented Shift+Enter from submitting (allows multi-line)

#### Reply display UI (lines 843-881):
- Shows gray "?" avatar for anonymous replies
- Shows "Anonymous" as display name for anonymous replies
- Conditional rendering based on `reply.isAnonymous` flag

#### Comment modal UI (lines 1286-1313):
- Added Public/Private radio buttons
- Styled to match frosted glass aesthetic
- Default selection: Public

**Lines changed:** ~100 lines

## New Files Created

### 1. `/supabase-add-anonymous-field.sql`
SQL migration to add `is_anonymous` column to replies table and update the `replies_with_users` view.

### 2. `/VISIBILITY-SETUP-GUIDE.md`
Complete setup guide for the new features with troubleshooting.

### 3. `/CHANGES-SUMMARY.md`
This file - summary of all changes made.

## Database Changes

### Replies Table
```sql
ALTER TABLE public.replies
ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT false;
```

### Updated View: `replies_with_users`
Now conditionally returns user data based on `is_anonymous` flag:
- If anonymous: username=NULL, display_name="Anonymous", avatar_url=NULL
- If not anonymous: Returns actual user data from profiles table

## UI Changes

### Before → After

#### Comment Modal
**Before:** Just textarea and save/cancel buttons
**After:** Textarea + Public/Private radio buttons + save/cancel buttons

#### Reply Input
**Before:** Single line input + send button
**After:** Input + send button + "Post anonymously" checkbox

#### Reply Display
**Before:** Always showed user profile and name
**After:** Shows "Anonymous" with gray "?" avatar if flagged as anonymous

## Feature Behavior

### Comment Visibility
- **Default:** Public (visible to all users)
- **Options:** Public | Private
- **Storage:** Saved in `annotations.visibility` column
- **UI:** Radio buttons in comment modal

### Reply Anonymity
- **Default:** Named (shows profile)
- **Options:** Named | Anonymous
- **Storage:** Saved in `replies.is_anonymous` column
- **UI:** Checkbox below reply input

## Testing Recommendations

1. **Test public comments:** Create a comment as one user, verify another user can see it
2. **Test private comments:** Create a private comment, verify other users cannot see it
3. **Test named replies:** Post a reply without checking anonymous, verify profile shows
4. **Test anonymous replies:** Post a reply with anonymous checked, verify shows "Anonymous"
5. **Test deletion:** Verify authors can delete their own anonymous replies
6. **Test persistence:** Refresh the page and verify visibility settings persist

## Breaking Changes
None - all changes are additive and backward compatible.

## Migration Required
Yes - must run `supabase-add-anonymous-field.sql` in Supabase SQL Editor.

## Dependencies
No new npm packages required. Uses existing Supabase client and React hooks.
