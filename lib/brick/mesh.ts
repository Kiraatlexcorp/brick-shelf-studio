import type { Manifold } from "manifold-3d";

export type MeshPart = {
  name: string;
  positions: Float32Array;
  indices: Uint32Array;
  /** Where the part sits in the assembled cube (preview only). */
  placeX: number;
  placeY: number;
  placeZ: number;
  /** Preview colour group and explode direction. */
  group?: string;
  out?: [number, number, number];
};

export function toPart(name: string, solid: Manifold, place = { x: 0, y: 0, z: 0 }): MeshPart {
  const mesh = solid.getMesh();
  const stride = mesh.numProp;
  const count = mesh.vertProperties.length / stride;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = mesh.vertProperties[i * stride];
    positions[i * 3 + 1] = mesh.vertProperties[i * stride + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * stride + 2];
  }
  return {
    name,
    positions,
    indices: new Uint32Array(mesh.triVerts),
    placeX: place.x,
    placeY: place.y,
    placeZ: place.z,
  };
}
