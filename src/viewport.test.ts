import {afterEach,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {SceneView} from './scene';
import {FIELD_HALF_WIDTH,arenaViewport,configureArenaCamera} from './viewport';

const sizes=[[300,382],[320,383],[390,650],[428,730],[568,155],[768,820],[1366,580],[2560,900]];
describe('full-width phone scene with fixed world width',()=>{
 it.each(sizes)('keeps the viewport inside the middle region at %sx%s',(w,h)=>{
  const v=arenaViewport(w,h);
  expect(v.x).toBeGreaterThanOrEqual(0);expect(v.y).toBe(0);
  expect(v.width).toBeLessThanOrEqual(w);expect(v.height).toBe(h);
  expect(v.x*2+v.width).toBeCloseTo(w,12);
  if(w<=600){expect(v.x).toBe(0);expect(v.width).toBe(w);}
 });
 it.each(sizes)('preserves camera scale and undistorted projection at %sx%s',(w,h)=>{
  const v=arenaViewport(w,h),camera=new THREE.OrthographicCamera();
  configureArenaCamera(camera,v.width,v.height);
  expect(camera.right-camera.left).toBe(FIELD_HALF_WIDTH*2);
  expect((camera.right-camera.left)/(camera.top-camera.bottom)).toBeCloseTo(v.width/v.height,12);
  const center=new THREE.Vector3(0,.4,0).project(camera);
  expect(center.x).toBeCloseTo(0,12);expect(center.y).toBeCloseTo(0,12);
  const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);
  const up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1);
  const horizontal=right.add(new THREE.Vector3(0,.4,0)).project(camera);
  const vertical=up.add(new THREE.Vector3(0,.4,0)).project(camera);
  expect(Math.abs(horizontal.x-center.x)*v.width/2).toBeCloseTo(Math.abs(vertical.y-center.y)*v.height/2,10);
  expect(camera.far).toBeGreaterThan(camera.position.length()+20);
 });
 it('reveals more ground vertically on a taller phone without changing horizontal world scale',()=>{
  const short=new THREE.OrthographicCamera(),tall=new THREE.OrthographicCamera();
  configureArenaCamera(short,390,400);configureArenaCamera(tall,390,650);
  expect(tall.left).toBe(short.left);expect(tall.right).toBe(short.right);
  expect(tall.top).toBeGreaterThan(short.top);
  const p=new THREE.Vector3(6,0,5);
  expect(p.clone().project(short).x).toBeCloseTo(p.clone().project(tall).x,12);
 });
 it.each([[320,383],[390,650],[1280,540]])('keeps the range10 ring inside a portrait phone or desktop field %sx%s',(w,h)=>{
  const v=arenaViewport(w,h),camera=new THREE.OrthographicCamera();configureArenaCamera(camera,v.width,v.height);
  for(let i=0;i<128;i++){
   const p=new THREE.Vector3(Math.cos(i*Math.PI/64)*10,.076,Math.sin(i*Math.PI/64)*10).project(camera);
   expect(Math.abs(p.x)).toBeLessThan(1);expect(Math.abs(p.y)).toBeLessThan(1);expect(Math.abs(p.z)).toBeLessThan(1);
  }
 });
 it('guards invalid/zero dimensions without producing an invalid camera',()=>{
  const v=arenaViewport(NaN,0),camera=new THREE.OrthographicCamera();configureArenaCamera(camera,v.width,v.height);
  expect(v).toEqual({x:0,y:0,width:1,height:1});expect(camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true);
 });
});

// The real resize method must use the middle row, including fractional CSS dimensions.
afterEach(()=>vi.unstubAllGlobals());
describe('scene resize integration without WebGL',()=>{
 it.each([[320,382.8125,1],[390,649.53125,3],[1280,540,2]])('resizes the actual camera from its own region %sx%s at DPR%s',(width,height,dpr)=>{
  vi.stubGlobal('window',{devicePixelRatio:dpr});
  const camera=new THREE.OrthographicCamera(),scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x26353a);
  const target={disposed:false,container:{getBoundingClientRect:()=>({width,height})},renderer:{setSize:vi.fn(),setPixelRatio:vi.fn()},camera,scene,fieldViewport:arenaViewport(1,1)};
  (SceneView.prototype.resize as unknown as (this:typeof target)=>void).call(target);
  expect(target.renderer.setSize).toHaveBeenCalledWith(width,height,false);
  expect(target.renderer.setPixelRatio).toHaveBeenCalledWith(Math.min(dpr,1.5));
  expect(target.fieldViewport).toEqual(arenaViewport(width,height));
  expect(camera.right-camera.left).toBe(FIELD_HALF_WIDTH*2);
  expect((camera.right-camera.left)/(camera.top-camera.bottom)).toBeCloseTo(target.fieldViewport.width/height,12);
  if(width<=600)expect(target.fieldViewport.width).toBe(width);
 });
});
