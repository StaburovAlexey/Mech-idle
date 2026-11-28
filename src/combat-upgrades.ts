import { lootChance, pickupQuantityOdds } from './pickup';
export const COMBAT_UPGRADES = {
  critical: { title: 'Крит', category: 'attack', icon: 'damage', price: 26, description: 'Шанс нанести двойной урон' },
  pierce: { title: 'Пробитие', category: 'attack', icon: 'damage', price: 30, description: 'Часть урона второму меху прямо за целью' },
  splash: { title: 'Осколки', category: 'attack', icon: 'damage', price: 34, description: 'Часть урона мехам в радиусе 1,4 от цели' },
  deflect: { title: 'Отражатель', category: 'defense', icon: 'maxHp', price: 32, description: 'Гасит один вражеский снаряд; затем перезаряжается' },
  dampen: { title: 'Амортизатор', category: 'defense', icon: 'maxHp', price: 28, description: 'После первого удара снижает урон следующих ударов ближнего боя на 1,2 с' },
  emergency: { title: 'Авар. ремонт', category: 'repair', icon: 'regen', price: 36, description: 'Восстанавливает корпус ниже 25% здоровья, один раз за волну' },
  salvage: { title: 'Разбор мехов', category: 'repair', icon: 'regen', price: 25, description: 'Восстанавливает корпус за каждые пять уничтоженных после покупки мехов' },
  scanner: { title: 'Сканер', category: 'modules', icon: 'damage', price: 30, description: 'При выборе новой цели отдаёт приоритет стрелкам в радиусе огня' },
  lootDetector: { title: 'Детектор', category: 'modules', icon: 'damage', price: 0, description: 'Увеличивает шанс выпадения деталей и обломков' },
  lootExtractor: { title: 'Экстрактор', category: 'modules', icon: 'regen', price: 0, description: 'Увеличивает шанс получить больше единиц выпавшего ресурса' },
  hullArmor: { title: 'Броня', category: 'modules', icon: 'maxHp', price: 0, description: 'Снижает урон от ударов ближнего боя' },
  boltScreen: { title: 'Экран', category: 'modules', icon: 'maxHp', price: 0, description: 'Снижает урон от вражеских снарядов, которые попали в турель' },
  fastTracker: { title: 'Трекер', category: 'modules', icon: 'damage', price: 0, description: 'Усиливает прямые попадания по быстрым мехам' },
  finisher: { title: 'Добивание', category: 'modules', icon: 'damage', price: 0, description: 'Усиливает прямые попадания по врагам с половиной здоровья или меньше' },
  waveRegen: { title: 'Регенератор', category: 'modules', icon: 'regen', price: 0, description: 'Восстанавливает часть корпуса в конце отдыха между волнами' },
  pulse: { title: 'Импульс', category: 'modules', icon: 'attackSpeed', price: 38, description: 'Замедляет движение мехов на 40% на 1 с в радиусе 4' },
} as const;
export type CombatUpgrade = keyof typeof COMBAT_UPGRADES;
export type CombatUpgradeLevels = Partial<Record<CombatUpgrade, number>>;
const SCRAP_MODULE_COSTS = {
  lootDetector:[5,6,4], lootExtractor:[7,9,6],
  hullArmor:[6,6,4], boltScreen:[7,7,5], fastTracker:[6,6,4], finisher:[8,9,6], waveRegen:[9,10,7],
} as const;
type ScrapModule = keyof typeof SCRAP_MODULE_COSTS;
export const SHOP_MODULES = ['scanner','pulse','deflect',...Object.keys(SCRAP_MODULE_COSTS) as ScrapModule[]] as const;
export type ShopModule = typeof SHOP_MODULES[number];
export const isShopModule = (key: CombatUpgrade): key is ShopModule => (SHOP_MODULES as readonly CombatUpgrade[]).includes(key);
export const isScrapModule = (key:CombatUpgrade): key is ScrapModule => Object.hasOwn(SCRAP_MODULE_COSTS,key);
export const WORKSHOP_KEYS = Object.keys(COMBAT_UPGRADES) as CombatUpgrade[];
export const COMBAT_KEYS = WORKSHOP_KEYS.filter(key => !isScrapModule(key));
export type ModuleCost = {parts:number;scrap:number};
export function moduleCost(key:CombatUpgrade, level:number): ModuleCost {
  if (isScrapModule(key)) {
    const [unlock,parts,scrap] = SCRAP_MODULE_COSTS[key];
    if (!level) return {parts:0,scrap:unlock};
    const scale=1.5**(level-1);
    return {parts:Math.ceil(parts*scale),scrap:Math.ceil(scrap*scale)};
  }
  return {parts:workshopCombatPrice(key,level),scrap:0};
}

export interface CombatEnhancements {
  levels: CombatUpgradeLevels;
  deflectReady: number;
  dampenUntil: number;
  emergencyWave: number;
  salvageKills: number;
  pulseReady: number;
  pulseUntil: number;
}

export const createEnhancements = (): CombatEnhancements => ({
  levels: {}, deflectReady: 0, dampenUntil: 0, emergencyWave: 0, salvageKills: 0, pulseReady: 0, pulseUntil: 0,
});

export function combatUpgradePrice(key: CombatUpgrade, level: number): number {
  return key === 'scanner' && level > 0 ? Infinity : Math.ceil(COMBAT_UPGRADES[key].price * 1.35 ** level);
}
export function workshopCombatPrice(key: CombatUpgrade, level: number): number {
  return key === 'scanner' && level > 0 ? Infinity : Math.ceil(Math.ceil(COMBAT_UPGRADES[key].price / 5) * 1.5 ** level);
}

/** Bounded effects keep values predictable without a generic upgrade-level cap. */
export function combatEffect(key: CombatUpgrade, level: number): number {
  if (!level) return 0;
  const growth = (level - 1) / (level + 3);
  switch (key) {
    case 'critical': return .10 + .30 * growth;
    case 'pierce': return .35 + .45 * growth;
    case 'splash': return .18 + .32 * growth;
    case 'deflect': return 8 - 5 * growth;
    case 'dampen': return .20 + .45 * growth;
    case 'emergency': return .12 + .20 * growth;
    case 'salvage': return level * 2;
    case 'scanner': return 1;
    case 'pulse': return 10 - 6 * growth;
    case 'hullArmor': return .08 + .12 * growth;
    case 'boltScreen': return .10 + .15 * growth;
    case 'fastTracker': return .12 + .18 * growth;
    case 'finisher': return .15 + .20 * growth;
    case 'waveRegen': return .04 + .08 * growth;
    case 'lootDetector': case 'lootExtractor': return 0;
  }
}

const seconds = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
export function combatValueLabel(key: CombatUpgrade, level: number): string {
  if (key === 'scanner') return level ? 'Включён' : 'Выкл.';
  if (key === 'lootDetector') return seconds.format(lootChance(level)*100)+'%';
  if (key === 'lootExtractor') return pickupQuantityOdds(level).map(n=>seconds.format(n)+'%').join(' / ');
  const value = combatEffect(key, level);
  if (key === 'deflect' || key === 'pulse') return level ? `${seconds.format(value)} с` : 'Выкл.';
  if (key === 'salvage') return `+${value} HP`;
  return `${Math.round(value*100)}%`;
}
