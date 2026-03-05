"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Html,
  OrbitControls,
  PerspectiveCamera,
  useGLTF,
} from "@react-three/drei";
import * as THREE from "three";

type BookData = {
  id: string;
  title: string;
  author: string;
  spine_path?: string; // filename only e.g. "mobydick.jpg"
  pdf_path?: string;   // filename only e.g. "Melville_MobyDick.pdf"
};

function Loading() {
  return (
    <Html center>
      <div style={{ fontFamily: "system-ui", opacity: 0.8 }}>Loading…</div>
    </Html>
  );
}

function ShelfModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);

  const shelf = useMemo(() => {
    const s = scene.clone(true);
    s.traverse((obj: any) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return s;
  }, [scene]);

  return (
    <primitive object={shelf} position={[0, -0.9, 0]} rotation={[0, 0, 0]} scale={1.5} />
  );
}

/**
 * Bucket: books
 * Folders: covers/ and pdfs/
 * DB stores filename only
 */
function buildSupabasePublicUrl(kind: "covers" | "pdfs", filename?: string) {
  if (!filename) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/books/${kind}/${encodeURIComponent(filename)}`;
}

/**
 * ✅ Critical fix: Some GLBs export a "Spine" mesh whose UVs only occupy a small strip.
 * This function rewrites UVs so the image spans the whole spine face (0..1 range).
 */
function recomputeUVsToFill(geometry: THREE.BufferGeometry) {
  const pos = geometry.attributes.position as THREE.BufferAttribute | undefined;
  if (!pos) return;

  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  if (!bb) return;

  const size = new THREE.Vector3();
  bb.getSize(size);

  // Choose the 2 largest axes for UV mapping (ignore the thinnest axis)
  const axes: Array<{ key: "x" | "y" | "z"; span: number }> = [
    { key: "x" as const, span: size.x },
    { key: "y" as const, span: size.y },
    { key: "z" as const, span: size.z },
  ].sort((a, b) => b.span - a.span);

  const uAxis = axes[0].key; // largest span
  const vAxis = axes[1].key; // second largest span

  const min = bb.min;
  const spanU = Math.max((bb.max as any)[uAxis] - (min as any)[uAxis], 1e-6);
  const spanV = Math.max((bb.max as any)[vAxis] - (min as any)[vAxis], 1e-6);

  const uv = new Float32Array(pos.count * 2);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    const coord: any = { x, y, z };
    const u = (coord[uAxis] - (min as any)[uAxis]) / spanU;
    const v = (coord[vAxis] - (min as any)[vAxis]) / spanV;

    uv[i * 2 + 0] = u;
    uv[i * 2 + 1] = v;
  }

  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.attributes.uv.needsUpdate = true;
}

function BookModel({
  url,
  position,
  rotation,
  spinePath,
}: {
  url: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  spinePath?: string;
}) {
  const { scene } = useGLTF(url);
  const gl = useThree((s) => s.gl);

  const [spineTex, setSpineTex] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let cancelled = false;

    const spineUrl = buildSupabasePublicUrl("covers", spinePath);
    if (!spineUrl) {
      setSpineTex(null);
      return;
    }

    const loader = new THREE.TextureLoader();
    loader.load(
      spineUrl,
      (tex) => {
        if (cancelled) return;

        // ✅ For GLTF meshes, you almost always want this:
        tex.flipY = false;

        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;

        // Reset any accidental atlasing state
        tex.repeat.set(1, 1);
        tex.offset.set(0, 0);

        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());

        tex.needsUpdate = true;
        setSpineTex(tex);
      },
      undefined,
      (err) => {
        console.error("Failed to load spine texture:", spineUrl, err);
        if (!cancelled) setSpineTex(null);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [spinePath, gl.capabilities]);

  const book = useMemo(() => {
    const s = scene.clone(true);

    const meshes: THREE.Mesh[] = [];
    s.traverse((obj: any) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;

        // Clone materials so each book can own its texture
        if (Array.isArray(obj.material)) {
          obj.material = obj.material.map((m: any) => (m ? m.clone() : m));
        } else if (obj.material) {
          obj.material = obj.material.clone();
        }

        meshes.push(obj as THREE.Mesh);
      }
    });

    // Auto-center + auto-scale
    const box = new THREE.Box3().setFromObject(s);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    s.position.sub(center);

    const targetHeight = 1.0;
    const h = Math.max(size.y, 1e-6);
    const autoScale = targetHeight / h;
    s.scale.setScalar(autoScale);

    (s as any).userData.__meshes = meshes;
    return s;
  }, [scene]);

  useEffect(() => {
    if (!book) return;

    const meshes: THREE.Mesh[] = (book as any).userData.__meshes ?? [];
    if (!meshes.length) return;

    // ✅ Your mesh name is "Spine"
    const spineMeshes = meshes.filter((m) => (m.name ?? "").toLowerCase() === "spine");

    if (!spineMeshes.length) {
      console.warn("No mesh named 'Spine' found in book.glb. Mesh names:", meshes.map(m => m.name));
      return;
    }

    spineMeshes.forEach((m) => {
      // ✅ Force UVs to span the whole mesh so the JPG fills the spine
      recomputeUVsToFill(m.geometry as THREE.BufferGeometry);

      const applyToMaterial = (mat: THREE.Material) => {
        const std = mat as THREE.MeshStandardMaterial;

        if (!spineTex) {
          if ((std as any).map) (std as any).map = null;
          std.needsUpdate = true;
          return;
        }

        (std as any).map = spineTex;
        if ((std as any).color) (std as any).color.set(0xffffff);
        std.needsUpdate = true;
      };

      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat && applyToMaterial(mat));
      } else if (m.material) {
        applyToMaterial(m.material);
      }
    });
  }, [book, spineTex]);

  return (
    <group position={position} rotation={rotation ?? [0, 0, 0]}>
      <primitive object={book} />
    </group>
  );
}

function BooksRow({ books }: { books: BookData[] }) {
  const startX = -3.4;
  const endX = 3.4;

  const y = -0.2;
  const z = 1.0;

  const placements = useMemo(() => {
    const n = Math.max(books.length, 1);
    const step = (endX - startX) / n;

    return books.map((b, i) => {
      const x = startX + i * step + step * 0.5;
      const lean = (Math.random() - 0.5) * 0.08;
      const yaw = (Math.random() - 0.5) * 0.12;
      return {
        id: b.id,
        book: b,
        pos: [x, y, z] as [number, number, number],
        rot: [0, yaw, lean] as [number, number, number],
      };
    });
  }, [books]);

  return (
    <group>
      {placements.map((p) => (
        <BookModel
          key={p.id}
          url="/models/book.glb"
          position={p.pos}
          rotation={p.rot}
          spinePath={p.book.spine_path}
        />
      ))}
    </group>
  );
}

export default function Page() {
  const [q, setQ] = useState("");
  const [books, setBooks] = useState<BookData[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);

  useEffect(() => {
    const run = async () => {
      setLoadingBooks(true);
      try {
        const url = q ? `/api/books?q=${encodeURIComponent(q)}` : `/api/books`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch /api/books");
        const data = await res.json();

        const normalized: BookData[] = (Array.isArray(data) ? data : []).map(
          (b: any, i: number) => ({
            id: String(b.id ?? b._id ?? b.uuid ?? i),
            title: String(b.title ?? "Untitled"),
            author: String(b.author ?? "Unknown"),
            spine_path: b.spine_path ? String(b.spine_path) : undefined,
            pdf_path: b.pdf_path ? String(b.pdf_path) : undefined,
          })
        );

        setBooks(normalized);
      } catch (e) {
        console.error(e);
        setBooks([]);
      } finally {
        setLoadingBooks(false);
      }
    };

    run();
  }, [q]);

  const visibleBooks: BookData[] =
    books.length > 0
      ? books
      : Array.from({ length: 12 }).map((_, i) => ({
          id: `fallback-${i}`,
          title: `Book ${i + 1}`,
          author: "Author",
        }));

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-8 pt-10">
        <div className="flex items-start justify-between gap-8">
          <div>
            <h1 className="text-5xl font-semibold tracking-tight">Univault</h1>
            <p className="mt-2 text-gray-500">Your digital bookshelf</p>
            <p className="mt-2 text-xs text-gray-400">
              {loadingBooks ? "Loading books…" : `${books.length} books from API`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              className="w-[460px] rounded-full border border-gray-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
              placeholder="Search title or author…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button
              className="rounded-full border border-gray-200 px-5 py-3 text-sm hover:bg-gray-50"
              onClick={() => setQ((x) => x)}
            >
              Search
            </button>
          </div>
        </div>

        <div className="mt-10 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="h-[520px] w-full overflow-hidden rounded-2xl bg-gray-50">
            <Canvas
              shadows
              dpr={[1, 2]}
              gl={{
                antialias: true,
                outputColorSpace: THREE.SRGBColorSpace,
                toneMapping: THREE.ACESFilmicToneMapping,
                toneMappingExposure: 1.05,
              }}
            >
              <PerspectiveCamera makeDefault fov={35} position={[0, 0.25, 9]} />

              <OrbitControls
                enablePan={false}
                minDistance={7}
                maxDistance={11}
                minPolarAngle={Math.PI / 2.35}
                maxPolarAngle={Math.PI / 2.05}
              />

              <Suspense fallback={<Loading />}>
                <Environment preset="studio" />
              </Suspense>

              <directionalLight
                position={[6, 6, 6]}
                intensity={2.2}
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
              />
              <directionalLight position={[-6, 4, 3]} intensity={0.9} />
              <ambientLight intensity={0.4} />

              <Suspense fallback={<Loading />}>
                <group>
                  <ShelfModel url="/models/shelf.glb" />
                  <BooksRow books={visibleBooks.slice(0, 40)} />
                </group>
              </Suspense>

              <ContactShadows position={[0, -1.2, 0]} opacity={0.35} blur={2.2} far={8} />
            </Canvas>
          </div>
        </div>
      </div>
    </div>
  );
}

useGLTF.preload("/models/shelf.glb");
useGLTF.preload("/models/book.glb");
