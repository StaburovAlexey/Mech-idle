import './style.css';
import './title.css';
import './workshop.css';
import './workshop-gates.css';
import './battle-dock.css';
import { workshopMarkup } from './workshop-ui';
import { titleMarkup } from './title-ui';
import {createState,startRun,step,buyRunUpgrade,buyMetaUpgrade,setPaused,getStats,calculateStats,runPrice,metaPrice,STAT_KEYS,DT,type GameState,type StatKey} from './game';
import {SceneView,type SceneFrame, type SceneSpawn} from './scene';
import {SaveRepository,PauseManager,TabLock} from './persistence';
import {LocalPlatformAdapter} from './platform';
import {Sound} from './audio';
import {BattleMenuController,battleHudMarkup,battleMenuMarkup,bossBarMarkup,battleUpgradeDockMarkup,bindBattleUpgradeTabs,STAT_LABELS,isInteractiveTarget} from './battle-ui';
const $=<T extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const root=$('#app');
for (const type of ['contextmenu', 'dragstart']) {
 root.addEventListener(type, event => event.preventDefault());
}
root.innerHTML=`<div class="shell"><header class="topbar"><div class="brand"><div class="brand-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 27v-6l6-5V6h12v7h6v7h-6v7H5Z" stroke="currentColor" stroke-width="2"/><path d="M14 10h5v5h-5z" fill="currentColor"/></svg></div><div><div class="brand-name">ОПЛОТ</div><div class="brand-sub">Турель и мехи</div></div></div><div class="top-actions"><span class="pill"><span class="live-dot"></span>СЕКТОР 07</span><button class="icon-button" id="sound" aria-label="Включить звук" title="Звук">♪</button><button class="icon-button" id="help" aria-label="Как играть" title="Как играть">?</button></div></header><div id="notice" class="status-warning hidden" role="status"></div><p id="title-render-warning" class="status-warning hidden" role="status">Для запуска боя нужен WebGL2. Откройте игру в браузере с аппаратным ускорением.</p><main class="workspace"><section class="panel" id="panel" aria-label="Панель управления"></section><section class="arena-wrap" aria-label="3D поле боя"><div class="arena" id="arena"></div><div class="arena-top"><div class="arena-label">ПЕРИМЕТР <span>АВТОНОМНАЯ ОБОРОНА</span></div><div class="arena-label" id="arena-status">СИСТЕМЫ ГОТОВЫ</div></div><div class="floating-message" id="toast" role="status" aria-live="polite"></div><div class="arena-bottom"><span class="coordinate">X: 00.0 / Y: 00.0</span><span class="arena-note" id="arena-note">Один оплот. Тридцать волн.</span></div><div class="paused-overlay hidden" id="paused"><h2>Пауза</h2><p>Бой и ремонт остановлены. Ничего не происходит в ваше отсутствие.</p><button class="main-button" id="unpause">Продолжить бой</button></div></section></main><div class="section-head"><strong id="shop-title">Мастерская</strong><span id="shop-note">Улучшения для всех будущих забегов</span></div><section class="upgrades" id="upgrades" aria-label="Улучшения"></section><footer class="foot"><span id="save-status">Локальное сохранение · без офлайн-дохода</span><span>3D / 30 ВОЛН / ФИНАЛЬНЫЙ БОСС</span></footer></div><div id="modal-root"></div>`;
const gates=document.createElement('div');gates.className='workshop-gates';gates.hidden=true;
gates.setAttribute('aria-hidden','true');
gates.innerHTML='<div class="workshop-gate"></div><div class="workshop-gate"></div>';
root.append(gates);
let gatesMoving=false;
const hud=document.createElement('div');hud.id='battle-hud';hud.className='battle-hud hidden';hud.innerHTML=battleHudMarkup+bossBarMarkup;$('.shell').append(hud);
const drawerElement=document.createElement('div');drawerElement.id='battle-menu-overlay';drawerElement.className='battle-menu-overlay hidden';drawerElement.innerHTML=battleMenuMarkup;$('.shell').append(drawerElement);
const labels=STAT_LABELS;
const fmt=(n:number)=>{const value=Math.round(n*1e6)/1e6;return Number.isInteger(value)?String(value):value.toFixed(1).replace('.',',');};
const coins=(n:number)=>n.toLocaleString('ru-RU');
let state:GameState=createState(), screen:'menu'|'combat'|'result'='menu', renderedScreen='';
let workshopOpen=false;
let repository:SaveRepository|null=null, writable=false, saveBlocked=false, fatal=false, saveTimer=0, uiTimer=0, toastTimer=0, accumulator=0, last=performance.now();
let scene:SceneView|null=null;
const pause=new PauseManager(),lock=new TabLock(),platform=new LocalPlatformAdapter(),sound=new Sound();
const battleMenu=new BattleMenuController(pause);
let menuReturnFocus:HTMLElement|null=null;
pause.add('menu');
function notify(text:string){$('#notice').textContent=text;$('#notice').classList.remove('hidden');}
function toast(text:string){$('#toast').textContent=text;$('#toast').classList.add('show');toastTimer=3;}
function save(){if(!repository||!writable||saveBlocked)return;if(!repository.save(state)){notify('Не удалось сохранить прогресс. Освободите место для этого сайта и не закрывайте вкладку.');$('#save-status').textContent='Сохранение не удалось';}else{$('#save-status').textContent='Прогресс сохранён на этом устройстве';}saveTimer=0;}
function modal(title:string,text:string,actions:{label:string,action:()=>void,secondary?:boolean}[],dismissible=true){
 const before=document.activeElement as HTMLElement|null;pause.add('dialog');$('.shell').inert=true;
 const area=$('#modal-root');area.innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title"></h2><p id="modal-body"></p><div class="button-row"></div></section></div>`;
 $('#modal-title').textContent=title;$('#modal-body').textContent=text;
 const close=()=>{area.innerHTML='';pause.remove('dialog');$('.shell').inert=false;accumulator=0;before?.focus();};
 for(const action of actions){const btn=document.createElement('button');btn.className='main-button'+(action.secondary?' secondary':'');btn.textContent=action.label;btn.onclick=()=>{close();action.action();};$('.button-row').append(btn);}
 area.querySelector<HTMLButtonElement>('button')?.focus();
 area.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(dismissible)close();return;}if(e.key==='Tab'){const buttons=[...area.querySelectorAll<HTMLButtonElement>('button')];const index=buttons.indexOf(document.activeElement as HTMLButtonElement);e.preventDefault();buttons[(index+(e.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();}};
}
function downloadCorrupt(){if(!repository)return;const blob=new Blob([repository.raw()],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='oplot-save-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function showSaveRecovery(){modal('Сохранение повреждено','Старые данные оставлены на устройстве. Сначала можно скачать копию. Новый профиль удалит текущее локальное сохранение и его резервную копию.',[{label:'Скачать копию',secondary:true,action:()=>{downloadCorrupt();showSaveRecovery();}},{label:'Новый профиль',action:()=>modal('Начать с нуля?','Кристаллы, постоянные улучшения и незаконченный забег будут удалены на этом устройстве.',[{label:'Отмена',secondary:true,action:showSaveRecovery},{label:'Удалить и начать',action:()=>{repository?.reset();state=createState();saveBlocked=false;$('#notice').classList.add('hidden');save();renderUI(true);}}],false)}],false);}
function openMenu(){battleMenu.close();screen='menu';workshopOpen=false;pause.add('menu');accumulator=0;save();renderUI(true);$(state.run?'#resume':'#start').focus();}
function setWorkshop(open:boolean){
 workshopOpen=open;renderUI(true);
 window.scrollTo(0,0);
}
async function showWorkshop(open:boolean,animated=true){
 if(screen!=='menu'||open===workshopOpen||gatesMoving||(open&&state.run))return;
 const focus=()=>$(open?'#screen-heading':'#open-workshop').focus({preventScroll:true});
 if(!animated||!gates.firstElementChild?.animate||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
  setWorkshop(open);focus();return;
 }
 const shell=$('.shell');
 const leaves=[...gates.children] as HTMLElement[];
 const slide=(closing:boolean)=>leaves.map((leaf,i)=>{
  const outside=`translateY(${i===0?-101:101}%)`, shut='translateY(0)';
  return leaf.animate(closing?[{transform:outside},{transform:shut}]:[{transform:shut},{transform:outside}],{
   duration:closing?320:390,easing:closing?'cubic-bezier(.61,.04,.88,.52)':'cubic-bezier(.15,.68,.24,1)',fill:'forwards',
  });
 });
 gatesMoving=true;shell.inert=true;gates.hidden=false;
 let closing:Animation[]=[];let opening:Animation[]=[];
 try {
  closing=slide(true);
  await Promise.allSettled(closing.map(a=>a.finished));
  setWorkshop(open);
  // Keep the doors shut for a short beat so the screen redraw happens offstage.
  await new Promise<void>(resolve=>window.setTimeout(resolve,250));
  opening=slide(false);
  await Promise.allSettled(opening.map(a=>a.finished));
 } finally {
  gates.hidden=true;
  for(const animation of [...opening,...closing])animation.cancel();
  shell.inert=false;gatesMoving=false;focus();
 }
}
function resume(){if(!state.run||fatal||saveBlocked||!writable)return;screen='combat';pause.remove('menu');battleMenu.close();state=setPaused(state,false);accumulator=0;last=performance.now();renderUI(true);$(pause.reasons.has('user')?'#unpause':'#battle-menu-toggle').focus();}
function launch(){if(state.run||fatal||saveBlocked||!writable)return;const seed=crypto.getRandomValues(new Uint32Array(1))[0];state=startRun(state,seed);screen='combat';pause.remove('menu');pause.remove('user');battleMenu.close();accumulator=0;last=performance.now();save();renderUI(true);$('#battle-menu-toggle').focus();toast('Волна 1 · оборона запущена');}
function togglePause(){if(screen!=='combat'||!state.run)return;if(pause.reasons.has('user'))pause.remove('user');else pause.add('user');accumulator=0;save();renderUI();}
function buy(stat:StatKey){if(!writable||saveBlocked||fatal||screen==='result'||(screen==='menu'&&!workshopOpen)||battleMenu.open||pause.reasons.has('dialog'))return;const before=state;state=screen==='combat'?buyRunUpgrade(state,stat):buyMetaUpgrade(state,stat);if(state!==before){sound.play('upgrade');save();toast(screen==='combat'?'Модуль улучшен · действует сразу':'Стартовые параметры улучшены');renderUI();}}
$('#upgrades').innerHTML=battleUpgradeDockMarkup;
bindBattleUpgradeTabs($('#upgrades'));
for(const stat of STAT_KEYS)$(`#upgrade-${stat}`).onclick=()=>buy(stat);
function toggleSound(){const enabled=sound.toggle();$('#sound').textContent=enabled?'♫':'♪';$('#sound').setAttribute('aria-label',enabled?'Выключить звук':'Включить звук');$('#sound').setAttribute('aria-pressed',String(enabled));if(pause.paused)sound.suspend();renderUI();}
$('#sound').onclick=toggleSound;
$('#unpause').onclick=togglePause;
function showHelp(){modal('Как защитить оплот','Турель прицеливается и стреляет сама. За каждого уничтоженного меха вы получаете золото. Купленные в бою модули действуют сразу. Здоровье между волнами не заполняется: нужен ремонт. За каждую пройденную волну начисляется 1 кристалл. Кристаллы и улучшения мастерской сохраняются после поражения. Штурм бьёт кулаками, Рывок атакует клинками, Стрелок останавливается внутри круга огня и стреляет снарядами. Некоторые волны окружают оплот группами. На волне 30 ждёт Колосс с тяжёлыми ударами. Клавиши 1–4 покупают модули, пробел включает паузу.',[{label:'Понятно',action:()=>{}}]);}
$('#help').onclick=showHelp;
function openBattleMenu(){
 if(screen!=='combat'||!state.run)return;
 menuReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
 battleMenu.show();accumulator=0;save();renderUI();$('#battle-menu-close').focus();
}
function closeBattleMenu(restoreFocus=true){
 battleMenu.close();accumulator=0;last=performance.now();renderUI();
 if(restoreFocus){const target=menuReturnFocus?.isConnected&&menuReturnFocus!==document.body?menuReturnFocus:$('#battle-menu-toggle');target.focus();}
}
function confirmAbandon(){
 modal('Завершить этот забег?','Золото и боевые модули текущего забега будут потеряны. Кристаллы и улучшения мастерской сохранятся.',[
  {label:'Продолжить забег',secondary:true,action:()=>{}},
  {label:'Завершить',action:()=>{state={...state,run:null,result:null,events:[]};battleMenu.close();pause.remove('user');openMenu();}},
 ]);
}
$('#battle-menu-toggle').onclick=openBattleMenu;
$('#battle-menu-close').onclick=()=>closeBattleMenu();
$('#battle-menu-return').onclick=()=>closeBattleMenu();
$('#battle-menu-pause').onclick=()=>{togglePause();renderUI();};
$('#battle-menu-sound').onclick=toggleSound;
$('#battle-menu-help').onclick=showHelp;
$('#battle-menu-save').onclick=openMenu;
$('#battle-menu-abandon').onclick=confirmAbandon;
drawerElement.addEventListener('click',event=>{if(event.target===drawerElement)closeBattleMenu();});
drawerElement.addEventListener('keydown',event=>{
 if(event.key!=='Tab')return;
 const buttons=[...drawerElement.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
 const i=buttons.indexOf(document.activeElement as HTMLButtonElement);
 event.preventDefault();buttons[(i+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();
});
function drawPanel(){
 const panel=$('#panel');panel.className=screen==='menu'?(workshopOpen?'workshop-panel':'title-panel'):`panel ${screen}-panel`;
 if(screen==='menu')panel.innerHTML=workshopOpen?workshopMarkup:titleMarkup;
 else if(screen==='combat')panel.innerHTML='';
 else panel.innerHTML=`<div class="result-emblem">${state.result?.outcome==='victory'?'★':'⬡'}</div><div class="eyebrow">${state.result?.outcome==='victory'?'Периметр защищён':'Связь с оплотом потеряна'}</div><h1>${state.result?.outcome==='victory'?'Колосс<br>повержен.':'Забег<br>завершён.'}</h1><p>${state.result?.outcome==='victory'?'Все 30 волн пройдены. Вы удержали сектор.':'Кристаллы сохранены. Усильте стартовые параметры и вернитесь в бой.'}</p><div class="combat-stats"><div class="stat-box"><span>Пройдено волн</span><strong>${state.result?.completedWaves??0} / 30</strong></div><div class="stat-box crystals"><span>Заработано</span><strong>+${state.result?.earnedCrystals??0} ◇</strong></div><div class="stat-box"><span>Уничтожено мехов</span><strong>${state.result?.kills??0}</strong></div><div class="stat-box"><span>Время обороны</span><strong>${Math.floor((state.result?.duration??0)/60)}:${String(Math.floor((state.result?.duration??0)%60)).padStart(2,'0')}</strong></div></div><p class="hint">Временное золото и боевые модули сброшены. Улучшения мастерской остаются с вами.</p><button class="main-button panel-bottom" id="to-workshop">В мастерскую</button>`;
 if(screen==='menu'){
  if(workshopOpen){
   $('#workshop-back').onclick=()=>showWorkshop(false);
   for(const stat of STAT_KEYS){
    const card=$(`[data-workshop-stat="${stat}"]`);
    card.onclick=()=>{
     const before=state;
     buy(stat);
     if(state!==before&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
      card.animate?.([{transform:'translateY(2px) scale(.99)'},{transform:'translateY(-.5px)',offset:.72},{transform:'none'}],{duration:180,easing:'ease-out'});
    };
   }
  }
  else{$('#start').onclick=launch;$('#resume').onclick=resume;$('#open-workshop').onclick=()=>showWorkshop(true);$('#menu-help').onclick=showHelp;}
 }
 if(screen==='result')$('#to-workshop').onclick=()=>{openMenu();void showWorkshop(true,false);};
 renderedScreen=screen;
}
function renderUI(force=false){
 const layoutChanged=force||renderedScreen!==screen;
 if(layoutChanged)drawPanel();
 const stats=getStats(state),run=state.run,battle=screen==='combat';
 if(screen==='menu'){
  $('#menu-crystals').textContent=coins(state.profile.crystals);
  if(!workshopOpen){
   const start=$<HTMLButtonElement>('#start'), resume=$<HTMLButtonElement>('#resume');
   start.disabled=!!run||fatal||saveBlocked||!writable;
   resume.disabled=!run||fatal||saveBlocked||!writable;
   start.classList.toggle('title-primary',!run);resume.classList.toggle('title-primary',!!run);
   resume.setAttribute('aria-label',run?`Продолжить забег · волна ${run.wave}`:'Продолжить');
   $<HTMLButtonElement>('#open-workshop').disabled=!!run;
   if(run)$('#menu-hint').textContent=`Сохранена волна ${run.wave}. Мастерская откроется после забега.`;
  }
 }
 $('.shell').classList.toggle('at-front-menu',screen==='menu'&&!workshopOpen);
 $('.shell').classList.toggle('at-workshop',screen==='menu'&&workshopOpen);
 $('.shell').classList.toggle('in-battle',battle);
 document.body.classList.toggle('battle-active',battle);
 $('#battle-hud').classList.toggle('hidden',!battle);
 $('#battle-notice').textContent=$('#notice').textContent;
 $('#battle-notice').classList.toggle('hidden',$('#notice').classList.contains('hidden'));
 $('#battle-menu-overlay').classList.toggle('hidden',!battle||!battleMenu.open);
 $('#battle-menu-toggle').setAttribute('aria-expanded',String(battleMenu.open));
 $('#battle-hud').inert=battleMenu.open;$('#upgrades').inert=battleMenu.open;$('.arena-wrap').inert=battleMenu.open;
 if(battle&&run){
  $('#battle-wave').textContent=`${run.wave} / 30`;
  $('#battle-hp').textContent=`${Math.max(1,Math.ceil(run.hp-1e-9))} / ${fmt(stats.maxHp)}`;
  $('#battle-hp-fill').style.width=`${100*run.hp/stats.maxHp}%`;
  $('#battle-hp-fill').classList.toggle('low',run.hp<stats.maxHp*.3);
  $('#battle-gold').textContent=coins(run.gold);$('#battle-crystals').textContent=coins(state.profile.crystals);
  $('#menu-damage').textContent=fmt(stats.damage);$('#menu-speed').textContent=`${fmt(stats.attackSpeed)} /с`;$('#menu-regen').textContent=`${fmt(stats.regen)} HP/с`;$('#menu-progress').textContent=`${run.lastPaidWave} / 30`;
  $('#battle-menu-status').textContent=pause.reasons.has('user')?'Ручная пауза включена. Закрытие меню не возобновит бой.':'Бой остановлен, пока открыто меню';
  $('#battle-menu-pause').textContent=pause.reasons.has('user')?'Снять ручную паузу':'Оставить на паузе';
  $('#battle-menu-return').textContent=pause.reasons.has('user')?'Закрыть меню':'Вернуться в бой';
 }
 $('#battle-menu-sound').textContent=`Звук: ${sound.enabled?'включён':'выключен'}`;
 $('#paused').classList.toggle('hidden',!(battle&&pause.reasons.has('user')&&!battleMenu.open));
 $('#title-render-warning').classList.toggle('hidden',!fatal);
 $('#arena-status').textContent=fatal?'ТРЕБУЕТСЯ WEBGL2':battle?(pause.paused?'ПАУЗА':run?.wave===30?'КОЛОСС ПРИБЛИЖАЕТСЯ':'БОЕВОЙ РЕЖИМ'):'СИСТЕМЫ ГОТОВЫ';
 $('#arena-note').textContent=battle?'Автоогонь · покупайте модули за золото':'Один оплот. Тридцать волн.';
 const boss=run?.enemies.find(e=>e.kind==='boss');$('#boss').classList.toggle('hidden',!boss||!battle);if(boss)$('#boss-fill').style.width=`${boss.hp/boss.maxHp*100}%`;
 $('#shop-title').textContent=battle?'Боевые модули · золото':'Мастерская · кристаллы';$('#shop-note').textContent=battle?'Улучшения действуют сразу':'Усиливают старт будущих забегов';
 for(const stat of STAT_KEYS){const inWorkshop=screen==='menu'&&workshopOpen,btn=$<HTMLButtonElement>(inWorkshop?`[data-workshop-stat="${stat}"]`:`#upgrade-${stat}`),level=battle?run?.levels[stat]??0:state.profile.meta[stat],price=battle?runPrice(stat,level):metaPrice(stat,level),budget=battle?run?.gold??0:state.profile.crystals;
 let nextValue=0,current=battle?stats[stat]:calculateStats(state.profile.meta)[stat];
 if(battle&&run){const nextLevel={...run.levels,[stat]:level+1};nextValue=calculateStats(state.profile.meta,nextLevel)[stat];}else nextValue=calculateStats({...state.profile.meta,[stat]:level+1})[stat];
 btn.disabled=budget<price||(!battle&&!!run)||screen==='result'||fatal||saveBlocked||!writable||battleMenu.open;
 const accessible=`${labels[stat].title}, сейчас ${fmt(current)} ${labels[stat].unit}, следующий: ${fmt(nextValue)} ${labels[stat].unit}, цена: ${price} ${battle?'золота':'кристаллов'}`;
 btn.setAttribute('aria-label',accessible);
 if(inWorkshop){
  btn.querySelector('.workshop-current')!.textContent=`${fmt(current)} ${labels[stat].unit}`;
  btn.querySelector('.workshop-next')!.textContent=`→ ${fmt(nextValue)} ${labels[stat].unit}`;
  btn.querySelector('.workshop-amount')!.textContent=coins(price);
  continue;
 }
 btn.classList.toggle('meta',!battle);btn.classList.toggle('affordable',budget>=price&&(battle||!run));
 btn.querySelector('.upgrade-value')!.innerHTML=`${fmt(current)}<small>${labels[stat].unit}</small>`;
 btn.querySelector('.upgrade-price')!.textContent=`${battle?'◈':'◇'} ${coins(price)}`;
 btn.querySelector('.upgrade-sub')!.textContent=`Следующий: ${fmt(nextValue)} ${labels[stat].unit}`;
 }
 if(layoutChanged)scene?.resize();
}
function frameForScene(spawns: SceneSpawn[]):SceneFrame{
 const r=state.run,stats=getStats(state),target=r?.enemies.find(e=>e.id===r.targetId);
 return {range:stats.range,paused:pause.paused,enemies:r?.enemies.map(e=>({...e,kind:e.kind==='ordinary'?'normal':e.kind}))??[],bullets:r?.bullets??[],enemyProjectiles:r?.enemyProjectiles??[],warnings:r?.warnings??[],spawns,target:target??null,turretHPfraction:r?r.hp/stats.maxHp:1,phase:screen==='menu'?(workshopOpen?'workshop':'title'):screen,elapsed:r?.time??0,shooting:state.events.some(e=>e.type==='shot')};
}
function animate(now:number){
 const spawns: SceneSpawn[] = [];
 const delta=Math.min((now-last)/1000,.15);last=now;
 if(state.run&&screen==='combat'&&!pause.paused&&!fatal&&writable){
  state=setPaused(state,false);accumulator=Math.min(accumulator+delta,.15);
  let ticks=0;while(accumulator>=DT&&ticks<5&&state.run){state=step(state);accumulator-=DT;ticks++;
   for(const ev of state.events){if(ev.type==='spawn'&&state.run)spawns.push({...ev,time:state.run.time});if(ev.type==='shot')sound.play('shot');if(ev.type==='kill'){sound.play('kill');toast(`+${ev.amount} золота`);}if(ev.type==='waveComplete'){sound.play('wave');toast(`Волна ${ev.wave} пройдена · +1 кристалл`);}if(ev.type==='waveStart'&&ev.wave===30)toast('ВНИМАНИЕ: КОЛОСС · финальный босс');}
   if(state.events.some(e=>e.type==='kill'||e.type==='waveComplete'||e.type==='runEnded'))save();
  }
  if(!state.run&&state.result){battleMenu.close();screen='result';pause.add('menu');save();renderUI(true);}
 }else accumulator=0;
 if(scene){
  const frame=frameForScene(spawns);
  const animatePresentation=(frame.phase==='title'||frame.phase==='workshop')&&!document.hidden&&!pause.reasons.has('focus')&&!pause.reasons.has('dialog');
  scene.render(frame,animatePresentation||!pause.paused?delta:0);
 }
 uiTimer+=delta;saveTimer+=delta;toastTimer-=delta;
 if(toastTimer<=0)$('#toast').classList.remove('show');
 if(uiTimer>=.12){renderUI();uiTimer=0;}
 if(saveTimer>=1&&state.run&&!pause.paused)save();
 if(pause.paused)sound.suspend();else sound.resume();
 requestAnimationFrame(animate);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause.add('hidden');save();sound.suspend();}else{pause.remove('hidden');accumulator=0;last=performance.now();}});
window.addEventListener('pagehide',()=>save());
window.addEventListener('blur',()=>{pause.add('focus');accumulator=0;save();sound.suspend();});
window.addEventListener('focus',()=>{pause.remove('focus');accumulator=0;last=performance.now();});
window.addEventListener('keydown',e=>{
 if(gatesMoving||e.repeat||$('#modal-root').children.length||e.ctrlKey||e.metaKey||e.altKey)return;
 if(e.key==='Escape'&&screen==='menu'&&workshopOpen){e.preventDefault();showWorkshop(false);return;}
 if(e.key==='Escape'&&screen==='combat'){e.preventDefault();battleMenu.open?closeBattleMenu():openBattleMenu();return;}
 if(battleMenu.open||isInteractiveTarget(e.target))return;
 if(e.key===' '&&screen==='combat'){e.preventDefault();togglePause();}
 if(['1','2','3','4'].includes(e.key))buy(STAT_KEYS[Number(e.key)-1]);
});

async function init(){
 await platform.init();
 writable=await lock.acquire();
 if(!writable){saveBlocked=true;notify('Игра уже открыта в другой вкладке либо браузер не поддерживает безопасную запись. Закройте другую вкладку и обновите эту страницу.');modal('Защита сохранения','Одновременно можно играть только в одной вкладке. Закройте другую вкладку с игрой, затем обновите страницу. Используйте современный браузер с поддержкой Web Locks.',[{label:'Обновить',action:()=>location.reload()}],false);}
 if(writable){try{repository=new SaveRepository(localStorage);const loaded=repository.load();if(loaded.state)state=loaded.state;if(loaded.warning)notify(loaded.warning);saveBlocked=loaded.blocked;if(saveBlocked)showSaveRecovery();}catch{saveBlocked=true;notify('Браузер запретил локальное сохранение. Разрешите данные сайта и обновите страницу.');}}
 try{scene=new SceneView($('#arena'));platform.gameReady();}catch(e){fatal=true;const el=document.createElement('div');el.className='fatal';el.innerHTML='<strong>⬡</strong><h2>Для 3D-арены нужен WebGL2</h2><p>Откройте игру в актуальном Chrome, Edge, Firefox или Safari с включённым аппаратным ускорением. Ваше сохранение не изменено.</p>';$('#arena').append(el);console.error('Scene initialization failed',e);}
 renderUI(true);requestAnimationFrame(animate);
}
void init();
