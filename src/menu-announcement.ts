import type { RewardTab } from './lobby-rewards-ui';
import './menu-announcement.css';

type Destination = RewardTab | 'offer';
export type Announcement = { title: string; text: string; action: string; destination: Destination };

export const SPECIAL_OFFER: Announcement = {
 title:'Спецпредложение',text:'Набор снабжения',action:'Посмотреть',destination:'offer',
};

const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12 4 7.5M12 12v9"/></svg>';

export class MenuAnnouncements {
 private offerDismissed=false;

 mount(host: HTMLElement, queue: ()=>readonly Announcement[], open: (destination: Destination)=>void, fallbackFocus: ()=>void) {
  const dismissed=new Set<Destination>();
  let current:Destination|undefined, leaving=false;
  const play=(card: HTMLElement,frames: Keyframe[],duration: number,done: ()=>void)=>{
   if(!card.animate||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){done();return;}
   const animation=card.animate(frames,{duration,easing:'cubic-bezier(.22,.72,.25,1)',fill:'both'});
   void animation.finished.then(()=>{animation.cancel();done();},()=>{});
   return animation;
  };
  const show=(from: 'right'|'bottom', returnFocus=false)=>{
   if(leaving||!host.isConnected)return;
   const item=queue().find(({destination})=>!dismissed.has(destination)&&!(destination==='offer'&&this.offerDismissed));
   if(item?.destination===current&&!returnFocus)return;
   const hadFocus=host.contains(document.activeElement);
   current=item?.destination;
   if(!item){host.replaceChildren();if(returnFocus||hadFocus)fallbackFocus();return;}
   host.innerHTML=`<aside class="menu-announcement" aria-label="Оповещение">
    <span class="menu-announcement-icon" aria-hidden="true">${icon}</span>
    <div class="menu-announcement-copy" aria-live="polite"><strong></strong><p></p></div>
    <button type="button" class="menu-announcement-action"><span></span> <i aria-hidden="true">›</i></button>
    <button type="button" class="menu-announcement-close" aria-label="Скрыть оповещение">×</button>
   </aside>`;
   const card=host.firstElementChild as HTMLElement;
   card.querySelector('strong')!.textContent=item.title;
   card.querySelector('p')!.textContent=item.text;
   const action=card.querySelector<HTMLButtonElement>('.menu-announcement-action')!;
   const close=card.querySelector<HTMLButtonElement>('.menu-announcement-close')!;
   action.querySelector('span')!.textContent=item.action;
   const entering=play(card,[{transform:from==='right'?'translateX(102%)':'translateY(18px)',opacity:0},
    {transform:'none',opacity:1}],from==='right'?360:280,()=>{});
   const dismiss=(navigate: boolean)=>{
    if(leaving||card.parentElement!==host||!host.isConnected||host.closest('[inert]'))return;
    leaving=true;
    dismissed.add(item.destination);
    if(item.destination==='offer')this.offerDismissed=true;
    card.inert=true;
    const { transform,opacity }=getComputedStyle(card);
    entering?.cancel();
    play(card,[{transform,opacity},{transform:'translateY(-18px)',opacity:0}],240,()=>{
     leaving=false;
     if(!host.isConnected)return;
     if(navigate)open(item.destination);
     show('bottom',!navigate);
    });
   };
   action.onclick=()=>dismiss(true);
   if(item.destination==='offer')card.onclick=event=>{if(!(event.target as HTMLElement).closest('button'))dismiss(true);};
   close.onclick=()=>dismiss(false);
   if(returnFocus||host.contains(document.activeElement)||hadFocus&&!host.closest('[inert]'))close.focus({preventScroll:true});
  };
  show('right');
  return ()=>show('right');
 }
}
