/**
 * Tower Wars - Complete 1v1 Real-Time Multiplayer Engine
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
  click() { this.playTone(600, 'sine', 0.04, 0.05); }
  upgrade() {
    this.playTone(520, 'sine', 0.08, 0.08);
    setTimeout(() => this.playTone(780, 'sine', 0.12, 0.08), 70);
  }
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

    // Tower Drawing & Undo Stack
    this.isDrawingTowers = false;
    this.currentDrawStroke = [];
    this.buildHistoryStack = [];
    this.lastDrawGx = -1;
    this.lastDrawGy = -1;
    this.pendingTowers = new Map();

    // Lifecycle States: 'IDLE' (frozen at start), 'PREPARATION' (60s prep), 'BATTLE' (active match), 'CREATIVE'
    this.gameState = 'IDLE';
    this.prepTimer = 60;
    this.myReadyState = false;
    this.enemyReadyState = false;
    this.selectedCharacterId = (BALANCE.CHARACTERS && BALANCE.CHARACTERS[0]) ? BALANCE.CHARACTERS[0].id : 'humans';

    // Map Voting & Layout State
    this.currentMapId = 'classic';
    this.activeMap = BALANCE.getMap('classic');
    this.myMapVote = 'classic';
    this.enemyMapVote = 'classic';

    // Custom Architect Mode (10 random wall blocks)
    this.myCustomBlocks = [];
    this.placedCustomWalls = [];
    this.enemyCustomWalls = [];
    this.selectedCustomBlock = null;

    // Developer Mode
    this.isDevMode = false;
    this.devArchitectActive = false;

    this.initCreepSlots(this.player);
    this.initCreepSlots(this.enemy);

    this.recalculateCreepPaths(this.player);
    this.recalculateCreepPaths(this.enemy);

    this.initUI();
    this.bindEvents();
    this.initMultiplayerUI();
    this.initDevToolbar();
    this.recalculateEffectiveSpeed();

    this.logEvent("⚔️ Онлайн 1v1 PvP режим готов. Создайте комнату или введите код соперника!", "log-spawn");

    // Open room modal on startup
    const modal = document.getElementById('mp-modal');
    if (modal) modal.classList.remove('hidden');

    this.startEngine();
  }

  startDevMode(mapId = null) {
    this.isDevMode = true;
    this.isCreativeMode = true;
    this.isMultiplayer = false;
    this.isHost = true;
    this.isMatchActive = true;
    this.isGameOver = false;
    this.myPlayerId = 'p1';
    this.gameState = 'CREATIVE';
    this.gameTimeSeconds = 0;

    const selectedMap = mapId || this.currentMapId || 'classic';

    if (typeof TowerWarsCore !== 'undefined' && TowerWarsCore.GameMatch) {
      this.localCore = new TowerWarsCore.GameMatch({
        mapId: selectedMap,
        p1Id: 'p1',
        p1Name: 'Разработчик',
        p2Id: 'p2',
        p2Name: 'Бот-песочница'
      });

      this.localCore.players.p1.gold = 999999999;
      this.localCore.players.p1.income = 999999;
      this.localCore.players.p1.lives = 999;
      this.localCore.players.p1.tier = 3;
      this.localCore._initCreepSlots(this.localCore.players.p1);

      this.localCore.players.p2.gold = 999999999;
      this.localCore.players.p2.income = 999999;
      this.localCore.players.p2.lives = 999;
      this.localCore.players.p2.tier = 3;
      this.localCore._initCreepSlots(this.localCore.players.p2);

      this.localCore.startBattlePhase(selectedMap);
      this.handleServerSnapshot(this.localCore.getSnapshot());
    }

    this.player.gold = 999999999;
    this.player.income = 999999;
    this.player.lives = 999;
    this.player.tier = 3;

    this.enemy.gold = 999999999;
    this.enemy.income = 999999;
    this.enemy.lives = 999;
    this.enemy.tier = 3;

    this.setMap(selectedMap);
    this.initCreepSlots(this.player);
    this.initCreepSlots(this.enemy);

    const modal = document.getElementById('mp-modal');
    if (modal) modal.classList.add('hidden');

    const raceModal = document.getElementById('race-selection-modal');
    if (raceModal) raceModal.classList.add('hidden');

    const overlay = document.getElementById('canvas-overlay-msg');
    if (overlay) overlay.classList.add('hidden');

    const prepHud = document.getElementById('prep-phase-hud');
    if (prepHud) prepHud.classList.add('hidden');

    const battleTimerBox = document.getElementById('battle-timer-box');
    if (battleTimerBox) battleTimerBox.classList.remove('hidden');

    const charView = document.getElementById('character-select-view');
    if (charView) charView.classList.add('hidden');

    const towerSelector = document.getElementById('tower-selector-list');
    if (towerSelector) towerSelector.classList.remove('hidden');

    const selectedEntityCard = document.getElementById('selected-entity-card');
    if (selectedEntityCard) selectedEntityCard.classList.remove('hidden');

    const devToolbar = document.getElementById('dev-toolbar');
    if (devToolbar) devToolbar.classList.remove('hidden');

    const modeBadge = document.getElementById('game-mode-badge');
    if (modeBadge) {
      modeBadge.innerText = '🔧 DEV РЕЖИМ';
      modeBadge.style.background = '#f59e0b';
      modeBadge.style.color = '#000';
      modeBadge.style.fontWeight = '900';
    }

    const mapBtns = document.querySelectorAll('[data-dev-map]');
    mapBtns.forEach(b => b.classList.toggle('active', b.dataset.devMap === selectedMap));

    this.sound.upgrade();
    this.logEvent(`🔧 РЕЖИМ РАЗРАБОТЧИКА АКТИВИРОВАН! Уровень: ${this.activeMap.name}. Доступны все 5 карт, расы и ресурсы.`, 'log-kill');
    this.renderTowerSelector();
    this.updateHUD();
  }

  startCreativeMode() {
    this.startDevMode();
  }

  tryUnlockCreative(password) {
    this.sound.init();
    const clean = (password || '').trim().toLowerCase();
    const valid = [
      'tooll', 'tool', 'тул', 'тоолл',
      'melafon', 'мелафон', 'melofon', 'мелофон', 'miofon', 'миофон', 'milofon', 'милофон', 'mielophone',
      'dev', 'developer', 'admin', 'god'
    ];
    const statusMsg = document.getElementById('melafon-status-msg');

    if (valid.includes(clean)) {
      const mapSelect = document.getElementById('creative-map-select');
      const selectedMap = mapSelect ? mapSelect.value : 'classic';

      if (statusMsg) {
        statusMsg.innerText = '✅ Доступ разрешен! Запуск...';
        statusMsg.style.color = '#10b981';
      }
      this.startDevMode(selectedMap);
    } else {
      this.sound.leak();
      if (statusMsg) {
        statusMsg.innerText = '❌ Неверный пароль!';
        statusMsg.style.color = '#ef4444';
      }
      const inp = document.getElementById('melafon-input');
      if (inp) {
        inp.style.borderColor = '#ef4444';
        setTimeout(() => { if (inp) inp.style.borderColor = ''; }, 1500);
      }
    }
  }

  initDevToolbar() {
    const devToolbar = document.getElementById('dev-toolbar');
    const btnDevMode = document.getElementById('btn-dev-mode');

    if (btnDevMode) {
      btnDevMode.addEventListener('click', () => {
        this.sound.init();
        if (this.isDevMode) {
          if (devToolbar) devToolbar.classList.toggle('hidden');
        } else {
          const pass = prompt('Введите пароль разработчика:');
          if (pass) this.tryUnlockCreative(pass);
        }
      });
    }

    // Map switcher buttons
    const mapBtns = document.querySelectorAll('[data-dev-map]');
    mapBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.sound.click();
        const mapId = btn.dataset.devMap;
        this.setMap(mapId);
        if (mapId === 'custom' && (!this.myCustomBlocks || !this.myCustomBlocks.length)) {
          this.myCustomBlocks = BALANCE.getRandomCustomBlocks(10);
        }
        mapBtns.forEach(b => b.classList.toggle('active', b.dataset.devMap === mapId));
        this.logEvent(`🔧 DEV: Карта переключена на «${this.activeMap.name}»`, 'log-income');
      });
    });

    // Race switcher buttons
    const raceBtns = document.querySelectorAll('[data-dev-race]');
    raceBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.sound.click();
        const raceId = btn.dataset.devRace;
        this.selectedCharacterId = raceId;
        this.devArchitectActive = false;
        this.renderCharacterSelection();
        this.renderTowerSelector();
        this.updateHUD();
        raceBtns.forEach(b => b.classList.toggle('active', b.dataset.devRace === raceId));
        const charDef = (BALANCE.CHARACTERS || []).find(c => c.id === raceId);
        this.logEvent(`🔧 DEV: Раса переключена на «${charDef ? charDef.name : raceId}»`, 'log-income');
      });
    });

    // Toggle Architect Wall Building Mode
    const btnArchitect = document.getElementById('dev-btn-architect');
    if (btnArchitect) {
      btnArchitect.addEventListener('click', () => {
        this.sound.click();
        this.devArchitectActive = !this.devArchitectActive;
        btnArchitect.classList.toggle('active', this.devArchitectActive);
        if (this.devArchitectActive && (!this.myCustomBlocks || !this.myCustomBlocks.length)) {
          this.myCustomBlocks = BALANCE.getRandomCustomBlocks(10);
        }
        this.renderTowerSelector();
        this.logEvent(`🔧 DEV: Режим стен (Архитектор) ${this.devArchitectActive ? 'ВКЛЮЧЕН' : 'ВЫКЛЮЧЕН'}`, 'log-income');
      });
    }

    // Add +10,000 Gold
    const btnGold = document.getElementById('dev-btn-gold');
    if (btnGold) {
      btnGold.addEventListener('click', () => {
        this.sound.coin();
        this.player.gold += 10000;
        this.updateHUD();
        this.logEvent('🔧 DEV: +10,000 🪙 золота добавлено!', 'log-income');
      });
    }

    // Toggle Infinite Gold
    const btnInfinite = document.getElementById('dev-btn-infinite');
    if (btnInfinite) {
      btnInfinite.addEventListener('click', () => {
        this.sound.upgrade();
        this.player.gold = 999999999;
        this.player.income = 999999;
        this.player.lives = 999;
        this.updateHUD();
        this.logEvent('🔧 DEV: Бесконечные ресурсы активированы (Золото ∞, Инком ∞, База ∞)!', 'log-kill');
      });
    }

    // Test Wave Spawner
    const btnSpawnTest = document.getElementById('dev-btn-spawn-test');
    if (btnSpawnTest) {
      btnSpawnTest.addEventListener('click', () => {
        this.sound.leak();
        const creepList = BALANCE.CREEPS_BY_TIER[this.player.tier || 1] || BALANCE.CREEPS_BY_TIER[1];
        creepList.slice(0, 5).forEach((c, idx) => {
          setTimeout(() => {
            this.spawnCreep(this.enemy, this.player, c);
          }, idx * 300);
        });
        this.logEvent('🔧 DEV: Запущена тестовая волна крипов!', 'log-leak');
      });
    }

    // Clear All Creeps
    const btnClearCreeps = document.getElementById('dev-btn-clear-creeps');
    if (btnClearCreeps) {
      btnClearCreeps.addEventListener('click', () => {
        this.sound.coin();
        this.player.creeps = [];
        this.enemy.creeps = [];
        this.updateHUD();
        this.logEvent('🔧 DEV: Все крипы на поле удалены.', 'log-income');
      });
    }

    // Battle Toggle
    const btnBattleToggle = document.getElementById('dev-btn-battle-toggle');
    if (btnBattleToggle) {
      btnBattleToggle.addEventListener('click', () => {
        this.sound.upgrade();
        if (this.gameState === 'PREPARATION') {
          this.startBattlePhase();
          btnBattleToggle.innerText = '⏱ В подготовку';
        } else {
          this.startPreparationPhase();
          btnBattleToggle.innerText = '⚔️ Старт боя';
        }
      });
    }
  }

  renderCharacterSelection() {
    const grid = document.getElementById('race-cards-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const chars = BALANCE.CHARACTERS || [];
    chars.forEach((c) => {
      const card = document.createElement('div');
      const isSelected = (this.selectedCharacterId === c.id);
      card.className = `race-card-rich ${isSelected ? 'selected' : ''}`;
      card.dataset.id = c.id;

      const towersHtml = (c.towersList || []).join(' ➜ ');

      card.innerHTML = `
        <div class="race-card-top">
          <span class="race-card-icon-big">${c.icon || '👑'}</span>
          <div class="race-card-title-group">
            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
              <span class="race-card-name-title">${c.name}</span>
              ${isSelected ? '<span style="color:#10b981; font-weight:800; font-size:0.72rem;">✅ ВЫБРАНО</span>' : ''}
            </div>
            <span class="race-card-perk-pill" style="background: ${c.perkColor ? c.perkColor + '22' : 'rgba(56,189,248,0.15)'}; color: ${c.perkColor || '#38bdf8'}; border: 1px solid ${c.perkColor || '#38bdf8'};">
              ${c.perkTitle || c.badge || 'Расовый бонус'}
            </span>
          </div>
        </div>
        <div class="race-card-desc-text">${c.desc}</div>
        <div class="race-card-towers-preview">
          <span class="race-towers-label">Ветка башен (Т0 ➜ Т4):</span>
          <span class="race-towers-list-text">${towersHtml}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        this.sound.click();
        this.selectedCharacterId = c.id;
        this.renderCharacterSelection();
        this.renderTowerSelector();
        this.updatePrepUI();

        const titleElem = document.getElementById('build-panel-title');
        if (titleElem) titleElem.innerText = `🔨 БАШНИ: ${c.name}`;

        this.logEvent(`👑 Выбрана раса: ${c.name}`, 'log-income');
        if (this.isMultiplayer) {
          this.sendServerCommand('RACE_SELECT', {
            raceId: this.selectedCharacterId
          });
        }
      });

      grid.appendChild(card);
    });

    this.updatePrepUI();
  }

  setMap(mapId) {
    const mapDef = BALANCE.getMap(mapId);
    if (!mapDef) return;
    this.currentMapId = mapId;
    this.activeMap = mapDef;
    this.recalculateCreepPaths(this.player);
    this.recalculateCreepPaths(this.enemy);
  }

  renderMapVoting() {
    const grid = document.getElementById('map-cards-grid');
    if (!grid) return;
    grid.innerHTML = '';

    (BALANCE.MAPS || []).forEach(m => {
      const isSelected = (this.myMapVote === m.id);
      const isOpponentSelected = (this.isMultiplayer && this.enemyMapVote === m.id);

      const card = document.createElement('div');
      card.className = `map-card ${isSelected ? 'selected' : ''}`;
      card.innerHTML = `
        <div class="map-card-header">
          <div class="map-card-title-group">
            <span class="map-card-icon">${m.icon}</span>
            <div>
              <div class="map-card-name">${m.name}</div>
              <span class="map-card-badge" style="background:${m.tagColor}22; color:${m.tagColor}; border:1px solid ${m.tagColor}44;">${m.badge}</span>
            </div>
          </div>
          <div class="map-votes-badges">
            ${isOpponentSelected ? '<span class="vote-badge opponent-badge" title="Выбор соперника">👤 Соперник</span>' : ''}
            <span class="vote-badge ${isSelected ? 'my-badge' : ''}">
              ${isSelected ? '✅ Ваш голос' : 'Выбрать'}
            </span>
          </div>
        </div>
        <div class="map-card-desc">${m.desc}</div>
      `;

      card.addEventListener('click', () => {
        this.sound.click();
        this.myMapVote = m.id;
        this.renderMapVoting();
        this.updatePrepUI();

        if (!this.isMultiplayer) {
          this.setMap(m.id);
        } else {
          this.sendServerCommand('MAP_VOTE', {
            mapId: this.myMapVote
          });
        }
      });

      grid.appendChild(card);
    });

    this.updatePrepUI();
  }

  startPreparationPhase() {
    this.gameState = 'PREPARATION';
    this.prepTimer = (this.activeMap && this.activeMap.prepTimeSec) ? this.activeMap.prepTimeSec : 60;
    this.myReadyState = false;
    this.enemyReadyState = false;

    if (this.activeMap && this.activeMap.isCustom) {
      this.myCustomBlocks = BALANCE.getRandomCustomBlocks(10);
      this.placedCustomWalls = [];
      this.enemyCustomWalls = [];
    }

    const modal = document.getElementById('race-selection-modal');
    if (modal) modal.classList.remove('hidden');

    const prepHud = document.getElementById('prep-phase-hud');
    if (prepHud) prepHud.classList.remove('hidden');

    const battleTimerBox = document.getElementById('battle-timer-box');
    if (battleTimerBox) battleTimerBox.classList.add('hidden');

    const charDef = (BALANCE.CHARACTERS || []).find(c => c.id === this.selectedCharacterId);
    const titleElem = document.getElementById('build-panel-title');
    if (titleElem) titleElem.innerText = `🔨 БАШНИ: ${charDef ? charDef.name : ''}`;

    this.renderCharacterSelection();
    this.renderMapVoting();
    this.renderTowerSelector();
    this.updatePrepUI();
    this.logEvent(`⏱ Фаза подготовки (${this.prepTimer}с)! Выберите расу и проголосуйте за карту матча.`, 'log-income');
  }

  toggleReady() {
    this.myReadyState = !this.myReadyState;
    this.sound.click();
    this.updatePrepUI();

    if (this.isMultiplayer) {
      this.sendServerCommand('READY_VOTE', {
        ready: this.myReadyState,
        raceId: this.selectedCharacterId,
        mapId: this.myMapVote
      });
    } else if (this.localCore) {
      this.localCore.handleAction(this.myPlayerId || 'p1', 'READY_VOTE', {
        ready: this.myReadyState,
        raceId: this.selectedCharacterId,
        mapId: this.myMapVote
      });
      if (this.myReadyState) {
        this.startBattlePhase(this.myMapVote);
      }
    } else if (this.myReadyState) {
      this.startBattlePhase(this.myMapVote);
    }
  }

  updatePrepUI() {
    const sec = Math.max(0, Math.ceil(this.prepTimer));
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    const timeStr = `⏱ ${m}:${s}`;

    const timerElem = document.getElementById('prep-timer-text');
    if (timerElem) timerElem.innerText = `⏱ Подготовка: ${m}:${s}`;

    const modalTimer = document.getElementById('race-modal-timer');
    if (modalTimer) modalTimer.innerText = timeStr;

    const readyBtn = document.getElementById('btn-player-ready');
    if (readyBtn) {
      if (this.myReadyState) {
        readyBtn.className = 'btn-ready ready-active';
        readyBtn.innerText = this.enemyReadyState ? '✅ Запуск игры (2/2)...' : '⏳ Ожидание соперника... (1/2)';
      } else {
        readyBtn.className = 'btn-ready';
        readyBtn.innerText = this.enemyReadyState ? '🔥 Соперник готов! (1/2)' : '✅ Я готов (0/2)';
      }
    }

    const modalReadyBtn = document.getElementById('btn-modal-ready');
    if (modalReadyBtn) {
      if (this.myReadyState) {
        modalReadyBtn.className = 'btn-modal-ready ready-active';
        modalReadyBtn.innerText = this.enemyReadyState ? '✅ Оба готовы (2/2) — Запуск боя...' : '⏳ Вы готовы (1/2) — Ожидание выбора соперника...';
      } else {
        modalReadyBtn.className = 'btn-modal-ready';
        modalReadyBtn.innerText = this.enemyReadyState ? '🔥 Соперник готов (1/2)! Нажмите «Я готов к бою»' : '✅ Я готов к бою (0/2)';
      }
    }

    const charDef = (BALANCE.CHARACTERS || []).find(c => c.id === this.selectedCharacterId);
    const sumName = document.getElementById('summary-race-name');
    if (sumName && charDef) sumName.innerText = charDef.name;

    const mapDef = (BALANCE.MAPS || []).find(m => m.id === this.myMapVote);
    const sumMap = document.getElementById('summary-map-name');
    if (sumMap && mapDef) sumMap.innerText = mapDef.name;
  }

  startBattlePhase(resolvedMapId = null) {
    this.gameState = 'BATTLE';
    this.gameTimeSeconds = 0;
    this.incomeTimer = BALANCE.MAP_CONFIG.INCOME_INTERVAL_SEC;

    // Resolve final map
    let finalMapId = resolvedMapId;
    if (!finalMapId) {
      if (this.isHost || !this.isMultiplayer) {
        if (this.isMultiplayer && this.myMapVote !== this.enemyMapVote) {
          const pool = [this.myMapVote, this.enemyMapVote];
          finalMapId = pool[Math.floor(Math.random() * 2)];
        } else {
          finalMapId = this.myMapVote;
        }
      } else {
        finalMapId = this.myMapVote;
      }
    }

    if (finalMapId) {
      this.setMap(finalMapId);
    }

    // In custom map mode, apply the walls built by the opponent (or myself if solo)
    if (this.activeMap && this.activeMap.isCustom) {
      if (this.isMultiplayer && this.enemyCustomWalls.length > 0) {
        this.activeMap.walls = [...this.enemyCustomWalls];
      } else if (this.placedCustomWalls.length > 0) {
        this.activeMap.walls = [...this.placedCustomWalls];
      }
      this.recalculateCreepPaths(this.player);
      this.recalculateCreepPaths(this.enemy);
    }

    const modal = document.getElementById('race-selection-modal');
    if (modal) modal.classList.add('hidden');

    const prepHud = document.getElementById('prep-phase-hud');
    if (prepHud) prepHud.classList.add('hidden');

    const battleTimerBox = document.getElementById('battle-timer-box');
    if (battleTimerBox) battleTimerBox.classList.remove('hidden');

    const charDef = (BALANCE.CHARACTERS || []).find(c => c.id === this.selectedCharacterId);
    const titleElem = document.getElementById('build-panel-title');
    if (titleElem) titleElem.innerText = `🔨 БАШНИ: ${charDef ? charDef.name : 'СТРОИТЕЛЬСТВО'}`;

    this.sound.upgrade();
    this.logEvent(`⚔️ БОЙ НАЧАЛСЯ! Раса: ${charDef ? charDef.name : ''}. Карта: ${this.activeMap.name}!`, 'log-kill');
    this.renderTowerSelector();
    this.updateHUD();
  }

  undoLastBuild() {
    if (!this.buildHistoryStack || this.buildHistoryStack.length === 0) {
      this.logEvent("⚠️ Нет действий для отмены (Ctrl+Z).", 'log-leak');
      return;
    }

    const lastAction = this.buildHistoryStack.pop();
    if (!lastAction || lastAction.length === 0) return;

    for (const tower of lastAction) {
      this.sellSelectedTower(tower);
    }
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

  rotateBlock(block) {
    if (!block) return;
    const oldW = block.w;
    const oldH = block.h;
    const newW = oldH;
    const newH = oldW;
    const oldSubs = (block.subBlocks && block.subBlocks.length > 0)
      ? block.subBlocks
      : [{ dx: 0, dy: 0, w: oldW, h: oldH }];

    const newSubs = oldSubs.map(s => ({
      dx: oldH - (s.dy + s.h),
      dy: s.dx,
      w: s.h,
      h: s.w
    }));

    block.w = newW;
    block.h = newH;
    block.subBlocks = newSubs;
    this.sound.click();
    this.logEvent(`🔄 Блок «${block.name}» повернут (${block.w}×${block.h})`, 'log-income');
    this.renderTowerSelector();
  }

  isPermanentWall(x, y) {
    let walls = (this.activeMap && this.activeMap.walls) ? [...this.activeMap.walls] : [];
    if (this.placedCustomWalls && this.placedCustomWalls.length > 0) {
      walls = walls.concat(this.placedCustomWalls);
    }
    if (this.isMultiplayer && this.enemyCustomWalls && this.enemyCustomWalls.length > 0) {
      walls = walls.concat(this.enemyCustomWalls);
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

  canPlaceCustomWall(gx, gy, block) {
    if (!block) return false;
    const blockRects = this.getBlockSubRects(block, gx, gy);

    // Check bounds for each sub-rect
    for (const r of blockRects) {
      if (r.x < 0 || r.x + r.w > this.width || r.y < 0 || r.y + r.h > this.height) return false;
    }

    // Check collision with no-build zones (Spawn, WP1, WP2, Base)
    const zones = (this.activeMap && this.activeMap.zones) ? this.activeMap.zones : [];
    for (const r of blockRects) {
      for (let cy = r.y; cy < r.y + r.h; cy++) {
        for (let cx = r.x; cx < r.x + r.w; cx++) {
          for (const z of zones) {
            if (cx >= z.x && cx < z.x + z.w && cy >= z.y && cy < z.y + z.h) {
              return false;
            }
          }
        }
      }
    }

    // Check collision with already placed custom walls (by sub-rects!)
    for (const pw of this.placedCustomWalls) {
      if (pw.instanceId === block.instanceId) continue;
      const pwRects = this.getBlockSubRects(pw);
      for (const r1 of blockRects) {
        for (const r2 of pwRects) {
          if (!(r1.x + r1.w <= r2.x || r1.x >= r2.x + r2.w || r1.y + r1.h <= r2.y || r1.y >= r2.y + r2.h)) {
            return false;
          }
        }
      }
    }

    // A* Path validation: Simulated path with this block's sub-rects placed
    const isSimBlocked = (x, y) => {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return true;
      for (const r of blockRects) {
        if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return true;
      }
      return this.isPermanentWall(x, y);
    };

    const waypoints = (this.activeMap && this.activeMap.waypointCoords) ? this.activeMap.waypointCoords : BALANCE.MAP.WAYPOINT_COORDS;
    const path = this.pathfinder.findMultiWaypointPath(waypoints, isSimBlocked);
    return path !== null;
  }

  placeCustomWall(gx, gy, block) {
    if (!this.canPlaceCustomWall(gx, gy, block)) {
      this.sound.leak();
      this.logEvent("⚠️ Нельзя ставить здесь стену (блокирует проход или выходит за границы)!", "log-leak");
      return false;
    }

    const wallObj = {
      id: `wall_${Date.now()}_${Math.random()}`,
      instanceId: block.instanceId,
      name: block.name,
      icon: block.icon,
      x: gx,
      y: gy,
      w: block.w,
      h: block.h,
      subBlocks: block.subBlocks ? JSON.parse(JSON.stringify(block.subBlocks)) : null
    };

    this.placedCustomWalls.push(wallObj);
    block.placed = true;
    this.selectedCustomBlock = null;
    this.canvas.style.cursor = 'default';

    this.sound.build();
    this.logEvent(`🧱 Установлен блок: ${block.name}`, 'log-income');

    this.recalculateCreepPaths(this.player);
    this.renderTowerSelector();
    this.updateHUD();

    return true;
  }

  clearAllCustomWalls() {
    this.placedCustomWalls = [];
    if (this.myCustomBlocks) {
      this.myCustomBlocks.forEach(b => b.placed = false);
    }
    this.selectedCustomBlock = null;
    this.sound.coin();
    this.logEvent("↩️ Все кастомные блоки стен очищены.", "log-income");
    this.recalculateCreepPaths(this.player);
    this.renderTowerSelector();
    this.updateHUD();
  }

  isSpecialNoBuildZone(x, y) {
    if (this.isPermanentWall(x, y)) return true;

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

    const waypoints = (this.activeMap && this.activeMap.waypointCoords) ? this.activeMap.waypointCoords : BALANCE.MAP.WAYPOINT_COORDS;
    const fullCircuit = this.pathfinder.findMultiWaypointPath(waypoints, simulatedBlocked);
    if (!fullCircuit) return false;

    // Fast check: Verify all creeps have a valid route to their next target waypoint
    for (const creep of agent.creeps) {
      const curStage = creep.currentWaypointStage || 1;
      const targetWp = waypoints[curStage];
      if (!targetWp) continue;
      const curPos = { x: Math.round(creep.x), y: Math.round(creep.y) };
      const path = this.pathfinder.findPath(curPos.x, curPos.y, targetWp.x, targetWp.y, simulatedBlocked);
      if (!path) return false;
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

    agent.towers.push(tower);

    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        agent.grid[gy + dy][gx + dx] = tower;
      }
    }

    if (agent === this.player) {
      this.pendingTowers.set(`${gx},${gy}`, { tower, timestamp: Date.now() });
      this.sound.build();
      this.logEvent(`🔨 Построена: ${towerDef.name} (-🪙${towerDef.cost})`, 'log-income');
      this.updateHUD();

      if (this.isMultiplayer) {
        this.sendServerCommand('BUILD_TOWER', { gx, gy, towerId: towerDef.id });
      }
    }

    this.recalculateCreepPaths(agent);
    return true;
  }

  recalculateCreepPaths(agent) {
    const waypoints = (this.activeMap && this.activeMap.waypointCoords) ? this.activeMap.waypointCoords : BALANCE.MAP.WAYPOINT_COORDS;
    const isBlocked = (x, y) => this.isCellBlocked(agent, x, y);

    agent.guidePath = this.pathfinder.findMultiWaypointPath(waypoints, isBlocked);
    if (!agent.guidePath) return;

    const segments = agent.guidePath.segments || [];

    for (const creep of agent.creeps) {
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

  spawnCreep(senderAgent, receiverAgent, creepDef) {
    const waypoints = (this.activeMap && this.activeMap.waypointCoords) ? this.activeMap.waypointCoords : BALANCE.MAP.WAYPOINT_COORDS;
    const startCoord = waypoints[0];
    const spawnX = startCoord.x;
    const spawnY = startCoord.y;

    const path = this.pathfinder.findMultiWaypointPath(waypoints, (x, y) => this.isCellBlocked(receiverAgent, x, y));
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
      targetX: spawnX,
      targetY: spawnY,
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

    const incSign = slot.def.income >= 0 ? `+${slot.def.income}` : `${slot.def.income}`;
    this.logEvent(`👾 Отправлен ${slot.def.name} (Инком: ${incSign})`, 'log-spawn');

    this.updateHUD();

    if (this.isMultiplayer) {
      this.sendServerCommand('SEND_CREEP', {
        slotIndex: slotIndex
      });
    } else if (this.localCore) {
      this.localCore.handleAction(this.myPlayerId || 'p1', 'SEND_CREEP', { slotIndex: slotIndex });
    }
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

    this.updateHUD();
    this.renderCreepButtons();

    if (this.isMultiplayer) {
      this.sendServerCommand('TIER_UPGRADE', { tier: this.player.tier });
    } else if (this.localCore) {
      this.localCore.handleAction(this.myPlayerId || 'p1', 'TIER_UPGRADE', { tier: this.player.tier });
    }
  }

  startEngine() {
    this.lastTime = performance.now();
    this.timeAccumulator = 0;

    // Single unified 60fps render and simulation loop
    const renderLoop = (timestamp) => {
      if (!this.lastTime) this.lastTime = timestamp;
      let deltaSec = (timestamp - this.lastTime) / 1000;
      this.lastTime = timestamp;

      if (deltaSec > 0.1) deltaSec = 0.1;
      if (deltaSec > 0) {
        if (this.localCore) {
          this.timeAccumulator += deltaSec * this.gameSpeed;
          const FIXED_DT = 1 / 60;
          let maxSteps = 5;
          while (this.timeAccumulator >= FIXED_DT && maxSteps > 0) {
            this.localCore.step(FIXED_DT);
            this.handleServerSnapshot(this.localCore.getSnapshot());
            this.timeAccumulator -= FIXED_DT;
            maxSteps--;
          }
        }
        this.update(deltaSec);
      }

      this.render();
      requestAnimationFrame(renderLoop);
    };

    requestAnimationFrame(renderLoop);
  }

  update(dt) {
    if (this.isGameOver) return;
    if (this.gameState === 'IDLE') return;

    if (this.gameState === 'PREPARATION') {
      this.updatePrepUI();
      return;
    }

    // Client-side smooth 60 FPS dead-reckoning movement for BOTH player and enemy creeps
    this.updateCreeps(this.player, dt);
    this.updateCreeps(this.enemy, dt);

    this.updateProjectiles(dt);
    this.updateParticles(dt);
    this.updateFloatingTexts(dt);
    this.updateCreepUIRealtime();

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
      const inRangeCreeps = [];

      for (const creep of agent.creeps) {
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
          this.fireTower(agent, tower, target);
        }
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
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 0.8 || isNaN(dist)) {
        this.projectiles.splice(i, 1);
      } else {
        const step = (p.speed || 34) * dt;
        p.x += (dx / dist) * Math.min(step, dist);
        p.y += (dy / dist) * Math.min(step, dist);
      }
    }
  }

  updateCreeps(agent, dt) {
    for (let i = 0; i < agent.creeps.length; i++) {
      const creep = agent.creeps[i];
      if (creep.targetX !== undefined && creep.targetY !== undefined) {
        const dx = creep.targetX - creep.x;
        const dy = creep.targetY - creep.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 3.5) {
          creep.x = creep.targetX;
          creep.y = creep.targetY;
        } else if (dist > 0.001) {
          const factor = Math.min(1.0, dt * 16);
          creep.x += dx * factor;
          creep.y += dy * factor;
        } else {
          creep.x = creep.targetX;
          creep.y = creep.targetY;
        }
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

    // 3. Obstacle Walls for Active Map + Custom Placed Walls
    let walls = (this.activeMap && this.activeMap.walls) ? [...this.activeMap.walls] : [];
    if (this.placedCustomWalls && this.placedCustomWalls.length > 0) {
      walls = walls.concat(this.placedCustomWalls);
    }
    if (this.isMultiplayer && this.enemyCustomWalls && this.enemyCustomWalls.length > 0) {
      walls = walls.concat(this.enemyCustomWalls);
    }
    if (walls.length === 0 && (!this.activeMap || !this.activeMap.isCustom)) {
      walls = [BALANCE.MAP.MIDDLE_WALL];
    }

    for (const mw of walls) {
      const rects = this.getBlockSubRects(mw);
      for (const r of rects) {
        ctx.fillStyle = '#161f30';
        ctx.fillRect(r.x * cs, r.y * cs, r.w * cs, r.h * cs);

        // Diagonal texture stripes on each sub-wall
        ctx.strokeStyle = '#24344d';
        ctx.lineWidth = 3;
        for (let d = -r.h * cs; d < r.w * cs; d += 18) {
          ctx.beginPath();
          ctx.moveTo(r.x * cs + Math.max(0, d), r.y * cs + Math.max(0, -d));
          ctx.lineTo(r.x * cs + Math.min(r.w * cs, d + r.h * cs), r.y * cs + Math.min(r.h * cs, -d + r.w * cs));
          ctx.stroke();
        }
        ctx.strokeStyle = (this.activeMap && this.activeMap.isCustom) ? '#f97316' : '#475569';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(r.x * cs, r.y * cs, r.w * cs, r.h * cs);
      }
    }

    // 4. Vibrant Waypoint Portals for Active Map
    const zones = (this.activeMap && this.activeMap.zones) ? this.activeMap.zones : [
      { x: 59, y: 55, w: 11, h: 11, color: '#0ea5e933', borderColor: '#38bdf8', icon: '🚀' },
      { x: 59, y: 0, w: 11, h: 11, color: '#f59e0b33', borderColor: '#fbbf24', icon: '1️⃣' },
      { x: 0, y: 0, w: 11, h: 11, color: '#a855f733', borderColor: '#c084fc', icon: '2️⃣' },
      { x: 0, y: 55, w: 11, h: 11, color: '#ef444433', borderColor: '#f87171', icon: '🏰' }
    ];

    const drawVibrantZone = (zone, colorHex, strokeHex, iconText) => {
      const zx = zone.x * cs;
      const zy = zone.y * cs;
      const zw = zone.w * cs;
      const zh = zone.h * cs;

      // Glow fill
      ctx.fillStyle = colorHex || 'rgba(56, 189, 248, 0.25)';
      ctx.fillRect(zx, zy, zw, zh);

      // Strong border
      ctx.strokeStyle = strokeHex || '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(zx, zy, zw, zh);

      // Concentric Beacon Ring
      ctx.beginPath();
      ctx.arc(zx + zw / 2, zy + zh / 2, Math.min(zw, zh) * 0.42, 0, Math.PI * 2);
      ctx.strokeStyle = strokeHex || '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(zx + zw / 2, zy + zh / 2, Math.min(zw, zh) * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = strokeHex || '#38bdf8';
      ctx.fill();

      // Icon badge
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(iconText || '📍', zx + zw / 2, zy + zh / 2);
    };

    zones.forEach(z => {
      drawVibrantZone(z, z.color, z.borderColor, z.icon);
    });

    // 5. Dynamic Waypoints Route Guide (Subtle Floor Indicator underneath creeps)
    const waypoints = (this.activeMap && this.activeMap.waypointCoords) ? this.activeMap.waypointCoords : BALANCE.MAP.WAYPOINT_COORDS;
    const activeGuidePath = (this.activeLane === 'player' && this.hoverPreviewGuidePath)
      ? this.hoverPreviewGuidePath
      : (agent.guidePath || this.pathfinder.findMultiWaypointPath(waypoints, (x, y) => this.isCellBlocked(agent, x, y)));

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

    // Custom Wall Block Ghost Preview during Architect Phase (Centered on mouse cursor)
    if (this.selectedCustomBlock && this.activeLane === 'player') {
      const cursorCenterX = (this.selectedCustomBlock.w * this.cellSize) / 2;
      const cursorCenterY = (this.selectedCustomBlock.h * this.cellSize) / 2;
      const gx = Math.max(0, Math.min(this.width - this.selectedCustomBlock.w, Math.round((this.mouseGridPos.x * cs - cursorCenterX) / cs)));
      const gy = Math.max(0, Math.min(this.height - this.selectedCustomBlock.h, Math.round((this.mouseGridPos.y * cs - cursorCenterY) / cs)));
      const canPlace = this.canPlaceCustomWall(gx, gy, this.selectedCustomBlock);

      const blockRects = this.getBlockSubRects(this.selectedCustomBlock, gx, gy);

      for (const r of blockRects) {
        const rx = r.x * cs;
        const ry = r.y * cs;
        const rw = r.w * cs;
        const rh = r.h * cs;

        ctx.fillStyle = canPlace ? 'rgba(249, 115, 22, 0.45)' : 'rgba(239, 68, 68, 0.45)';
        ctx.fillRect(rx, ry, rw, rh);

        ctx.strokeStyle = canPlace ? '#f97316' : '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(rx, ry, rw, rh);
      }

      const bx = gx * cs;
      const by = gy * cs;
      const bw = this.selectedCustomBlock.w * cs;
      const bh = this.selectedCustomBlock.h * cs;

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${this.selectedCustomBlock.name} [ПКМ/R: Поворот]`, bx + bw / 2, by + bh / 2);
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
    this.renderCharacterSelection();
    this.renderMapVoting();
    this.renderTowerSelector();
    this.renderCreepButtons();
    this.updateHUD();

    const charDef = (BALANCE.CHARACTERS || []).find(c => c.id === this.selectedCharacterId);
    const titleElem = document.getElementById('build-panel-title');
    if (titleElem && charDef) {
      titleElem.innerText = `🔨 БАШНИ: ${charDef.name}`;
    }
  }

  renderTowerSelector() {
    const list = document.getElementById('tower-selector-list');
    if (!list) return;
    list.innerHTML = '';

    const titleElem = document.getElementById('build-panel-title');
    const isCustomMode = (this.activeMap && this.activeMap.isCustom) || this.devArchitectActive;

    // 🛠️ CUSTOM ARCHITECT WALL BLOCKS PANEL
    if (isCustomMode && !this.devTowersTabActive) {
      if (titleElem) titleElem.innerText = `🛠️ СТРОИТЕЛЬСТВО СТЕН (10 БЛОКОВ)`;

      if (!this.myCustomBlocks || this.myCustomBlocks.length === 0) {
        this.myCustomBlocks = BALANCE.getRandomCustomBlocks(10);
      }

      // Banner with count, Auto-Maze, Clear, and Towers toggle
      const banner = document.createElement('div');
      banner.className = 'architect-status-banner';
      banner.innerHTML = `
        <span style="font-weight:700;">🧱 <strong>${this.placedCustomWalls.length} / 10</strong></span>
        <div style="display:flex; gap:4px; align-items:center;">
          <button id="btn-random-walls" style="background:#f59e0b22; color:#fbbf24; border:1px solid #f59e0b; border-radius:4px; padding:2px 6px; font-size:0.65rem; cursor:pointer;" title="Сгенерировать случайный лабиринт">🎲 Авто-лабиринт</button>
          <button id="btn-clear-walls" style="background:#ef444422; color:#f87171; border:1px solid #ef4444; border-radius:4px; padding:2px 6px; font-size:0.65rem; cursor:pointer;">Очистить</button>
          <button id="btn-switch-to-towers" style="background:#38bdf822; color:#38bdf8; border:1px solid #38bdf8; border-radius:4px; padding:2px 6px; font-size:0.65rem; cursor:pointer;">🔨 Башни</button>
        </div>
      `;
      list.appendChild(banner);

      const randomBtn = banner.querySelector('#btn-random-walls');
      if (randomBtn) {
        randomBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.autoGenerateCustomMaze();
        });
      }

      const clearBtn = banner.querySelector('#btn-clear-walls');
      if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.clearAllCustomWalls();
        });
      }

      const towersBtn = banner.querySelector('#btn-switch-to-towers');
      if (towersBtn) {
        towersBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.devTowersTabActive = true;
          this.renderTowerSelector();
        });
      }

      this.myCustomBlocks.forEach((block, idx) => {
        const item = document.createElement('div');
        const isSelected = (this.selectedCustomBlock === block);
        item.className = `architect-block-item ${isSelected ? 'selected' : ''} ${block.placed ? 'placed' : ''}`;

        item.innerHTML = `
          <span class="architect-block-icon">${block.icon || '🧱'}</span>
          <div class="architect-block-info">
            <span class="architect-block-name">${idx + 1}. ${block.name}</span>
            <span class="architect-block-dim">${block.w}×${block.h} клеток ${block.placed ? '✅ Размещен' : ''}</span>
          </div>
        `;

        item.addEventListener('click', () => {
          this.sound.init();
          if (block.placed) return;
          if (this.selectedCustomBlock === block) {
            this.selectedCustomBlock = null;
            this.canvas.style.cursor = 'default';
          } else {
            this.selectedCustomBlock = block;
            this.selectedTowerToBuild = null;
            this.canvas.style.cursor = 'crosshair';
          }
          this.renderTowerSelector();
        });

        list.appendChild(item);
      });
      return;
    }

    // Standard Racial Towers Selector
    const charDef = (BALANCE.CHARACTERS || []).find(c => c.id === this.selectedCharacterId);
    if (titleElem) titleElem.innerText = `🔨 БАШНИ: ${charDef ? charDef.name : ''}`;

    if (isCustomMode && this.devTowersTabActive) {
      const switchBackBanner = document.createElement('div');
      switchBackBanner.className = 'architect-status-banner';
      switchBackBanner.innerHTML = `
        <span>🔨 Режим Башен</span>
        <button id="btn-switch-to-walls" style="background:#f9731622; color:#f97316; border:1px solid #f97316; border-radius:4px; padding:2px 6px; font-size:0.65rem; cursor:pointer;">🧱 К блокам стен</button>
      `;
      list.appendChild(switchBackBanner);

      const wallsBtn = switchBackBanner.querySelector('#btn-switch-to-walls');
      if (wallsBtn) {
        wallsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.devTowersTabActive = false;
          this.renderTowerSelector();
        });
      }
    }

    // Only show Base tower + Racial towers of the selected race!
    const availableTowers = BALANCE.TOWERS.filter(tower =>
      tower.id === 'tower_base' || tower.race === this.selectedCharacterId
    );

    availableTowers.forEach((tower) => {
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
          this.selectedCustomBlock = null;
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

  autoGenerateCustomMaze() {
    this.clearAllCustomWalls();
    if (!this.myCustomBlocks || this.myCustomBlocks.length === 0) {
      this.myCustomBlocks = BALANCE.getRandomCustomBlocks(10);
    }

    let placedCount = 0;
    for (const block of this.myCustomBlocks) {
      let placed = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        const gx = 12 + Math.floor(Math.random() * (this.width - 24 - block.w));
        const gy = 8 + Math.floor(Math.random() * (this.height - 16 - block.h));
        if (this.canPlaceCustomWall(gx, gy, block)) {
          this.placeCustomWall(gx, gy, block);
          placed = true;
          placedCount++;
          break;
        }
      }
    }

    this.sound.build();
    this.logEvent(`🎲 Автоматически сгенерирован лабиринт из ${placedCount} блоков стен!`, 'log-income');
    this.recalculateCreepPaths(this.player);
    this.renderTowerSelector();
    this.updateHUD();
  }

  renderCreepButtons() {
    const grid = document.getElementById('creep-buttons-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const tierBadge = document.getElementById('current-tier-badge');
    if (tierBadge) tierBadge.innerText = `ТИР ${this.player.tier}`;

    const CREEP_HOTKEY_LABELS = ['1', '2', '3', 'Q', 'W', 'E', 'A', 'S', 'D', 'Z', 'X', 'C'];

    this.player.creepSlots.forEach((slot, idx) => {
      const btn = document.createElement('button');
      btn.className = 'creep-btn';
      btn.dataset.slot = String(idx);

      const incSign = slot.def.income >= 0 ? `+${slot.def.income}` : `${slot.def.income}`;
      const hk = CREEP_HOTKEY_LABELS[idx] || '';

      btn.innerHTML = `
        <div class="creep-radial-cooldown" style="--cd-angle: 0deg;"></div>
        <div class="creep-cd-timer-text" style="display: none;"></div>
        <span class="creep-charge-badge">${slot.charges}/10</span>
        ${hk ? `<span class="creep-hotkey-badge">${hk}</span>` : ''}
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

    const curDef = instance ? instance.def : towerDef;
    const nextStandardDef = curDef.upgradeId ? BALANCE.TOWERS.find(t => t.id === curDef.upgradeId) : null;
    const nextRacialDef = BALANCE.getRacialUpgrade(curDef, this.selectedCharacterId);
    const charDef = (BALANCE.CHARACTERS || []).find(c => c.id === this.selectedCharacterId);

    const curCrit = Math.round((curDef.critChance || 0) * 100);

    // Determine if any perk exists on current or next upgrade
    let perkLabel = '';
    let curPerkVal = '';
    if (curDef.multishot || (nextRacialDef && nextRacialDef.multishot)) {
      perkLabel = '🎯 Мультишот:';
      curPerkVal = `${curDef.multishot || 1} цел.`;
    } else if (curDef.slowPercent || (nextRacialDef && nextRacialDef.slowPercent)) {
      perkLabel = '❄️ Замедление:';
      curPerkVal = `${Math.round((curDef.slowPercent || 0) * 100)}%`;
    } else if (curDef.armorShred || (nextRacialDef && nextRacialDef.armorShred)) {
      perkLabel = '🛡 Срез брони:';
      curPerkVal = `-${curDef.armorShred || 0}`;
    } else if (curDef.poisonDps || (nextRacialDef && nextRacialDef.poisonDps)) {
      perkLabel = '🧪 Яд (DoT):';
      curPerkVal = `${curDef.poisonDps || 0}/с`;
    }

    let html = `
      <div class="stat-row">
        <span>Урон:</span>
        <span id="insp-val-dmg" class="stat-val-text">${curDef.damage} ед.</span>
      </div>
      <div class="stat-row">
        <span>Скорость:</span>
        <span id="insp-val-spd" class="stat-val-text">${curDef.attackSpeed} сек</span>
      </div>
      <div class="stat-row">
        <span>Дальность:</span>
        <span id="insp-val-rng" class="stat-val-text">${curDef.range} кл.</span>
      </div>
    `;

    if (curCrit > 0 || (nextStandardDef && nextStandardDef.critChance > 0) || (nextRacialDef && nextRacialDef.critChance > 0)) {
      html += `
        <div class="stat-row">
          <span>Критический урон:</span>
          <span id="insp-val-crit" class="stat-val-text" style="color:#ec4899">${curCrit}% x${curDef.critMultiplier || 1.0}</span>
        </div>
      `;
    }

    if (perkLabel) {
      html += `
        <div class="stat-row">
          <span>${perkLabel}</span>
          <span id="insp-val-perk" class="stat-val-text" style="color:#38bdf8">${curPerkVal}</span>
        </div>
      `;
    }

    html += `<p style="font-size: 0.72rem; color: #94a3b8; margin-top: 4px; line-height: 1.25;">${curDef.desc}</p>`;

    if (instance) {
      html += `
        <hr style="border-color:#334155; margin: 4px 0;">
        <div class="stat-row"><span>Нанесено урона:</span><span>${instance.totalDamageDealt.toLocaleString()}</span></div>
        <div class="stat-row"><span>Убито крипов:</span><span>${instance.kills}</span></div>
      `;
    }

    details.innerHTML = html;

    // Helper to update stat text in-place on hover without touching layout or re-rendering buttons
    const applyPreview = (targetDef) => {
      const eDmg = document.getElementById('insp-val-dmg');
      const eSpd = document.getElementById('insp-val-spd');
      const eRng = document.getElementById('insp-val-rng');
      const eCrit = document.getElementById('insp-val-crit');
      const ePerk = document.getElementById('insp-val-perk');

      if (!targetDef) {
        if (tag) tag.innerText = instance ? `Ур. ${(instance.level || 0) + 1}` : `Цена: 🪙${towerDef.cost}`;
        if (eDmg) eDmg.innerHTML = `${curDef.damage} ед.`;
        if (eSpd) eSpd.innerHTML = `${curDef.attackSpeed} сек`;
        if (eRng) eRng.innerHTML = `${curDef.range} кл.`;
        if (eCrit) eCrit.innerHTML = `${curCrit}% x${curDef.critMultiplier || 1.0}`;
        if (ePerk) ePerk.innerHTML = `${curPerkVal}`;
        return;
      }

      if (tag) tag.innerText = `➜ ${targetDef.name}`;

      if (eDmg) {
        const diff = targetDef.damage - curDef.damage;
        eDmg.innerHTML = `<span style="color:#10b981; font-weight:700;">${targetDef.damage} ед. (+${diff})</span>`;
      }
      if (eSpd) {
        eSpd.innerHTML = `<span style="color:#10b981; font-weight:700;">${targetDef.attackSpeed} сек</span>`;
      }
      if (eRng) {
        const diff = Number((targetDef.range - curDef.range).toFixed(1));
        const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
        eRng.innerHTML = `<span style="color:#10b981; font-weight:700;">${targetDef.range} кл. (${diffStr})</span>`;
      }
      if (eCrit) {
        const nextCrit = Math.round((targetDef.critChance || 0) * 100);
        eCrit.innerHTML = `<span style="color:#10b981; font-weight:700;">${nextCrit}% x${targetDef.critMultiplier || 1.0}</span>`;
      }
      if (ePerk) {
        if (targetDef.multishot) {
          ePerk.innerHTML = `<span style="color:#a855f7; font-weight:700;">➜ ${targetDef.multishot} цел.</span>`;
        } else if (targetDef.slowPercent) {
          ePerk.innerHTML = `<span style="color:#06b6d4; font-weight:700;">➜ -${Math.round(targetDef.slowPercent * 100)}%</span>`;
        } else if (targetDef.armorShred) {
          ePerk.innerHTML = `<span style="color:#10b981; font-weight:700;">➜ -${targetDef.armorShred}</span>`;
        } else if (targetDef.poisonDps) {
          ePerk.innerHTML = `<span style="color:#34d399; font-weight:700;">➜ ${targetDef.poisonDps}/с</span>`;
        }
      }
    };

    if (instance) {
      if (actions) {
        actions.style.display = 'flex';
        const upBtn = document.getElementById('btn-upgrade-tower');
        const upRacialBtn = document.getElementById('btn-upgrade-racial');

        const cost = curDef.upgradeCost || 40;

        // 1. Standard Upgrade Button
        if (upBtn) {
          if (nextStandardDef && curDef.race === 'neutral') {
            upBtn.style.display = 'block';
            upBtn.innerText = `Обычный (🪙 ${cost})`;
            upBtn.onclick = () => {
              applyPreview(null);
              this.upgradeSelectedTower(instance, nextStandardDef, cost);
            };
            upBtn.onmouseenter = () => applyPreview(nextStandardDef);
            upBtn.onmouseleave = () => applyPreview(null);
          } else {
            upBtn.style.display = 'none';
            upBtn.onclick = null;
            upBtn.onmouseenter = null;
            upBtn.onmouseleave = null;
          }
        }

        // 2. Racial Upgrade Button
        if (upRacialBtn) {
          if (nextRacialDef) {
            upRacialBtn.style.display = 'block';
            const badge = charDef ? charDef.badge : 'Расовый';
            upRacialBtn.innerText = `${charDef ? charDef.icon : '✨'} ${badge} (🪙 ${cost})`;
            upRacialBtn.onclick = () => {
              applyPreview(null);
              this.upgradeSelectedTower(instance, nextRacialDef, cost);
            };
            upRacialBtn.onmouseenter = () => applyPreview(nextRacialDef);
            upRacialBtn.onmouseleave = () => applyPreview(null);
          } else {
            upRacialBtn.style.display = 'none';
            upRacialBtn.onclick = null;
            upRacialBtn.onmouseenter = null;
            upRacialBtn.onmouseleave = null;
          }
        }

        // Sell Button
        const sellBtn = document.getElementById('btn-sell-tower');
        if (sellBtn) {
          const refund = Math.round(curDef.cost * 0.75);
          sellBtn.innerText = `Продать (+🪙 ${refund})`;
          sellBtn.onclick = () => {
            applyPreview(null);
            this.sellSelectedTower(instance);
          };
        }
      }
    } else {
      if (actions) actions.style.display = 'none';
    }
  }

  upgradeSelectedTower(instance, targetDef = null, cost = 40) {
    if (!instance) return;
    const nextDef = targetDef || (instance.def.upgradeId ? BALANCE.TOWERS.find(t => t.id === instance.def.upgradeId) : null);
    if (!nextDef) return;

    const actualCost = cost || instance.def.upgradeCost || 40;

    if (!this.isCreativeMode) {
      if (this.player.gold < actualCost) {
        this.logEvent(`⚠️ Недостаточно золота для улучшения (🪙${actualCost})!`, 'log-leak');
        return;
      }
      this.player.gold -= actualCost;
    }

    instance.def = nextDef;
    instance.level = (instance.level || 0) + 1;
    this.sound.build();
    this.logEvent(`⬆️ Башня улучшена до «${nextDef.name}»!`, 'log-income');
    this.showTowerInspectCard(nextDef, instance);
    this.updateHUD();

    if (this.isMultiplayer) {
      this.sendServerCommand('UPGRADE_TOWER', { gx: instance.x, gy: instance.y, nextDefId: nextDef.id, cost: actualCost });
    } else if (this.localCore) {
      this.localCore.handleAction(this.myPlayerId || 'p1', 'UPGRADE_TOWER', { gx: instance.x, gy: instance.y, nextDefId: nextDef.id, cost: actualCost });
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

    const details = document.getElementById('card-details');
    if (details) details.innerHTML = '<p class="placeholder-text">Нажмите на башню или выберите постройку слева.</p>';
    const actions = document.getElementById('card-actions');
    if (actions) actions.style.display = 'none';
    this.updateHUD();

    if (this.isMultiplayer) {
      this.sendServerCommand('SELL_TOWER', { gx: instance.x, gy: instance.y });
    } else if (this.localCore) {
      this.localCore.handleAction(this.myPlayerId || 'p1', 'SELL_TOWER', { gx: instance.x, gy: instance.y });
    }
  }

  updateHUD() {
    // Throttled / smart text updates to prevent browser DOM layout thrashing
    const goldVal = this.isCreativeMode ? '∞' : Math.floor(this.player.gold);
    if (this._lastGold !== goldVal) {
      this._lastGold = goldVal;
      const goldElem = document.getElementById('player-gold');
      if (goldElem) goldElem.innerText = goldVal;
    }

    const incVal = this.isCreativeMode ? '+∞' : `+${this.player.income}`;
    if (this._lastInc !== incVal) {
      this._lastInc = incVal;
      const incElem = document.getElementById('player-income');
      if (incElem) incElem.innerText = incVal;
    }

    const livesVal = this.isCreativeMode ? '∞' : `${this.player.lives} / ${BALANCE.MAP.STARTING_LIVES}`;
    if (this._lastLives !== livesVal) {
      this._lastLives = livesVal;
      const livesElem = document.getElementById('player-lives');
      if (livesElem) livesElem.innerText = livesVal;
    }

    const enemyLivesVal = this.isCreativeMode ? '∞' : `${this.enemy.lives} / ${BALANCE.MAP.STARTING_LIVES}`;
    if (this._lastEnemyLives !== enemyLivesVal) {
      this._lastEnemyLives = enemyLivesVal;
      const enemyLivesElem = document.getElementById('enemy-lives');
      if (enemyLivesElem) enemyLivesElem.innerText = enemyLivesVal;
    }

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

  // --- AUTHORITATIVE WEBSOCKET MULTIPLAYER ---
  connectWebSocketServer(onReadyCallback, onErrorCallback) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (onReadyCallback) onReadyCallback();
      return;
    }

    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }

    let serverUrl = `ws://${window.location.host}`;
    if (window.location.protocol === 'https:') {
      serverUrl = `wss://${window.location.host}`;
    }
    if (!window.location.host || window.location.protocol === 'file:' || window.location.hostname.includes('github.io') || window.location.hostname.includes('surge.sh')) {
      serverUrl = 'ws://46.173.18.121:3000';
    }

    try {
      this.ws = new WebSocket(serverUrl);

      this.ws.onopen = () => {
        console.log('🌐 Подключено к игровому WebSocket серверу:', serverUrl);
        if (onReadyCallback) onReadyCallback();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleIncomingServerMessage(data);
        } catch (e) {
          console.error('Ошибка парсинга сообщения сервера:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('Ошибка подключения к серверу:', err);
        if (onErrorCallback) onErrorCallback(err);
      };

      this.ws.onclose = () => {
        console.log('🔌 Соединение с сервером закрыто.');
      };
    } catch (e) {
      if (onErrorCallback) onErrorCallback(e);
    }
  }

  sendServerCommand(action, payload = {}) {
    if (this.isMultiplayer && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'COMMAND',
        action: action,
        payload: payload
      }));
    } else if (this.localCore) {
      this.localCore.handleAction(this.myPlayerId || 'p1', action, payload);
    }
  }

  handleIncomingServerMessage(data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'MATCHMAKING_SEARCHING': {
        const searchStatus = document.getElementById('mp-search-status');
        if (searchStatus) {
          searchStatus.innerText = data.message || 'Поиск соперника... ⏳';
          searchStatus.style.color = '#38bdf8';
        }
        break;
      }

      case 'MATCHMAKING_CANCELLED': {
        if (this.matchmakingTimerInterval) {
          clearInterval(this.matchmakingTimerInterval);
          this.matchmakingTimerInterval = null;
        }
        const btnFindMatch = document.getElementById('mp-btn-find-match');
        const searchBox = document.getElementById('mp-search-box');
        if (btnFindMatch) btnFindMatch.style.display = 'block';
        if (searchBox) searchBox.classList.add('hidden');
        break;
      }

      case 'ROOM_CREATED': {
        this.roomId = data.roomId;
        this.myPlayerId = data.playerId || 'p1';
        this.isHost = true;
        const hostCodeText = document.getElementById('mp-host-code');
        const hostStatus = document.getElementById('mp-host-status');
        if (hostCodeText) hostCodeText.innerText = data.roomId;
        if (hostStatus) {
          hostStatus.innerText = 'Комната готова! Ожидание входа второго игрока...';
          hostStatus.style.color = '#38bdf8';
        }
        break;
      }

      case 'MATCH_START': {
        if (this.matchmakingTimerInterval) {
          clearInterval(this.matchmakingTimerInterval);
          this.matchmakingTimerInterval = null;
        }
        this.roomId = data.roomId;
        this.myPlayerId = data.playerId;
        this.isHost = (data.role === 'host');
        const modal = document.getElementById('mp-modal');
        if (modal) modal.classList.add('hidden');
        this.startMultiplayerSession(this.isHost);
        this.logEvent(`⚔️ Игра найдена! Соперник: ${data.opponentName || 'Игрок 2'} (Комната #${data.roomId})`, 'log-income');
        break;
      }

      case 'SNAPSHOT': {
        this.handleServerSnapshot(data.snapshot);
        break;
      }

      case 'COMMAND_REJECTED': {
        this.logEvent(`⚠️ Действие отклонено сервером: ${data.reason}`, 'log-leak');
        break;
      }

      case 'PLAYER_DISCONNECTED': {
        this.logEvent(`❌ ${data.message || 'Соперник отключился от игры!'}`, 'log-leak');
        break;
      }
    }
  }

  handleServerSnapshot(snapshot) {
    if (!snapshot) return;

    this.gameState = snapshot.gameState;
    this.prepTimer = snapshot.prepTimer;
    this.gameTimeSeconds = snapshot.gameTime;
    this.incomeTimer = snapshot.incomeTimer;
    this.gameSpeed = snapshot.gameSpeed;

    if (snapshot.mapId && (!this.activeMap || this.activeMap.id !== snapshot.mapId)) {
      this.setMap(snapshot.mapId);
    }

    const myKey = (this.myPlayerId === 'p2') ? 'p2' : 'p1';
    const enemyKey = (myKey === 'p1') ? 'p2' : 'p1';

    const myData = snapshot.players && snapshot.players[myKey];
    const enemyData = snapshot.players && snapshot.players[enemyKey];

    if (myData) {
      this.player.gold = myData.gold;
      this.player.income = myData.income;
      this.player.lives = myData.lives;
      this.player.tier = myData.tier;
      this.myReadyState = myData.ready;

      if (myData.creepSlots) {
        this.player.creepSlots = myData.creepSlots.map(s => {
          const tierData = BALANCE.CREEPS_BY_TIER[this.player.tier] || BALANCE.CREEPS_BY_TIER[1];
          const def = tierData[s.index] || tierData[0];
          return {
            index: s.index,
            def: def,
            charges: s.charges,
            initialCooldownRemaining: s.cdRemaining,
            stackTimer: s.stackTimer
          };
        });
      }
    }

    if (enemyData) {
      this.enemy.gold = enemyData.gold;
      this.enemy.income = enemyData.income;
      this.enemy.lives = enemyData.lives;
      this.enemy.tier = enemyData.tier;
      this.enemyReadyState = enemyData.ready;
    }

    // Sync Towers
    this._syncTowersFromSnapshot(this.player, snapshot.towers ? snapshot.towers[myKey] : []);
    this._syncTowersFromSnapshot(this.enemy, snapshot.towers ? snapshot.towers[enemyKey] : []);

    // Sync Creeps with Smooth Interpolation
    this._syncCreepsFromSnapshot(this.player, snapshot.creeps ? snapshot.creeps[myKey] : []);
    this._syncCreepsFromSnapshot(this.enemy, snapshot.creeps ? snapshot.creeps[enemyKey] : []);

    // Process Events
    if (snapshot.events && snapshot.events.length > 0) {
      for (const ev of snapshot.events) {
        this._processServerEvent(ev);
      }
    }

    // Check Game Over
    if (this.gameState === 'GAME_OVER' && !this.isGameOver) {
      this.isGameOver = true;
      const isVictory = snapshot.winnerId === this.myPlayerId;
      this.triggerGameOver(isVictory);
    }

    this.updateHUD();
    this.updatePrepUI();
  }

  _syncTowersFromSnapshot(agent, serverTowers) {
    if (!serverTowers) return;

    if (agent === this.player) {
      // 1. Remove confirmed pending towers
      for (const st of serverTowers) {
        this.pendingTowers.delete(`${st.x},${st.y}`);
      }

      // 2. Drop expired pending towers (> 4s)
      const now = Date.now();
      for (const [key, pending] of this.pendingTowers.entries()) {
        if (now - pending.timestamp > 4000) {
          this.pendingTowers.delete(key);
        }
      }

      // 3. Clear and rebuild grid
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          agent.grid[y][x] = null;
        }
      }

      const mergedTowers = [];

      for (const st of serverTowers) {
        const towerDef = BALANCE.TOWERS.find(t => t.id === st.defId) || BALANCE.TOWERS[0];
        const tower = {
          id: st.id,
          def: towerDef,
          x: st.x,
          y: st.y,
          level: st.level,
          kills: st.kills,
          totalDamageDealt: st.damageDealt
        };

        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            if (st.y + dy < this.height && st.x + dx < this.width) {
              agent.grid[st.y + dy][st.x + dx] = tower;
            }
          }
        }
        mergedTowers.push(tower);
      }

      // 4. Re-apply unconfirmed pending towers onto the grid seamlessly
      for (const pending of this.pendingTowers.values()) {
        const pt = pending.tower;
        let canReapply = true;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            if (pt.y + dy >= this.height || pt.x + dx >= this.width || agent.grid[pt.y + dy][pt.x + dx] !== null) {
              canReapply = false;
            }
          }
        }
        if (canReapply) {
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              agent.grid[pt.y + dy][pt.x + dx] = pt;
            }
          }
          mergedTowers.push(pt);
        }
      }

      agent.towers = mergedTowers;
      this.recalculateCreepPaths(agent);
    } else {
      // Enemy lane towers sync
      let changed = (agent.towers.length !== serverTowers.length);
      if (!changed) {
        for (let i = 0; i < serverTowers.length; i++) {
          if (agent.towers[i].x !== serverTowers[i].x || agent.towers[i].y !== serverTowers[i].y || (agent.towers[i].def && agent.towers[i].def.id !== serverTowers[i].defId)) {
            changed = true;
            break;
          }
        }
      }

      if (changed) {
        for (let y = 0; y < this.height; y++) {
          for (let x = 0; x < this.width; x++) {
            agent.grid[y][x] = null;
          }
        }

        agent.towers = serverTowers.map(st => {
          const towerDef = BALANCE.TOWERS.find(t => t.id === st.defId) || BALANCE.TOWERS[0];
          const tower = {
            id: st.id,
            def: towerDef,
            x: st.x,
            y: st.y,
            level: st.level,
            kills: st.kills,
            totalDamageDealt: st.damageDealt
          };

          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              if (st.y + dy < this.height && st.x + dx < this.width) {
                agent.grid[st.y + dy][st.x + dx] = tower;
              }
            }
          }
          return tower;
        });

        this.recalculateCreepPaths(agent);
      } else {
        for (let i = 0; i < serverTowers.length; i++) {
          agent.towers[i].kills = serverTowers[i].kills;
          agent.towers[i].totalDamageDealt = serverTowers[i].damageDealt;
        }
      }
    }
  }

  _syncCreepsFromSnapshot(agent, serverCreeps) {
    if (!serverCreeps) return;

    const existingMap = new Map();
    for (const c of agent.creeps) {
      existingMap.set(c.id, c);
    }

    const updatedList = [];

    for (const sc of serverCreeps) {
      let creep = existingMap.get(sc.id);
      if (creep) {
        creep.targetX = sc.x;
        creep.targetY = sc.y;
        creep.hp = sc.hp;
        creep.maxHp = sc.maxHp;
        creep.armor = sc.armor;
        creep.speed = sc.speed;
        creep.currentWaypointStage = sc.stage || creep.currentWaypointStage || 1;
        creep.slow = sc.slow;
        creep.poison = sc.poison;
      } else {
        creep = {
          id: sc.id,
          name: sc.name,
          icon: sc.icon,
          tier: sc.tier,
          hp: sc.hp,
          maxHp: sc.maxHp,
          armor: sc.armor,
          speed: sc.speed,
          x: sc.x,
          y: sc.y,
          targetX: sc.x,
          targetY: sc.y,
          currentWaypointStage: sc.stage || 1,
          slow: sc.slow,
          poison: sc.poison
        };
      }
      updatedList.push(creep);
    }

    agent.creeps = updatedList;
  }

  _processServerEvent(ev) {
    switch (ev.type) {
      case 'BATTLE_STARTED': {
        this.startBattlePhase(ev.mapId);
        break;
      }
      case 'TOWER_BUILT': {
        if (ev.playerId === this.myPlayerId) {
          this.sound.build();
          this.logEvent(`🔨 Построена башня (-🪙${ev.cost})`, 'log-income');
        } else {
          this.logEvent(`🔨 Соперник построил башню`, 'log-income');
        }
        break;
      }
      case 'TOWER_UPGRADED': {
        if (ev.playerId === this.myPlayerId) {
          this.sound.build();
          this.logEvent(`⬆️ Башня улучшена (-🪙${ev.cost})`, 'log-income');
        } else {
          this.logEvent(`⬆️ Соперник улучшил башню`, 'log-income');
        }
        break;
      }
      case 'TOWER_SOLD': {
        if (ev.playerId === this.myPlayerId) {
          this.sound.coin();
          this.logEvent(`💰 Башня продана (+🪙${ev.refund})`, 'log-income');
        } else {
          this.logEvent(`💰 Соперник продал башню`, 'log-income');
        }
        break;
      }
      case 'CREEP_SENT': {
        if (ev.senderId === this.myPlayerId) {
          this.sound.coin();
          this.logEvent(`👾 Отправлен ${ev.creepName} (+${ev.income} инком)`, 'log-spawn');
        } else {
          this.sound.leak();
          this.logEvent(`⚠️ Соперник отправил на вас ${ev.creepName}!`, 'log-leak');
        }
        break;
      }
      case 'TIER_UPGRADED': {
        if (ev.playerId === this.myPlayerId) {
          this.sound.crit();
          this.logEvent(`🌟 ТИР ПОВЫШЕН ДО ${ev.newTier}!`, 'log-kill');
        } else {
          this.logEvent(`🌟 Соперник перешел на ТИР ${ev.newTier}!`, 'log-kill');
        }
        break;
      }
      case 'TOWER_SHOT': {
        const isMyLane = (ev.playerId === this.myPlayerId);
        const lane = isMyLane ? 'player' : 'enemy';
        this.projectiles.push({
          id: `proj_${Date.now()}_${Math.random()}`,
          lane: lane,
          x: ev.towerX !== undefined ? ev.towerX : (ev.x || 0),
          y: ev.towerY !== undefined ? ev.towerY : (ev.y || 0),
          targetX: ev.targetX || 0,
          targetY: ev.targetY || 0,
          speed: 34,
          color: ev.color || '#38bdf8'
        });
        if ((isMyLane && this.activeLane === 'player') || (!isMyLane && this.activeLane === 'enemy')) {
          this.sound.shoot();
        }
        break;
      }
      case 'CREEP_HIT': {
        const isMyLane = (ev.playerId === this.myPlayerId && this.activeLane === 'player') ||
                         (ev.playerId !== this.myPlayerId && this.activeLane === 'enemy');
        if (isMyLane) {
          if (ev.isCrit) {
            this.sound.crit();
            this.addFloatingText(ev.x, ev.y - 1.0, `💥${ev.damage}!`, '#ec4899', 1.2);
          } else {
            this.sound.hit();
            this.addFloatingText(ev.x, ev.y - 0.6, `${ev.damage}`, '#cbd5e1', 0.8);
          }
          this.createHitSparks(ev.x, ev.y, '#38bdf8');
        }
        break;
      }
      case 'CREEP_KILLED': {
        if (ev.playerId === this.myPlayerId) {
          this.sound.coin();
          this.addFloatingText(ev.x, ev.y, `+🪙${ev.bounty}`, '#f59e0b', 1.0);
          this.logEvent(`💀 Убит ${ev.name} (+🪙${ev.bounty})`, 'log-kill');
        }
        this.createDeathBurst(ev.x, ev.y, '#f59e0b');
        break;
      }
      case 'CREEP_LEAKED': {
        if (ev.playerId === this.myPlayerId) {
          this.sound.leak();
          this.addFloatingText(ev.x, ev.y, `-1 ❤️`, '#ef4444', 1.4);
          this.logEvent(`🚨 УТЕЧКА! ${ev.creepName} прошел базу (-1 ❤️)!`, 'log-leak');
        } else {
          this.logEvent(`🎯 Твой ${ev.creepName} прошел базу соперника!`, 'log-income');
        }
        break;
      }
      case 'INCOME_PAYOUT': {
        this.sound.coin();
        this.logEvent(`💰 Получен инком: +🪙${this.player.income}`, 'log-income');
        this.addFloatingText(this.width / 2, 4, `+🪙${this.player.income}`, '#10b981');
        break;
      }
    }
  }

  initMultiplayerUI() {
    const btnMp = document.getElementById('btn-multiplayer');
    const modal = document.getElementById('mp-modal');
    const btnClose = document.getElementById('mp-btn-close');

    // 1. Quick Matchmaking Elements
    const btnFindMatch = document.getElementById('mp-btn-find-match');
    const searchBox = document.getElementById('mp-search-box');
    const searchStatus = document.getElementById('mp-search-status');
    const searchTimer = document.getElementById('mp-search-timer');
    const btnCancelSearch = document.getElementById('mp-btn-cancel-search');

    // 2. Custom Room Navigation
    const viewMatchmaking = document.getElementById('mp-view-matchmaking');
    const viewCustom = document.getElementById('mp-view-custom');
    const btnToggleCustom = document.getElementById('mp-toggle-custom-rooms');
    const btnBackToQuick = document.getElementById('mp-back-to-quick');

    // 3. Custom Room Elements
    const tabHost = document.getElementById('mp-tab-host');
    const tabJoin = document.getElementById('mp-tab-join');
    const customHostBox = document.getElementById('mp-custom-host-box');
    const customJoinBox = document.getElementById('mp-custom-join-box');
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
        if (this.matchmakingTimerInterval) {
          clearInterval(this.matchmakingTimerInterval);
          this.matchmakingTimerInterval = null;
        }
        if (this.ws && this.ws.readyState === WebSocket.OPEN && !this.isMatchActive) {
          this.ws.send(JSON.stringify({ type: 'CANCEL_MATCHMAKING' }));
        }
      });
    }

    // --- 1. Quick Matchmaking Trigger ---
    if (btnFindMatch) {
      btnFindMatch.addEventListener('click', () => {
        this.sound.init();
        btnFindMatch.style.display = 'none';
        if (searchBox) searchBox.classList.remove('hidden');
        if (searchStatus) {
          searchStatus.innerText = 'Подключение к серверу... ⏳';
          searchStatus.style.color = '#38bdf8';
        }

        let secondsInQueue = 0;
        if (searchTimer) searchTimer.innerText = '00:00';
        if (this.matchmakingTimerInterval) clearInterval(this.matchmakingTimerInterval);
        this.matchmakingTimerInterval = setInterval(() => {
          secondsInQueue++;
          const m = Math.floor(secondsInQueue / 60).toString().padStart(2, '0');
          const s = Math.floor(secondsInQueue % 60).toString().padStart(2, '0');
          if (searchTimer) searchTimer.innerText = `${m}:${s}`;
        }, 1000);

        this.connectWebSocketServer(
          () => {
            if (searchStatus) searchStatus.innerText = 'Поиск соперника... ⏳';
            this.ws.send(JSON.stringify({
              type: 'FIND_MATCH',
              playerName: 'Игрок'
            }));
          },
          (err) => {
            if (searchStatus) {
              searchStatus.innerText = 'Сервер недоступен. Проверьте соединение.';
              searchStatus.style.color = '#ef4444';
            }
            if (this.matchmakingTimerInterval) {
              clearInterval(this.matchmakingTimerInterval);
              this.matchmakingTimerInterval = null;
            }
          }
        );
      });
    }

    if (btnCancelSearch) {
      btnCancelSearch.addEventListener('click', () => {
        this.sound.init();
        if (this.matchmakingTimerInterval) {
          clearInterval(this.matchmakingTimerInterval);
          this.matchmakingTimerInterval = null;
        }
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'CANCEL_MATCHMAKING' }));
        }
        if (btnFindMatch) btnFindMatch.style.display = 'block';
        if (searchBox) searchBox.classList.add('hidden');
      });
    }

    // --- 2. Toggle Navigation ---
    if (btnToggleCustom && viewMatchmaking && viewCustom) {
      btnToggleCustom.addEventListener('click', () => {
        viewMatchmaking.classList.add('hidden');
        viewCustom.classList.remove('hidden');
      });
    }

    if (btnBackToQuick && viewMatchmaking && viewCustom) {
      btnBackToQuick.addEventListener('click', () => {
        viewCustom.classList.add('hidden');
        viewMatchmaking.classList.remove('hidden');
      });
    }

    // --- 3. Custom Room Tabs ---
    if (tabHost && tabJoin && customHostBox && customJoinBox) {
      tabHost.addEventListener('click', () => {
        tabHost.classList.add('active');
        tabJoin.classList.remove('active');
        customHostBox.classList.remove('hidden');
        customJoinBox.classList.add('hidden');
      });

      tabJoin.addEventListener('click', () => {
        tabJoin.classList.add('active');
        tabHost.classList.remove('active');
        customJoinBox.classList.remove('hidden');
        customHostBox.classList.add('hidden');
      });
    }

    // Create Room (Host)
    if (btnCreateRoom) {
      btnCreateRoom.addEventListener('click', () => {
        this.sound.init();
        this.isHost = true;

        btnCreateRoom.style.display = 'none';
        if (hostCodeBox) hostCodeBox.classList.remove('hidden');
        if (hostCodeText) hostCodeText.innerText = '----';
        if (hostStatus) {
          hostStatus.innerText = 'Подключение к защищенному серверу...';
          hostStatus.style.color = '#38bdf8';
        }

        this.connectWebSocketServer(
          () => {
            this.ws.send(JSON.stringify({
              type: 'CREATE_ROOM',
              playerName: 'Хост'
            }));
          },
          (err) => {
            if (hostStatus) {
              hostStatus.innerText = 'Сервер недоступен. Запустите node server.js';
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
        joinStatus.innerText = 'Подключение к защищенному серверу...';
        joinStatus.style.color = '#38bdf8';

        this.connectWebSocketServer(
          () => {
            joinStatus.innerText = `Вход в комнату ${code}...`;
            this.ws.send(JSON.stringify({
              type: 'JOIN_ROOM',
              roomId: code,
              playerName: 'Гость'
            }));
          },
          (err) => {
            joinStatus.innerText = 'Не удалось подключиться к серверу';
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
    this.incomeTimer = BALANCE.MAP_CONFIG.INCOME_INTERVAL_SEC;

    // Reset boards for clean match
    this.player.towers = [];
    this.player.grid = Array.from({ length: this.height }, () => Array(this.width).fill(null));
    this.player.creeps = [];
    this.player.gold = BALANCE.MAP_CONFIG.STARTING_GOLD;
    this.player.income = BALANCE.MAP_CONFIG.STARTING_INCOME;
    this.player.lives = BALANCE.MAP_CONFIG.STARTING_LIVES;
    this.player.tier = 1;

    this.enemy.towers = [];
    this.enemy.grid = Array.from({ length: this.height }, () => Array(this.width).fill(null));
    this.enemy.creeps = [];
    this.enemy.gold = BALANCE.MAP_CONFIG.STARTING_GOLD;
    this.enemy.income = BALANCE.MAP_CONFIG.STARTING_INCOME;
    this.enemy.lives = BALANCE.MAP_CONFIG.STARTING_LIVES;
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
      modeBadge.innerText = isHost ? '👑 1v1 PvP (Хост - Сервер)' : '🎮 1v1 PvP (Клиент - Сервер)';
      modeBadge.style.background = '#10b981';
      modeBadge.style.color = '#fff';
    }

    const enemyLabel = document.getElementById('enemy-label');
    if (enemyLabel) enemyLabel.innerText = 'БАЗА СОПЕРНИКА';

    this.sound.crit();
    this.logEvent(`🌐 ПОДКЛЮЧЕНО! Начался защищенный 1v1 PvP матч на сервере!`, 'log-kill');
    this.updateHUD();
    this.recalculateEffectiveSpeed();

    this.hoverPreviewGuidePath = null;
    this.recalculateCreepPaths(this.player);
    this.recalculateCreepPaths(this.enemy);

    // Sync initial speed choice
    this.sendServerCommand('SPEED_VOTE', { speed: this.mySpeedVote });

    // Start 60-second preparation phase with character / deck selection
    this.startPreparationPhase();
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

    // Panning with Middle or Right Drag when zoomed in, or Drag-to-Draw Towers with Left Click
    this.canvas.addEventListener('mousedown', (e) => {
      this.sound.init();

      if (e.button === 1 || (e.button === 2 && this.camera.zoom > 1.0)) {
        this.camera.isDragging = true;
        this.camera.dragStartX = e.clientX;
        this.camera.dragStartY = e.clientY;
        this.camera.startCamX = this.camera.x;
        this.camera.startCamY = this.camera.y;
        this.camera.hasDragged = false;
        return;
      }

      // Left Click: Tower Drawing or Selection OR Architect Custom Wall Placement
      if (e.button === 0 && this.activeLane === 'player') {
        const { mx, my } = this.getCanvasMousePos(e, true);

        // Custom Architect Block Placement (Centered on mouse cursor)
        if (this.selectedCustomBlock) {
          const cursorCenterX = (this.selectedCustomBlock.w * this.cellSize) / 2;
          const cursorCenterY = (this.selectedCustomBlock.h * this.cellSize) / 2;
          const buildGx = Math.max(0, Math.min(this.width - this.selectedCustomBlock.w, Math.round((mx - cursorCenterX) / this.cellSize)));
          const buildGy = Math.max(0, Math.min(this.height - this.selectedCustomBlock.h, Math.round((my - cursorCenterY) / this.cellSize)));
          this.placeCustomWall(buildGx, buildGy, this.selectedCustomBlock);
          return;
        }

        if (this.selectedTowerToBuild) {
          this.isDrawingTowers = true;
          this.currentDrawStroke = [];

          const buildGx = Math.max(0, Math.min(this.width - 2, Math.round(mx / this.cellSize) - 1));
          const buildGy = Math.max(0, Math.min(this.height - 2, Math.round(my / this.cellSize) - 1));
          this.lastDrawGx = buildGx;
          this.lastDrawGy = buildGy;

          const existingTower = this.player.grid[buildGy] && this.player.grid[buildGy][buildGx];
          if (!existingTower) {
            const success = this.placeTower(this.player, buildGx, buildGy, this.selectedTowerToBuild, true, true);
            if (success) {
              const placed = this.player.grid[buildGy][buildGx];
              if (placed) {
                this.currentDrawStroke.push(placed);
                this.selectedEntity = placed;
                this.showTowerInspectCard(this.selectedTowerToBuild, placed);
              }
            } else {
              this.sound.leak();
              this.logEvent("⚠️ Нельзя строить здесь (стена, контрольные точки или блокировка маршрута)!", 'log-leak');
            }
          }
        } else {
          // Check existing tower at 1x1 clicked cell
          const rawGx = Math.max(0, Math.min(this.width - 1, Math.floor(mx / this.cellSize)));
          const rawGy = Math.max(0, Math.min(this.height - 1, Math.floor(my / this.cellSize)));
          const existingTower = this.player.grid[rawGy] && this.player.grid[rawGy][rawGx];

          if (existingTower) {
            this.selectedEntity = existingTower;
            this.clearBuildSelection();
            this.showTowerInspectCard(existingTower.def, existingTower);
          } else {
            this.selectedEntity = null;
            this.previewUpgradeTower = null;
            const details = document.getElementById('card-details');
            if (details) details.innerHTML = '<p class="placeholder-text">Нажмите на башню для просмотра характеристик или выберите постройку выше.</p>';
            const actions = document.getElementById('card-actions');
            if (actions) actions.style.display = 'none';
          }
        }
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

    window.addEventListener('mouseup', (e) => {
      if (this.camera.isDragging) {
        this.camera.isDragging = false;
      }

      if (e.button === 0 && this.isDrawingTowers) {
        this.isDrawingTowers = false;
        this.lastDrawGx = -1;
        this.lastDrawGy = -1;
        if (this.currentDrawStroke && this.currentDrawStroke.length > 0) {
          this.buildHistoryStack.push([...this.currentDrawStroke]);
          this.currentDrawStroke = [];
        }
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

      // Real-time Drawing when dragging mouse with tower selected
      if (this.isDrawingTowers && this.selectedTowerToBuild && this.activeLane === 'player') {
        const buildGx = this.mouseGridPos.x;
        const buildGy = this.mouseGridPos.y;

        if (buildGx !== this.lastDrawGx || buildGy !== this.lastDrawGy) {
          this.lastDrawGx = buildGx;
          this.lastDrawGy = buildGy;

          const existing = this.player.grid[buildGy] && this.player.grid[buildGy][buildGx];
          if (!existing) {
            const success = this.placeTower(this.player, buildGx, buildGy, this.selectedTowerToBuild, true, true);
            if (success) {
              const placed = this.player.grid[buildGy][buildGx];
              if (placed) {
                this.currentDrawStroke.push(placed);
                this.selectedEntity = placed;
                this.showTowerInspectCard(this.selectedTowerToBuild, placed);
              }
            }
          }
        }
      }

      // Real-time dynamic route preview when hovering a tower placement
      if (this.activeLane === 'player' && this.selectedTowerToBuild) {
        const buildGx = this.mouseGridPos.x;
        const buildGy = this.mouseGridPos.y;
        if (buildGx !== this.lastHoverGx || buildGy !== this.lastHoverGy) {
          this.lastHoverGx = buildGx;
          this.lastHoverGy = buildGy;
          if (this.canPlaceTower(this.player, buildGx, buildGy)) {
            const simulatedBlocked = (x, y) => ((x === buildGx || x === buildGx + 1) && (y === buildGy || y === buildGy + 1)) || this.isCellBlocked(this.player, x, y);
            const waypoints = (this.activeMap && this.activeMap.waypointCoords) ? this.activeMap.waypointCoords : BALANCE.MAP.WAYPOINT_COORDS;
            this.hoverPreviewGuidePath = this.pathfinder.findMultiWaypointPath(waypoints, simulatedBlocked);
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

      // 1. When a custom block is selected to place, Right Click ROTATES the block!
      if (this.selectedCustomBlock !== null) {
        this.rotateBlock(this.selectedCustomBlock);
        return;
      }

      // 2. When NOT holding a block, right-clicking an existing custom wall removes it
      if (this.placedCustomWalls && this.placedCustomWalls.length > 0) {
        const { mx, my } = this.getCanvasMousePos(e, true);
        const gx = Math.floor(mx / this.cellSize);
        const gy = Math.floor(my / this.cellSize);

        const clickedWallIdx = this.placedCustomWalls.findIndex(w => {
          const rects = this.getBlockSubRects(w);
          return rects.some(r => gx >= r.x && gx < r.x + r.w && gy >= r.y && gy < r.y + r.h);
        });

        if (clickedWallIdx !== -1) {
          const removedWall = this.placedCustomWalls.splice(clickedWallIdx, 1)[0];
          const origBlock = (this.myCustomBlocks || []).find(b => b.instanceId === removedWall.instanceId);
          if (origBlock) origBlock.placed = false;
          this.sound.coin();
          this.logEvent(`↩️ Удален блок стены: ${removedWall.name}`, 'log-income');
          this.recalculateCreepPaths(this.player);
          this.renderTowerSelector();
          this.updateHUD();
          return;
        }
      }

      if (this.selectedTowerToBuild !== null) {
        this.clearBuildSelection();
      } else if (this.selectedEntity !== null) {
        this.selectedEntity = null;
        this.previewUpgradeTower = null;
        const details = document.getElementById('card-details');
        if (details) details.innerHTML = '<p class="placeholder-text">Нажмите на башню для просмотра характеристик или выберите постройку выше.</p>';
        const actions = document.getElementById('card-actions');
        if (actions) actions.style.display = 'none';
      }
    });

    // Keyboard Shortcuts: Delete (Sell Tower), Ctrl+Z (Undo), Escape, R (Rotate Block), Creep Spawning Hotkeys
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

      // 0. Delete / Del / Backspace: Sell selected tower or remove hovered tower / wall
      if (e.key === 'Delete' || e.key === 'Del' || e.key === 'Backspace') {
        if (this.selectedEntity) {
          e.preventDefault();
          this.sellSelectedTower(this.selectedEntity);
          return;
        }

        // If no tower is currently selected in inspector card, check tower under mouse cursor!
        if (this.activeLane === 'player') {
          const gx = this.mouseGridPos.x;
          const gy = this.mouseGridPos.y;

          // Check if hovering a tower (2x2 search around cursor)
          const hoveredTower = (this.player.grid[gy] && this.player.grid[gy][gx])
            || (this.player.grid[gy + 1] && this.player.grid[gy + 1][gx])
            || (this.player.grid[gy] && this.player.grid[gy][gx + 1])
            || (this.player.grid[gy + 1] && this.player.grid[gy + 1][gx + 1]);

          if (hoveredTower) {
            e.preventDefault();
            this.sellSelectedTower(hoveredTower);
            return;
          }

          // Check if hovering a custom wall block
          if (this.placedCustomWalls && this.placedCustomWalls.length > 0) {
            const clickedWallIdx = this.placedCustomWalls.findIndex(w => {
              const rects = this.getBlockSubRects(w);
              return rects.some(r => gx >= r.x && gx < r.x + r.w && gy >= r.y && gy < r.y + r.h);
            });

            if (clickedWallIdx !== -1) {
              e.preventDefault();
              const removedWall = this.placedCustomWalls.splice(clickedWallIdx, 1)[0];
              const origBlock = (this.myCustomBlocks || []).find(b => b.instanceId === removedWall.instanceId);
              if (origBlock) origBlock.placed = false;
              this.sound.coin();
              this.logEvent(`↩️ Удален блок стены: ${removedWall.name}`, 'log-income');
              this.recalculateCreepPaths(this.player);
              this.renderTowerSelector();
              this.updateHUD();
              return;
            }
          }
        }
      }

      // Rotate Custom Block on 'R' / 'К'
      if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
        if (this.selectedCustomBlock !== null) {
          e.preventDefault();
          this.rotateBlock(this.selectedCustomBlock);
          return;
        }
      }

      // 1. Ctrl + Z (Undo last tower build action / stroke)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.key === 'Я')) {
        e.preventDefault();
        this.undoLastBuild();
        return;
      }

      // 2. Escape: Cancel block/tower placement / selection / zoom
      if (e.key === 'Escape') {
        if (this.selectedCustomBlock !== null) {
          this.selectedCustomBlock = null;
          this.canvas.style.cursor = 'default';
          this.renderTowerSelector();
          return;
        }
        if (this.camera.zoom > 1.01) {
          this.camera.zoom = 1.0;
          this.camera.x = 0;
          this.camera.y = 0;
        }
        this.clearBuildSelection();
        this.selectedEntity = null;
        this.previewUpgradeTower = null;
        const details = document.getElementById('card-details');
        if (details) details.innerHTML = '<p class="placeholder-text">Нажмите на башню для просмотра характеристик или выберите постройку выше.</p>';
        const actions = document.getElementById('card-actions');
        if (actions) actions.style.display = 'none';
        return;
      }

      // 3. Creep Spawning Hotkeys
      const k = e.key.toLowerCase();
      const hotkeyMap = {
        '1': 0,
        '2': 1,
        '3': 2,
        'q': 3, 'й': 3,
        'w': 4, 'ц': 4, 'v': 4, 'м': 4,
        'e': 5, 'у': 5,
        'a': 6, 'ф': 6,
        's': 7, 'ы': 7,
        'd': 8, 'в': 8,
        'z': 9, 'я': 9,
        'x': 10, 'ч': 10,
        'c': 11, 'с': 11
      };

      if (!e.ctrlKey && !e.altKey && !e.metaKey && hotkeyMap[k] !== undefined) {
        const slotIdx = hotkeyMap[k];
        if (this.player.creepSlots && this.player.creepSlots[slotIdx]) {
          e.preventDefault();
          this.sound.init();
          this.sendCreepAction(slotIdx);
        }
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
          this.sendServerCommand('SPEED_VOTE', { speed: this.mySpeedVote });
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

    // Preparation Phase Ready & Start Buttons Listeners
    const btnReady = document.getElementById('btn-player-ready');
    if (btnReady) {
      btnReady.addEventListener('click', () => {
        this.toggleReady();
      });
    }

    const btnModalReady = document.getElementById('btn-modal-ready');
    if (btnModalReady) {
      btnModalReady.addEventListener('click', () => {
        this.toggleReady();
      });
    }

    // Creative Mode ("Melafon") Listeners
    const btnCreative = document.getElementById('btn-creative-mode');
    const mpBtnCreative = document.getElementById('mp-btn-creative-mode');
    const melafonInput = document.getElementById('melafon-input');

    if (btnCreative) {
      btnCreative.addEventListener('click', () => {
        this.sound.init();
        if (this.isCreativeMode) return;
        const modal = document.getElementById('mp-modal');
        if (modal) modal.classList.remove('hidden');
        if (melafonInput) {
          melafonInput.focus();
          melafonInput.select();
        }
      });
    }

    if (mpBtnCreative) {
      mpBtnCreative.addEventListener('click', () => {
        const val = melafonInput ? melafonInput.value : '';
        this.tryUnlockCreative(val);
      });
    }

    if (melafonInput) {
      melafonInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.tryUnlockCreative(melafonInput.value);
        }
      });
    }

    // Secret Word Keyboard Listener ("TOOLL" / "melafon" / "dev")
    window.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (e.key && e.key.length === 1) {
        this.secretCodeBuffer = (this.secretCodeBuffer + e.key.toLowerCase()).slice(-10);
        if (
          this.secretCodeBuffer.includes('tooll') ||
          this.secretCodeBuffer.includes('tool') ||
          this.secretCodeBuffer.includes('тул') ||
          this.secretCodeBuffer.includes('melafon') ||
          this.secretCodeBuffer.includes('мелафон') ||
          this.secretCodeBuffer.includes('melofon') ||
          this.secretCodeBuffer.includes('miofon') ||
          this.secretCodeBuffer.includes('dev')
        ) {
          this.secretCodeBuffer = '';
          this.startDevMode();
        }
      }
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.gameInstance = new TowerWarsGame();
});
