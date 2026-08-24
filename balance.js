/**
 * Shango Tower Wars - Game Balance Data & Map Layout
 * 4-Point Waypoint System:
 * 1. Bottom-Right (Start / Spawn)
 * 2. Top-Right (Checkpoint 1)
 * 3. Top-Left (Checkpoint 2)
 * 4. Bottom-Left (Goal / Collection Base)
 */

const BALANCE = {
  // Global Map Settings & Constants
  MAP_CONFIG: {
    WIDTH: 70,  // Exact 70 cells (35 towers * 2)
    HEIGHT: 66, // Exact 66 cells (33 towers * 2)
    CELL_SIZE: 12,
    TOWER_CELLS: 2,
    CREEP_CELLS: 1,
    STARTING_GOLD: 100,
    STARTING_INCOME: 20,
    INCOME_INTERVAL_SEC: 15,
    STARTING_LIVES: 50,
  },

  // 4 Competitive Map Layouts
  MAPS: [
    {
      id: 'classic',
      name: '🏰 Классика (U-Подковы)',
      icon: '🏰',
      badge: 'П-образный обход',
      tagColor: '#38bdf8',
      desc: 'Подъем по правому коридору, переход поверху и спуск на базу слева вокруг центральной скалы.',
      walls: [
        { x: 26, y: 24, w: 18, h: 42 }
      ],
      zones: [
        { id: 'spawn', name: 'СПАВН', type: 'spawn', icon: '🚀', x: 59, y: 55, w: 11, h: 11, color: 'rgba(56, 189, 248, 0.25)', borderColor: '#38bdf8' },
        { id: 'wp1', name: 'ТОЧКА 1', type: 'waypoint', icon: '1️⃣', x: 59, y: 0, w: 11, h: 11, color: 'rgba(234, 179, 8, 0.2)', borderColor: '#eab308' },
        { id: 'wp2', name: 'ТОЧКА 2', type: 'waypoint', icon: '2️⃣', x: 0, y: 0, w: 11, h: 11, color: 'rgba(234, 179, 8, 0.2)', borderColor: '#eab308' },
        { id: 'base', name: 'БАЗА', type: 'base', icon: '🏰', x: 0, y: 55, w: 11, h: 11, color: 'rgba(239, 68, 68, 0.25)', borderColor: '#ef4444' }
      ],
      waypointCoords: [
        { x: 69, y: 65 }, // 0: Spawn
        { x: 69, y: 0 },  // 1: WP1
        { x: 0, y: 0 },   // 2: WP2
        { x: 0, y: 65 }   // 3: Base
      ]
    },
    {
      id: 'zigzag',
      name: '⚡ Зигзаг (S-Лабиринт)',
      icon: '⚡',
      badge: '3 вертикали / S-Путь',
      tagColor: '#a855f7',
      desc: 'Две противоположные скалы делят карту на 3 глубоких коридора. Максимальная длина пути.',
      walls: [
        { x: 20, y: 16, w: 8, h: 50 }, // Стена 1 (снизу до y:16, открыт проход сверху y:0..15)
        { x: 44, y: 0, w: 8, h: 50 }   // Стена 2 (сверху до y:49, открыт проход снизу y:50..65)
      ],
      zones: [
        { id: 'spawn', name: 'СПАВН', type: 'spawn', icon: '🚀', x: 0, y: 55, w: 11, h: 11, color: 'rgba(56, 189, 248, 0.25)', borderColor: '#38bdf8' },
        { id: 'wp1', name: 'ТОЧКА 1', type: 'waypoint', icon: '1️⃣', x: 0, y: 0, w: 11, h: 11, color: 'rgba(234, 179, 8, 0.2)', borderColor: '#eab308' },
        { id: 'wp2', name: 'ТОЧКА 2', type: 'waypoint', icon: '2️⃣', x: 30, y: 55, w: 12, h: 11, color: 'rgba(234, 179, 8, 0.2)', borderColor: '#eab308' },
        { id: 'wp3', name: 'ТОЧКА 3', type: 'waypoint', icon: '3️⃣', x: 59, y: 0, w: 11, h: 11, color: 'rgba(234, 179, 8, 0.2)', borderColor: '#eab308' },
        { id: 'base', name: 'БАЗА', type: 'base', icon: '🏰', x: 59, y: 55, w: 11, h: 11, color: 'rgba(239, 68, 68, 0.25)', borderColor: '#ef4444' }
      ],
      waypointCoords: [
        { x: 5, y: 60 },
        { x: 5, y: 5 },
        { x: 36, y: 60 },
        { x: 64, y: 5 },
        { x: 64, y: 60 }
      ]
    },
    {
      id: 'spiral',
      name: '🌀 Спираль (Цитадель)',
      icon: '🌀',
      badge: 'База в центре',
      tagColor: '#06b6d4',
      desc: 'База в самом центре карты! Крипы огибают внешнее кольцо перед заходом в центральную цитадель.',
      walls: [
        { x: 16, y: 16, w: 38, h: 6 },
        { x: 48, y: 22, w: 6, h: 28 },
        { x: 20, y: 44, w: 34, h: 6 },
        { x: 16, y: 22, w: 6, h: 16 }
      ],
      zones: [
        { id: 'spawn', name: 'СПАВН', type: 'spawn', icon: '🚀', x: 0, y: 0, w: 11, h: 11, color: 'rgba(56, 189, 248, 0.25)', borderColor: '#38bdf8' },
        { id: 'wp1', name: 'ТОЧКА 1', type: 'waypoint', icon: '1️⃣', x: 59, y: 0, w: 11, h: 11, color: 'rgba(234, 179, 8, 0.2)', borderColor: '#eab308' },
        { id: 'wp2', name: 'ТОЧКА 2', type: 'waypoint', icon: '2️⃣', x: 59, y: 55, w: 11, h: 11, color: 'rgba(234, 179, 8, 0.2)', borderColor: '#eab308' },
        { id: 'wp3', name: 'ТОЧКА 3', type: 'waypoint', icon: '3️⃣', x: 0, y: 55, w: 11, h: 11, color: 'rgba(234, 179, 8, 0.2)', borderColor: '#eab308' },
        { id: 'base', name: 'ЦИТАДЕЛЬ', type: 'base', icon: '🏰', x: 28, y: 26, w: 14, h: 14, color: 'rgba(239, 68, 68, 0.25)', borderColor: '#ef4444' }
      ],
      waypointCoords: [
        { x: 5, y: 5 },
        { x: 64, y: 5 },
        { x: 64, y: 60 },
        { x: 5, y: 60 },
        { x: 35, y: 33 }
      ]
    },
    {
      id: 'crossing',
      name: '⚔️ Перекресток (Kill Zone)',
      icon: '⚔️',
      badge: 'Двойной перекресток',
      tagColor: '#10b981',
      desc: '2 острова-скалы формируют узкий перекресток в центре, через который крипы проходят дважды.',
      walls: [
        { x: 15, y: 15, w: 10, h: 36 },
        { x: 45, y: 15, w: 10, h: 36 }
      ],
      zones: [
        { id: 'spawn', name: 'СПАВН', type: 'spawn', icon: '🚀', x: 29, y: 55, w: 12, h: 11, color: 'rgba(56, 189, 248, 0.25)', borderColor: '#38bdf8' },
        { id: 'wp1', name: 'ТОЧКА 1', type: 'waypoint', icon: '1️⃣', x: 0, y: 27, w: 11, h: 12, color: 'rgba(234, 179, 8, 0.2)', borderColor: '#eab308' },
        { id: 'wp2', name: 'ТОЧКА 2', type: 'waypoint', icon: '2️⃣', x: 0, y: 0, w: 11, h: 11, color: 'rgba(234, 179, 8, 0.2)', borderColor: '#eab308' },
        { id: 'wp3', name: 'ПЕРЕКРЕСТОК', type: 'waypoint', icon: '⚔️', x: 29, y: 27, w: 12, h: 12, color: 'rgba(168, 85, 247, 0.25)', borderColor: '#a855f7' },
        { id: 'wp4', name: 'ТОЧКА 4', type: 'waypoint', icon: '3️⃣', x: 59, y: 27, w: 11, h: 12, color: 'rgba(234, 179, 8, 0.2)', borderColor: '#eab308' },
        { id: 'base', name: 'БАЗА', type: 'base', icon: '🏰', x: 59, y: 0, w: 11, h: 11, color: 'rgba(239, 68, 68, 0.25)', borderColor: '#ef4444' }
      ],
      waypointCoords: [
        { x: 35, y: 60 },
        { x: 5, y: 33 },
        { x: 5, y: 5 },
        { x: 35, y: 33 },
        { x: 64, y: 33 },
        { x: 64, y: 5 }
      ]
    }
  ],

  getMap(mapId) {
    return this.MAPS.find(m => m.id === mapId) || this.MAPS[0];
  },

  // Backwards-compatible proxy for legacy MAP references
  get MAP() {
    const active = this.MAPS[0];
    return {
      WIDTH: this.MAP_CONFIG.WIDTH,
      HEIGHT: this.MAP_CONFIG.HEIGHT,
      CELL_SIZE: this.MAP_CONFIG.CELL_SIZE,
      STARTING_GOLD: this.MAP_CONFIG.STARTING_GOLD,
      STARTING_INCOME: this.MAP_CONFIG.STARTING_INCOME,
      INCOME_INTERVAL_SEC: this.MAP_CONFIG.INCOME_INTERVAL_SEC,
      STARTING_LIVES: this.MAP_CONFIG.STARTING_LIVES,
      MIDDLE_WALL: active.walls[0],
      SPAWN_ZONE: active.zones[0],
      WAYPOINT_1: active.zones[1],
      WAYPOINT_2: active.zones[2],
      EXIT_ZONE: active.zones[3],
      WAYPOINT_COORDS: active.waypointCoords
    };
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

  // 4 Playable Races with Rich Metadata for Main Screen Cards
  CHARACTERS: [
    {
      id: 'humans',
      name: '🛡 Люди (Стражи)',
      icon: '🛡',
      badge: 'Ближний бой',
      perkColor: '#f59e0b',
      perkTitle: '💥 Скорость 0.5с (2 удара)',
      desc: 'Быстрый ближний бой (Радиус: 2.2, КД атаки: 0.5с — успевает нанести 2 удара по крипу).',
      towersList: ['Страж Т0 (60 ур)', 'Рыцарь Т1 (140 ур)', 'Капитан Т2 (320 ур)', 'Паладин Т3 (650 ур)', 'Маршал Т4 (1100 ур)']
    },
    {
      id: 'elves',
      name: '🌙 Эльфы (Лучники)',
      icon: '🌙',
      badge: 'Мультишот',
      perkColor: '#a855f7',
      perkTitle: '🎯 Залп по 2–5 целям',
      desc: 'Выпускает стрелы одновременно по нескольким крипам для эффективной зачистки толп.',
      towersList: ['Лучная Т0 (2 цели)', 'Страж Т1 (3 цели)', 'Охотница Т2 (3 цели)', 'Древо Т3 (4 цели)', 'Звездопад Т4 (5 целей)']
    },
    {
      id: 'murlocs',
      name: '🐟 Мурлоки (Глубины)',
      icon: '🐟',
      badge: 'Замедление',
      perkColor: '#06b6d4',
      perkTitle: '❄️ Замедление 10%–35%',
      desc: 'Замедляет крипов при каждом попадании на 2.5 сек, задерживая их в лабиринте.',
      towersList: ['Плеватель Т0 (-10%)', 'Ловец Т1 (-15%)', 'Оракул Т2 (-20%)', 'Шаман Т3 (-25%)', 'Владыка Т4 (-35%)']
    },
    {
      id: 'trolls',
      name: '🏹 Тролли (Вуду)',
      icon: '🏹',
      badge: 'Срез брони + Яд',
      perkColor: '#10b981',
      perkTitle: '🛡 Срез брони + 🧪 Яд',
      desc: 'Каждый выстрел срезает броню цели (до -6) и накладывает периодический яд (до 150/с).',
      towersList: ['Копейщик Т0 (-1/яд 4)', 'Берсерк Т1 (-2/яд 10)', 'Знахарь Т2 (-3/яд 25)', 'Ловец Т3 (-4/яд 60)', 'Вождь Т4 (-6/яд 150)']
    }
  ],

  // Towers hierarchy: Neutral Line + 4 Racial Branching Trees
  TOWERS: [
    // --- NEUTRAL / STANDARD LINE ---
    {
      id: 'tower_base',
      name: 'Базовая вышка',
      tierLevel: 0,
      race: 'neutral',
      cost: 10,
      damage: 10,
      range: 8.0,
      attackSpeed: 0.8,
      critChance: 0,
      critMultiplier: 1.0,
      color: '#38bdf8',
      desc: 'Начальная вышка (Цена: 10, Урон: 10).',
      upgradeId: 'tower_lvl0',
      upgradeCost: 40
    },
    {
      id: 'tower_lvl0',
      name: 'Башня Т0 (Стрелковая)',
      tierLevel: 0,
      race: 'neutral',
      cost: 50,
      damage: 40,
      range: 9.0,
      attackSpeed: 0.8,
      critChance: 0,
      critMultiplier: 1.0,
      color: '#0ea5e9',
      desc: 'Башня 0 уровня (Цена: 50, Урон: 40).',
      upgradeId: 'tower_lvl1',
      upgradeCost: 150
    },
    {
      id: 'tower_lvl1',
      name: 'Башня Т1 (Улучшенная)',
      tierLevel: 1,
      race: 'neutral',
      cost: 200,
      damage: 100,
      range: 10.0,
      attackSpeed: 0.75,
      critChance: 0,
      critMultiplier: 1.0,
      color: '#3b82f6',
      desc: 'Башня 1 уровня (Цена: 200, Урон: 100).',
      upgradeId: 'tower_lvl2',
      upgradeCost: 300
    },
    {
      id: 'tower_lvl2',
      name: 'Башня Т2 (Критическая)',
      tierLevel: 2,
      race: 'neutral',
      cost: 500,
      damage: 250,
      range: 11.0,
      attackSpeed: 0.7,
      critChance: 0.20,
      critMultiplier: 2.0,
      color: '#a855f7',
      desc: 'Башня 2 уровня (Цена: 500, Урон: 250, 20% Crit x2).',
      upgradeId: 'tower_lvl3',
      upgradeCost: 500
    },
    {
      id: 'tower_lvl3',
      name: 'Башня Т3 (Мастерская)',
      tierLevel: 3,
      race: 'neutral',
      cost: 1000,
      damage: 550,
      range: 12.0,
      attackSpeed: 0.65,
      critChance: 0.30,
      critMultiplier: 2.0,
      color: '#ec4899',
      desc: 'Башня 3 уровня (Цена: 1000, Урон: 550, 30% Crit x2).',
      upgradeId: 'tower_lvl4',
      upgradeCost: 1500
    },
    {
      id: 'tower_lvl4',
      name: 'Башня Т4 (Эпическая)',
      tierLevel: 4,
      race: 'neutral',
      cost: 2500,
      damage: 950,
      range: 13.0,
      attackSpeed: 0.6,
      critChance: 0.30,
      critMultiplier: 2.0,
      color: '#eab308',
      desc: 'Башня 4 уровня (Цена: 2500, Урон: 950, 30% Crit x2).',
      upgradeId: null,
      upgradeCost: 0
    },

    // --- 🛡 HUMANS RACIAL TREE (Rapid Melee, Range = 2.2, AttackSpeed = 0.5s - 0.35s) ---
    {
      id: 'human_t0',
      name: '🛡 Страж пехотинец Т0',
      tierLevel: 0,
      race: 'humans',
      cost: 50,
      damage: 60,
      range: 2.2,
      attackSpeed: 0.50,
      critChance: 0,
      critMultiplier: 1.0,
      color: '#f59e0b',
      desc: 'Быстрый ближний бой (КД: 0.5с, 2 удара: 60 ур).',
      upgradeId: 'human_t1',
      upgradeCost: 150
    },
    {
      id: 'human_t1',
      name: '🛡 Рыцарь мечник Т1',
      tierLevel: 1,
      race: 'humans',
      cost: 200,
      damage: 140,
      range: 2.2,
      attackSpeed: 0.45,
      critChance: 0,
      critMultiplier: 1.0,
      color: '#f59e0b',
      desc: 'Быстрый ближний бой (КД: 0.45с, 2 удара: 140 ур).',
      upgradeId: 'human_t2',
      upgradeCost: 300
    },
    {
      id: 'human_t2',
      name: '🛡 Капитан гвардии Т2',
      tierLevel: 2,
      race: 'humans',
      cost: 500,
      damage: 320,
      range: 2.2,
      attackSpeed: 0.45,
      critChance: 0.20,
      critMultiplier: 2.0,
      color: '#fbbf24',
      desc: 'Быстрый ближний бой (КД: 0.45с, 320 ур, 20% Крит).',
      upgradeId: 'human_t3',
      upgradeCost: 500
    },
    {
      id: 'human_t3',
      name: '🛡 Паладин Света Т3',
      tierLevel: 3,
      race: 'humans',
      cost: 1000,
      damage: 650,
      range: 2.2,
      attackSpeed: 0.40,
      critChance: 0.30,
      critMultiplier: 2.0,
      color: '#fde047',
      desc: 'Быстрый ближний бой (КД: 0.40с, 650 ур, 30% Крит).',
      upgradeId: 'human_t4',
      upgradeCost: 1500
    },
    {
      id: 'human_t4',
      name: '🛡 Великий Маршал Т4',
      tierLevel: 4,
      race: 'humans',
      cost: 2500,
      damage: 1100,
      range: 2.2,
      attackSpeed: 0.35,
      critChance: 0.30,
      critMultiplier: 2.5,
      color: '#fef08a',
      desc: 'Быстрый ближний бой (КД: 0.35с, 1100 ур, 30% Крит x2.5).',
      upgradeId: null,
      upgradeCost: 0
    },

    // --- 🌙 ELVES RACIAL TREE (Multi-Shot: 2 to 5 targets) ---
    {
      id: 'elf_t0',
      name: '🌙 Лучная башня Т0',
      tierLevel: 0,
      race: 'elves',
      cost: 50,
      damage: 22,
      multishot: 2,
      range: 9.0,
      attackSpeed: 0.8,
      critChance: 0,
      critMultiplier: 1.0,
      color: '#8b5cf6',
      desc: 'Мультишот: 2 цели (Урон 22).',
      upgradeId: 'elf_t1',
      upgradeCost: 150
    },
    {
      id: 'elf_t1',
      name: '🌙 Страж рощи Т1',
      tierLevel: 1,
      race: 'elves',
      cost: 200,
      damage: 45,
      multishot: 3,
      range: 10.0,
      attackSpeed: 0.75,
      critChance: 0,
      critMultiplier: 1.0,
      color: '#a855f7',
      desc: 'Мультишот: 3 цели (Урон 45).',
      upgradeId: 'elf_t2',
      upgradeCost: 300
    },
    {
      id: 'elf_t2',
      name: '🌙 Лунная охотница Т2',
      tierLevel: 2,
      race: 'elves',
      cost: 500,
      damage: 110,
      multishot: 3,
      range: 11.0,
      attackSpeed: 0.7,
      critChance: 0.15,
      critMultiplier: 2.0,
      color: '#c084fc',
      desc: 'Мультишот: 3 цели (Урон 110, 15% Крит).',
      upgradeId: 'elf_t3',
      upgradeCost: 500
    },
    {
      id: 'elf_t3',
      name: '🌙 Древо мудрости Т3',
      tierLevel: 3,
      race: 'elves',
      cost: 1000,
      damage: 180,
      multishot: 4,
      range: 12.0,
      attackSpeed: 0.65,
      critChance: 0.20,
      critMultiplier: 2.0,
      color: '#e879f9',
      desc: 'Мультишот: 4 цели (Урон 180, 20% Крит).',
      upgradeId: 'elf_t4',
      upgradeCost: 1500
    },
    {
      id: 'elf_t4',
      name: '🌙 Звездопад Элуны Т4',
      tierLevel: 4,
      race: 'elves',
      cost: 2500,
      damage: 260,
      multishot: 5,
      range: 13.0,
      attackSpeed: 0.6,
      critChance: 0.25,
      critMultiplier: 2.5,
      color: '#f472b6',
      desc: 'Мультишот: 5 целей (Урон 260, 25% Крит x2.5).',
      upgradeId: null,
      upgradeCost: 0
    },

    // --- 🐟 MURLOCS RACIAL TREE (Slow -10% to -35%) ---
    {
      id: 'murloc_t0',
      name: '🐟 Мурлок плеватель Т0',
      tierLevel: 0,
      race: 'murlocs',
      cost: 50,
      damage: 30,
      slowPercent: 0.10,
      range: 9.0,
      attackSpeed: 0.8,
      critChance: 0,
      critMultiplier: 1.0,
      color: '#06b6d4',
      desc: 'Замедление: -10% скорости (Урон 30).',
      upgradeId: 'murloc_t1',
      upgradeCost: 150
    },
    {
      id: 'murloc_t1',
      name: '🐟 Мурлок ловец Т1',
      tierLevel: 1,
      race: 'murlocs',
      cost: 200,
      damage: 75,
      slowPercent: 0.15,
      range: 10.0,
      attackSpeed: 0.75,
      critChance: 0,
      critMultiplier: 1.0,
      color: '#0891b2',
      desc: 'Замедление: -15% скорости (Урон 75).',
      upgradeId: 'murloc_t2',
      upgradeCost: 300
    },
    {
      id: 'murloc_t2',
      name: '🐟 Морской оракул Т2',
      tierLevel: 2,
      race: 'murlocs',
      cost: 500,
      damage: 190,
      slowPercent: 0.20,
      range: 11.0,
      attackSpeed: 0.7,
      critChance: 0.15,
      critMultiplier: 2.0,
      color: '#22d3ee',
      desc: 'Замедление: -20% скорости (Урон 190, 15% Крит).',
      upgradeId: 'murloc_t3',
      upgradeCost: 500
    },
    {
      id: 'murloc_t3',
      name: '🐟 Глубоководный шаман Т3',
      tierLevel: 3,
      race: 'murlocs',
      cost: 1000,
      damage: 420,
      slowPercent: 0.25,
      range: 12.0,
      attackSpeed: 0.65,
      critChance: 0.20,
      critMultiplier: 2.0,
      color: '#38bdf8',
      desc: 'Замедление: -25% скорости (Урон 420, 20% Крит).',
      upgradeId: 'murloc_t4',
      upgradeCost: 1500
    },
    {
      id: 'murloc_t4',
      name: '🐟 Владыка глубин Т4',
      tierLevel: 4,
      race: 'murlocs',
      cost: 2500,
      damage: 720,
      slowPercent: 0.35,
      range: 13.0,
      attackSpeed: 0.6,
      critChance: 0.25,
      critMultiplier: 2.5,
      color: '#67e8f9',
      desc: 'Замедление: -35% скорости (Урон 720, 25% Крит x2.5).',
      upgradeId: null,
      upgradeCost: 0
    },

    // --- 🏹 TROLLS RACIAL TREE (Armor Shred -1..-6 + Poison DoT) ---
    {
      id: 'troll_t0',
      name: '🏹 Метатель копий Т0',
      tierLevel: 0,
      race: 'trolls',
      cost: 50,
      damage: 30,
      armorShred: 1,
      poisonDps: 4,
      range: 9.0,
      attackSpeed: 0.8,
      critChance: 0,
      critMultiplier: 1.0,
      color: '#10b981',
      desc: 'Срез брони: -1 + Яд 4/с (Урон 30).',
      upgradeId: 'troll_t1',
      upgradeCost: 150
    },
    {
      id: 'troll_t1',
      name: '🏹 Тролль берсерк Т1',
      tierLevel: 1,
      race: 'trolls',
      cost: 200,
      damage: 75,
      armorShred: 2,
      poisonDps: 10,
      range: 10.0,
      attackSpeed: 0.75,
      critChance: 0,
      critMultiplier: 1.0,
      color: '#059669',
      desc: 'Срез брони: -2 + Яд 10/с (Урон 75).',
      upgradeId: 'troll_t2',
      upgradeCost: 300
    },
    {
      id: 'troll_t2',
      name: '🏹 Знахарь Вуду Т2',
      tierLevel: 2,
      race: 'trolls',
      cost: 500,
      damage: 190,
      armorShred: 3,
      poisonDps: 25,
      range: 11.0,
      attackSpeed: 0.7,
      critChance: 0.15,
      critMultiplier: 2.0,
      color: '#34d399',
      desc: 'Срез брони: -3 + Яд 25/с (Урон 190, 15% Крит).',
      upgradeId: 'troll_t3',
      upgradeCost: 500
    },
    {
      id: 'troll_t3',
      name: '🏹 Ловец теней Т3',
      tierLevel: 3,
      race: 'trolls',
      cost: 1000,
      damage: 420,
      armorShred: 4,
      poisonDps: 60,
      range: 12.0,
      attackSpeed: 0.65,
      critChance: 0.20,
      critMultiplier: 2.0,
      color: '#6ee7b7',
      desc: 'Срез брони: -4 + Яд 60/с (Урон 420, 20% Крит).',
      upgradeId: 'troll_t4',
      upgradeCost: 1500
    },
    {
      id: 'troll_t4',
      name: '🏹 Вождь племени Вуду Т4',
      tierLevel: 4,
      race: 'trolls',
      cost: 2500,
      damage: 720,
      armorShred: 6,
      poisonDps: 150,
      range: 13.0,
      attackSpeed: 0.6,
      critChance: 0.25,
      critMultiplier: 2.5,
      color: '#a7f3d0',
      desc: 'Срез брони: -6 + Яд 150/с (Урон 720, 25% Крит x2.5).',
      upgradeId: null,
      upgradeCost: 0
    }
  ],

  // Helper mapping: get corresponding racial upgrade target for a tower
  getRacialUpgrade(towerDef, raceId) {
    if (!towerDef || !raceId) return null;
    let targetPrefix = '';
    if (raceId === 'humans') targetPrefix = 'human_t';
    else if (raceId === 'elves') targetPrefix = 'elf_t';
    else if (raceId === 'murlocs') targetPrefix = 'murloc_t';
    else if (raceId === 'trolls') targetPrefix = 'troll_t';
    else return null;

    // If it's a neutral tower:
    if (towerDef.id === 'tower_base') return BALANCE.TOWERS.find(t => t.id === `${targetPrefix}0`);
    if (towerDef.id === 'tower_lvl0') return BALANCE.TOWERS.find(t => t.id === `${targetPrefix}1`);
    if (towerDef.id === 'tower_lvl1') return BALANCE.TOWERS.find(t => t.id === `${targetPrefix}2`);
    if (towerDef.id === 'tower_lvl2') return BALANCE.TOWERS.find(t => t.id === `${targetPrefix}3`);
    if (towerDef.id === 'tower_lvl3') return BALANCE.TOWERS.find(t => t.id === `${targetPrefix}4`);

    // If it's already a racial tower of the same race:
    if (towerDef.race === raceId && towerDef.upgradeId) {
      return BALANCE.TOWERS.find(t => t.id === towerDef.upgradeId);
    }

    return null;
  },

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
