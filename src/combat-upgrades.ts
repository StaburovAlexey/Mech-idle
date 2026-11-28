export const COMBAT_UPGRADES = {
  critical: { title: 'Крит', category: 'attack', icon: 'damage', price: 26, description: 'Шанс нанести двойной урон' },
  pierce: { title: 'Пробитие', category: 'attack', icon: 'damage', price: 30, description: 'Часть урона второму меху прямо за целью' },
  splash: { title: 'Осколки', category: 'attack', icon: 'damage', price: 34, description: 'Часть урона мехам в радиусе 1,4 от цели' },
  deflect: { title: 'Отражатель', category: 'defense', icon: 'maxHp', price: 32, description: 'Гасит один вражеский снаряд; затем перезаряжается' },
  dampen: { title: 'Амортизатор', category: 'defense', icon: 'maxHp', price: 28, description: 'После первого удара снижает урон следующих ударов ближнего боя на 1,2 с' },
  emergency: { title: 'Авар. ремонт', category: 'repair', icon: 'regen', price: 36, description: 'Восстанавливает корпус ниже 25% здоровья, один раз за волну' },
  salvage: { title: 'Разбор мехов', category: 'repair', icon: 'regen', price: 25, description: 'Восстанавливает корпус за каждые пять уничтоженных после покупки мехов' },
  scanner: { title: 'Сканер', category: 'modules', icon: 'damage', price: 30, description: 'При выборе новой цели отдаёт приоритет стрелкам в радиусе огня' },
  pulse: { title: 'Импульс', category: 'modules', icon: 'attackSpeed', price: 38, description: 'Замедляет движение мехов на 40% на 1 с в радиусе 4' },
} as const;
export type CombatUpgrade = keyof typeof COMBAT_UPGRADES;
export type CombatUpgradeLevels = Partial<Record<CombatUpgrade, number>>;
export const COMBAT_KEYS = Object.keys(COMBAT_UPGRADES) as CombatUpgrade[];

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
  }
}

const seconds = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
export function combatValueLabel(key: CombatUpgrade, level: number): string {
  if (key === 'scanner') return level ? 'Включён' : 'Выкл.';
  const value = combatEffect(key, level);
  if (key === 'deflect' || key === 'pulse') return level ? `${seconds.format(value)} с` : 'Выкл.';
  if (key === 'salvage') return `+${value} HP`;
  return `${Math.round(value*100)}%`;
}
