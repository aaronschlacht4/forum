"use client";

import React, { useRef, useMemo, useEffect, useState, useLayoutEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

interface SpinningBookProps {
  title: string;
  category: string;
  id: string;
  cover_path?: string;
  pdfUrl?: string;
  index: number;
  onClick?: () => void;
}

/**
 * ✅ What this version fixes (based on your exact complaint):
 * - You don't want a "blob under the book" that gets hidden by the book.
 * - You want a SHADOW with the SHAPE of the book, and then OFFSET (so you can actually see it).
 *
 * ✅ How we do it:
 * - Create a "shadow rectangle" that matches the book's footprint/aspect ratio.
 * - Blur it (gaussian-ish) so it looks like a real cast shadow.
 * - OFFSET it down/right (base offset + interactive offset).
 * - Keep it behind the WebGL book (correct physically), but offset so it's visible and not "blocked".
 *
 * This is the same trick used on premium product pages.
 */

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function Book3D({
  coverTexture,
  onHoverChange,
}: {
  coverTexture: THREE.Texture | null;
  onHoverChange?: (x: number, y: number) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const targetRotation = useRef({ x: 0, y: 0 });
  const { scene } = useGLTF("/models/book-card.glb");

  const bookClone = useMemo(() => {
    const clone = scene.clone(true);

    clone.traverse((obj: any) => {
      if (obj?.isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;

        if (coverTexture) {
          const mat = new THREE.MeshStandardMaterial({
            map: coverTexture,
            color: new THREE.Color(0xffffff),
            roughness: 0.75,
            metalness: 0.05,
          });
          obj.material = mat;
          obj.material.needsUpdate = true;
        } else {
          obj.material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0x8b7355),
            roughness: 0.8,
            metalness: 0.1,
          });
        }
      }
    });

    return clone;
  }, [scene, coverTexture]);

  // Auto-fit model to consistent size + center it
  useLayoutEffect(() => {
    if (!modelRef.current) return;

    // reset transforms before measuring
    modelRef.current.position.set(0, 0, 0);
    modelRef.current.rotation.set(0, 0, 0);
    modelRef.current.scale.set(1, 1, 1);

    const box = new THREE.Box3().setFromObject(modelRef.current);
    const size = new THREE.Vector3();
    box.getSize(size);

    const targetHeight = 2.35;
    const scale = targetHeight / (size.y || 1);
    modelRef.current.scale.setScalar(scale);

    // Your pipeline's "front cover" orientation (keep this if it's correct for you)
    modelRef.current.rotation.set(Math.PI, 0, 0);

    // recenter after scaling and rotation
    const box2 = new THREE.Box3().setFromObject(modelRef.current);
    const center = new THREE.Vector3();
    box2.getCenter(center);
    modelRef.current.position.sub(center);
  }, [bookClone]);

  useFrame(() => {
    if (!groupRef.current) return;

    groupRef.current.rotation.x +=
      (targetRotation.current.x - groupRef.current.rotation.x) * 0.12;
    groupRef.current.rotation.y +=
      (targetRotation.current.y - groupRef.current.rotation.y) * 0.12;
  });

  return (
    <group
      ref={groupRef}
      rotation={[-0.08, 0, 0]}
      onPointerMove={(e) => {
        e.stopPropagation();
        const x = (e.point.x / 2) * 0.28;
        const y = (e.point.y / 2) * 0.28;
        targetRotation.current = { x: -y, y: x };
        onHoverChange?.(x, y);
      }}
      onPointerLeave={(e) => {
        e.stopPropagation();
        targetRotation.current = { x: 0, y: 0 };
        onHoverChange?.(0, 0);
      }}
    >
      <group ref={modelRef}>
        <primitive object={bookClone} />
      </group>
    </group>
  );
}

export default function SpinningBook({
  title,
  category,
  id,
  cover_path,
  onClick,
}: SpinningBookProps) {
  const [coverTexture, setCoverTexture] = useState<THREE.Texture | null>(null);

  // hover values from the book (used to offset the shadow slightly)
  const [hover, setHover] = useState({ x: 0, y: 0 });

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const SUPABASE_COVERS = `${SUPABASE_URL}/storage/v1/object/public/covers`;

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    const file = cover_path || "frankenstein.jpg";
    const url = `${SUPABASE_COVERS}/${encodeURIComponent(file)}`;

    loader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 16;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;

        // wrap-around textures
        texture.flipY = false;

        texture.needsUpdate = true;
        setCoverTexture(texture);
      },
      undefined,
      (err) => console.error("Cover texture load failed:", err)
    );
  }, [cover_path, SUPABASE_COVERS]);

  // Tight, clamped interactive offsets (small range)
  const hx = clamp(hover.x, -0.18, 0.18);
  const hy = clamp(hover.y, -0.18, 0.18);

  // base cast direction (down-right) + interactive drift
  const baseX = -10; // px horizontal offset (less to shift left)
  const baseY = 12; // px vertical offset (down)
  const dx = baseX + hx * 40; // interactive horizontal movement (more visible)
  const dy = baseY + hy * 40; // interactive vertical movement (more visible)

  // shadow "squash" (perspective) and intensity control
  const tiltMag = Math.min(1, Math.hypot(hx, hy) / 0.18); // 0..1
  const shadowScaleX = 1.0 + tiltMag * 0.12; // more dramatic scale on tilt
  const shadowScaleY = 1.0 - tiltMag * 0.15; // more dramatic squash on tilt

  return (
    <div className="flex flex-col items-center gap-4 cursor-pointer group" onClick={onClick}>
      <div
        className="relative w-[300px] h-[360px] transition-transform group-hover:scale-105"
        style={{
          padding: "18px 14px",
          background: "transparent",
          overflow: "visible", // ✅ important: don't clip the cast shadow
        }}
      >
        {/**
         * ✅ BOOK-SHAPED CAST SHADOW (NOT A BLOB)
         * - This rectangle matches the book's silhouette better than an ellipse.
         * - Then we blur it so it becomes a realistic shadow.
         * - And we OFFSET it so it is clearly visible (not hidden “under” the book).
         */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[50%]"
          style={{
            zIndex: 0,

            // Match book footprint - wider
            width: "72%",
            height: "80%",

            // Slight rounding so it feels like a physical object shadow
            borderRadius: "8px",

            // Pure black shadow - no transparency to prevent color bleed
            background: "#000000",

            // Gaussian blur for soft shadow - less blur
            filter: "blur(4px)",

            // Shadow opacity - controls visibility
            opacity: 0.3,

            // Isolate to prevent blur from sampling book colors
            isolation: "isolate",

            // ✅ The key: OFFSET the shadow so it peeks out + interactive movement
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scaleX(${shadowScaleX}) scaleY(${shadowScaleY})`,
          }}
        />

        {/* Canvas must render truly transparent so the shadow is visible */}
        <div className="relative" style={{ zIndex: 1, width: "100%", height: "100%" }}>
          <Canvas
            style={{ width: "100%", height: "100%", background: "transparent" }}
            camera={{ position: [0, 0, 4.9], fov: 30 }}
            gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
            dpr={[1, 2]}
            onCreated={({ gl }) => {
              // ensure transparent clear color so the shadow shows through
              gl.setClearColor(0x000000, 0);
            }}
          >
            <ambientLight intensity={1.15} />
            <directionalLight position={[3, 4, 6]} intensity={0.9} />
            <directionalLight position={[-3, 2, 6]} intensity={0.45} />

            <Book3D coverTexture={coverTexture} onHoverChange={(x, y) => setHover({ x, y })} />
          </Canvas>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <p className="text-xs text-gray-500 uppercase tracking-wide">{category}</p>
        <h3 className="text-lg font-semibold text-center line-clamp-2">{title}</h3>
      </div>
    </div>
  );
}

useGLTF.preload("/models/book-card.glb");
