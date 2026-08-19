"use client";

import React, { useRef, useMemo, useEffect, useState, useLayoutEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  BOOK_MODEL_URL,
  applyCoverTexture,
  coverUrlFor,
  measureBookBody,
  prepareCoverTexture,
} from "@/lib/bookModel";

interface SpinningBookProps {
  title: string;
  category: string;
  id: string;
  cover_path?: string;
  pdfUrl?: string;
  index: number;
  onClick?: () => void;
}

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
  const { scene } = useGLTF(BOOK_MODEL_URL);

  const bookClone = useMemo(() => {
    const clone = scene.clone(true);
    measureBookBody(clone); // hides the model's stray geometry

    clone.traverse((obj: any) => {
      if (obj?.isMesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
      }
    });

    // Without artwork the model keeps the pages/binding/jacket it ships with.
    if (coverTexture) applyCoverTexture(clone, coverTexture, 16);

    return clone;
  }, [scene, coverTexture]);

  useLayoutEffect(() => {
    if (!modelRef.current) return;

    modelRef.current.position.set(0, 0, 0);
    modelRef.current.rotation.set(0, 0, 0);
    modelRef.current.scale.set(1, 1, 1);

    const box = new THREE.Box3().setFromObject(modelRef.current);
    const size = new THREE.Vector3();
    box.getSize(size);

    const targetHeight = 2.35;
    const scale = targetHeight / (size.y || 1);
    modelRef.current.scale.setScalar(scale);

    modelRef.current.rotation.set(Math.PI, 0, 0);

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
  const [hover, setHover] = useState({ x: 0, y: 0 });

  const coverUrl = coverUrlFor({ id, cover_path });

  useEffect(() => {
    if (!coverUrl) return;
    let cancelled = false;
    const loader = new THREE.TextureLoader();

    loader.load(
      coverUrl,
      (texture) => {
        if (cancelled) {
          texture.dispose();
          return;
        }
        setCoverTexture(prepareCoverTexture(texture, 16));
      },
      undefined,
      (err) => console.error(`Cover texture load failed for ${coverUrl}:`, err)
    );

    return () => {
      cancelled = true;
    };
  }, [coverUrl]);

  const activeCover = coverUrl ? coverTexture : null;

  const hx = clamp(hover.x, -0.18, 0.18);
  const hy = clamp(hover.y, -0.18, 0.18);
  const shadowX = Math.round(-8 + hx * 30);
  const shadowY = Math.round(10 + hy * 30);

  return (
    <div className="flex flex-col items-center gap-4 cursor-pointer group" onClick={onClick}>
      <div
        className="relative w-[300px] h-[360px] transition-transform group-hover:scale-105"
        style={{ padding: "18px 14px", background: "transparent" }}
      >
        <Canvas
          style={{
            width: "100%",
            height: "100%",
            background: "transparent",
            filter: `drop-shadow(${shadowX}px ${shadowY}px 6px rgba(10,30,15,0.55))`,
          }}
          camera={{ position: [0, 0, 4.9], fov: 30 }}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          dpr={[1, 2]}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
          }}
        >
          <ambientLight intensity={1.15} />
          <directionalLight position={[3, 4, 6]} intensity={0.9} />
          <directionalLight position={[-3, 2, 6]} intensity={0.45} />

          <Book3D coverTexture={activeCover} onHoverChange={(x, y) => setHover({ x, y })} />
        </Canvas>
      </div>

      <div className="flex flex-col items-center gap-1">
        <p className="text-xs text-gray-500 uppercase tracking-wide">{category}</p>
        <h3 className="text-lg font-semibold text-center line-clamp-2">{title}</h3>
      </div>
    </div>
  );
}

useGLTF.preload("/models/book-card.glb");
