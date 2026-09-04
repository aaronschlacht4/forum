"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  BOOK_MODEL_URL,
  applyBlankCover,
  applyCoverTexture,
  coverUrlFor,
  measureBookBody,
  prepareCoverTexture,
} from "@/lib/bookModel";

/**
 * The landing page's showcase: the top books as real 3D volumes on one
 * shared canvas, each turning slowly on its own axis.
 *
 * This replaced a grid of 2D cards whose cover images were cropped with one
 * hardcoded background-position trick — "show the rightmost 45%" — on the
 * assumption that every cover file is an unwrapped jacket. Only calibrated
 * covers are; everyone else's plain front-cover photo lost its left half
 * and came out mangled. Rendering through the same pipeline the library
 * shelf uses (applyCoverTexture, with each book's real thickness and its
 * cover_calibrated flag) makes that entire class of bug impossible here:
 * whatever a cover renders like on the shelf is what it renders like on
 * the landing page.
 *
 * One canvas for the whole row, not one per book — six WebGL contexts for
 * six covers is how a landing page runs into the browser's context cap.
 */

export type ShowcaseBook = {
  id: string;
  title?: string;
  author?: string;
  cover_path?: string;
  pageCount?: number | null;
  coverCalibrated?: boolean;
};

/** World-unit gap between book centres along the row. */
const SPACING = 2.35;
/** Every book is scaled to stand this tall. */
const BOOK_HEIGHT = 2.3;
/** One full turn takes this long. Slow enough to read the front cover. */
const SECONDS_PER_TURN = 14;

// Mirrors spineThickness in components/ShelfScene.tsx — a book should look
// exactly as thick here as it does on the shelf.
const DEFAULT_PAGE_COUNT = 300;
function spineThickness(pageCount?: number | null): number {
  if (!pageCount || pageCount <= 0) return 1;
  return Math.min(1.7, Math.max(0.55, Math.sqrt(pageCount / DEFAULT_PAGE_COUNT)));
}

function TurningBook({
  book,
  index,
  count,
  onPick,
}: {
  book: ShowcaseBook;
  index: number;
  count: number;
  onPick: (id: string) => void;
}) {
  const { scene } = useGLTF(BOOK_MODEL_URL);
  const spinner = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  const clone = useMemo(() => {
    const root = scene.clone(true);
    const body = measureBookBody(root); // also hides the model's stray shards
    const size = body.getSize(new THREE.Vector3());
    const centre = body.getCenter(new THREE.Vector3());

    // Stand it centred on the group's origin at a uniform height, spine
    // width scaled by the book's own page count — same look as the shelf.
    const s = BOOK_HEIGHT / Math.max(size.y, 1e-6);
    const holder = new THREE.Group();
    root.position.set(-centre.x, -centre.y, -centre.z);
    holder.add(root);
    holder.scale.set(s, s, s * spineThickness(book.pageCount));
    return { holder, root };
  }, [scene, book.pageCount]);

  useEffect(() => {
    const url = coverUrlFor(book);
    if (!url) {
      applyBlankCover(clone.root, book.id);
      return;
    }
    let cancelled = false;
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        if (cancelled) return void tex.dispose();
        prepareCoverTexture(tex, 16);
        // "aspect" fit for uncalibrated covers: this view shows covers
        // face-on, where the shelf's plain full-width stretch reads as
        // exactly the distortion it is. Calibrated covers use their exact
        // convention fit as always.
        applyCoverTexture(
          clone.root,
          tex,
          16,
          spineThickness(book.pageCount),
          book.coverCalibrated ?? false,
          "aspect"
        );
      },
      undefined,
      () => { if (!cancelled) applyBlankCover(clone.root, book.id); }
    );
    return () => { cancelled = true; };
  }, [clone, book]);

  useFrame(({ clock }) => {
    const g = spinner.current;
    if (!g) return;
    // One slow, shared turn with a small phase lag per column, so the row
    // reads as a choreographed wave rather than six unrelated turntables.
    const turn = (clock.elapsedTime / SECONDS_PER_TURN) * Math.PI * 2;
    g.rotation.y = turn + index * 0.45;
    // A hovered book eases slightly toward the viewer and up.
    const lift = hovered ? 0.14 : 0;
    g.position.y += (lift - g.position.y) * 0.12;
    const scale = hovered ? 1.07 : 1;
    g.scale.x += (scale - g.scale.x) * 0.12;
    g.scale.y = g.scale.z = g.scale.x;
  });

  const x = (index - (count - 1) / 2) * SPACING;

  return (
    <group position={[x, 0, 0]}>
      <group
        ref={spinner}
        onClick={(e) => { e.stopPropagation(); onPick(book.id); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={(e) => { e.stopPropagation(); setHovered(false); document.body.style.cursor = "default"; }}
      >
        <primitive object={clone.holder} />
      </group>
    </group>
  );
}

/** Backs the camera up until the whole row fits the canvas, with a margin. */
function FitRow({ count }: { count: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const rowWidth = count * SPACING + 0.6;
    const aspect = size.width / Math.max(size.height, 1);
    const halfFov = Math.tan((cam.fov * Math.PI) / 360);
    const distForWidth = rowWidth / 2 / (halfFov * aspect);
    const distForHeight = (BOOK_HEIGHT * 1.28) / 2 / halfFov;
    cam.position.set(0, 0.1, Math.max(distForWidth, distForHeight));
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  }, [camera, size, count]);
  return null;
}

export default function SpinningShelf({ books }: { books: ShowcaseBook[] }) {
  const router = useRouter();
  const shown = books.slice(0, 6);
  const wrap = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  // The turn only burns frames while the row is actually on screen.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.05 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  if (shown.length === 0) return null;

  return (
    <div ref={wrap}>
      <div style={{ height: 340 }}>
        <Canvas
          frameloop={inView ? "always" : "demand"}
          camera={{ fov: 32 }}
          // The library canvas's exact colour pipeline — a cover must not
          // read warmer or flatter here than it does on the shelf.
          gl={{
            antialias: true,
            alpha: true,
            outputColorSpace: THREE.SRGBColorSpace,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.1,
          }}
          dpr={[1, 2]}
          onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
        >
          <FitRow count={shown.length} />
          {/* Same image-based lighting as the library shelf, with a soft
              warm key on top for shape. Bare directional lights left the
              covers flat and plasticky — a book is mostly seen by what the
              room reflects into it. */}
          <Environment preset="apartment" background={false} />
          <ambientLight intensity={0.25} color="#fff3dd" />
          <directionalLight position={[4, 6, 8]} intensity={0.85} color="#ffedd0" />
          {/* A soft pool of shadow under each book, so the row stands on
              the page instead of floating in front of it. */}
          <ContactShadows
            position={[0, -BOOK_HEIGHT / 2 - 0.06, 0]}
            width={shown.length * SPACING + 1}
            height={2.4}
            blur={2.6}
            opacity={0.3}
            far={1.6}
            resolution={512}
            color="#2a2013"
          />
          {shown.map((b, i) => (
            <TurningBook
              key={b.id}
              book={b}
              index={i}
              count={shown.length}
              onPick={(id) => router.push(`/book/${encodeURIComponent(id)}`)}
            />
          ))}
        </Canvas>
      </div>

      {/* Captions in their own row of equal columns: the books above sit at
          evenly spaced world positions, so equal flex columns line up under
          them as long as both rows share the same outer width. */}
      <div style={{ display: "flex", marginTop: 4 }}>
        {shown.map((b) => (
          <a
            key={b.id}
            href={`/book/${encodeURIComponent(b.id)}`}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: "center",
              textDecoration: "none",
              padding: "0 10px",
            }}
          >
            <div
              style={{
                fontFamily: "'Crimson Text', serif",
                fontSize: 15,
                fontWeight: 600,
                color: "#3f3828",
                lineHeight: 1.25,
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {b.title || "Untitled"}
            </div>
            {b.author && (
              <div
                style={{
                  fontFamily: "'Crimson Text', serif",
                  fontSize: 12.5,
                  color: "#87816e",
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {b.author}
              </div>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}

useGLTF.preload(BOOK_MODEL_URL);
