import './armored-scroll.css';

export function armoredScrollMarkup(panel: string) {
 return `<div class="armored-scroll-area">${panel}<div class="armored-scroll-rail" aria-hidden="true" hidden><span class="armored-scroll-thumb"></span></div></div>`;
}

/** Decorates native scroll panels; wheel, touch swipes and keyboard still use the real scroll area. */
export function bindArmoredScrollbars(root: HTMLElement) {
 if (typeof ResizeObserver === 'undefined') return { dispose:()=>{}, refresh:()=>{} };
 const refreshers: Array<()=>void> = [];
 const updates=new Map<Element,()=>void>();
 const observer=new ResizeObserver(entries=>{
  const changed=new Set(entries.map(({target})=>updates.get(target)));
  for(const update of changed)update?.();
 });
 for(const area of root.querySelectorAll<HTMLElement>('.armored-scroll-area')){
  const panel=area.querySelector<HTMLElement>('[role="tabpanel"]')!;
  const rail=area.querySelector<HTMLElement>('.armored-scroll-rail')!;
  const thumb=rail.querySelector<HTMLElement>('.armored-scroll-thumb')!;
  area.classList.add('enhanced');
  let travel=0, maxScroll=0, grab=0;
  function sync(){
   // The native scroll offset can be fractional even when the scroll dimensions are rounded.
   const offset=Math.max(0,panel.scrollTop);
   const progress=!maxScroll?0:maxScroll-offset<1?1:offset/maxScroll;
   thumb.style.transform=`translateY(${travel*progress}px)`;
  }
  function refresh(){
   const scrollTop=panel.scrollTop;
   // Measure without the slot; the gutter itself must never cause overflow.
   rail.hidden=true;
   if(!panel.clientHeight||panel.scrollHeight<=panel.clientHeight+1)return;
   rail.hidden=false;
   maxScroll=panel.scrollHeight-panel.clientHeight;
   const trackHeight=Math.max(0,rail.getBoundingClientRect().height - 2 * rail.clientTop);
   const thumbHeight=Math.min(trackHeight,Math.max(24,trackHeight*panel.clientHeight/panel.scrollHeight));
   travel=trackHeight-thumbHeight;
   thumb.style.height=`${thumbHeight}px`;
   panel.scrollTop=scrollTop;
   sync();
  }
  function move(e: PointerEvent){
   if(!travel)return;
   const y=e.clientY-rail.getBoundingClientRect().top-rail.clientTop-grab;
   panel.scrollTop=Math.max(0,Math.min(1,y/travel))*maxScroll;
   sync();
  }
  rail.onpointerdown=e=>{
   if(e.button!==0||!travel)return;
   e.preventDefault();
   grab=e.target===thumb?e.clientY-thumb.getBoundingClientRect().top:thumb.offsetHeight/2;
   rail.setPointerCapture(e.pointerId);
   move(e);
  };
  rail.onpointermove=e=>{ if(rail.hasPointerCapture(e.pointerId))move(e); };
  panel.addEventListener('scroll',sync,{passive:true});
  for(const node of [area,...panel.children]){
   updates.set(node,refresh);
   observer.observe(node);
  }
  refreshers.push(refresh);
 }
 return {dispose:()=>observer.disconnect(),refresh:()=>refreshers.forEach(update=>update())};
}
