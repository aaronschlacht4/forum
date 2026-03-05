# Component Structure

## Before Refactoring
```
PDFViewer.tsx (1,380+ lines)
├─ All toolbar logic and UI
├─ All color picker logic and UI
├─ All comment modal logic and UI
├─ All sidebar logic and UI
├─ All reply logic and UI
└─ PDF rendering logic
```

## After Refactoring
```
PDFViewer.tsx (771 lines)
├─ PDF rendering logic
├─ Annotation drawing logic
├─ State management
└─ Coordinates child components

Components/
├─ Toolbar.tsx
│  ├─ Home button
│  ├─ Sidebar toggle
│  ├─ Page navigation
│  ├─ Tool selection (select, highlight, pen, comment)
│  └─ Clear annotations
│
├─ ColorPicker.tsx
│  ├─ Color selection UI
│  └─ Shows when highlight tool is active
│
├─ CommentModal.tsx
│  ├─ Shows selected text
│  ├─ Comment input
│  ├─ Public/Private radio buttons
│  └─ Save/Cancel actions
│
├─ AnnotationsSidebar.tsx
│  ├─ Sidebar header
│  ├─ List of annotations
│  ├─ Annotation cards with user info
│  ├─ Reply input for annotations
│  └─ Uses ReplyItem for replies
│
└─ ReplyItem.tsx
   ├─ Reply user info (avatar, name)
   ├─ Reply content
   ├─ Reply/Delete actions
   ├─ Reply input (when replying)
   └─ Nested replies (recursive)
      └─ ReplyItem (for nested replies)
```

## Data Flow

### Comment Creation
```
User selects text → Toolbar (Add Comment button)
                  ↓
            PDFViewer (handleAddComment)
                  ↓
            CommentModal (user fills form)
                  ↓
            PDFViewer (saveComment)
                  ↓
            Database (saveAnnotation)
                  ↓
            AnnotationsSidebar (displays new comment)
```

### Reply Creation (Top-Level)
```
User views annotation → AnnotationsSidebar (Reply button)
                      ↓
                PDFViewer (onReplyClick)
                      ↓
            AnnotationsSidebar (shows reply input)
                      ↓
                User types and sends
                      ↓
                PDFViewer (handleSubmitReply)
                      ↓
            Database (saveReply with parentReplyId=undefined)
                      ↓
            AnnotationsSidebar → ReplyItem (displays new reply)
```

### Reply Creation (Nested)
```
User views reply → ReplyItem (Reply button)
                 ↓
           PDFViewer (onReplyClick with parentReplyId)
                 ↓
           ReplyItem (shows reply input)
                 ↓
           User types and sends
                 ↓
           PDFViewer (handleSubmitReply)
                 ↓
           Database (saveReply with parentReplyId=parentId)
                 ↓
           ReplyItem (displays nested reply indented)
```

## Component Props Summary

### Toolbar
**In**: currentTool, pageNumber, numPages, showSidebar, hasSelectedText
**Out**: onToolChange, onToggleSidebar, onChangePage, onAddComment, onClearAnnotations, onHomeClick

### ColorPicker
**In**: currentColor
**Out**: onColorChange

### CommentModal
**In**: show, selectedText, commentText, visibility
**Out**: onCommentTextChange, onVisibilityChange, onSave, onClose

### AnnotationsSidebar
**In**: show, pageNumber, annotations, replies, expandedComments, showReplyInput, replyText, replyAnonymous, currentUserId
**Out**: onClose, onToggleExpanded, onReplyClick, onDeleteAnnotation, onDeleteReply, onReplyTextChange, onReplyAnonymousChange, onSubmitReply

### ReplyItem
**In**: reply, currentUserId, annotationId, showReplyInput, replyText, replyAnonymous, nestedReplies
**Out**: onReplyClick, onDelete, onReplyTextChange, onReplyAnonymousChange, onSubmitReply

## Benefits of This Structure

### 1. **Single Responsibility**
Each component has one clear purpose:
- Toolbar = navigation and tools
- ColorPicker = color selection
- CommentModal = comment creation
- AnnotationsSidebar = display annotations
- ReplyItem = display individual reply

### 2. **Reusability**
Components can be reused:
- ReplyItem is recursive (renders itself for nested replies)
- Toolbar could be used in other viewer contexts
- CommentModal could be adapted for other text selection needs

### 3. **Testability**
Easy to test in isolation:
- Mock props and test each component separately
- Test nested reply rendering independently
- Test toolbar button clicks without full PDFViewer

### 4. **Maintainability**
Easier to modify:
- Want to change toolbar layout? Edit Toolbar.tsx only
- Want to add more colors? Edit ColorPicker.tsx only
- Want to change reply styling? Edit ReplyItem.tsx only

### 5. **Type Safety**
Clear interfaces:
- Each component has defined prop types
- TypeScript ensures correct prop passing
- Easier to catch errors at compile time

## File Sizes

| Component | Lines | Primary Responsibility |
|-----------|-------|------------------------|
| PDFViewer.tsx | 771 | Main logic, PDF rendering, state management |
| Toolbar.tsx | 190 | Navigation and tool selection UI |
| ColorPicker.tsx | 65 | Color selection UI |
| CommentModal.tsx | 155 | Comment creation form |
| AnnotationsSidebar.tsx | 370 | Annotation list and organization |
| ReplyItem.tsx | 290 | Individual reply with nesting |

**Total**: 1,841 lines (vs 1,380+ lines in monolithic file)

The slight increase in total lines is offset by:
- Better organization
- Reusable components
- Easier maintenance
- Better testability
- Clearer separation of concerns
