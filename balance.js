/**
 * Shango Tower Wars - Game Balance Data & Map Layout
 * 4-Point Waypoint System:
 * 1. Bottom-Right (Start / Spawn)
 * 2. Top-Right (Checkpoint 1)
 * 3. Top-Left (Checkpoint 2)
 * 4. Bottom-Left (Goal / Collection Base)
 */

const BALANCE = {
  MAP: {
    WIDTH: 70,  // Exact 70 cells (35 towers * 2)
    HEIGHT: 66, // Exact 66 cells (33 towers * 2)
    TOWER_CELLS: 2,
    CREEP_CELLS: 1,

    // Lanes layout
    LEFT_LANE_WIDTH: 26,    // 13 towers
    MIDDLE_WALL_WIDTH: 18,  // 9 towers
    RIGHT_LANE_WIDTH: 26,   // 13 towers

    TOP_SECTION_HEIGHT: 24, // 12 towers
    MIDDLE_WALL_HEIGHT: 42, // 21 towers

    // Central Wall
    MIDDLE_WALL: { x: 26, y: 24, w: 18, h: 42 },

    // 4 Key Zones (Clean Visuals, No Text)
    SPAWN_ZONE: { x: 57, y: 53, w: 13, h: 13 },   // Bottom-Right Start (6.5x6.5 towers)
    WAYPOINT_1: { x: 57, y: 0, w: 13, h: 13 },    // Top-Right Checkpoint 1
    WAYPOINT_2: { x: 0, y: 0, w: 11, h: 11 },     // Top-Left Checkpoint 2
    EXIT_ZONE: { x: 0, y: 55, w: 11, h: 11 },     // Bottom-Left Goal (5.5x5.5 towers)

    // Waypoint Coordinates
    WAYPOINT_COORDS: [
      { x: 63, y: 59 }, // 0: Spawn (Bottom-Right)
      { x: 63, y: 6 },  // 1: Checkpoint 1 (Top-Right)
      { x: 5, y: 5 },   // 2: Checkpoint 2 (Top-Left)
      { x: 5, y: 60 }   // 3: Goal Base (Bottom-Left)
    ],

    STARTING_GOLD: 100,
    STARTING_INCOME: 20,
    INCOME_INTERVAL_SEC: 15,
    STARTING_LIVES: 50,
  },

  ARMOR_TABLE: {
    0: 0,
    1: 6, 2: 11, 3: 15, 4: 19, 5: 23, 6: 26, 7: 30, 8: 32, 9: 35, 10: 38,
    11: 40, 12: 42, 13: 44, 16: 49, 17: 51, 18: 52, 20: 55, 25: 60,
    45: 73, 65: 80, 115: 87, 135: 89, 140: 90, 170: 91, 190: 92,
    230: 93, 250: 94, 280: 95, 300: 96
  },

  getArmorDamageReduction(armor) {
    if (armor <= 0) return 0;
    if (this.ARMOR_TABLE[armor] !== undefined) {
      return this.ARMOR_TABLE[armor] / 100;
    }
    const keys = Object.keys(this.ARMOR_TABLE).map(Number).sort((a, b) => a - b);
    if (armor > keys[keys.length - 1]) return 0.96;
    let prev = 0;
    for (const k of keys) {
      if (armor <= k) {
        const pct1 = this.ARMOR_TABLE[prev] || 0;
        const pct2 = this.ARMOR_TABLE[k];
        const t = (armor - prev) / (k - prev);
        return (pct1 + (pct2 - pct1) * t) / 100;
      }
      prev = k;
    }
    return 0.1;
  },

  // Towers hierarchy strictly from spreadsheet
  TOWERS: [
    {
      id: 'tower_base',
      name: 'Базовая вышка',
      cost: 10,
      damage: 10,
      range: 8.0,
      attackSpeed: 0.8,
      critChance: 0,
      critMultiplier: 1.0,
      color: '#38bdf8',
      type: 'direct',
      desc: 'Начальная вышка (Цена: 10, Урон: 10).',
      upgradeId: 'tower_lvl0',
      upgradeCost: 40
    },
    {
      id: 'tower_lvl0',
      name: 'Башня Т0 (Стрелковая)',
      cost: 50,
      damage: 40,
      range: 9.0,
      attackSpeed: 0.8,
      critChance: 0,
      critMultiplier: 1.0,
      color: '#0ea5e9',
      type: 'direct',
      desc: 'Башня 0 уровня (Цена: 50, Урон: 40).',
      upgradeId: 'tower_lvl1',
      upgradeCost: 150
    },
    {
      id: 'tower_lvl1',
      name: 'Башня Т1 (Улучшенная)',
      cost: 200,
      damage: 100,
      range: 10.0,
      attackSpeed: 0.75,
      critChance: 0,
      critMultiplier: 1.0,
      color: '#3b82f6',
      type: 'direct',
      desc: 'Башня 1 уровня (Цена: 200, Урон: 100).',
      upgradeId: 'tower_lvl2',
      upgradeCost: 300
    },
    {
      id: 'tower_lvl2',
      name: 'Башня Т2 (Критическая)',
      cost: 500,
      damage: 250,
      range: 11.0,
      attackSpeed: 0.7,
      critChance: 0.20,
      critMultiplier: 2.0,
      color: '#a855f7',
      type: 'direct',
      desc: 'Башня 2 уровня (Цена: 500, Урон: 250, 20% Crit x2).',
      upgradeId: 'tower_lvl3',
      upgradeCost: 500
    },
    {
      id: 'tower_lvl3',
      name: 'Башня Т3 (Мастерская)',
      cost: 1000,
      damage: 550,
      range: 12.0,
      attackSpeed: 0.65,
      critChance: 0.30,
      critMultiplier: 2.0,
      color: '#ec4899',
      type: 'direct',
      desc: 'Башня 3 уровня (Цена: 1000, Урон: 550, 30% Crit x2).',
      upgradeId: 'tower_lvl4',
      upgradeCost: 1500
    },
    {
      id: 'tower_lvl4',
      name: 'Башня Т4 (Эпическая)',
      cost: 2500,
      damage: 950,
      range: 13.0,
      attackSpeed: 0.6,
      critChance: 0.30,
      critMultiplier: 2.0,
      color: '#eab308',
      type: 'direct',
      desc: 'Башня 4 уровня (Цена: 2500, Урон: 950, 30% Crit x2).',
      upgradeId: null,
      upgradeCost: 0
    }
  ],

  TIER_UPGRADE_COSTS: [1200, 8000],

  CREEPS_BY_TIER: {
    1: [
      { index: 0, name: "Скаут", icon: "🐇", armor: 0, hp: 45, cost: 5, income: 1, speed: 4.4, initCd: 30, stackInterval: 10, bounty: 1 },
      { index: 1, name: "Гоблин", icon: "👺", armor: 1, hp: 130, cost: 10, income: 2, speed: 3.8, initCd: 30, stackInterval: 10, bounty: 2 },
      { index: 2, name: "Волк", icon: "🐺", armor: 1, hp: 250, cost: 20, income: 4, speed: 4.0, initCd: 30, stackInterval: 15, bounty: 4 },
      { index: 3, name: "Пехотинец", icon: "🧌", armor: 1, hp: 400, cost: 40, income: 6, speed: 3.2, initCd: 30, stackInterval: 15, bounty: 6 },
      { index: 4, name: "Панцирник", icon: "🐢", armor: 2, hp: 500, cost: 60, income: 8, speed: 2.6, initCd: 30, stackInterval: 15, bounty: 8 },
      { index: 5, name: "Огр", icon: "👹", armor: 2, hp: 650, cost: 80, income: 10, speed: 2.8, initCd: 30, stackInterval: 15, bounty: 10 },
      { index: 6, name: "Рыцарь", icon: "🛡️", armor: 3, hp: 780, cost: 100, income: 12, speed: 3.0, initCd: 30, stackInterval: 15, bounty: 12 },
      { index: 7, name: "Медведь", icon: "🐻", armor: 4, hp: 1200, cost: 120, income: 15, speed: 2.6, initCd: 30, stackInterval: 15, bounty: 15 },
      { index: 8, name: "Берсерк", icon: "⚡", armor: 5, hp: 1400, cost: 150, income: 20, speed: 3.4, initCd: 60, stackInterval: 20, bounty: 20 },
      { index: 9, name: "Горгулья", icon: "🦇", armor: 6, hp: 1500, cost: 180, income: 25, speed: 3.2, initCd: 60, stackInterval: 20, bounty: 25 },
      { index: 10, name: "Голем", icon: "🗿", armor: 8, hp: 2350, cost: 225, income: 30, speed: 2.2, initCd: 60, stackInterval: 20, bounty: 30 }
    ],
    2: [
      { index: 0, name: "Грифон", icon: "🦅", armor: 7, hp: 3000, cost: 350, income: 40, speed: 3.6, initCd: 0, stackInterval: 10, bounty: 40 },
      { index: 1, name: "Кодо", icon: "🦬", armor: 8, hp: 5000, cost: 500, income: 50, speed: 3.0, initCd: 0, stackInterval: 10, bounty: 50 },
      { index: 2, name: "Василиск", icon: "🦎", armor: 9, hp: 7500, cost: 700, income: 75, speed: 3.0, initCd: 0, stackInterval: 15, bounty: 75 },
      { index: 3, name: "Скорпион", icon: "🦂", armor: 10, hp: 8000, cost: 1000, income: 100, speed: 2.8, initCd: 0, stackInterval: 15, bounty: 100 },
      { index: 4, name: "Пантера", icon: "🐆", armor: 11, hp: 12000, cost: 1200, income: 125, speed: 3.4, initCd: 0, stackInterval: 15, bounty: 125 },
      { index: 5, name: "Вепрь", icon: "🐗", armor: 12, hp: 18000, cost: 1500, income: 150, speed: 2.6, initCd: 0, stackInterval: 15, bounty: 150 },
      { index: 6, name: "Мамонт", icon: "🐘", armor: 13, hp: 30000, cost: 2000, income: 200, speed: 2.4, initCd: 0, stackInterval: 15, bounty: 200 },
      { index: 7, name: "Виверна", icon: "🐉", armor: 17, hp: 35000, cost: 2500, income: 250, speed: 2.8, initCd: 0, stackInterval: 15, bounty: 250 },
      { index: 8, name: "Ти-Рекс", icon: "🦖", armor: 18, hp: 60000, cost: 5000, income: 350, speed: 2.4, initCd: 0, stackInterval: 20, bounty: 350 },
      { index: 9, name: "Инфернал", icon: "🌋", armor: 20, hp: 65000, cost: 5500, income: 450, speed: 2.2, initCd: 0, stackInterval: 20, bounty: 450 },
      { index: 10, name: "Генерал", icon: "⚔️", armor: 25, hp: 75000, cost: 6500, income: 600, speed: 2.0, initCd: 0, stackInterval: 20, bounty: 600 }
    ],
    3: [
      { index: 0, name: "Феникс", icon: "🔥", armor: 45, hp: 75000, cost: 8000, income: 675, speed: 3.2, initCd: 0, stackInterval: 10, bounty: 675 },
      { index: 1, name: "Элементаль", icon: "🌀", armor: 65, hp: 75000, cost: 10000, income: 750, speed: 3.0, initCd: 0, stackInterval: 10, bounty: 750 },
      { index: 2, name: "Войд Лорд", icon: "🌌", armor: 115, hp: 100000, cost: 16000, income: 1250, speed: 2.8, initCd: 0, stackInterval: 15, bounty: 1250 },
      { index: 3, name: "Король Лич", icon: "👑", armor: 135, hp: 125000, cost: 18000, income: 1500, speed: 2.6, initCd: 0, stackInterval: 15, bounty: 1500 },
      { index: 4, name: "Дракон", icon: "🐲", armor: 140, hp: 150000, cost: 25000, income: 1800, speed: 2.8, initCd: 0, stackInterval: 15, bounty: 1800 },
      { index: 5, name: "Титан Грома", icon: "⚡", armor: 170, hp: 175000, cost: 30000, income: 2000, speed: 2.4, initCd: 0, stackInterval: 15, bounty: 2000 },
      { index: 6, name: "Жнец Душ", icon: "💀", armor: 190, hp: 180000, cost: 38000, income: -100, speed: 2.4, initCd: 0, stackInterval: 15, bounty: 2500 },
      { index: 7, name: "Демон Хаоса", icon: "👿", armor: 230, hp: 185000, cost: 45000, income: -200, speed: 2.2, initCd: 0, stackInterval: 15, bounty: 3000 },
      { index: 8, name: "Бегемот", icon: "☄️", armor: 250, hp: 200000, cost: 50000, income: -300, speed: 2.0, initCd: 0, stackInterval: 20, bounty: 3500 },
      { index: 9, name: "Левиафан", icon: "🪐", armor: 280, hp: 230000, cost: 60000, income: -500, speed: 1.8, initCd: 0, stackInterval: 20, bounty: 4500 },
      { index: 10, name: "Апокалипсис", icon: "☠️", armor: 300, hp: 250000, cost: 100000, income: -1000, speed: 1.7, initCd: 0, stackInterval: 20, bounty: 8000 }
    ]
  }
};
