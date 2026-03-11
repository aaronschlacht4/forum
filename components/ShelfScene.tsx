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
const SUPABASE_COVERS = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/covers`;

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

/* ---- Geometry helpers ---- */

function normalizeToOriginBottom(obj: THREE.Object3D) {
  obj.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(obj);
  obj.position.sub(box.getCenter(new THREE.Vector3()));
  obj.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(obj);
  obj.position.y -= box.min.y;
  obj.updateMatrixWorld(true);
}

function applyCoverTexture(
  bookRoot: THREE.Object3D,
  tex: THREE.Texture,
  maxAnisotropy: number
) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  bookRoot.traverse((o: any) => {
    if (!o.isMesh) return;
    const mat = (
      (o.material as THREE.MeshStandardMaterial)?.clone?.() ??
      new THREE.MeshStandardMaterial()
    ) as THREE.MeshStandardMaterial;
    mat.map = tex;
    mat.color.set(0xffffff);
    mat.roughness = 0.75;
    mat.metalness = 0.05;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -4;
    mat.side = THREE.FrontSide;
    mat.depthWrite = mat.depthTest = true;
    mat.needsUpdate = true;
    o.material = mat;
  });
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

/* ---- Books — packed right-to-left ---- */

function ShelfBooks({ books, bounds }: { books: BookData[]; bounds: Bounds }) {
  const { scene: baseScene } = useGLTF("/models/book.glb");
  const { gl } = useThree();
  const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
  const texLoader = useMemo(() => new THREE.TextureLoader(), []);
  const texCache = useRef<Record<string, THREE.Texture | null | undefined>>({});
  const router = useRouter();
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "default";
    return () => { document.body.style.cursor = "default"; };
  }, [hovered]);

  const placed = useMemo(() => {
    if (!books.length) return [];
    const { box, size, center } = bounds;
    const margin = size.x * 0.08;
    const endX   = box.max.x - margin;
    const startX = box.min.x + margin;
    const span   = endX - startX;
    const floorY = box.min.y + size.y * 0.02;
    const z      = center.z;

    const proto = baseScene.clone(true);
    normalizeToOriginBottom(proto);
    proto.updateMatrixWorld(true);
    const protoH = new THREE.Box3()
      .setFromObject(proto)
      .getSize(new THREE.Vector3()).y;
    const baseScale = (size.y * 1.05) / Math.max(protoH, 1e-6);
    const n = Math.min(books.length, 40);

    const built = books.slice(0, n).map((b, i) => {
      const id = String(b.id ?? `book-${i}`);
      const wrapper  = new THREE.Group();
      wrapper.rotation.y = 5;
      wrapper.rotation.x = Math.PI;
      const bookRoot = baseScene.clone(true);
      bookRoot.traverse((o: any) => {
        if (o.isMesh) o.castShadow = o.receiveShadow = true;
      });
      normalizeToOriginBottom(bookRoot);
      wrapper.add(bookRoot);
      wrapper.scale.setScalar(baseScale * 0.8);
      wrapper.updateMatrixWorld(true);
      const width = new THREE.Box3()
        .setFromObject(wrapper)
        .getSize(new THREE.Vector3()).x;
      return { id, data: b, wrapper, bookRoot, width };
    });

    const gap = size.x * 0.01;
    const rawTotal = built.reduce((s, b) => s + b.width, 0) + (built.length - 1) * gap;
    const fit = rawTotal > span ? span / rawTotal : 1;
    if (fit < 1) {
      built.forEach((b) => {
        b.wrapper.scale.multiplyScalar(fit);
        b.wrapper.updateMatrixWorld(true);
        b.width = new THREE.Box3()
          .setFromObject(b.wrapper)
          .getSize(new THREE.Vector3()).x;
      });
    }

    let x = endX;
    built.forEach((b) => {
      x -= b.width;
      b.wrapper.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(b.wrapper);
      b.wrapper.position.y += floorY - bb.min.y + size.y * 0.002;
      b.wrapper.position.z  = z;
      b.wrapper.position.x  = x + b.width / 2;
      x -= gap;
    });

    return built;
  }, [books, bounds, baseScene]);

  useEffect(() => {
    placed.forEach((p) => {
      if (p.id.startsWith("fallback-")) return;
      const url = `${SUPABASE_COVERS}/${encodeURIComponent(
        p.data.cover_path ?? `${p.id}.jpg`
      )}`;
      if (texCache.current[p.id] !== undefined) {
        const t = texCache.current[p.id];
        if (t) applyCoverTexture(p.bookRoot, t, maxAnisotropy);
        return;
      }
      texCache.current[p.id] = null;
      texLoader.load(url, (t) => {
        texCache.current[p.id] = t;
        applyCoverTexture(p.bookRoot, t, maxAnisotropy);
      }, undefined, () => { texCache.current[p.id] = null; });
    });
  }, [placed, texLoader, maxAnisotropy]);

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
  const distRef = useRef(0);
  const baseYRef = useRef(0);
  const onMaxScrollYRef = useRef(onMaxScrollY);
  onMaxScrollYRef.current = onMaxScrollY;

  useEffect(() => {
    if (!shelfBounds) return;
    const cam = camera as THREE.PerspectiveCamera;
    const totalW = shelfBounds.size.x;
    const shelfH = shelfBounds.size.y;
    const aspect = vp.width / vp.height;
    const fovDeg = 50;
    const fovRad = (fovDeg * Math.PI) / 180;
    const dist = (totalW / 2) / (aspect * Math.tan(fovRad / 2));
    const visibleH = dist * 2 * Math.tan(fovRad / 2);
    const baseY = visibleH / 2;
    distRef.current = dist;
    baseYRef.current = baseY;
    cam.fov = fovDeg;
    cam.near = 0.1;
    cam.far = 400;
    cam.updateProjectionMatrix();
    onMaxScrollYRef.current(Math.max(0, N_ROWS * shelfH - visibleH));
  }, [shelfBounds, camera, vp.width, vp.height]);

  useEffect(() => {
    if (!distRef.current) return;
    const cam = camera as THREE.PerspectiveCamera;
    const y = baseYRef.current + cameraY;
    cam.position.set(0, y, distRef.current);
    cam.lookAt(0, y, 0);
  }, [camera, cameraY]);

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

  const shelfH = shelfBounds?.size.y ?? 0;

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
useGLTF.preload("/models/book.glb");
