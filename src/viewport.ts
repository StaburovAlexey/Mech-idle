import * as THREE from 'three';

/** The world width stays fixed; taller displays reveal more ground vertically. */
export const FIELD_HALF_WIDTH = 12.35;
export interface GameplayViewport { x:number; y:number; width:number; height:number }
/** Phone portraits fill the entire scene width. Wide desktop views are centered. */
export function arenaViewport(width:number,height:number):GameplayViewport {
  const w=Math.max(1,Number.isFinite(width)?width:1),h=Math.max(1,Number.isFinite(height)?height:1);
  const fieldWidth=w<=600?w:Math.min(w,h*1.5);
  return {x:(w-fieldWidth)/2,y:0,width:fieldWidth,height:h};
}

/** Orthographic width is constant; matching the render aspect prevents stretching. */
export function configureArenaCamera(camera: THREE.OrthographicCamera, width=390, height=650): void {
  const w=Math.max(1,Number.isFinite(width)?width:1),h=Math.max(1,Number.isFinite(height)?height:1);
  const halfW=FIELD_HALF_WIDTH,halfH=halfW*h/w;
  const direction=new THREE.Vector3(14,21.6,17).normalize();
  const groundRadius=Math.hypot(halfW,halfH/direction.y)+10;
  const distance=Math.max(60,groundRadius+20);
  camera.left=-halfW;camera.right=halfW;camera.top=halfH;camera.bottom=-halfH;
  camera.position.copy(direction.multiplyScalar(distance)).add(new THREE.Vector3(0,.4,0));
  camera.lookAt(0,.4,0);camera.near=.1;camera.far=distance+groundRadius+40;
  camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
}
