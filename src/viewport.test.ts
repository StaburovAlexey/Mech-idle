import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {CANONICAL_ASPECT,containedGameplayViewport,configureArenaCamera,cameraSpawnGeometry} from './viewport';

const sizes=[[320,568],[390,844],[300,1000],[768,1024],[1366,768],[2560,1080]];
describe('device-independent portrait playfield',()=>{
 it.each(sizes)('contains the complete 9:16 field at %sx%s without cropping or stretch',(w,h)=>{
  const v=containedGameplayViewport(w,h);
  expect(v.x).toBeGreaterThanOrEqual(0);expect(v.y).toBeGreaterThanOrEqual(0);
  expect(v.width).toBeLessThanOrEqual(w);expect(v.height).toBeLessThanOrEqual(h);
  expect(v.width/v.height).toBeCloseTo(CANONICAL_ASPECT,14);
  expect(v.x*2+v.width).toBeCloseTo(w,12);expect(v.y*2+v.height).toBeCloseTo(h,12);
  expect(v.width===w||Math.abs(v.height-h)<1e-9).toBe(true);
 });
 it('has byte-identical projection, spawn geometry and world bounds for every device',()=>{
  const snapshots=sizes.map(([w,h])=>{
   const camera=new THREE.OrthographicCamera();configureArenaCamera(camera,w,h);
   return JSON.stringify({projection:camera.projectionMatrix.elements,world:camera.matrixWorld.elements,geometry:cameraSpawnGeometry(camera),bounds:[camera.left,camera.right,camera.top,camera.bottom]});
  });
  expect(new Set(snapshots).size).toBe(1);
 });
 it('scales horizontal and vertical field distances by one shared factor',()=>{
  const base=containedGameplayViewport(390,844);
  for(const [w,h] of sizes){const v=containedGameplayViewport(w,h);expect(v.width/base.width).toBeCloseTo(v.height/base.height,14);}
 });
});
