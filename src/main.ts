import { armoredScrollMarkup, bindArmoredScrollbars } from './armored-scroll';
import { animateChainSheet, openChainPanel } from './chain-panel';
import { currencyBank, currencyIcon } from './currency-ui';
import './style.css';
import './title.css';
import './workshop.css';
import './workshop-gates.css';
import './module-shop.css';
import './battle-dock.css';
import { bootScreen, loadInterface, waitForBoot } from './boot';
import { COMBAT_KEYS, SHOP_MODULES, type ShopModule } from './combat-upgrades';
import { workshopMarkup, visibleWorkshopKeys, renderWorkshopCombatUpgrade } from './workshop-ui';
import { moduleShopMarkup, moduleDetailContent, renderShopCard, renderModuleDetail } from './module-shop';
import { MenuAnnouncements, TEST_ANNOUNCEMENTS } from './menu-announcement';
import { rotateTitleTips } from './title-tips';
import { titleMarkup } from './title-ui';
import {createState,startRun,step,collectPickups,buyRunUpgrade,buyCombatUpgrade,buyMetaUpgrade,buyWorkshopCombatUpgrade,buyShopModule,setPaused,getStats,calculateStats,runPrice,metaPrice,STAT_KEYS,DT,type GameState,type StatKey} from './game';
import {SceneView,type SceneFrame, type SceneSpawn} from './scene';
import {SaveRepository,PauseManager,TabLock} from './persistence';
import {LocalPlatformAdapter} from './platform';
import {Sound} from './audio';
import {BattleMenuController,battleHudMarkup,battleMenuMarkup,bossBarMarkup,battleUpgradeDockMarkup,bindUpgradeTabs,renderCombatUpgrade,STAT_LABELS,isInteractiveTarget} from './battle-ui';
const $=<T extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const root=$('#app');
const startup=bootScreen(root);
for (const type of ['contextmenu', 'dragstart']) {
 root.addEventListener(type, event => event.preventDefault());
}
root.innerHTML=`<div class="shell"><header class="topbar"><div class="brand"><div class="brand-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 27v-6l6-5V6h12v7h6v7h-6v7H5Z" stroke="currentColor" stroke-width="2"/><path d="M14 10h5v5h-5z" fill="currentColor"/></svg></div><div><div class="brand-name">ОПЛОТ</div><div class="brand-sub">Турель и мехи</div></div></div><div class="top-actions">${currencyBank('result')}<span class="pill"><span class="live-dot"></span>СЕКТОР 07</span><button class="icon-button" id="sound" aria-label="Включить звук" title="Звук">♪</button><button class="icon-button" id="help" aria-label="Как играть" title="Как играть">?</button></div></header><div id="notice" class="status-warning hidden" role="status"></div><p id="title-render-warning" class="status-warning hidden" role="status">Для запуска боя нужен WebGL2. Откройте игру в браузере с аппаратным ускорением.</p><main class="workspace"><section class="panel" id="panel" aria-label="Панель управления"></section><section class="arena-wrap" aria-label="3D поле боя"><div class="arena" id="arena"></div><div class="arena-top"><div class="arena-label">ПЕРИМЕТР <span>АВТОНОМНАЯ ОБОРОНА</span></div><div class="arena-label" id="arena-status">СИСТЕМЫ ГОТОВЫ</div></div><div class="floating-message" id="toast" role="status" aria-live="polite"></div><div class="arena-bottom"><span class="coordinate">X: 00.0 / Y: 00.0</span><span class="arena-note" id="arena-note">Один оплот. Тридцать волн.</span></div><div class="paused-overlay hidden" id="paused"><h2>Пауза</h2><p>Бой и ремонт остановлены. Ничего не происходит в ваше отсутствие.</p><button class="main-button" id="unpause">Продолжить бой</button></div></section></main><div class="section-head"><strong id="shop-title">Мастерская</strong><span id="shop-note">Улучшения для всех будущих забегов</span></div><section class="upgrades" id="upgrades" aria-label="Улучшения"></section><footer class="foot"><span id="save-status">Локальное сохранение · без офлайн-дохода</span><span>3D / 30 ВОЛН / ФИНАЛЬНЫЙ БОСС</span></footer></div><div id="modal-root"></div>`;
const gates=document.createElement('div');gates.className='workshop-gates';gates.hidden=true;
gates.setAttribute('aria-hidden','true');
gates.innerHTML='<div class="workshop-gate"></div><div class="workshop-gate"></div>';
root.append(gates);
// The fixed game stage can itself scroll on short screens; use the same rail there too.
const stage=root.parentElement;
if(stage?.id==='game-stage'){
 const template=document.createElement('template');
 template.innerHTML=armoredScrollMarkup('');
 const wrapper=template.content.firstElementChild as HTMLElement;
 wrapper.classList.add('game-scroll-area');root.replaceWith(wrapper);wrapper.prepend(root);
 bindArmoredScrollbars(stage);
}
let gatesMoving=false;
const hud=document.createElement('div');hud.id='battle-hud';hud.className='battle-hud hidden';hud.innerHTML=battleHudMarkup+bossBarMarkup;$('.shell').append(hud);
const drawerElement=document.createElement('div');drawerElement.id='battle-menu-overlay';drawerElement.className='battle-menu-overlay chain-panel-layer hidden';drawerElement.innerHTML=battleMenuMarkup;$('.shell').append(drawerElement);
const drawerScrollbars=bindArmoredScrollbars(drawerElement);
const drawerSheet=drawerElement.querySelector<HTMLElement>('.chain-panel-sheet')!;
let drawerMotion:Animation|undefined, drawerClosing=false;
function slideBattleMenu(enter:boolean,finish=()=>{}){
 drawerMotion?.cancel();
 const motion=animateChainSheet(drawerSheet,enter);
 drawerMotion=motion;
 if(!motion){finish();return;}
 void motion.finished.then(()=>{if(drawerMotion===motion){drawerMotion=undefined;motion.cancel();finish();}},()=>{});
}
const labels=STAT_LABELS;
const fmt=(n:number)=>{const value=Math.round(n*1e6)/1e6;return Number.isInteger(value)?String(value):value.toFixed(1).replace('.',',');};
const coins=(n:number)=>n.toLocaleString('ru-RU');
let state:GameState=createState(), screen:'menu'|'combat'|'result'='menu', renderedScreen='';
type MenuPage = 'title' | 'workshop' | 'shop';
let menuPage: MenuPage = 'title';
let repository:SaveRepository|null=null, writable=false, saveBlocked=false, fatal=false, saveTimer=0, uiTimer=0, toastTimer=0, accumulator=0, last=performance.now();
let scene:SceneView|null=null;
let pageExiting=false;
const pause=new PauseManager(),lock=new TabLock(),platform=new LocalPlatformAdapter(),sound=new Sound();
const battleMenu=new BattleMenuController(pause);
const announcements=new MenuAnnouncements(TEST_ANNOUNCEMENTS);
let menuReturnFocus:HTMLElement|null=null;
pause.add('menu');
function notify(text:string){$('#notice').textContent=text;$('#notice').classList.remove('hidden');}
function toast(text:string){$('#toast').textContent=text;$('#toast').classList.add('show');toastTimer=3;}
function save(snapshot=state){
 if(!repository||!writable||saveBlocked)return false;
 const saved=repository.save(snapshot);
 if(!saved){notify('Не удалось сохранить прогресс. Освободите место для этого сайта и не закрывайте вкладку.');$('#save-status').textContent='Сохранение не удалось';}
 else $('#save-status').textContent='Прогресс сохранён на этом устройстве';
 saveTimer=0;return saved;
}
function modal(title:string,text:string,actions:{label:string,action:()=>void,secondary?:boolean}[],dismissible=true){
 const before=document.activeElement as HTMLElement|null;pause.add('dialog');$('.shell').inert=true;
 const area=$('#modal-root');area.innerHTML=`<div class="modal-backdrop">${armoredScrollMarkup(`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title"></h2><p id="modal-body"></p><div class="button-row"></div></section>`)}</div>`;
 const scrollbars=bindArmoredScrollbars(area);
 $('#modal-title').textContent=title;$('#modal-body').textContent=text;
 const close=()=>{scrollbars.dispose();area.innerHTML='';pause.remove('dialog');$('.shell').inert=false;accumulator=0;before?.focus();};
 for(const action of actions){const btn=document.createElement('button');btn.className='main-button'+(action.secondary?' secondary':'');btn.textContent=action.label;btn.onclick=()=>{close();action.action();};$('.button-row').append(btn);}
 scrollbars.refresh();
 area.querySelector<HTMLButtonElement>('button')?.focus();
 area.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(dismissible)close();return;}if(e.key==='Tab'){const buttons=[...area.querySelectorAll<HTMLButtonElement>('button')];const index=buttons.indexOf(document.activeElement as HTMLButtonElement);e.preventDefault();buttons[(index+(e.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();}};
}
function downloadCorrupt(){if(!repository)return;const blob=new Blob([repository.raw()],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='oplot-save-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function showSaveRecovery(){modal('Сохранение повреждено','Старые данные оставлены на устройстве. Сначала можно скачать копию. Новый профиль удалит текущее локальное сохранение и его резервную копию.',[{label:'Скачать копию',secondary:true,action:()=>{downloadCorrupt();showSaveRecovery();}},{label:'Новый профиль',action:()=>modal('Начать с нуля?','Детали, постоянные улучшения и незаконченный забег будут удалены на этом устройстве.',[{label:'Отмена',secondary:true,action:showSaveRecovery},{label:'Удалить и начать',action:()=>{repository?.reset();state=createState();saveBlocked=false;$('#notice').classList.add('hidden');save();renderUI(true);}}],false)}],false);}
function openMenu(){battleMenu.close();screen='menu';menuPage='title';pause.add('menu');accumulator=0;save();renderUI(true);$(state.run?'#resume':'#start').focus();}
function setMenuPage(page: MenuPage){
 menuPage=page;renderUI(true);
 root.scrollTop=0;
}
async function throughGates(swap:()=>void,finish:()=>void,animated=true){
 if(gatesMoving)return;
 if(!animated||!gates.firstElementChild?.animate||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
  swap();finish();return;
 }
 const shell=$('.shell');
 const leaves=[...gates.children] as HTMLElement[];
 const slide=(closing:boolean)=>leaves.map((leaf,i)=>{
  const outside=`translateY(${i===0?-101:101}%)`, shut='translateY(0)';
  return leaf.animate(closing?[{transform:outside},{transform:shut}]:[{transform:shut},{transform:outside}],{
   duration:closing?320:390,easing:closing?'cubic-bezier(.61,.04,.88,.52)':'cubic-bezier(.15,.68,.24,1)',fill:'forwards',
  });
 });
 gatesMoving=true;shell.inert=true;gates.hidden=false;pause.add('gates');
 let closing:Animation[]=[];let opening:Animation[]=[];
 try {
  closing=slide(true);
  await Promise.allSettled(closing.map(a=>a.finished));
  swap();
  // Keep the doors shut for a short beat so the screen redraw happens offstage.
  await new Promise<void>(resolve=>window.setTimeout(resolve,250));
  opening=slide(false);
  await Promise.allSettled(opening.map(a=>a.finished));
 } finally {
  gates.hidden=true;
  for(const animation of [...opening,...closing])animation.cancel();
  shell.inert=false;gatesMoving=false;pause.remove('gates');finish();
 }
}
function showMenuPage(page: MenuPage,animated=true){
 if(screen!=='menu'||page===menuPage||(page!=='title'&&state.run))return;
 const previous=menuPage;
 return throughGates(()=>setMenuPage(page),()=>{
  $(page!=='title'?'#screen-heading':previous==='shop'?'#open-module-shop':'#open-workshop').focus({preventScroll:true});
 },animated);
}
function enterBattle(newRun:boolean){
 if(screen!=='menu'||menuPage!=='title'||newRun===!!state.run||fatal||saveBlocked||!writable)return;
 return throughGates(()=>{
  if(newRun){
   state=startRun(state,crypto.getRandomValues(new Uint32Array(1))[0]);
   pause.remove('user');
   save();
  }else state=setPaused(state,false);
  screen='combat';pause.remove('menu');battleMenu.close();
  renderUI(true);root.scrollTop=0;
 },()=>{
  accumulator=0;last=performance.now();
  $(pause.reasons.has('user')?'#unpause':'#battle-menu-toggle').focus({preventScroll:true});
  if(newRun)toast('Волна 1 · оборона запущена');
 });
}
function togglePause(){if(screen!=='combat'||!state.run)return;if(pause.reasons.has('user'))pause.remove('user');else pause.add('user');accumulator=0;save();renderUI();}
function buy(stat:StatKey){if(!writable||saveBlocked||fatal||screen==='result'||(screen==='menu'&&menuPage!=='workshop')||battleMenu.open||pause.reasons.has('dialog'))return;const before=state;state=screen==='combat'?buyRunUpgrade(state,stat):buyMetaUpgrade(state,stat);if(state!==before){sound.play('upgrade');save();toast(screen==='combat'?'Модуль улучшен · действует сразу':'Стартовые параметры улучшены');renderUI();}}
$('#upgrades').innerHTML=battleUpgradeDockMarkup;
bindUpgradeTabs($('#upgrades'));
for(const stat of STAT_KEYS)$(`#upgrade-${stat}`).onclick=()=>buy(stat);
for (const key of COMBAT_KEYS) $(`#upgrade-${key}`).onclick=()=>{
 if(screen!=='combat'||!writable||saveBlocked||fatal||battleMenu.open||pause.reasons.has('dialog'))return;
 const next=buyCombatUpgrade(state,key);
 if(next===state||!save(next))return;
 state=next;sound.play('upgrade');renderUI();
};
function toggleSound(){const enabled=sound.toggle();$('#sound').textContent=enabled?'♫':'♪';$('#sound').setAttribute('aria-label',enabled?'Выключить звук':'Включить звук');$('#sound').setAttribute('aria-pressed',String(enabled));if(pause.paused)sound.suspend();renderUI();}
$('#sound').onclick=toggleSound;
$('#unpause').onclick=togglePause;
function showHelp(){modal('Как защитить оплот','Турель прицеливается и стреляет сама. За каждого уничтоженного меха вы получаете золото. Нажмите на выпавшую деталь или обломок, чтобы подобрать. Купленные в бою модули действуют сразу. Здоровье между волнами не заполняется: нужен ремонт. За каждую пройденную волну начисляется 1 деталь. Детали и улучшения мастерской сохраняются после поражения. Штурм бьёт кулаками, Рывок атакует клинками, Стрелок останавливается внутри круга огня и стреляет снарядами. Некоторые волны окружают оплот группами. На волне 30 ждёт Колосс с тяжёлыми ударами. Клавиши 1–4 покупают модули, пробел включает паузу.',[{label:'Понятно',action:()=>{}}]);}
$('#help').onclick=showHelp;
function openBattleMenu(){
 if(screen!=='combat'||!state.run||battleMenu.open||drawerClosing)return;
 menuReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
 battleMenu.show();accumulator=0;save();renderUI();drawerScrollbars.refresh();$('#battle-menu-close').focus();slideBattleMenu(true);
}
function closeBattleMenu(restoreFocus=true,after=()=>{}){
 if(!battleMenu.open||drawerClosing)return;
 if(drawerMotion){
  void drawerMotion.finished.then(()=>closeBattleMenu(restoreFocus,after),()=>{});
  return;
 }
 drawerClosing=true;drawerElement.inert=true;drawerElement.classList.add('closing');
 slideBattleMenu(false,()=>{
  drawerClosing=false;drawerElement.inert=false;drawerElement.classList.remove('closing');
  battleMenu.close();accumulator=0;last=performance.now();renderUI();
  if(restoreFocus){const target=menuReturnFocus?.isConnected&&menuReturnFocus!==document.body?menuReturnFocus:$('#battle-menu-toggle');target.focus();}
  after();
 });
}
function confirmAbandon(){
 modal('Завершить этот забег?','Золото и боевые модули текущего забега будут потеряны. Детали и улучшения мастерской сохранятся.',[
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
$('#battle-menu-save').onclick=()=>closeBattleMenu(false,openMenu);
$('#battle-menu-abandon').onclick=confirmAbandon;
drawerElement.addEventListener('click',event=>{if(event.target===drawerElement)closeBattleMenu();});
drawerElement.addEventListener('keydown',event=>{
 if(event.key!=='Tab')return;
 const buttons=[...drawerElement.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
 const i=buttons.indexOf(document.activeElement as HTMLButtonElement);
 event.preventDefault();buttons[(i+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();
});
function canSpendCrystals(){
 return writable&&!saveBlocked&&!fatal&&!gatesMoving&&screen==='menu'&&!state.run;
}
function applyCrystalPurchase(next: GameState){
 if(next===state||!save(next))return;
 state=next;sound.play('upgrade');renderUI();
}
function bindCrystalModules(){
 for(const key of visibleWorkshopKeys(state.profile.enhancements)) $(`#workshop-${key}`).onclick=()=>{
  if(canSpendCrystals()&&menuPage==='workshop'&&!pause.reasons.has('dialog'))
   applyCrystalPurchase(buyWorkshopCombatUpgrade(state,key));
 };
}
function openModuleDetail(key: ShopModule, source: HTMLButtonElement){
 const area=$('#modal-root');
 if(screen!=='menu'||menuPage!=='shop'||gatesMoving)return;
 // Menu dialogs block taps but leave the background mech animation running.
 const panel=openChainPanel(area,$('.shell'),{
  ...moduleDetailContent(key),returnFocus:()=>source.focus({preventScroll:true}),
 });
 if(!panel)return;
 const buyButton=$<HTMLButtonElement>('#module-detail-buy');
 const render=()=>renderModuleDetail(area,key,state.profile.enhancements?.[key]??0,state.profile.crystals,!canSpendCrystals()||panel.busy,state.profile.scrap??0);
 panel.onBusyChange=render;
 buyButton.onclick=()=>{
  if(panel.busy||!canSpendCrystals()||menuPage!=='shop')return;
  applyCrystalPurchase(buyShopModule(state,key));render();$('#module-detail-close').focus();
 };
 render();
}
function openSpecialOffer(){
 if(screen!=='menu'||menuPage!=='title'||gatesMoving)return;
 openChainPanel($('#modal-root'),$('.shell'),{
  title:'Спецпредложение',subtitle:'Снабжение оплота',
  headingId:'special-offer-heading',closeId:'special-offer-close',descriptionId:'special-offer-description',
  body:'<p class="chain-panel-description" id="special-offer-description"><strong>Набор снабжения</strong><br>Здесь будут наборы деталей и обломков. Это тестовый показ: покупок пока нет.</p>',
  returnFocus:()=>$(state.run?'#resume':'#start').focus({preventScroll:true}),
 });
}
let disposeTitleTips: (()=>void) | undefined;
function mountTitleWidgets(){
 disposeTitleTips=rotateTitleTips($('.title-tip'));
 announcements.mount($('.menu-announcement-slot'),destination=>{if(destination==='offer')openSpecialOffer();else void showMenuPage(destination);},
  destination=>!gatesMoving&&(destination==='offer'||!state.run), ()=>$(state.run?'#resume':'#start').focus({preventScroll:true}));
}
let disposeWorkshopTabs: (()=>void) | undefined;
let disposeShopScrollbars: (()=>void) | undefined;
function drawPanel(){
 disposeTitleTips?.();disposeTitleTips=undefined;
 disposeWorkshopTabs?.();disposeWorkshopTabs=undefined;
 disposeShopScrollbars?.();disposeShopScrollbars=undefined;
 const panel=$('#panel');panel.className=screen==='menu'?(menuPage==='shop'?'module-shop-panel':menuPage==='workshop'?'workshop-panel':'title-panel'):`panel ${screen}-panel`;
 if(screen==='menu')panel.innerHTML=menuPage==='shop'?moduleShopMarkup:menuPage==='workshop'?workshopMarkup(state.profile.enhancements):titleMarkup;
 else if(screen==='combat')panel.innerHTML='';
 else panel.innerHTML=`<div class="result-emblem">${state.result?.outcome==='victory'?'★':'⬡'}</div><div class="eyebrow">${state.result?.outcome==='victory'?'Периметр защищён':'Связь с оплотом потеряна'}</div><h1>${state.result?.outcome==='victory'?'Колосс<br>повержен.':'Забег<br>завершён.'}</h1><p>${state.result?.outcome==='victory'?'Все 30 волн пройдены. Вы удержали сектор.':'Детали сохранены. Усильте стартовые параметры и вернитесь в бой.'}</p><div class="combat-stats"><div class="stat-box"><span>Пройдено волн</span><strong>${state.result?.completedWaves??0} / 30</strong></div><div class="stat-box crystals"><span>Заработано</span><strong>+${state.result?.earnedCrystals??0} ${currencyIcon('parts')}</strong></div><div class="stat-box"><span>Уничтожено мехов</span><strong>${state.result?.kills??0}</strong></div><div class="stat-box"><span>Время обороны</span><strong>${Math.floor((state.result?.duration??0)/60)}:${String(Math.floor((state.result?.duration??0)%60)).padStart(2,'0')}</strong></div></div><p class="hint">Временное золото и боевые модули сброшены. Улучшения мастерской остаются с вами.</p><button class="main-button panel-bottom" id="to-workshop">В мастерскую</button>`;
 if(screen==='menu'){
  if(menuPage==='workshop'){
   $('#workshop-back').onclick=()=>showMenuPage('title');
   disposeWorkshopTabs=bindUpgradeTabs($('.workshop-rack'));
   bindCrystalModules();
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
  else if(menuPage==='shop'){
   disposeShopScrollbars=bindArmoredScrollbars(panel).dispose;
   $('#module-shop-back').onclick=()=>showMenuPage('title');
   for(const key of SHOP_MODULES){const card=$<HTMLButtonElement>(`#shop-${key}`);card.onclick=()=>openModuleDetail(key,card);}
  }
  else {
   $('#open-module-shop').onclick=()=>showMenuPage('shop');
   $('#start').onclick=()=>enterBattle(true);$('#resume').onclick=()=>enterBattle(false);
   $('#open-workshop').onclick=()=>showMenuPage('workshop');$('#menu-help').onclick=showHelp;
   if(!root.inert&&!document.querySelector('#boot'))mountTitleWidgets();
  }
 }
 if(screen==='result')$('#to-workshop').onclick=()=>{openMenu();void showMenuPage('workshop',false);};
 renderedScreen=screen;
}
function renderUI(force=false){
 const layoutChanged=force||renderedScreen!==screen;
 if(layoutChanged)drawPanel();
 const stats=getStats(state),run=state.run,battle=screen==='combat';
 if(screen==='menu'){
  $('#menu-parts').textContent=coins(state.profile.crystals);
  $('#menu-scrap').textContent=coins(state.profile.scrap??0);
  if(menuPage==='title'){
   const start=$<HTMLButtonElement>('#start'), resume=$<HTMLButtonElement>('#resume');
   start.disabled=!!run||fatal||saveBlocked||!writable;
   resume.disabled=!run||fatal||saveBlocked||!writable;
   start.classList.toggle('title-primary',!run);resume.classList.toggle('title-primary',!!run);
   resume.setAttribute('aria-label',run?`Продолжить забег · волна ${run.wave}`:'Продолжить');
   $<HTMLButtonElement>('#open-workshop').disabled=!!run;
   $<HTMLButtonElement>('#open-module-shop').disabled=!!run;
   if(run)$('#menu-hint').textContent=`Сохранена волна ${run.wave}. Мастерская откроется после забега.`;
  }
 }
 $('#result-parts').textContent=coins(state.profile.crystals);
 $('#result-scrap').textContent=coins(state.profile.scrap??0);
 $('.shell').classList.toggle('at-front-menu',screen==='menu'&&menuPage==='title');
 $('.shell').classList.toggle('at-workshop',screen==='menu'&&menuPage==='workshop');
 $('.shell').classList.toggle('at-module-shop',screen==='menu'&&menuPage==='shop');
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
  for(const key of COMBAT_KEYS)renderCombatUpgrade($<HTMLButtonElement>(`#upgrade-${key}`),key,run.enhancements?.levels[key]??0,run.gold,fatal||saveBlocked||!writable||battleMenu.open,state.profile.enhancements?.[key]??0);
  $('#battle-gold').textContent=coins(run.gold);$('#battle-parts').textContent=coins(state.profile.crystals);$('#battle-scrap').textContent=coins(state.profile.scrap??0);
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
 $('#shop-title').textContent=battle?'Боевые модули · золото':'Мастерская · детали';$('#shop-note').textContent=battle?'Улучшения действуют сразу':'Усиливают старт будущих забегов';
 if(screen==='menu'&&menuPage==='workshop') for(const key of visibleWorkshopKeys(state.profile.enhancements)) {
  renderWorkshopCombatUpgrade($<HTMLButtonElement>(`#workshop-${key}`),key,state.profile.enhancements?.[key]??0,state.profile.crystals,fatal||saveBlocked||!writable||!!run,state.profile.scrap??0);
 }
 if(screen==='menu'&&menuPage==='shop') for(const key of SHOP_MODULES) {
  renderShopCard($<HTMLButtonElement>(`#shop-${key}`),key,state.profile.enhancements?.[key]??0);
 }
 for(const stat of STAT_KEYS){const inWorkshop=screen==='menu'&&menuPage==='workshop',btn=$<HTMLButtonElement>(inWorkshop?`[data-workshop-stat="${stat}"]`:`#upgrade-${stat}`),level=battle?run?.levels[stat]??0:state.profile.meta[stat],price=battle?runPrice(stat,level):metaPrice(stat,level),budget=battle?run?.gold??0:state.profile.crystals;
 let nextValue=0,current=battle?stats[stat]:calculateStats(state.profile.meta)[stat];
 if(battle&&run){const nextLevel={...run.levels,[stat]:level+1};nextValue=calculateStats(state.profile.meta,nextLevel)[stat];}else nextValue=calculateStats({...state.profile.meta,[stat]:level+1})[stat];
 btn.disabled=budget<price||(!battle&&!!run)||screen==='result'||fatal||saveBlocked||!writable||battleMenu.open;
 const accessible=`${labels[stat].title}, сейчас ${fmt(current)} ${labels[stat].unit}, следующий: ${fmt(nextValue)} ${labels[stat].unit}, цена: ${price} ${battle?'золота':'деталей'}`;
 btn.setAttribute('aria-label',accessible);
 if(inWorkshop){
  btn.querySelector('.workshop-current')!.textContent=`${fmt(current)} ${labels[stat].unit}`;
  btn.querySelector('.workshop-next')!.textContent=`→ ${fmt(nextValue)} ${labels[stat].unit}`;
  btn.querySelector('.workshop-amount')!.textContent=coins(price);
  continue;
 }
 btn.classList.toggle('meta',!battle);btn.classList.toggle('affordable',budget>=price&&(battle||!run));
 btn.querySelector('.upgrade-value')!.innerHTML=`${fmt(current)}<small>${labels[stat].unit}</small>`;
 btn.querySelector('.upgrade-cost')!.textContent=coins(price);
 btn.querySelector('.upgrade-sub')!.textContent=`Следующий: ${fmt(nextValue)} ${labels[stat].unit}`;
 }
 if(layoutChanged)scene?.resize();
}
function frameForScene(spawns: SceneSpawn[]):SceneFrame{
 const r=state.run,stats=getStats(state),target=r?.enemies.find(e=>e.id===r.targetId);
 return {range:stats.range,paused:pause.paused,pickups:r?.pickups,enemies:r?.enemies.map(e=>({...e,kind:e.kind==='ordinary'?'normal':e.kind}))??[],bullets:r?.bullets??[],enemyProjectiles:r?.enemyProjectiles??[],warnings:r?.warnings??[],spawns,target:target??null,turretHPfraction:r?r.hp/stats.maxHp:1,phase:screen==='menu'?menuPage:screen,elapsed:r?.time??0,shooting:state.events.some(e=>e.type==='shot')};
}
function animate(now:number){
 const spawns: SceneSpawn[] = [];
 const delta=Math.min((now-last)/1000,.15);last=now;
 if(state.run&&screen==='combat'&&!pause.paused&&!fatal&&writable){
  state=setPaused(state,false);accumulator=Math.min(accumulator+delta,.15);
  let ticks=0;while(accumulator>=DT&&ticks<5&&state.run){state=step(state);accumulator-=DT;ticks++;
   for(const ev of state.events){if(ev.type==='spawn'&&state.run)spawns.push({...ev,time:state.run.time});if(ev.type==='shot')sound.play('shot');if(ev.type==='kill'){sound.play('kill');toast(`+${ev.amount} золота`);}if(ev.type==='waveComplete'){sound.play('wave');toast(`Волна ${ev.wave} пройдена · +1 деталь`);}if(ev.type==='waveStart'&&ev.wave===30)toast('ВНИМАНИЕ: КОЛОСС · финальный босс');}
   if(state.events.some(e=>e.type==='kill'||e.type==='waveComplete'||e.type==='runEnded'))save();
  }
  if(!state.run&&state.result){battleMenu.close();screen='result';pause.add('menu');save();renderUI(true);}
 }else accumulator=0;
 if(scene){
  const frame=frameForScene(spawns);
  const animatePresentation=(frame.phase==='title'||frame.phase==='workshop'||frame.phase==='shop')&&!document.hidden&&!pause.reasons.has('focus')&&!pause.reasons.has('dialog');
  scene.render(frame,animatePresentation||!pause.paused?delta:0);
 }
 uiTimer+=delta;saveTimer+=delta;toastTimer-=delta;
 if(toastTimer<=0)$('#toast').classList.remove('show');
 if(uiTimer>=.12){renderUI();uiTimer=0;}
 if(saveTimer>=1&&state.run&&!pause.paused)save();
 if(pause.paused)sound.suspend();else sound.resume();
 requestAnimationFrame(animate);
}
let lootClaimInProgress=false;
$('#arena').addEventListener('click',async event=>{
 if(screen!=='combat'||pause.paused||!writable||saveBlocked||fatal||lootClaimInProgress)return;
 const ids=(event.target as Element).closest<HTMLButtonElement>('[data-pickup-ids]')?.dataset.pickupIds?.split(',');
 const runId=state.run?.id;
 if(!ids?.length||!runId)return;
 lootClaimInProgress=true;
 try {
  sound.suspend();
  // Pages has no ad SDK. The local adapter exercises the reward flow without showing a real ad.
  if(await platform.mockAd(pause)!=='success'||state.run?.id!==runId||screen!=='combat'||!writable||saveBlocked||fatal)return;
  const collected=collectPickups(state,ids);
  if(collected===state)return;
  const parts=collected.profile.crystals-state.profile.crystals, scrap=(collected.profile.scrap??0)-(state.profile.scrap??0);
  if(!save(collected)){toast('Не удалось сохранить. Добыча осталась на поле.');return;}
  state=collected;
  renderUI();
  toast([parts&&`Детали +${parts}`,scrap&&`Обломки +${scrap}`].filter(Boolean).join(' · '));
 } catch {
  toast('Реклама недоступна. Добыча осталась на поле.');
 } finally {
  lootClaimInProgress=false;
 }
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause.add('hidden');save();sound.suspend();}else{pause.remove('hidden');accumulator=0;last=performance.now();}});
window.addEventListener('pagehide',()=>{
 save();pageExiting=true;writable=false;lock.release();
});
// A history-restored document has relinquished its lock and must read the latest save.
window.addEventListener('pageshow',event=>{if(event.persisted&&pageExiting)location.reload();});
window.addEventListener('blur',()=>{pause.add('focus');accumulator=0;save();sound.suspend();});
window.addEventListener('focus',()=>{pause.remove('focus');accumulator=0;last=performance.now();});
window.addEventListener('keydown',e=>{
 if(gatesMoving||e.repeat||$('#modal-root').children.length||e.ctrlKey||e.metaKey||e.altKey)return;
 if(e.key==='Escape'&&screen==='menu'&&menuPage!=='title'){e.preventDefault();showMenuPage('title');return;}
 if(e.key==='Escape'&&screen==='combat'){e.preventDefault();battleMenu.open?closeBattleMenu():openBattleMenu();return;}
 if(battleMenu.open||isInteractiveTarget(e.target))return;
 if(e.key===' '&&screen==='combat'){e.preventDefault();togglePause();}
 if(['1','2','3','4'].includes(e.key))buy(STAT_KEYS[Number(e.key)-1]);
});

async function openSave(){
 const ownership=await lock.acquire();
 if(pageExiting){lock.release();return;}
 writable=ownership==='acquired';
 if(!writable){
  saveBlocked=true;
  const explanation=ownership==='busy'
   ? 'Сохранение пока занято другой сессией игры. Если это был предыдущий запуск, попробуйте снова. Если игра открыта в другом окне, сначала закройте его.'
   : 'Браузер не дал безопасный доступ к сохранению. Откройте игру напрямую в обычном окне актуального браузера и попробуйте снова. Прогресс не изменён.';
  modal('Защита сохранения',explanation,[{label:'Повторить',action:()=>void openSave().then(()=>renderUI())}],false);
  return;
 }
 try{
  repository=new SaveRepository(localStorage);
  const loaded=repository.load();
  if(loaded.state)state=loaded.state;
  if(loaded.warning)notify(loaded.warning);
  saveBlocked=loaded.blocked;
  if(saveBlocked)showSaveRecovery();
 }catch{
  saveBlocked=true;
  notify('Браузер запретил локальное сохранение. Разрешите данные сайта и обновите страницу.');
 }
}
async function init(){
 try {
  await platform.init();
  await openSave();
  try{scene=new SceneView($('#arena'));}catch(e){fatal=true;const el=document.createElement('div');el.className='fatal';el.innerHTML='<strong>⬡</strong><h2>Для 3D-арены нужен WebGL2</h2><p>Откройте игру в актуальном Chrome, Edge, Firefox или Safari с включённым аппаратным ускорением. Ваше сохранение не изменено.</p>';$('#arena').append(el);console.error('Scene initialization failed',e);}
  renderUI(true);
  const setup=Promise.all([scene?.assetsReady, startup&&loadInterface()]);
  await waitForBoot(setup.then(([models])=>{
   if(models===false)throw new Error('Game models are incomplete');
  }));
  scene?.prepare();
  const show=()=>{
   last=performance.now();
   requestAnimationFrame(animate);
  };
  const enableInput=()=>{
   root.inert=false;
   $('#modal-root').querySelector('button')?.focus();
  };
  if(startup){
   await startup.reveal(show,enableInput);
   if(screen==='menu'&&menuPage==='title')mountTitleWidgets();
  }else{
   show();enableInput();
  }
  if(scene)platform.gameReady();
 } catch(error){
  console.error('Oplot startup failed',error);
  startup?.fail('Не удалось загрузить игру');
 }
}
void init();
