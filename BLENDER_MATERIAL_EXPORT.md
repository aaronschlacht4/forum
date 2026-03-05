# How to Export Materials from Blender for Your Books

## Overview

Your book model (`book2.glb`) has 4 mesh parts, each needing materials:
1. **Spine** - Gets texture from Supabase
2. **FrontCover** - Gets color from spine texture
3. **BackCover** - Same as front cover
4. **Pages** - Needs a paper material

## ✅ What I Just Fixed

1. **Removed bobbing animation** - Books no longer float up and down
2. **Cover colors now match spine** - Automatically extracts median color from spine texture and applies to covers
3. **Books stay still** - Only rotation animation remains

---

## Option 1: Export Materials Directly from Blender (Recommended)

### Step 1: Prepare Your Blender File

1. **Open your book model in Blender**
   ```
   File > Open > book2.blend
   ```

2. **Select the Pages mesh**
   - In the Outliner (top right), click on "Pages"
   - Or select it in the 3D viewport

3. **Go to Shading workspace**
   - Click "Shading" at the top of Blender

### Step 2: Create the Paper Material

1. **In the Shader Editor (bottom panel):**
   ```
   Add > Texture > Image Texture
   ```

2. **Load your paper texture:**
   - Click "Open" in the Image Texture node
   - Browse to your paper texture file (JPG/PNG)
   - Recommended: Use a seamless tileable paper texture

3. **Connect nodes:**
   ```
   Image Texture (Color) → Principled BSDF (Base Color)
   ```

4. **Adjust material properties in Principled BSDF:**
   ```
   Base Color: Connect image texture
   Roughness: 0.95
   Metallic: 0.0
   Specular: 0.0
   ```

### Step 3: UV Unwrap the Pages (If Needed)

If your paper texture looks stretched:

1. **Select Pages mesh** (Tab to Edit Mode)
2. **Select all faces** (Press A)
3. **Unwrap:**
   ```
   U > Smart UV Project
   ```
4. **Scale UV islands** in UV Editor if needed

### Step 4: Export as GLB with Embedded Textures

1. **Select all meshes** you want to export (or Select All: A)

2. **Export as GLB:**
   ```
   File > Export > glTF 2.0 (.glb/.gltf)
   ```

3. **IMPORTANT Export Settings:**
   ```
   Format: glTF Binary (.glb)

   Include:
   ✅ Selected Objects (if you selected specific meshes)
   ✅ Materials
   ✅ Images

   Transform:
   ✅ +Y Up (change if needed)

   Geometry:
   ✅ Apply Modifiers
   ✅ UVs
   ✅ Normals
   ✅ Vertex Colors

   Materials:
   ✅ Materials
   ✅ Images

   Compression:
   □ Don't compress (for better compatibility)
   ```

4. **Save as `book2.glb`** in your `public/models/` folder

### Step 5: Test in Your App

1. Replace the old `public/models/book2.glb` with your new one
2. Restart your dev server
3. The paper material should now be baked into the model!

---

## Option 2: Use External Textures (Current Approach)

Instead of baking materials into the GLB, keep using external textures:

### For Paper Texture:

1. **Export your paper texture from Blender:**
   - In Blender, go to your paper texture
   - Click the folder icon next to the texture
   - Navigate to where it's saved
   - Copy that file

2. **Place in your project:**
   ```bash
   cp your-paper-texture.jpg public/textures/paper.jpg
   ```

3. **The code already loads it automatically!** ✅

---

## Option 3: Create Material in Blender but Apply in Code

If you want to design materials in Blender but apply them via code:

### In Blender:

1. Create and test your materials
2. Take screenshots for reference
3. Note the exact values:
   - Base Color RGB
   - Roughness
   - Metallic
   - Normal maps (if any)

### In Your Code (SpinningBook.tsx):

The code already has proper material setup:

```typescript
// Pages material (lines 140-160)
const mat = new THREE.MeshStandardMaterial({
  color: 0xf5f5dc,     // Cream color
  roughness: 0.95,      // Very matte (like paper)
  metalness: 0,         // Not metallic
  map: paperTexture,    // Optional texture
});
```

**To match Blender:**
- Blender "Roughness" → Three.js `roughness`
- Blender "Metallic" → Three.js `metalness`
- Blender "Base Color" → Three.js `color` (convert to hex)

---

## Recommended Workflow

### Best Approach: Hybrid

1. **Keep simple materials in code** (covers, spine - already done ✅)
2. **Export complex materials in GLB** (if you have special page effects)
3. **Use external textures for variety** (different covers per book)

### For Your Pages:

**Option A: Bake into GLB** (if all books use same paper texture)
- Follow "Option 1" above
- Export with materials embedded
- One-time setup

**Option B: External texture** (if you want different paper per book - current)
- Place `paper.jpg` in `public/textures/`
- Code loads it automatically ✅
- Easy to change later

---

## Common Issues & Solutions

### Issue: Exported GLB has no materials

**Solution:**
1. In Blender export settings, ensure:
   - ✅ Materials
   - ✅ Images
2. Make sure materials are assigned to meshes
3. Check Material Properties panel shows the material

### Issue: Textures not showing in exported GLB

**Solution:**
1. In Blender, pack textures:
   ```
   File > External Data > Pack Resources
   ```
2. Or use "File > External Data > Automatically Pack Into .blend"
3. Re-export with ✅ Images checked

### Issue: UV mapping is wrong

**Solution:**
1. Select mesh → Tab (Edit Mode)
2. Select all (A)
3. UV > Smart UV Project
4. Adjust in UV Editor if needed

### Issue: Material looks different in Three.js vs Blender

**Solution:**
- Blender uses Cycles/Eevee rendering
- Three.js uses WebGL PBR
- They won't match perfectly
- Adjust `roughness` and `metalness` in code to fine-tune

---

## Quick Reference: Material Properties

| Blender Property | Three.js Property | Paper Value | Cover Value |
|-----------------|-------------------|-------------|-------------|
| Base Color | `color` | 0xf5f5dc | From spine |
| Roughness | `roughness` | 0.95 | 0.8 |
| Metallic | `metalness` | 0 | 0.1 |
| Normal Map | `normalMap` | Optional | Optional |
| Specular | Handled by roughness | - | - |

---

## Current Status After My Changes

✅ **Bobbing removed** - Books rotate but don't bounce
✅ **Covers match spine color** - Automatically extracted from texture
✅ **Paper material ready** - Just add `public/textures/paper.jpg`
✅ **GLB already has mesh names** - "Pages", "Spine", "FrontCover", "BackCover"

### What You Need To Do:

**Option 1:** Add external paper texture (easiest):
```bash
# Find a paper texture online or from Blender
cp paper-texture.jpg public/textures/paper.jpg
# Restart server - done!
```

**Option 2:** Export from Blender with materials:
1. Open book2.blend in Blender
2. Add paper texture to Pages mesh
3. Export as GLB with materials embedded (see above)
4. Replace `public/models/book2.glb`
5. Restart server

I recommend **Option 1** - it's simpler and more flexible!

---

## Example Paper Textures

You can find free paper textures at:
- [Textures.com](https://www.textures.com/search?q=paper) (requires account)
- [Poly Haven](https://polyhaven.com/textures) (free, no account)
- [FreePBR](https://freepbr.com/) (free)

Download a seamless paper texture, save as `paper.jpg`, and place in `public/textures/`.

---

## Summary

✅ Books no longer bob up and down
✅ Cover colors automatically match spine texture
✅ Paper material can be added two ways:
   - **Easy:** Place `paper.jpg` in `public/textures/`
   - **Advanced:** Bake into GLB via Blender export

The code handles everything automatically - just add the texture file!
