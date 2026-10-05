import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WASTELAND_LIMITS } from './decoration';

export type OuterPropKind = 'wall' | 'container' | 'tank' | 'wreck' | 'pipes' | 'pole' | 'scrub';
export interface OuterProp {
  id: string;
  kind: OuterPropKind;
  x: number;
  z: number;
  rotation: number;
  scale: number;
  height: number;
  variant: number;
}
export interface OuterPropRange { id: string; kind: OuterPropKind; start: number; count: number }
export const OUTER_SCENERY_LIMITS = {
  clearRadius: 15,
  tallClearRadius: 18,
  roadHalfWidth: 5.1,
  foregroundHeight: 1.2,
  maxHeight: 3,
  maxRadius: 48,
  maxMeshes: 4,
  maxTriangles: 18000,
} as const;

const C = {
  concrete: 0x88877a, concreteLight: 0xa49f8b, concreteDark: 0x696d62,
  rust: 0x79533e, rustLight: 0x956447, steel: 0x505854, dark: 0x333d3c,
  sand: 0xb4a58b, teal: 0x536b65, hazard: 0xb79c53, grass: 0x847a50,
};
const footprint: Record<OuterPropKind, number> = { wall: 2.2, container: 2.3, tank: 2.1, wreck: 2.5, pipes: 2.1, pole: 1.1, scrub: .85 };
const cameraGroundDirection = new THREE.Vector2(14, 17).normalize();

function randomSequence(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = Math.imul(state ^ state >>> 15, state | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

/** Old roadside work sites, not a ring or an enclosing wall. No simulation imports. */
export function createOuterSceneryLayout(seed = 0x5255494e): OuterProp[] {
  const random = randomSequence(seed), props: OuterProp[] = [];
  const between = (a: number, b: number) => a + random() * (b - a);
  const add = (kind: OuterPropKind, x: number, z: number, height: number, rotation: number) => {
    const scale = between(.92, 1.05), radius = footprint[kind] * scale;
    x += between(-.22, .22); z += between(-.22, .22);
    const radial = Math.hypot(x, z);
    // An enclosing footprint keeps whole triangles clear, not merely their vertices.
    const roadX = Math.cos(.22) * (x + 2.4) - Math.sin(.22) * (z - 1.5);
    if (radial - radius < OUTER_SCENERY_LIMITS.clearRadius || Math.abs(roadX) - radius < OUTER_SCENERY_LIMITS.roadHalfWidth) return;
    const entirelyBehind = x * cameraGroundDirection.x + z * cameraGroundDirection.y + radius < 0;
    const canBeTall = entirelyBehind && radial - radius >= OUTER_SCENERY_LIMITS.tallClearRadius;
    props.push({ id: `outer-${kind}-${props.length}`, kind, x, z, height: canBeTall ? height : Math.min(height, 1.08), rotation: rotation + between(-.09, .09), scale, variant: Math.floor(random() * 3) });
  };

  // Two ruined service yards behind the arena; open road and spawn approaches stay clear.
  add('wall', -18.9, -8.3, 1.55, .35);
  add('wall', -22, -10.7, 2.05, 1.6);
  add('container', -18.8, -15.6, 1.72, .15);
  add('tank', -22.8, -17.3, 1.65, -.20);
  add('pole', -20, -12.1, 2.65, -.1);
  add('pipes', -16.2, -20.2, .9, .28);
  add('wreck', -16.8, -5, .90, -.45);
  add('container', 7.8, -21.4, 1.65, .26);
  add('wall', 5.9, -26, 1.65, -.25);
  add('tank', 10.7, -24.7, 1.80, -.22);
  add('pole', 8, -27.8, 2.80, .08);
  add('pipes', 7.5, -17.6, .90, -.35);
  add('wreck', 14.8, -15.2, .84, 1.9);

  // Low scattered foreground scraps frame the ground without hiding incoming mechs.
  add('wall', -14.4, 12.6, .75, -.4);
  add('wreck', -18.1, 15.8, .78, .85);
  add('pipes', -12.0, 20.6, .72, -.1);
  add('container', -17.8, 24.1, .95, .15);
  add('tank', -8.8, 22.5, .80, 1.1);
  add('wreck', 18.2, 4.4, .90, 2.4);
  add('wall', 20.8, 9, .84, 1.7);
  add('pipes', 16.5, 13.3, .72, -.3);
  add('container', 12.3, 19.8, 1.02, .27);
  add('tank', 16.7, 23.2, .92, -.1);

  // Sparse outer remnants continue into portrait screens, with no repeating boundary.
  add('wall', -29, -1.5, 1.40, .8);
  add('container', -28.2, -25, 1.35, -.35);
  add('pole', -26.5, -29.7, 2.45, .2);
  add('tank', 15.5, -33.2, 1.55, .9);
  add('wall', 9, -38, 1.9, -.4);
  add('pipes', -25.1, 30.5, .68, .2);
  add('wall', 25.5, 30, .62, -.3);
  add('wreck', 30.2, 17.5, .85, -.6);

  // Tufts belong to the wreck sites; their uneven spacing avoids decorative symmetry.
  for (const site of [...props]) {
    if (site.kind === 'pole') continue;
    for (let i = 0; i < 2; i++) {
      const angle = between(0, Math.PI * 2), offset = between(2.0, 3.4);
      add('scrub', site.x + Math.cos(angle) * offset, site.z + Math.sin(angle) * offset, between(.3, .59), angle);
    }
  }
  return props;
}

type Surface = 'concrete' | 'metal' | 'scrub' | 'contact';
type Piece = { geometry: THREE.BufferGeometry; prop: OuterProp };
type Emit = (surface: Surface, geometry: THREE.BufferGeometry, color: number, x?: number, y?: number, z?: number, rx?: number, ry?: number, rz?: number) => void;
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cylinder = (radius: number, height: number, segments = 10, open = false) => new THREE.CylinderGeometry(radius, radius, height, segments, 1, open);

function brokenWall(width: number, height: number, depth: number, variant: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0); shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height * .48); shape.lineTo(width * .31, height * .59);
  shape.lineTo(width * .27, height * .89); shape.lineTo(width * .08, height * .75);
  shape.lineTo(-width * .10, height * (variant === 1 ? .7 : 1));
  shape.lineTo(-width * .30, height * .94); shape.lineTo(-width / 2, height * .63);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function buildProp(prop: OuterProp, emit: Emit) {
  const h = prop.height, rust = prop.variant === 1 ? C.rustLight : C.rust;
  // Low angular ground contact tones anchor the props without textures or shadow maps.
  if (prop.kind !== 'scrub') {
    const contact = new THREE.CircleGeometry(1, 7);
    contact.rotateX(-Math.PI / 2);
    contact.scale(footprint[prop.kind] * .82, 1, footprint[prop.kind] * .52);
    emit('contact', contact, 0x686b59, .08, .016, .10);
  }

  if (prop.kind === 'wall') {
    emit('concrete', box(3.5, .14, .95), C.concreteDark, 0, .07);
    emit('concrete', brokenWall(2.95, h - .16, .36, prop.variant), C.concrete, -.14, .14);
    emit('concrete', brokenWall(.78, h * .52, .38, 1), C.concreteLight, 1.17, .14, .42, 0, Math.PI / 2);
    // Exposed rebar stops below the silhouette height.
    for (let i = 0; i < 3; i++) emit('metal', cylinder(.022, h * .23, 4), C.rust, -.54 + i * .25, h * .76, .06, 0, 0, -.14 + i * .1);
    for (let i = 0; i < 3; i++) {
      const stone = new THREE.DodecahedronGeometry(1, 0); stone.scale(.24 + i * .055, .10, .20);
      emit('concrete', stone, i % 2 ? C.concreteLight : C.concrete, -.75 + i * .81, .11, .68 + i % 2 * .12, 0, i * .7);
    }
  } else if (prop.kind === 'container') {
    emit('metal', box(3.3, h * .86, 1.4), rust, 0, h * .46);
    emit('metal', box(3.42, .07, 1.52), C.steel, 0, h * .91);
    emit('metal', box(3.42, .08, 1.50), C.dark, 0, .07);
    for (let i = 0; i < 9; i++) {
      for (const side of [-1, 1]) emit('metal', box(.055, h * .77, .036), i % 3 ? C.rustLight : C.steel, -1.4 + i * .35, h * .47, side * .721);
    }
    // End doors, latch bars, faded warning plate, and small diagonal hazard marks.
    emit('metal', box(.025, h * .73, 1.19), C.teal, 1.668, h * .46);
    for (const z of [-.31, .31]) emit('metal', cylinder(.024, h * .68, 4), C.sand, 1.693, h * .48, z);
    emit('metal', box(.68, h * .17, .026), C.hazard, -.74, h * .67, .75);
    for (let i = 0; i < 3; i++) emit('metal', box(.062, h * .145, .033), C.dark, -.93 + i * .18, h * .67, .766, 0, 0, -.42);
    emit('metal', box(.55, .024, .62), C.rustLight, .73, h * .96, -.05, 0, -.25);
  } else if (prop.kind === 'tank') {
    const radius = Math.min(.63, h * .40), centerY = radius + .13;
    emit('metal', cylinder(radius, 2.36, 12), rust, 0, centerY, 0, 0, 0, Math.PI / 2);
    for (const x of [-1.14, -.74, .74, 1.14]) emit('metal', cylinder(radius + .027, .07, 12, true), C.steel, x, centerY, 0, 0, 0, Math.PI / 2);
    for (const x of [-.76, .76]) emit('concrete', box(.42, .23, 1.20), C.concreteDark, x, .115);
    emit('metal', cylinder(.17, .13, 8), C.dark, .38, radius * 2 + .18);
    emit('metal', cylinder(.20, .025, 8), C.steel, .38, radius * 2 + .255);
    emit('metal', box(.54, .10, .035), C.hazard, -.25, centerY + radius * .18, radius + .012);
    // A disconnected lower pipe makes the tank read as disused industrial equipment.
    emit('metal', cylinder(.105, .75, 8, true), C.dark, 1.48, .13, .4, Math.PI / 2, 0, .2);
  } else if (prop.kind === 'wreck') {
    emit('metal', box(1.23, h * .45, .90), C.dark, 0, h * .34, 0, .05, -.10, -.11);
    emit('metal', box(1.06, h * .25, .74), C.sand, -.06, h * .62, .04, .16, -.10, -.16);
    emit('metal', box(.49, h * .18, .39), C.teal, -.26, h * .83, .10, .13, -.1, -.12);
    emit('metal', box(.29, .055, .05), C.dark, -.26, h * .83, .32, 0, -.1);
    for (const side of [-1, 1]) {
      emit('metal', cylinder(.22, .25, 8), C.rust, side * .62, h * .32, .18, Math.PI / 2);
      emit('metal', box(.36, h * .29, .74), side > 0 ? C.teal : C.sand, side * .78, h * .19, .55, 0, side * -.6, .05);
      emit('metal', box(.42, h * .20, .54), C.dark, side * .95, h * .12, 1.0, 0, side * -.4);
    }
    emit('metal', box(.76, h * .22, .39), C.rust, -.96, h * .15, -.35, 0, -.4, .1);
    emit('metal', cylinder(.065, .95, 6), C.steel, 1.07, .16, -.15, 0, .3, Math.PI / 2);
    emit('metal', box(.40, .05, .50), C.sand, .94, .10, -.8, -.14, -.4);
  } else if (prop.kind === 'pipes') {
    const radius = Math.min(.21, h * .24);
    for (let i = 0; i < 3; i++) {
      const z = (i - 1) * .46, y = radius + .055;
      emit('metal', cylinder(radius, 2.40 - i * .23, 10, true), i === 1 ? C.steel : rust, -.08 + i * .12, y, z, 0, 0, Math.PI / 2);
      for (const x of [-.67, .70]) emit('metal', cylinder(radius + .035, .06, 10, true), C.dark, x, y, z, 0, 0, Math.PI / 2);
    }
    emit('metal', cylinder(radius * .85, 1.67, 10, true), C.rustLight, -.15, radius * 2.7 + .055, 0, 0, -.12, Math.PI / 2);
    for (const x of [-.70, .72]) emit('concrete', box(.22, .10, 1.48), C.concreteDark, x, .05);
  } else if (prop.kind === 'pole') {
    emit('concrete', box(.65, .21, .65), C.concreteDark, 0, .105);
    emit('metal', cylinder(.066, h - .30, 6), C.rust, -.05, h / 2, 0, 0, 0, .065);
    emit('metal', box(1.06, .075, .09), C.dark, -.13, h - .19, 0, 0, 0, .065);
    for (const x of [-.51, .27]) emit('metal', cylinder(.065, .16, 6), C.sand, x, h - .13, 0);
    emit('metal', box(.25, .34, .18), C.steel, -.05, h * .36, .11);
  } else {
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.39996 + prop.variant, lean = .19 + i % 3 * .07;
      const blade = new THREE.BufferGeometry();
      blade.setAttribute('position', new THREE.Float32BufferAttribute([-.035, 0, 0, .035, 0, 0, lean, h * (.60 + i % 4 * .11), .035], 3));
      blade.computeVertexNormals();
      emit('scrub', blade, i % 2 ? C.grass : C.concreteDark, 0, .002, 0, 0, angle);
    }
    if (prop.variant === 1) {
      emit('scrub', cylinder(.022, h * .74, 4), C.rust, 0, h * .37, 0, 0, 0, .13);
      emit('scrub', cylinder(.012, h * .48, 3), C.grass, -.06, h * .58, 0, .4, 0, -.7);
    }
  }
}

/**
 * Four static draw calls, original geometry, no colliders, textures, or update loop.
 * The returned group owns its merged geometries and materials. All temporary
 * geometries are disposed here; SceneView's ordinary traversal disposes the rest.
 * Geometry userData.propRanges maps vertex spans back to named props for CPU QA.
 */
export function createOuterScenery(seed = 0x5255494e): THREE.Group {
  const group = new THREE.Group(); group.name = 'wasteland-outer-industrial-ruins';
  const layout = createOuterSceneryLayout(seed);
  const batches: Record<Surface, Piece[]> = { concrete: [], metal: [], scrub: [], contact: [] };
  for (const prop of layout) {
    buildProp(prop, (surface, input, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const geometry = input.index ? input.toNonIndexed() : input;
      if (geometry !== input) input.dispose();
      geometry.rotateX(rx); geometry.rotateY(ry); geometry.rotateZ(rz);
      geometry.translate(x, y, z);
      // Height is independently authored so foreground geometry stays below 1.2m.
      geometry.scale(prop.scale, 1, prop.scale);
      geometry.rotateY(prop.rotation);
      geometry.translate(prop.x, WASTELAND_LIMITS.groundHeight, prop.z);
      const rgb = new THREE.Color(color), positions = geometry.getAttribute('position');
      const colors = new Float32Array(positions.count * 3);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = rgb.r; colors[i + 1] = rgb.g; colors[i + 2] = rgb.b; }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'color'].includes(name)) geometry.deleteAttribute(name);
      batches[surface].push({ geometry, prop });
    });
  }
  const materials: Record<Surface, THREE.Material> = {
    concrete: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .87, metalness: .20, flatShading: true, side: THREE.DoubleSide }),
    scrub: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
    contact: new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false, transparent: true, opacity: .32 }),
  };
  for (const surface of Object.keys(batches) as Surface[]) {
    const pieces = batches[surface];
    if (!pieces.length) { materials[surface].dispose(); continue; }
    const ranges: OuterPropRange[] = [];
    let start = 0;
    for (const { geometry, prop } of pieces) {
      const count = geometry.getAttribute('position').count, previous = ranges.at(-1);
      if (previous?.id === prop.id) previous.count += count;
      else ranges.push({ id: prop.id, kind: prop.kind, start, count });
      start += count;
    }
    const geometry = mergeGeometries(pieces.map(piece => piece.geometry), false)!;
    pieces.forEach(piece => piece.geometry.dispose());
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.userData.propRanges = ranges;
    const mesh = new THREE.Mesh(geometry, materials[surface]); mesh.name = `outer-ruins-${surface}`;
    mesh.userData.decorativeOnly = true;
    group.add(mesh);
  }
  group.userData.props = layout;
  group.userData.decorativeOnly = true;
  return group;
}
