"use client";

import { useGLTF } from "@react-three/drei";

export default function ShelfModel(props: any) {
  const { scene } = useGLTF("/models/shelfv2.glb");
  return <primitive object={scene} {...props} />;
}

useGLTF.preload("/models/shelfv2.glb");
