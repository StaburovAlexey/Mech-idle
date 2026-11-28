import './steel-plate.css';

const bolt=`<svg class="steel-plate-bolt" viewBox="-7 -7 14 14" aria-hidden="true"><use href="${import.meta.env.BASE_URL}assets/ui/shared/armored-frame.svg#screw"/></svg>`;

export function steelPlate(tag:'h1'|'div'|'article',className:string,content:string,attributes='') {
 return `<${tag} class="steel-plate ${className}"${attributes?' '+attributes:''}>${bolt}${content}${bolt}</${tag}>`;
}
