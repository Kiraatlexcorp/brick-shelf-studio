"use client";

import { centerOnBed } from "@/lib/brick/center";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ComponentProps } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Environment,
  GizmoHelper,
  GizmoViewport,
  Grid,
  Lightformer,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from "@react-three/drei";
import { ArrowDownToLine, Box, Grid2x2, Layers, Square } from "lucide-react";
import * as THREE from "three";
import type { MeshPart } from "@/lib/brick/mesh";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  QualityToggle,
  usePreviewQuality,
  type PreviewQuality,
} from "@/components/studio/quality-toggle";

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
  quality,
}: {
  part: MeshPart;
  explode: number;
  isSelected?: boolean;
  quality: PreviewQuality;
}) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(part.positions, 3));
    g.setIndex(new THREE.BufferAttribute(part.indices, 1));
    g.computeVertexNormals();
    return g;
  }, [part]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  const o = part.out ?? [0, 0, 0];
  const color = COLOR[part.group ?? "deck"] ?? "#d6402b";
  const emissive = isSelected ? "#38bdf8" : "#000000";
  const emissiveIntensity = isSelected ? 0.35 : 0;

  return (
    <mesh geometry={geometry} position={[o[0] * explode, o[1] * explode, o[2] * explode]}>
      {quality === "high" ? (
        <meshPhysicalMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          roughness={0.58}
          metalness={0.02}
          clearcoat={0.12}
          clearcoatRoughness={0.6}
          envMapIntensity={0.55}
          side={THREE.DoubleSide}
        />
      ) : (
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          roughness={0.72}
          metalness={0.04}
          flatShading
          side={THREE.DoubleSide}
        />
      )}
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

  useEffect(() => () => lineGeo.dispose(), [lineGeo]);

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
      new THREE.Vector3(-half, -half, 0),
      new THREE.Vector3(half, -half, 0),
      new THREE.Vector3(half, -half, 0),
      new THREE.Vector3(half, half, 0),
      new THREE.Vector3(half, half, 0),
      new THREE.Vector3(-half, half, 0),
      new THREE.Vector3(-half, half, 0),
      new THREE.Vector3(-half, -half, 0),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [half]);

  useEffect(() => () => borderGeo.dispose(), [borderGeo]);

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

  useEffect(() => () => gridGeo.dispose(), [gridGeo]);

  const fillGeo = useMemo(() => new THREE.PlaneGeometry(size, size), [size]);
  useEffect(() => () => fillGeo.dispose(), [fillGeo]);

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

/** Ground grid that hides while the camera is below it, so the underside stays visible. */
function GroundGrid(props: ComponentProps<typeof Grid>) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.visible = camera.position.z > 0;
  });
  return <Grid ref={ref} {...props} />;
}

/** Each bump of `tick` swings the camera straight under the model. */
function BottomView({ tick }: { tick: number }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as any;
  useEffect(() => {
    if (!tick || !controls) return;
    const distance = camera.position.distanceTo(controls.target);
    camera.position.set(
      controls.target.x,
      controls.target.y - 0.01,
      controls.target.z - distance,
    );
    camera.lookAt(controls.target);
    controls.update();
  }, [tick, camera, controls]);
  return null;
}

/**
 * Maya-style view gizmo: click an axis head (±X right/left, ±Y top/bottom, ±Z front/back)
 * to snap there; click the centre cube to go back to the home view.
 */
function ViewGizmo({ onHome }: { onHome: () => void }) {
  return (
    <GizmoHelper alignment="top-left" margin={[64, 64]}>
      <GizmoViewport
        axisColors={["#e5484d", "#46a758", "#3e63dd"]}
        labels={["R", "T", "F"]}
        labelColor="#ffffff"
      />
      <mesh
        onClick={(event) => {
          event.stopPropagation();
          onHome();
        }}
      >
        <boxGeometry args={[14, 14, 14]} />
        <meshBasicMaterial color="#9ca3af" toneMapped={false} />
      </mesh>
    </GizmoHelper>
  );
}

function useDarkPaper() {
  return useSyncExternalStore(
    (notify) => {
      const observer = new MutationObserver(notify);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
}

function CropMarks() {
  const mark = "absolute size-3.5 border-foreground/45";
  return (
    <div className="pointer-events-none absolute inset-3">
      <span className={`${mark} top-0 left-0 border-t border-l`} />
      <span className={`${mark} top-0 right-0 border-t border-r`} />
      <span className={`${mark} bottom-0 left-0 border-b border-l`} />
      <span className={`${mark} right-0 bottom-0 border-r border-b`} />
    </div>
  );
}

function CameraController({
  size,
  view,
  controlsRef,
  bed,
  home,
}: {
  size: [number, number, number];
  view: ViewMode | "front" | "right";
  controlsRef?: React.RefObject<any>;
  bed?: number | null;
  home?: number;
}) {
  const { camera, size: canvasSize } = useThree();
  const controls = useThree((state) => state.controls) as any;
  const [w, d, h] = size;
  const r = Math.max(w, d, h, 1);
  const targetZ = h / 2;

  useEffect(() => {
    const posX = r * 2.2;
    const posY = -r * 2.6;
    const posZ = targetZ + r * 1.8;
    const dist = Math.max(r * 3.5, 600);

    if (view === "top") {
      camera.up.set(0, 1, 0);
      camera.position.set(0, 0.001, targetZ + Math.max(r * 4, 800));
      camera.lookAt(0, 0, targetZ);
    } else if (view === "front") {
      camera.up.set(0, 0, 1);
      camera.position.set(0, -dist, targetZ);
      camera.lookAt(0, 0, targetZ);
    } else if (view === "right") {
      camera.up.set(0, 0, 1);
      camera.position.set(dist, 0, targetZ);
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

    const effControls = controlsRef?.current ?? controls;
    if (effControls) {
      effControls.target.set(0, 0, targetZ);
      effControls.update();
    }
  }, [view, w, d, h, r, targetZ, bed, camera, canvasSize, controlsRef, controls, home]);

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

  const [quality, setQuality] = usePreviewQuality();
  const [bottomTick, setBottomTick] = useState(0);
  const [quad, setQuad] = useState(false);
  const [homeTick, setHomeTick] = useState(0);

  const dark = useDarkPaper();
  const phone = useIsMobile();
  const controlsRef = useRef<any>(null);

  const hasLayout = cubes && cubes.length > 0;
  // Centre on what is actually drawn (drawer pulls, hooks and layout offsets included), not the nominal size.
  const shift = useMemo(() => centerOnBed(hasLayout ? cubes! : [{ parts }]), [hasLayout, cubes, parts]);

  const scene = (v: ViewMode | "front" | "right") => (
    <Canvas
      key={`${quality}-${v}`}
      className="h-full w-full"
      dpr={phone ? [1, 1.5] : quality === "high" ? [1, 2] : [1, 1.25]}
      gl={{ alpha: true, antialias: quality === "high" }}
      camera={{
        up: v === "top" ? [0, 1, 0] : [0, 0, 1],
        fov: 35,
        near: 1,
        far: 20000,
      }}
    >
      <ambientLight intensity={0.72} />
      <directionalLight position={[80, -60, 140]} intensity={1.15} />
      <directionalLight position={[-70, 70, 40]} intensity={0.35} />
      {quality === "high" ? (
        <Environment resolution={64} frames={1}>
          <Lightformer
            form="rect"
            intensity={1.4}
            position={[0, 6, 0]}
            rotation-x={Math.PI / 2}
            scale={[12, 12, 1]}
          />
          <Lightformer
            form="rect"
            intensity={0.6}
            position={[-6, 2, 4]}
            rotation-y={Math.PI / 3}
            scale={[8, 4, 1]}
          />
          <Lightformer
            form="rect"
            intensity={0.4}
            position={[6, 1, -4]}
            rotation-y={-Math.PI / 2}
            scale={[8, 4, 1]}
          />
        </Environment>
      ) : null}
      {v === "perspective" ? (
        <PerspectiveCamera
          makeDefault
          up={[0, 0, 1]}
          fov={35}
          near={1}
          far={20000}
        />
      ) : v === "orthographic" ? (
        <OrthographicCamera
          makeDefault
          up={[0, 0, 1]}
          near={-20000}
          far={20000}
        />
      ) : v === "top" ? (
        <OrthographicCamera
          makeDefault
          up={[0, 1, 0]}
          near={-20000}
          far={20000}
        />
      ) : (
        <OrthographicCamera
          makeDefault
          up={[0, 0, 1]}
          near={-20000}
          far={20000}
        />
      )}
      <CameraController
        size={size}
        view={v}
        controlsRef={v === view ? controlsRef : undefined}
        bed={bed}
        home={homeTick}
      />
      <GroundGrid
        args={[2400, 2400]}
        cellSize={40}
        cellThickness={0.55}
        cellColor={dark ? "#262626" : "#e5e5e5"}
        sectionSize={160}
        sectionThickness={1.05}
        sectionColor={dark ? "#404040" : "#a3a3a3"}
        fadeDistance={1100}
        fadeStrength={1.4}
        infiniteGrid
        position={[0, 0, -0.25]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      {bed && bed > 0 ? <PrinterBed size={bed} label={bedLabel} /> : null}
      <group position={shift}>
        {hasLayout
          ? cubes.map((c) => (
              <group
                key={c.id}
                position={c.offset}
                onClick={(e) => {
                  if (e.delta > 4) return;
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
                    quality={quality}
                  />
                ))}
                {c.isSelected && c.size ? <CubeHighlightBox size={c.size} /> : null}
              </group>
            ))
          : parts.map((p) => (
              <Part
                key={p.name}
                part={p}
                explode={explode}
                quality={quality}
              />
            ))}
      </group>
      <OrbitControls
        key={`${quality}-${v}`}
        ref={v === view ? controlsRef : undefined}
        makeDefault
        enableDamping
        dampingFactor={0.14}
        maxPolarAngle={Math.PI - 0.02}
        minPolarAngle={0.02}
        enableRotate={v !== "top"}
      />
      {v === "perspective" ? <BottomView tick={bottomTick} /> : null}
      {v === "perspective" && !phone ? (
        <ViewGizmo onHome={() => setHomeTick((tick) => tick + 1)} />
      ) : null}
    </Canvas>
  );

  return (
    <div className="relative h-full w-full bg-background">
      {quad ? (
        <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px bg-border">
          {(["top", "front", "right", "perspective"] as const).map((name) => (
            <div key={name} className="relative bg-background">
              {scene(name)}
              <span className="pointer-events-none absolute top-2 left-3 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                {name}
              </span>
            </div>
          ))}
        </div>
      ) : (
        scene(view)
      )}
      <CropMarks />
      <div className="absolute bottom-4 left-4 flex items-center gap-2 pointer-events-auto">
        <QualityToggle value={quality} onChange={setQuality} />
        <button
          type="button"
          aria-label="View from bottom"
          title="View the underside"
          onClick={() => {
            if (view !== "perspective") setView("perspective");
            setBottomTick((tick) => tick + 1);
          }}
          className="flex h-7 items-center gap-1 rounded-full border border-border bg-background/80 px-2.5 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ArrowDownToLine className="size-3.5" aria-hidden />
          Bottom
        </button>
        <button
          type="button"
          aria-pressed={quad}
          aria-label={quad ? "Single view" : "Quad view"}
          title={
            quad ? "Back to a single view" : "Top, front, side and 3D at once"
          }
          onClick={() => {
            setBottomTick(0);
            setQuad((value) => !value);
          }}
          className="hidden h-7 items-center gap-1 rounded-full border border-border bg-background/80 px-2.5 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:flex"
        >
          {quad ? (
            <Square className="size-3.5" aria-hidden />
          ) : (
            <Grid2x2 className="size-3.5" aria-hidden />
          )}
          {quad ? "Single" : "Quad"}
        </button>
      </div>
      {showOverlayButtons ? (
        <div className="absolute right-4 bottom-4 flex items-center gap-2 pointer-events-auto">
          <ViewButtons view={view} onViewChange={setView} />
        </div>
      ) : null}
    </div>
  );
}
