# AGENTS.md — Developer & AI Agent Guide for Shango Tower Wars

> **Project Name**: Shango Tower Wars (2D 1v1 PvP Real-Time Strategy)  
> **Repository**: [https://github.com/Tooll2/tower-wars](https://github.com/Tooll2/tower-wars)  
> **Production Live URL**: [https://tooll2.github.io/tower-wars/](https://tooll2.github.io/tower-wars/)  
> **Network Protocol**: Serverless MQTT over WebSockets (`wss://broker.emqx.io:8084/mqtt` / `wss://broker.hivemq.com:8884/mqtt`)

---

## 1. Project Architecture & Philosophy

Shango Tower Wars is a purely multiplayer, client-side, zero-backend 2D Tower Defense & Wars game inspired by classic Warcraft 3 Tower Wars maps.

### Core Architecture Principles
1. **Zero External Backend Required**: Peer-to-peer style multiplayer is handled via globally accessible, firewall-unblocked public MQTT WebSocket brokers.
2. **Deterministic Mechanics**: 1v1 PvP matches synchronize via structured action payloads. Game speed is harmonized using the **Minimum-of-Both** rule (`Math.min(player1Speed, player2Speed)`).
3. **Pure Vanilla Web Stack**: No Node.js bundling step is required. Built with Vanilla JS (ES6+), HTML5 Canvas 2D, and CSS3 Flexbox/Grid.

---

## 2. File Structure & Responsibilities

| File | Purpose & Responsibilities |
|---|---|
| [`index.html`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/index.html) | UI skeleton, HUD elements, lane tabs, speed voting widget, modals, canvas wrapper, and CDN scripts. |
| [`style.css`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/style.css) | Dark theme styling, responsive flex/grid layout, radial clockwise cooldown animation (`conic-gradient`), and lane tabs glowing states. |
| [`game.js`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/game.js) | Main game loop (`requestAnimationFrame`), entity management, input handling, canvas 2D rendering, networking, and audio synthesizer (`SoundFx`). |
| [`balance.js`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/balance.js) | Map coordinates (70×66 grid, 4 symmetrical 11×11 waypoints, 18×42 central wall), tower archetypes, 12 creep definitions, armor damage reduction tables, and income intervals. |
| [`pathfinding.js`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/pathfinding.js) | High-performance Grid A* pathfinder with multi-waypoint chained routing (`findMultiWaypointPath`). |
| [`.github/workflows/deploy.yml`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/.github/workflows/deploy.yml) | GitHub Actions CI/CD workflow that publishes the master branch to GitHub Pages automatically on every `git push`. |

---

## 3. How to Deploy (CI/CD Pipeline)

### Primary Hosting: GitHub Pages
Every commit pushed to the `master` branch is automatically built and deployed via GitHub Actions:
```bash
git add .
git commit -m "Descriptive commit message"
git push origin master
```
- **Live URL**: [https://tooll2.github.io/tower-wars/](https://tooll2.github.io/tower-wars/)
- **Build Time**: ~15–25 seconds.
- **Monitoring**: Run `gh run list` in terminal to check deployment progress.

### Fallback Deploy: Surge.sh
If GitHub Pages is ever unavailable, deploy instantly to Surge:
```bash
npx --yes surge . shango-tower-wars-pvp.surge.sh
```

---

## 4. Map & Balance Specifications

### 1. The Map (70 × 66 Cells)
- **Map Dimensions**: Width = 70 cells, Height = 66 cells.
- **Tower Footprint**: 2 × 2 cells (35 × 33 max tower grid).
- **Central Impassable Wall**: `{ x: 26, y: 24, w: 18, h: 42 }` (Separates left and right lanes).
- **4 Symmetrical Control Zones (11 × 11 Cells)**:
  - **Spawn Zone (Bottom-Right)**: `{ x: 59, y: 55, w: 11, h: 11 }` — Center: `{ x: 64, y: 60 }` (🚀)
  - **Checkpoint 1 (Top-Right)**: `{ x: 59, y: 0, w: 11, h: 11 }` — Center: `{ x: 64, y: 5 }` (1️⃣)
  - **Checkpoint 2 (Top-Left)**: `{ x: 0, y: 0, w: 11, h: 11 }` — Center: `{ x: 5, y: 5 }` (2️⃣)
  - **Goal / Base (Bottom-Left)**: `{ x: 0, y: 55, w: 11, h: 11 }` — Center: `{ x: 5, y: 60 }` (🏰)
- **Pathing Rule**: Creeps must travel in order: `Spawn -> Checkpoint 1 -> Checkpoint 2 -> Goal`. Towers cannot completely block this path.

### 2. Economy & Creeps
- **Starting Gold**: 🪙 100
- **Starting Income**: +20 every 15 seconds
- **Starting Lives**: 50 ❤️
- **Creep Charge Accumulation**: Charges stack up to 10.
- **Clockwise Radial Cooldown**: Displays remaining unlock/charge seconds with real-time `conic-gradient` sweep.

---

## 5. Multiplayer Action Protocol (MQTT WebSockets)

Rooms are identified by a 4-digit room code `XXXX`.  
MQTT Topic: `shangotw/room/{ROOM_ID}`

### Network Action Table
| Action | Direction | Payload Example | Description |
|---|---|---|---|
| `GUEST_JOINED` | Guest \(\to\) Host | `{ guestId: "p_12345" }` | Guest informs host that they entered the room. |
| `MATCH_START` | Host \(\to\) Guest | `{ hostId: "p_67890" }` | Host starts the match for both clients. |
| `BUILD_TOWER` | Either \(\to\) Opponent | `{ gx: 10, gy: 14, towerId: "basic" }` | Syncs tower placement on the opponent's lane. |
| `UPGRADE_TOWER` | Either \(\to\) Opponent | `{ gx: 10, gy: 14, nextDefId: "gun_t1" }` | Syncs tower upgrade. |
| `SELL_TOWER` | Either \(\to\) Opponent | `{ gx: 10, gy: 14 }` | Syncs tower removal/sale and path recalculation. |
| `SEND_CREEP` | Either \(\to\) Opponent | `{ tier: 1, slotIndex: 2 }` | Spawns creep on the opponent's board. |
| `TIER_UPGRADE` | Either \(\to\) Opponent | `{ tier: 2 }` | Syncs tier upgrade. |
| `LIVES_SYNC` | Either \(\to\) Opponent | `{ lives: 48 }` | Syncs remaining base lives. |
| `SPEED_VOTE` | Either \(\to\) Opponent | `{ speed: 4 }` | Syncs player speed vote (Game speed = `Min(p1, p2)`). |

---

## 6. Developer Workflows & How to Make Changes

### Local Testing
Open [`index.html`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/index.html) in any browser, or use Python/Node static server:
```bash
# Python
python -m http.server 8080

# Node / npx
npx serve .
```

### Syntax Validation
Before committing, always validate JS syntax:
```bash
node -c game.js
node -c balance.js
node -c pathfinding.js
```

---

## 7. Guidelines for AI Agents Continuing Work

1. **Keep Global Formatting Rules**: Always adhere to ADHD user format rules (lead with action, \(\le 5\) items, specific numbers, no pleasantries).
2. **Preserve Network Sync**: Whenever adding new tower skills, creep abilities, or game modes, ensure action payloads are dispatched in `sendNetAction()` and handled in `handleIncomingNetMessage()`.
3. **Preserve Canvas Scaling**: The canvas coordinate system is fixed to 840×792 internally. All mouse coordinates MUST be scaled via `scaleX = 840 / rect.width` and `scaleY = 792 / rect.height`.
