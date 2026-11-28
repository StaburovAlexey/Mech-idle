import {bindArmoredScrollbars} from './armored-scroll';
/** Isolated visual QA of the actual shipped components. No game, storage or simulated GPU. */
import './style.css';
import './title.css';
import './battle-dock.css';
import './game-frame.css';
import {bindGameFrame} from './game-frame';
import {battleHudMarkup,battleMenuMarkup,bossBarMarkup,battleUpgradeDockMarkup,bindUpgradeTabs,renderCombatUpgrade,STAT_LABELS,setBattleMenuConfirmation} from './battle-ui';
import {COMBAT_KEYS} from './combat-upgrades';
import {STAT_KEYS} from './game';
import {arenaViewport} from './viewport';
const root=document.querySelector<HTMLDivElement>('#app')!;
const params=new URLSearchParams(location.search);
if(!params.has('embed')){
 document.body.style.cssText='padding:18px;overflow:auto;background:#10232c';
 root.innerHTML='<header style="margin:0 0 14px;max-width:900px"><h1 style="font:700 19px system-ui;margin:0 0 8px">Проверка UI-компонентов · без WebGL</h1><p style="font:13px system-ui;margin:0 0 12px;color:#bed1d7">Те же HTML-компоненты, CSS и игровые изображения, что в игре. В центре показан размер поля, без 3D и симуляции.</p><nav style="display:flex;gap:8px;flex-wrap:wrap"></nav></header><iframe title="Реальные компоненты боевого интерфейса" style="display:block;box-sizing:content-box;border:1px solid #4c6970;background:#152d34" src="?embed=1"></iframe>';
 const frame=root.querySelector<HTMLIFrameElement>('iframe')!;
 frame.src=`?embed=1&build=${encodeURIComponent(import.meta.url.split('/').pop()!)}`;
 for(const [w,h] of [[320,568],[390,844],[1280,720]]){const button=document.createElement('button');button.className='small-button';button.textContent=`${w} × ${h}`;button.onclick=()=>{frame.style.width=`${w}px`;frame.style.height=`${h}px`;};root.querySelector('nav')!.append(button);}
 frame.style.width='390px';frame.style.height='844px';
}else{
 document.body.classList.add('battle-active');
 const viewport=document.createElement('div'),stage=document.createElement('div');
 viewport.id='game-viewport';stage.id='game-stage';
 root.replaceWith(viewport);viewport.append(stage);stage.append(root);
 bindGameFrame(stage);
 root.innerHTML=`<div class="shell in-battle"><div class="battle-hud">${battleHudMarkup}${bossBarMarkup}</div><main class="workspace"><section class="arena-wrap"><div class="arena" id="review-scene"><div id="review-field" style="position:absolute;border:1px dashed #94c7c966;background:#2b3e3e;display:grid;place-items:center;text-align:center;padding:12px;font:12px system-ui;color:#c6dfdb">Область 3D-сцены<br>Респонсив в портретном режиме<br><small>В этой проверке WebGL не запускается</small></div></div></section></main><section class="upgrades" id="upgrades" aria-label="Улучшения">${battleUpgradeDockMarkup}</section><div class="battle-menu-overlay chain-panel-layer hidden" id="battle-menu-overlay">${battleMenuMarkup}</div></div><div id="modal-root"></div>`;
 const get=(s:string)=>root.querySelector<HTMLElement>(s)!;
 bindUpgradeTabs(get('#upgrades'));
 const drawerScrollbars=bindArmoredScrollbars(get('#battle-menu-overlay'));
 get('#battle-wave').textContent='7 / 30';get('#battle-hp').textContent='86 / 120';get('#battle-hp-fill').style.width='71.67%';get('#battle-gold').textContent='148';get('#battle-parts').textContent='18';get('#battle-scrap').textContent='34';
 const values=[18,120,1.4,1.5],costs=[44,80,160,53];
 STAT_KEYS.forEach((key,i)=>{const button=get(`#upgrade-${key}`) as HTMLButtonElement;button.disabled=i===2;button.classList.toggle('affordable',!button.disabled);button.querySelector('.upgrade-value')!.innerHTML=`${values[i]}<small>${STAT_LABELS[key].unit}</small>`;button.querySelector('.upgrade-cost')!.textContent=String(costs[i]);button.querySelector('.upgrade-sub')!.textContent='Улучшить';});
 for(const key of COMBAT_KEYS) renderCombatUpgrade(get(`#upgrade-${key}`) as HTMLButtonElement,key,1,148,false);
 const overlay=get('#battle-menu-overlay');
 const showConfirmation=(show:boolean)=>{setBattleMenuConfirmation(overlay,show);drawerScrollbars.refresh();get(show?'#battle-confirmation-cancel':'#battle-menu-abandon').focus();};
 const close=()=>{setBattleMenuConfirmation(overlay,false);overlay.classList.add('hidden');get('#battle-menu-toggle').setAttribute('aria-expanded','false');get('#battle-menu-toggle').focus();};
 const dismiss=()=>get('#battle-confirmation').classList.contains('hidden')?close():showConfirmation(false);
 get('#battle-menu-toggle').onclick=()=>{overlay.classList.remove('hidden');drawerScrollbars.refresh();get('#battle-menu-toggle').setAttribute('aria-expanded','true');get('#battle-menu-return').focus({preventScroll:true});};
 get('#battle-menu-return').onclick=close;
 get('#battle-menu-abandon').onclick=()=>showConfirmation(true);
 get('#battle-confirmation-cancel').onclick=()=>showConfirmation(false);
 get('#battle-confirmation-end').onclick=close;
 overlay.onclick=event=>{if(event.target===overlay)dismiss();};
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overlay.classList.contains('hidden'))dismiss();});
 const resize=()=>{const stage=get('#review-scene'),v=arenaViewport(stage.clientWidth,stage.clientHeight),field=get('#review-field');Object.assign(field.style,{left:`${v.x}px`,top:`${v.y}px`,width:`${v.width}px`,height:`${v.height}px`});};
 new ResizeObserver(resize).observe(get('#review-scene'));resize();
}
