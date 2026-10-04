import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface SceneEnemy { id: number | string; kind: 'normal' | 'fast' | 'boss'; x: number; y: number; hp: number; maxHp: number }
export interface SceneFrame {
  enemies: SceneEnemy[];
  bullets: { id: number | string; x: number; y: number }[];
  target: { x: number; y: number } | null;
  turretHPfraction: number;
  warnings?: { x: number; y: number }[];
  phase?: string;
  elapsed?: number;
  shooting?: boolean;
}
type Kind = SceneEnemy['kind'];
type Piece = { g: THREE.BufferGeometry; color: THREE.ColorRepresentation; p?: number[]; r?: number[]; s?: number[] };
type Particle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; color: number };
type UnitBatch = { body: THREE.InstancedMesh; leftLeg: THREE.InstancedMesh; rightLeg: THREE.InstancedMesh; leftArm: THREE.InstancedMesh; rightArm: THREE.InstancedMesh; glow: THREE.InstancedMesh; count: number; scale: number; hips: number; shoulders: number };
const C = { sand: 0x968c76, tile: 0xb1a38a, cream: 0xe8dbc0, creamLight: 0xf8ecd4, teal: 0x21666a, tealLight: 0x398c8c, cyan: 0x40eeff, charcoal: 0x343d40, dark: 0x1c292e, black: 0x151e21, steel: 0x637075, red: 0xd04d3c, redLight: 0xf47754, amber: 0xffbb43, hazard: 0xdcae43 };
const MAX_UNITS = 50;
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
function seeded(n: number) { return (Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1; }

/** Original procedural models. No downloaded models, textures, or runtime services. */
export class SceneView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-16, 16, 10, -10, .1, 100);
  private container: HTMLElement;
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .28, roughness: .78, flatShading: true });
  private glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  private turretHead = new THREE.Group();
  private turretGlow = new THREE.Group();
  private barrel: THREE.Group;
  private flash: THREE.Mesh;
  private batches = {} as Record<Kind, UnitBatch>;
  private bulletMesh: THREE.InstancedMesh;
  private shadowMesh: THREE.InstancedMesh;
  private particleMesh: THREE.InstancedMesh;
  private warningMesh: THREE.InstancedMesh;
  private hpBack: THREE.InstancedMesh;
  private hpFront: THREE.InstancedMesh;
  private targetRing: THREE.Mesh;
  private turretRing: THREE.Mesh;
  private particles: Particle[] = [];
  private previous = new Map<number | string, SceneEnemy>();
  private lastBulletIds = new Set<number | string>();
  private pulse = 0;
  private clock = 0;
  private angle = -.5;
  private prevHp = 1;
  private disposed = false;
  private observer: ResizeObserver;
  private allGeometries = new Set<THREE.BufferGeometry>();
  private allMaterials = new Set<THREE.Material>();
  private allTextures = new Set<THREE.Texture>();
  private showcase: SceneEnemy[] = [
    { id: 'show-a', kind: 'normal', x: -5.5, y: 3.7, hp: 100, maxHp: 100 },
    { id: 'show-b', kind: 'normal', x: 5.8, y: -2.8, hp: 100, maxHp: 100 },
    { id: 'show-c', kind: 'fast', x: 3.3, y: 5.9, hp: 60, maxHp: 60 },
    { id: 'show-d', kind: 'boss', x: -4.7, y: -6.1, hp: 300, maxHp: 300 },
  ];

  constructor(container: HTMLElement) {
    this.container = container;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'high-performance' });
    if (!context) throw new Error('Your browser does not support WebGL 2. Enable hardware acceleration to launch the arena.');
    this.renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setClearColor(0x142a31, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.renderer.shadowMap.enabled = false;
    this.renderer.domElement.setAttribute('aria-label', '3D reactor defense arena');
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none;touch-action:manipulation';
    container.appendChild(this.renderer.domElement);
    this.scene.fog = new THREE.FogExp2(0x26353a, .010);
    this.scene.add(new THREE.HemisphereLight(0xeaf8f7, 0x77715c, 2.8));
    const sun = new THREE.DirectionalLight(0xffe7ba, 3.3); sun.position.set(-8, 18, 8); this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x73e6f8, 1.45); rim.position.set(8, 7, -13); this.scene.add(rim);
    this.camera.position.set(14, 22, 17); this.camera.lookAt(0, .4, 0);
    this.buildArena();
    this.barrel = this.buildTurret();
    this.flash = new THREE.Mesh(new THREE.OctahedronGeometry(.24, 0), new THREE.MeshBasicMaterial({ color: 0xfff1ad, toneMapped: false, transparent: true, opacity: 1 }));
    this.flash.position.set(0, 1.66, 2.36); this.flash.scale.set(1, 1, 2.8); this.flash.visible = false; this.turretHead.add(this.flash);
    (['normal', 'fast', 'boss'] as Kind[]).forEach(kind => this.batches[kind] = this.buildMech(kind));
    this.bulletMesh = this.instances(new THREE.SphereGeometry(.065, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffe69b, toneMapped: false }), MAX_BULLETS);
    this.shadowMesh = this.instances(new THREE.CircleGeometry(.66, 24), new THREE.MeshBasicMaterial({ color: 0x0a151b, transparent: true, opacity: .24, depthWrite: false }), MAX_UNITS + 5);
    this.shadowMesh.geometry.rotateX(-Math.PI / 2);
    this.particleMesh = this.instances(new THREE.OctahedronGeometry(.10, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), MAX_PARTICLES);
    this.warningMesh = this.instances(ring(.48, .52, 32), new THREE.MeshBasicMaterial({ color: 0xff7352, transparent: true, opacity: .75, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }), 32);
    this.hpBack = this.instances(new THREE.PlaneGeometry(1, .07), new THREE.MeshBasicMaterial({ color: 0x10262b, transparent: true, opacity: .8, depthWrite: false }), MAX_UNITS);
    this.hpFront = this.instances(new THREE.PlaneGeometry(1, .045), new THREE.MeshBasicMaterial({ color: 0xff7955, toneMapped: false, depthWrite: false }), MAX_UNITS);
    this.targetRing = new THREE.Mesh(ring(.72, .755, 48), new THREE.MeshBasicMaterial({ color: 0xff7252, transparent: true, opacity: .6, toneMapped: false, depthWrite: false }));
    this.targetRing.position.y = .10; this.targetRing.visible = false; this.scene.add(this.targetRing);
    this.turretRing = new THREE.Mesh(ring(1.40, 1.45, 64), new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: .62, toneMapped: false, depthWrite: false }));
    this.turretRing.position.y = .095; this.scene.add(this.turretRing);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(container);
    this.resize();
  }

  private addGeometry(g: THREE.BufferGeometry, material: THREE.Material = this.material, parent: THREE.Object3D = this.scene) {
    const mesh = new THREE.Mesh(g, material); parent.add(mesh); return mesh;
  }
  private instances(g: THREE.BufferGeometry, material: THREE.Material, n: number) {
    const mesh = new THREE.InstancedMesh(g, material, n); mesh.count = 0; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; this.scene.add(mesh); return mesh;
  }
  private buildArena() {
    const a: Piece[] = [], lights: Piece[] = [], trim: Piece[] = [];
    a.push(part(cyl(11.65, .52, 8), C.dark, 0, -.30, 0, 0, Math.PI / 8));
    a.push(part(cyl(11.33, .18, 8), 0x756e61, 0, -.08, 0, 0, Math.PI / 8));
    // Hand-laid, subtly varied tiles with real seams, merged into a single draw.
    let tile = 0;
    for (let x = -10; x <= 10; x += 1.25) for (let z = -10; z <= 10; z += 1.25) {
      if (Math.max(Math.abs(x), Math.abs(z)) > 10.1 || Math.abs(x) + Math.abs(z) > 14.5) continue;
      const color = new THREE.Color(C.tile); color.multiplyScalar(.89 + Math.abs(seeded(++tile)) * .19);
      a.push(part(box(1.225, .055, 1.225), color, x, .02, z));
      if (tile % 13 === 0) a.push(part(box(.20, .007, .025), 0x817b6c, x + .24, .052, z - .28, 0, .7));
    }
    // Low chamfered rim: it frames the playable circle without hiding attackers.
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const x = Math.sin(angle) * 10.67, z = Math.cos(angle) * 10.67;
      a.push(part(bevelBox(8.22, .32, .40, .055), C.charcoal, x, .13, z, 0, angle));
      a.push(part(box(7.92, .055, .16), 0x9a9683, x, .32, z, 0, angle));
      for (let k = -3; k <= 3; k++) {
        const lx = k * .92;
        const wx = x + Math.cos(angle) * lx, wz = z - Math.sin(angle) * lx;
        a.push(part(box(.38, .018, .21), k % 2 ? C.hazard : 0x5b605a, wx, .354, wz, 0, angle + .35));
      }
      for (const side of [-1, 1]) {
        const wx = x + Math.cos(angle) * side * 3.94, wz = z - Math.sin(angle) * side * 3.94;
        a.push(part(bevelBox(.28, .48, .63), C.steel, wx, .17, wz, 0, angle));
        lights.push(part(box(.11, .025, .16), C.cyan, wx, .423, wz, 0, angle));
      }
    }
    // Technical paint and broken white calibration circle around the emplacement.
    for (let i = 0; i < 24; i++) {
      const ang = i * Math.PI / 12;
      trim.push(part(box(.24, .012, i % 6 === 0 ? .32 : .07), 0xe7dac0, Math.sin(ang) * 1.77, .059, Math.cos(ang) * 1.77, 0, ang));
    }
    for (let i = 0; i < 4; i++) {
      const ang = i * Math.PI / 2;
      trim.push(part(box(.075, .012, 1.4), 0xcdbea0, Math.sin(ang) * 8.65, .060, Math.cos(ang) * 8.65, 0, ang));
      trim.push(part(box(.55, .012, .06), 0xcdbea0, Math.sin(ang) * 9.38, .060, Math.cos(ang) * 9.38, 0, ang));
    }
    // Four compact coolant columns, retaining the reference's cyan / graphite language.
    for (const [x, z] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) {
      a.push(part(cyl(.47, .18, 6, .58), C.dark, x, .14, z));
      a.push(part(cyl(.27, .16, 8, .34), C.cream, x, .34, z));
      a.push(part(cyl(.21, 1.04, 8), C.teal, x, .92, z));
      lights.push(part(cyl(.17, .81, 8), C.cyan, x, .91, z));
      a.push(part(cyl(.31, .19, 8), C.charcoal, x, 1.43, z));
      a.push(part(cyl(.24, .06, 8), C.cream, x, 1.56, z));
      for (let j = 0; j < 3; j++) { const t = j * Math.PI * 2 / 3; a.push(part(box(.07, .92, .06), C.charcoal, x + Math.sin(t) * .22, .92, z + Math.cos(t) * .22)); }
      for (let j = 0; j < 4; j++) { const t = j * Math.PI / 2; a.push(part(bevelBox(.21, .30, .30), C.charcoal, x + Math.sin(t) * .39, .22, z + Math.cos(t) * .39, 0, t)); }
    }
    // Industrial cargo outside the firing zone, with beveled panels and amber markings.
    for (let i = 0; i < 10; i++) {
      const ang = i * Math.PI * 2 / 10 + .12;
      const x = Math.sin(ang) * 12.3, z = Math.cos(ang) * 12.3;
      const h = .55 + (i % 3) * .19;
      a.push(part(bevelBox(1.05, h, .85, .09), i % 2 ? C.charcoal : C.teal, x, h / 2 - .07, z, 0, ang));
      a.push(part(bevelBox(.82, .065, .66), C.cream, x, h - .01, z, 0, ang));
      a.push(part(box(.07, h + .035, .88), 0x728080, x - Math.cos(ang) * .32, h / 2 - .06, z + Math.sin(ang) * .32, 0, ang));
      a.push(part(box(.07, h + .035, .88), 0x728080, x + Math.cos(ang) * .32, h / 2 - .06, z - Math.sin(ang) * .32, 0, ang));
      trim.push(part(box(.22, .018, .19), C.hazard, x, h + .03, z, 0, ang));
    }
    // Angular far-ground silhouettes and a dark sand plinth visually ground the diorama.
    const ground = new THREE.Mesh(new THREE.CircleGeometry(38, 64), new THREE.MeshStandardMaterial({ color: 0x24363b, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -.62; this.scene.add(ground);
    for (let i = 0; i < 16; i++) {
      const ang = i * Math.PI * 2 / 16 + .15, r = 14.7 + (i % 3) * 1.6;
      a.push({ g: new THREE.DodecahedronGeometry(1, 0), color: i % 2 ? 0x435158 : 0x526067, p: [Math.sin(ang) * r, -.5, Math.cos(ang) * r], s: [1.3 + (i % 3) * .4, .8 + (i % 4) * .35, 1.4], r: [0, ang, .18] });
    }
    this.addGeometry(merge(a)); this.addGeometry(merge(lights), this.glowMaterial); this.addGeometry(merge(trim));
    this.addFloorLabels();
    // Cheap soft contact shadows, no shadow maps or full-screen postprocessing.
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
    const ctx = shadowCanvas.getContext('2d')!; const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 31); gradient.addColorStop(0, 'rgba(0,0,0,.6)'); gradient.addColorStop(.55, 'rgba(0,0,0,.24)'); gradient.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(shadowCanvas); this.allTextures.add(texture);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 4.4), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: .9 })); shadow.rotation.x = -Math.PI / 2; shadow.position.set(.25, .071, .25); this.scene.add(shadow);
  }

  private addFloorLabels() {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ded2b5'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 70px monospace'; ctx.fillText('SECTOR  //  07', 512, 64);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; this.allTextures.add(texture);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(4.7, .59), new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: .38, depthWrite: false })); label.rotation.x = -Math.PI / 2; label.position.set(0, .065, 8.3); this.scene.add(label);
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
    this.addGeometry(merge(base)); this.addGeometry(merge(glow), this.glowMaterial);
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

  private buildMech(kind: Kind): UnitBatch {
    const fast = kind === 'fast', boss = kind === 'boss';
    const scale = boss ? 1.48 : fast ? .77 : 1;
    const width = boss ? 1.17 : fast ? .64 : .88;
    const hips = fast ? .21 : boss ? .39 : .29;
    const shoulders = fast ? .42 : boss ? .77 : .60;
    const red = boss ? 0xbb4437 : C.red;
    const b: Piece[] = [], gl: Piece[] = [];
    b.push(part(bevelBox(width, .52, .52, .09), C.charcoal, 0, 1.40));
    b.push(part(bevelBox(width * .88, .30, .20, .05), C.steel, 0, 1.34, .29, -.13));
    b.push(part(bevelBox(width * .69, .18, .48, .055), C.dark, 0, 1.02));
    b.push(part(bevelBox(width * .67, .15, .43, .045), C.red, 0, 1.13, .03));
    b.push(part(bevelBox(width * .51, .32, .37, .065), C.dark, 0, 1.77, .045));
    b.push(part(bevelBox(width * .57, .09, .42, .03), red, 0, 1.96, .035));
    gl.push(part(bevelBox(width * .32, .10, .035, .015), C.amber, 0, 1.79, .25));
    b.push(part(bevelBox(width * .30, .16, .04, .02), red, 0, 1.33, .407, 0, 0, .1));
    for (const s of [-1, 1]) {
      b.push(part(bevelBox(fast ? .36 : boss ? .58 : .48, .43, .60, .075), red, s * shoulders, 1.65, -.005, 0, 0, s * -.29));
      b.push(part(bevelBox(.16, .10, .43), C.redLight, s * shoulders, 1.86, .07, 0, 0, s * -.29));
      b.push(part(cyl(.105, .05, 8), C.dark, s * (shoulders + .12), 1.59, .32, Math.PI / 2));
      b.push(part(bevelBox(.12, .39, .20, .025), C.dark, s * width * .31, 1.48, -.35));
    }
    if (fast) {
      b.push(part(bevelBox(.15, .46, .09, .018), red, -.20, 2.00, -.12, 0, 0, -.28));
      b.push(part(bevelBox(.12, .35, .09, .018), red, .20, 1.98, -.12, 0, 0, .30));
    }
    if (boss) {
      b.push(part(bevelBox(.37, .50, .22, .06), C.charcoal, 0, 1.47, .38));
      gl.push(part(bevelBox(.115, .31, .025, .025), C.amber, 0, 1.48, .505));
      b.push(part(bevelBox(.48, .36, .39, .07), red, -.39, 1.91, -.22, 0, 0, -.12));
      b.push(part(bevelBox(.48, .36, .39, .07), red, .39, 1.91, -.22, 0, 0, .12));
      b.push(part(bevelBox(.29, .16, .30), C.dark, 0, 2.10, -.28));
    }
    const leg = (s: number) => {
      const w = fast ? .13 : boss ? .34 : .23;
      return merge([
        part(bevelBox(w, .40, .25, .035), C.dark, 0, -.20),
        part(bevelBox(w + .10, .27, .18, .045), red, s * .025, -.15, .13, -.15, 0, s * -.08),
        part(cyl(w * .6, w + .08, 8), C.steel, 0, -.40, .035, 0, 0, Math.PI / 2),
        part(bevelBox(w * 1.12, .37, .28, .045), C.charcoal, 0, -.62, -.015, .16),
        part(bevelBox(w * .82, .22, .09, .025), boss ? red : C.steel, 0, -.59, .15, .16),
        part(bevelBox(w + .12, .15, .48, .045), C.dark, 0, -.86, .10),
        part(bevelBox(w + .09, .10, .21, .025), C.steel, 0, -.88, .285),
      ]);
    };
    const arm = (s: number) => {
      const w = fast ? .13 : boss ? .31 : .23;
      return merge([
        part(bevelBox(w, .36, .24, .035), C.dark, 0, -.24),
        part(cyl(w * .61, w + .065, 8), C.steel, 0, -.39, .055, 0, 0, Math.PI / 2),
        part(bevelBox(w + .09, .40, .32, .06), red, s * .025, -.59, .075, -.12, 0, s * .10),
        part(bevelBox(w, .22, .28, .04), C.charcoal, 0, -.85, .10),
        part(bevelBox(w * .75, .07, .09, .018), C.steel, 0, -.82, .265),
      ]);
    };
    return {
      body: this.instances(merge(b), this.material, MAX_UNITS),
      glow: this.instances(merge(gl), this.glowMaterial, MAX_UNITS),
      leftLeg: this.instances(leg(-1), this.material, MAX_UNITS),
      rightLeg: this.instances(leg(1), this.material, MAX_UNITS),
      leftArm: this.instances(arm(-1), this.material, MAX_UNITS),
      rightArm: this.instances(arm(1), this.material, MAX_UNITS),
      count: 0, scale, hips, shoulders,
    };
  }

  resize() {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth), height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    const halfH = Math.max(9.6, 12.35 / aspect);
    this.camera.left = -halfH * aspect; this.camera.right = halfH * aspect; this.camera.top = halfH; this.camera.bottom = -halfH; this.camera.updateProjectionMatrix();
  }

  private sparks(x: number, z: number, death: boolean) {
    const count = death ? 15 : 4;
    for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
      const angle = Math.random() * Math.PI * 2, speed = (death ? 2.8 : 1.5) * (.35 + Math.random());
      const life = death ? .45 + Math.random() * .32 : .18 + Math.random() * .18;
      this.particles.push({ x, y: death ? .7 : 1.25, z, vx: Math.cos(angle) * speed, vy: 1 + Math.random() * 2.9, vz: Math.sin(angle) * speed, life, max: life, color: i % 3 === 0 ? C.redLight : C.amber });
    }
  }

  render(frame: SceneFrame, dt: number) {
    if (this.disposed) return;
    dt = Math.max(0, Math.min(dt || 0, .05)); this.clock += dt;
    const playing = frame.phase === 'playing' || frame.phase === 'active' || frame.phase === 'combat' || frame.phase === 'wave';
    const menu = frame.phase === 'menu' || frame.phase === 'ready' || frame.phase === 'title';
    const enemies = menu && !frame.enemies.length ? this.showcase : frame.enemies;
    for (const b of Object.values(this.batches)) b.count = 0;
    const next = new Map<number | string, SceneEnemy>();
    let shadowIndex = 0, hpIndex = 0;
    const t = frame.elapsed ?? this.clock;
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const cameraFacing = new THREE.Vector3(0, 0, 1).applyQuaternion(this.camera.quaternion);
    for (const enemy of enemies.slice(0, MAX_UNITS)) {
      const b = this.batches[enemy.kind] || this.batches.normal;
      const index = b.count++;
      const angle = Math.atan2(-enemy.x, -enemy.y);
      const seed = typeof enemy.id === 'number' ? enemy.id : String(enemy.id).length * 3;
      const gait = t * (enemy.kind === 'fast' ? 13 : enemy.kind === 'boss' ? 5 : 8) + seed * 1.4;
      const walk = menu ? .05 : .32;
      const bob = Math.abs(Math.sin(gait)) * (menu ? .012 : .040);
      mRoot.copy(matrix(enemy.x, .09 + bob * b.scale, enemy.y, angle, b.scale));
      b.body.setMatrixAt(index, mRoot); b.glow.setMatrixAt(index, mRoot);
      const limb = (mesh: THREE.InstancedMesh, x: number, y: number, rx: number, rz: number) => {
        q4.setFromEuler(eul.set(rx, 0, rz)); v3.set(x, y, 0); sc.set(1, 1, 1); mLocal.compose(v3, q4, sc); m4.multiplyMatrices(mRoot, mLocal); mesh.setMatrixAt(index, m4);
      };
      limb(b.leftLeg, -b.hips, .93, Math.sin(gait) * walk, -.04);
      limb(b.rightLeg, b.hips, .93, -Math.sin(gait) * walk, .04);
      limb(b.leftArm, -b.shoulders, 1.59, -Math.sin(gait) * walk * .65 - .12, -.10);
      limb(b.rightArm, b.shoulders, 1.59, Math.sin(gait) * walk * .65 - .12, .10);
      this.shadowMesh.setMatrixAt(shadowIndex++, matrix(enemy.x + .15, .067, enemy.y + .15, 0, b.scale, 1, b.scale * .75));
      if (!menu && enemy.hp < enemy.maxHp) {
        const fraction = Math.max(.01, enemy.hp / Math.max(1, enemy.maxHp));
        const width = enemy.kind === 'boss' ? 1.55 : .8;
        v3.set(enemy.x, 2.32 * b.scale, enemy.y); sc.set(width, 1, 1); m4.compose(v3, this.camera.quaternion, sc); this.hpBack.setMatrixAt(hpIndex, m4);
        v3.addScaledVector(cameraRight, -(1 - fraction) * width / 2); v3.addScaledVector(cameraFacing, .012);
        sc.set(width * fraction, 1, 1); m4.compose(v3, this.camera.quaternion, sc); this.hpFront.setMatrixAt(hpIndex++, m4);
      }
      const old = this.previous.get(enemy.id);
      if (old && enemy.hp < old.hp && !menu) this.sparks(enemy.x, enemy.y, false);
      next.set(enemy.id, { ...enemy });
    }
    if (playing) for (const [id, old] of this.previous) if (!next.has(id)) this.sparks(old.x, old.y, true);
    this.previous = menu ? new Map() : next;
    for (const b of Object.values(this.batches)) for (const mesh of [b.body, b.glow, b.leftLeg, b.rightLeg, b.leftArm, b.rightArm]) { mesh.count = b.count; mesh.instanceMatrix.needsUpdate = true; }
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
    if (frame.shooting) this.pulse = Math.max(this.pulse, .045);
    this.pulse = Math.max(0, this.pulse - dt); this.flash.visible = this.pulse > 0; this.flash.rotation.z = this.clock * 19; this.barrel.position.z = -this.pulse * 1.25;
    if (frame.turretHPfraction < this.prevHp) this.sparks(0, 0, false); this.prevHp = frame.turretHPfraction;
    (this.turretRing.material as THREE.MeshBasicMaterial).color.setHex(frame.turretHPfraction < .25 ? C.redLight : C.cyan);
    (this.turretRing.material as THREE.MeshBasicMaterial).opacity = .44 + Math.sin(this.clock * 2) * .1;
    if (frame.target && playing) { this.targetRing.visible = true; this.targetRing.position.set(frame.target.x, .085, frame.target.y); }
    else this.targetRing.visible = false;
    const warnings = (frame.warnings || []).slice(0, 32);
    warnings.forEach((w, i) => this.warningMesh.setMatrixAt(i, matrix(w.x, .075, w.y, 0, 1.3 + Math.sin(this.clock * 8) * .2, 1, 1.3 + Math.sin(this.clock * 8) * .2)));
    this.warningMesh.count = warnings.length; this.warningMesh.instanceMatrix.needsUpdate = true;
    let pIndex = 0;
    this.particles = this.particles.filter(p => {
      p.life -= dt; if (p.life <= 0) return false;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 8 * dt;
      if (p.y < .12) { p.y = .12; p.vy = Math.abs(p.vy) * .23; }
      this.particleMesh.setMatrixAt(pIndex, matrix(p.x, p.y, p.z, this.clock * 3, Math.min(1.3, p.life / p.max * 2)));
      this.particleMesh.setColorAt(pIndex++, new THREE.Color(p.color)); return true;
    });
    this.particleMesh.count = pIndex; this.particleMesh.instanceMatrix.needsUpdate = true; if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  stats() { return { drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures, pixelRatio: this.renderer.getPixelRatio(), units: Object.values(this.batches).reduce((sum, b) => sum + b.count, 0), particles: this.particles.length }; }

  dispose() {
    if (this.disposed) return; this.disposed = true; this.observer.disconnect();
    this.scene.traverse(object => { if (object instanceof THREE.Mesh) { this.allGeometries.add(object.geometry); const ms = Array.isArray(object.material) ? object.material : [object.material]; ms.forEach(m => this.allMaterials.add(m)); if (object instanceof THREE.InstancedMesh) object.dispose(); } });
    this.allGeometries.forEach(g => g.dispose()); this.allMaterials.forEach(m => m.dispose()); this.allTextures.forEach(t => t.dispose());
    this.previous.clear(); this.lastBulletIds.clear(); this.particles.length = 0; this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
