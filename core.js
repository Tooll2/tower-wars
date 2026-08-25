/**
 * Tower Wars - Headless Game Simulation Core (Authoritative Game Engine)
 * Pure JavaScript module: 0 DOM/Canvas/Audio dependencies.
 * Runs seamlessly on Node.js server and browser clients.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Node.js CommonJS
    const balanceModule = require('./balance.js');
    const pathfinderModule = require('./pathfinding.js');
    module.exports = factory(balanceModule.BALANCE, pathfinderModule.PathFinder);
  } else {
    // Browser global
    root.TowerWarsCore = factory(root.BALANCE, root.PathFinder);
  }
}(typeof self !== 'undefined' ? self : this, function (BALANCE, PathFinder) {
  'use strict';

  class GameMatch {
    constructor(options = {}) {
      this.width = BALANCE.MAP_CONFIG.WIDTH;
      this.height = BALANCE.MAP_CONFIG.HEIGHT;
      this.pathfinder = new PathFinder(this.width, this.height);

      this.mapId = options.mapId || 'classic';
      this.activeMap = BALANCE.MAPS.find(m => m.id === this.mapId) || BALANCE.MAPS[0];

      this.gameState = 'PREPARATION'; // 'PREPARATION' | 'BATTLE' | 'GAME_OVER'
      this.prepTimer = (this.activeMap && this.activeMap.prepTimeSec) ? this.activeMap.prepTimeSec : 60;
      this.gameTime = 0;
      this.incomeTimer = BALANCE.MAP_CONFIG.INCOME_INTERVAL_SEC;

      this.tick = 0;
      this.gameSpeed = 1;
      this.winnerId = null;

      this.placedCustomWalls = [];

      // Players
      this.players = {
        p1: this._createPlayerState(options.p1Id || 'p1', options.p1Name || 'Игрок 1'),
        p2: this._createPlayerState(options.p2Id || 'p2', options.p2Name || 'Игрок 2')
      };

      this.projectiles = [];
      this.events = []; // Transient combat & game events per tick

      // Calculate initial paths
      this.recalculateCreepPaths('p1');
      this.recalculateCreepPaths('p2');
    }

    _createPlayerState(id, name) {
      const grid = [];
      for (let y = 0; y < this.height; y++) {
        const row = new Array(this.width).fill(null);
        grid.push(row);
      }

      const pState = {
        id: id,
        name: name,
        raceId: 'race_humans',
        mapVote: this.mapId,
        speedVote: 1,
        ready: false,
        gold: BALANCE.MAP_CONFIG.STARTING_GOLD,
        income: BALANCE.MAP_CONFIG.STARTING_INCOME,
        lives: BALANCE.MAP_CONFIG.STARTING_LIVES,
        tier: 1,
        grid: grid,
        towers: [],
        creeps: [],
        creepSlots: [],
        guidePath: null
      };

      this._initCreepSlots(pState);
      return pState;
    }

    _initCreepSlots(player) {
      const tierData = BALANCE.CREEPS_BY_TIER[player.tier] || BALANCE.CREEPS_BY_TIER[1];
      player.creepSlots = tierData.map((creepDef, idx) => ({
        index: idx,
        def: creepDef,
        charges: 0,
        initialCooldownRemaining: creepDef.initCd || 0,
        stackTimer: 0
      }));
    }

    getPlayer(playerId) {
      if (this.players.p1.id === playerId) return this.players.p1;
      if (this.players.p2.id === playerId) return this.players.p2;
      return null;
    }

    getOpponent(playerId) {
      if (this.players.p1.id === playerId) return this.players.p2;
      if (this.players.p2.id === playerId) return this.players.p1;
      return null;
    }

    getBlockSubRects(block, gx, gy) {
      const baseGx = (gx !== undefined) ? gx : block.x;
      const baseGy = (gy !== undefined) ? gy : block.y;
      if (block.subBlocks && block.subBlocks.length > 0) {
        return block.subBlocks.map(s => ({
          x: baseGx + s.dx,
          y: baseGy + s.dy,
          w: s.w,
          h: s.h
        }));
      }
      return [{
        x: baseGx,
        y: baseGy,
        w: block.w,
        h: block.h
      }];
    }

    isPermanentWall(x, y) {
      let walls = (this.activeMap && this.activeMap.walls) ? [...this.activeMap.walls] : [];
      if (this.placedCustomWalls && this.placedCustomWalls.length > 0) {
        walls = walls.concat(this.placedCustomWalls);
      }
      if (walls.length === 0 && (!this.activeMap || !this.activeMap.isCustom)) {
        walls = [BALANCE.MAP.MIDDLE_WALL];
      }

      for (const wall of walls) {
        const rects = this.getBlockSubRects(wall);
        for (const r of rects) {
          if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
            return true;
          }
        }
      }
      return false;
    }

    isSpecialNoBuildZone(x, y) {
      const zones = (this.activeMap && this.activeMap.zones) ? this.activeMap.zones : [
        BALANCE.MAP.SPAWN_ZONE,
        BALANCE.MAP.WAYPOINT_1,
        BALANCE.MAP.WAYPOINT_2,
        BALANCE.MAP.EXIT_ZONE
      ];

      for (const z of zones) {
        if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) {
          return true;
        }
      }
      return false;
    }

    isCellBlocked(playerKeyOrObj, x, y) {
      const player = typeof playerKeyOrObj === 'string' ? this.getPlayer(playerKeyOrObj) : playerKeyOrObj;
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return true;
      if (this.isPermanentWall(x, y)) return true;
      return player ? (player.grid[y][x] !== null) : false;
    }

    canPlaceTower(playerKeyOrObj, gx, gy) {
      const player = typeof playerKeyOrObj === 'string' ? this.getPlayer(playerKeyOrObj) : playerKeyOrObj;
      if (!player) return false;
      if (gx < 0 || gx + 1 >= this.width || gy < 0 || gy + 1 >= this.height) return false;

      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const cx = gx + dx;
          const cy = gy + dy;
          if (this.isSpecialNoBuildZone(cx, cy)) return false;
          if (player.grid[cy][cx] !== null) return false;
        }
      }

      const simulatedBlocked = (x, y) => {
        if ((x === gx || x === gx + 1) && (y === gy || y === gy + 1)) return true;
        return this.isCellBlocked(player, x, y);
      };

      const waypoints = (this.activeMap && this.activeMap.waypointCoords) ? this.activeMap.waypointCoords : BALANCE.MAP.WAYPOINT_COORDS;
      const fullCircuit = this.pathfinder.findMultiWaypointPath(waypoints, simulatedBlocked);
      if (!fullCircuit) return false;

      // Fast check: Verify all creeps have a valid route to their next target waypoint
      for (const creep of player.creeps) {
        const curStage = creep.currentWaypointStage || 1;
        const targetWp = waypoints[curStage];
        if (!targetWp) continue;
        const curPos = { x: Math.round(creep.x), y: Math.round(creep.y) };
        const path = this.pathfinder.findPath(curPos.x, curPos.y, targetWp.x, targetWp.y, simulatedBlocked);
        if (!path) return false;
      }

      return true;
    }

    recalculateCreepPaths(playerKeyOrObj) {
      const player = typeof playerKeyOrObj === 'string' ? this.getPlayer(playerKeyOrObj) : playerKeyOrObj;
      if (!player) return;

      const waypoints = (this.activeMap && this.activeMap.waypointCoords) ? this.activeMap.waypointCoords : BALANCE.MAP.WAYPOINT_COORDS;
      const isBlocked = (x, y) => this.isCellBlocked(player, x, y);

      player.guidePath = this.pathfinder.findMultiWaypointPath(waypoints, isBlocked);
      if (!player.guidePath) return;

      const segments = player.guidePath.segments || [];

      for (const creep of player.creeps) {
        const curStage = creep.currentWaypointStage || 1;
        const curTargetWp = waypoints[curStage];
        if (!curTargetWp) continue;

        const curX = Math.round(creep.x);
        const curY = Math.round(creep.y);
        const toWp = this.pathfinder.findPath(curX, curY, Math.round(curTargetWp.x), Math.round(curTargetWp.y), isBlocked);

        if (toWp && toWp.length > 0) {
          const stitched = [...toWp];
          for (let s = curStage; s < segments.length; s++) {
            const seg = segments[s];
            if (seg) {
              for (let k = 1; k < seg.length; k++) {
                stitched.push(seg[k]);
              }
            }
          }
          creep.path = stitched;
          creep.pathIndex = 0;
        }
      }
    }

    setMap(mapId) {
      const mapDef = BALANCE.MAPS.find(m => m.id === mapId);
      if (!mapDef) return false;
      this.mapId = mapId;
      this.activeMap = mapDef;
      this.placedCustomWalls = [];
      this.recalculateCreepPaths('p1');
      this.recalculateCreepPaths('p2');
      return true;
    }

    startBattlePhase(resolvedMapId = null) {
      this.gameState = 'BATTLE';
      this.gameTime = 0;
      this.incomeTimer = BALANCE.MAP_CONFIG.INCOME_INTERVAL_SEC;

      let finalMapId = resolvedMapId;
      if (!finalMapId) {
        if (this.players.p1.mapVote === this.players.p2.mapVote) {
          finalMapId = this.players.p1.mapVote;
        } else {
          const pool = [this.players.p1.mapVote, this.players.p2.mapVote];
          finalMapId = pool[Math.floor(Math.random() * 2)];
        }
      }

      this.setMap(finalMapId);
      this.events.push({ type: 'BATTLE_STARTED', mapId: this.mapId });
    }

    // --- Command Handling ---
    handleAction(playerId, action, payload = {}) {
      const player = this.getPlayer(playerId);
      if (!player) return { success: false, reason: 'PLAYER_NOT_FOUND' };

      const opponent = this.getOpponent(playerId);

      switch (action) {
        case 'MAP_VOTE': {
          if (this.gameState !== 'PREPARATION') return { success: false, reason: 'NOT_IN_PREPARATION' };
          const mapDef = BALANCE.MAPS.find(m => m.id === payload.mapId);
          if (!mapDef) return { success: false, reason: 'INVALID_MAP' };
          player.mapVote = payload.mapId;
          return { success: true };
        }

        case 'RACE_SELECT': {
          if (this.gameState !== 'PREPARATION') return { success: false, reason: 'NOT_IN_PREPARATION' };
          const race = (BALANCE.CHARACTERS || []).find(c => c.id === payload.raceId);
          if (!race) return { success: false, reason: 'INVALID_RACE' };
          player.raceId = payload.raceId;
          return { success: true };
        }

        case 'READY_VOTE': {
          if (this.gameState !== 'PREPARATION') return { success: false, reason: 'NOT_IN_PREPARATION' };
          player.ready = !!payload.ready;
          if (payload.mapId) {
            const mapDef = BALANCE.MAPS.find(m => m.id === payload.mapId);
            if (mapDef) player.mapVote = payload.mapId;
          }
          if (payload.raceId) {
            const race = (BALANCE.CHARACTERS || []).find(c => c.id === payload.raceId);
            if (race) player.raceId = payload.raceId;
          }

          if (this.players.p1.ready && this.players.p2.ready) {
            this.startBattlePhase();
          }
          return { success: true, ready: player.ready };
        }

        case 'SPEED_VOTE': {
          const spd = Number(payload.speed);
          if (![1, 2, 4].includes(spd)) return { success: false, reason: 'INVALID_SPEED' };
          player.speedVote = spd;
          this.gameSpeed = Math.min(this.players.p1.speedVote, this.players.p2.speedVote);
          return { success: true, effectiveSpeed: this.gameSpeed };
        }

        case 'BUILD_TOWER': {
          if (this.gameState !== 'BATTLE' && this.gameState !== 'PREPARATION') {
            return { success: false, reason: 'INVALID_GAME_STATE' };
          }
          const gx = Number(payload.gx);
          const gy = Number(payload.gy);
          const towerDef = (BALANCE.TOWERS || []).find(t => t.id === payload.towerId);

          if (!towerDef) return { success: false, reason: 'TOWER_DEF_NOT_FOUND' };
          if (player.gold < towerDef.cost) return { success: false, reason: 'NOT_ENOUGH_GOLD' };
          if (!this.canPlaceTower(player, gx, gy)) return { success: false, reason: 'CANNOT_PLACE_TOWER' };

          player.gold -= towerDef.cost;

          const tower = {
            id: `tower_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
            def: towerDef,
            x: gx,
            y: gy,
            level: 0,
            attackCooldown: 0,
            target: null,
            totalDamageDealt: 0,
            kills: 0
          };

          player.towers.push(tower);
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              player.grid[gy + dy][gx + dx] = tower;
            }
          }

          this.recalculateCreepPaths(player);
          this.events.push({
            type: 'TOWER_BUILT',
            playerId: player.id,
            gx: gx,
            gy: gy,
            towerId: towerDef.id,
            cost: towerDef.cost
          });

          return { success: true, tower: tower };
        }

        case 'UPGRADE_TOWER': {
          if (this.gameState !== 'BATTLE' && this.gameState !== 'PREPARATION') {
            return { success: false, reason: 'INVALID_GAME_STATE' };
          }
          const gx = Number(payload.gx);
          const gy = Number(payload.gy);
          const nextDef = (BALANCE.TOWERS || []).find(t => t.id === payload.nextDefId);

          if (!nextDef) return { success: false, reason: 'UPGRADE_DEF_NOT_FOUND' };

          const tower = player.grid[gy] && player.grid[gy][gx];
          if (!tower) return { success: false, reason: 'TOWER_NOT_FOUND' };

          const upgradeCost = payload.cost || tower.def.upgradeCost || nextDef.cost || 40;
          if (player.gold < upgradeCost) return { success: false, reason: 'NOT_ENOUGH_GOLD' };

          player.gold -= upgradeCost;
          tower.def = nextDef;
          tower.level = (tower.level || 0) + 1;

          this.events.push({
            type: 'TOWER_UPGRADED',
            playerId: player.id,
            gx: tower.x,
            gy: tower.y,
            nextDefId: nextDef.id,
            cost: upgradeCost
          });

          return { success: true, tower: tower };
        }

        case 'SELL_TOWER': {
          if (this.gameState !== 'BATTLE' && this.gameState !== 'PREPARATION') {
            return { success: false, reason: 'INVALID_GAME_STATE' };
          }
          const gx = Number(payload.gx);
          const gy = Number(payload.gy);

          const tower = player.grid[gy] && player.grid[gy][gx];
          if (!tower) return { success: false, reason: 'TOWER_NOT_FOUND' };

          const refund = Math.round(tower.def.cost * 0.75);
          player.gold += refund;

          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              player.grid[tower.y + dy][tower.x + dx] = null;
            }
          }

          const idx = player.towers.indexOf(tower);
          if (idx !== -1) player.towers.splice(idx, 1);

          this.recalculateCreepPaths(player);

          this.events.push({
            type: 'TOWER_SOLD',
            playerId: player.id,
            gx: tower.x,
            gy: tower.y,
            refund: refund
          });

          return { success: true, refund: refund };
        }

        case 'SEND_CREEP': {
          if (this.gameState !== 'BATTLE') return { success: false, reason: 'NOT_IN_BATTLE' };
          const slotIdx = Number(payload.slotIndex);
          const slot = player.creepSlots[slotIdx];

          if (!slot) return { success: false, reason: 'INVALID_SLOT' };
          if (slot.initialCooldownRemaining > 0) return { success: false, reason: 'SLOT_ON_COOLDOWN' };
          if (slot.charges <= 0) return { success: false, reason: 'NO_CHARGES' };
          if (player.gold < slot.def.cost) return { success: false, reason: 'NOT_ENOUGH_GOLD' };

          player.gold -= slot.def.cost;
          slot.charges--;
          player.income += slot.def.income;

          // Spawn creep in opponent's lane
          const spawned = this._spawnCreep(opponent, slot.def);
          if (!spawned) {
            // Refund on spawn failure
            player.gold += slot.def.cost;
            slot.charges++;
            player.income -= slot.def.income;
            return { success: false, reason: 'SPAWN_PATH_BLOCKED' };
          }

          this.events.push({
            type: 'CREEP_SENT',
            senderId: player.id,
            receiverId: opponent.id,
            slotIndex: slotIdx,
            creepName: slot.def.name,
            income: slot.def.income
          });

          return { success: true };
        }

        case 'TIER_UPGRADE': {
          if (this.gameState !== 'BATTLE' && this.gameState !== 'PREPARATION') {
            return { success: false, reason: 'INVALID_GAME_STATE' };
          }
          if (player.tier >= 3) return { success: false, reason: 'MAX_TIER_REACHED' };

          const upgradeCost = BALANCE.TIER_UPGRADE_COSTS[player.tier - 1];
          if (player.gold < upgradeCost) return { success: false, reason: 'NOT_ENOUGH_GOLD' };

          player.gold -= upgradeCost;
          player.tier++;
          this._initCreepSlots(player);

          this.events.push({
            type: 'TIER_UPGRADED',
            playerId: player.id,
            newTier: player.tier,
            cost: upgradeCost
          });

          return { success: true, tier: player.tier };
        }

        default:
          return { success: false, reason: 'UNKNOWN_ACTION' };
      }
    }

    _spawnCreep(receiverPlayer, creepDef) {
      const waypoints = (this.activeMap && this.activeMap.waypointCoords) ? this.activeMap.waypointCoords : BALANCE.MAP.WAYPOINT_COORDS;
      const startCoord = waypoints[0];
      const spawnX = startCoord.x;
      const spawnY = startCoord.y;

      const path = this.pathfinder.findMultiWaypointPath(waypoints, (x, y) => this.isCellBlocked(receiverPlayer, x, y));
      if (!path) return false;

      const creep = {
        id: `creep_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        def: creepDef,
        defId: creepDef.index !== undefined ? creepDef.index : 0,
        tier: creepDef.tier || receiverPlayer.tier,
        name: creepDef.name,
        icon: creepDef.icon,
        hp: creepDef.hp,
        maxHp: creepDef.hp,
        armor: creepDef.armor,
        baseSpeed: creepDef.speed,
        speed: creepDef.speed,
        slowTimer: 0,
        poisonTimer: 0,
        poisonDps: 0,
        x: spawnX,
        y: spawnY,
        path: path,
        pathIndex: 0,
        currentWaypointStage: 1
      };

      receiverPlayer.creeps.push(creep);
      return true;
    }

    // --- Simulation Tick Step ---
    step(dt) {
      if (this.gameState === 'GAME_OVER') return;

      // Handle Preparation Phase
      if (this.gameState === 'PREPARATION') {
        this.prepTimer -= dt;
        if (this.prepTimer <= 0) {
          this.prepTimer = 0;
          this.startBattlePhase();
        }
        this.tick++;
        return;
      }

      if (this.gameState !== 'BATTLE') return;

      this.gameTime += dt;

      // 1. Income Interval Tick (Every 15 sec)
      this.incomeTimer -= dt;
      if (this.incomeTimer <= 0) {
        this.incomeTimer += BALANCE.MAP_CONFIG.INCOME_INTERVAL_SEC;
        this.players.p1.gold += this.players.p1.income;
        this.players.p2.gold += this.players.p2.income;
        this.events.push({
          type: 'INCOME_PAYOUT',
          p1Income: this.players.p1.income,
          p2Income: this.players.p2.income
        });
      }

      // 2. Creep Slot Cooldown & Charge Stacking
      this._updateCreepSlots(this.players.p1, dt);
      this._updateCreepSlots(this.players.p2, dt);

      // 3. Tower Targeting & Shooting
      this._updateTowers(this.players.p1, dt);
      this._updateTowers(this.players.p2, dt);

      // 4. Projectiles Movement & Hit Impact
      this._updateProjectiles(dt);

      // 5. Creeps Movement, Waypoint Stages, DoT & Leaks
      this._updateCreeps(this.players.p1, dt);
      this._updateCreeps(this.players.p2, dt);

      // 6. Check Victory / Defeat Conditions
      if (this.players.p1.lives <= 0 && this.players.p2.lives <= 0) {
        this.gameState = 'GAME_OVER';
        this.winnerId = 'draw';
        this.events.push({ type: 'GAME_OVER', winnerId: 'draw' });
      } else if (this.players.p1.lives <= 0) {
        this.gameState = 'GAME_OVER';
        this.winnerId = this.players.p2.id;
        this.events.push({ type: 'GAME_OVER', winnerId: this.players.p2.id, loserId: this.players.p1.id });
      } else if (this.players.p2.lives <= 0) {
        this.gameState = 'GAME_OVER';
        this.winnerId = this.players.p1.id;
        this.events.push({ type: 'GAME_OVER', winnerId: this.players.p1.id, loserId: this.players.p2.id });
      }

      this.tick++;
    }

    _updateCreepSlots(player, dt) {
      for (const slot of player.creepSlots) {
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

    _updateTowers(player, dt) {
      for (const tower of player.towers) {
        tower.attackCooldown -= dt;
        if (tower.attackCooldown > 0) continue;

        const towerCenterX = tower.x + 1;
        const towerCenterY = tower.y + 1;
        const inRangeCreeps = [];

        for (const creep of player.creeps) {
          if (creep.hp <= 0) continue;
          const dist = Math.hypot(creep.x - towerCenterX, creep.y - towerCenterY);
          if (dist <= tower.def.range) {
            const score = creep.currentWaypointStage * 1000 + creep.pathIndex;
            inRangeCreeps.push({ creep, score });
          }
        }

        if (inRangeCreeps.length > 0) {
          inRangeCreeps.sort((a, b) => b.score - a.score);
          const targetCount = Math.min(inRangeCreeps.length, tower.def.multishot || 1);
          const selectedTargets = inRangeCreeps.slice(0, targetCount).map(item => item.creep);

          for (const target of selectedTargets) {
            this._fireTower(player, tower, target);
          }
          tower.attackCooldown = tower.def.attackSpeed;
        }
      }
    }

    _fireTower(player, tower, target) {
      const towerCenterX = tower.x + 1;
      const towerCenterY = tower.y + 1;

      this.projectiles.push({
        id: `proj_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        playerId: player.id,
        x: towerCenterX,
        y: towerCenterY,
        target: target,
        targetX: target.x,
        targetY: target.y,
        speed: 32,
        tower: tower,
        color: tower.def.color || '#38bdf8'
      });

      this.events.push({
        type: 'TOWER_SHOT',
        playerId: player.id,
        x: towerCenterX,
        y: towerCenterY,
        targetX: target.x,
        targetY: target.y,
        color: tower.def.color || '#38bdf8'
      });
    }

    _updateProjectiles(dt) {
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
          this._onProjectileHit(p);
          this.projectiles.splice(i, 1);
        } else {
          const step = p.speed * dt;
          p.x += (dx / dist) * Math.min(step, dist);
          p.y += (dy / dist) * Math.min(step, dist);
        }
      }
    }

    _onProjectileHit(p) {
      const player = this.getPlayer(p.playerId);
      const tower = p.tower;

      if (p.target && p.target.hp > 0) {
        const creep = p.target;

        // Slow Effect
        if (tower.def.slowPercent > 0) {
          creep.slowTimer = 2.5;
          creep.speed = creep.baseSpeed * (1 - tower.def.slowPercent);
        }

        // Armor Shred Effect
        if (tower.def.armorShred > 0) {
          creep.armor = Math.max(0, creep.armor - tower.def.armorShred);
        }

        // Poison DoT Effect
        if (tower.def.poisonDps > 0) {
          creep.poisonTimer = 3.0;
          creep.poisonDps = Math.max(creep.poisonDps || 0, tower.def.poisonDps);
        }

        this._applyDamage(player, tower, creep, 1.0);
      }
    }

    _applyDamage(player, tower, creep, multiplier = 1.0) {
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

      this.events.push({
        type: 'CREEP_HIT',
        playerId: player.id,
        creepId: creep.id,
        x: creep.x,
        y: creep.y,
        damage: finalDamage,
        isCrit: isCrit,
        remainingHp: Math.max(0, creep.hp)
      });

      if (creep.hp <= 0) {
        tower.kills++;
        this._onCreepKilled(player, creep);
      }
    }

    _onCreepKilled(player, creep) {
      const bounty = creep.def.bounty !== undefined ? creep.def.bounty : (creep.def.income > 0 ? creep.def.income : Math.round(creep.def.cost * 0.075));
      player.gold += bounty;

      this.events.push({
        type: 'CREEP_KILLED',
        playerId: player.id,
        creepId: creep.id,
        name: creep.name,
        bounty: bounty,
        x: creep.x,
        y: creep.y
      });
    }

    _updateCreeps(player, dt) {
      const waypoints = (this.activeMap && this.activeMap.waypointCoords) ? this.activeMap.waypointCoords : BALANCE.MAP.WAYPOINT_COORDS;
      const finalWp = waypoints[waypoints.length - 1];

      for (let i = player.creeps.length - 1; i >= 0; i--) {
        const creep = player.creeps[i];

        // Slow Timer Decay
        if (creep.slowTimer > 0) {
          creep.slowTimer -= dt;
          if (creep.slowTimer <= 0) {
            creep.speed = creep.baseSpeed;
          }
        }

        // Poison DoT
        if (creep.poisonTimer > 0) {
          creep.poisonTimer -= dt;
          const poisonDmg = (creep.poisonDps || 0) * dt;
          creep.hp -= poisonDmg;
          if (creep.hp <= 0) {
            this._onCreepKilled(player, creep);
            player.creeps.splice(i, 1);
            continue;
          }
        }

        if (creep.hp <= 0) {
          player.creeps.splice(i, 1);
          continue;
        }

        // Waypoint advancement
        if (creep.currentWaypointStage < waypoints.length - 1) {
          const nextWp = waypoints[creep.currentWaypointStage];
          if (Math.hypot(creep.x - nextWp.x, creep.y - nextWp.y) < 2.0) {
            creep.currentWaypointStage++;
          }
        }

        // Move along path
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

        // Check if reached exit base
        const inExit = Math.hypot(creep.x - finalWp.x, creep.y - finalWp.y) < 2.0;
        if ((inExit && creep.currentWaypointStage >= waypoints.length - 2) || creep.pathIndex >= (creep.path ? creep.path.length : 0)) {
          player.lives--;
          player.creeps.splice(i, 1);

          this.events.push({
            type: 'CREEP_LEAKED',
            playerId: player.id,
            creepName: creep.name,
            livesRemaining: player.lives,
            x: finalWp.x,
            y: finalWp.y
          });
        }
      }
    }

    // --- State Serialization for Network Sync ---
    getSnapshot() {
      const serializePlayer = (p) => ({
        id: p.id,
        name: p.name,
        raceId: p.raceId,
        mapVote: p.mapVote,
        speedVote: p.speedVote,
        ready: p.ready,
        gold: p.gold,
        income: p.income,
        lives: p.lives,
        tier: p.tier,
        creepSlots: p.creepSlots.map(s => ({
          index: s.index,
          charges: s.charges,
          cdRemaining: Math.max(0, s.initialCooldownRemaining),
          stackTimer: s.stackTimer
        }))
      });

      const serializeTowers = (p) => p.towers.map(t => ({
        id: t.id,
        x: t.x,
        y: t.y,
        defId: t.def.id,
        level: t.level,
        kills: t.kills,
        damageDealt: t.totalDamageDealt
      }));

      const serializeCreeps = (p) => p.creeps.map(c => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        tier: c.tier,
        hp: Math.max(0, Math.round(c.hp)),
        maxHp: c.maxHp,
        armor: c.armor,
        speed: c.speed,
        x: Number(c.x.toFixed(2)),
        y: Number(c.y.toFixed(2)),
        stage: c.currentWaypointStage || 1,
        slow: c.slowTimer > 0,
        poison: c.poisonTimer > 0
      }));

      const snapshot = {
        tick: this.tick,
        gameState: this.gameState,
        prepTimer: Math.max(0, Number(this.prepTimer.toFixed(1))),
        gameTime: Number(this.gameTime.toFixed(1)),
        incomeTimer: Math.max(0, Number(this.incomeTimer.toFixed(1))),
        gameSpeed: this.gameSpeed,
        mapId: this.mapId,
        winnerId: this.winnerId,
        players: {
          p1: serializePlayer(this.players.p1),
          p2: serializePlayer(this.players.p2)
        },
        towers: {
          p1: serializeTowers(this.players.p1),
          p2: serializeTowers(this.players.p2)
        },
        creeps: {
          p1: serializeCreeps(this.players.p1),
          p2: serializeCreeps(this.players.p2)
        },
        projectiles: this.projectiles.map(p => ({
          id: p.id,
          playerId: p.playerId,
          x: Number(p.x.toFixed(2)),
          y: Number(p.y.toFixed(2)),
          targetX: Number(p.targetX.toFixed(2)),
          targetY: Number(p.targetY.toFixed(2)),
          color: p.color
        })),
        events: [...this.events]
      };

      // Flush transient events after generating snapshot
      this.events = [];
      return snapshot;
    }
  }

  return {
    GameMatch
  };
}));
