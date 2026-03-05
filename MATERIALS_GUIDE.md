# Book Materials & Textures Guide

## Overview
This guide explains how to properly set up materials and textures for your 3D book models in The Modern Salon.

## Book Model Structure
Your `book2.glb` file has 4 mesh parts:
1. **FrontCover** - Front cover of the book
2. **BackCover** - Back cover of the book
3. **Spine** - The spine (where the title usually appears)
4. **Pages** - The page edges visible when closed

## Material Types & How to Upload

### 1. Spine Textures (JPG images)
**What:** The image/design that appears on the book spine
**Location:** Upload to Supabase Storage in the `spines` bucket

#### How to Upload Spine Images:
```bash
# Via Supabase Dashboard:
1. Go to your Supabase project
2. Navigate to Storage > spines bucket
3. Click "Upload file"
4. Name it: bookname.jpg (e.g., "crimeandpunishment.jpg")
5. The database should already reference this filename in the spine_path column
```

#### Spine Image Requirements:
- **Format:** JPG, PNG
- **Recommended Size:** 512x2048 pixels (or similar tall ratio)
- **Aspect Ratio:** Should be tall/vertical to match spine proportions
- **File Naming:** Use lowercase, no spaces (e.g., "beyondgoodandevil.jpg")

### 2. Cover Textures (Optional - Currently Using Colors)
**What:** Textures or images for front and back covers
**Current Implementation:** Using solid colors based on category

To add cover textures:
```typescript
// In SpinningBook.tsx, modify the FrontCover/BackCover section:
else if (meshName === "FrontCover" || meshName === "BackCover") {
  const coverTexture = new THREE.TextureLoader().load('/textures/covers/yourbook.jpg');
  const mat = new THREE.MeshStandardMaterial({
    map: coverTexture,
    roughness: 0.8,
    metalness: 0.1,
  });
  obj.material = mat;
}
```

### 3. Page Material (Currently Implemented)
**What:** The appearance of book page edges
**Current Implementation:** Beige/cream color (#F5F5DC) with high roughness

To use a paper texture instead:
```typescript
// Download a paper texture and place in public/textures/paper.jpg
const paperTexture = new THREE.TextureLoader().load('/textures/paper.jpg');
paperTexture.wrapS = THREE.RepeatWrapping;
paperTexture.wrapT = THREE.RepeatWrapping;
paperTexture.repeat.set(2, 2);

const mat = new THREE.MeshStandardMaterial({
  map: paperTexture,
  color: new THREE.Color(0xf5f5dc),
  roughness: 0.95,
  metalness: 0,
  normalMap: paperNormalMap, // optional: adds paper texture depth
});
```

## Material Properties Explained

### Roughness (0.0 - 1.0)
- **0.0** = Perfect mirror/glossy
- **0.5** = Semi-glossy (good for leather covers)
- **0.8-0.9** = Matte (good for cloth covers)
- **0.95** = Very matte (good for paper)

### Metalness (0.0 - 1.0)
- **0.0** = Non-metallic (use for books)
- **0.1** = Slight sheen (good for glossy covers)
- **1.0** = Fully metallic (don't use for books)

## Current Material Setup

### Spine
```typescript
if (spineTexture) {
  // Uses uploaded JPG from Supabase
  map: spineTexture,
  roughness: 0.7,
  metalness: 0,
}
```

### Covers (Front & Back)
```typescript
// Uses category-based colors
color: categoryColor,  // e.g., #8B4513 for brown
roughness: 0.8,
metalness: 0.1,
```

### Pages
```typescript
color: 0xf5f5dc,  // Beige/cream
roughness: 0.9,
metalness: 0,
```

## Advanced: Adding Custom Materials

### Example: Leather Cover Material
```typescript
// In SpinningBook.tsx, replace the cover material with:
const leatherTexture = new THREE.TextureLoader().load('/textures/leather.jpg');
const leatherNormal = new THREE.TextureLoader().load('/textures/leather_normal.jpg');

const mat = new THREE.MeshStandardMaterial({
  map: leatherTexture,
  normalMap: leatherNormal,
  color: new THREE.Color(color),  // Tint with category color
  roughness: 0.7,
  metalness: 0.05,
  bumpScale: 0.02,
});
```

### Example: Aged Paper Material
```typescript
// For the Pages mesh:
const paperTexture = new THREE.TextureLoader().load('/textures/oldpaper.jpg');
const mat = new THREE.MeshStandardMaterial({
  map: paperTexture,
  color: new THREE.Color(0xf0e6d2),  // Aged yellow-ish
  roughness: 0.95,
  metalness: 0,
  transparent: false,
});
```

## Workflow: Adding a New Book

1. **Create the spine image**
   - Design a 512x2048 JPG with the book title/author
   - Save as `booktitle.jpg` (lowercase, no spaces)

2. **Upload to Supabase**
   ```
   Storage > spines bucket > Upload file
   ```

3. **Add book to database**
   ```sql
   INSERT INTO books (title, author, pdf_path, spine_path)
   VALUES ('Book Title', 'Author Name', 'book.pdf', 'booktitle.jpg');
   ```

4. **The app will automatically:**
   - Fetch the book from `/api/books`
   - Load the spine texture from Supabase storage
   - Apply category-based color to covers
   - Apply cream color to pages
   - Make it clickable to open the PDF

## Texture Folder Structure (Optional Local Setup)

If you want to use local textures instead of Supabase:

```
public/
├── textures/
│   ├── spines/
│   │   ├── crimeandpunishment.jpg
│   │   ├── frankenstein.jpg
│   │   └── ...
│   ├── covers/
│   │   ├── leather_brown.jpg
│   │   ├── cloth_blue.jpg
│   │   └── ...
│   └── materials/
│       ├── paper.jpg
│       ├── paper_normal.jpg
│       └── leather_normal.jpg
```

## Troubleshooting

### Spine texture not loading
- Check console for errors
- Verify the spine file exists in Supabase storage
- Check the URL: `https://[project].supabase.co/storage/v1/object/public/spines/filename.jpg`
- Ensure NEXT_PUBLIC_SUPABASE_URL is set in `.env.local`

### Covers not showing color
- Verify the category is mapped in `getCategoryForBook()`
- Check that the color hex is valid in `categoryColors`
- Material is applied when the component mounts

### Book appears too dark/bright
- Adjust lighting in the Canvas (ambientLight, directionalLight)
- Adjust material roughness (lower = shinier/brighter)
- Check camera position

## Performance Tips

1. **Optimize texture sizes:** 512x2048 is plenty for spines
2. **Use JPG for photos:** Smaller file size than PNG
3. **Compress images:** Use tools like TinyJPG
4. **Lazy load textures:** Already implemented via useEffect
5. **Reuse materials:** Cache materials when possible

## Next Steps

To fully customize your books:
1. Design spine images for each book (can use Photoshop, Figma, Canva)
2. Upload them to Supabase `spines` bucket
3. Optionally create cover textures and add to the code
4. Optionally add paper/leather textures for more realism
