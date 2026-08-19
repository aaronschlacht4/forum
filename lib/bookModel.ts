import * as THREE from "three";

/**
 * The book model every shelf/card renders. To swap in a new UV-edited book,
 * drop the .glb into `public/models/` and change this one line.
 *
 * A book's JPG is its jacket laid out flat, full bleed, left to right:
 *
 *     back cover 45%  |  spine 10%  |  front cover 45%   ← front faces the reader
 *
 * Aim for roughly 1.70 : 1 (say 2040 × 1200) — that is this book unwrapped,
 * (back + spine + front) wide by one cover tall. A bare front-cover crop will
 * not do: its middle would land on the spine. The image is stretched onto
 * whatever slice of the atlas the model gives the jacket, so it needs no
 * padding to match the model's own UV layout.
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

function makeCoverMaterial(
  source: THREE.Material,
  tex: THREE.Texture
): THREE.Material {
  const mat = source.clone() as THREE.MeshStandardMaterial;
  mat.map = tex;
  mat.color?.set(0xffffff);

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

  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -1;
  mat.polygonOffsetUnits = -4;
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
 * Both take the median colour of the jacket by default, so a book's insides
 * belong to its cover. To make every book's insides the same instead, set
 * INSIDE_COLOR to a hex value; to change how far each surface is washed out
 * toward white, change its mix — 0 is the jacket colour at full strength, 1 is
 * plain white. */

/** Flat colour for the inside strip, or null to follow each jacket. */
export const INSIDE_COLOR: string | null = null;
/** Flat colour for the page block, or null to follow each jacket. */
export const PAGE_COLOR: string | null = null;

const PAGE_TINT_MIX = 0.22;
const INSIDE_TINT_MIX = 0;

const accentCache = new WeakMap<THREE.Texture, THREE.Color | null>();

/**
 * Median colour of the whole wraparound, used to colour the page block and
 * binding so a book's insides belong to its jacket.
 *
 * Median rather than mean, taken per channel: an average is dragged around by
 * whatever is brightest or most extreme on the cover, while the median settles
 * on the colour the jacket actually is over most of its area — the cloth behind
 * the type, not the type.
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
        // The entire wraparound: back cover, spine and front.
        ctx.drawImage(img, 0, 0, w, h, 0, 0, N, N);
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
  mat.color?.copy(
    flat
      ? new THREE.Color(flat)
      : accent.clone().lerp(new THREE.Color(0xffffff), mix)
  );
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
  maxAnisotropy = 8
): number {
  prepareCoverTexture(tex, maxAnisotropy);
  fitCoverToJacket(root, tex);

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
      return makeCoverMaterial(m, tex);
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
