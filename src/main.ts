import './style.css';
import {createState,startRun,step,buyRunUpgrade,buyMetaUpgrade,setPaused,getStats,calculateStats,runPrice,metaPrice,STAT_KEYS,RUN_CAP,META_CAP,DT,type GameState,type StatKey} from './game';
import {SceneView,type SceneFrame} from './scene';
import {SaveRepository,PauseManager,TabLock} from './persistence';
import {LocalPlatformAdapter} from './platform';
import {Sound} from './audio';
const $=<T extends HTMLElement=HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const root=$('#app');
root.innerHTML=`<div class="shell"><header class="topbar"><div class="brand"><div class="brand-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 27v-6l6-5V6h12v7h6v7h-6v7H5Z" stroke="currentColor" stroke-width="2"/><path d="M14 10h5v5h-5z" fill="currentColor"/></svg></div><div><div class="brand-name">ОПЛОТ</div><div class="brand-sub">Турель и мехи · Прототип 01</div></div></div><div class="top-actions"><span class="pill"><span class="live-dot"></span>СЕКТОР 07</span><button class="icon-button" id="sound" aria-label="Включить звук" title="Звук">♪</button><button class="icon-button" id="help" aria-label="Как играть" title="Как играть">?</button></div></header><div id="notice" class="status-warning hidden" role="status"></div><main class="workspace"><section class="panel" id="panel" aria-label="Панель управления"></section><section class="arena-wrap" aria-label="3D поле боя"><div class="arena" id="arena"></div><div class="arena-top"><div class="arena-label">ПЕРИМЕТР <span>АВТОНОМНАЯ ОБОРОНА</span></div><div class="arena-label" id="arena-status">СИСТЕМЫ ГОТОВЫ</div></div><div class="floating-message" id="toast" role="status" aria-live="polite"></div><div id="boss" class="boss-bar hidden"><b>КОЛОСС / ТЯЖЁЛЫЙ МЕХ</b><div class="boss-track"><div class="boss-fill" id="boss-fill"></div></div></div><div class="arena-bottom"><span class="coordinate">X: 00.0 / Y: 00.0</span><span class="arena-note" id="arena-note">Один оплот. Тридцать волн.</span></div><div class="paused-overlay hidden" id="paused"><h2>Пауза</h2><p>Бой и ремонт остановлены. Ничего не происходит в ваше отсутствие.</p><button class="main-button" id="unpause">Продолжить бой</button></div></section></main><div class="section-head"><strong id="shop-title">Мастерская</strong><span id="shop-note">Улучшения для всех будущих забегов</span></div><section class="upgrades" id="upgrades" aria-label="Улучшения"></section><footer class="foot"><span id="save-status">Локальное сохранение · без офлайн-дохода</span><span>3D / 30 ВОЛН / ФИНАЛЬНЫЙ БОСС</span></footer></div><div id="modal-root"></div>`;
const labels:Record<StatKey,{title:string,icon:string,unit:string}>={damage:{title:'Сила атаки',icon:'↗',unit:'урона'},maxHp:{title:'Бронекорпус',icon:'⬡',unit:'HP'},attackSpeed:{title:'Темп стрельбы',icon:'⌁',unit:'/с'},regen:{title:'Ремонт',icon:'✚',unit:'HP/с'}};
const fmt=(n:number)=>Number.isInteger(n)?String(n):n.toFixed(1).replace('.',',');
const coins=(n:number)=>n.toLocaleString('ru-RU');
let state:GameState=createState(), screen:'menu'|'combat'|'result'='menu', renderedScreen='';
let repository:SaveRepository|null=null, writable=false, saveBlocked=false, fatal=false, saveTimer=0, uiTimer=0, toastTimer=0, accumulator=0, last=performance.now();
let scene:SceneView|null=null;
const pause=new PauseManager(),lock=new TabLock(),platform=new LocalPlatformAdapter(),sound=new Sound();
pause.add('menu');
function notify(text:string){$('#notice').textContent=text;$('#notice').classList.remove('hidden');}
function toast(text:string){$('#toast').textContent=text;$('#toast').classList.add('show');toastTimer=3;}
function save(){if(!repository||!writable||saveBlocked)return;if(!repository.save(state)){notify('Не удалось сохранить прогресс. Освободите место для этого сайта и не закрывайте вкладку.');$('#save-status').textContent='Сохранение не удалось';}else{$('#save-status').textContent='Прогресс сохранён на этом устройстве';}saveTimer=0;}
function modal(title:string,text:string,actions:{label:string,action:()=>void,secondary?:boolean}[]){
 const before=document.activeElement as HTMLElement|null;pause.add('dialog');
 const area=$('#modal-root');area.innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title"></h2><p id="modal-body"></p><div class="button-row"></div></section></div>`;
 $('#modal-title').textContent=title;$('#modal-body').textContent=text;
 const close=()=>{area.innerHTML='';pause.remove('dialog');accumulator=0;before?.focus();};
 for(const action of actions){const btn=document.createElement('button');btn.className='main-button'+(action.secondary?' secondary':'');btn.textContent=action.label;btn.onclick=()=>{close();action.action();};$('.button-row').append(btn);}
 area.querySelector<HTMLButtonElement>('button')?.focus();
 area.onkeydown=e=>{if(e.key==='Tab'){const buttons=[...area.querySelectorAll<HTMLButtonElement>('button')];const index=buttons.indexOf(document.activeElement as HTMLButtonElement);e.preventDefault();buttons[(index+(e.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();}};
}
function downloadCorrupt(){if(!repository)return;const blob=new Blob([repository.raw()],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='oplot-save-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function showSaveRecovery(){modal('Сохранение повреждено','Старые данные оставлены на устройстве. Сначала можно скачать копию. Новый профиль удалит текущее локальное сохранение и его резервную копию.',[{label:'Скачать копию',secondary:true,action:()=>{downloadCorrupt();showSaveRecovery();}},{label:'Новый профиль',action:()=>modal('Начать с нуля?','Кристаллы, постоянные улучшения и незаконченный забег будут удалены на этом устройстве.',[{label:'Отмена',secondary:true,action:showSaveRecovery},{label:'Удалить и начать',action:()=>{repository?.reset();state=createState();saveBlocked=false;$('#notice').classList.add('hidden');save();renderUI(true);}}])}]);}
function openMenu(){screen='menu';pause.add('menu');pause.remove('user');accumulator=0;save();renderUI(true);}
function resume(){if(!state.run||fatal||saveBlocked||!writable)return;screen='combat';pause.remove('menu');pause.remove('user');state=setPaused(state,false);accumulator=0;last=performance.now();renderUI(true);}
function launch(){if(fatal||saveBlocked||!writable)return;const seed=crypto.getRandomValues(new Uint32Array(1))[0];state=startRun(state,seed);screen='combat';pause.remove('menu');pause.remove('user');accumulator=0;last=performance.now();save();renderUI(true);toast('Волна 1 · оборона запущена');}
function togglePause(){if(screen!=='combat'||!state.run)return;if(pause.reasons.has('user'))pause.remove('user');else pause.add('user');accumulator=0;save();renderUI();}
function buy(stat:StatKey){if(!writable||saveBlocked||fatal||screen==='result')return;const before=state;state=screen==='combat'?buyRunUpgrade(state,stat):buyMetaUpgrade(state,stat);if(state!==before){sound.play('upgrade');save();toast(screen==='combat'?'Модуль заказан · активация после волны':'Стартовые параметры улучшены');renderUI();}}
$('#upgrades').innerHTML=STAT_KEYS.map(stat=>`<button class="upgrade" data-stat="${stat}" id="upgrade-${stat}"><div class="upgrade-top"><span class="upgrade-title"><span class="stat-icon" aria-hidden="true">${labels[stat].icon}</span>${labels[stat].title}</span><span class="upgrade-level"></span></div><div class="upgrade-data"><span class="upgrade-value"></span><span class="upgrade-price"></span></div><div class="upgrade-sub"></div></button>`).join('');
for(const stat of STAT_KEYS)$(`#upgrade-${stat}`).onclick=()=>buy(stat);
$('#sound').onclick=()=>{const enabled=sound.toggle();$('#sound').textContent=enabled?'♫':'♪';$('#sound').setAttribute('aria-label',enabled?'Выключить звук':'Включить звук');$('#sound').setAttribute('aria-pressed',String(enabled));if(pause.paused)sound.suspend();};
$('#unpause').onclick=togglePause;
$('#help').onclick=()=>modal('Как защитить оплот','Турель прицеливается и стреляет сама. За каждого уничтоженного меха вы получаете золото. Купленные в бою модули включаются после завершения волны. Здоровье между волнами не заполняется: нужен ремонт. За каждую пройденную волну начисляется 1 кристалл. Кристаллы и улучшения мастерской сохраняются после поражения. На волне 30 ждёт Колосс. Клавиши 1–4 покупают модули, пробел включает паузу.',[{label:'Понятно',action:()=>{}}]);
function drawPanel(){
 const panel=$('#panel');panel.className=`panel ${screen}-panel`;
 if(screen==='menu')panel.innerHTML=`<div class="menu-intro"><div class="eyebrow">Автономная оборона</div><h1>Удержать<br>любой ценой.</h1><p>Мехи идут со всех сторон.<br>Выбирайте, чем усилить оплот.</p></div><div class="tag-row"><span class="tag">30 ВОЛН</span><span class="tag">ОДНА ТУРЕЛЬ</span><span class="tag">КОЛОСС</span></div><div class="separator"></div><div class="currency"><span class="symbol">◇</span><strong id="menu-crystals">0</strong><span>кристаллов<br>в мастерской</span></div><div class="menu-actions"><button class="main-button" id="start">Новый забег <span aria-hidden="true">↗</span></button><button class="small-button hidden" id="resume">Продолжить забег</button></div><p class="hint" id="menu-hint">Золото действует только в забеге.<br>Кристаллы и мастерская сохраняются.</p><div class="panel-bottom help-list"><div class="help-item"><b>01</b><span>Турель стреляет автоматически</span></div><div class="help-item"><b>02</b><span>Уничтожайте мехов и покупайте модули</span></div><div class="help-item"><b>03</b><span>Поражение — начало нового забега</span></div></div>`;
 else if(screen==='combat')panel.innerHTML=`<div class="combat-wave"><div class="eyebrow">Удерживайте периметр</div><div class="wave-label"><strong id="wave-num">1</strong><span>/ 30 волн</span></div><p id="wave-caption">Обнаружены вражеские мехи</p></div><div class="wave-dots">${Array.from({length:30},(_,i)=>`<i data-wave="${i+1}"></i>`).join('')}</div><div class="separator"></div><div class="combat-health"><div class="health-header"><span class="health-label">Корпус турели</span><strong id="hp-label"></strong></div><div class="health-track"><div id="hp-fill" class="health-fill"></div></div><div class="regen" id="regen-label"></div></div><div class="combat-stats"><div class="stat-box gold"><span>◈ Золото</span><strong id="gold-label"></strong></div><div class="stat-box crystals"><span>◇ Кристаллы</span><strong id="crystal-label"></strong></div></div><div class="help-list"><div class="help-item"><b>!</b><span>Новые модули включаются после завершения волны</span></div><div class="help-item"><b>+</b><span>Здоровье переносится между волнами. Ремонт восстанавливает HP в секунду</span></div></div><div class="combat-actions panel-bottom"><button class="main-button secondary" id="pause">Пауза</button><button class="small-button" id="menu">В меню · сохранить</button></div><div class="keyboard"><span><kbd>1</kbd>–<kbd>4</kbd> модули</span><span><kbd>Space</kbd> пауза</span></div>`;
 else panel.innerHTML=`<div class="result-emblem">${state.result?.outcome==='victory'?'★':'⬡'}</div><div class="eyebrow">${state.result?.outcome==='victory'?'Периметр защищён':'Связь с оплотом потеряна'}</div><h1>${state.result?.outcome==='victory'?'Колосс<br>повержен.':'Забег<br>завершён.'}</h1><p>${state.result?.outcome==='victory'?'Все 30 волн пройдены. Вы удержали сектор.':'Кристаллы сохранены. Усильте стартовые параметры и вернитесь в бой.'}</p><div class="combat-stats"><div class="stat-box"><span>Пройдено волн</span><strong>${state.result?.completedWaves??0} / 30</strong></div><div class="stat-box crystals"><span>Заработано</span><strong>+${state.result?.earnedCrystals??0} ◇</strong></div><div class="stat-box"><span>Уничтожено мехов</span><strong>${state.result?.kills??0}</strong></div><div class="stat-box"><span>Время обороны</span><strong>${Math.floor((state.result?.duration??0)/60)}:${String(Math.floor((state.result?.duration??0)%60)).padStart(2,'0')}</strong></div></div><p class="hint">Временное золото и боевые модули сброшены. Улучшения мастерской остаются с вами.</p><button class="main-button panel-bottom" id="to-workshop">В мастерскую ↗</button>`;
 if(screen==='menu'){$('#start').onclick=launch;$('#resume').onclick=resume;}
 if(screen==='combat'){$('#pause').onclick=togglePause;$('#menu').onclick=openMenu;}
 if(screen==='result')$('#to-workshop').onclick=openMenu;
 renderedScreen=screen;
}
function renderUI(force=false){
 if(force||renderedScreen!==screen)drawPanel();
 const stats=getStats(state),pending=getStats(state,true),run=state.run,battle=screen==='combat';
 if(screen==='menu'){$('#menu-crystals').textContent=coins(state.profile.crystals);$('#start').classList.toggle('hidden',!!run);$('#resume').classList.toggle('hidden',!run);($('#start') as HTMLButtonElement).disabled=fatal||saveBlocked||!writable;($('#resume') as HTMLButtonElement).disabled=fatal||saveBlocked||!writable;if(run){$('#menu-hint').textContent=`Забег сохранён на волне ${run.wave}. Мастерская доступна после завершения забега.`;$('#resume').textContent=`Продолжить · волна ${run.wave}`;}}
 if(battle&&run){$('#wave-num').textContent=String(run.wave);$('#wave-caption').textContent=run.phase==='interwave'?`Следующая волна через ${Math.max(1,Math.ceil(2-run.phaseTime))} с`:run.wave===30?'Финальная цель: Колосс':`${run.enemies.length} мехов в периметре`;
 $('#hp-label').textContent=`${Math.ceil(run.hp)} / ${fmt(stats.maxHp)}`;$('#hp-fill').style.width=`${100*run.hp/stats.maxHp}%`;$('#hp-fill').classList.toggle('low',run.hp<stats.maxHp*.3);$('#regen-label').textContent=`Ремонт: ${fmt(stats.regen)} HP/с`;$('#gold-label').textContent=coins(run.gold);$('#crystal-label').textContent=coins(state.profile.crystals);$('#pause').textContent=pause.reasons.has('user')?'Продолжить':'Пауза';
 for(const d of document.querySelectorAll<HTMLElement>('[data-wave]'))d.className=Number(d.dataset.wave)<run.wave?'done':Number(d.dataset.wave)===run.wave?'current':'';
 }
 $('#paused').classList.toggle('hidden',!(battle&&pause.reasons.has('user')));
 $('#arena-status').textContent=fatal?'ТРЕБУЕТСЯ WEBGL2':battle?(pause.paused?'ПАУЗА':run?.wave===30?'КОЛОСС ПРИБЛИЖАЕТСЯ':'БОЕВОЙ РЕЖИМ'):'СИСТЕМЫ ГОТОВЫ';
 $('#arena-note').textContent=battle?'Автоогонь · покупайте модули за золото':'Один оплот. Тридцать волн.';
 const boss=run?.enemies.find(e=>e.kind==='boss');$('#boss').classList.toggle('hidden',!boss||!battle);if(boss)$('#boss-fill').style.width=`${boss.hp/boss.maxHp*100}%`;
 $('#shop-title').textContent=battle?'Боевые модули · золото':'Мастерская · кристаллы';$('#shop-note').textContent=battle?'Включаются после завершения волны':'Усиливают старт будущих забегов';
 for(const stat of STAT_KEYS){const btn=$<HTMLButtonElement>(`#upgrade-${stat}`),level=battle?run?.levels[stat]??0:state.profile.meta[stat],cap=battle?RUN_CAP:META_CAP,price=battle?runPrice(stat,level):metaPrice(stat,level),budget=battle?run?.gold??0:state.profile.crystals;
 let nextValue=0,current=battle?stats[stat]:calculateStats(state.profile.meta)[stat];
 if(battle&&run){const nextLevel={...run.levels,[stat]:level+1};nextValue=calculateStats(state.profile.meta,nextLevel)[stat];}else nextValue=calculateStats({...state.profile.meta,[stat]:level+1})[stat];
 const pendingLevel=battle&&run?level-run.activeLevels[stat]:0;
 btn.classList.toggle('meta',!battle);btn.classList.toggle('affordable',budget>=price&&level<cap&&(battle||!run));btn.disabled=level>=cap||budget<price||(!battle&&!!run)||screen==='result'||fatal||saveBlocked||!writable;
 btn.querySelector('.upgrade-level')!.textContent=`${level}/${cap}${pendingLevel?` +${pendingLevel} ждёт`:''}`;
 btn.querySelector('.upgrade-value')!.innerHTML=`${fmt(current)}<small>${labels[stat].unit}</small>`;
 btn.querySelector('.upgrade-price')!.textContent=level>=cap?'МАКС':`${battle?'◈':'◇'} ${coins(price)}`;
 btn.querySelector('.upgrade-sub')!.textContent=level>=cap?'Максимальный уровень':pendingLevel?`Заказано: ${fmt(pending[stat])} → далее ${fmt(nextValue)}`:`Следующий: ${fmt(nextValue)} ${labels[stat].unit}`;
 btn.setAttribute('aria-label',`${labels[stat].title}, уровень ${level}, сейчас ${fmt(current)}, следующий ${fmt(nextValue)}, цена ${price} ${battle?'золота':'кристаллов'}`);
 }
}
function frameForScene():SceneFrame{
 const r=state.run,stats=getStats(state),target=r?.enemies.find(e=>e.id===r.targetId);
 return {enemies:r?.enemies.map(e=>({...e,kind:e.kind==='ordinary'?'normal':e.kind}))??[],bullets:r?.bullets??[],warnings:r?.warnings??[],target:target??null,turretHPfraction:r?r.hp/stats.maxHp:1,phase:screen==='menu'&&!r?'menu':screen,elapsed:r?.time??0,shooting:state.events.some(e=>e.type==='shot')};
}
function animate(now:number){
 const delta=Math.min((now-last)/1000,.15);last=now;
 if(state.run&&screen==='combat'&&!pause.paused&&!fatal&&writable){
  state=setPaused(state,false);accumulator=Math.min(accumulator+delta,.15);
  let ticks=0;while(accumulator>=DT&&ticks<5&&state.run){state=step(state);accumulator-=DT;ticks++;
   for(const ev of state.events){if(ev.type==='shot')sound.play('shot');if(ev.type==='kill'){sound.play('kill');toast(`+${ev.amount} золота`);}if(ev.type==='waveComplete'){sound.play('wave');toast(`Волна ${ev.wave} пройдена · +1 кристалл`);}if(ev.type==='waveStart'&&ev.wave===30)toast('ВНИМАНИЕ: КОЛОСС · финальный босс');}
   if(state.events.some(e=>e.type==='kill'||e.type==='waveComplete'||e.type==='runEnded'))save();
  }
  if(!state.run&&state.result){screen='result';pause.add('menu');save();renderUI(true);}
 }else accumulator=0;
 if(scene)scene.render(frameForScene(),pause.paused?0:delta);
 uiTimer+=delta;saveTimer+=delta;toastTimer-=delta;
 if(toastTimer<=0)$('#toast').classList.remove('show');
 if(uiTimer>=.12){renderUI();uiTimer=0;}
 if(saveTimer>=1&&state.run&&!pause.paused)save();
 if(pause.paused)sound.suspend();else sound.resume();
 requestAnimationFrame(animate);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){pause.add('hidden');save();sound.suspend();}else{pause.remove('hidden');accumulator=0;last=performance.now();}});
window.addEventListener('pagehide',()=>save());
window.addEventListener('keydown',e=>{if(e.repeat||$('#modal-root').children.length||e.ctrlKey||e.metaKey||e.altKey||(e.target instanceof HTMLElement&&e.target.closest('button,input,select,textarea,a,[contenteditable]')))return;if(e.key===' '&&screen==='combat'){e.preventDefault();togglePause();}if(['1','2','3','4'].includes(e.key))buy(STAT_KEYS[Number(e.key)-1]);if(e.key==='Escape'&&screen==='combat')togglePause();});
async function init(){
 await platform.init();
 writable=await lock.acquire();
 if(!writable){saveBlocked=true;notify('Игра уже открыта в другой вкладке либо браузер не поддерживает безопасную запись. Закройте другую вкладку и обновите эту страницу.');modal('Защита сохранения','Одновременно можно играть только в одной вкладке. Закройте другую вкладку с игрой, затем обновите страницу. Используйте современный браузер с поддержкой Web Locks.',[{label:'Обновить',action:()=>location.reload()}]);}
 if(writable){try{repository=new SaveRepository(localStorage);const loaded=repository.load();if(loaded.state)state=loaded.state;if(loaded.warning)notify(loaded.warning);saveBlocked=loaded.blocked;if(saveBlocked)showSaveRecovery();}catch{saveBlocked=true;notify('Браузер запретил локальное сохранение. Разрешите данные сайта и обновите страницу.');}}
 try{scene=new SceneView($('#arena'));platform.gameReady();}catch(e){fatal=true;const el=document.createElement('div');el.className='fatal';el.innerHTML='<strong>⬡</strong><h2>Для 3D-арены нужен WebGL2</h2><p>Откройте игру в актуальном Chrome, Edge, Firefox или Safari с включённым аппаратным ускорением. Ваше сохранение не изменено.</p>';$('#arena').append(el);console.error('Scene initialization failed',e);}
 renderUI(true);requestAnimationFrame(animate);
}
void init();
