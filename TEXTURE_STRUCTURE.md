# 📁 Complete Texture & Materials File Structure

## Current Project Structure

```
univault/
├── public/
│   ├── models/
│   │   ├── book2.glb              ← Your 3D book model (has Spine, FrontCover, BackCover, Pages)
│   │   └── shelfv2.glb            ← Your 3D shelf model
│   │
│   ├── spines/                     ← LOCAL spine images (currently only frankenstein.jpg)
│   │   └── frankenstein.jpg
│   │
│   └── textures/                   ← ADD YOUR TEXTURES HERE
│       ├── covers/                 ← Optional: cover textures named by book ID
│       │   ├── [book-id-1].jpg    ← Example: 8fa4fc85-115e-41b3-9f5b-da7af1c81f30.jpg
│       │   ├── [book-id-2].jpg
│       │   └── [book-id-3].jpg
│       │
│       └── paper.jpg               ← Optional: shared paper texture for all books
│
└── components/
    └── SpinningBook.tsx            ← The component that loads all materials
```

## How Materials Are Loaded

### 1. Spine Textures
```
Priority 1: Supabase Storage
  ↓
https://[your-project].supabase.co/storage/v1/object/public/spines/[filename].jpg
  ↓
Example: https://tpvpvvmtgfxheceliyxj.supabase.co/storage/v1/object/public/spines/crimeandpunishment.jpg
  ↓
Loaded from database spine_path field: "crimeandpunishment.jpg"
  ↓
✅ Applied to Spine mesh

Fallback: Solid category color if texture fails
```

### 2. Cover Textures (Optional)
```
Priority 1: Local public folder
  ↓
/textures/covers/[book-id].jpg
  ↓
Example: /textures/covers/8fa4fc85-115e-41b3-9f5b-da7af1c81f30.jpg
  ↓
Automatically tries to load
  ↓
If found: ✅ Applied to FrontCover and BackCover meshes (tinted with category color)
If not found: Uses solid category color instead
```

### 3. Paper Texture (Optional)
```
Priority 1: Local public folder
  ↓
/textures/paper.jpg
  ↓
Automatically tries to load (shared for ALL books)
  ↓
If found: ✅ Applied to Pages mesh with cream tint
If not found: Uses solid cream color (#F5F5DC)
```

## 🎨 Material Properties Reference

```typescript
// Spine
if (has texture) {
  map: spineTexture,
  color: white (0xffffff),  // No tint, shows texture as-is
  roughness: 0.7,           // Slightly matte
  metalness: 0              // Not metallic
} else {
  color: category color,    // Fallback: brown, purple, etc.
  roughness: 0.7,
  metalness: 0
}

// Covers (Front & Back)
if (has texture) {
  map: coverTexture,
  color: category color,    // Tints the texture
  roughness: 0.75,          // Semi-matte
  metalness: 0.05          // Very slight sheen
} else {
  color: category color,    // Solid color
  roughness: 0.8,           // More matte
  metalness: 0.1           // Slight sheen
}

// Pages
if (has texture) {
  map: paperTexture,
  color: cream (0xf5f5dc),  // Tints paper texture
  roughness: 0.95,          // Very matte
  metalness: 0             // Not metallic
} else {
  color: cream (0xf5f5dc),  // Solid cream
  roughness: 0.95,
  metalness: 0
}
```

## 📊 Current Status

| Material Type | Status | Location |
|--------------|--------|----------|
| **Spine textures** | ✅ Working | Supabase Storage `spines` bucket |
| **Cover textures** | ⚙️ Optional | `public/textures/covers/[id].jpg` |
| **Paper texture** | ⚙️ Optional | `public/textures/paper.jpg` |
| **Fallback colors** | ✅ Working | Category-based colors in code |

## 🎯 To Add Custom Materials

### Add Cover Texture for One Book:

1. Get book ID from API:
   ```bash
   curl http://localhost:3000/api/books | jq -r '.[] | select(.title=="Crime and Punishment") | .id'
   # Returns: 8fa4fc85-115e-41b3-9f5b-da7af1c81f30
   ```

2. Create cover image:
   - Find or create a JPG image (1024x1536 px recommended)
   - Name it with the book ID: `8fa4fc85-115e-41b3-9f5b-da7af1c81f30.jpg`

3. Place in folder:
   ```bash
   cp your-cover-image.jpg public/textures/covers/8fa4fc85-115e-41b3-9f5b-da7af1c81f30.jpg
   ```

4. Restart dev server and refresh browser

### Add Paper Texture (All Books):

1. Download or create paper texture
   - Seamless tiling works best
   - 512x512 px is plenty

2. Place in folder:
   ```bash
   cp your-paper-texture.jpg public/textures/paper.jpg
   ```

3. Restart dev server and refresh browser

## 🖼️ Example Workflow: Complete Custom Book

Let's say you want to fully customize "Crime and Punishment":

```bash
# 1. Check book ID
curl http://localhost:3000/api/books | jq -r '.[] | select(.title=="Crime and Punishment")'
# ID: 8fa4fc85-115e-41b3-9f5b-da7af1c81f30

# 2. You already have spine in Supabase
# https://[project].supabase.co/storage/v1/object/public/spines/crimeandpunishment.jpg
# ✅ Already working

# 3. Add custom leather cover texture
cp red-leather-texture.jpg public/textures/covers/8fa4fc85-115e-41b3-9f5b-da7af1c81f30.jpg

# 4. Add aged paper texture (for all books)
cp aged-paper.jpg public/textures/paper.jpg

# 5. Restart server
npm run dev

# 6. Open browser and see:
# - Spine: Your uploaded JPG from Supabase
# - Covers: Red leather texture tinted with brown (Psychological category)
# - Pages: Aged paper texture tinted with cream
```

## 🔧 Code Location

All material logic is in: [components/SpinningBook.tsx](components/SpinningBook.tsx)

Key sections:
- Lines 43-65: Spine material
- Lines 67-88: Cover materials
- Lines 90-114: Page materials
- Lines 152-210: Texture loading logic

## 🚀 Performance Tips

1. **Optimize images:**
   ```bash
   # Use ImageMagick to resize/compress
   convert input.jpg -resize 1024x1536 -quality 85 output.jpg
   ```

2. **Use appropriate sizes:**
   - Spine: 512x2048 max
   - Covers: 1024x1536 max
   - Paper: 512x512 max

3. **JPG vs PNG:**
   - Use JPG for photos/textures (smaller)
   - Use PNG only if you need transparency

4. **Batch process:**
   ```bash
   # Optimize all covers at once
   for f in public/textures/covers/*.jpg; do
     convert "$f" -quality 85 "$f"
   done
   ```

## ✅ Final Checklist

- [ ] Books are 8.5x bigger (check visually)
- [ ] Spine textures load from Supabase (check console logs)
- [ ] Category colors apply to covers (should see brown, purple, gold, etc.)
- [ ] Pages are cream colored
- [ ] (Optional) Cover textures in `public/textures/covers/`
- [ ] (Optional) Paper texture at `public/textures/paper.jpg`
- [ ] Books are clickable and open PDFs

Your book materials are now fully customizable! 🎉
