import { armoredScrollMarkup, bindArmoredScrollbars } from './armored-scroll';
import { armoredFrame } from './armored-frame';
import './chain-panel.css';

type PanelContent = {
 title: string; subtitle: string; body: string; leading?: string;
 headingId: string; closeId: string; descriptionId: string;
 returnFocus: () => void;
};

export function chainPanelSheet(content:string) {
 return armoredFrame('section','chain-panel-sheet',`
   <span class="chain-panel-chain left" aria-hidden="true"></span><span class="chain-panel-chain right" aria-hidden="true"></span>
   ${armoredScrollMarkup(content)}`);
}

export function animateChainSheet(sheet:HTMLElement, enter:boolean) {
 if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||!sheet.animate)return;
 const frames=enter?
  [{transform:'translateY(-100cqh)',easing:'cubic-bezier(.26,.65,.44,1)'},{transform:'translateY(14px)',offset:.76,easing:'ease-out'},{transform:'translateY(0)'}]:
  [{transform:'translateY(0)',easing:'ease-out'},{transform:'translateY(10px)',offset:.23,easing:'cubic-bezier(.55,0,.8,.45)'},{transform:'translateY(-100cqh)'}];
 return sheet.animate(frames,{duration:enter?590:460,fill:'both'});
}

export function openChainPanel(area: HTMLElement, shell: HTMLElement, panel: PanelContent) {
 if (area.childElementCount) return null;
 const frame=chainPanelSheet(`<div class="chain-panel-content" role="dialog" aria-modal="true" aria-labelledby="${panel.headingId}" aria-describedby="${panel.descriptionId}">
    <header class="chain-panel-head">
     ${panel.leading??''}<div><small>${panel.subtitle}</small><h2 id="${panel.headingId}">${panel.title}</h2></div>
     <button type="button" class="chain-panel-close" id="${panel.closeId}" aria-label="Закрыть">×</button>
    </header>
    ${panel.body}
   </div>`);
 area.innerHTML=`<div class="chain-panel-layer">${frame}</div>`;
 const layer=area.firstElementChild as HTMLElement;
 const scrollbars=bindArmoredScrollbars(layer);
 const sheet=layer.querySelector<HTMLElement>('.chain-panel-sheet')!;
 const closeButton=layer.querySelector<HTMLButtonElement>('.chain-panel-close')!;
 const controller={busy:false,onBusyChange:()=>{}};
 let closing=false, closeRequested=false;
 shell.inert=true;
 const setBusy=(busy:boolean)=>{controller.busy=busy;controller.onBusyChange();};
 const slide=(enter:boolean,done:()=>void)=>{
  const motion=animateChainSheet(sheet,enter);
  if(!motion){done();return;}
  setBusy(true);
  const finish=()=>{motion.cancel();setBusy(false);done();};
  void motion.finished.then(finish,finish);
 };
 function close(){
  if(closing)return;
  if(controller.busy){closeRequested=true;return;}
  closing=true;
  layer.classList.add('closing');
  slide(false,()=>{
   scrollbars.dispose();area.replaceChildren();area.onkeydown=null;shell.inert=false;panel.returnFocus();
  });
 }
 closeButton.onclick=close;
 layer.onclick=e=>{if(e.target===layer)close();};
 area.onkeydown=e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
  if(e.key!=='Tab')return;
  const controls=[...sheet.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')];
  const current=controls.indexOf(document.activeElement as HTMLElement);
  const next=current<0?(e.shiftKey?controls.length-1:0):(current+(e.shiftKey?-1:1)+controls.length)%controls.length;
  e.preventDefault();controls[next]?.focus();
 };
 closeButton.focus();
 slide(true,()=>{if(closeRequested)close();});
 return controller;
}
