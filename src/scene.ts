import * as THREE from 'three';
import { arenaViewport, configureArenaCamera } from './viewport';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createEnemyModel, type EnemyModel, type EnemyModelPart, type EnemyModelKind, type EnemyPartName } from './enemyModels';
import { computeEnemyPose, type AttackPhase, type PartPose } from './enemyAnimation';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ImportedMechs, loadOplotModels } from './oplotModels';
import { createPortalMesh, PORTAL_CLOSE, PORTAL_CAPACITY, spawnRise } from './spawnPortal';

export interface SceneEnemy { id: number | string; kind: EnemyModelKind; x: number; y: number; hp: number; maxHp: number; attackPhase?: AttackPhase; attackTime?: number; attackDuration?: number }
type PortalPoint = { id: string; x: number; y: number; kind: string };
export type SceneSpawn = PortalPoint & { time: number };
export interface SceneFrame {
  enemies: SceneEnemy[];
  bullets: { id: number | string; x: number; y: number }[];
  enemyProjectiles?: { id: number | string; sourceId?: string; x: number; y: number }[];
  paused?: boolean;
  target: { x: number; y: number } | null;
  turretHPfraction: number;
  warnings?: (PortalPoint & { remaining: number })[];
  spawns?: SceneSpawn[];
  phase?: string;
  elapsed?: number;
  shooting?: boolean;
  range?: number;
}
type Kind = SceneEnemy['kind'];
type Piece = { g: THREE.BufferGeometry; color: THREE.ColorRepresentation; p?: number[]; r?: number[]; s?: number[] };
type Particle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; color: number };
type UnitPartBatch = { definition: EnemyModelPart; mesh: THREE.InstancedMesh; world: THREE.Matrix4 };
type UnitBatch = { model: EnemyModel; parts: UnitPartBatch[]; byName: Partial<Record<EnemyPartName, UnitPartBatch>>; count: number };
const C = { cream: 0xe8dbc0, creamLight: 0xf8ecd4, teal: 0x21666a, tealLight: 0x398c8c, cyan: 0x40eeff, charcoal: 0x343d40, dark: 0x1c292e, black: 0x151e21, steel: 0x637075, red: 0xd04d3c, redLight: 0xf47754, amber: 0xffbb43, hazard: 0xdcae43 };
const CITY_FLOOR = .048;
const CITY_YAW = Math.atan2(14, 17) - .20;
const MAX_UNITS = 24;
const MAX_RENDER_DPR = 2;
const MAX_ENEMY_PROJECTILES = 32;
const MAX_BULLETS = 80;
const MAX_PARTICLES = 100;
const v3 = new THREE.Vector3();
const q4 = new THREE.Quaternion();
const sc = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const mLocal = new THREE.Matrix4();
const mRoot = new THREE.Matrix4();
const eul = new THREE.Euler();

function bevelBox(w: number, h: number, d: number, b = .04) {
  b = Math.min(b, w / 5, h / 5, d / 5);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + b, -h / 2 + b);
  shape.lineTo(w / 2 - b, -h / 2 + b);
  shape.lineTo(w / 2 - b, h / 2 - b);
  shape.lineTo(-w / 2 + b, h / 2 - b);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, steps: 1, curveSegments: 1 });
  g.center();
  return g;
}
function box(w: number, h: number, d: number) { return new THREE.BoxGeometry(w, h, d); }
function cyl(r: number, h: number, n = 12, rb = r) { return new THREE.CylinderGeometry(r, rb, h, n); }
function ring(r1: number, r2: number, n = 64) { const g = new THREE.RingGeometry(r1, r2, n); g.rotateX(-Math.PI / 2); return g; }
function merge(pieces: Piece[]) {
  const gs = pieces.map(p => {
    let g = p.g;
    if (g.index) { const ni = g.toNonIndexed(); g.dispose(); g = ni; }
    if (p.s) g.scale(p.s[0], p.s[1], p.s[2]);
    if (p.r) { g.rotateX(p.r[0] || 0); g.rotateY(p.r[1] || 0); g.rotateZ(p.r[2] || 0); }
    if (p.p) g.translate(p.p[0], p.p[1], p.p[2]);
    const color = new THREE.Color(p.color);
    const a = new Float32Array(g.getAttribute('position').count * 3);
    for (let i = 0; i < a.length; i += 3) { a[i] = color.r; a[i + 1] = color.g; a[i + 2] = color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    // All procedural pieces share the same compact attribute layout.
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
    return g;
  });
  const result = mergeGeometries(gs, false)!;
  gs.forEach(g => g.dispose());
  result.computeBoundingSphere();
  return result;
}
function part(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): Piece { return { g, color, p: [x, y, z], r: [rx, ry, rz] }; }
function matrix(x: number, y: number, z: number, ry = 0, sx = 1, sy = sx, sz = sx) {
  v3.set(x, y, z); q4.setFromEuler(eul.set(0, ry, 0)); sc.set(sx, sy, sz); return m4.compose(v3, q4, sc);
}

/** Local visual assets with procedural fallback; simulation state is unchanged. */
export class SceneView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-16, 16, 10, -10, .1, 2000);
  private container: HTMLElement;
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .34, roughness: .68, flatShading: true });
  private glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  private turretHead = new THREE.Group();
  private turretBase = new THREE.Group();
  private city!: THREE.Group;
  private importedMechs?: ImportedMechs;
  private turretGlow = new THREE.Group();
  private barrel: THREE.Group;
  private flash: THREE.Mesh;
  private batches = {} as Record<Kind, UnitBatch>;
  private bulletMesh: THREE.InstancedMesh;
  private enemyProjectileMesh: THREE.InstancedMesh;
  private impactMesh: THREE.InstancedMesh;
  private shadowMesh: THREE.InstancedMesh;
  private particleMesh: THREE.InstancedMesh;
  private portals = createPortalMesh();
  private arrivals = new Map<string, SceneSpawn>();
  private hpBack: THREE.InstancedMesh;
  private hpFront: THREE.InstancedMesh;
  private targetRing: THREE.Mesh;
  private turretRing: THREE.Mesh;
  private rangeRing: THREE.Mesh;
  private particles: Particle[] = [];
  private previous = new Map<number | string, SceneEnemy>();
  private lastBulletIds = new Set<number | string>();
  private pulse = 0;
  private clock = 0;
  private angle = -.5;
  private prevHp = 1;
  private disposed = false;
  private fieldViewport = arenaViewport(390, 844);
  private observer: ResizeObserver;
  private allGeometries = new Set<THREE.BufferGeometry>();
  private allMaterials = new Set<THREE.Material>();
  private allTextures = new Set<THREE.Texture>();
  private showcase: SceneEnemy[] = [
    { id: 'show-a', kind: 'normal', x: -5.5, y: 3.7, hp: 100, maxHp: 100 },
    { id: 'show-b', kind: 'ranged', x: 5.8, y: -2.8, hp: 100, maxHp: 100 },
    { id: 'show-c', kind: 'fast', x: 3.3, y: 5.9, hp: 60, maxHp: 60 },
    { id: 'show-d', kind: 'boss', x: -4.7, y: -6.1, hp: 300, maxHp: 300 },
  ];

  constructor(container: HTMLElement) {
    this.container = container;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'high-performance' });
    if (!context) throw new Error('Your browser does not support WebGL 2. Enable hardware acceleration to launch the arena.');
    this.renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x142a31, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.shadowMap.enabled = false;
    this.renderer.autoClear = false;
    this.renderer.domElement.setAttribute('aria-label', '3D reactor defense arena');
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none;touch-action:manipulation';
    container.appendChild(this.renderer.domElement);
    this.scene.fog = new THREE.FogExp2(0x26353a, .010);
    this.scene.add(new THREE.HemisphereLight(0xeaf8f7, 0x77715c, 2.8));
    const sun = new THREE.DirectionalLight(0xffe7ba, 3.3); sun.position.set(-8, 18, 8); this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x73e6f8, 1.45); rim.position.set(8, 7, -13); this.scene.add(rim);
    this.buildArena();
    void this.loadCityModels();
    this.barrel = this.buildTurret();
    this.flash = new THREE.Mesh(new THREE.OctahedronGeometry(.24, 0), new THREE.MeshBasicMaterial({ color: 0xfff1ad, toneMapped: false, transparent: true, opacity: 1 }));
    this.flash.position.set(0, 1.66, 2.36); this.flash.scale.set(1, 1, 2.8); this.flash.visible = false; this.turretHead.add(this.flash);
    (['normal', 'fast', 'ranged', 'boss'] as Kind[]).forEach(kind => this.batches[kind] = this.buildMech(kind));
    this.bulletMesh = this.instances(new THREE.SphereGeometry(.065, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe69b, toneMapped: false }), MAX_BULLETS);
    this.enemyProjectileMesh = this.instances(new THREE.SphereGeometry(.105, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff5e31, toneMapped: false }), MAX_ENEMY_PROJECTILES);
    this.impactMesh = this.instances(ring(.65, .77, 24), new THREE.MeshBasicMaterial({ color: 0xffac39, transparent: true, opacity: .76, depthWrite: false, toneMapped: false }), MAX_UNITS);
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 32;
    const shadowContext = shadowCanvas.getContext('2d')!;
    const gradient = shadowContext.createRadialGradient(16, 16, 2, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(0,0,0,.75)'); gradient.addColorStop(.45, 'rgba(0,0,0,.45)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
    shadowContext.fillStyle = gradient; shadowContext.fillRect(0, 0, 32, 32);
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas); this.allTextures.add(shadowTexture);
    this.shadowMesh = this.instances(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: .57, depthWrite: false }), MAX_UNITS);
    this.shadowMesh.geometry.rotateX(-Math.PI / 2);
    this.particleMesh = this.instances(new THREE.OctahedronGeometry(.10, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), MAX_PARTICLES);
    this.scene.add(this.portals.mesh);
    this.hpBack = this.instances(new THREE.PlaneGeometry(1, .07), new THREE.MeshBasicMaterial({ color: 0x10262b, transparent: true, opacity: .8, depthWrite: false }), MAX_UNITS);
    this.hpFront = this.instances(new THREE.PlaneGeometry(1, .045), new THREE.MeshBasicMaterial({ color: 0xff7955, toneMapped: false, depthWrite: false }), MAX_UNITS);
    this.targetRing = new THREE.Mesh(ring(.72, .755, 48), new THREE.MeshBasicMaterial({ color: 0xff7252, transparent: true, opacity: .6, toneMapped: false, depthWrite: false }));
    this.targetRing.position.y = .10; this.targetRing.visible = false; this.scene.add(this.targetRing);
    this.turretRing = new THREE.Mesh(ring(1.40, 1.45, 64), new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: .62, toneMapped: false, depthWrite: false }));
    this.turretRing.position.y = .095; this.scene.add(this.turretRing);
    // Centerline is exactly the simulation's firing radius, with subtle ground paint.
    this.rangeRing = new THREE.Mesh(ring(.994, 1.006, 256), new THREE.MeshBasicMaterial({ color: 0xe6faff, transparent: true, opacity: .56, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }));
    this.rangeRing.position.y = .076; this.rangeRing.scale.set(10, 1, 10); this.scene.add(this.rangeRing);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container);
    this.resize();
    void this.loadModels();
  }

  private addGeometry(g: THREE.BufferGeometry, material: THREE.Material = this.material, parent: THREE.Object3D = this.scene) {
    const mesh = new THREE.Mesh(g, material); parent.add(mesh); return mesh;
  }
  private instances(g: THREE.BufferGeometry, material: THREE.Material, n: number) {
    const mesh = new THREE.InstancedMesh(g, material, n); mesh.count = 0; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; this.scene.add(mesh); return mesh;
  }
  private buildArena() {
    const city = this.city = new THREE.Group();
    city.name = 'ruined-city';
    city.rotation.y = CITY_YAW;
    this.scene.add(city);
    const concrete = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0xb3996e, roughness: 1 }));
    ground.name = 'city-continuous-ground';
    ground.rotation.x = -Math.PI / 2; ground.position.y = CITY_FLOOR;
    city.add(ground);

    // Dunes lap against the buses and facades. The inner playfield stays below the portal and shadow planes.
    const drifts = [
      [-6.15, 12.6, 3.0, 1.65, .49], [6.9, 12.3, 2.9, 1.65, .52],
      [-5.5, -15.65, 5.3, 2.75, .73], [5.7, -20.6, 4.9, 3.1, .84],
      [-12.7, -14.2, 3.8, 3.0, .52], [11.85, -14.25, 4.4, 3.05, .65],
      [-14.2, 1.5, 2.35, 6.0, .34], [14.65, -.7, 2.95, 5.6, .37],
    ] as const;
    const sandHeight = (x: number, z: number) => {
      let rise = 0;
      for (const [cx, cz, wx, wz, h] of drifts) {
        const u = (x - cx) / wx, v = (z - cz + (x - cx) * .2) / wz;
        rise += h * Math.exp(-u * u - v * v);
      }
      const open = THREE.MathUtils.smoothstep(Math.hypot(x, z), 12.20, 13.60);
      return .053 + open * rise;
    };
    const sand = new THREE.PlaneGeometry(43, 55, 70, 84).rotateX(-Math.PI / 2);
    const positions = sand.getAttribute('position'), shades = new Float32Array(positions.count * 3);
    const dark = new THREE.Color(0xa58860), sunlit = new THREE.Color(0xc9aa7c), color = new THREE.Color();
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      positions.setY(i, sandHeight(x, z));
      const bands = Math.sin(x * .54 + z * 1.18 + Math.sin(x * .42) * .72);
      const ripple = Math.sin(x * 2.85 - z * 1.35 + Math.sin(z * .45));
      const tint = .57 + .17 * bands + .07 * ripple + .11 * Math.sin(z * .35 - x * .25);
      color.copy(dark).lerp(sunlit, tint);
      color.toArray(shades, i * 3);
    }
    sand.setAttribute('color', new THREE.BufferAttribute(shades, 3));
    sand.computeVertexNormals();
    this.addGeometry(sand, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), city).name = 'city-sand-and-drifts';

    const debris: Piece[] = [], shells: Piece[] = [];
    const block = (list: Piece[], w: number, h: number, d: number, color: number, x: number, y: number, z: number, tilt = 0) =>
      list.push(part(box(w, h, d), color, x, y, z, 0, tilt));
    let seed = 8179;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 96; i++) {
      const side = i % 2 ? -1 : 1, x = side * (5.3 + random() * 7), z = (random() - .5) * 38;
      if (Math.abs(z) < 4) continue;
      const w = .10 + random() * .54, h = .05 + random() * .16, d = .12 + random() * .37;
      const color = [0x938069, 0xac9476, 0x85755f, 0x916f53][i % 4];
      debris.push({ ...part(new THREE.DodecahedronGeometry(.68, 0), color, x, sandHeight(x, z) + h * .13, z, .2, random() * 7, .13), s: [w, h, d] });
    }
    const ruinedShell = (x: number, z: number, width: number, levels: number) => {
      const depth = 3.8, floorHeight = 1.33;
      for (let level = 0; level < levels; level++) {
        const y = CITY_FLOOR + level * floorHeight;
        const span = width * (level === levels - 1 ? .70 : 1);
        block(shells, span, .15, depth, 0x77716a, x, y + .10, z, .03 * level);
        for (let bay = 0; bay < 4; bay++) {
          const post = x - width * .47 + width * bay / 3.2;
          if (bay + level >= 4 && (bay + level) % 3 === 0) continue;
          const c = (bay + level) % 2 ? 0x786f68 : 0x8d8076;
          block(shells, .24, floorHeight * ((bay + level) % 4 ? 1 : .58), .34, c, post, y + floorHeight * .50, z + depth / 2 - .08);
          block(shells, width * .18, .28, .18, 0x725e52, post + .24, y + .34, z + depth / 2);
        }
        block(shells, .28, 1.14, depth * .78, 0x706961, x - span * .47, y + .65, z - .18);
      }
    };
    ruinedShell(-13.8, -17.0, 5.6, 3);
    ruinedShell(10.8, -17.5, 5.1, 3);
    ruinedShell(17.0, -19.8, 5.4, 4);
    ruinedShell(-7.5, -23.5, 5.1, 3);
    this.addGeometry(merge(debris), concrete, city).name = 'city-sand-rubble';
    this.addGeometry(merge(shells), concrete, city).name = 'city-ruined-blocks';

    // Cheap baked turret contact shadow, no shadow maps or full-screen postprocessing.
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
    const ctx = shadowCanvas.getContext('2d')!; const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 31); gradient.addColorStop(0, 'rgba(0,0,0,.6)'); gradient.addColorStop(.55, 'rgba(0,0,0,.24)'); gradient.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(shadowCanvas); this.allTextures.add(texture);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 4.4), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: .9 })); shadow.rotation.x = -Math.PI / 2; shadow.position.set(.25, .071, .25); this.scene.add(shadow);
  }

  private buildTurret() {
    const base: Piece[] = [], head: Piece[] = [], glow: Piece[] = [];
    base.push(part(cyl(1.04, .25, 12), C.charcoal, 0, .2));
    base.push(part(cyl(.91, .43, 10, 1.02), C.teal, 0, .47));
    base.push(part(cyl(.80, .10, 16), C.cream, 0, .72));
    base.push(part(cyl(.69, .15, 16), C.dark, 0, .83));
    for (let i = 0; i < 4; i++) {
      const ang = Math.PI / 4 + i * Math.PI / 2;
      base.push(part(bevelBox(.55, .35, .78, .08), C.charcoal, Math.sin(ang) * 1.01, .22, Math.cos(ang) * 1.01, 0, ang));
      base.push(part(bevelBox(.43, .52, .43, .075), C.cream, Math.sin(ang) * .90, .37, Math.cos(ang) * .90, -.25, ang));
      base.push(part(box(.15, .12, .018), C.dark, Math.sin(ang) * 1.10, .34, Math.cos(ang) * 1.10, 0, ang));
      const g = part(box(.19, .085, .035), C.cyan, Math.sin(ang) * .70, .85, Math.cos(ang) * .70, 0, ang); glow.push(g);
    }
    this.addGeometry(merge(base), this.material, this.turretBase);
    this.addGeometry(merge(glow), this.glowMaterial, this.turretBase);
    this.scene.add(this.turretBase);
    head.push(part(bevelBox(1.68, .81, 1.32, .14), C.cream, 0, 1.39, -.04));
    head.push(part(bevelBox(1.78, .59, .76, .11), C.teal, 0, 1.33, -.28));
    head.push(part(bevelBox(1.38, .09, .88, .04), C.creamLight, 0, 1.85, -.15));
    head.push(part(bevelBox(.59, .15, .61), C.dark, 0, 1.96, -.22));
    head.push(part(bevelBox(.40, .09, .35), C.creamLight, 0, 2.05, -.22));
    head.push(part(bevelBox(.55, .56, .61, .065), C.charcoal, 0, 1.55, .66));
    head.push(part(cyl(.19, .49, 12), C.dark, 0, 1.56, .98, Math.PI / 2));
    for (const s of [-1, 1]) {
      head.push(part(bevelBox(.16, .64, .88, .04), C.cream, s * .77, 1.47, .06, 0, 0, s * .12));
      head.push(part(bevelBox(.11, .37, .33, .025), C.dark, s * .885, 1.48, .23));
      const g = part(box(.018, .24, .20), C.cyan, s * .949, 1.49, .23); this.addGeometry(merge([g]), this.glowMaterial, this.turretGlow);
      for (let j = 0; j < 3; j++) head.push(part(box(.018, .025, .22), C.dark, s * .861, 1.38 + j * .095, -.48));
      head.push(part(box(.025, .20, .115), C.hazard, s * .88, 1.29, -.1, -.35));
    }
    this.addGeometry(merge(head), this.material, this.turretHead);
    this.turretHead.add(this.turretGlow); this.scene.add(this.turretHead);
    const barrel = new THREE.Group();
    const gun = [
      part(bevelBox(.58, .49, .99, .07), C.cream, 0, 1.59, 1.56),
      part(bevelBox(.66, .50, .16, .035), C.charcoal, 0, 1.59, 2.04),
      part(bevelBox(.40, .34, .10, .025), C.dark, 0, 1.59, 2.145),
      part(box(.32, .026, .28), C.hazard, 0, 1.85, 1.65, 0, -.25),
      part(bevelBox(.13, .095, .16), C.charcoal, 0, 1.9, 1.90),
    ];
    this.addGeometry(merge(gun), this.material, barrel);
    this.addGeometry(merge([part(box(.18, .21, .035), C.cyan, 0, 1.59, 2.205)]), this.glowMaterial, barrel);
    this.turretHead.add(barrel); return barrel;
  }

  private async loadCityModels() {
    const path = import.meta.env.BASE_URL + 'assets/city/';
    const loader = new GLTFLoader();
    const props = [
      ['ruined-apartment-shell', [[-5.2, -16.2, .03, 9.3], [5.8, -23.1, -.14, 8.0]]],
      ['wrecked-bus', [[-6.05, 12.72, .43, 5.2], [7.12, 12.52, -.28, 4.8]]],
      ['rubble-heap-medium', [[5.3, -10.6, -.48, 2.0], [-7.1, -7.7, .75, 1.7], [8.7, 9.6, -.8, 1.65]]],
    ] as const;
    const results = await Promise.allSettled(props.map(([name]) => loader.loadAsync(path + name + '.glb')));
    results.forEach((result, i) => {
      if (result.status !== 'fulfilled') return;
      const source = result.value.scene;
      this.registerAsset(source);
      if (this.disposed) return;
      const bounds = new THREE.Box3().setFromObject(source);
      const center = bounds.getCenter(new THREE.Vector3());
      const span = bounds.getSize(new THREE.Vector3());
      for (const [x, z, yaw, width] of props[i][1]) {
        const anchor = new THREE.Group(), model = source.clone();
        model.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
        anchor.position.set(x, CITY_FLOOR, z);
        anchor.rotation.y = yaw;
        anchor.scale.setScalar(width / Math.max(span.x, span.z));
        anchor.add(model); this.city.add(anchor);
      }
    });
    if (!this.disposed && results.every(result => result.status === 'fulfilled')) this.renderer.domElement.dataset.city = 'tevy';
  }

  private registerAsset(scene: THREE.Object3D) {
    scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      if (this.disposed) o.geometry.dispose(); else this.allGeometries.add(o.geometry);
      for (const material of materials) {
        if (this.disposed) material.dispose(); else this.allMaterials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) {
          if (this.disposed) value.dispose(); else this.allTextures.add(value);
        }
      }
    });
  }

  private async loadModels() {
    try {
      const { turret, mechs } = await loadOplotModels();
      const base = turret.scene.getObjectByName('Base');
      const head = turret.scene.getObjectByName('Head');
      const barrel = turret.scene.getObjectByName('Barrel');
      if (!base || !head || !barrel) throw new Error('Missing PolygonDan turret parts');
      for (const { scene } of [turret, ...mechs]) this.registerAsset(scene);
      if (this.disposed) return;
      for (const old of this.turretHead.children) if (old !== this.flash) old.visible = false;
      for (const old of this.turretBase.children) old.visible = false;
      this.turretBase.add(base);
      const recoil = new THREE.Group(); recoil.add(barrel);
      this.turretHead.add(head, recoil); this.barrel = recoil;
      this.flash.position.set(0, 1.68, 2.43);
      this.importedMechs = new ImportedMechs(mechs, this.scene);
      this.renderer.domElement.dataset.art = 'oplot';
    } catch (error) {
      console.warn('Local Oplot models unavailable; using procedural graphics', error);
    }
  }

  private buildMech(kind: Kind): UnitBatch {
    const model = createEnemyModel(kind);
    const parts = model.parts.map(definition => ({ definition, mesh: this.instances(definition.geometry, definition.glow ? this.glowMaterial : this.material, MAX_UNITS), world: new THREE.Matrix4() }));
    const byName: UnitBatch['byName'] = {};
    for (const part of parts) byName[part.definition.name] = part;
    return { model, parts, byName, count: 0 };
  }

  /** Compose the same local pose consumed by the standalone CPU model preview. */
  private poseMatrix(pivot: readonly [number, number, number], pose: PartPose = {}) {
    const p = pose.position ?? [0, 0, 0], r = pose.rotation ?? [0, 0, 0], s = pose.scale ?? [1, 1, 1];
    v3.set(pivot[0] + p[0], pivot[1] + p[1], pivot[2] + p[2]);
    q4.setFromEuler(eul.set(r[0], r[1], r[2])); sc.set(s[0], s[1], s[2]);
    return mLocal.compose(v3, q4, sc);
  }

  resize() {
    if (this.disposed) return;
    const bounds=this.container.getBoundingClientRect();
    const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height);
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_RENDER_DPR));
    this.fieldViewport = arenaViewport(width, height);
    configureArenaCamera(this.camera, this.fieldViewport.width, this.fieldViewport.height);
    // Camera depth changes must not change the visual fog over the central arena.
    (this.scene.fog as THREE.FogExp2).density = .31 / this.camera.position.distanceTo(new THREE.Vector3(0, .4, 0));
  }

  private sparks(x: number, z: number, death: boolean, portal = false) {
    const count = portal ? 10 : death ? 15 : 4;
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const angle = Math.random() * Math.PI * 2, speed = (death ? 2.8 : 1.5) * (.35 + Math.random());
      const life = death || portal ? .45 + Math.random() * .32 : .18 + Math.random() * .18;
      this.particles.push({ x, y: portal ? .13 : death ? .7 : 1.25, z, vx: Math.cos(angle) * speed, vy: 1 + Math.random() * 2.9, vz: Math.sin(angle) * speed, life, max: life, color: portal && i % 3 !== 0 ? 0xff302b : i % 3 === 0 ? C.redLight : C.amber });
    }
  }

  render(frame: SceneFrame, dt: number) {
    if (this.disposed) return;
    dt = frame.paused ? 0 : Math.max(0, Math.min(dt || 0, .05)); this.clock += dt;
    const range = Number.isFinite(frame.range) && frame.range! > 0 ? frame.range! : 10;
    this.rangeRing.scale.set(range, 1, range);
    const playing = frame.phase === 'playing' || frame.phase === 'active' || frame.phase === 'combat' || frame.phase === 'wave';
    const menu = frame.phase === 'menu' || frame.phase === 'ready' || frame.phase === 'title';
    const enemies = menu && !frame.enemies.length ? this.showcase : frame.enemies;
    for (const b of Object.values(this.batches)) b.count = 0;
    this.importedMechs?.begin();
    const next = new Map<number | string, SceneEnemy>();
    let shadowIndex = 0, hpIndex = 0, impactIndex = 0;
    const t = frame.elapsed ?? this.clock;
    if (!playing) this.arrivals.clear();
    for (const [id, spawn] of this.arrivals) if (t - spawn.time >= PORTAL_CLOSE || t < spawn.time) this.arrivals.delete(id);
    if (playing) for (const spawn of frame.spawns ?? []) {
      this.arrivals.set(spawn.id, spawn);
      this.sparks(spawn.x, spawn.y, false, true);
    }
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const cameraFacing = new THREE.Vector3(0, 0, 1).applyQuaternion(this.camera.quaternion);
    for (const enemy of enemies.slice(0, MAX_UNITS)) {
      const b = this.batches[enemy.kind] || this.batches.normal;
      const index = b.count++;
      const angle = Math.atan2(-enemy.x, -enemy.y);
      const pose = computeEnemyPose(menu ? { ...enemy, attackPhase: 'recovery', attackTime: 1, attackDuration: 1 } : enemy, t);
      const arrival = typeof enemy.id === 'string' ? this.arrivals.get(enemy.id) : undefined;
      const rise = arrival ? spawnRise(t - arrival.time) : 1;
      const elevation = .09 - b.model.height * 1.08 * (1 - rise);
      if (this.importedMechs) this.importedMechs.place(enemy, angle, this.clock, b.model.height, menu, elevation);
      else {
        mRoot.copy(matrix(enemy.x, elevation, enemy.y, angle));
        mRoot.multiply(this.poseMatrix([0, 0, 0], pose.root));
        for (const part of b.parts) {
          const def = part.definition, parent = def.parent ? b.byName[def.parent]!.world : mRoot;
          part.world.multiplyMatrices(parent, this.poseMatrix(def.pivot, pose.parts[def.name]));
          part.mesh.setMatrixAt(index, part.world);
        }
      }
      const [shadowWidth, shadowDepth] = b.model.footprint;
      if (rise > .65) this.shadowMesh.setMatrixAt(shadowIndex++, matrix(enemy.x + .11, .067, enemy.y + .11, angle, shadowWidth * 1.25, 1, shadowDepth * 1.45));
      if (pose.impact > 0 && !menu) {
        const reach = enemy.kind === 'boss' ? .90 : .72, size = (enemy.kind === 'boss' ? 1.15 : .48) * (.5 + pose.impact * .5);
        this.impactMesh.setMatrixAt(impactIndex++, matrix(enemy.x + Math.sin(angle) * reach, .08, enemy.y + Math.cos(angle) * reach, 0, size, 1, size));
      }
      if (!menu && rise > .9 && enemy.hp < enemy.maxHp) {
        const fraction = Math.max(.01, enemy.hp / Math.max(1, enemy.maxHp));
        const width = enemy.kind === 'boss' ? 1.55 : .8;
        v3.set(enemy.x, b.model.height + .25, enemy.y); sc.set(width, 1, 1); m4.compose(v3, this.camera.quaternion, sc); this.hpBack.setMatrixAt(hpIndex, m4);
        v3.addScaledVector(cameraRight, -(1 - fraction) * width / 2); v3.addScaledVector(cameraFacing, .012);
        sc.set(width * fraction, 1, 1); m4.compose(v3, this.camera.quaternion, sc); this.hpFront.setMatrixAt(hpIndex++, m4);
      }
      const old = this.previous.get(enemy.id);
      if (old && enemy.hp < old.hp && !menu) this.sparks(enemy.x, enemy.y, false);
      next.set(enemy.id, { ...enemy });
    }
    this.importedMechs?.end();
    if (playing) for (const [id, old] of this.previous) if (!next.has(id)) this.sparks(old.x, old.y, true);
    this.previous = menu ? new Map() : next;
    for (const b of Object.values(this.batches)) for (const { mesh } of b.parts) { mesh.count = this.importedMechs ? 0 : b.count; mesh.instanceMatrix.needsUpdate = true; }
    this.impactMesh.count = impactIndex; this.impactMesh.instanceMatrix.needsUpdate = true;
    this.shadowMesh.count = shadowIndex; this.shadowMesh.instanceMatrix.needsUpdate = true;
    this.hpBack.count = this.hpFront.count = hpIndex; this.hpBack.instanceMatrix.needsUpdate = this.hpFront.instanceMatrix.needsUpdate = true;
    let desired = this.angle;
    if (frame.target) desired = Math.atan2(frame.target.x, frame.target.y);
    else if (menu) desired = -.65 + Math.sin(this.clock * .24) * .40;
    let difference = ((desired - this.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.angle += difference * Math.min(1, dt * 17); this.turretHead.rotation.y = this.angle;
    let bulletIndex = 0;
    const ids = new Set<number | string>();
    for (const bullet of frame.bullets.slice(0, MAX_BULLETS)) {
      ids.add(bullet.id); if (!this.lastBulletIds.has(bullet.id)) this.pulse = .075;
      const angle = Math.atan2(bullet.x, bullet.y);
      this.bulletMesh.setMatrixAt(bulletIndex++, matrix(bullet.x, 1.55, bullet.y, angle, 1, 1, 4));
    }
    this.lastBulletIds = ids; this.bulletMesh.count = bulletIndex; this.bulletMesh.instanceMatrix.needsUpdate = true;
    let enemyProjectileIndex = 0;
    for (const bullet of (frame.enemyProjectiles ?? []).slice(0, MAX_ENEMY_PROJECTILES)) {
      this.enemyProjectileMesh.setMatrixAt(enemyProjectileIndex++, matrix(bullet.x, 1.47, bullet.y, Math.atan2(-bullet.x, -bullet.y), 1, 1, 2.6));
    }
    this.enemyProjectileMesh.count = enemyProjectileIndex; this.enemyProjectileMesh.instanceMatrix.needsUpdate = true;
    if (frame.shooting && !frame.paused) this.pulse = Math.max(this.pulse, .045);
    this.pulse = Math.max(0, this.pulse - dt); this.flash.visible = this.pulse > 0; this.flash.rotation.z = this.clock * 19; this.barrel.position.z = -this.pulse * 1.25;
    if (frame.turretHPfraction < this.prevHp) this.sparks(0, 0, false); this.prevHp = frame.turretHPfraction;
    (this.turretRing.material as THREE.MeshBasicMaterial).color.setHex(frame.turretHPfraction < .25 ? C.redLight : C.cyan);
    (this.turretRing.material as THREE.MeshBasicMaterial).opacity = .44 + Math.sin(this.clock * 2) * .1;
    if (frame.target && playing) { this.targetRing.visible = true; this.targetRing.position.set(frame.target.x, .085, frame.target.y); }
    else this.targetRing.visible = false;
    const { mesh: portalMesh, timing } = this.portals;
    let portalIndex = 0;
    const addPortal = (point: PortalPoint, age: number) => {
      if (portalIndex >= PORTAL_CAPACITY) return;
      const size = point.kind === 'boss' ? 2.6 : 1.63;
      portalMesh.setMatrixAt(portalIndex, matrix(point.x, .081, point.y, 0, size, 1, size));
      timing.setXY(portalIndex++, age, point.x * .73 + point.y * .41);
    };
    if (playing) for (const warning of frame.warnings ?? []) addPortal(warning, -warning.remaining);
    for (const spawn of this.arrivals.values()) addPortal(spawn, t - spawn.time);
    portalMesh.count = portalIndex; portalMesh.instanceMatrix.needsUpdate = timing.needsUpdate = true;
    let pIndex = 0;
    this.particles = this.particles.filter(p => {
      p.life -= dt; if (p.life <= 0) return false;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 8 * dt;
      if (p.y < .12) { p.y = .12; p.vy = Math.abs(p.vy) * .23; }
      this.particleMesh.setMatrixAt(pIndex, matrix(p.x, p.y, p.z, this.clock * 3, Math.min(1.3, p.life / p.max * 2)));
      this.particleMesh.setColorAt(pIndex++, new THREE.Color(p.color)); return true;
    });
    this.particleMesh.count = pIndex; this.particleMesh.instanceMatrix.needsUpdate = true; if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    // Clear the canvas; phone scenes use its whole width, wide desktops are centered.
    // Scissoring prevents animated meshes from leaking into decorative side space.
    this.renderer.setScissorTest(false);
    this.renderer.clear();
    const field = this.fieldViewport;
    this.renderer.setViewport(field.x, field.y, field.width, field.height);
    this.renderer.setScissor(field.x, field.y, field.width, field.height);
    this.renderer.setScissorTest(true);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setScissorTest(false);
  }

  stats() { return { drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures, pixelRatio: this.renderer.getPixelRatio(), enemyDrawCalls: Object.values(this.batches).reduce((sum, b) => sum + (this.importedMechs ? b.count : b.count ? b.parts.length : 0), 0), enemyProjectiles: this.enemyProjectileMesh.count, units: Object.values(this.batches).reduce((sum, b) => sum + b.count, 0), particles: this.particles.length }; }

  dispose() {
    if (this.disposed) return; this.disposed = true; this.observer.disconnect();
    this.importedMechs?.dispose();
    this.scene.traverse(object => { if (object instanceof THREE.Mesh) { this.allGeometries.add(object.geometry); const ms = Array.isArray(object.material) ? object.material : [object.material]; ms.forEach(m => this.allMaterials.add(m)); if (object instanceof THREE.InstancedMesh) object.dispose(); } });
    this.allGeometries.forEach(g => g.dispose()); this.allMaterials.forEach(m => m.dispose()); this.allTextures.forEach(t => t.dispose());
    this.previous.clear(); this.lastBulletIds.clear(); this.particles.length = 0; this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
