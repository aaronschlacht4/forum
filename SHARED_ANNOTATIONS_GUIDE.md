# Shared Annotations Setup Guide

This guide explains how to enable users to see each other's public comments and annotations.

## Overview

The system now supports:
- **Private annotations** (default) - only you can see them
- **Public annotations** - everyone can see them
- **User profiles** - display usernames with public annotations
- **Read-only public annotations** - users can only edit/delete their own

## Step 1: Run the Database Migration

Go to your Supabase Dashboard and run the SQL in `supabase-shared-annotations.sql`:

1. Navigate to https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor** → **New query**
4. Copy and paste the contents of `supabase-shared-annotations.sql`
5. Click **Run**

This will:
- Add `visibility` column to annotations (private/public)
- Create `profiles` table for usernames
- Update Row-Level Security policies to allow viewing public annotations
- Create a trigger to auto-create profiles on signup
- Create a view that joins annotations with user info

## Step 2: Update PDFViewer Component

You need to add UI for users to toggle annotation visibility. Here's what to add:

### Option A: Make All Annotations Public by Default

Update all `saveAnnotation` calls in PDFViewer to include `visibility: 'public'`:

```typescript
saveAnnotation(bookId, {
  pageNumber,
  type: "highlight",
  data: { rects, selectedText: text, color: highlightColor },
  color: highlightColor,
  visibility: 'public', // Add this line
})
```

### Option B: Add a Toggle for Each Annotation Type

Add a state for visibility preference:

```typescript
const [annotationVisibility, setAnnotationVisibility] = useState<'private' | 'public'>('private');
```

Add a toggle button in the toolbar (next to the tools):

```typescript
<button
  onClick={() => setAnnotationVisibility(v => v === 'private' ? 'public' : 'private')}
  className={iconBtn(false)}
  title={annotationVisibility === 'private' ? 'Annotations are private' : 'Annotations are public'}
>
  {annotationVisibility === 'private' ? '🔒' : '🌍'}
</button>
```

Then use `annotationVisibility` when saving annotations:

```typescript
saveAnnotation(bookId, {
  ...
  visibility: annotationVisibility,
})
```

## Step 3: Display User Info on Public Annotations

Update the comment display in PDFViewer to show the author:

```typescript
<div className="flex items-start gap-3 mb-2">
  {annotation.userId !== user?.id && annotation.displayName && (
    <span className="text-xs text-gray-500">
      by {annotation.displayName}
    </span>
  )}
  ...
</div>
```

For highlights, you can show username on hover by updating the title:

```typescript
title={
  data?.selectedText
    ? `"${data.selectedText}"${a.username ? ` - by ${a.username}` : ''}`
    : "Highlight"
}
```

## Step 4: Prevent Users from Deleting Other People's Annotations

Update delete handlers to check ownership:

```typescript
onClick={() => {
  if (user && annotation.userId === user.id) {
    deleteAnnotation(annotation.id).then((success) => {
      if (success) {
        setAnnotations((prev) => prev.filter((a) => a.id !== annotation.id));
      }
    });
  } else if (annotation.userId !== user?.id) {
    alert("You can only delete your own annotations");
  }
}}
```

## Features

### Current User's Annotations
- Edit and delete their own annotations
- Toggle between private and public visibility
- Private annotations only visible to them

### Other Users' Public Annotations
- View highlights, drawings, and comments from others
- See username/display name of the author
- Cannot edit or delete (read-only)

### Visual Distinction
You can add styling to differentiate between your annotations and others':

```typescript
// In the sidebar, add a background color for other users' comments
className={`bg-gray-50 rounded-lg p-3 border ${
  annotation.userId === user?.id
    ? 'border-purple-300'
    : 'border-blue-300 bg-blue-50'
}`}
```

## Example: Full Visibility Toggle Implementation

```typescript
// In PDFViewer component
const [annotationVisibility, setAnnotationVisibility] = useState<'private' | 'public'>('private');

// In toolbar (add this button group)
<div className="flex items-center gap-2">
  <span className="text-xs text-white/70">Visibility:</span>
  <button
    onClick={() => setAnnotationVisibility('private')}
    className={`px-3 py-1 rounded text-xs transition ${
      annotationVisibility === 'private'
        ? 'bg-white/20 text-white'
        : 'bg-white/5 text-white/50 hover:bg-white/10'
    }`}
  >
    🔒 Private
  </button>
  <button
    onClick={() => setAnnotationVisibility('public')}
    className={`px-3 py-1 rounded text-xs transition ${
      annotationVisibility === 'public'
        ? 'bg-white/20 text-white'
        : 'bg-white/5 text-white/50 hover:bg-white/10'
    }`}
  >
    🌍 Public
  </button>
</div>

// When saving, include visibility
saveAnnotation(bookId, {
  ...annotationData,
  visibility: annotationVisibility,
})
```

## Privacy Considerations

- **Default to private**: Safer for users
- **Clear indication**: Show lock/globe icons for visibility state
- **Confirmation for public**: Consider asking "Make this annotation public?" before sharing
- **Profile settings**: Let users set default visibility in their profile
- **Username**: Users can edit their display name in a profile page

## Testing

1. Create two accounts (different browsers or incognito)
2. User A creates a public annotation
3. User B opens the same book
4. User B should see User A's public annotation
5. User B cannot delete User A's annotation
6. User A's private annotations are not visible to User B

## Advanced Features (Optional)

### Filter Annotations
Add buttons to filter view:
```typescript
const [showFilter, setShowFilter] = useState<'all' | 'mine' | 'others'>('all');

const filteredAnnotations = annotations.filter(a => {
  if (showFilter === 'mine') return a.userId === user?.id;
  if (showFilter === 'others') return a.userId !== user?.id;
  return true;
});
```

### Annotation Reactions
Add likes/reactions to public annotations:
```sql
CREATE TABLE annotation_reactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  annotation_id UUID REFERENCES annotations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(annotation_id, user_id)
);
```

### Follow Users
Create a following system to see annotations from specific users.

## Troubleshooting

### Can't see other people's annotations
- Check that the SQL migration ran successfully
- Verify the annotation has `visibility = 'public'`
- Check browser console for errors
- Verify the view `annotations_with_users` exists

### Username not showing
- Check that profiles table was created
- Verify trigger `on_auth_user_created` exists
- For existing users, manually insert into profiles table

### Can edit other people's annotations
- Check that RLS policies are correct
- Verify your delete/update handlers check `userId === user?.id`

---

With this setup, your PDF viewer becomes a collaborative annotation tool where users can share insights and comments with each other! 🎉
