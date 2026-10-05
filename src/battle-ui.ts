import type { PauseManager } from './persistence';
import {STAT_KEYS,type StatKey} from './game';

export const STAT_LABELS:Record<StatKey,{title:string,icon:string,unit:string}>={damage:{title:'Сила атаки',icon:'↗',unit:'урона'},maxHp:{title:'Бронекорпус',icon:'⬡',unit:'HP'},attackSpeed:{title:'Темп стрельбы',icon:'⌁',unit:'/с'},regen:{title:'Ремонт',icon:'✚',unit:'HP/с'}};
export const SHORT_STAT_LABELS:Record<StatKey,string>={damage:'Атака',maxHp:'Корпус',attackSpeed:'Темп',regen:'Ремонт'};
export function upgradeButtonsMarkup(){return STAT_KEYS.map(stat=>`<button class="upgrade" aria-label="${STAT_LABELS[stat].title}" data-stat="${stat}" id="upgrade-${stat}"><div class="upgrade-top"><span class="upgrade-title"><span class="stat-icon" aria-hidden="true">${STAT_LABELS[stat].icon}</span><span class="stat-label-full">${STAT_LABELS[stat].title}</span><span class="stat-label-short" aria-hidden="true">${SHORT_STAT_LABELS[stat]}</span></span><span class="upgrade-level"></span></div><div class="upgrade-data"><span class="upgrade-value"></span><span class="upgrade-price"></span></div><div class="upgrade-sub"></div></button>`).join('');}
export const bossBarMarkup=`<div id="boss" class="boss-bar hidden"><b>КОЛОСС / ТЯЖЁЛЫЙ МЕХ</b><div class="boss-track"><div class="boss-fill" id="boss-fill"></div></div></div>`;

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
 <div class="battle-resource crystals"><span aria-label="Кристаллы">◇ Крист.</span><strong id="battle-crystals">0</strong></div>
</div><button class="battle-menu-toggle" id="battle-menu-toggle" aria-label="Открыть меню боя" aria-haspopup="dialog" aria-expanded="false" aria-controls="battle-menu-overlay"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Меню</span></button><div id="battle-notice" class="battle-notice hidden" role="status"></div>`;

export const battleMenuMarkup = `<section class="battle-menu-panel" role="dialog" aria-modal="true" aria-labelledby="battle-menu-title" tabindex="-1">
 <div class="battle-menu-head"><h2 id="battle-menu-title">Меню боя</h2><div class="eyebrow">Управление оплотом</div><button class="battle-menu-close" id="battle-menu-close" aria-label="Закрыть меню боя"><span class="kenney-close-icon" aria-hidden="true"></span></button></div>
 <p class="battle-menu-status" id="battle-menu-status">Бой остановлен, пока открыто меню</p>
 <div class="menu-grid"><div><span>Урон</span><strong id="menu-damage"></strong></div><div><span>Темп</span><strong id="menu-speed"></strong></div><div><span>Ремонт</span><strong id="menu-regen"></strong></div><div><span>Пройдено</span><strong id="menu-progress"></strong></div></div>
 <div class="menu-actions"><button class="main-button" id="battle-menu-return">Вернуться в бой</button><button class="main-button secondary" id="battle-menu-pause">Оставить на паузе</button><button class="small-button" id="battle-menu-sound">Звук: выключен</button><button class="small-button" id="battle-menu-help">Как играть</button><button class="small-button" id="battle-menu-save" aria-label="Сохранить забег и открыть главное меню" title="Сохранить забег и открыть главное меню">Сохранить и выйти</button><button class="small-button danger" id="battle-menu-abandon">Завершить забег</button></div>
</section>`;

export function isInteractiveTarget(target:EventTarget|null):boolean {
 return target instanceof HTMLElement && !!target.closest('button,input,select,textarea,a,[contenteditable]');
}
