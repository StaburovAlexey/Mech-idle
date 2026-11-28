import * as THREE from 'three';

// The PolygonDan GLB puts both the stationary feet and moving pedestal in "Base".
// Weld UV seams for the classification, but keep the original indices for rendering.
export function splitTurretMount(base: THREE.Mesh) {
  const geometry = base.geometry, index = geometry.getIndex(), pos = geometry.getAttribute('position');
  if (!index) throw new Error('Expected indexed PolygonDan base');
  const parent = Array.from({ length: pos.count }, (_, i) => i);
  const root = (i: number) => {
    while (i !== parent[i]) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const points = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i)},${pos.getY(i)},${pos.getZ(i)}`;
    const first = points.get(key);
    if (first === undefined) points.set(key, i);
    else parent[i] = first;
  }
  for (let i = 0; i < index.count; i += 3) {
    const a = root(index.getX(i));
    parent[root(index.getX(i + 1))] = a;
    parent[root(index.getX(i + 2))] = a;
  }
  // On this asset the highest fixed island ends at .267; the rotating collar reaches .330.
  const moving = new Set<number>();
  for (let i = 0; i < pos.count; i++) {
    if (base.position.y + pos.getY(i) * base.scale.y > .30) moving.add(root(i));
  }
  const fixedIndices: number[] = [], movingIndices: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    (moving.has(root(a)) ? movingIndices : fixedIndices).push(a, index.getX(i + 1), index.getX(i + 2));
  }
  if (!fixedIndices.length || !movingIndices.length) throw new Error('Missing fixed or moving turret mount geometry');
  const swivel = base.clone(false);
  swivel.name = 'Swivel';
  swivel.geometry = geometry.clone().setIndex(movingIndices);
  geometry.setIndex(fixedIndices);
  return swivel;
}
