"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { MeshPart } from "@/lib/brick/mesh";

const COLOR: Record<string, string> = {
  deck: "#d6402b",
  side: "#f2c230",
  back: "#2f6fd6",
  front: "#3aa35b",
  door: "#3aa35b",
  drawer: "#f4f1ea",
  slide: "#7ab8e8",
};

function Part({ part, explode }: { part: MeshPart; explode: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(part.positions, 3));
    g.setIndex(new THREE.BufferAttribute(part.indices, 1));
    g.computeVertexNormals();
    return g;
  }, [part]);
  const o = part.out ?? [0, 0, 0];
  return (
    <mesh geometry={geometry} position={[o[0] * explode, o[1] * explode, o[2] * explode]}>
      <meshStandardMaterial color={COLOR[part.group ?? "deck"] ?? "#d6402b"} roughness={0.55} flatShading />
    </mesh>
  );
}

export function Viewer({ parts, size, explode }: { parts: MeshPart[]; size: [number, number, number]; explode: number }) {
  const [w, d, h] = size;
  const r = Math.max(w, d, h);
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ up: [0, 0, 1], position: [r * 2.2, -r * 2.6, h / 2 + r * 1.8], fov: 35, near: 1, far: 5000 }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[300, -400, 600]} intensity={1.6} />
      <directionalLight position={[-300, 300, 200]} intensity={0.5} />
      <group position={[-w / 2, -d / 2, 0]}>
        {parts.map((p) => (
          <Part key={p.name} part={p} explode={explode} />
        ))}
      </group>
      <OrbitControls makeDefault target={[0, 0, h / 2]} enableDamping />
    </Canvas>
  );
}
