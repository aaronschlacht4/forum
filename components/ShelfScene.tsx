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
// Guard against a pathological row trying to build thousands of clones.
const MAX_BOOKS_PER_ROW = 24;

// Camera framing: fit the shelf width, with a little air around it.
const CAMERA_FOV = 50;
const FRAME_MARGIN = 1.12;

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
        if (m) {
          m.side = THREE.DoubleSide;
          m.needsUpdate = true;
        }
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

function ShelfBooks({ books, bounds }: { books: BookData[]; bounds: Bounds }) {
  const { scene: baseScene } = useGLTF(BOOK_MODEL_URL);
  const book = useBookMetrics();
  const { gl, invalidate } = useThree();
  const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
  const texLoader = useMemo(() => new THREE.TextureLoader(), []);
  const router = useRouter();
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "default";
    return () => { document.body.style.cursor = "default"; };
  }, [hovered]);

  const placed = useMemo(() => {
    if (!books.length) return [];

    const { scale, width, restY, restZ } = shelfLayout(bounds, book);
    const span = bounds.size.x * (1 - SIDE_MARGIN * 2);
    if (!(width > 1e-6) || !(scale > 0) || span < width) return [];

    // Only place what genuinely fits. The old layout squeezed every book in by
    // shrinking them all, so one crowded row silently changed the size of its
    // books; overflow now just stays off the shelf.
    const gap = width * BOOK_GAP;
    const capacity = Math.max(1, Math.floor((span + gap) / (width + gap)));
    const n = Math.min(books.length, capacity, MAX_BOOKS_PER_ROW);

    // Stacked in from the left against a constant gap, the way books actually
    // sit on a shelf — a half-full row trails off into space rather than
    // floating its few books out in the middle.
    const firstX = bounds.center.x - span / 2 + width / 2;

    return books.slice(0, n).map((b, i) => {
      const id = String(b.id ?? `book-${i}`);

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
      wrapper.scale.setScalar(scale);
      wrapper.position.set(firstX + i * (width + gap), restY, restZ);
      wrapper.updateMatrixWorld(true);

      return { id, data: b, wrapper, bookRoot };
    });
  }, [books, bounds, baseScene, book]);

  useEffect(() => {
    // Re-runs whenever the row is rebuilt, dressing whichever clones are
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

  return (
    <group>
      {placed.map((p) => (
        <group
          key={p.id}
          onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
          onPointerOut={(e)  => { e.stopPropagation(); setHovered(false); }}
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/book/${encodeURIComponent(p.data.id)}`);
          }}
        >
          <primitive object={p.wrapper} />
        </group>
      ))}
    </group>
  );
}

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
    cam.near = 0.1;
    cam.far = 400;
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
}: {
  books: BookData[];
  onBounds: (b: Bounds) => void;
  onShelfH: (h: number) => void;
}) {
  const [shelfBounds, setShelfBounds] = useState<Bounds | null>(null);
  const boundsSet = useRef(false);

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

  // Distribute books proportionally to row count per section
  const sectionSlices = useMemo(() => {
    let offset = 0;
    return sectionsBottomToTop.map((sec) => {
      const count = Math.round(books.length * (sec.rows / N_ROWS));
      const slice = books.slice(offset, offset + count);
      offset += count;
      return slice;
    });
  }, [books, sectionsBottomToTop]);

  // Build flat row list with section metadata
  const rows = useMemo(() => {
    let rowIdx = 0;
    return sectionsBottomToTop.flatMap((sec, si) => {
      const secBooks = sectionSlices[si];
      const perRow = Math.ceil(secBooks.length / Math.max(sec.rows, 1));
      return Array.from({ length: sec.rows }, (_, ri) => {
        const idx = rowIdx++;
        return {
          idx,
          isBoundsRow: idx === 0,
          books: secBooks.slice(ri * perRow, (ri + 1) * perRow),
        };
      });
    });
  }, [sectionsBottomToTop, sectionSlices]);

  // Row start index for each section (bottom-to-top order)
  const sectionStarts = useMemo(() => {
    let offset = 0;
    return sectionsBottomToTop.map((sec) => {
      const start = offset;
      offset += sec.rows;
      return start;
    });
  }, [sectionsBottomToTop]);

  return (
    <>
      {rows.map(({ idx, isBoundsRow, books: rowBooks }) => (
        <group key={idx} position={[0, idx * shelfH, 0]} frustumCulled={true}>
          <ShelfMesh
            url="/models/shelfv2.glb"
            onBounds={isBoundsRow ? handleBounds : undefined}
          />
          {shelfBounds && (
            <ShelfBooks books={rowBooks} bounds={shelfBounds} />
          )}
        </group>
      ))}

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
}: {
  books: BookData[];
  cameraY: number;
  onMaxScrollY: (v: number) => void;
  onShelfH: (h: number) => void;
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
        <LibraryRows books={books} onBounds={handleBounds} onShelfH={onShelfH} />
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

export default function ShelfScene({ books }: { books: BookData[] }) {
  const [maxScrollY, setMaxScrollY] = useState(0);
  const [cameraY, setCameraY] = useState(999);
  const [shelfH, setShelfH] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const maxScrollYRef = useRef(0);

  useEffect(() => {
    maxScrollYRef.current = maxScrollY;
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
        dpr={[1, 1.5]}
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
