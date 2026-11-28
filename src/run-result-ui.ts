import { armoredFrame } from './armored-frame';
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
 return `<div class="result-mast"><strong>ОПЛОТ</strong><span>Сектор 07</span></div>
 ${armoredFrame('section','result-report',`
   <div class="result-tag">Итог забега</div>
   <div class="result-status">
    <div class="result-badge" aria-hidden="true"><svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${badges[result.outcome]}</svg></div>
    <h1 tabindex="-1" id="run-result-title">${result.outcome==='victory'?'Победа':'Оплот пал'}</h1>
    <p>Отбито волн: <strong>${result.completedWaves} / 30</strong></p>
    <div class="result-wave-bar" aria-hidden="true"><span style="width:${result.completedWaves/30*100}%"></span></div>
   </div>
   <h2 class="result-earned">Заработано за забег</h2>
   <div class="result-loot">
    <div>${currencyIcon('parts')}<strong id="result-earned-parts">+0</strong><span>Детали</span></div>
    <div>${currencyIcon('scrap')}<strong id="result-earned-scrap">+0</strong><span>Обломки</span></div>
   </div>
   <div class="result-claim-row" aria-hidden="true">${button(false)}${button(true)}</div>
   <p class="result-message" role="status"></p>
 `, 'Итог забега')}
 <div class="result-foot">Отчёт обороны · Сектор 07</div>`;
}

export function animateRunRewards(panel:HTMLElement,result:RunResult,done:()=>void) {
 const {parts,scrap}=runRewards(result);
 const details=panel.querySelector('#result-earned-parts')!,fragments=panel.querySelector('#result-earned-scrap')!;
 const row=panel.querySelector('.result-claim-row')!;
 const draw=(fraction:number)=>{details.textContent='+'+format(Math.floor(parts*fraction));fragments.textContent='+'+format(Math.floor(scrap*fraction));};
 const reveal=()=>{draw(1);row.setAttribute('aria-hidden','false');done();};
 if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||!(parts||scrap)){reveal();return ()=>{};}
 let id=0;
 const start=performance.now();
 const frame=(now:number)=>{
  const fraction=Math.max(0,Math.min(1,(now-start-90)/780));
  draw(1-(1-fraction)**1.7);
  if(now-start>=950)reveal();else id=requestAnimationFrame(frame);
 };
 id=requestAnimationFrame(frame);
 return ()=>cancelAnimationFrame(id);
}
