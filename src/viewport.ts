import * as THREE from 'three';
import { ARENA_ASPECT, ARENA_HALF_WIDTH, type SpawnGeometry } from './spawnGeometry';

/** Gameplay dimensions never depend on the device. Only this portrait image is scaled. */
export const CANONICAL_ASPECT = ARENA_ASPECT;
export const CANONICAL_HALF_WIDTH = ARENA_HALF_WIDTH;
export const CANONICAL_HALF_HEIGHT = CANONICAL_HALF_WIDTH / CANONICAL_ASPECT;
export interface GameplayViewport { x:number; y:number; width:number; height:number }
/** CSS pixel viewport, centered without crop or non-uniform stretching. */
export function containedGameplayViewport(width:number,height:number):GameplayViewport {
  const w=Math.max(1,Number.isFinite(width)?width:1),h=Math.max(1,Number.isFinite(height)?height:1);
  const fieldWidth=Math.min(w,h*CANONICAL_ASPECT),fieldHeight=fieldWidth/CANONICAL_ASPECT;
  return {x:(w-fieldWidth)/2,y:(h-fieldHeight)/2,width:fieldWidth,height:fieldHeight};
}

export const arenaViewport = containedGameplayViewport;

/** Fixed orthographic composition and depth on every device, including at resize. */
export function configureArenaCamera(camera: THREE.OrthographicCamera, _width?: number, _height?: number): void {
  const halfH = CANONICAL_HALF_HEIGHT, halfW = CANONICAL_HALF_WIDTH;
  const direction = new THREE.Vector3(14, 21.6, 17).normalize();
  const groundRadius = Math.hypot(halfW, halfH / direction.y) + 10;
  const distance = Math.max(60, groundRadius + 20);
  camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH;
  camera.position.copy(direction.multiplyScalar(distance)).add(new THREE.Vector3(0, .4, 0));
  camera.lookAt(0, .4, 0);
  camera.near = .1; camera.far = distance + groundRadius + 40;
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
}
export function cameraSpawnGeometry(camera: THREE.OrthographicCamera): SpawnGeometry {
  camera.updateMatrixWorld(true);
  const m = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).elements;
  return {
    horizontal: { x: m[0], y: m[8], height: m[4], offset: m[12] },
    vertical: { x: m[1], y: m[9], height: m[5], offset: m[13] },
  };
}
