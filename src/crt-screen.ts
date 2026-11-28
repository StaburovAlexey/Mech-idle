/** A neutral-centred displacement field: stronger at the corners, zero near the centre. */
export function bindCrtScreen(stage: HTMLElement) {
 const field=document.createElement('canvas');
 field.width=field.height=96;
 const ctx=field.getContext('2d');
 if(!ctx)return ()=>{};
 const pixels=ctx.createImageData(field.width,field.height);
 for(let y=0;y<field.height;y++)for(let x=0;x<field.width;x++){
  const u=2*x/(field.width-1)-1,v=2*y/(field.height-1)-1,i=(y*field.width+x)*4;
  pixels.data[i]=128+125*u*(.18+.82*v*v);
  pixels.data[i+1]=128+125*v*(.18+.82*u*u);
  pixels.data[i+3]=255;
 }
 ctx.putImageData(pixels,0,0);
 const ns='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(ns,'svg');
 svg.setAttribute('aria-hidden','true');svg.classList.add('crt-filter-definition');
 const filter=document.createElementNS(ns,'filter');filter.id='oplot-crt-curve';
 for(const [key,value] of Object.entries({x:'0%',y:'0%',width:'100%',height:'100%','color-interpolation-filters':'sRGB'}))
  filter.setAttribute(key,value);
 const map=document.createElementNS(ns,'feImage');
 map.setAttribute('href',field.toDataURL());map.setAttribute('preserveAspectRatio','none');map.setAttribute('result','curve');
 const warp=document.createElementNS(ns,'feDisplacementMap');
 for(const [key,value] of Object.entries({in:'SourceGraphic',in2:'curve',xChannelSelector:'R',yChannelSelector:'G'}))
  warp.setAttribute(key,value);
 filter.append(map,warp);svg.append(filter);stage.before(svg);
 const size=()=>{
  const w=stage.clientWidth,h=stage.clientHeight;
  map.setAttribute('width',String(w));map.setAttribute('height',String(h));
  // Keep the visual offset small relative to a 44px touch target.
  warp.setAttribute('scale',String(Math.min(16,w*.038)));
 };
 let observer:ResizeObserver|undefined;
 return (enabled:boolean)=>{
  if(enabled){
   size();
   if(!observer&&typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(size);observer.observe(stage);}
  }else{observer?.disconnect();observer=undefined;}
  stage.classList.toggle('crt-active',enabled);
 };
}
