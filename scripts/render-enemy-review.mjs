/** Offline projection of the exact gameplay meshes and poses. No WebGL, no concept art. */
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import * as THREE from 'three';
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js';
import { createEnemyModel, createEnemyGroup } from '../src/enemyModels.ts';
import { computeEnemyPose, applyEnemyPose } from '../src/enemyAnimation.ts';
const out=process.argv[2]??'artifacts/enemies-3d-review.svg';
const dom=new JSDOM('<!doctype html>');globalThis.document=dom.window.document;
const names=['ШТУРМ','РЫВОК','СТРЕЛОК','КОЛОСС'];
const kinds=['normal','fast','ranged','boss'];
const desc=['Поршневой удар','Рывок с клинками','Четыре опоры · пушка','Два тяжёлых удара'];
const width=1800,height=1100,cellW=430,cellH=415;
const renderer=new SVGRenderer();renderer.setSize(cellW,cellH);renderer.setPrecision(2);renderer.setQuality('high');
const scene=new THREE.Scene();scene.background=new THREE.Color(0xe6dfd2);
scene.add(new THREE.AmbientLight(0xffffff,.65));
const sun=new THREE.DirectionalLight(0xffefda,1.4);sun.position.set(-4,8,6);scene.add(sun);
const rim=new THREE.DirectionalLight(0xb6d3e0,.35);rim.position.set(5,4,-3);scene.add(rim);
const camera=new THREE.OrthographicCamera(-2.12,2.12,2.04,-2.04,.1,60);camera.position.set(5,4.6,7);camera.lookAt(0,1.3,.1);camera.updateProjectionMatrix();
let fragments=[];
const text=(x,y,str,size=18,color='#44473f',weight=500)=>`<text x="${x}" y="${y}" font-family="DejaVu Sans,sans-serif" font-size="${size}" fill="${color}" font-weight="${weight}">${str}</text>`;
fragments.push(`<rect width="${width}" height="${height}" fill="#e6dfd2"/>`,text(34,46,'ОПЛОТ / МОДЕЛИ ИЗ ИГРЫ',32,'#202c2d',800),text(34,77,'Точная процедурная геометрия и позы · CPU-проекция без WebGL',17));
for(let i=0;i<4;i++){
 const model=createEnemyModel(kinds[i]),group=createEnemyGroup(model);scene.add(group);
 const baseX=25+i*445;
 fragments.push(text(baseX+12,117,names[i],27,'#263133',800),text(baseX+12,143,desc[i],16));
 for(let row=0;row<2;row++){
  const strikeTime=kinds[i]==='boss'?.32:.045;
  const state={kind:kinds[i],id:'review',attackPhase:row?'strike':'approach',attackTime:row?strikeTime:0,attackDuration:row?(kinds[i]==='boss'?.55:.2):0};
  applyEnemyPose(group,model,computeEnemyPose(state,0));
  renderer.render(scene,camera);
  const inner=renderer.domElement.innerHTML;
  const y=row?646:166;
  fragments.push(`<svg x="${baseX}" y="${y}" width="${cellW}" height="${cellH}" viewBox="-${cellW/2} -${cellH/2} ${cellW} ${cellH}">${inner}</svg>`);
  if(!row)fragments.push(text(baseX+12,610,'АТАКА',20,'#263133',800));
 }
 scene.remove(group);group.traverse(o=>{if(o.isMesh)o.material.dispose();});model.dispose();
 if(i<3)fragments.push(`<path d="M${baseX+438} 104V1065" stroke="#a9a89d" stroke-width="1"/>`);
}
fragments.push(text(34,1090,'Это проверка моделей, а не скриншот игрового GPU-рендера. Освещение CPU упрощено.',14,'#66685f'));
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${fragments.join('')}</svg>`);
console.log(out);
