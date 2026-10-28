"use client";

import { centerOnBed } from "@/lib/brick/center";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { ArrowDownToLine, Box, Layers } from "lucide-react";
import * as THREE from "three";
import type { MeshPart } from "@/lib/brick/mesh";
import { cn } from "@/lib/utils";

export type ViewMode = "perspective" | "orthographic" | "top";

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

/** Printer bed outline and grid drawn on the ground under the model. */
function PrinterBed({ size, label }: { size: number; label?: string }) {
  const half = size / 2;
  const borderGeo = useMemo(() => {
    const pts = [
      // bottom edge
      new THREE.Vector3(-half, -half, 0),
      new THREE.Vector3(half, -half, 0),
      // right edge
      new THREE.Vector3(half, -half, 0),
      new THREE.Vector3(half, half, 0),
      // top edge
      new THREE.Vector3(half, half, 0),
      new THREE.Vector3(-half, half, 0),
      // left edge
      new THREE.Vector3(-half, half, 0),
      new THREE.Vector3(-half, -half, 0),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [half]);

  // Subtle grid lines at 40 mm intervals (matching 1 UNIT pitch)
  const gridGeo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const step = 40;
    for (let x = -half + step; x < half; x += step) {
      pts.push(new THREE.Vector3(x, -half, 0), new THREE.Vector3(x, half, 0));
    }
    for (let y = -half + step; y < half; y += step) {
      pts.push(new THREE.Vector3(-half, y, 0), new THREE.Vector3(half, y, 0));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [half]);

  const fillGeo = useMemo(() => new THREE.PlaneGeometry(size, size), [size]);

  return (
    <group position={[0, 0, -0.05]}>
      <mesh geometry={fillGeo}>
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.06}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments geometry={gridGeo}>
        <lineBasicMaterial color="#38bdf8" transparent opacity={0.16} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={borderGeo}>
        <lineBasicMaterial color="#38bdf8" linewidth={2} transparent opacity={0.75} depthWrite={false} />
      </lineSegments>
    </group>
  );
}

function CameraController({
  size,
  view,
  controlsRef,
  bed,
}: {
  size: [number, number, number];
  view: ViewMode;
  controlsRef: React.RefObject<any>;
  bed?: number | null;
}) {
  const { camera, size: canvasSize } = useThree();
  const [w, d, h] = size;
  const r = Math.max(w, d, h, 1);
  const targetZ = h / 2;

  useEffect(() => {
    const posX = r * 2.2;
    const posY = -r * 2.6;
    const posZ = targetZ + r * 1.8;

    if (view === "top") {
      camera.up.set(0, 1, 0);
      camera.position.set(0, 0, targetZ + Math.max(r * 4, 800));
      camera.lookAt(0, 0, targetZ);
    } else {
      camera.up.set(0, 0, 1);
      camera.position.set(posX, posY, posZ);
      camera.lookAt(0, 0, targetZ);
    }

    if (camera instanceof THREE.OrthographicCamera) {
      const fitDim = Math.max(r * 1.8, bed ? bed * 1.15 : 0);
      const minScreen = Math.min(canvasSize.width, canvasSize.height);
      camera.zoom = minScreen / (fitDim || 200);
    }

    camera.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, targetZ);
      controlsRef.current.update();
    }
  }, [view, w, d, h, r, targetZ, bed, camera, canvasSize, controlsRef]);

  return null;
}

export function ViewButtons({
  view,
  onViewChange,
  className,
}: {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  className?: string;
}) {
  const options: { id: ViewMode; label: string; title: string; icon: typeof Box }[] = [
    { id: "perspective", label: "3D", title: "3D perspective view (default)", icon: Box },
    { id: "orthographic", label: "Ortho", title: "Orthographic 3D view", icon: Layers },
    { id: "top", label: "Top", title: "Top view (grid view from above)", icon: ArrowDownToLine },
  ];

  return (
    <div
      role="group"
      aria-label="Camera view"
      className={cn(
        "flex h-7 items-center rounded-full border border-border bg-background/80 p-0.5 text-xs backdrop-blur shadow-xs",
        className
      )}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = view === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            title={opt.title}
            aria-pressed={active}
            onClick={() => onViewChange(opt.id)}
            className={cn(
              "flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium transition-all cursor-pointer",
              active
                ? "bg-foreground text-background shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-3" />
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export type ViewerProps = {
  parts?: MeshPart[];
  size: [number, number, number];
  explode: number;
  cubes?: ViewerCube[];
  onSelectCube?: (id: string) => void;
  view?: ViewMode;
  onViewChange?: (view: ViewMode) => void;
  bed?: number | null;
  bedLabel?: string;
  showOverlayButtons?: boolean;
};

export function Viewer({
  parts = [],
  size,
  explode,
  cubes,
  onSelectCube,
  view: externalView,
  onViewChange: externalOnViewChange,
  bed = null,
  bedLabel,
  showOverlayButtons = false,
}: ViewerProps) {
  const [internalView, setInternalView] = useState<ViewMode>("perspective");
  const view = externalView ?? internalView;
  const setView = externalOnViewChange ?? setInternalView;

  const [w, d, h] = size;
  const controlsRef = useRef<any>(null);

  const hasLayout = cubes && cubes.length > 0;
  // Centre on what is actually drawn (drawer pulls, hooks and layout offsets included), not the nominal size.
  const shift = useMemo(() => centerOnBed(hasLayout ? cubes! : [{ parts }]), [hasLayout, cubes, parts]);

  return (
    <div className="relative h-full w-full">
      <Canvas
        dpr={[1, 1.5]}
        camera={{
          up: [0, 0, 1],
          fov: 35,
          near: 1,
          far: 20000,
        }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[300, -400, 600]} intensity={1.6} />
        <directionalLight position={[-300, 300, 200]} intensity={0.5} />
        {view === "perspective" ? (
          <PerspectiveCamera
            makeDefault
            up={[0, 0, 1]}
            fov={35}
            near={1}
            far={20000}
          />
        ) : view === "orthographic" ? (
          <OrthographicCamera
            makeDefault
            up={[0, 0, 1]}
            near={-20000}
            far={20000}
          />
        ) : (
          <OrthographicCamera
            makeDefault
            up={[0, 1, 0]}
            near={-20000}
            far={20000}
          />
        )}
        <CameraController size={size} view={view} controlsRef={controlsRef} bed={bed} />
        {bed && bed > 0 ? <PrinterBed size={bed} label={bedLabel} /> : null}
        <group position={shift}>
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
        <OrbitControls
          key={view}
          ref={controlsRef}
          makeDefault
          target={[0, 0, h / 2]}
          enableDamping
          enableRotate={view !== "top"}
        />
      </Canvas>
      {showOverlayButtons ? (
        <div className="absolute right-4 bottom-4 flex items-center gap-2 pointer-events-auto">
          <ViewButtons view={view} onViewChange={setView} />
        </div>
      ) : null}
    </div>
  );
}
