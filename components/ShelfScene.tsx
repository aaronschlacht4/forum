"use client";

import { useRouter } from "next/navigation";
import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
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

/* -------------------- Color helpers -------------------- */

/* -------------------- Types -------------------- */

export type BookData = {
  id: string;
  title?: string;
  author?: string;
  pdfUrl?: string;
  cover_path?: string; // wrap-around texture (front+spine+back)
};

type Bounds = { box: THREE.Box3; size: THREE.Vector3; center: THREE.Vector3 };

function Loading() {
  return (
    <Html center>
      <div style={{ fontFamily: "system-ui", opacity: 0.8 }}>Loading…</div>
    </Html>
  );
}

/* -------------------- Geometry helpers -------------------- */

function normalizeToOriginBottom(obj: THREE.Object3D) {
  obj.updateMatrixWorld(true);

  // center
  let box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  obj.position.sub(center);

  // bottom align
  obj.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(obj);
  obj.position.y -= box.min.y;

  obj.updateMatrixWorld(true);
}

function applyCoverTexture(bookRoot: THREE.Object3D, tex: THREE.Texture, maxAnisotropy: number) {
  // Apply single wrap-around texture to ALL meshes in the book model
  
  // Configure texture sampling BEFORE applying to material
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  
  // Enable mipmaps for proper filtering at all distances
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter; // Trilinear filtering
  tex.magFilter = THREE.LinearFilter;
  
  // Use maximum anisotropic filtering to eliminate shimmer at angles
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;

  bookRoot.traverse((obj: any) => {
    if (!obj.isMesh) return;

    const baseMat = obj.material as THREE.MeshStandardMaterial;
    const mat = (baseMat?.clone?.() ??
      new THREE.MeshStandardMaterial()) as THREE.MeshStandardMaterial;

    mat.map = tex;
    mat.color.set(0xffffff);
    mat.roughness = 0.75;
    mat.metalness = 0.05;
    
    // Prevent z-fighting with polygon offset
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -4;
    
    mat.side = THREE.FrontSide;
    mat.depthWrite = true;
    mat.depthTest = true;
    
    mat.needsUpdate = true;
    obj.material = mat;
  });
}

/* -------------------- Shelf model -------------------- */

function ShelfModel({
  url,
  onBounds,
}: {
  url: string;
  onBounds: (b: Bounds) => void;
}) {
  const { scene } = useGLTF(url);

  const shelf = useMemo(() => {
    const s = scene.clone(true);

    s.traverse((o: any) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;

      const mat = o.material as any;
      if (mat) {
        const mats = Array.isArray(mat) ? mat : [mat];
        mats.forEach((m) => {
          if (!m) return;
          m.side = THREE.DoubleSide;
          m.needsUpdate = true;
        });
      }
    });

    // raw bounds
    s.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(s);
    let size = box.getSize(new THREE.Vector3());

    // rotate so longest horizontal axis becomes X
    if (size.z > size.x) s.rotation.y = Math.PI / 2;

    // center
    s.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(s);
    const center = box.getCenter(new THREE.Vector3());
    s.position.sub(center);

    // bottom align
    s.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(s);
    s.position.y -= box.min.y;

    // scale to predictable world width
    s.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(s);
    size = box.getSize(new THREE.Vector3());

    const TARGET_WIDTH = 12;
    const scale = TARGET_WIDTH / Math.max(size.x, 1e-6);
    s.scale.setScalar(scale);

    // final bounds
    s.updateMatrixWorld(true);
    const finalBox = new THREE.Box3().setFromObject(s);
    const finalSize = finalBox.getSize(new THREE.Vector3());
    const finalCenter = finalBox.getCenter(new THREE.Vector3());

    onBounds({ box: finalBox, size: finalSize, center: finalCenter });

    return s;
  }, [scene, onBounds]);

  return <primitive object={shelf} />;
}

/* -------------------- Camera framing -------------------- */

function AutoFrameCamera({
  bounds,
  controlsRef,
}: {
  bounds: Bounds | null;
  controlsRef: React.RefObject<any>;
}) {
  const { camera, size: viewportSize } = useThree();

  useEffect(() => {
    if (!bounds) return;

    const cam = camera as THREE.PerspectiveCamera;
    const { size, center } = bounds;

    cam.fov = 10;
    cam.near = 0.01;
    cam.far = 80;
    cam.updateProjectionMatrix();

    const margin = 0.22;
    const fovRad = (cam.fov * Math.PI) / 180;

    const fitWidthDist = (size.x * 0.5) / Math.tan(fovRad / 2);
    const fitHeightDist = (size.y * 0.5) / Math.tan(fovRad / 2);
    const dist = Math.max(fitWidthDist, fitHeightDist) * margin;

    const camY = center.y + size.y * 0.35;
    const camZ = center.z + dist;

    cam.position.set(center.x, camY, camZ);
    cam.lookAt(center.x, center.y + size.y * 0.15, center.z);

    const ctrls = controlsRef.current;
    if (ctrls) {
      ctrls.target.set(center.x, center.y + size.y * 0.15, center.z);
      ctrls.update();
    }
  }, [bounds, camera, controlsRef, viewportSize.width, viewportSize.height]);

  return null;
}

/* -------------------- Books -------------------- */

function BooksPacked({ books, bounds }: { books: BookData[]; bounds: Bounds | null }) {
  const { scene: baseBookScene } = useGLTF("/models/book.glb");
  const { gl } = useThree(); // Get renderer for max anisotropy
  const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
  const texLoader = useMemo(() => new THREE.TextureLoader(), []);
  const texCache = useRef<Record<string, THREE.Texture | null | undefined>>({});
  const router = useRouter();
  const [hoveredAny, setHoveredAny] = useState(false);

  useEffect(() => {
    document.body.style.cursor = hoveredAny ? "pointer" : "default";
    return () => {
      document.body.style.cursor = "default";
    };
  }, [hoveredAny]);

  // SIZE + ROTATION
  const HEIGHT_MULT = 1.05; // book height relative to shelf height
  const EXTRA_SCALE = 0.8; // your requested 0.8
  const FORCE_YAW = Math.PI / 2; // try 0, PI/2, -PI/2, PI

  // Supabase Storage URL (must be real, comes from .env.local)
  const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://YOUR_PROJECT_ID.supabase.co";
  const SUPABASE_COVERS = `${SUPABASE_URL}/storage/v1/object/public/covers`;

  const placed = useMemo(() => {
    if (!bounds) return [];
    if (!books?.length) return [];

    const { box, size, center } = bounds;

    const usableMargin = size.x * 0.08;
    const usableStartX = box.min.x + usableMargin;
    const usableEndX = box.max.x - usableMargin;
    const usableSpan = usableEndX - usableStartX;

    // ✅ shelf surface Y (tweak 0.02 if needed)
    const floorY = box.min.y + size.y * 0.02;
    const z = center.z + size.z * 0.00;

    const n = Math.min(books.length, 40);

    // measure prototype book
    const proto = baseBookScene.clone(true);
    normalizeToOriginBottom(proto);
    proto.updateMatrixWorld(true);

    const protoBox = new THREE.Box3().setFromObject(proto);
    const protoSize = protoBox.getSize(new THREE.Vector3());

    const desiredH = size.y * HEIGHT_MULT;
    const baseScale = desiredH / Math.max(protoSize.y, 1e-6);

    const built = books.slice(0, n).map((b, i) => {
      const id = String(b.id ?? `book-${i}`);

      const wrapper = new THREE.Group();
      wrapper.rotation.y = FORCE_YAW;

      const bookRoot = baseBookScene.clone(true);
      bookRoot.traverse((o: any) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
      });

      normalizeToOriginBottom(bookRoot);
      wrapper.add(bookRoot);

      // size it to shelf
      wrapper.scale.setScalar(baseScale * EXTRA_SCALE);

      wrapper.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(wrapper);
      const width = bb.max.x - bb.min.x;

      return { id, data: b, wrapper, bookRoot, width };
    });

    const gap = size.x * 0.01;

    const rawTotal =
      built.reduce((sum, b) => sum + b.width, 0) + (built.length - 1) * gap;

    const fitFactor = rawTotal > usableSpan ? usableSpan / rawTotal : 1;

    if (fitFactor < 1) {
      built.forEach((b) => {
        b.wrapper.scale.multiplyScalar(fitFactor);
        b.wrapper.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(b.wrapper);
        b.width = bb.max.x - bb.min.x;
      });
    }

    // snap + pack
    let x = usableStartX;

    built.forEach((b) => {
      b.wrapper.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(b.wrapper);

      const deltaY = floorY - bb.min.y;
      b.wrapper.position.y += deltaY;
      b.wrapper.position.y += size.y * 0.002; // tiny lift
      b.wrapper.position.z = z;

      const halfW = b.width / 2;
      b.wrapper.position.x = x + halfW;

      x += b.width + gap;
    });

    return built;
  }, [books, bounds, baseBookScene]);

  // load/apply covers + tint covers
  useEffect(() => {
    if (!placed.length) return;

    placed.forEach((p) => {
      const id = p.id;
      if (id.startsWith("fallback-")) return;

      const spineName = p.data.cover_path ?? `${id}.jpg`;
      const url = `${SUPABASE_COVERS}/${encodeURIComponent(spineName)}`;

      const cached = texCache.current[id];
      if (cached !== undefined) {
        if (cached) applyCoverTexture(p.bookRoot, cached, maxAnisotropy);
        return;
      }

      texCache.current[id] = null;

      texLoader.load(
        url,
        (tex) => {
          texCache.current[id] = tex;
          applyCoverTexture(p.bookRoot, tex, maxAnisotropy);
        },
        undefined,
        () => {
          texCache.current[id] = null;
        }
      );
    });
  }, [placed, texLoader, SUPABASE_COVERS, maxAnisotropy]);

  return (
    <group>
      {placed.map((p) => (
        <group
          key={p.id}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHoveredAny(true);
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setHoveredAny(false);
          }}
          onClick={(e) => {
            e.stopPropagation();

            if (p.data.pdfUrl) {
              window.open(p.data.pdfUrl, "_blank", "noopener,noreferrer");
              return;
            }

            router.push(`/book/${encodeURIComponent(p.data.id)}`);
          }}
        >
          <primitive object={p.wrapper} />
        </group>
      ))}
    </group>
  );
}

/* -------------------- Main component -------------------- */

export default function ShelfScene({ books }: { books: BookData[] }) {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const controlsRef = useRef<any>(null);

  return (
    <div className="h-full w-full overflow-hidden rounded-2xl bg-gray-50">
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
        <PerspectiveCamera makeDefault fov={50} position={[0, 2, 12]} />

        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          enableDamping={false}
          enableZoom={true}
        />

        {/* calmer library lighting */}
        <directionalLight
          position={[4, 8, 6]}
          intensity={1.4}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={0.1}
          shadow-camera-far={80}
          shadow-camera-left={-15}
          shadow-camera-right={15}
          shadow-camera-top={15}
          shadow-camera-bottom={-15}
        />
        <directionalLight position={[-6, 5, 2]} intensity={0.5} />
        <directionalLight position={[0, 5, -8]} intensity={0.25} />
        <ambientLight intensity={0.25} />

        <Suspense fallback={<Loading />}>
          <Environment preset="city" />
          <ShelfModel url="/models/shelfv2.glb" onBounds={setBounds} />
          <AutoFrameCamera bounds={bounds} controlsRef={controlsRef} />
          <BooksPacked books={books} bounds={bounds} />
        </Suspense>

        {bounds && (
          <ContactShadows
            position={[bounds.center.x, bounds.box.min.y - 0.01, bounds.center.z]}
            opacity={0.3}
            blur={2.2}
            far={bounds.size.x * 1.2}
          />
        )}
      </Canvas>
    </div>
  );
}

/* -------------------- Preloads (MUST be outside JSX) -------------------- */

useGLTF.preload("/models/shelfv2.glb");
useGLTF.preload("/models/book.glb");
