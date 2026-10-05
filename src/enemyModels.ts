import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Four original rigs modelled against the approved 02 concept sheet. Forward is +Z. */
export type EnemyModelKind = 'normal' | 'fast' | 'ranged' | 'boss';
export type EnemyPartName = 'body' | 'core' | 'legL' | 'legR' | 'rearLegL' | 'rearLegR' | 'armL' | 'armR' | 'handL' | 'handR' | 'cannon' | 'muzzle';
export type XYZ = readonly [number, number, number];
export interface EnemyModelPart {
  name: EnemyPartName;
  parent?: EnemyPartName;
  pivot: XYZ;
  geometry: THREE.BufferGeometry;
  glow?: boolean;
}
export interface EnemyModel {
  kind: EnemyModelKind;
  parts: EnemyModelPart[];
  height: number;
  footprint: readonly [number, number];
  /** Number of load-bearing legs, independent of arms/fists. */
  legs: number;
  dispose(): void;
}
type Piece = { geometry: THREE.BufferGeometry; color: number; at: XYZ; rotation: XYZ };
const P = { red: 0xb84332, edge: 0xe16649, dark: 0x282d2e, recess: 0x121b1d, metal: 0x687071, steel: 0x9a9e96, yellow: 0xe4aa28, glow: 0xffb52b, bolt: 0xafa58b };
const ORIGIN: XYZ = [0, 0, 0];
function bevel(w: number, h: number, d: number, b = Math.min(w, h, d) * .19) {
  b = Math.min(.12, b, w / 4, h / 4, d / 4);
  const shape = new THREE.Shape();
  const x = w / 2 - b, y = h / 2 - b, cut = Math.min(x, y) * .29;
  // Authored clipped corners plus a single bevel band, not rounded cubes.
  shape.moveTo(-x + cut, -y); shape.lineTo(x - cut, -y); shape.lineTo(x, -y + cut); shape.lineTo(x, y - cut);
  shape.lineTo(x - cut, y); shape.lineTo(-x + cut, y); shape.lineTo(-x, y - cut); shape.lineTo(-x, -y + cut); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, steps: 1, curveSegments: 1 });
  geometry.center(); return geometry;
}
function piece(geometry: THREE.BufferGeometry, color: number, at: XYZ = ORIGIN, rotation: XYZ = ORIGIN): Piece { return { geometry, color, at, rotation }; }
function panel(w: number, h: number, d: number, color: number, at: XYZ, rotation: XYZ = ORIGIN): Piece { return piece(bevel(w, h, d), color, at, rotation); }
function bar(w: number, h: number, d: number, color: number, at: XYZ, rotation: XYZ = ORIGIN): Piece { return piece(new THREE.BoxGeometry(w, h, d), color, at, rotation); }
function cylinder(r: number, length: number, color: number, at: XYZ, rotation: XYZ = ORIGIN, bottom = r): Piece { return piece(new THREE.CylinderGeometry(r, bottom, length, 8), color, at, rotation); }
function wedge(points: readonly (readonly [number, number])[], depth: number, color: number, at: XYZ, rotation: XYZ = ORIGIN): Piece {
  const shape = new THREE.Shape(); points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: .014, bevelSize: .013, bevelSegments: 1, steps: 1 });
  g.translate(0, 0, -depth / 2); return piece(g, color, at, rotation);
}
function rod(from: XYZ, to: XYZ, radius: number, color: number): Piece {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const g = new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  return piece(g, color, a.add(b).multiplyScalar(.5).toArray() as [number, number, number]);
}
function merge(pieces: Piece[]): THREE.BufferGeometry {
  const gs = pieces.map(p => {
    let g = p.geometry;
    if (g.index) { const unindexed = g.toNonIndexed(); g.dispose(); g = unindexed; }
    g.rotateX(p.rotation[0]); g.rotateY(p.rotation[1]); g.rotateZ(p.rotation[2]); g.translate(...p.at);
    const color = new THREE.Color(p.color), colors = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
    return g;
  });
  const merged = mergeGeometries(gs, false)!; gs.forEach(g => g.dispose()); merged.computeBoundingBox(); merged.computeBoundingSphere(); return merged;
}
function bolts(pieces: Piece[], x: number, y: number, z: number, spread = .13) {
  for (const side of [-1, 1]) pieces.push(cylinder(.022, .018, P.bolt, [x + side * spread, y, z], [Math.PI / 2, 0, 0]));
}
function vent(pieces: Piece[], x: number, y: number, z: number, width: number, count = 3) {
  pieces.push(panel(width + .06, count * .067 + .06, .07, P.recess, [x, y, z]));
  for (let i = 0; i < count; i++) pieces.push(bar(width, .022, .025, P.metal, [x, y + (i - (count - 1) / 2) * .067, z + .046]));
}
function armorSeams(pieces: Piece[], x: number, y: number, z: number, width: number, height: number) {
  pieces.push(bar(width * .70, .012, .016, P.recess, [x, y - height * .18, z]));
  pieces.push(bar(.014, height * .36, .019, P.recess, [x + width * .17, y - height * .03, z], [0, 0, -.20]));
  pieces.push(wedge([[-.031, .019], [.041, .026], [.009, -.039]], .006, P.metal, [x - width * .25, y + height * .16, z + .003]));
}
function toeFoot(pieces: Piece[], width: number, at: XYZ) {
  pieces.push(panel(width, .14, .46, P.dark, at));
  for (const s of [-1, 0, 1]) pieces.push(panel(width / 3 - .015, .10, .19, P.metal, [at[0] + s * width / 3, at[1] - .018, at[2] + .18]));
}

export function createEnemyModel(kind: EnemyModelKind): EnemyModel {
  const parts: EnemyModelPart[] = [];
  const add = (name: EnemyPartName, pieces: Piece[], pivot: XYZ = ORIGIN, parent?: EnemyPartName, glow = false) => parts.push({ name, geometry: merge(pieces), pivot, parent, glow });
  let height: number, footprint: readonly [number, number], legs = 2;
  if (kind === 'normal') {
    height = 2.12; footprint = [1.82, 1.03];
    const body = [panel(.91, .55, .60, P.dark, [0, 1.42, 0]), panel(.72, .30, .16, P.metal, [0, 1.32, .37], [-.23, 0, 0]), panel(.57, .15, .49, P.red, [0, 1.06, .015]), panel(.48, .15, .40, P.recess, [0, .96, 0]), panel(.39, .29, .36, P.dark, [0, 1.78, .17]), panel(.41, .10, .40, P.red, [0, 1.96, .16]), panel(.26, .16, .05, P.recess, [0, 1.78, .369])];
    for (const s of [-1, 1]) {
      body.push(panel(.54, .50, .67, P.red, [s * .59, 1.70, -.035], [0, s * -.09, s * -.20]));
      body.push(panel(.42, .085, .50, P.edge, [s * .59, 1.94, -.025], [0, 0, s * -.20]));
      body.push(cylinder(.155, .20, P.recess, [s * .48, 1.59, .19], [0, 0, Math.PI / 2]));
      body.push(panel(.16, .37, .24, P.dark, [s * .22, 1.56, -.43]));
      body.push(panel(.16, .17, .17, P.metal, [s * .40, 2.0, -.21]));
      vent(body, s * .27, 1.50, -.39, .15); bolts(body, s * .58, 1.78, .316, .16);
      armorSeams(body, s * .59, 1.68, .301, .42, .36);
    }
    body.push(wedge([[-.09, .075], [.09, .075], [0, -.10]], .02, P.red, [0, 1.31, .473]));
    add('body', body); add('core', [panel(.19, .105, .024, P.glow, [0, 1.79, .405])], ORIGIN, 'body', true);
    for (const [name, s] of [['legL', -1], ['legR', 1]] as const) {
      const leg = [panel(.25, .38, .29, P.dark, [0, -.20, 0]), panel(.29, .29, .13, P.red, [s * .025, -.17, .185], [-.17, 0, s * -.10]), cylinder(.13, .29, P.metal, [0, -.39, .045], [0, 0, Math.PI / 2]), panel(.24, .32, .25, P.dark, [0, -.59, -.035], [.16, 0, 0]), panel(.20, .23, .065, P.metal, [0, -.59, .127])];
      toeFoot(leg, .36, [0, -.81, .085]); add(name, leg, [s * .30, .91, 0]);
    }
    for (const [arm, hand, s] of [['armL', 'handL', -1], ['armR', 'handR', 1]] as const) {
      const upper = [cylinder(.12, .26, P.metal, [0, -.03, 0], [0, 0, Math.PI / 2]), panel(.23, .34, .25, P.dark, [0, -.22, .015]), panel(.25, .17, .25, P.red, [s * .035, -.20, .02]), cylinder(.12, .29, P.metal, [0, -.38, .04], [0, 0, Math.PI / 2])];
      add(arm, upper, [s * .63, 1.59, .01], 'body');
      const fist = [panel(.37, .33, .40, P.red, [0, -.16, .035]), rod([-.10, -.21, .08], [-.10, -.48, .08], .043, P.yellow), rod([.10, -.21, .08], [.10, -.48, .08], .043, P.steel), panel(.39, .25, .37, P.metal, [0, -.49, .10]), panel(.27, .19, .20, P.dark, [0, -.47, .295])];
      for (const x of [-.105, 0, .105]) fist.push(panel(.088, .11, .085, P.steel, [x, -.43, .408]));
      bolts(fist, 0, -.10, .245, .12); armorSeams(fist, 0, -.14, .239, .30, .26); add(hand, fist, [0, -.38, .04], arm);
    }
  } else if (kind === 'fast') {
    height = 2.26; footprint = [1.35, 1.18];
    const body = [panel(.39, .46, .39, P.dark, [0, 1.39, -.02], [.20, 0, 0]), panel(.29, .17, .32, P.recess, [0, 1.02, -.09]), panel(.29, .17, .36, P.red, [0, 1.10, -.035]), panel(.33, .27, .59, P.metal, [0, 1.55, .31], [.36, 0, 0]), panel(.20, .13, .43, P.dark, [0, 1.42, .48], [.36, 0, 0]), panel(.33, .055, .36, P.red, [0, 1.71, .26], [.36, 0, 0]), wedge([[-.20, -.30], [.20, -.20], [-.045, .67], [-.19, .73]], .10, P.red, [0, 1.50, -.27], [0, Math.PI / 2, 0])];
    for (const s of [-1, 1]) {
      body.push(wedge([[-.25, .09], [.25, .09], [.12, -.21]], .37, P.red, [s * .36, 1.55, -.10], [0, s * .25, s * -.22]));
      body.push(cylinder(.09, .12, P.metal, [s * .27, 1.41, -.045], [0, 0, Math.PI / 2]));
      body.push(rod([s * .1, 1.12, -.12], [s * .21, 1.45, -.14], .036, P.steel));
      bolts(body, s * .34, 1.55, .102, .08);
    }
    add('body', body); add('core', [panel(.23, .046, .025, P.glow, [0, 1.46, .697], [.36, 0, 0])], ORIGIN, 'body', true);
    for (const [name, s] of [['legL', -1], ['legR', 1]] as const) {
      const leg = [rod([0, 0, 0], [s * .15, -.31, .25], .061, P.metal), panel(.13, .31, .15, P.dark, [s * .075, -.16, .12], [-.55, 0, s * .25]), cylinder(.095, .15, P.recess, [s * .15, -.31, .25], [0, 0, Math.PI / 2]), rod([s * .15, -.31, .25], [s * .23, -.69, -.15], .045, P.steel), panel(.13, .27, .10, P.dark, [s * .18, -.50, .06], [.78, 0, s * .16]), cylinder(.069, .14, P.metal, [s * .23, -.70, -.15], [0, 0, Math.PI / 2]), rod([s * .23, -.69, -.15], [s * .25, -.91, .13], .044, P.dark)];
      toeFoot(leg, .20, [s * .25, -.94, .19]); add(name, leg, [s * .20, 1.04, -.08]);
    }
    for (const [name, s] of [['armL', -1], ['armR', 1]] as const) {
      const arm = [rod([0, 0, 0], [s * .08, -.29, .06], .056, P.steel), cylinder(.091, .17, P.dark, [s * .08, -.29, .06], [0, 0, Math.PI / 2]), rod([s * .08, -.29, .06], [s * .18, -.60, .27], .046, P.metal), wedge([[-.13, .12], [.10, .07], [.05, -.40], [-.16, -.56]], .15, P.red, [s * .14, -.46, .30], [-.55, 0, s * -.25]), wedge([[-.07, .13], [.06, .02], [-.12, -.58]], .055, P.steel, [s * .14, -.47, .399], [-.55, 0, s * -.25])];
      add(name, arm, [s * .36, 1.45, -.02], 'body');
    }
  } else if (kind === 'ranged') {
    height = 1.69; footprint = [2.03, 1.83]; legs = 4;
    const body = [panel(.94, .25, 1.02, P.dark, [0, .87, -.08]), panel(1.07, .29, .89, P.red, [0, 1.08, -.06]), panel(.85, .075, .69, P.edge, [0, 1.26, -.08]), cylinder(.35, .10, P.metal, [0, 1.31, -.16]), panel(.31, .44, .35, P.dark, [.55, 1.30, -.36]), panel(.12, .36, .38, P.yellow, [.72, 1.30, -.36])];
    for (const s of [-1, 1]) { vent(body, s * .35, .87, .47, .18); bolts(body, s * .28, 1.1, .404, .13); armorSeams(body, s * .27, 1.11, .39, .40, .22); body.push(panel(.17, .17, .68, P.recess, [s * .51, .81, -.03])); }
    for (let i = 0; i < 3; i++) body.push(bar(.018, .25, .065, P.dark, [.786, 1.3, -.51 + i * .12], [0, 0, -.40]));
    add('body', body);
    add('core', [cylinder(.081, .026, P.glow, [.39, 1.43, .08], [Math.PI / 2, 0, 0])], ORIGIN, 'body', true);
    for (const [name, s, z] of [['legL', -1, .43], ['legR', 1, .43], ['rearLegL', -1, -.52], ['rearLegR', 1, -.52]] as const) {
      const leg = [cylinder(.13, .24, P.metal, [0, -.015, 0], [0, 0, Math.PI / 2]), rod([0, 0, 0], [s * .28, -.22, z * .16], .069, P.dark), panel(.27, .37, .23, P.red, [s * .17, -.16, .025], [0, 0, s * -.49]), rod([s * .28, -.22, z * .16], [s * .39, -.61, z * .26], .055, P.steel), panel(.21, .29, .17, P.dark, [s * .33, -.46, z * .20], [0, 0, s * -.23])];
      toeFoot(leg, .32, [s * .39, -.69, z * .26 + .03]); add(name, leg, [s * .47, .78, z]);
    }
    const cannon = [panel(.46, .35, .59, P.dark, [0, 0, -.15]), panel(.30, .32, .32, P.yellow, [0, 0, .23]), panel(.25, .235, .95, P.dark, [0, 0, .84]), panel(.31, .30, .24, P.yellow, [0, 0, 1.34]), panel(.32, .32, .16, P.metal, [0, 0, 1.48]), panel(.22, .22, .025, P.recess, [0, 0, 1.571]), panel(.17, .17, .03, P.dark, [0, 0, 1.59]), panel(.09, .10, .02, P.recess, [0, 0, 1.61]), bar(.09, .07, .74, P.metal, [0, .14, .77])];
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) cannon.push(cylinder(.022, .016, P.bolt, [s * .135, -.075, .55 + i * .24], [0, 0, Math.PI / 2]));
    add('cannon', cannon, [0, 1.47, -.12], 'body');
    add('muzzle', [piece(new THREE.OctahedronGeometry(.21, 0), 0xffe9a5, [0, 0, .14])], [0, 0, 1.72], 'cannon', true);
  } else {
    height = 3.04; footprint = [3.0, 1.91];
    const body = [panel(1.52, 1.05, .97, P.dark, [0, 1.99, -.07]), panel(1.24, .69, .19, P.metal, [0, 1.93, .52], [-.14, 0, 0]), panel(.74, .38, .58, P.recess, [0, 1.32, -.08]), panel(.64, .31, .38, P.red, [0, 1.33, .26]), panel(.47, .84, .22, P.recess, [0, 2.04, .69]), panel(.39, .83, .09, P.metal, [0, 2.04, .816]), panel(.21, .64, .03, P.recess, [0, 2.04, .87]), panel(.53, .18, .33, P.dark, [0, 2.67, -.07])];
    for (const s of [-1, 1]) {
      body.push(panel(.77, .72, .98, P.red, [s * .84, 2.35, -.15], [.02, s * .10, s * -.17]));
      body.push(panel(.60, .09, .73, P.edge, [s * .84, 2.70, -.18], [0, 0, s * -.17]));
      body.push(panel(.40, .58, .50, P.red, [s * .48, 2.71, -.44], [-.23, 0, s * -.11]));
      body.push(panel(.26, .38, .13, P.dark, [s * .48, 2.80, -.68], [-.23, 0, 0]));
      body.push(cylinder(.22, .19, P.recess, [s * 1.08, 2.21, .10], [0, 0, Math.PI / 2]));
      vent(body, s * .49, 2.11, -.615, .27, 5); bolts(body, s * .82, 2.40, .376, .22);
      armorSeams(body, s * .84, 2.32, .35, .60, .57);
      body.push(panel(.17, .13, .08, P.yellow, [s * .21, 1.69, .66], [0, 0, s * .26]));
    }
    add('body', body); add('core', [panel(.14, .57, .025, P.glow, [0, 2.05, .895]), bar(.035, .43, .012, 0xffeb92, [0, 2.07, .915])], ORIGIN, 'body', true);
    for (const [name, s] of [['legL', -1], ['legR', 1]] as const) {
      const leg = [panel(.39, .40, .40, P.dark, [0, -.20, -.11], [-.26, 0, s * .10]), panel(.43, .33, .20, P.red, [s * .03, -.21, .13]), cylinder(.18, .44, P.metal, [0, -.43, -.10], [0, 0, Math.PI / 2]), panel(.37, .39, .40, P.red, [0, -.64, -.16], [.10, 0, 0])];
      toeFoot(leg, .55, [s * .035, -.89, -.04]); add(name, leg, [s * .52, 1.0, -.28]);
    }
    for (const [arm, hand, s] of [['armL', 'handL', -1], ['armR', 'handR', 1]] as const) {
      const upper = [panel(.44, .51, .44, P.dark, [0, -.25, .05]), panel(.48, .32, .26, P.metal, [0, -.18, .28], [-.15, 0, 0]), cylinder(.17, .48, P.recess, [0, -.48, .09], [0, 0, Math.PI / 2]), rod([-.13, -.34, .25], [-.13, -1.09, .30], .046, P.yellow), rod([.13, -.34, .25], [.13, -1.09, .30], .046, P.steel)];
      add(arm, upper, [s * .99, 2.19, .075], 'body');
      const fist = [panel(.61, .56, .57, P.red, [s * .05, -.25, .09], [0, 0, s * .075]), panel(.66, .36, .68, P.metal, [s * .05, -.66, .22]), panel(.51, .26, .31, P.dark, [s * .05, -.65, .61])];
      for (let i = -1; i <= 1; i++) { fist.push(panel(.16, .21, .16, P.steel, [s * .05 + i * .183, -.61, .79])); fist.push(cylinder(.029, .02, P.recess, [s * .05 + i * .18, -.72, .787], [Math.PI / 2, 0, 0])); }
      bolts(fist, s * .05, -.20, .39, .20); armorSeams(fist, s * .05, -.27, .379, .50, .43); add(hand, fist, [0, -1.08, .1], arm);
    }
  }
  let disposed = false;
  return { kind, parts, height, footprint, legs, dispose() { if (disposed) return; disposed = true; parts.forEach(p => p.geometry.dispose()); } };
}

/** Same exact geometry and pivots as instanced gameplay, usable in CPU renderers. */
export function createEnemyGroup(model: EnemyModel, material?: THREE.Material, glowMaterial?: THREE.Material): THREE.Group {
  const group = new THREE.Group(); group.name = `enemy-${model.kind}`;
  const opaque = material ?? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .66, metalness: .35, flatShading: true });
  const glow = glowMaterial ?? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const objects = new Map<string, THREE.Mesh>();
  for (const part of model.parts) {
    const mesh = new THREE.Mesh(part.geometry, part.glow ? glow : opaque); mesh.name = part.name; mesh.position.set(...part.pivot);
    if (part.name === 'muzzle') mesh.scale.setScalar(0);
    (part.parent ? objects.get(part.parent)! : group).add(mesh); objects.set(part.name, mesh);
  }
  return group;
}
