"use client";

import { useRouter } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  BOOK_MODEL_URL,
  applyBlankCover,
  applyCoverTexture,
  coverUrlFor,
  measureBookBody,
} from "@/lib/bookModel";

export type BookData = {
  id: string;
  title?: string;
  author?: string;
  pdfUrl?: string;
  cover_path?: string;
  /**
   * Identifies this copy on the shelf rather than the book. A duplicated book
   * gives two entries sharing an `id`, so this is what keys them apart and what
   * moving and removal act on.
   */
  itemId?: string;
  /** Slot on the bookcase, counted from the top-left. Gaps are allowed. */
  slot?: number;
};

type Bounds = { box: THREE.Box3; size: THREE.Vector3; center: THREE.Vector3 };

export const SHELF_CATEGORIES = [
  { name: "My Library",      rows: 2 },
  { name: "Recently Added",  rows: 2 },
  { name: "Genres",          rows: 2 },
  { name: "Popular",         rows: 2 },
  { name: "Suggested",       rows: 2 },
];

const N_ROWS = SHELF_CATEGORIES.reduce((s, c) => s + c.rows, 0); // 10
const BG = "#140d04";

/* ---- Shelf layout ----
 * shelfv2.glb is a compartment open at the front — floor, back and two sides,
 * no front face. Books stand inside it on the floor, so rows stay contiguous:
 * each compartment sits directly on the one below and the stack reads as one
 * bookcase. */

// Book height as a fraction of the compartment's height.
const BOOK_FILL = 0.86;
// Book depth as a fraction of the compartment's depth, so nothing overhangs.
const DEPTH_FILL = 0.9;
// Quarter turn that swings the model's spine round to face the reader.
const SPINE_OUT_YAW = Math.PI / 2;
// Lift off the floor, as a fraction of compartment height — clears z-fighting.
const FLOOR_INSET = 0.012;
// How far a book's face sits back from the open front, as a fraction of depth.
const FRONT_INSET = 0.15;
// Clear space at each end of a row, as a fraction of shelf width.
const SIDE_MARGIN = 0.04;
// Gap between neighbouring books, as a fraction of one book's width.
const BOOK_GAP = 0.08;
// Guard against a pathological shelf trying to build thousands of clones. This
// bounds how many books are *drawn*, not how many slots a shelf has — capping
// the slots left the columns stopping short of the shelf's right-hand end, so
// books could only be put down across part of the row.
const MAX_BOOKS_DRAWN = 120;

// Camera framing: fit the shelf width, with a little air around it.
const CAMERA_FOV = 50;
const FRAME_MARGIN = 1.12;

// How far a pointer must travel before a press counts as dragging a book rather
// than clicking one.
const DRAG_THRESHOLD_PX = 5;

/* ---- Loading ---- */

function Loading() {
  return (
    <Html center>
      <div style={{ color: "#ffe8c0", fontFamily: "system-ui", fontSize: 14 }}>
        Loading…
      </div>
    </Html>
  );
}

/* ---- Book measurements — the model is identical for every book ---- */

type BookMetrics = {
  size: THREE.Vector3;
  centre: THREE.Vector3;
  bottom: number;
};

function useBookMetrics(): BookMetrics {
  const { scene } = useGLTF(BOOK_MODEL_URL);
  return useMemo(() => {
    const body = measureBookBody(scene.clone(true));
    return {
      size: body.getSize(new THREE.Vector3()),
      centre: body.getCenter(new THREE.Vector3()),
      bottom: body.min.y,
    };
  }, [scene]);
}

/**
 * Where a row's books sit and how big they are.
 *
 * Books stand spine-out, shelved the way they would be in a library, so the
 * cover runs front-to-back into the compartment. That makes depth the binding
 * constraint rather than height: a book sized to fill the opening would be
 * deeper than the shelf and hang out over the edge, so take whichever of the two
 * limits is tighter.
 */
function shelfLayout(bounds: Bounds, book: BookMetrics) {
  const byHeight = (bounds.size.y * BOOK_FILL) / Math.max(book.size.y, 1e-6);
  const byDepth = (bounds.size.z * DEPTH_FILL) / Math.max(book.size.x, 1e-6);
  const scale = Math.min(byHeight, byDepth);
  const depth = book.size.x * scale;

  // Sit the spines near the opening, but never so far forward that the book's
  // back pushes out through the back panel — turned spine-out it runs nearly the
  // full depth of the compartment, so there is little room to give.
  const nearFront = bounds.box.max.z - depth / 2 - bounds.size.z * FRONT_INSET;
  const againstBack = bounds.box.min.z + depth / 2;

  return {
    scale,
    // Turned spine-out, a book takes up its own thickness along the shelf.
    width: book.size.z * scale,
    restY: bounds.box.min.y + bounds.size.y * FLOOR_INSET,
    restZ: Math.max(nearFront, againstBack),
  };
}

/** Where each book in a row stands, and how many of them fit. */
function rowSlots(bounds: Bounds, book: BookMetrics, count: number) {
  const { scale, width, restY, restZ } = shelfLayout(bounds, book);
  const span = bounds.size.x * (1 - SIDE_MARGIN * 2);
  if (!(width > 1e-6) || !(scale > 0) || span < width) {
    return { scale, width, gap: 0, firstX: 0, restY, restZ, capacity: 0, n: 0 };
  }

  // As many slots as the shelf genuinely holds, right out to its end. The old
  // layout instead squeezed every book in by shrinking them all, so one crowded
  // row silently changed the size of its books.
  const gap = width * BOOK_GAP;
  const capacity = Math.max(1, Math.floor((span + gap) / (width + gap)));

  // Stacked in from the left against a constant gap, the way books actually sit
  // on a shelf — a half-full row trails off into space rather than floating its
  // few books out in the middle.
  const firstX = bounds.center.x - span / 2 + width / 2;

  return {
    scale,
    width,
    gap,
    firstX,
    restY,
    restZ,
    capacity,
    n: Math.min(count, capacity),
  };
}

/** How many books one shelf holds — used to deal the reading order into rows. */
export function rowCapacity(bounds: Bounds, book: BookMetrics) {
  return rowSlots(bounds, book, 0).capacity;
}

/**
 * Anisotropy asked of every texture. 16 is the ceiling on essentially all
 * current hardware and is clamped down to whatever the card allows.
 */
const MAX_ANISOTROPY = 16;

/* ---- Shelf mesh ---- */

function ShelfMesh({
  url,
  onBounds,
}: {
  url: string;
  onBounds?: (b: Bounds) => void;
}) {
  const { scene } = useGLTF(url);
  const boundsRef = useRef<Bounds | null>(null);

  const shelf = useMemo(() => {
    const s = scene.clone(true);
    s.traverse((o: any) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m: any) => {
        if (!m) return;
        m.side = THREE.DoubleSide;
        // Wood grain runs away from the eye at a sharp angle; without this it
        // turns to mush along the shelf.
        for (const key of ["map", "normalMap", "roughnessMap"]) {
          const tex = m[key];
          if (tex) {
            tex.anisotropy = MAX_ANISOTROPY;
            tex.needsUpdate = true;
          }
        }
        m.needsUpdate = true;
      });
    });

    s.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(s);
    let size = box.getSize(new THREE.Vector3());
    if (size.z > size.x) s.rotation.y = Math.PI / 2;

    s.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(s);
    s.position.sub(box.getCenter(new THREE.Vector3()));
    s.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(s);
    s.position.y -= box.min.y;

    s.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(s);
    size = box.getSize(new THREE.Vector3());
    s.scale.setScalar(12 / Math.max(size.x, 1e-6));

    s.updateMatrixWorld(true);
    const fb = new THREE.Box3().setFromObject(s);
    boundsRef.current = {
      box: fb,
      size: fb.getSize(new THREE.Vector3()),
      center: fb.getCenter(new THREE.Vector3()),
    };

    return s;
  }, [scene]);

  useEffect(() => {
    if (boundsRef.current) onBounds?.(boundsRef.current);
  }, [shelf, onBounds]);

  return <primitive object={shelf} />;
}

/* ---- Cover textures, shared by every row ----
 * Keyed by URL, not by book id, and only ever holding a settled result: a
 * Texture, or null once the fetch has failed. Keying by id and parking a null
 * in the cache to mean "loading" made a rebuilt row read that null as "missing"
 * and skip the book forever, while the in-flight load dressed a clone that had
 * already been thrown away. */
const coverCache = new Map<string, THREE.Texture | null>();
const coverLoads = new Map<string, Promise<THREE.Texture | null>>();

function loadCover(
  loader: THREE.TextureLoader,
  url: string
): Promise<THREE.Texture | null> {
  let pending = coverLoads.get(url);
  if (!pending) {
    pending = new Promise<THREE.Texture | null>((resolve) => {
      loader.load(
        url,
        (tex) => { coverCache.set(url, tex); resolve(tex); },
        undefined,
        () => {
          coverCache.set(url, null);
          console.warn(`[shelf] cover failed to load: ${url}`);
          resolve(null);
        }
      );
    });
    coverLoads.set(url, pending);
  }
  return pending;
}

/* ---- Books — standing face-out on the shelf floor ---- */

function ShelfBooks({
  books,
  bounds,
  shelfH,
  perRow,
  editable = false,
  onMove,
  onDuplicate,
  onRemove,
}: {
  books: BookData[];
  bounds: Bounds;
  shelfH: number;
  perRow: number;
  editable?: boolean;
  onMove?: (from: number, to: number) => void;
  onDuplicate?: (index: number) => void;
  onRemove?: (index: number) => void;
}) {
  const { scene: baseScene } = useGLTF(BOOK_MODEL_URL);
  const book = useBookMetrics();
  const { gl, camera, invalidate } = useThree();
  const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
  const texLoader = useMemo(() => new THREE.TextureLoader(), []);
  const router = useRouter();
  const [hovered, setHovered] = useState<number | null>(null);
  // The controls belong to the book the reader picked, not the one the pointer
  // happens to be over. Hanging them off hover meant they vanished the moment
  // the pointer set off towards them, so they could never be clicked.
  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number; x: number; y: number } | null>(null);
  const dragRef = useRef<{
    from: number;
    to: number;
    moved: boolean;
    startX: number;
    startY: number;
  } | null>(null);

  const slots = useMemo(
    () => rowSlots(bounds, book, books.length),
    [bounds, book, books.length]
  );

  // Every book on the bookcase is laid out here rather than a component per
  // shelf, so a book being dragged can cross from one shelf to another instead
  // of being trapped in the row that happens to own it.
  const place = useCallback(
    (slot: number) => {
      const pitch = slots.width + slots.gap;
      const fromTop = perRow > 0 ? Math.floor(slot / perRow) : 0;
      const column = perRow > 0 ? slot % perRow : 0;
      return {
        x: slots.firstX + column * pitch,
        y: (N_ROWS - 1 - fromTop) * shelfH + slots.restY,
        z: slots.restZ,
      };
    },
    [slots, perRow, shelfH]
  );

  /** The slot a book occupies, falling back to reading order for a plain list. */
  const slotOf = useCallback(
    (b: BookData, i: number) => b.slot ?? i,
    []
  );

  const capacity = Math.max(0, perRow * N_ROWS);
  const shown = Math.min(books.length, capacity, MAX_BOOKS_DRAWN);

  const placed = useMemo(() => {
    if (shown === 0 || slots.width <= 1e-6) return [];
    return books.slice(0, shown).map((b, i) => {
      const id = String(b.id ?? `book-${i}`);
      const key = b.itemId ?? `${id}-${i}`;

      const bookRoot = baseScene.clone(true);
      measureBookBody(bookRoot); // hides the same stray geometry on this clone
      bookRoot.traverse((o: any) => {
        if (o.isMesh) o.castShadow = o.receiveShadow = true;
      });
      // Sit the body's bottom centre on the wrapper's origin, so yaw and scale
      // pivot through the book instead of dragging it off its mark. Subtract
      // rather than assign, in case the model root carries its own transform.
      bookRoot.position.x -= book.centre.x;
      bookRoot.position.y -= book.bottom;
      bookRoot.position.z -= book.centre.z;

      const wrapper = new THREE.Group();
      wrapper.add(bookRoot);
      // Quarter turn brings the spine — the model's -X face, the middle band of
      // the jacket — around to meet the reader.
      wrapper.rotation.y = SPINE_OUT_YAW;
      wrapper.scale.setScalar(slots.scale);
      wrapper.updateMatrixWorld(true);

      return { id, key, data: b, wrapper, bookRoot };
    });
  }, [books, shown, slots, baseScene, book]);

  useEffect(() => {
    // Re-runs whenever the shelf is rebuilt, dressing whichever clones are
    // current — a cover that arrives late still lands on a live book.
    placed.forEach((p) => {
      if (p.id.startsWith("fallback-")) return;
      const url = coverUrlFor({ id: p.id, cover_path: p.data.cover_path });
      if (!url) return;

      const settled = coverCache.get(url);
      if (settled) {
        applyCoverTexture(p.bookRoot, settled, maxAnisotropy);
        invalidate();
        return;
      }
      if (settled === null) {
        applyBlankCover(p.bookRoot, p.id);
        invalidate();
        return;
      }

      loadCover(texLoader, url).then((tex) => {
        if (tex) applyCoverTexture(p.bookRoot, tex, maxAnisotropy);
        else applyBlankCover(p.bookRoot, p.id);
        invalidate();
      });
    });
  }, [placed, texLoader, maxAnisotropy, invalidate]);

  // Slide the shelf apart around whatever is being dragged. Positions are
  // written straight onto the wrappers so a drag doesn't rebuild every clone.
  useEffect(() => {
    const lift = slots.width * 0.5;
    placed.forEach((p, i) => {
      const home = place(slotOf(p.data, i));
      const held = drag?.from === i;
      p.wrapper.position.set(
        held ? drag.x : home.x,
        held ? drag.y + lift : home.y,
        home.z
      );
      p.wrapper.updateMatrixWorld(true);
    });
    invalidate();
  }, [placed, drag, place, slotOf, slots.width, invalidate]);

  /** Where a pointer sits on the face of the bookcase, in world units. */
  const pointerOnShelf = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const rect = gl.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -(((clientY - rect.top) / rect.height) * 2 - 1)
      );
      const caster = new THREE.Raycaster();
      caster.setFromCamera(ndc, camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -slots.restZ);
      const hit = new THREE.Vector3();
      return caster.ray.intersectPlane(plane, hit) ? { x: hit.x, y: hit.y } : null;
    },
    [camera, gl, slots.restZ]
  );

  /**
   * The slot nearest a point on the bookcase, on any shelf.
   *
   * Deliberately not clamped to the number of books: an empty slot is a real
   * destination, which is what lets a book be moved down to a shelf that has
   * nothing on it yet.
   */
  const slotAt = useCallback(
    (x: number, y: number) => {
      if (perRow <= 0) return 0;
      const pitch = slots.width + slots.gap;
      const worldRow = Math.round((y - slots.restY) / Math.max(shelfH, 1e-6));
      const fromTop = Math.max(0, Math.min(N_ROWS - 1, N_ROWS - 1 - worldRow));
      const column = Math.max(0, Math.min(perRow - 1, Math.round((x - slots.firstX) / pitch)));
      return fromTop * perRow + column;
    },
    [perRow, slots, shelfH]
  );

  // Keyed on whether a drag is running, not on the drag itself: including the
  // live pointer position would tear down and re-attach these listeners on
  // every single move.
  const dragging = drag !== null;

  useEffect(() => {
    if (!dragging) return;

    const move = (ev: PointerEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      // Pressing a pointer down emits a move with it, so a plain click would
      // otherwise register as a drag and be swallowed. Nothing counts until the
      // pointer has actually travelled.
      const travelled = Math.hypot(ev.clientX - cur.startX, ev.clientY - cur.startY);
      if (!cur.moved && travelled < DRAG_THRESHOLD_PX) return;

      const at = pointerOnShelf(ev.clientX, ev.clientY);
      if (!at) return;
      const to = slotAt(at.x, at.y);
      cur.to = to;
      cur.moved = true;
      // Hold the book on the bookcase so it can't be dragged off into space.
      const pitch = slots.width + slots.gap;
      const x = Math.max(
        slots.firstX,
        Math.min(slots.firstX + (Math.max(perRow, 1) - 1) * pitch, at.x)
      );
      const y = Math.max(
        slots.restY,
        Math.min((N_ROWS - 1) * shelfH + slots.restY, at.y)
      );
      setDrag((d) => (d ? { ...d, to, x, y } : d));
    };

    const finish = () => {
      const cur = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!cur) return;

      // Selecting is settled here rather than in an onClick handler: taking the
      // pointer down on a book has to stop propagation so the press starts a
      // drag, and that stops react-three-fiber ever synthesising the click.
      if (!cur.moved) {
        setSelected((s) => (s === cur.from ? null : cur.from));
        return;
      }
      if (cur.to !== cur.from) onMove?.(cur.from, cur.to);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [dragging, slots, perRow, shelfH, pointerOnShelf, slotAt, onMove]);

  useEffect(() => {
    const cursor = drag ? "grabbing" : hovered !== null ? (editable ? "grab" : "pointer") : "default";
    document.body.style.cursor = cursor;
    return () => { document.body.style.cursor = "default"; };
  }, [hovered, drag, editable]);

  // A shelf that shrinks under a selection shouldn't leave it pointing at a
  // book that is no longer there.
  const pick = editable && selected !== null && selected < placed.length ? selected : null;
  const active = pick !== null ? placed[pick] : undefined;
  const activeAt = active ? place(slotOf(active.data, pick!)) : null;

  return (
    <group>
      {placed.map((p, i) => (
        <group
          key={p.key}
          onPointerOver={(e) => { e.stopPropagation(); setHovered(i); }}
          onPointerOut={(e) => { e.stopPropagation(); setHovered((h) => (h === i ? null : h)); }}
          onPointerDown={(e) => {
            if (!editable || !onMove) return;
            e.stopPropagation();
            const at = pointerOnShelf(e.clientX, e.clientY);
            if (!at) return;
            dragRef.current = {
              from: i,
              to: i,
              moved: false,
              startX: e.clientX,
              startY: e.clientY,
            };
            setDrag({ from: i, to: i, x: at.x, y: at.y });
          }}
          onClick={(e) => {
            e.stopPropagation();
            // While arranging, pointer-up above does the picking; a click here
            // would only ever mean "open this book to read".
            if (editable) return;
            router.push(`/book/${encodeURIComponent(p.data.id)}`);
          }}
        >
          <primitive object={p.wrapper} />
        </group>
      ))}

      {editable && active && activeAt && !drag && (
        <Html
          position={[activeAt.x, activeAt.y + book.size.y * slots.scale, activeAt.z]}
          center
          distanceFactor={8}
          zIndexRange={[20, 10]}
        >
          <div style={{ display: "flex", gap: 6, padding: "10px 4px" }}>
            <button
              title={`Duplicate ${active.data.title ?? "book"}`}
              onClick={() => onDuplicate?.(pick!)}
              style={shelfButton}
            >
              Duplicate
            </button>
            <button
              title={`Remove ${active.data.title ?? "book"} from your shelf`}
              onClick={() => { setSelected(null); onRemove?.(pick!); }}
              style={{ ...shelfButton, color: "#ffd0c0" }}
            >
              Remove
            </button>
          </div>
        </Html>
      )}
    </group>
  );
}

const shelfButton: React.CSSProperties = {
  background: "rgba(28,18,8,0.92)",
  border: "1px solid rgba(255,208,140,0.4)",
  borderRadius: 999,
  color: "#ffe8c0",
  cursor: "pointer",
  fontFamily: "system-ui",
  fontSize: 11,
  letterSpacing: 0.4,
  padding: "5px 11px",
  whiteSpace: "nowrap",
};

/* ---- Camera: fits full width, scrolls vertically ---- */

function LibraryCamera({
  shelfBounds,
  cameraY,
  onMaxScrollY,
}: {
  shelfBounds: Bounds | null;
  cameraY: number;
  onMaxScrollY: (v: number) => void;
}) {
  const { camera, size: vp } = useThree();
  const onMaxScrollYRef = useRef(onMaxScrollY);
  onMaxScrollYRef.current = onMaxScrollY;

  // Framing and placement live in one effect on purpose. Split across two, the
  // one that computes the distance and the one that moves the camera had
  // different dependencies, so bounds could arrive without the camera ever
  // being placed — it sat at the default (0, 0, 5) and the shelf's outer books
  // fell outside the frame.
  useEffect(() => {
    if (!shelfBounds || !vp.width || !vp.height) return;
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = vp.width / vp.height;
    const fovRad = (CAMERA_FOV * Math.PI) / 180;
    const halfFov = Math.tan(fovRad / 2);
    // Pull back far enough that the whole shelf width fits, plus a margin so
    // the end books aren't flush against the edge of the frame.
    const dist = (shelfBounds.size.x * FRAME_MARGIN) / 2 / (aspect * halfFov);
    if (!Number.isFinite(dist) || dist <= 0) return;

    const visibleH = dist * 2 * halfFov;
    const y = visibleH / 2 + cameraY + shelfBounds.box.min.y;
    const x = shelfBounds.center.x;

    cam.fov = CAMERA_FOV;
    // The depth buffer's precision is spent across near..far, and it was set to
    // 0.1..400 — a 4000:1 range for a shelf that occupies a few units around the
    // camera. That left too little resolution to separate the jacket from the
    // binding trim a few hundredths of a unit behind it, so the two fought and
    // the fight showed up along the triangle edges. Bracketing the scene tightly
    // gives that range back.
    cam.near = Math.max(0.5, dist * 0.5);
    cam.far = dist + N_ROWS * shelfBounds.size.y + 20;
    cam.updateProjectionMatrix();
    cam.position.set(x, y, shelfBounds.center.z + dist);
    cam.lookAt(x, y, shelfBounds.center.z);

    onMaxScrollYRef.current(
      Math.max(0, N_ROWS * shelfBounds.size.y - visibleH)
    );
  }, [shelfBounds, camera, vp.width, vp.height, cameraY]);

  return null;
}

/* ---- Stacked rows — grouped by category ---- */

function LibraryRows({
  books,
  onBounds,
  onShelfH,
  editable,
  onMove,
  onDuplicate,
  onRemove,
}: {
  books: BookData[];
  onBounds: (b: Bounds) => void;
  onShelfH: (h: number) => void;
  editable?: boolean;
  onMove?: (from: number, to: number) => void;
  onDuplicate?: (index: number) => void;
  onRemove?: (index: number) => void;
}) {
  const [shelfBounds, setShelfBounds] = useState<Bounds | null>(null);
  const boundsSet = useRef(false);
  const book = useBookMetrics();

  // One compartment per row, stacked flush, so the shelves stay contiguous.
  const shelfH = shelfBounds?.size.y ?? 0;

  const handleBounds = useCallback(
    (b: Bounds) => {
      if (!boundsSet.current) {
        boundsSet.current = true;
        setShelfBounds(b);
        onBounds(b);
        onShelfH(b.size.y);
      }
    },
    [onBounds, onShelfH]
  );

  // SHELF_CATEGORIES[0] is the "top" section (highest rows).
  // In world-space, rows stack bottom→top, so we reverse to assign rows.
  const sectionsBottomToTop = useMemo(() => [...SHELF_CATEGORIES].reverse(), []);

  // Books are dealt out in the order the reader put them in: along the top shelf
  // left to right, then down to the next, the way you fill a bookcase. Position
  // 0 is therefore the first book you see. Rows are indexed bottom-up in world
  // space, so the top shelf is the last one.
  const perRow = shelfBounds ? rowCapacity(shelfBounds, book) : 0;

  const rows = useMemo(
    () => Array.from({ length: N_ROWS }, (_, idx) => ({ idx, isBoundsRow: idx === 0 })),
    []
  );

  // Row start index for each section (bottom-to-top order)
  const sectionStarts = useMemo(
    () =>
      sectionsBottomToTop.map((_, i) =>
        sectionsBottomToTop
          .slice(0, i)
          .reduce((rows, sec) => rows + sec.rows, 0)
      ),
    [sectionsBottomToTop]
  );

  return (
    <>
      {rows.map(({ idx, isBoundsRow }) => (
        <group key={idx} position={[0, idx * shelfH, 0]} frustumCulled={true}>
          <ShelfMesh
            url="/models/shelfv2.glb"
            onBounds={isBoundsRow ? handleBounds : undefined}
          />
        </group>
      ))}

      {/* Every book on the bookcase, placed by its position in the reading
          order. Kept outside the row groups so a book can be dragged from one
          shelf to another instead of being trapped in the row that owns it. */}
      {shelfBounds && perRow > 0 && books.length > 0 && (
        <ShelfBooks
          books={books}
          bounds={shelfBounds}
          shelfH={shelfH}
          perRow={perRow}
          editable={editable}
          onMove={onMove}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
        />
      )}

      {/* Category labels — centered on the first shelf of each section */}
      {shelfBounds && shelfH > 0 &&
        sectionsBottomToTop.map((sec, si) => {
          // Y = center of the FIRST shelf row in this section
          const labelY = (sectionStarts[si] + 0.5) * shelfH;
          return (
            <Html
              key={`sec-label-${sec.name}`}
              center
              position={[
                shelfBounds.center.x,
                labelY,
                shelfBounds.box.max.z + 0.25,
              ]}
              style={{
                color: "rgba(255, 225, 170, 0.95)",
                fontSize: "10px",
                fontWeight: "700",
                letterSpacing: "4px",
                textTransform: "uppercase" as const,
                fontFamily: "system-ui",
                whiteSpace: "nowrap" as const,
                pointerEvents: "none" as const,
                userSelect: "none" as const,
                textShadow: [
                  "0 0 6px rgba(255,190,80,0.95)",
                  "0 0 14px rgba(255,160,40,0.7)",
                  "0 0 28px rgba(255,140,20,0.4)",
                  "0 1px 3px rgba(0,0,0,0.95)",
                ].join(", "),
              }}
            >
              {sec.name}
            </Html>
          );
        })}
    </>
  );
}

/* ---- Invalidate on scroll ---- */

function Invalidator({ cameraY }: { cameraY: number }) {
  const { invalidate } = useThree();
  useEffect(() => { invalidate(); }, [cameraY, invalidate]);
  return null;
}

/* ---- Scene ---- */

function LibraryScene({
  books,
  cameraY,
  onMaxScrollY,
  onShelfH,
  editable,
  onMove,
  onDuplicate,
  onRemove,
}: {
  books: BookData[];
  cameraY: number;
  onMaxScrollY: (v: number) => void;
  onShelfH: (h: number) => void;
  editable?: boolean;
  onMove?: (from: number, to: number) => void;
  onDuplicate?: (index: number) => void;
  onRemove?: (index: number) => void;
}) {
  const [shelfBounds, setShelfBounds] = useState<Bounds | null>(null);

  const handleBounds = useCallback((b: Bounds) => {
    setShelfBounds(b);
  }, []);

  return (
    <>
      <color attach="background" args={[BG]} />
      <Invalidator cameraY={cameraY} />
      <LibraryCamera shelfBounds={shelfBounds} cameraY={cameraY} onMaxScrollY={onMaxScrollY} />

      <ambientLight intensity={0.45} color="#ffd4a0" />
      <directionalLight
        position={[0, 8, 18]}
        intensity={2.2}
        color="#ffe8c8"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={16}
        shadow-camera-bottom={-2}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
      />
      <directionalLight position={[-8, 6, 12]} intensity={0.6} color="#ffc87a" />
      <directionalLight position={[ 8, 6, 12]} intensity={0.6} color="#ffc87a" />

      <Suspense fallback={<Loading />}>
        <Environment preset="apartment" background={false} />
        <LibraryRows
          books={books}
          onBounds={handleBounds}
          onShelfH={onShelfH}
          editable={editable}
          onMove={onMove}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
        />
      </Suspense>
    </>
  );
}

/* ---- Thin scrollbar-style section indicator ---- */

function ScrollIndicator({
  sections,
  activeIdx,
  onJump,
}: {
  sections: { name: string; targetCameraY: number }[];
  activeIdx: number;
  onJump: (y: number) => void;
}) {
  if (!sections.length) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 6,
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
      }}
    >
      {sections.map((sec, i) => (
        <div
          key={sec.name}
          title={sec.name}
          onClick={() => onJump(sec.targetCameraY)}
          style={{
            flex: 1,
            background:
              i === activeIdx
                ? "rgba(255, 195, 90, 0.80)"
                : "rgba(255, 195, 90, 0.10)",
            cursor: "pointer",
            transition: "background 0.3s ease",
          }}
        />
      ))}
    </div>
  );
}

/* ---- Canvas ---- */

export default function ShelfScene({
  books,
  editable = false,
  onMove,
  onDuplicate,
  onRemove,
}: {
  books: BookData[];
  /** Lets books be dragged along the shelf, duplicated and taken off. */
  editable?: boolean;
  onMove?: (from: number, to: number) => void;
  onDuplicate?: (index: number) => void;
  onRemove?: (index: number) => void;
}) {
  const [maxScrollY, setMaxScrollY] = useState(0);
  const [cameraY, setCameraY] = useState(0);
  const [shelfH, setShelfH] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const maxScrollYRef = useRef(0);
  const openedAtTop = useRef(false);

  // Open on the top shelf, where the reading order starts. The scroll extent
  // isn't known until the shelf has been measured, so the first real value has
  // to move the camera rather than just clamp it — clamping alone pinned the
  // view to the bottom of the bookcase for good.
  useEffect(() => {
    maxScrollYRef.current = maxScrollY;
    // The "have we opened yet" flag is flipped here rather than inside the
    // updater: React calls updaters twice in development, and the second call
    // would see the flag already set and clamp the view straight back down.
    if (!openedAtTop.current && maxScrollY > 0) {
      openedAtTop.current = true;
      setCameraY(maxScrollY);
      return;
    }
    setCameraY((prev) => Math.min(prev, maxScrollY));
  }, [maxScrollY]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setCameraY((prev) => {
        const next = prev - e.deltaY * 0.02;
        return Math.max(0, Math.min(maxScrollYRef.current, next));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Compute jump targets for each category section
  const sectionJumps = useMemo(() => {
    if (!shelfH || !maxScrollY) return [];
    let rowsAbove = 0;
    return SHELF_CATEGORIES.map((cat) => {
      const targetCameraY = Math.max(0, maxScrollY - rowsAbove * shelfH);
      rowsAbove += cat.rows;
      return { name: cat.name, targetCameraY };
    });
  }, [shelfH, maxScrollY]);

  // Which section is the camera closest to
  const activeIdx = useMemo(() => {
    if (!sectionJumps.length) return 0;
    return sectionJumps.reduce(
      (best, sec, i) =>
        Math.abs(cameraY - sec.targetCameraY) <
        Math.abs(cameraY - sectionJumps[best].targetCameraY)
          ? i
          : best,
      0
    );
  }, [cameraY, sectionJumps]);

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0 }}>
      <Canvas
        shadows
        // Capped at 1.5 the scene was drawn below the screen's resolution and
        // upscaled — on a 2x display only 56% of its pixels were real, which is
        // what made the spines look pixelated while the same model renders
        // clean in Blender. The scene only redraws on demand, so the extra
        // pixels cost little.
        dpr={[1, 2]}
        style={{ position: "absolute", inset: 0 }}
        gl={{
          antialias: true,
          outputColorSpace: THREE.SRGBColorSpace,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
          powerPreference: "high-performance",
        }}
        frameloop="demand"
      >
        <LibraryScene
          books={books}
          cameraY={cameraY}
          onMaxScrollY={setMaxScrollY}
          onShelfH={setShelfH}
          editable={editable}
          onMove={onMove}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
        />
      </Canvas>

      <ScrollIndicator
        sections={sectionJumps}
        activeIdx={activeIdx}
        onJump={setCameraY}
      />
    </div>
  );
}

useGLTF.preload("/models/shelfv2.glb");
useGLTF.preload(BOOK_MODEL_URL);
