/** A neutral-centred displacement field: stronger at the corners, zero near the centre. */
export function bindCrtScreen(stage: HTMLElement) {
 const field=document.createElement('canvas');
 const ctx=field.getContext('2d');
 if(!ctx)return ()=>{};
 const ns='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(ns,'svg');
 svg.setAttribute('aria-hidden','true');svg.classList.add('crt-filter-definition');
 const filter=document.createElementNS(ns,'filter');filter.id='oplot-crt-curve';
 for(const [key,value] of Object.entries({x:'0%',y:'0%',width:'100%',height:'100%','color-interpolation-filters':'sRGB'}))
  filter.setAttribute(key,value);
 const map=document.createElementNS(ns,'feImage');
 map.setAttribute('preserveAspectRatio','none');map.setAttribute('result','curve');
 const warp=document.createElementNS(ns,'feDisplacementMap');
 for(const [key,value] of Object.entries({in:'SourceGraphic',in2:'curve',xChannelSelector:'R',yChannelSelector:'G'}))
  warp.setAttribute(key,value);
 filter.append(map,warp);svg.append(filter);stage.before(svg);
 const size=()=>{
  const w=stage.clientWidth,h=stage.clientHeight;
  if(!w||!h||(w===field.width&&h===field.height&&map.hasAttribute('href')))return;
  field.width=w;field.height=h;
  const scale=Math.min(16,w*.038),pixels=ctx.createImageData(w,h);
  // Extend the edge texels virtually: retain the curve inside the window but
  // clamp any sample that would have reached transparent pixels outside it.
  const channel=(point:number,offset:number,size:number)=>
   Math.round(255*(.5+(Math.max(.75,Math.min(size-.75,point+offset))-point)/scale));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const u=2*(x+.5)/w-1,v=2*(y+.5)/h-1,i=(y*w+x)*4;
   pixels.data[i]=channel(x+.5,.49*scale*u*(.18+.82*v*v),w);
   pixels.data[i+1]=channel(y+.5,.49*scale*v*(.18+.82*u*u),h);
   pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  map.setAttribute('width',String(w));map.setAttribute('height',String(h));
  map.setAttribute('href',field.toDataURL());
  warp.setAttribute('scale',String(scale));
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
