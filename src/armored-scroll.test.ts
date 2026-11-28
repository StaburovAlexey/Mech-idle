// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { armoredScrollMarkup, bindArmoredScrollbars } from './armored-scroll';

it('synchronizes the decorative rail only when the native panel overflows', () => {
 const disconnect=vi.fn();
 vi.stubGlobal('ResizeObserver',class { observe() {} disconnect=disconnect; });
 document.body.innerHTML=armoredScrollMarkup('<div role="tabpanel"><button>Card</button></div>');
 try {
  const panel=document.querySelector<HTMLElement>('[role="tabpanel"]')!;
  const rail=document.querySelector<HTMLElement>('.armored-scroll-rail')!;
  const thumb=rail.firstElementChild as HTMLElement;
  let contentHeight=240;
  Object.defineProperty(panel,'scrollHeight',{get:()=>contentHeight});
  Object.defineProperty(panel,'clientHeight',{value:240});
  Object.defineProperty(rail,'clientTop',{value:1});
  vi.spyOn(rail,'getBoundingClientRect').mockReturnValue({height:238} as DOMRect);
  const scrollbar=bindArmoredScrollbars(document.body);
  scrollbar.refresh();expect(rail.hidden).toBe(true);
  contentHeight=480;
  scrollbar.refresh();expect(rail.hidden).toBe(false);expect(thumb.style.height).toBe('118px');
  expect(thumb.style.transform).toBe('translateY(0px)');
  panel.scrollTop=120;panel.dispatchEvent(new Event('scroll'));
  expect(thumb.style.transform).toBe('translateY(59px)');
  panel.scrollTop=239.5;panel.dispatchEvent(new Event('scroll'));
  expect(thumb.style.transform).toBe('translateY(118px)');
  contentHeight=240;
  scrollbar.refresh();expect(rail.hidden).toBe(true);
  scrollbar.dispose();expect(disconnect).toHaveBeenCalledOnce();
 } finally { vi.unstubAllGlobals();document.body.replaceChildren(); }
});
