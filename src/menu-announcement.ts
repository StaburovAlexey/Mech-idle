import './menu-announcement.css';

type Destination = 'shop' | 'workshop';
type Announcement = { title: string; text: string; action: string; destination: Destination };

export const TEST_ANNOUNCEMENTS: readonly Announcement[] = [
 {title:'Новинка в магазине',text:'Модуль «Импульс»',action:'В магазин',destination:'shop'},
 {title:'Сообщение мастерской',text:'Проверь улучшения турели',action:'В мастерскую',destination:'workshop'},
];

const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12 4 7.5M12 12v9"/></svg>';

export class MenuAnnouncements {
 private index=0;
 private host?: HTMLElement;

 constructor(private readonly queue: readonly Announcement[]) {}

 mount(host: HTMLElement, open: (destination: Destination)=>void, canOpen: ()=>boolean, fallbackFocus: ()=>void) {
  this.host=host;
  const play=(card: HTMLElement,frames: Keyframe[],duration: number,done: ()=>void)=>{
   if(!card.animate||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){done();return;}
   const animation=card.animate(frames,{duration,easing:'cubic-bezier(.22,.72,.25,1)',fill:'both'});
   void animation.finished.then(()=>{animation.cancel();done();},()=>{});
   return animation;
  };
  const show=(from: 'right'|'bottom', returnFocus=false)=>{
   const item=this.queue[this.index];
   if(!item){host.replaceChildren();if(returnFocus)fallbackFocus();return;}
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
   action.disabled=!canOpen();
   const entering=play(card,[{transform:from==='right'?'translateX(102%)':'translateY(18px)',opacity:0},
    {transform:'none',opacity:1}],from==='right'?360:280,()=>{});
   let leaving=false;
   const dismiss=(navigate: boolean)=>{
    if(leaving||this.host!==host||(navigate&&!canOpen()))return;
    leaving=true;
    this.index++;
    card.inert=true;
    const { transform,opacity }=getComputedStyle(card);
    entering?.cancel();
    play(card,[{transform,opacity},{transform:'translateY(-18px)',opacity:0}],240,()=>{
     if(this.host!==host||!host.isConnected)return;
     if(navigate){open(item.destination);return;}
     show('bottom',true);
    });
   };
   action.onclick=()=>dismiss(true);
   close.onclick=()=>dismiss(false);
   if(returnFocus)close.focus({preventScroll:true});
  };
  show(this.index===0?'right':'bottom');
 }
}
