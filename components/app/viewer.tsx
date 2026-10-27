"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
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
  joint: "#3a3a3a",
};

export type ViewerCube = {
  id: string;
  parts: MeshPart[];
  offset: [number, number, number];
  size?: [number, number, number];
  isSelected?: boolean;
};

function Part({
  part,
  explode,
  isSelected,
}: {
  part: MeshPart;
  explode: number;
  isSelected?: boolean;
}) {
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
      <meshStandardMaterial
        color={COLOR[part.group ?? "deck"] ?? "#d6402b"}
        roughness={0.55}
        flatShading
        emissive={isSelected ? "#38bdf8" : "#000000"}
        emissiveIntensity={isSelected ? 0.35 : 0}
      />
    </mesh>
  );
}

function CubeHighlightBox({ size }: { size: [number, number, number] }) {
  const [w, d, h] = size;
  const lineGeo = useMemo(() => {
    const boxGeo = new THREE.BoxGeometry(w, d, h);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    boxGeo.dispose();
    return edgesGeo;
  }, [w, d, h]);

  return (
    <lineSegments geometry={lineGeo} position={[w / 2, d / 2, h / 2]}>
      <lineBasicMaterial color="#38bdf8" linewidth={2} />
    </lineSegments>
  );
}

function CameraController({
  size,
  controlsRef,
}: {
  size: [number, number, number];
  controlsRef: React.RefObject<any>;
}) {
  const { camera } = useThree();
  const [w, d, h] = size;
  const r = Math.max(w, d, h, 1);

  useEffect(() => {
    const targetZ = h / 2;
    const posX = r * 2.2;
    const posY = -r * 2.6;
    const posZ = targetZ + r * 1.8;

    camera.position.set(posX, posY, posZ);
    camera.lookAt(0, 0, targetZ);
    camera.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, targetZ);
      controlsRef.current.update();
    }
  }, [w, d, h, r, camera, controlsRef]);

  return null;
}

export function Viewer({
  parts = [],
  size,
  explode,
  cubes,
  onSelectCube,
}: {
  parts?: MeshPart[];
  size: [number, number, number];
  explode: number;
  cubes?: ViewerCube[];
  onSelectCube?: (id: string) => void;
}) {
  const [w, d, h] = size;
  const r = Math.max(w, d, h, 1);
  const controlsRef = useRef<any>(null);

  const hasLayout = cubes && cubes.length > 0;

  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{
        up: [0, 0, 1],
        position: [r * 2.2, -r * 2.6, h / 2 + r * 1.8],
        fov: 35,
        near: 1,
        far: 20000,
      }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[300, -400, 600]} intensity={1.6} />
      <directionalLight position={[-300, 300, 200]} intensity={0.5} />
      <CameraController size={size} controlsRef={controlsRef} />
      <group position={[-w / 2, -d / 2, 0]}>
        {hasLayout
          ? cubes.map((c) => (
              <group
                key={c.id}
                position={c.offset}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectCube?.(c.id);
                }}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  document.body.style.cursor = "pointer";
                }}
                onPointerOut={() => {
                  document.body.style.cursor = "auto";
                }}
              >
                {c.parts.map((p) => (
                  <Part
                    key={p.name}
                    part={p}
                    explode={explode}
                    isSelected={c.isSelected}
                  />
                ))}
                {c.isSelected && c.size ? <CubeHighlightBox size={c.size} /> : null}
              </group>
            ))
          : parts.map((p) => (
              <Part key={p.name} part={p} explode={explode} />
            ))}
      </group>
      <OrbitControls ref={controlsRef} makeDefault target={[0, 0, h / 2]} enableDamping />
    </Canvas>
  );
}
