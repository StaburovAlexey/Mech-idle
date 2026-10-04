import { parseState, serializeState, type GameState } from './game';
export const SAVE_KEY='oplot.save.v1';
export const BACKUP_KEY='oplot.backup.v1';
export interface StorageLike { getItem(key:string):string|null; setItem(key:string,value:string):void; removeItem(key:string):void }
export type LoadResult={state:GameState|null; warning:string|null; blocked:boolean};
export class SaveRepository {
 constructor(private storage:StorageLike){}
 load():LoadResult {
  const primary=this.storage.getItem(SAVE_KEY),backup=this.storage.getItem(BACKUP_KEY);
  if(primary===null&&backup===null)return {state:null,warning:null,blocked:false};
  if(primary){const state=parseState(primary);if(state)return {state,warning:null,blocked:false};}
  if(backup){const state=parseState(backup);if(state)return {state,warning:'Основное сохранение повреждено. Загружена предыдущая проверенная копия.',blocked:false};}
  return {state:null,warning:'Сохранение повреждено. Прогресс не удалён. Можно скачать копию или подтвердить новый профиль.',blocked:true};
 }
 save(state:GameState):boolean {
  try {const value=serializeState(state);if(!parseState(value))return false;const previous=this.storage.getItem(SAVE_KEY);if(previous&&parseState(previous))this.storage.setItem(BACKUP_KEY,previous);this.storage.setItem(SAVE_KEY,value);return true;}catch{return false;}
 }
 raw():string{return JSON.stringify({primary:this.storage.getItem(SAVE_KEY),backup:this.storage.getItem(BACKUP_KEY)},null,2);}
 reset():void{this.storage.removeItem(SAVE_KEY);this.storage.removeItem(BACKUP_KEY);}
}
export class PauseManager {
 readonly reasons=new Set<string>();
 add(reason:string){this.reasons.add(reason);}
 remove(reason:string){this.reasons.delete(reason);}
 get paused(){return this.reasons.size>0;}
}
export class TabLock {
 private releaseLock:(()=>void)|null=null;
 async acquire():Promise<boolean> {
  return new Promise<boolean>(resolve=>{
   if(!navigator.locks){resolve(false);return;}
   navigator.locks.request('oplot-profile-writer-v1',{ifAvailable:true},async lock=>{
    if(!lock){resolve(false);return;}
    await new Promise<void>(release=>{this.releaseLock=release;resolve(true);});
   }).catch(()=>resolve(false));
  }).catch(()=>false);
 }
 release(){this.releaseLock?.();this.releaseLock=null;}
}
