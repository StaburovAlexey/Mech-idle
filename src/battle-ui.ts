import type { PauseManager } from './persistence';

/** Owns only the battle drawer pause. Never removes user/hidden/dialog pauses. */
export class BattleMenuController {
 open=false;
 constructor(private readonly pause:PauseManager){}
 show(){this.open=true;this.pause.add('battleMenu');}
 close(){this.open=false;this.pause.remove('battleMenu');}
 toggle(){this.open?this.close():this.show();}
}

export const battleHudMarkup = `<div class="battle-resources" aria-label="Ресурсы и состояние турели">
 <div class="battle-resource wave"><span>Волна</span><strong id="battle-wave">1 / 30</strong></div>
 <div class="battle-resource health"><span>Корпус</span><strong id="battle-hp">100 / 100</strong><div class="health-track"><div class="health-fill" id="battle-hp-fill"></div></div></div>
 <div class="battle-resource gold"><span>◈ Золото</span><strong id="battle-gold">0</strong></div>
 <div class="battle-resource crystals"><span>◇ Кристаллы</span><strong id="battle-crystals">0</strong></div>
</div><button class="battle-menu-toggle" id="battle-menu-toggle" aria-label="Открыть меню боя" aria-haspopup="dialog" aria-expanded="false" aria-controls="battle-menu-overlay"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Меню</span></button>`;

export const battleMenuMarkup = `<section class="battle-menu-panel" role="dialog" aria-modal="true" aria-labelledby="battle-menu-title" tabindex="-1">
 <div class="battle-menu-head"><div><div class="eyebrow">Управление оплотом</div><h2 id="battle-menu-title">Меню боя</h2></div><button class="battle-menu-close" id="battle-menu-close" aria-label="Закрыть меню боя">×</button></div>
 <p class="battle-menu-status" id="battle-menu-status">Бой остановлен, пока открыто меню</p>
 <div class="menu-grid"><div><span>Урон</span><strong id="menu-damage"></strong></div><div><span>Темп</span><strong id="menu-speed"></strong></div><div><span>Ремонт</span><strong id="menu-regen"></strong></div><div><span>Пройдено</span><strong id="menu-progress"></strong></div></div>
 <div class="menu-actions"><button class="main-button" id="battle-menu-return">Вернуться в бой</button><button class="main-button secondary" id="battle-menu-pause">Оставить на паузе</button><button class="small-button" id="battle-menu-sound">Звук: выключен</button><button class="small-button" id="battle-menu-help">Как играть</button><button class="small-button" id="battle-menu-save">В главное меню · сохранить</button><button class="small-button danger" id="battle-menu-abandon">Завершить забег</button></div>
 <p class="hint">Модули за золото действуют сразу. HP между волнами не заполняются. Мастерская доступна после завершения забега.</p>
</section>`;

export function isInteractiveTarget(target:EventTarget|null):boolean {
 return target instanceof HTMLElement && !!target.closest('button,input,select,textarea,a,[contenteditable]');
}
