import * as THREE from "three";

/**
 * The book model every shelf/card renders. To swap in a new UV-edited book,
 * drop the .glb into `public/models/` and change this one line.
 *
 * A book's JPG is its jacket laid out flat, full bleed, left to right —
 * back cover, spine, front cover, with the front facing the reader. Draw it
 * at the book's own honest proportions: covers at a fixed width, the spine
 * scaled by the book's thickness factor (√(pageCount/300), clamped 0.55–1.7).
 * Against a 1200px-tall canvas that means 921px per cover and 203px × the
 * thickness factor for the spine — e.g. a 69-page book gets a 112px spine on
 * a 1954px-wide file; a 300-page one the classic 203px on 2045px.
 *
 * The spine-remap shader in makeCoverMaterial is what honours those
 * proportions: the mesh's UV strip splits at fixed fractions sized for the
 * default thickness, and the shader projects them onto the file's own bands,
 * so each face samples exactly the pixels drawn for it. A bare front-cover
 * crop will not do: its middle would land on the spine.
 */
export const BOOK_MODEL_URL = "/models/book2.glb";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** Public Supabase bucket holding one JPG per book. */
export const COVERS_BASE = `${SUPABASE_URL}/storage/v1/object/public/covers`;

/**
 * Resolve a book's single cover image: an explicit `cover_path` if the row has
 * one, otherwise `<id>.jpg`. Adding artwork for a new book means uploading that
 * one file to the `covers` bucket — no code change.
 */
export function coverUrlFor(book: {
  id?: string | number;
  cover_path?: string | null;
}): string | null {
  const file = book.cover_path || (book.id != null ? `${book.id}.jpg` : null);
  return file ? `${COVERS_BASE}/${encodeURIComponent(file)}` : null;
}

/** glTF stores UVs top-left origin, so uploaded JPGs must not be flipped. */
export function prepareCoverTexture(
  tex: THREE.Texture,
  maxAnisotropy = 8
): THREE.Texture {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Bounding box of the book's solid body, with stray geometry hidden.
 *
 * Exported models tend to carry debris the author left behind — zero-thickness
 * planes, loose page quads parked off to one side. Measuring the whole scene
 * lets that debris set the book's height, spine width and resting point, and it
 * renders on the shelf as floating shards. So seed the box from the largest
 * solid mesh and keep only parts centred inside it; anything else is hidden.
 *
 * Mutates `root`, so call it on a clone.
 */
export function measureBookBody(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);

  const parts: { mesh: THREE.Mesh; box: THREE.Box3; size: THREE.Vector3 }[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const box = new THREE.Box3().setFromObject(mesh);
    if (box.isEmpty()) return;
    parts.push({ mesh, box, size: box.getSize(new THREE.Vector3()) });
  });
  if (!parts.length) return new THREE.Box3();

  const volume = (s: THREE.Vector3) => s.x * s.y * s.z;
  const seed = parts.reduce((a, b) => (volume(b.size) > volume(a.size) ? b : a));

  const body = seed.box.clone();
  const pad = Math.max(seed.size.x, seed.size.y, seed.size.z) * 0.02;
  const bounds = body.clone().expandByScalar(pad);
  const centre = new THREE.Vector3();

  for (const part of parts) {
    if (part === seed) continue;
    const solid = Math.min(part.size.x, part.size.y, part.size.z) > 1e-6;
    if (solid && bounds.containsPoint(part.box.getCenter(centre))) {
      body.union(part.box);
    } else {
      part.mesh.visible = false;
    }
  }
  return body;
}

let warnedNoJacketMaterial = false;

/**
 * The mesh's own spine band: the U range its -X face (the spine) samples.
 *
 * The jacket is one continuous mesh — back, spine, front in a single UV strip
 * — so the boundaries between panels exist only implicitly, as which U values
 * land on which face. Measured directly off the geometry (the vertices lying
 * on the model's min-X plane are the spine's), rather than hardcoded, so a
 * re-exported model recalibrates itself.
 */
export function measureSpineBand(
  root: THREE.Object3D
): { u1: number; u2: number } | null {
  let minX = Infinity;
  let maxX = -Infinity;
  const jackets: THREE.Mesh[] = [];

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!mats.some((m) => m && JACKET_MATERIAL_PATTERN.test(m.name ?? ""))) return;
    jackets.push(mesh);
    const pos = mesh.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      minX = Math.min(minX, pos.getX(i));
      maxX = Math.max(maxX, pos.getX(i));
    }
  });
  if (!jackets.length || !Number.isFinite(minX)) return null;

  // The spine face is flat but the binding curves away from it on both
  // sides, and that curve is still front-on to the camera on a shelf — a
  // tight tolerance around the true flat plane left the curved rim outside
  // [u1, u2] entirely, so it fell through to the unmodified cover formulas
  // below and sampled cover art on what reads as part of the spine. Widened
  // until it plateaued (0.15 and 0.3 measured the same band), which means
  // it's now catching the whole curve, not just the flat strip at its centre.
  const tolerance = (maxX - minX) * 0.15;
  let u1 = Infinity;
  let u2 = -Infinity;
  for (const mesh of jackets) {
    const pos = mesh.geometry.getAttribute("position");
    const uv = mesh.geometry.getAttribute("uv");
    if (!uv) continue;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getX(i) > minX + tolerance) continue;
      u1 = Math.min(u1, uv.getX(i));
      u2 = Math.max(u2, uv.getX(i));
    }
  }
  return u2 > u1 ? { u1, u2 } : null;
}

/**
 * Sample the cover at the file's own panel proportions instead of the mesh's.
 *
 * The mesh's UV strip divides back/spine/front at fixed fractions, sized for
 * a book at default thickness. A book's spine geometry, though, is scaled by
 * its page count — so a cover file drawn with its spine at `s·t` of the width
 * (the honest proportions of *that* book) would render smeared: the mesh
 * would stretch the file's fixed-fraction spine slice across the scaled face.
 *
 * This remaps U in the fragment shader: the mesh's fixed bands are projected
 * onto the file laid out as [cover | spine·t | cover], so each face samples
 * exactly the pixels drawn for it, at matching density. At t = 1 the remap is
 * the identity and fixed-proportion files behave as before.
 *
 * Only called for a cover actually built to these proportions (see the
 * `calibrated` guard around this in applyCoverTexture) — carving up a cover
 * that wasn't drawn this way samples nonsense.
 */
function addSpineRemap(
  mat: THREE.MeshStandardMaterial,
  band: { u1: number; u2: number },
  thickness: number
) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.spineRemap = {
      value: new THREE.Vector3(band.u1, band.u2, thickness),
    };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <map_pars_fragment>",
        "#include <map_pars_fragment>\nuniform vec3 spineRemap;"
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `
#ifdef USE_MAP
  vec2 jacketUv = vMapUv;
  {
    float u1 = spineRemap.x;
    float u2 = spineRemap.y;
    float t  = spineRemap.z;
    float T  = u1 + (u2 - u1) * t + (1.0 - u2);
    float f1 = u1 / T;
    float f2 = (u1 + (u2 - u1) * t) / T;
    // Even sampling exactly [f1, f2], GPU mip/anisotropic filtering blurs a
    // few source texels across the hard edge into neighbouring cover art —
    // negligible on a wide face, but a thin spine's whole sampled window can
    // be only a few dozen texels, so that blur eats a real fraction of it.
    // Sampling a touch inside [f1, f2] rather than right up to its edges
    // gives the blur room to mix with more spine, not cover.
    float margin = (f2 - f1) * 0.25;
    float g1 = f1 + margin;
    float g2 = f2 - margin;
    float u  = jacketUv.x;
    if (u <= u1)      jacketUv.x = (u / u1) * f1;
    else if (u <= u2) jacketUv.x = g1 + ((u - u1) / (u2 - u1)) * (g2 - g1);
    else              jacketUv.x = f2 + ((u - u2) / (1.0 - u2)) * (1.0 - f2);
  }
  vec4 sampledDiffuseColor = texture2D( map, jacketUv );
  diffuseColor *= sampledDiffuseColor;
#endif
`
      );
  };
  mat.needsUpdate = true;
}

function makeCoverMaterial(
  source: THREE.Material,
  tex: THREE.Texture,
  spineBand?: { u1: number; u2: number } | null,
  spineScale = 1
): THREE.Material {
  const mat = source.clone() as THREE.MeshStandardMaterial;
  mat.map = tex;
  mat.color?.set(0xffffff);
  if (spineBand) addSpineRemap(mat, spineBand, spineScale);

  // Every other map on this material was baked from the cover art the model
  // shipped with — book2.glb even points normalMap and roughnessMap at the same
  // screenshot it uses for base colour. Leaving them in embosses the old cover
  // into the new one as surface relief, which reads as two covers ghosting
  // through each other. A new cover replaces all of its artwork-derived maps.
  mat.normalMap = null;
  mat.bumpMap = null;
  mat.roughnessMap = null;
  mat.metalnessMap = null;
  mat.aoMap = null;
  mat.emissiveMap = null;
  mat.displacementMap = null;
  mat.alphaMap = null;
  mat.roughness = 0.62;
  mat.metalness = 0.0;

  // The jacket and the binding trim are all but coincident on the spine — the
  // model has them within hundredths of a unit. Rather than leave the depth
  // buffer to arbitrate, the jacket is biased toward the eye and the trim away
  // from it, so which one shows is decided rather than discovered per triangle.
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -8;
  mat.needsUpdate = true;
  return mat;
}

/** Materials a book's JPG is painted onto. */
export const JACKET_MATERIAL_PATTERN = /cover|jacket|wrap/i;
/** Material that reads as paper, so it takes only a wash of the jacket colour. */
const PAGE_MATERIAL_PATTERN = /page|paper|sheet/i;

/* ---- The colour of a book's insides ----
 *
 * Looking down on a shelved book you see two surfaces: the top of the page
 * block, and a narrower strip of binding beside it — the inside of the book.
 * The jacket has no upward-facing surface at all, so those two are the whole of
 * what reads from above.
 *
 * Both take the colour of the jacket's top edge, so the page block runs into
 * the cover without a seam. Neither is lightened by default: washing them
 * toward white is exactly what makes the join show. To make every book's
 * insides the same instead, set INSIDE_COLOR or PAGE_COLOR to a hex value; to
 * lift a surface back toward white, raise its mix — 0 is the jacket colour at
 * full strength, 1 is plain white. */

/** Flat colour for the inside strip, or null to follow each jacket. */
export const INSIDE_COLOR: string | null = null;
/** Flat colour for the page block, or null to follow each jacket. */
export const PAGE_COLOR: string | null = null;

// Paper is lifted well toward white so a page block reads as paper carrying a
// hint of the jacket, not as a slab of it. The binding strip takes the colour
// at full strength, which is what closes the seam at the top edge.
const PAGE_TINT_MIX = 0.62;
const INSIDE_TINT_MIX = 0;

/**
 * Grain for the page block. Replace the file to change how paper reads.
 *
 * The model's own page texture is a photograph of page edges in deep shadow,
 * averaging (83, 69, 55) — dark enough that tinting it could only ever darken it
 * further, so a page block came out as a muddy brown slab. This is pale, which
 * leaves room for the tint to sit on top of it.
 */
export const PAGE_TEXTURE_URL = "/textures/pages.jpg";

/**
 * The page block only samples a corner of its atlas — about 0.26 by 0.15 — so
 * the grain is repeated to fill that patch rather than showing one magnified
 * corner of the image.
 */
const PAGE_UV_PATCH = { u: 0.262, v: 0.152 };

// Falls back to brightening the model's own texture if the file is missing.
const PAGE_BRIGHTEN = 2.7;
const PAGE_SATURATE = 0.35;

let pageGrain: THREE.Texture | null = null;

if (typeof window !== "undefined") {
  new THREE.TextureLoader().load(
    PAGE_TEXTURE_URL,
    (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = false;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1 / PAGE_UV_PATCH.u, 1 / PAGE_UV_PATCH.v);
      // Page edges are almost always seen at a sharp angle.
      t.anisotropy = 16;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.needsUpdate = true;
      pageGrain = t;
    },
    undefined,
    () => {
      console.warn(
        `[bookModel] no page grain at ${PAGE_TEXTURE_URL}; brightening the model's own instead`
      );
    }
  );
}

const litPageCache = new WeakMap<THREE.Texture, THREE.Texture | null>();

/**
 * A lightened copy of the page-block texture.
 *
 * Keeps the striations that make it read as stacked leaves, but raises them out
 * of shadow so there is room for a tint on top instead of the photograph's own
 * brown swallowing everything.
 */
function lightenedPageTexture(tex: THREE.Texture | null): THREE.Texture | null {
  if (!tex) return null;
  if (litPageCache.has(tex)) return litPageCache.get(tex) ?? null;

  let lit: THREE.Texture | null = null;
  const img = tex.image as CanvasImageSource;
  const w = (img as { width?: number })?.width ?? 0;
  const h = (img as { height?: number })?.height ?? 0;

  if (w && h && typeof document !== "undefined") {
    try {
      // The page block is a sliver on screen; the source is 4096 across.
      const scale = Math.min(1, 1024 / w);
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.filter = `brightness(${PAGE_BRIGHTEN}) saturate(${PAGE_SATURATE})`;
        ctx.drawImage(img, 0, 0, w, h, 0, 0, cw, ch);
        lit = new THREE.CanvasTexture(canvas);
        // Match the original's conventions, or the grain lands upside down and
        // in the wrong colour space.
        lit.flipY = tex.flipY;
        lit.wrapS = tex.wrapS;
        lit.wrapT = tex.wrapT;
        lit.colorSpace = THREE.SRGBColorSpace;
        lit.anisotropy = tex.anisotropy;
        lit.needsUpdate = true;
      }
    } catch {
      lit = null;
    }
  }

  litPageCache.set(tex, lit);
  return lit;
}

const accentCache = new WeakMap<THREE.Texture, THREE.Color | null>();

// The patch of jacket sampled for the insides: the middle of its top edge —
// the top of the spine, which is the colour the page block runs into.
const TOP_PATCH = { u0: 0.36, u1: 0.64, v0: 0, v1: 0.1 };

/**
 * Colour of the jacket along its top edge, used for the page block and binding.
 *
 * Taken from the top of the spine rather than averaged over the whole
 * wraparound: what matters is the colour the insides meet, and the median of an
 * entire jacket is some blend of front, spine and back that matches the top edge
 * only by accident — which is why the seam showed.
 *
 * Median rather than mean, per channel, so title lettering across the patch
 * doesn't drag the result; the median settles on the cloth behind the type.
 */
export function coverAccentColor(tex: THREE.Texture): THREE.Color | null {
  if (accentCache.has(tex)) return accentCache.get(tex) ?? null;

  let accent: THREE.Color | null = null;
  const img = tex.image as CanvasImageSource;
  const w = (img as { width?: number })?.width ?? 0;
  const h = (img as { height?: number })?.height ?? 0;

  if (w && h && typeof document !== "undefined") {
    try {
      const N = 40;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = N;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(
          img,
          w * TOP_PATCH.u0,
          h * TOP_PATCH.v0,
          w * (TOP_PATCH.u1 - TOP_PATCH.u0),
          h * (TOP_PATCH.v1 - TOP_PATCH.v0),
          0,
          0,
          N,
          N
        );
        const px = ctx.getImageData(0, 0, N, N).data;

        const r: number[] = [], g: number[] = [], b: number[] = [];
        for (let i = 0; i < px.length; i += 4) {
          r.push(px[i]); g.push(px[i + 1]); b.push(px[i + 2]);
        }
        const median = (xs: number[]) => {
          xs.sort((p, q) => p - q);
          const mid = xs.length >> 1;
          return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
        };
        if (r.length) {
          accent = new THREE.Color(
            median(r) / 255,
            median(g) / 255,
            median(b) / 255
          );
        }
      }
    } catch {
      // A cross-origin image without CORS headers taints the canvas; the book
      // just keeps the model's own page and binding colours.
      accent = null;
    }
  }

  accentCache.set(tex, accent);
  return accent;
}

function tintMaterial(source: THREE.Material, accent: THREE.Color): THREE.Material {
  const mat = source.clone() as THREE.MeshStandardMaterial;
  const isPaper = PAGE_MATERIAL_PATTERN.test(mat.name ?? "");
  const flat = isPaper ? PAGE_COLOR : INSIDE_COLOR;
  const mix = isPaper ? PAGE_TINT_MIX : INSIDE_TINT_MIX;
  const target = flat
    ? new THREE.Color(flat)
    : accent.clone().lerp(new THREE.Color(0xffffff), mix);

  // A material renders as map × colour, so the artwork these ship with stains
  // whatever tint is asked for. The two want opposite treatment.
  if (isPaper) {
    // Paper keeps a grain — the edges of the leaves — with the tint on top.
    const grain = pageGrain ?? lightenedPageTexture(mat.map);
    if (grain) mat.map = grain;
    mat.color?.copy(target);

    // The rest of the maps still pointed at the model's own 4096-wide page
    // photograph, and the page block samples barely a corner of that atlas — so
    // a hugely magnified crop of it was being read as surface roughness and
    // painting a regular lattice across the books. Swapping the colour map
    // alone left that behind.
    mat.normalMap = null;
    mat.bumpMap = null;
    mat.roughnessMap = null;
    mat.metalnessMap = null;
    mat.aoMap = null;
    mat.emissiveMap = null;
    mat.roughness = 0.8;
    mat.metalness = 0;
  } else {
    // The binding is the strip you see from above, beside the page block. Its
    // baked map is a flat red swatch with nothing in it worth keeping, and it
    // was staining every book red — covers with no red anywhere near them. Drop
    // it so the strip is exactly the colour of the jacket's top edge.
    mat.map = null;
    mat.normalMap = null;
    mat.roughnessMap = null;
    mat.metalnessMap = null;
    mat.color?.copy(target);
    // The other half of the bargain struck in makeCoverMaterial.
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = 2;
    mat.polygonOffsetUnits = 8;
  }

  mat.needsUpdate = true;
  return mat;
}

/**
 * Lay a cover image onto the jacket's slice of the atlas without distorting it.
 *
 * Two things have to be corrected. The jacket occupies only part of the model's
 * UV space — book2.glb parks it in V 0.175→1 and keeps the strip above for the
 * page block and binding — so sampling a cover through those UVs raw shears the
 * top off the artwork. And the jacket unwrapped is (back + spine + front) wide
 * by one cover tall, about 1.70:1, so an image drawn to any other ratio would be
 * stretched to fill it.
 *
 * So the image is fitted rather than stretched: it covers the jacket at its own
 * aspect ratio and whatever overhangs is trimmed evenly from both sides. An
 * image already at the jacket's ratio is used whole.
 *
 * Both the UV band and the jacket's proportions are measured off the model, so a
 * differently-unwrapped .glb still works.
 */
function fitCoverToJacket(root: THREE.Object3D, tex: THREE.Texture) {
  const img = tex.image as { width?: number; height?: number } | undefined;
  if (!img?.width || !img.height) return;

  let v0 = Infinity;
  let v1 = -Infinity;

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!mats.some((m) => m && JACKET_MATERIAL_PATTERN.test(m.name ?? ""))) return;

    const uv = mesh.geometry.getAttribute("uv");
    if (uv) {
      for (let i = 0; i < uv.count; i++) {
        v0 = Math.min(v0, uv.getY(i));
        v1 = Math.max(v1, uv.getY(i));
      }
    }
  });

  const bandH = v1 - v0;
  if (!(bandH > 1e-6) || !Number.isFinite(v0)) return;

  // The whole image, never a crop of it. Cropping an off-ratio cover to fit
  // without distortion sounds tidier, but the title runs the full height of the
  // spine — trimming even a few percent off the ends takes the first letters
  // with it, and on a spine-out shelf the spine is what the reader reads. A
  // cover drawn to the jacket's own ratio lands exactly; anything else is
  // stretched to fit, which costs proportion instead of words.
  tex.repeat.set(1, 1 / bandH);
  tex.offset.set(0, -v0 / bandH);
  tex.needsUpdate = true;
}

/**
 * Dress a book that has no artwork in plain cloth.
 *
 * Without this it keeps whatever the model shipped with — for book2.glb that is
 * a photograph of the Frankenstein jacket, so every book missing a cover
 * silently impersonates a real one. A flat cloth colour derived from the book's
 * id reads as "no cover yet" and keeps neighbouring books distinguishable.
 */
export function applyBlankCover(root: THREE.Object3D, seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  // Deep and desaturated, so it reads as bookcloth under the shelf's warm key
  // light rather than as a blank page.
  const cloth = new THREE.Color().setHSL(((hash >>> 0) % 360) / 360, 0.34, 0.19);

  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.material) meshes.push(mesh);
  });

  let painted = 0;
  const one = (m: THREE.Material) => {
    if (!JACKET_MATERIAL_PATTERN.test(m.name ?? "")) return tintMaterial(m, cloth);
    painted++;
    const mat = m.clone() as THREE.MeshStandardMaterial;
    mat.map = null;
    mat.normalMap = null;
    mat.bumpMap = null;
    mat.roughnessMap = null;
    mat.metalnessMap = null;
    mat.aoMap = null;
    mat.emissiveMap = null;
    mat.color?.copy(cloth);
    mat.roughness = 0.78;
    mat.metalness = 0;
    mat.needsUpdate = true;
    return mat;
  };

  for (const mesh of meshes) {
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => (m ? one(m) : m))
      : one(mesh.material);
  }
  return painted;
}

/**
 * Dress one cloned book in its cover JPG.
 *
 * Only the jacket is painted. The atlas reserves a strip for the page block and
 * the binding trim, but real cover art is a jacket edge to edge with nothing in
 * that strip — so painting those two as well crops a corner of the artwork onto
 * them, and since the binding trim is coincident with the jacket surface, the
 * result reads as a second cover ghosting through the first. They keep the
 * textures the model shipped with instead.
 *
 * Materials are cloned before being touched: `scene.clone(true)` shares material
 * instances between clones, so painting in place would put one book's cover on
 * every book on the shelf.
 *
 * Returns how many materials were textured.
 */
export function applyCoverTexture(
  root: THREE.Object3D,
  tex: THREE.Texture,
  maxAnisotropy = 8,
  spineScale = 1,
  calibrated = false
): number {
  prepareCoverTexture(tex, maxAnisotropy);
  fitCoverToJacket(root, tex);

  // Where on the mesh's UV strip the spine face actually sits, so the shader
  // can line the file's own panels up with the faces they were drawn for.
  // Only worth measuring for a cover actually built at those proportions —
  // for anything else this would carve the image up along boundaries that
  // don't correspond to its content, and come out worse than no remap at all.
  const spineBand = calibrated ? measureSpineBand(root) : null;

  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.material) meshes.push(mesh);
  });

  // Pages and binding take a wash of the jacket colour, so a book's insides
  // belong to its cover instead of every book sharing the model's stock paper.
  const accent = coverAccentColor(tex);

  const paint = (match: (m: THREE.Material) => boolean) => {
    let count = 0;
    const one = (m: THREE.Material) => {
      if (!match(m)) return accent ? tintMaterial(m, accent) : m;
      count++;
      return makeCoverMaterial(m, tex, spineBand, spineScale);
    };
    for (const mesh of meshes) {
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => (m ? one(m) : m))
        : one(mesh.material);
    }
    return count;
  };

  const painted = paint((m) => JACKET_MATERIAL_PATTERN.test(m.name ?? ""));
  if (painted > 0) return painted;

  // A model whose jacket material is named something else still shows its
  // artwork rather than silently rendering the stock cover.
  if (!warnedNoJacketMaterial) {
    warnedNoJacketMaterial = true;
    const names = [
      ...new Set(
        meshes.flatMap((m) =>
          (Array.isArray(m.material) ? m.material : [m.material]).map(
            (mat) => (mat as THREE.Material).name || "(unnamed)"
          )
        )
      ),
    ];
    console.warn(
      `[bookModel] No material in ${BOOK_MODEL_URL} matches ${JACKET_MATERIAL_PATTERN} — ` +
        `painting every material instead. Name the jacket material "cover". Found: ${names.join(", ")}`
    );
  }
  return paint(() => true);
}
