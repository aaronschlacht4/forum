# Fix Nested Replies UI

The backend is ready for nested replies. Now you just need to update the UI in PDFViewer.tsx.

## Step 1: Update Reply Rendering (Lines 913-936)

Find this section around line 913:

```tsx
<p className="text-sm" style={{ color: "#ffffff", fontFamily: "'Crimson Text', serif" }}>
  {reply.content}
</p>
{reply.userId === user?.id && (
  <button
    onClick={() => {
      deleteReply(reply.id).then((success) => {
        if (success) {
          setReplies((prev) => ({
            ...prev,
            [annotation.id]: prev[annotation.id].filter((r) => r.id !== reply.id)
          }));
        }
      });
    }}
    className="mt-2 text-xs transition-all hover:scale-105"
    style={{
      color: "#ff6b6b",
      fontFamily: "'Crimson Text', serif"
    }}
  >
    Delete
  </button>
)}
```

**Replace with this:**

```tsx
<p className="text-sm mb-2" style={{ color: "#ffffff", fontFamily: "'Crimson Text', serif" }}>
  {reply.content}
</p>
<div className="flex gap-3">
  <button
    onClick={() => {
      if (showReplyInput === reply.id) {
        setShowReplyInput(null);
        setReplyingTo(null);
      } else {
        setShowReplyInput(reply.id);
        setReplyingTo({ type: 'reply', id: reply.id, parentReplyId: reply.id });
      }
    }}
    className="text-xs transition-all hover:scale-105"
    style={{
      color: "rgba(255, 255, 255, 0.7)",
      fontFamily: "'Crimson Text', serif",
      fontWeight: "500"
    }}
  >
    Reply
  </button>
  {reply.userId === user?.id && (
    <button
      onClick={() => {
        deleteReply(reply.id).then((success) => {
          if (success) {
            setReplies((prev) => ({
              ...prev,
              [annotation.id]: prev[annotation.id].filter((r) => r.id !== reply.id)
            }));
          }
        });
      }}
      className="text-xs transition-all hover:scale-105"
      style={{
        color: "#ff6b6b",
        fontFamily: "'Crimson Text', serif"
      }}
    >
      Delete
    </button>
  )}
</div>
```

## Step 2: Add Reply Input for Each Reply (After Line 936)

Right after the delete button div closes (after line 936), add this:

```tsx
{/* Reply to Reply Input */}
{showReplyInput === reply.id && (
  <div className="mt-3">
    <div className="flex gap-2 mb-2">
      <input
        type="text"
        value={replyText}
        onChange={(e) => setReplyText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmitReply(annotation.id)}
        placeholder={`Replying to ${reply.isAnonymous ? 'Anonymous' : reply.displayName}...`}
        className="flex-1 px-3 py-2 text-sm"
        style={{
          background: "rgba(255, 255, 255, 0.1)",
          border: "1px solid rgba(255, 255, 255, 0.3)",
          borderRadius: "8px",
          color: "#ffffff",
          fontFamily: "'Crimson Text', serif",
          outline: "none"
        }}
      />
      <button
        onClick={() => handleSubmitReply(annotation.id)}
        className="px-4 py-2 text-sm transition-all hover:scale-105"
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "white",
          borderRadius: "8px",
          border: "none",
          fontFamily: "'Crimson Text', serif",
          fontWeight: "500"
        }}
      >
        Send
      </button>
    </div>
    <label className="flex items-center gap-2 text-xs" style={{ color: "rgba(255, 255, 255, 0.8)", fontFamily: "'Crimson Text', serif" }}>
      <input
        type="checkbox"
        checked={replyAnonymous}
        onChange={(e) => setReplyAnonymous(e.target.checked)}
        style={{ accentColor: "#667eea", cursor: "pointer" }}
      />
      Post anonymously
    </label>
  </div>
)}

{/* Nested Replies */}
{(() => {
  const nestedReplies = annotationReplies.filter(r => r.parentReplyId === reply.id);
  if (nestedReplies.length === 0) return null;
  return (
    <div className="mt-3 pl-4 border-l-2" style={{ borderColor: "rgba(255, 255, 255, 0.15)" }}>
      {nestedReplies.map(nestedReply => (
        <div key={nestedReply.id} className="mb-2 p-2" style={{
          background: "rgba(255, 255, 255, 0.05)",
          borderRadius: "8px"
        }}>
          <div className="flex items-center gap-2 mb-1">
            <div
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                overflow: "hidden",
                border: "1px solid rgba(255, 255, 255, 0.3)"
              }}
            >
              {nestedReply.isAnonymous ? (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "linear-gradient(135deg, #9e9e9e 0%, #757575 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: "8px",
                    fontWeight: "600"
                  }}
                >
                  ?
                </div>
              ) : nestedReply.avatarUrl ? (
                <img src={nestedReply.avatarUrl} alt={nestedReply.displayName || nestedReply.username} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: "8px",
                    fontWeight: "600"
                  }}
                >
                  {(nestedReply.displayName || nestedReply.username || "U")[0].toUpperCase()}
                </div>
              )}
            </div>
            <p className="text-xs font-semibold" style={{ color: "rgba(255, 255, 255, 0.9)", fontFamily: "'Crimson Text', serif" }}>
              {nestedReply.isAnonymous ? "Anonymous" : (nestedReply.displayName || nestedReply.username || "Anonymous")}
            </p>
          </div>
          <p className="text-sm" style={{ color: "#ffffff", fontFamily: "'Crimson Text', serif" }}>
            {nestedReply.content}
          </p>
          {nestedReply.userId === user?.id && (
            <button
              onClick={() => {
                deleteReply(nestedReply.id).then((success) => {
                  if (success) {
                    setReplies((prev) => ({
                      ...prev,
                      [annotation.id]: prev[annotation.id].filter((r) => r.id !== nestedReply.id)
                    }));
                  }
                });
              }}
              className="mt-1 text-xs transition-all hover:scale-105"
              style={{
                color: "#ff6b6b",
                fontFamily: "'Crimson Text', serif"
              }}
            >
              Delete
            </button>
          )}
        </div>
      ))}
    </div>
  );
})()}
```

## Summary

You're making 2 changes:

1. **Add Reply button** next to Delete button for each reply (wrapping both in a flex div)
2. **Add nested reply input and rendering** right after the Reply/Delete buttons

This will:
- Show a "Reply" button on each reply
- When clicked, show an input box to reply to that specific reply
- Display nested replies indented under their parent
- Allow deleting nested replies

## Testing

After making these changes:

1. Click Reply on a comment → Should create a top-level reply ✅
2. Click Reply on a reply → Should show input to reply to that reply ✅
3. Send a nested reply → Should appear indented under parent ✅
4. Nested replies should show correct user info (or "Anonymous" if checked) ✅
