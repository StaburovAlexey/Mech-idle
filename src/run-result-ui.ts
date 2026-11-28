import { bindArmoredScrollbars } from './armored-scroll';
import { animateChainSheet, chainPanelSheet } from './chain-panel';
import { currencyIcon } from './currency-ui';
import { runRewards, type RunResult } from './game';
import './run-result.css';

const format = (n:number)=>n.toLocaleString('ru-RU');
const video='<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="1.8" y="4" width="16.4" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="m8 7 5 3-5 3z" fill="currentColor"/></svg>';
const badges={
 victory:'<path d="M18 3 31 8v8c0 8-6 13-13 17C11 29 5 24 5 16V8l13-5Z"/><path d="m12 18 4 4 8-9"/><path d="M10 12V9l8-3" opacity=".5"/>',
 defeat:'<path d="M16 4 5 8v8c0 8 5 13 12 17M22 5l9 3v8c0 8-5 13-12 17"/><path d="m20 4-5 9 6 4-5 7 3 8"/>',
};

export function runResultMarkup(result: RunResult) {
 const {parts,scrap}=runRewards(result);
 const button=(ad:boolean)=>{
  const m=ad?2:1,p=format(parts*m),s=format(scrap*m);
  return `<button id="result-claim${ad?'-ad':''}" class="title-button ${ad?'result-ad-button':'title-primary'}" type="button" aria-label="${ad?'За рекламу ×2':'Забрать'}: детали ${p}, обломки ${s}" disabled>
   <span class="result-claim-label">${ad?video+'×2 за рекламу':'Забрать'}</span>
   <span class="result-claim-values" aria-hidden="true"><b>${currencyIcon('parts')}${p}</b><b>${currencyIcon('scrap')}${s}</b></span>
  </button>`;
 };
 return chainPanelSheet(`<div class="chain-panel-content result-report" role="dialog" aria-modal="true" aria-labelledby="run-result-title">
   <div class="result-status">
    <div class="result-badge" aria-hidden="true"><svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${badges[result.outcome]}</svg></div>
    <h1 tabindex="-1" id="run-result-title">${result.outcome==='victory'?'Победа':'Оплот пал'}</h1>
   </div>
   <div class="result-waves">
    <p>Отбито волн: <strong aria-hidden="true"><span id="result-wave-count">0</span> / 30</strong><span class="result-sr-only">${result.completedWaves} из 30</span></p>
    <div class="result-wave-bar" aria-hidden="true"><span></span></div>
   </div>
   <div class="result-rewards">
    <h2 class="result-earned">Заработано за забег</h2>
    <div class="result-loot">
     <div>${currencyIcon('parts')}<strong id="result-earned-parts">+0</strong><span>Детали</span></div>
     <div>${currencyIcon('scrap')}<strong id="result-earned-scrap">+0</strong><span>Обломки</span></div>
    </div>
   </div>
   <div class="result-claim-row">${button(false)}${button(true)}</div>
   <p class="result-message" role="status"></p>
 </div>`);
}

export function animateRunResult(panel:HTMLElement,result:RunResult,done:()=>void) {
 const {parts,scrap}=runRewards(result);
 const sheet=panel.querySelector<HTMLElement>('.chain-panel-sheet')!;
 const [status,waves,rewards,actions]=panel.querySelectorAll<HTMLElement>('.result-status,.result-waves,.result-rewards,.result-claim-row');
 const count=panel.querySelector('#result-wave-count')!;
 const bar=panel.querySelector<HTMLElement>('.result-wave-bar span')!;
 const details=panel.querySelector('#result-earned-parts')!,fragments=panel.querySelector('#result-earned-scrap')!;
 const drawWaves=(fraction:number)=>{
  const n=Math.floor(result.completedWaves*fraction);
  count.textContent=String(n);bar.style.width=`${n/30*100}%`;
 };
 const drawRewards=(fraction:number)=>{
  details.textContent='+'+format(Math.floor(parts*fraction));fragments.textContent='+'+format(Math.floor(scrap*fraction));
 };
 const reveal=(block:HTMLElement)=>block.classList.add('result-revealed');
 const finish=()=>{drawWaves(1);drawRewards(1);reveal(actions);done();};
 const scrollbars=bindArmoredScrollbars(panel);
 const motion=animateChainSheet(sheet,true);
 panel.classList.add('result-started');
 let id=0,disposed=false;
 const startBlocks=()=>{
  if(disposed)return;
  motion?.cancel();
  reveal(status);
  if(!document.querySelector('#modal-root')?.children.length)
   status.querySelector('h1')?.focus({preventScroll:true});
  if(!motion){reveal(waves);reveal(rewards);finish();return;}
  const start=performance.now(),ease=(elapsed:number,duration:number)=>1-(1-Math.min(1,elapsed/duration))**1.7;
  const frame=(now:number)=>{
   const elapsed=now-start;
   if(elapsed>=150){reveal(waves);drawWaves(ease(elapsed-150,480));}
   if(elapsed>=630){reveal(rewards);drawRewards(ease(elapsed-630,640));}
   if(elapsed>=1270)finish();else id=requestAnimationFrame(frame);
  };
  id=requestAnimationFrame(frame);
 };
 if(motion)void motion.finished.then(startBlocks,()=>{});else startBlocks();
 return ()=>{disposed=true;motion?.cancel();cancelAnimationFrame(id);scrollbars.dispose();};
}
