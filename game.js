/**
 * Shango Tower Wars - Complete 1v1 Real-Time Multiplayer Engine
 * Fully Synchronized via Global MQTT WebSockets
 */

class SoundFx {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }
  playTone(freq, type = 'sine', duration = 0.1, gainVal = 0.1) {
    if (!this.ctx) return;
    try {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  }
  shoot() { this.playTone(480, 'triangle', 0.08, 0.05); }
  hit() { this.playTone(180, 'square', 0.05, 0.04); }
  crit() { this.playTone(850, 'sawtooth', 0.15, 0.08); }
  coin() {
    this.playTone(900, 'sine', 0.08, 0.06);
    setTimeout(() => this.playTone(1300, 'sine', 0.12, 0.06), 60);
  }
  leak() { this.playTone(120, 'sawtooth', 0.3, 0.15); }
  build() { this.playTone(350, 'sine', 0.07, 0.08); }
}

class TowerWarsGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.width = BALANCE.MAP.WIDTH;   // 70 cells
    this.height = BALANCE.MAP.HEIGHT; // 66 cells
    this.cellSize = this.canvas.width / this.width; // 840 / 70 = 12px

    this.pathfinder = new PathFinder(this.width, this.height);
    this.sound = new SoundFx();

    this.mySpeedVote = 1;
    this.enemySpeedVote = 1;
    this.gameSpeed = 1.0;
    this.gameTimeSeconds = 0;
    this.lastTime = performance.now();
    this.timeAccumulator = 0;
    this.isGameOver = false;
    this.incomeTimer = BALANCE.MAP.INCOME_INTERVAL_SEC;

    this.activeLane = 'player'; // 'player' or 'enemy'

    // Online Multiplayer State
    this.myPlayerId = 'p_' + Math.random().toString(36).substring(2, 9);
    this.mqttClient = null;
    this.roomTopic = null;
    this.isMultiplayer = false;
    this.isHost = false;

    // Player State
    this.player = {
      gold: BALANCE.MAP.STARTING_GOLD,
      income: BALANCE.MAP.STARTING_INCOME,
      lives: BALANCE.MAP.STARTING_LIVES,
      tier: 1,
      towers: [],
      grid: Array.from({ length: this.height }, () => Array(this.width).fill(null)),
      creeps: [],
      creepSlots: []
    };

    // Enemy (Opponent Player) State
    this.enemy = {
      gold: BALANCE.MAP.STARTING_GOLD,
      income: BALANCE.MAP.STARTING_INCOME,
      lives: BALANCE.MAP.STARTING_LIVES,
      tier: 1,
      towers: [],
      grid: Array.from({ length: this.height }, () => Array(this.width).fill(null)),
      creeps: [],
      creepSlots: []
    };

    this.projectiles = [];
    this.particles = [];
    this.floatingTexts = [];

    // Camera Zoom & Pan System
    this.camera = {
      zoom: 1.0,
      minZoom: 1.0,
      maxZoom: 3.0,
      x: 0,
      y: 0,
      isDragging: false,
      dragStartX: 0,
      dragStartY: 0,
      startCamX: 0,
      startCamY: 0,
      hasDragged: false
    };

    // Pre-select first tower ("Базовая вышка") so players can build immediately!
    this.selectedTowerToBuild = BALANCE.TOWERS[0];
    this.selectedEntity = null;
    this.previewUpgradeTower = null;
    this.hoverPreviewGuidePath = null;
    this.lastHoverGx = -1;
    this.lastHoverGy = -1;
    this.mouseGridPos = { x: -1, y: -1 };
    this.isHoveringCanvas = false;
    this.isMatchActive = false;
    this.isCreativeMode = false;
    this.secretCodeBuffer = '';

    this.initCreepSlots(this.player);
    this.initCreepSlots(this.enemy);

    this.recalculateCreepPaths(this.player);
    this.recalculateCreepPaths(this.enemy);

    this.initUI();
    this.bindEvents();
    this.initMultiplayerUI();
    this.recalculateEffectiveSpeed();

    this.logEvent("⚔️ Онлайн 1v1 PvP режим готов. Создайте комнату или введите код соперника!", "log-spawn");

    // Open room modal on startup
    const modal = document.getElementById('mp-modal');
    if (modal) modal.classList.remove('hidden');

    this.startEngine();
  }

  startCreativeMode() {
    this.isCreativeMode = true;
    this.isMultiplayer = false;
    this.isHost = true;
    this.isMatchActive = true;
    this.isGameOver = false;
    this.gameTimeSeconds = 0;

    // Infinite resources for creative sandbox
    this.player.gold = 999999999;
    this.player.income = 999999;
    this.player.lives = 999;
    this.player.tier = 3;

    this.enemy.gold = 999999999;
    this.enemy.income = 999999;
    this.enemy.lives = 999;
    this.enemy.tier = 3;

    this.initCreepSlots(this.player);
    this.initCreepSlots(this.enemy);

    this.recalculateCreepPaths(this.player);
    this.recalculateCreepPaths(this.enemy);

    const modal = document.getElementById('mp-modal');
    if (modal) modal.classList.add('hidden');

    const overlay = document.getElementById('canvas-overlay-msg');
    if (overlay) overlay.classList.add('hidden');

    const modeBadge = document.getElementById('game-mode-badge');
    if (modeBadge) {
      modeBadge.innerText = '🧪 Креатив: «Мелофон»';
      modeBadge.style.background = '#8b5cf6';
      modeBadge.style.color = '#fff';
    }

    const btnCreative = document.getElementById('btn-creative-mode');
    if (btnCreative) {
      btnCreative.classList.add('active');
      btnCreative.innerText = '✅ Мелофон (Вкл)';
    }

    this.sound.upgrade();
    this.logEvent('🧪 Креативный режим «Мелофон» активирован! Бесконечные деньги для строительства лабиринта.', 'log-income');
    this.updateHUD();
  }

  clampCamera() {
    if (this.camera.zoom <= 1.0) {
      this.camera.zoom = 1.0;
      this.camera.x = 0;
      this.camera.y = 0;
      return;
    }
    const minX = this.canvas.width * (1 - this.camera.zoom);
    const minY = this.canvas.height * (1 - this.camera.zoom);
    this.camera.x = Math.max(minX, Math.min(0, this.camera.x));
    this.camera.y = Math.max(minY, Math.min(0, this.camera.y));
  }

  recalculateEffectiveSpeed() {
    this.gameSpeed = Math.min(this.mySpeedVote, this.enemySpeedVote);
    const effElem = document.getElementById('effective-speed-val');
    const oppElem = document.getElementById('opponent-speed-val');
    if (effElem) effElem.innerText = `${this.gameSpeed}x`;
    if (oppElem) oppElem.innerText = `${this.enemySpeedVote}x`;
  }

  clearBuildSelection() {
    this.selectedTowerToBuild = null;
    this.previewUpgradeTower = null;
    this.hoverPreviewGuidePath = null;
    this.lastHoverGx = -1;
    this.lastHoverGy = -1;
    this.canvas.style.cursor = 'default';
    this.renderTowerSelector();
  }

  initCreepSlots(agent) {
    const tierData = BALANCE.CREEPS_BY_TIER[agent.tier] || BALANCE.CREEPS_BY_TIER[1];
    agent.creepSlots = tierData.map((creepDef, idx) => ({
      index: idx,
      def: creepDef,
      charges: 0,
      initialCooldownRemaining: creepDef.initCd || 0,
      stackTimer: 0
    }));
  }

  isPermanentWall(x, y) {
    const wall = BALANCE.MAP.MIDDLE_WALL;
    return (x >= wall.x && x < wall.x + wall.w && y >= wall.y && y < wall.y + wall.h);
  }

  isSpecialNoBuildZone(x, y) {
    if (this.isPermanentWall(x, y)) return true;

    // 4 Corner Control Zones
    const sz = BALANCE.MAP.SPAWN_ZONE;
    if (x >= sz.x && x < sz.x + sz.w && y >= sz.y && y < sz.y + sz.h) return true;

    const wp1 = BALANCE.MAP.WAYPOINT_1;
    if (x >= wp1.x && x < wp1.x + wp1.w && y >= wp1.y && y < wp1.y + wp1.h) return true;

    const wp2 = BALANCE.MAP.WAYPOINT_2;
    if (x >= wp2.x && x < wp2.x + wp2.w && y >= wp2.y && y < wp2.y + wp2.h) return true;

    const ez = BALANCE.MAP.EXIT_ZONE;
    if (x >= ez.x && x < ez.x + ez.w && y >= ez.y && y < ez.y + ez.h) return true;

    return false;
  }

  isCellBlocked(agent, x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return true;
    if (this.isPermanentWall(x, y)) return true;
    return agent.grid[y][x] !== null;
  }

  canPlaceTower(agent, gx, gy) {
    if (gx < 0 || gx + 1 >= this.width || gy < 0 || gy + 1 >= this.height) return false;

    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const cx = gx + dx;
        const cy = gy + dy;
        if (this.isSpecialNoBuildZone(cx, cy)) return false;
        if (agent.grid[cy][cx] !== null) return false;
      }
    }

    const simulatedBlocked = (x, y) => {
      if ((x === gx || x === gx + 1) && (y === gy || y === gy + 1)) return true;
      return this.isCellBlocked(agent, x, y);
    };

    const fullCircuit = this.pathfinder.findMultiWaypointPath(BALANCE.MAP.WAYPOINT_COORDS, simulatedBlocked);
    if (!fullCircuit) return false;

    for (const creep of agent.creeps) {
      const curPos = { x: Math.round(creep.x), y: Math.round(creep.y) };
      const remainingPoints = [curPos];
      for (let w = creep.currentWaypointStage; w < BALANCE.MAP.WAYPOINT_COORDS.length; w++) {
        remainingPoints.push(BALANCE.MAP.WAYPOINT_COORDS[w]);
      }
      const creepPath = this.pathfinder.findMultiWaypointPath(remainingPoints, simulatedBlocked);
      if (!creepPath) return false;
    }

    return true;
  }

  placeTower(agent, gx, gy, towerDef, deductCost = true, notifyNet = true) {
    if (!this.canPlaceTower(agent, gx, gy)) return false;

    if (deductCost && !this.isCreativeMode) {
      if (agent.gold < towerDef.cost) return false;
      agent.gold -= towerDef.cost;
    }

    const tower = {
      id: `tower_${Date.now()}_${Math.random()}`,
      def: towerDef,
      x: gx,
      y: gy,
      level: 0,
      attackCooldown: 0,
      target: null,
      totalDamageDealt: 0,
      kills: 0
    };

    agent.towers.push(tower);

    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        agent.grid[gy + dy][gx + dx] = tower;
      }
    }

    this.recalculateCreepPaths(agent);

    if (agent === this.player) {
      this.sound.build();
      this.logEvent(`🔨 Построена: ${towerDef.name} (-🪙${towerDef.cost})`, 'log-income');
      this.updateHUD();

      if (notifyNet && this.isMultiplayer) {
        this.sendNetAction('BUILD_TOWER', { gx, gy, towerId: towerDef.id });
      }
    }

    return true;
  }

  recalculateCreepPaths(agent) {
    agent.guidePath = this.pathfinder.findMultiWaypointPath(
      BALANCE.MAP.WAYPOINT_COORDS,
      (x, y) => this.isCellBlocked(agent, x, y)
    );

    for (const creep of agent.creeps) {
      const curPos = { x: Math.round(creep.x), y: Math.round(creep.y) };
      const remainingPoints = [curPos];
      for (let w = creep.currentWaypointStage; w < BALANCE.MAP.WAYPOINT_COORDS.length; w++) {
        remainingPoints.push(BALANCE.MAP.WAYPOINT_COORDS[w]);
      }
      const path = this.pathfinder.findMultiWaypointPath(remainingPoints, (x, y) => this.isCellBlocked(agent, x, y));
      if (path && path.length > 0) {
        creep.path = path;
        creep.pathIndex = 0;
      }
    }
  }

  spawnCreep(senderAgent, receiverAgent, creepDef) {
    const startCoord = BALANCE.MAP.WAYPOINT_COORDS[0];
    const spawnX = startCoord.x;
    const spawnY = startCoord.y;

    const routePoints = [
      { x: spawnX, y: spawnY },
      BALANCE.MAP.WAYPOINT_COORDS[1],
      BALANCE.MAP.WAYPOINT_COORDS[2],
      BALANCE.MAP.WAYPOINT_COORDS[3]
    ];

    const path = this.pathfinder.findMultiWaypointPath(routePoints, (x, y) => this.isCellBlocked(receiverAgent, x, y));
    if (!path) return false;

    const creep = {
      id: `creep_${Date.now()}_${Math.random()}`,
      def: creepDef,
      name: creepDef.name,
      icon: creepDef.icon,
      hp: creepDef.hp,
      maxHp: creepDef.hp,
      armor: creepDef.armor,
      baseSpeed: creepDef.speed,
      speed: creepDef.speed,
      slowTimer: 0,
      x: spawnX,
      y: spawnY,
      path: path,
      pathIndex: 0,
      currentWaypointStage: 1
    };

    receiverAgent.creeps.push(creep);
    return true;
  }

  sendCreepAction(slotIndex) {
    const slot = this.player.creepSlots[slotIndex];
    if (!slot) return;
    if (slot.initialCooldownRemaining > 0) return;
    if (slot.charges <= 0) return;
    if (this.player.gold < slot.def.cost) {
      this.logEvent(`⚠️ Недостаточно золота для ${slot.def.name}!`, 'log-leak');
      return;
    }

    this.player.gold -= slot.def.cost;
    slot.charges--;
    this.player.income += slot.def.income;

    this.sound.coin();

    if (this.isMultiplayer) {
      this.sendNetAction('SEND_CREEP', {
        tier: this.player.tier,
        slotIndex: slotIndex
      });
    }

    const incSign = slot.def.income >= 0 ? `+${slot.def.income}` : `${slot.def.income}`;
    this.logEvent(`👾 Отправлен ${slot.def.name} (Инком: ${incSign})`, 'log-spawn');

    this.updateHUD();
    this.renderCreepButtons();
  }

  upgradeTierAction() {
    if (this.player.tier >= 3) return;
    const upgradeCost = BALANCE.TIER_UPGRADE_COSTS[this.player.tier - 1];
    if (this.player.gold < upgradeCost) {
      this.logEvent(`⚠️ Недостаточно золота для апгрейда тира (🪙${upgradeCost})!`, 'log-leak');
      return;
    }

    this.player.gold -= upgradeCost;
    this.player.tier++;
    this.initCreepSlots(this.player);

    this.sound.crit();
    this.logEvent(`🌟 ТИР ПОВЫШЕН ДО ${this.player.tier}! Открыты новые крипы.`, 'log-kill');

    if (this.isMultiplayer) {
      this.sendNetAction('TIER_UPGRADE', { tier: this.player.tier });
    }

    this.updateHUD();
    this.renderCreepButtons();
  }

  startEngine() {
    this.lastTime = performance.now();
    this.timeAccumulator = 0;

    // Web Worker ticker for unthrottled, continuous background game ticks
    try {
      const workerBlob = new Blob([`
        let timer = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (!timer) {
              timer = setInterval(function() {
                self.postMessage('tick');
              }, 1000 / 60);
            }
          } else if (e.data === 'stop') {
            if (timer) {
              clearInterval(timer);
              timer = null;
            }
          }
        };
      `], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(workerBlob);
      this.tickerWorker = new Worker(workerUrl);
      this.tickerWorker.onmessage = () => {
        this.stepSimulation();
      };
      this.tickerWorker.postMessage('start');
    } catch (e) {
      console.warn('Web Worker ticker not supported, fallback to interval:', e);
      setInterval(() => this.stepSimulation(), 1000 / 60);
    }

    // Main animation loop for 60fps canvas rendering
    const renderLoop = () => {
      this.stepSimulation();
      this.render();
      requestAnimationFrame(renderLoop);
    };
    requestAnimationFrame(renderLoop);

    // Instant catch-up / sync when tab visibility changes or receives focus
    document.addEventListener('visibilitychange', () => {
      this.stepSimulation();
    });
    window.addEventListener('focus', () => {
      this.stepSimulation();
    });
  }

  stepSimulation() {
    const now = performance.now();
    if (!this.lastTime) this.lastTime = now;
    let deltaSec = (now - this.lastTime) / 1000;
    this.lastTime = now;

    // Safety ceiling: max 5 seconds catch-up in a single step (prevents freeze on machine sleep)
    if (deltaSec > 5.0) deltaSec = 5.0;
    if (deltaSec <= 0) return;

    this.timeAccumulator += deltaSec * this.gameSpeed;

    const FIXED_DT = 1 / 60; // 60 updates per simulated second
    let maxSteps = 120; // safety ceiling per tick call

    while (this.timeAccumulator >= FIXED_DT && maxSteps > 0) {
      this.update(FIXED_DT);
      this.timeAccumulator -= FIXED_DT;
      maxSteps--;
    }
  }

  update(dt) {
    if (this.isGameOver) return;

    this.gameTimeSeconds += dt;

    this.incomeTimer -= dt;
    if (this.incomeTimer <= 0) {
      this.incomeTimer += BALANCE.MAP.INCOME_INTERVAL_SEC;
      this.player.gold += this.player.income;
      this.enemy.gold += this.enemy.income;
      this.sound.coin();
      this.logEvent(`💰 Получен инком: +🪙${this.player.income}`, 'log-income');
      this.addFloatingText(this.width / 2, 4, `+🪙${this.player.income}`, '#10b981');
      this.updateHUD();
    }

    this.updateCreepSlots(this.player, dt);
    this.updateCreepSlots(this.enemy, dt);

    this.updateTowers(this.player, dt);
    this.updateTowers(this.enemy, dt);

    this.updateCreeps(this.player, dt);
    this.updateCreeps(this.enemy, dt);

    this.updateProjectiles(dt);
    this.updateParticles(dt);
    this.updateFloatingTexts(dt);

    this.updateCreepUIRealtime();

    if (this.player.lives <= 0) {
      this.isGameOver = true;
      this.triggerGameOver(false);
    } else if (this.enemy.lives <= 0) {
      this.isGameOver = true;
      this.triggerGameOver(true);
    }

    const timerElem = document.getElementById('income-timer');
    if (timerElem) timerElem.innerText = `${Math.ceil(this.incomeTimer)}s`;

    const mins = Math.floor(this.gameTimeSeconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(this.gameTimeSeconds % 60).toString().padStart(2, '0');
    const gameTimeElem = document.getElementById('game-time');
    if (gameTimeElem) gameTimeElem.innerText = `${mins}:${secs}`;
  }

  updateCreepSlots(agent, dt) {
    for (const slot of agent.creepSlots) {
      if (slot.initialCooldownRemaining > 0) {
        slot.initialCooldownRemaining -= dt;
        if (slot.initialCooldownRemaining <= 0) {
          slot.initialCooldownRemaining = 0;
          slot.charges = 1;
        }
      } else {
        if (slot.charges < 10) {
          slot.stackTimer += dt;
          if (slot.stackTimer >= slot.def.stackInterval) {
            slot.stackTimer = 0;
            slot.charges++;
          }
        }
      }
    }
  }

  updateTowers(agent, dt) {
    for (const tower of agent.towers) {
      tower.attackCooldown -= dt;
      if (tower.attackCooldown > 0) continue;

      const towerCenterX = tower.x + 1;
      const towerCenterY = tower.y + 1;
      let bestTarget = null;
      let maxProgress = -1;

      for (const creep of agent.creeps) {
        const dist = Math.hypot(creep.x - towerCenterX, creep.y - towerCenterY);
        if (dist <= tower.def.range) {
          const score = creep.currentWaypointStage * 1000 + creep.pathIndex;
          if (score > maxProgress) {
            maxProgress = score;
            bestTarget = creep;
          }
        }
      }

      if (bestTarget) {
        this.fireTower(agent, tower, bestTarget);
        tower.attackCooldown = tower.def.attackSpeed;
      }
    }
  }

  fireTower(agent, tower, target) {
    const towerCenterX = tower.x + 1;
    const towerCenterY = tower.y + 1;

    this.projectiles.push({
      lane: agent === this.player ? 'player' : 'enemy',
      x: towerCenterX,
      y: towerCenterY,
      target: target,
      targetX: target.x,
      targetY: target.y,
      speed: 32,
      tower: tower,
      color: tower.def.color
    });

    if (agent === this.player && this.activeLane === 'player') {
      this.sound.shoot();
    }
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];

      if (p.target && p.target.hp > 0) {
        p.targetX = p.target.x;
        p.targetY = p.target.y;
      }

      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 0.6 || isNaN(dist)) {
        this.onProjectileHit(p);
        this.projectiles.splice(i, 1);
      } else {
        const step = p.speed * dt;
        p.x += (dx / dist) * Math.min(step, dist);
        p.y += (dy / dist) * Math.min(step, dist);
      }
    }
  }

  onProjectileHit(p) {
    const agent = p.lane === 'player' ? this.player : this.enemy;
    const tower = p.tower;

    if (p.target && p.target.hp > 0) {
      this.applyDamage(agent, tower, p.target, 1.0);
      this.createHitSparks(p.targetX, p.targetY, tower.def.color);
    }
  }

  applyDamage(agent, tower, creep, multiplier = 1.0) {
    let rawDmg = tower.def.damage * multiplier;
    let isCrit = false;

    if (tower.def.critChance > 0 && Math.random() < tower.def.critChance) {
      rawDmg *= tower.def.critMultiplier;
      isCrit = true;
    }

    const effectiveArmor = Math.max(0, creep.armor * (1 - (tower.def.armorPierce || 0)));
    const reduction = BALANCE.getArmorDamageReduction(effectiveArmor);
    const finalDamage = Math.max(1, Math.round(rawDmg * (1 - reduction)));

    creep.hp -= finalDamage;
    tower.totalDamageDealt += finalDamage;

    if (agent === this.player && this.activeLane === 'player') {
      if (isCrit) {
        this.sound.crit();
        this.addFloatingText(creep.x, creep.y - 1.0, `💥${finalDamage}!`, '#ec4899', 1.2);
      } else {
        this.sound.hit();
        this.addFloatingText(creep.x, creep.y - 0.6, `${finalDamage}`, '#cbd5e1', 0.8);
      }
    }

    if (creep.hp <= 0) {
      tower.kills++;
      this.onCreepKilled(agent, creep);
    }
  }

  onCreepKilled(agent, creep) {
    const bounty = creep.def.bounty !== undefined ? creep.def.bounty : (creep.def.income > 0 ? creep.def.income : Math.round(creep.def.cost * 0.075));
    agent.gold += bounty;

    if (agent === this.player) {
      this.sound.coin();
      this.addFloatingText(creep.x, creep.y, `+🪙${bounty}`, '#f59e0b', 1.0);
      this.logEvent(`💀 Убит ${creep.name} (+🪙${bounty})`, 'log-kill');
      this.updateHUD();
    }

    this.createDeathBurst(creep.x, creep.y, '#f59e0b');
  }

  updateCreeps(agent, dt) {
    const wp1 = BALANCE.MAP.WAYPOINT_COORDS[1];
    const wp2 = BALANCE.MAP.WAYPOINT_COORDS[2];
    const ez = BALANCE.MAP.WAYPOINT_COORDS[3];

    for (let i = agent.creeps.length - 1; i >= 0; i--) {
      const creep = agent.creeps[i];

      if (creep.slowTimer > 0) {
        creep.slowTimer -= dt;
        if (creep.slowTimer <= 0) {
          creep.speed = creep.baseSpeed;
        }
      }

      if (creep.hp <= 0) {
        agent.creeps.splice(i, 1);
        continue;
      }

      if (creep.currentWaypointStage === 1) {
        if (Math.hypot(creep.x - wp1.x, creep.y - wp1.y) < 1.5 || (creep.x >= 68 && creep.y <= 1)) {
          creep.currentWaypointStage = 2;
        }
      } else if (creep.currentWaypointStage === 2) {
        if (Math.hypot(creep.x - wp2.x, creep.y - wp2.y) < 1.5 || (creep.x <= 1 && creep.y <= 1)) {
          creep.currentWaypointStage = 3;
        }
      }

      if (creep.path && creep.pathIndex < creep.path.length) {
        const targetNode = creep.path[creep.pathIndex];
        const dx = targetNode.x - creep.x;
        const dy = targetNode.y - creep.y;
        const dist = Math.hypot(dx, dy);

        const moveStep = creep.speed * dt * 2.2;

        if (dist <= moveStep) {
          creep.x = targetNode.x;
          creep.y = targetNode.y;
          creep.pathIndex++;
        } else {
          creep.x += (dx / dist) * moveStep;
          creep.y += (dy / dist) * moveStep;
        }
      }

      const inExit = (Math.hypot(creep.x - ez.x, creep.y - ez.y) < 1.5 || (creep.x <= 1 && creep.y >= 64));
      if ((inExit && creep.currentWaypointStage >= 2) || creep.pathIndex >= (creep.path ? creep.path.length : 0)) {
        agent.lives--;
        agent.creeps.splice(i, 1);

        if (agent === this.player) {
          this.sound.leak();
          this.logEvent(`🚨 УТЕЧКА! ${creep.name} прошел всю карту (-1 ❤️)!`, 'log-leak');
          this.addFloatingText(ez.x, ez.y, `-1 ❤️`, '#ef4444', 1.4);

          if (this.isMultiplayer) {
            this.sendNetAction('LIVES_SYNC', { lives: this.player.lives });
          }
        } else {
          this.logEvent(`🎯 Твой ${creep.name} прошел базу соперника!`, 'log-income');
        }

        this.updateHUD();
      }
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  updateFloatingTexts(dt) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= 2.0 * dt;
      ft.life -= dt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  createHitSparks(gx, gy, color) {
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x: gx,
        y: gy,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        radius: 2,
        color: color || '#fff',
        life: 0.25,
        maxLife: 0.25
      });
    }
  }

  createDeathBurst(gx, gy, color) {
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        x: gx,
        y: gy,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.5) * 16,
        radius: 2.5,
        color: color || '#f59e0b',
        life: 0.35,
        maxLife: 0.35
      });
    }
  }

  addFloatingText(gx, gy, text, color = '#fff', scale = 1.0) {
    this.floatingTexts.push({
      x: gx,
      y: gy,
      text: text,
      color: color,
      scale: scale,
      life: 0.8,
      maxLife: 0.8
    });
  }

  // --- High-Contrast Vibrant Canvas Rendering ---
  render() {
    const ctx = this.ctx;
    const cs = this.cellSize;
    const agent = this.activeLane === 'player' ? this.player : this.enemy;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    // Apply Camera Zoom and Pan Translation
    ctx.translate(this.camera.x, this.camera.y);
    ctx.scale(this.camera.zoom, this.camera.zoom);

    // 1. Dark Blueprint Background
    ctx.fillStyle = '#0a0f1d';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 2. High-Contrast Grid (1x1 Cells and 2x2 Tower Borders)
    ctx.strokeStyle = '#1a273f';
    ctx.lineWidth = 1;
    for (let x = 0; x <= this.width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cs, 0);
      ctx.lineTo(x * cs, this.canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= this.height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cs);
      ctx.lineTo(this.canvas.width, y * cs);
      ctx.stroke();
    }

    // 2x2 Tower Grid Lines (Every 2 cells)
    ctx.strokeStyle = '#283c5e';
    ctx.lineWidth = 1.2;
    for (let x = 0; x <= this.width; x += 2) {
      ctx.beginPath();
      ctx.moveTo(x * cs, 0);
      ctx.lineTo(x * cs, this.canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= this.height; y += 2) {
      ctx.beginPath();
      ctx.moveTo(0, y * cs);
      ctx.lineTo(this.canvas.width, y * cs);
      ctx.stroke();
    }

    // 3. Central Obstacle Wall
    const mw = BALANCE.MAP.MIDDLE_WALL;
    ctx.fillStyle = '#161f30';
    ctx.fillRect(mw.x * cs, mw.y * cs, mw.w * cs, mw.h * cs);

    // Diagonal texture stripes on the wall
    ctx.strokeStyle = '#24344d';
    ctx.lineWidth = 3;
    for (let d = -mw.h * cs; d < mw.w * cs; d += 18) {
      ctx.beginPath();
      ctx.moveTo(mw.x * cs + Math.max(0, d), mw.y * cs + Math.max(0, -d));
      ctx.lineTo(mw.x * cs + Math.min(mw.w * cs, d + mw.h * cs), mw.y * cs + Math.min(mw.h * cs, -d + mw.w * cs));
      ctx.stroke();
    }
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(mw.x * cs, mw.y * cs, mw.w * cs, mw.h * cs);

    // 4. Vibrant 4-Corner Waypoint Portals
    const sz = BALANCE.MAP.SPAWN_ZONE;
    const wp1 = BALANCE.MAP.WAYPOINT_1;
    const wp2 = BALANCE.MAP.WAYPOINT_2;
    const ez = BALANCE.MAP.EXIT_ZONE;

    const drawVibrantZone = (zone, colorHex, strokeHex, iconText) => {
      const zx = zone.x * cs;
      const zy = zone.y * cs;
      const zw = zone.w * cs;
      const zh = zone.h * cs;

      // Glow fill
      ctx.fillStyle = colorHex;
      ctx.fillRect(zx, zy, zw, zh);

      // Strong border
      ctx.strokeStyle = strokeHex;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(zx, zy, zw, zh);

      // Concentric Beacon Ring
      ctx.beginPath();
      ctx.arc(zx + zw / 2, zy + zh / 2, Math.min(zw, zh) * 0.42, 0, Math.PI * 2);
      ctx.strokeStyle = strokeHex;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(zx + zw / 2, zy + zh / 2, Math.min(zw, zh) * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = strokeHex;
      ctx.fill();

      // Icon badge
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(iconText, zx + zw / 2, zy + zh / 2);
    };

    drawVibrantZone(sz, '#0ea5e933', '#38bdf8', '🚀');   // Spawn (Bottom-Right)
    drawVibrantZone(wp1, '#f59e0b33', '#fbbf24', '1️⃣'); // Checkpoint 1 (Top-Right)
    drawVibrantZone(wp2, '#a855f733', '#c084fc', '2️⃣'); // Checkpoint 2 (Top-Left)
    drawVibrantZone(ez, '#ef444433', '#f87171', '🏰');   // Exit Goal (Bottom-Left)

    // 5. Dynamic Waypoints Route Guide (Subtle Floor Indicator underneath creeps)
    const activeGuidePath = (this.activeLane === 'player' && this.hoverPreviewGuidePath)
      ? this.hoverPreviewGuidePath
      : (agent.guidePath || this.pathfinder.findMultiWaypointPath(BALANCE.MAP.WAYPOINT_COORDS, (x, y) => this.isCellBlocked(agent, x, y)));

    if (activeGuidePath && activeGuidePath.length > 1) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 1.5;
      const animOffset = (this.gameTimeSeconds * 20) % 12;
      ctx.lineDashOffset = -animOffset;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo((activeGuidePath[0].x + 0.5) * cs, (activeGuidePath[0].y + 0.5) * cs);
      for (let i = 1; i < activeGuidePath.length; i++) {
        ctx.lineTo((activeGuidePath[i].x + 0.5) * cs, (activeGuidePath[i].y + 0.5) * cs);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }

    // 6. Towers
    for (const tower of agent.towers) {
      const tx = tower.x * cs;
      const ty = tower.y * cs;
      const tw = 2 * cs;
      const th = 2 * cs;

      ctx.fillStyle = '#182234';
      ctx.fillRect(tx + 1, ty + 1, tw - 2, th - 2);

      ctx.fillStyle = tower.def.color;
      ctx.beginPath();
      ctx.arc(tx + tw / 2, ty + th / 2, cs * 0.7, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = (this.selectedEntity === tower) ? '#ffffff' : tower.def.color;
      ctx.lineWidth = (this.selectedEntity === tower) ? 2.5 : 1.5;
      ctx.strokeRect(tx + 1, ty + 1, tw - 2, th - 2);

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(tx + tw / 2, ty + th / 2, 3, 0, Math.PI * 2);
      ctx.fill();

      if (tower.def.critChance > 0) {
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 8px JetBrains Mono';
        ctx.textAlign = 'right';
        ctx.fillText('CRIT', tx + tw - 2, ty + 9);
      }
    }

    if (this.selectedEntity && this.selectedEntity.def && this.selectedEntity.def.range) {
      const st = this.selectedEntity;
      ctx.strokeStyle = '#38bdf888';
      ctx.fillStyle = '#38bdf811';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc((st.x + 1) * cs, (st.y + 1) * cs, st.def.range * cs, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (this.previewUpgradeTower && this.previewUpgradeTower.range) {
        ctx.strokeStyle = '#10b981cc';
        ctx.fillStyle = '#10b9811c';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc((st.x + 1) * cs, (st.y + 1) * cs, this.previewUpgradeTower.range * cs, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 7. Creeps
    for (const creep of agent.creeps) {
      const cx = (creep.x + 0.5) * cs;
      const cy = (creep.y + 0.5) * cs;

      if (creep.slowTimer > 0) {
        ctx.fillStyle = '#06b6d444';
        ctx.beginPath();
        ctx.arc(cx, cy, cs * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.font = `${Math.round(cs * 1.3)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(creep.icon, cx, cy);

      const barW = cs * 1.6;
      const barH = 2.5;
      const barX = cx - barW / 2;
      const barY = cy - cs * 0.85;

      const hpPercent = Math.max(0, creep.hp / creep.maxHp);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

      ctx.fillStyle = hpPercent > 0.5 ? '#10b981' : hpPercent > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(barX, barY, barW * hpPercent, barH);
    }

    // 8. Projectiles
    for (const p of this.projectiles) {
      if (p.lane !== this.activeLane) continue;
      const px = p.x * cs;
      const py = p.y * cs;

      ctx.fillStyle = p.color || '#fff';
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 9. Particles
    for (const pt of this.particles) {
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.beginPath();
      ctx.arc(pt.x * cs, pt.y * cs, pt.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }

    // 10. Floating Texts
    for (const ft of this.floatingTexts) {
      ctx.fillStyle = ft.color;
      ctx.font = `bold ${Math.round(11 * ft.scale)}px JetBrains Mono`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
      ctx.fillText(ft.text, ft.x * cs, ft.y * cs);
      ctx.globalAlpha = 1.0;
    }

    // 11. Mouse Hover Placement Ghost (Only when a tower is selected!)
    if (this.activeLane === 'player' && this.isHoveringCanvas && this.selectedTowerToBuild) {
      const gx = this.mouseGridPos.x;
      const gy = this.mouseGridPos.y;

      if (gx >= 0 && gx + 1 < this.width && gy >= 0 && gy + 1 < this.height) {
        const canBuild = this.canPlaceTower(this.player, gx, gy);
        const bx = gx * cs;
        const by = gy * cs;
        const bw = 2 * cs;
        const bh = 2 * cs;
        const centerX = bx + bw / 2;
        const centerY = by + bh / 2;

        // Snapped 2x2 grid box
        ctx.fillStyle = canBuild ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.35)';
        ctx.fillRect(bx, by, bw, bh);

        ctx.strokeStyle = canBuild ? '#10b981' : '#ef4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);

        // Center reticle / tower preview core directly under cursor crosshair
        ctx.fillStyle = this.selectedTowerToBuild.color;
        ctx.beginPath();
        ctx.arc(centerX, centerY, cs * 0.7, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 3, 0, Math.PI * 2);
        ctx.fill();

        // Range indicator circle
        ctx.strokeStyle = canBuild ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)';
        ctx.fillStyle = canBuild ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(centerX, centerY, this.selectedTowerToBuild.range * cs, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.restore();

    // Zoom Indicator Badge when zoomed in
    if (this.camera.zoom > 1.01) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(this.canvas.width - 100, 10, 90, 26);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.strokeRect(this.canvas.width - 100, 10, 90, 26);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 12px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`🔍 ${this.camera.zoom.toFixed(1)}x`, this.canvas.width - 55, 23);
    }
  }

  // --- UI and Interaction ---
  initUI() {
    this.renderTowerSelector();
    this.renderCreepButtons();
    this.updateHUD();
  }

  renderTowerSelector() {
    const list = document.getElementById('tower-selector-list');
    if (!list) return;
    list.innerHTML = '';

    BALANCE.TOWERS.forEach((tower) => {
      const btn = document.createElement('div');
      const isSelected = (this.selectedTowerToBuild === tower);
      btn.className = `tower-btn ${isSelected ? 'selected' : ''}`;
      btn.innerHTML = `
        <div class="tower-btn-left">
          <div class="tower-color-dot" style="background-color: ${tower.color}; color: ${tower.color};"></div>
          <span class="tower-btn-name">${tower.name}</span>
        </div>
        <span class="tower-btn-cost">🪙 ${tower.cost}</span>
      `;

      btn.addEventListener('click', () => {
        this.sound.init();
        if (this.selectedTowerToBuild === tower) {
          this.clearBuildSelection();
        } else {
          this.selectedTowerToBuild = tower;
          this.selectedEntity = null;
          this.canvas.style.cursor = 'crosshair';
          this.renderTowerSelector();
          this.showTowerInspectCard(tower);
        }
      });

      list.appendChild(btn);
    });

    if (this.selectedTowerToBuild) {
      this.showTowerInspectCard(this.selectedTowerToBuild);
    }
  }

  renderCreepButtons() {
    const grid = document.getElementById('creep-buttons-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const tierBadge = document.getElementById('current-tier-badge');
    if (tierBadge) tierBadge.innerText = `ТИР ${this.player.tier}`;

    this.player.creepSlots.forEach((slot, idx) => {
      const btn = document.createElement('button');
      btn.className = 'creep-btn';
      btn.dataset.slot = String(idx);

      const incSign = slot.def.income >= 0 ? `+${slot.def.income}` : `${slot.def.income}`;

      btn.innerHTML = `
        <div class="creep-radial-cooldown" style="--cd-angle: 0deg;"></div>
        <div class="creep-cd-timer-text" style="display: none;"></div>
        <span class="creep-charge-badge">${slot.charges}/10</span>
        <span class="creep-btn-icon">${slot.def.icon}</span>
        <span class="creep-btn-name">${slot.def.name}</span>
        <div class="creep-btn-meta">
          <span class="creep-btn-cost">🪙${slot.def.cost}</span>
          <span class="creep-btn-income">${incSign}</span>
        </div>
      `;

      btn.addEventListener('mouseenter', () => this.showCreepHoverDetails(slot.def));
      btn.addEventListener('click', () => {
        this.sound.init();
        this.sendCreepAction(idx);
      });

      grid.appendChild(btn);
    });

    if (this.player.tier < 3) {
      const upgradeCost = BALANCE.TIER_UPGRADE_COSTS[this.player.tier - 1];
      const upgradeBtn = document.createElement('button');
      upgradeBtn.className = 'btn-tier-upgrade';
      upgradeBtn.disabled = this.player.gold < upgradeCost;
      upgradeBtn.innerHTML = `
        <span>🌟 Апгрейд до ТИР ${this.player.tier + 1}</span>
        <span>🪙 ${upgradeCost}</span>
      `;
      upgradeBtn.addEventListener('click', () => {
        this.sound.init();
        this.upgradeTierAction();
      });
      grid.appendChild(upgradeBtn);
    } else {
      const maxTierBadge = document.createElement('div');
      maxTierBadge.className = 'btn-tier-upgrade';
      maxTierBadge.style.background = '#334155';
      maxTierBadge.innerHTML = `<span>👑 Максимальный ТИР 3</span>`;
      grid.appendChild(maxTierBadge);
    }

    this.updateCreepUIRealtime();
  }

  updateCreepUIRealtime() {
    const buttons = document.querySelectorAll('.creep-btn[data-slot]');
    buttons.forEach(btn => {
      const idx = Number(btn.dataset.slot);
      const slot = this.player.creepSlots[idx];
      if (!slot) return;

      const radial = btn.querySelector('.creep-radial-cooldown');
      const timerText = btn.querySelector('.creep-cd-timer-text');
      const badge = btn.querySelector('.creep-charge-badge');

      const isAffordable = (this.player.gold >= slot.def.cost);

      if (slot.initialCooldownRemaining > 0) {
        // Initial Unlock Countdown (Clockwise Sweep)
        const total = slot.def.initCd || 1;
        const progress = Math.min(1, Math.max(0, slot.initialCooldownRemaining / total));
        const angle = Math.round(progress * 360);
        if (radial) radial.style.setProperty('--cd-angle', `${angle}deg`);
        if (timerText) {
          timerText.style.display = 'flex';
          timerText.innerText = `${slot.initialCooldownRemaining.toFixed(1)}s`;
        }
        if (badge) {
          badge.innerText = `0/10`;
          badge.classList.remove('ready');
        }
        btn.disabled = true;
      } else {
        // Unlocked!
        if (slot.charges === 0) {
          // Accumulating first charge
          const total = slot.def.stackInterval;
          const remaining = total - slot.stackTimer;
          const progress = Math.min(1, Math.max(0, remaining / total));
          const angle = Math.round(progress * 360);
          if (radial) radial.style.setProperty('--cd-angle', `${angle}deg`);
          if (timerText) {
            timerText.style.display = 'flex';
            timerText.innerText = `${remaining.toFixed(1)}s`;
          }
          if (badge) {
            badge.innerText = `0/10`;
            badge.classList.remove('ready');
          }
          btn.disabled = true;
        } else {
          // Has 1..10 charges
          if (radial) radial.style.setProperty('--cd-angle', `0deg`);
          if (timerText) timerText.style.display = 'none';
          if (badge) {
            badge.innerText = `${slot.charges}/10`;
            badge.classList.add('ready');
          }
          btn.disabled = !isAffordable;
        }
      }
    });
  }

  showCreepHoverDetails(creepDef) {
    const box = document.getElementById('creep-hover-details');
    if (!box) return;
    const reduction = Math.round(BALANCE.getArmorDamageReduction(creepDef.armor) * 100);
    const paybackTicks = creepDef.income > 0 ? Math.ceil(creepDef.cost / creepDef.income) : 'Штрафной крип';
    const bounty = creepDef.bounty !== undefined ? creepDef.bounty : (creepDef.income > 0 ? creepDef.income : Math.round(creepDef.cost * 0.075));

    box.innerHTML = `
      <div class="stat-row"><span>Название:</span><span>${creepDef.icon} ${creepDef.name}</span></div>
      <div class="stat-row"><span>Здоровье (HP):</span><span>${creepDef.hp.toLocaleString()}</span></div>
      <div class="stat-row"><span>Броня (Снижение):</span><span>${creepDef.armor} (${reduction}%)</span></div>
      <div class="stat-row"><span>Стоимость / Инком:</span><span>🪙 ${creepDef.cost} / ${creepDef.income >= 0 ? '+' : ''}${creepDef.income}</span></div>
      <div class="stat-row"><span>Награда за убийство:</span><span style="color:#f59e0b;">+🪙 ${bounty}</span></div>
      <div class="stat-row"><span>Окупаемость инкома:</span><span>${paybackTicks} ${typeof paybackTicks === 'number' ? `тиков (~${paybackTicks * 15}с)` : ''}</span></div>
      <div class="stat-row"><span>Скорость движения:</span><span>${creepDef.speed} кл/с</span></div>
    `;
  }

  showTowerInspectCard(towerDef, instance = null) {
    const title = document.getElementById('card-title');
    const tag = document.getElementById('card-type-tag');
    if (title) title.innerText = towerDef.name;
    if (tag) tag.innerText = instance ? `Ур. ${(instance.level || 0) + 1}` : `Цена: 🪙${towerDef.cost}`;

    const details = document.getElementById('card-details');
    const actions = document.getElementById('card-actions');
    if (!details) return;

    details.classList.remove('show-upgrade-preview');

    let nextDef = null;
    if (instance && instance.def && instance.def.upgradeId) {
      nextDef = BALANCE.TOWERS.find(t => t.id === instance.def.upgradeId);
    }

    const curDef = instance ? instance.def : towerDef;

    let dmgDiffHtml = '';
    let spdDiffHtml = '';
    let rngDiffHtml = '';
    let critDiffHtml = '';

    if (nextDef) {
      const dmgDiff = nextDef.damage - curDef.damage;
      const spdDiff = Number((curDef.attackSpeed - nextDef.attackSpeed).toFixed(2));
      const rngDiff = Number((nextDef.range - curDef.range).toFixed(1));
      const critChanceDiff = Math.round((nextDef.critChance - curDef.critChance) * 100);

      dmgDiffHtml = `<span class="upgrade-diff">➜ ${nextDef.damage} (+${dmgDiff})</span>`;
      spdDiffHtml = `<span class="upgrade-diff">➜ ${nextDef.attackSpeed}s (${spdDiff > 0 ? '-' + spdDiff + 's' : '0s'})</span>`;
      rngDiffHtml = `<span class="upgrade-diff">➜ ${nextDef.range} (+${rngDiff})</span>`;
      if (nextDef.critChance > 0 || curDef.critChance > 0) {
        critDiffHtml = `<span class="upgrade-diff">➜ ${Math.round(nextDef.critChance * 100)}% (${critChanceDiff >= 0 ? '+' + critChanceDiff : critChanceDiff}%)</span>`;
      }
    }

    let html = `
      <div class="stat-row">
        <span>Урон за выстрел:</span>
        <span><span class="stat-cur-val">${curDef.damage} ед.</span>${dmgDiffHtml}</span>
      </div>
      <div class="stat-row">
        <span>Скорость атаки:</span>
        <span><span class="stat-cur-val">${curDef.attackSpeed} сек</span>${spdDiffHtml}</span>
      </div>
      <div class="stat-row">
        <span>Радиус поражения:</span>
        <span><span class="stat-cur-val">${curDef.range} кл.</span>${rngDiffHtml}</span>
      </div>
    `;

    if (curDef.critChance > 0 || (nextDef && nextDef.critChance > 0)) {
      const curCrit = Math.round(curDef.critChance * 100);
      html += `
        <div class="stat-row">
          <span>Критический урон:</span>
          <span><span class="stat-cur-val" style="color:#ec4899">${curCrit}% x${curDef.critMultiplier}</span>${critDiffHtml}</span>
        </div>
      `;
    }

    html += `<p style="font-size: 0.72rem; color: #94a3b8; margin-top: 6px; line-height: 1.3;">${curDef.desc}</p>`;

    if (instance) {
      html += `
        <hr style="border-color:#334155; margin: 6px 0;">
        <div class="stat-row"><span>Нанесено урона:</span><span>${instance.totalDamageDealt.toLocaleString()}</span></div>
        <div class="stat-row"><span>Убито крипов:</span><span>${instance.kills}</span></div>
      `;
      if (actions) {
        actions.style.display = 'flex';
        const upBtn = document.getElementById('btn-upgrade-tower');
        if (upBtn) {
          if (towerDef.upgradeId && nextDef) {
            upBtn.style.display = 'block';
            upBtn.innerText = `Апгрейд (🪙 ${towerDef.upgradeCost})`;
            upBtn.onclick = () => {
              this.previewUpgradeTower = null;
              this.upgradeSelectedTower(instance);
            };
            upBtn.onmouseenter = () => {
              this.previewUpgradeTower = nextDef;
              const d = document.getElementById('card-details');
              if (d) d.classList.add('show-upgrade-preview');
              const t = document.getElementById('card-type-tag');
              if (t) t.innerText = `➜ ${nextDef.name}`;
            };
            upBtn.onmouseleave = () => {
              this.previewUpgradeTower = null;
              const d = document.getElementById('card-details');
              if (d) d.classList.remove('show-upgrade-preview');
              const t = document.getElementById('card-type-tag');
              if (t) t.innerText = `Ур. ${(instance.level || 0) + 1}`;
            };
          } else {
            upBtn.style.display = 'none';
            upBtn.onmouseenter = null;
            upBtn.onmouseleave = null;
          }
        }

        const sellBtn = document.getElementById('btn-sell-tower');
        if (sellBtn) {
          const refund = Math.round(towerDef.cost * 0.75);
          sellBtn.innerText = `Продать (+🪙 ${refund})`;
          sellBtn.onclick = () => {
            this.previewUpgradeTower = null;
            this.sellSelectedTower(instance);
          };
        }
      }
    } else {
      if (actions) actions.style.display = 'none';
    }

    details.innerHTML = html;
  }

  upgradeSelectedTower(instance) {
    if (!instance || !instance.def.upgradeId) return;
    const nextDef = BALANCE.TOWERS.find(t => t.id === instance.def.upgradeId);
    if (!nextDef) return;

    if (!this.isCreativeMode) {
      if (this.player.gold < instance.def.upgradeCost) {
        this.logEvent(`⚠️ Недостаточно золота для улучшения (🪙${instance.def.upgradeCost})!`, 'log-leak');
        return;
      }
      this.player.gold -= instance.def.upgradeCost;
    }

    instance.def = nextDef;
    this.sound.build();
    this.logEvent(`⬆️ Башня улучшена до «${nextDef.name}»!`, 'log-income');
    this.showTowerInspectCard(nextDef, instance);
    this.updateHUD();

    if (this.isMultiplayer) {
      this.sendNetAction('UPGRADE_TOWER', { gx: instance.x, gy: instance.y, nextDefId: nextDef.id });
    }
  }

  sellSelectedTower(instance) {
    if (!instance) return;
    const refund = Math.round(instance.def.cost * 0.75);
    this.player.gold += refund;

    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        this.player.grid[instance.y + dy][instance.x + dx] = null;
      }
    }

    const idx = this.player.towers.indexOf(instance);
    if (idx !== -1) this.player.towers.splice(idx, 1);

    this.recalculateCreepPaths(this.player);
    this.selectedEntity = null;
    this.sound.coin();
    this.logEvent(`💰 Башня продана (+🪙${refund})`, 'log-income');

    if (this.isMultiplayer) {
      this.sendNetAction('SELL_TOWER', { gx: instance.x, gy: instance.y });
    }

    const details = document.getElementById('card-details');
    if (details) details.innerHTML = '<p class="placeholder-text">Нажмите на башню или выберите постройку слева.</p>';
    const actions = document.getElementById('card-actions');
    if (actions) actions.style.display = 'none';
    this.updateHUD();
  }

  updateHUD() {
    const goldElem = document.getElementById('player-gold');
    if (goldElem) goldElem.innerText = this.isCreativeMode ? '∞' : Math.floor(this.player.gold);

    const incElem = document.getElementById('player-income');
    if (incElem) incElem.innerText = this.isCreativeMode ? '+∞' : `+${this.player.income}`;

    const livesElem = document.getElementById('player-lives');
    if (livesElem) livesElem.innerText = this.isCreativeMode ? '∞' : `${this.player.lives} / ${BALANCE.MAP.STARTING_LIVES}`;

    const enemyLivesElem = document.getElementById('enemy-lives');
    if (enemyLivesElem) enemyLivesElem.innerText = this.isCreativeMode ? '∞' : `${this.enemy.lives} / ${BALANCE.MAP.STARTING_LIVES}`;

    // Update Path Length Metric Badge (Bottom-Right Corner)
    const agent = this.activeLane === 'player' ? this.player : this.enemy;
    const baseLen = (agent.guidePath && agent.guidePath.length > 0) ? agent.guidePath.length : 0;
    const pathValElem = document.getElementById('path-cells-val');
    const pathDiffElem = document.getElementById('path-diff-val');

    if (pathValElem) {
      pathValElem.innerText = `${baseLen} кл.`;
    }

    if (pathDiffElem) {
      if (this.activeLane === 'player' && this.hoverPreviewGuidePath && this.selectedTowerToBuild) {
        const previewLen = this.hoverPreviewGuidePath.length;
        const diff = previewLen - baseLen;
        if (diff > 0) {
          pathDiffElem.innerText = `➜ ${previewLen} (+${diff})`;
          pathDiffElem.className = 'path-diff diff-positive';
        } else if (diff < 0) {
          pathDiffElem.innerText = `➜ ${previewLen} (${diff})`;
          pathDiffElem.className = 'path-diff diff-negative';
        } else {
          pathDiffElem.innerText = '';
          pathDiffElem.className = 'path-diff';
        }
      } else {
        pathDiffElem.innerText = '';
        pathDiffElem.className = 'path-diff';
      }
    }

    this.renderCreepButtons();
  }

  logEvent(msg, className = '') {
    const log = document.getElementById('battle-log');
    if (!log) return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${className}`;
    const time = Math.floor(this.gameTimeSeconds);
    entry.innerText = `[${time}s] ${msg}`;
    log.appendChild(entry);
    if (log.children.length > 40) {
      log.removeChild(log.firstChild);
    }
  }

  triggerGameOver(isVictory) {
    this.isMatchActive = false;
    const overlay = document.getElementById('canvas-overlay-msg');
    const title = document.getElementById('overlay-title');
    const desc = document.getElementById('overlay-desc');

    if (overlay) overlay.classList.remove('hidden');
    if (title) {
      if (isVictory) {
        title.innerText = '🏆 ПОБЕДА!';
        title.style.color = '#10b981';
      } else {
        title.innerText = '💀 ПОРАЖЕНИЕ!';
        title.style.color = '#ef4444';
      }
    }
    if (desc) {
      if (isVictory) {
        desc.innerText = `Вы победили соперника за ${Math.floor(this.gameTimeSeconds)} секунд!`;
      } else {
        desc.innerText = 'Ваша база уничтожена!';
      }
    }
  }

  // --- 100% UNBLOCKED MQTT WEBSOCKET MULTIPLAYER ---
  connectMqttBroker(roomId, onReadyCallback, onErrorCallback) {
    const brokerUrls = [
      'wss://broker.emqx.io:8084/mqtt',
      'wss://broker.hivemq.com:8884/mqtt'
    ];

    let currentBrokerIdx = 0;
    let isInitialConnect = true;

    const tryConnect = () => {
      const url = brokerUrls[currentBrokerIdx];
      this.roomTopic = `shangotw/room/${roomId}`;

      try {
        if (this.mqttClient) {
          try { this.mqttClient.end(true); } catch (e) {}
        }

        this.mqttClient = mqtt.connect(url, {
          clientId: this.myPlayerId,
          clean: true,
          keepalive: 30,
          connectTimeout: 5000,
          reconnectPeriod: 2000
        });

        this.mqttClient.on('connect', () => {
          this.mqttClient.subscribe(this.roomTopic, { qos: 1 }, (err) => {
            if (!err) {
              if (isInitialConnect) {
                isInitialConnect = false;
                if (onReadyCallback) onReadyCallback();
              } else {
                console.log('🌐 MQTT бесшовно переподключен в фоне.');
                if (this.isMatchActive && !this.isGameOver) {
                  this.sendNetAction('SPEED_VOTE', { speed: this.mySpeedVote });
                  this.sendNetAction('LIVES_SYNC', { lives: this.player.lives });
                }
              }
            }
          });
        });

        this.mqttClient.on('message', (topic, message) => {
          try {
            const data = JSON.parse(message.toString());
            if (data.senderId === this.myPlayerId) return; // ignore own messages
            this.handleIncomingNetMessage(data);
          } catch (e) {
            console.error('MQTT Parse Error:', e);
          }
        });

        this.mqttClient.on('error', (err) => {
          console.warn('Broker failed:', url, err);
          if (currentBrokerIdx < brokerUrls.length - 1) {
            currentBrokerIdx++;
            tryConnect();
          } else if (onErrorCallback) {
            onErrorCallback(err);
          }
        });
      } catch (e) {
        if (onErrorCallback) onErrorCallback(e);
      }
    };

    tryConnect();
  }

  sendNetAction(action, payload = {}) {
    if (this.mqttClient && this.mqttClient.connected && this.roomTopic) {
      const packet = JSON.stringify({
        senderId: this.myPlayerId,
        action: action,
        payload: payload,
        timestamp: Date.now()
      });
      this.mqttClient.publish(this.roomTopic, packet, { qos: 1 });
    }
  }

  handleIncomingNetMessage(data) {
    if (!data || !data.action) return;

    switch (data.action) {
      case 'GUEST_JOINED': {
        if (this.isHost) {
          if (this.isMatchActive && !this.isGameOver) {
            console.log('Игнорирован повторный GUEST_JOINED во время активного матча');
            this.sendNetAction('SPEED_VOTE', { speed: this.mySpeedVote });
            this.sendNetAction('LIVES_SYNC', { lives: this.player.lives });
            return;
          }
          this.sendNetAction('MATCH_START', { hostId: this.myPlayerId });
          const modal = document.getElementById('mp-modal');
          if (modal) modal.classList.add('hidden');
          this.startMultiplayerSession(true);
        }
        break;
      }

      case 'MATCH_START': {
        if (this.isMatchActive && !this.isGameOver) {
          console.log('Игнорирован повторный MATCH_START во время активного матча');
          return;
        }
        const modal = document.getElementById('mp-modal');
        if (modal) modal.classList.add('hidden');
        this.startMultiplayerSession(false);
        break;
      }

      case 'BUILD_TOWER': {
        const towerDef = BALANCE.TOWERS.find(t => t.id === data.payload.towerId);
        if (towerDef) {
          this.placeTower(this.enemy, data.payload.gx, data.payload.gy, towerDef, false, false);
          this.logEvent(`🔨 Соперник построил: ${towerDef.name}`, 'log-income');
        }
        break;
      }

      case 'UPGRADE_TOWER': {
        const targetTower = this.enemy.grid[data.payload.gy] && this.enemy.grid[data.payload.gy][data.payload.gx];
        const nextDef = BALANCE.TOWERS.find(t => t.id === data.payload.nextDefId);
        if (targetTower && nextDef) {
          targetTower.def = nextDef;
          this.logEvent(`⬆️ Соперник улучшил башню до «${nextDef.name}»!`, 'log-income');
        }
        break;
      }

      case 'SELL_TOWER': {
        const targetTower = this.enemy.grid[data.payload.gy] && this.enemy.grid[data.payload.gy][data.payload.gx];
        if (targetTower) {
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              this.enemy.grid[targetTower.y + dy][targetTower.x + dx] = null;
            }
          }
          const idx = this.enemy.towers.indexOf(targetTower);
          if (idx !== -1) this.enemy.towers.splice(idx, 1);
          this.recalculateCreepPaths(this.enemy);
          this.logEvent(`💰 Соперник продал башню.`, 'log-income');
        }
        break;
      }

      case 'SEND_CREEP': {
        const creepList = BALANCE.CREEPS_BY_TIER[data.payload.tier] || BALANCE.CREEPS_BY_TIER[1];
        const creepDef = creepList[data.payload.slotIndex];
        if (creepDef) {
          this.spawnCreep(this.enemy, this.player, creepDef);
          this.logEvent(`⚠️ Соперник отправил на вас ${creepDef.name}!`, 'log-leak');
          this.sound.leak();
        }
        break;
      }

      case 'TIER_UPGRADE': {
        this.enemy.tier = data.payload.tier;
        this.initCreepSlots(this.enemy);
        this.logEvent(`🌟 Соперник перешел на ТИР ${data.payload.tier}!`, 'log-kill');
        break;
      }

      case 'LIVES_SYNC': {
        this.enemy.lives = data.payload.lives;
        this.updateHUD();
        break;
      }

      case 'SPEED_VOTE': {
        this.enemySpeedVote = Number(data.payload.speed) || 1;
        this.recalculateEffectiveSpeed();
        this.logEvent(`⚡ Соперник выбрал скорость ${this.enemySpeedVote}x (Итоговая: ${this.gameSpeed}x)`, 'log-income');
        break;
      }
    }
  }

  initMultiplayerUI() {
    const btnMp = document.getElementById('btn-multiplayer');
    const modal = document.getElementById('mp-modal');
    const btnClose = document.getElementById('mp-btn-close');

    const tabHost = document.getElementById('mp-tab-host');
    const tabJoin = document.getElementById('mp-tab-join');
    const viewHost = document.getElementById('mp-view-host');
    const viewJoin = document.getElementById('mp-view-join');

    const btnCreateRoom = document.getElementById('mp-btn-create-room');
    const hostCodeBox = document.getElementById('mp-host-code-box');
    const hostCodeText = document.getElementById('mp-host-code');
    const btnCopyCode = document.getElementById('mp-btn-copy-code');
    const hostStatus = document.getElementById('mp-host-status');

    const joinInput = document.getElementById('mp-join-input');
    const btnConnect = document.getElementById('mp-btn-connect');
    const joinStatus = document.getElementById('mp-join-status');

    if (btnMp && modal) {
      btnMp.addEventListener('click', () => {
        this.sound.init();
        modal.classList.remove('hidden');
      });
    }

    if (btnClose && modal) {
      btnClose.addEventListener('click', () => {
        modal.classList.add('hidden');
      });
    }

    if (tabHost && tabJoin && viewHost && viewJoin) {
      tabHost.addEventListener('click', () => {
        tabHost.classList.add('active');
        tabJoin.classList.remove('active');
        viewHost.classList.remove('hidden');
        viewJoin.classList.add('hidden');
      });

      tabJoin.addEventListener('click', () => {
        tabJoin.classList.add('active');
        tabHost.classList.remove('active');
        viewJoin.classList.remove('hidden');
        viewHost.classList.add('hidden');
      });
    }

    // Create Room (Host)
    if (btnCreateRoom) {
      btnCreateRoom.addEventListener('click', () => {
        this.sound.init();
        const code = String(Math.floor(1000 + Math.random() * 9000));
        this.isHost = true;

        btnCreateRoom.style.display = 'none';
        if (hostCodeBox) hostCodeBox.classList.remove('hidden');
        if (hostCodeText) hostCodeText.innerText = code;
        if (hostStatus) hostStatus.innerText = 'Подключение к глобальной сети...';

        this.connectMqttBroker(
          code,
          () => {
            if (hostStatus) hostStatus.innerText = 'Комната готова! Ожидание входа второго игрока...';
          },
          (err) => {
            if (hostStatus) {
              hostStatus.innerText = 'Ошибка сети. Попробуйте еще раз.';
              hostStatus.style.color = '#ef4444';
            }
          }
        );
      });
    }

    if (btnCopyCode && hostCodeText) {
      btnCopyCode.addEventListener('click', () => {
        const code = hostCodeText.innerText;
        navigator.clipboard.writeText(code);
        btnCopyCode.innerText = '✅ Скопировано!';
        setTimeout(() => { btnCopyCode.innerText = '📋 Скопировать'; }, 2000);
      });
    }

    // Join Room (Guest)
    if (btnConnect && joinInput && joinStatus) {
      btnConnect.addEventListener('click', () => {
        this.sound.init();
        const code = joinInput.value.trim().replace(/[^0-9]/g, '');
        if (code.length < 4) {
          joinStatus.innerText = 'Введите 4-значный номер комнаты!';
          joinStatus.style.color = '#ef4444';
          return;
        }

        this.isHost = false;
        joinStatus.innerText = 'Вход в комнату и поиск хоста...';
        joinStatus.style.color = '#38bdf8';

        this.connectMqttBroker(
          code,
          () => {
            joinStatus.innerText = 'Связь установлена! Запуск матча...';
            this.sendNetAction('GUEST_JOINED', { guestId: this.myPlayerId });
          },
          (err) => {
            joinStatus.innerText = 'Не удалось подключиться к комнате.';
            joinStatus.style.color = '#ef4444';
          }
        );
      });
    }
  }

  startMultiplayerSession(isHost) {
    this.isMultiplayer = true;
    this.isHost = isHost;
    this.isGameOver = false;
    this.isMatchActive = true;
    this.gameTimeSeconds = 0;
    this.incomeTimer = BALANCE.MAP.INCOME_INTERVAL_SEC;

    // Reset boards for clean match
    this.player.towers = [];
    this.player.grid = Array.from({ length: this.height }, () => Array(this.width).fill(null));
    this.player.creeps = [];
    this.player.gold = BALANCE.MAP.STARTING_GOLD;
    this.player.income = BALANCE.MAP.STARTING_INCOME;
    this.player.lives = BALANCE.MAP.STARTING_LIVES;
    this.player.tier = 1;

    this.enemy.towers = [];
    this.enemy.grid = Array.from({ length: this.height }, () => Array(this.width).fill(null));
    this.enemy.creeps = [];
    this.enemy.gold = BALANCE.MAP.STARTING_GOLD;
    this.enemy.income = BALANCE.MAP.STARTING_INCOME;
    this.enemy.lives = BALANCE.MAP.STARTING_LIVES;
    this.enemy.tier = 1;

    this.projectiles = [];
    this.particles = [];
    this.floatingTexts = [];

    this.initCreepSlots(this.player);
    this.initCreepSlots(this.enemy);

    const overlay = document.getElementById('canvas-overlay-msg');
    if (overlay) overlay.classList.add('hidden');

    const modeBadge = document.getElementById('game-mode-badge');
    if (modeBadge) {
      modeBadge.innerText = isHost ? '👑 1v1 PvP (Хост)' : '🎮 1v1 PvP (Клиент)';
      modeBadge.style.background = '#10b981';
      modeBadge.style.color = '#fff';
    }

    const enemyLabel = document.getElementById('enemy-label');
    if (enemyLabel) enemyLabel.innerText = 'БАЗА СОПЕРНИКА';

    this.sound.crit();
    this.logEvent(`🌐 ПОДКЛЮЧЕНО! Начался реальный PvP 1v1 матч по сети!`, 'log-kill');
    this.updateHUD();
    this.recalculateEffectiveSpeed();

    this.hoverPreviewGuidePath = null;
    this.recalculateCreepPaths(this.player);
    this.recalculateCreepPaths(this.enemy);

    // Sync initial speed choice
    this.sendNetAction('SPEED_VOTE', { speed: this.mySpeedVote });
  }

  getCanvasMousePos(e, applyCamera = true) {
    const rect = this.canvas.getBoundingClientRect();
    const canvasAspect = this.canvas.width / this.canvas.height; // 840 / 792 = 1.060606
    const elemAspect = rect.width / rect.height;

    let actualWidth = rect.width;
    let actualHeight = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (elemAspect > canvasAspect) {
      actualWidth = rect.height * canvasAspect;
      offsetX = (rect.width - actualWidth) / 2;
    } else if (elemAspect < canvasAspect) {
      actualHeight = rect.width / canvasAspect;
      offsetY = (rect.height - actualHeight) / 2;
    }

    const clientX = e.clientX - rect.left - offsetX;
    const clientY = e.clientY - rect.top - offsetY;

    let mx = (clientX / actualWidth) * this.canvas.width;
    let my = (clientY / actualHeight) * this.canvas.height;

    if (applyCamera && this.camera && this.camera.zoom) {
      mx = (mx - this.camera.x) / this.camera.zoom;
      my = (my - this.camera.y) / this.camera.zoom;
    }

    return {
      mx: Math.max(0, Math.min(this.canvas.width, mx)),
      my: Math.max(0, Math.min(this.canvas.height, my))
    };
  }

  bindEvents() {
    // Mouse Wheel Zoom (centered around mouse cursor)
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const newZoom = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, this.camera.zoom * zoomFactor));

      if (Math.abs(newZoom - this.camera.zoom) > 0.001) {
        const screenPos = this.getCanvasMousePos(e, false);
        const worldX = (screenPos.mx - this.camera.x) / this.camera.zoom;
        const worldY = (screenPos.my - this.camera.y) / this.camera.zoom;

        this.camera.zoom = newZoom;
        this.camera.x = screenPos.mx - worldX * this.camera.zoom;
        this.camera.y = screenPos.my - worldY * this.camera.zoom;
        this.clampCamera();

        const { mx, my } = this.getCanvasMousePos(e, true);
        this.mouseGridPos.x = Math.max(0, Math.min(this.width - 2, Math.round(mx / this.cellSize) - 1));
        this.mouseGridPos.y = Math.max(0, Math.min(this.height - 2, Math.round(my / this.cellSize) - 1));
      }
    }, { passive: false });

    // Double-click to reset zoom to 1.0x
    this.canvas.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this.camera.zoom = 1.0;
      this.camera.x = 0;
      this.camera.y = 0;
    });

    // Panning with Middle or Right Drag when zoomed in
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 2 && this.camera.zoom > 1.0)) {
        this.camera.isDragging = true;
        this.camera.dragStartX = e.clientX;
        this.camera.dragStartY = e.clientY;
        this.camera.startCamX = this.camera.x;
        this.camera.startCamY = this.camera.y;
        this.camera.hasDragged = false;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.camera.isDragging) {
        const dx = e.clientX - this.camera.dragStartX;
        const dy = e.clientY - this.camera.dragStartY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          this.camera.hasDragged = true;
        }
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        this.camera.x = this.camera.startCamX + dx * scaleX;
        this.camera.y = this.camera.startCamY + dy * scaleY;
        this.clampCamera();
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.camera.isDragging) {
        this.camera.isDragging = false;
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const { mx, my } = this.getCanvasMousePos(e, true);

      // Center the 2x2 tower exactly under the mouse cursor crosshair
      this.mouseGridPos.x = Math.max(0, Math.min(this.width - 2, Math.round(mx / this.cellSize) - 1));
      this.mouseGridPos.y = Math.max(0, Math.min(this.height - 2, Math.round(my / this.cellSize) - 1));

      // 1x1 grid cell coordinates for selecting/clicking existing objects
      this.rawMouseGridPos = {
        x: Math.max(0, Math.min(this.width - 1, Math.floor(mx / this.cellSize))),
        y: Math.max(0, Math.min(this.height - 1, Math.floor(my / this.cellSize)))
      };
      this.isHoveringCanvas = true;

      // Real-time dynamic route preview when hovering a tower placement
      if (this.activeLane === 'player' && this.selectedTowerToBuild) {
        const buildGx = this.mouseGridPos.x;
        const buildGy = this.mouseGridPos.y;
        if (buildGx !== this.lastHoverGx || buildGy !== this.lastHoverGy) {
          this.lastHoverGx = buildGx;
          this.lastHoverGy = buildGy;
          if (this.canPlaceTower(this.player, buildGx, buildGy)) {
            const simulatedBlocked = (x, y) => ((x === buildGx || x === buildGx + 1) && (y === buildGy || y === buildGy + 1)) || this.isCellBlocked(this.player, x, y);
            this.hoverPreviewGuidePath = this.pathfinder.findMultiWaypointPath(BALANCE.MAP.WAYPOINT_COORDS, simulatedBlocked);
          } else {
            this.hoverPreviewGuidePath = null;
          }
          this.updateHUD();
        }
      } else if (this.hoverPreviewGuidePath !== null) {
        this.hoverPreviewGuidePath = null;
        this.updateHUD();
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isHoveringCanvas = false;
      this.hoverPreviewGuidePath = null;
      this.lastHoverGx = -1;
      this.lastHoverGy = -1;
      this.updateHUD();
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.camera.hasDragged) {
        this.camera.hasDragged = false;
        return;
      }
      this.sound.init();
      if (this.selectedTowerToBuild !== null) {
        this.clearBuildSelection();
      } else if (this.selectedEntity !== null) {
        this.selectedEntity = null;
        this.previewUpgradeTower = null;
        const details = document.getElementById('card-details');
        if (details) details.innerHTML = '<p class="placeholder-text">Нажмите на башню для просмотра характеристик или выберите постройку слева.</p>';
        const actions = document.getElementById('card-actions');
        if (actions) actions.style.display = 'none';
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.camera.zoom > 1.01) {
          this.camera.zoom = 1.0;
          this.camera.x = 0;
          this.camera.y = 0;
        }
        this.clearBuildSelection();
        this.selectedEntity = null;
        this.previewUpgradeTower = null;
        const details = document.getElementById('card-details');
        if (details) details.innerHTML = '<p class="placeholder-text">Нажмите на башню для просмотра характеристик или выберите постройку слева.</p>';
        const actions = document.getElementById('card-actions');
        if (actions) actions.style.display = 'none';
      }
    });

    this.canvas.addEventListener('click', (e) => {
      if (this.camera.hasDragged) {
        this.camera.hasDragged = false;
        return;
      }
      this.sound.init();
      if (this.activeLane !== 'player') return;

      const { mx, my } = this.getCanvasMousePos(e, true);
      const rawGx = Math.max(0, Math.min(this.width - 1, Math.floor(mx / this.cellSize)));
      const rawGy = Math.max(0, Math.min(this.height - 1, Math.floor(my / this.cellSize)));

      const existingTower = this.player.grid[rawGy] && this.player.grid[rawGy][rawGx];
      if (existingTower) {
        this.selectedEntity = existingTower;
        this.clearBuildSelection();
        this.showTowerInspectCard(existingTower.def, existingTower);
        return;
      }

      if (this.selectedTowerToBuild) {
        const buildGx = Math.max(0, Math.min(this.width - 2, Math.round(mx / this.cellSize) - 1));
        const buildGy = Math.max(0, Math.min(this.height - 2, Math.round(my / this.cellSize) - 1));
        const success = this.placeTower(this.player, buildGx, buildGy, this.selectedTowerToBuild, true, true);
        if (success) {
          this.selectedEntity = this.player.grid[buildGy][buildGx];
          this.previewUpgradeTower = null;
          this.showTowerInspectCard(this.selectedTowerToBuild, this.selectedEntity);
        } else {
          this.sound.leak();
          this.logEvent("⚠️ Нельзя строить здесь (стена, контрольные точки или блокировка маршрута)!", 'log-leak');
        }
      } else {
        this.selectedEntity = null;
        this.previewUpgradeTower = null;
        const details = document.getElementById('card-details');
        if (details) details.innerHTML = '<p class="placeholder-text">Нажмите на башню для просмотра характеристик или выберите постройку слева.</p>';
        const actions = document.getElementById('card-actions');
        if (actions) actions.style.display = 'none';
      }
    });

    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.mySpeedVote = Number(btn.dataset.speed);
        this.recalculateEffectiveSpeed();
        this.logEvent(`⚡ Вы выбрали скорость ${this.mySpeedVote}x (Итоговая скорость игры: ${this.gameSpeed}x)`, 'log-income');
        if (this.isMultiplayer) {
          this.sendNetAction('SPEED_VOTE', { speed: this.mySpeedVote });
        }
      });
    });

    const overlayRestartBtn = document.getElementById('overlay-btn-restart');
    if (overlayRestartBtn) {
      overlayRestartBtn.addEventListener('click', () => location.reload());
    }

    const tabPlayer = document.getElementById('tab-player-lane');
    const tabEnemy = document.getElementById('tab-enemy-lane');

    if (tabPlayer && tabEnemy) {
      tabPlayer.addEventListener('click', () => {
        this.activeLane = 'player';
        tabPlayer.classList.add('active');
        tabEnemy.classList.remove('active');
      });

      tabEnemy.addEventListener('click', () => {
        this.activeLane = 'enemy';
        tabEnemy.classList.add('active');
        tabPlayer.classList.remove('active');
      });
    }

    const clearLogBtn = document.getElementById('btn-clear-log');
    if (clearLogBtn) {
      clearLogBtn.addEventListener('click', () => {
        const battleLog = document.getElementById('battle-log');
        if (battleLog) battleLog.innerHTML = '';
      });
    }

    // Creative Mode ("Мелофон") Button Listeners with Password Prompt
    const handleCreativePasswordPrompt = () => {
      this.sound.init();
      const pwd = window.prompt('Введите секретный пароль для активации Креативного режима:');
      if (pwd === null) return;
      const clean = pwd.trim().toLowerCase();
      if (clean === 'melafon' || clean === 'мелафон' || clean === 'мелофон' || clean === 'melofon') {
        this.startCreativeMode();
      } else {
        this.sound.leak();
        window.alert('❌ Неверный пароль! Доступ запрещен.');
      }
    };

    const btnCreative = document.getElementById('btn-creative-mode');
    if (btnCreative) {
      btnCreative.addEventListener('click', handleCreativePasswordPrompt);
    }

    const mpBtnCreative = document.getElementById('mp-btn-creative-mode');
    if (mpBtnCreative) {
      mpBtnCreative.addEventListener('click', handleCreativePasswordPrompt);
    }

    // Secret Word Keyboard Listener ("melafon" / "мелафон" / "мелофон" / "melofon")
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (e.key && e.key.length === 1) {
        this.secretCodeBuffer = (this.secretCodeBuffer + e.key.toLowerCase()).slice(-10);
        if (
          this.secretCodeBuffer.includes('melafon') ||
          this.secretCodeBuffer.includes('мелафон') ||
          this.secretCodeBuffer.includes('мелофон') ||
          this.secretCodeBuffer.includes('melofon')
        ) {
          this.secretCodeBuffer = '';
          this.startCreativeMode();
        }
      }
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.gameInstance = new TowerWarsGame();
});
