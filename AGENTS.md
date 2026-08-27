# Global Rules & Developer Specification — Tower Wars

> **Project**: Tower Wars (2D 1v1 PvP Real-Time Strategy)  
> **Repository**: [https://github.com/Tooll2/tower-wars](https://github.com/Tooll2/tower-wars)  
> **Production Live Server**: [http://46.173.18.121:3000](http://46.173.18.121:3000)  
> **Frontend Mirror (GitHub Pages)**: [https://tooll2.github.io/tower-wars/](https://tooll2.github.io/tower-wars/)  
> **OS Environment**: Windows (PowerShell) local, Ubuntu Linux (systemd) on VPS  
> **Architecture**: Authoritative Headless Game Server (30 FPS) + Client-Side Prediction (60 FPS Canvas) + 1-Click Matchmaking

---

## 1. Primary VPS Production & Deployment Protocol

> [!IMPORTANT]
> **VPS `46.173.18.121:3000` is the PRIMARY authoritative production host for the game.**  
> All code changes, balance updates, server fixes, and client features MUST be pushed to GitHub and deployed to the VPS.

### VPS Access Details
| Parameter | Value |
|---|---|
| **Host IP** | `46.173.18.121` (Beget VPS «Stable Sorrel») |
| **Port** | `3000` (HTTP + WebSocket) |
| **SSH User** | `root` |
| **SSH Key (Local Path)** | `C:\Users\А\.ssh\hermes_beget` |
| **Server Code Directory** | `/opt/tower-wars` |
| **Systemd Service** | `tower-wars.service` |

### Neighbor Service Isolation Rule (CRITICAL)
> [!CAUTION]
> On this same VPS, the **Hermes Agent** service is running in `/opt/hermes-agent` (ports `9119` and `8642`).  
> **NEVER kill, reboot, reconfigure, or interfere with Hermes processes or ports.**  
> ONLY touch `/opt/tower-wars` and `tower-wars.service`.

### Standard Full Deployment Pipeline (Run by AI Agents after changes)
```bash
# Step 1: Check syntax locally
node -c balance.js; node -c pathfinding.js; node -c core.js; node -c server.js; node -c game.js

# Step 2: Commit and push to GitHub
git add .
git commit -m "Descriptive summary of changes"
git push origin master

# Step 3: Pull on VPS and restart game service
ssh -i "C:\Users\А\.ssh\hermes_beget" -o StrictHostKeyChecking=no root@46.173.18.121 "cd /opt/tower-wars && git pull origin master && systemctl restart tower-wars.service && systemctl status tower-wars.service --no-pager"

# Step 4: Run integration & matchmaking test against live VPS
node test_server_simulation.js
```

---

## 2. Language & Output Formatting

### Language
- Always respond in Russian unless the user explicitly writes in another language.

### Skills & ADHD Output Mode
- **Always use the `i-have-adhd` skill for output formatting across all sessions**:
  - Lead with the direct next action.
  - Number multi-step work (maximum 5 items).
  - End with one concrete next action.
  - Suppress tangents and unnecessary background detail.
  - Restate state across turns.
  - Give specific numbers and time estimates.
  - Make wins visible.
  - Matter-of-fact error reporting.
  - **No preamble, no recap, no closing pleasantries**.
  - Deactivate only when the user explicitly says `"stop adhd mode"` or `"normal mode"`.

---

## 3. Engineering Principles & Code Discipline

### Default Engineering Mode (`ponytail` / YAGNI)
- **Hierarchy of Choice**: YAGNI → Existing project pattern → Native platform / Web API → Already-installed library → Minimum viable code.
- **Avoid Over-Engineering**: Implement only what is explicitly requested.
- **No Unrequested Refactoring**: Do not clean up, rename, or reformat working existing code unless asked.
- **Full Implementation**: Never use placeholders like `// ... rest of code` or `// todo`. Always provide complete code.

### Code Preservation
- Preserve unrelated behavior and functions.
- Do not delete or rewrite working logic unless the current task requires it.
- Simplification is allowed only inside the touched behavior and only when the replacement preserves the required contract.
- Never alter functions unrelated to the current task.

### Strict Modification Policy
- If the user asks `"can you do this?"` or similar feasibility questions — answer the question first; **do NOT start making changes until the user explicitly says to proceed**.
- Treat questions about feasibility as inquiries, not commands.
- **Investigate Before Fixing**: The user may be mistaken in their assumptions. If the user describes a problem, first investigate the codebase to find the real root cause rather than blindly patching symptoms.
- When something is unclear, ask before doing.

---

## 4. Architecture & Core Systems

### File Layout
| File | Responsibilities |
|---|---|
| [`server.js`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/server.js) | Node.js HTTP static server, WebSocket hub, 30 FPS tick loop, 1-click Matchmaking queue (`FIND_MATCH`), room lifecycle, connection management. |
| [`core.js`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/core.js) | Headless Authoritative Game Engine (`GameMatch`): full combat simulation, creep movement, tower targeting/DPS, armor reduction, income timer (15s), gold/bounty, anti-cheat validation, binary snapshot generator. |
| [`game.js`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/game.js) | Client engine (60 FPS Canvas rendering, particle FX, sound manager, input scaling, zero-latency `pendingTowers` prediction, dead-reckoning creep interpolation, HUD). |
| [`balance.js`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/balance.js) | Map metrics (70×66), 4 symmetric zones (11×11), central wall (18×42), tower definitions, 12 creep tiers, armor formula, income progression. |
| [`pathfinding.js`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/pathfinding.js) | High-speed Grid A* with flat typed-array memory, `closedToken` generation tagging, multi-waypoint chaining, cycle guard. |
| [`index.html`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/index.html) | DOM structure, Canvas wrapper, Matchmaking UI modal, Melafon sandbox entry, speed controls. |
| [`style.css`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/style.css) | Dark theme, neon accents, responsive HUD layout, radial cooldowns (`conic-gradient`), matchmaking spinner. |
| [`test_server_simulation.js`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/test_server_simulation.js) | Automated integration test script for matchmaking, room creation, combat snapshots, and anti-cheat checks against live VPS. |

### Map Coordinates & Scaling
- **Internal Resolution**: 840 × 792 pixels (70 cells wide × 66 cells high, 12px cell size).
- **Coordinate Scaling**:
  `scaleX = 840 / canvas.getBoundingClientRect().width`
  `scaleY = 792 / canvas.getBoundingClientRect().height`
- **4 Symmetrical Waypoint Zones (11 × 11 Cells)**:
  - Spawn (Bottom-Right): `{ x: 59, y: 55, w: 11, h: 11 }`
  - Waypoint 1 (Top-Right): `{ x: 59, y: 0, w: 11, h: 11 }`
  - Waypoint 2 (Top-Left): `{ x: 0, y: 0, w: 11, h: 11 }`
  - Exit Base (Bottom-Left): `{ x: 0, y: 55, w: 11, h: 11 }`
- **Central Wall**: `{ x: 26, y: 24, w: 18, h: 42 }`

---

## 5. Network Protocol & Actions (WebSocket)

### 1-Click Matchmaking Flow
1. Client sends `{ type: 'FIND_MATCH', playerName: '...' }`.
2. If another player is waiting in `matchmakingQueue`, server immediately pairs them into a generated room.
3. Both clients receive `MATCH_START` (`role: 'host' | 'guest'`, `roomId`, `playerId`).
4. Server starts 30 Hz simulation loop (`startRoomSimulation`).
5. Client sends `{ type: 'CANCEL_MATCHMAKING' }` if player cancels search.

### Commands Sent by Client (`COMMAND`)
| Action | Payload Example | Description |
|---|---|---|
| `READY_VOTE` | `{ ready: true, mapId: 'classic', raceId: 'humans' }` | Votes ready during preparation phase. |
| `BUILD_TOWER` | `{ gx: 10, gy: 14, towerId: 'tower_base' }` | Builds tower at coordinates (verified by server). |
| `UPGRADE_TOWER` | `{ gx: 10, gy: 14, nextDefId: 'gun_t1' }` | Upgrades existing tower (verified by server). |
| `SELL_TOWER` | `{ gx: 10, gy: 14 }` | Sells tower and refunds gold (verified by server). |
| `SEND_CREEP` | `{ tier: 1, slotIndex: 2 }` | Spawns creep in enemy lane, adds income (verified by server). |
| `UPGRADE_TIER` | `{}` | Upgrades player tech tier (verified by server). |
| `SPEED_VOTE` | `{ speed: 2 }` | Votes game speed (1x / 2x / 4x). |

### Snapshots Sent by Server (`SNAPSHOT` @ 30 FPS)
Contains:
- `gameState`, `prepTimer`, `gameTime`, `incomeTimer`, `gameSpeed`
- `players`: `{ p1: { gold, income, lives, tier, ready, creepSlots }, p2: ... }`
- `towers`: `{ p1: [ { id, defId, x, y, level, kills, damageDealt } ], p2: [...] }`
- `creeps`: `{ p1: [ { id, name, icon, tier, hp, maxHp, armor, speed, x, y, stage, slow, poison } ], p2: [...] }`
- `events`: Array of discrete combat events (`TOWER_SHOT`, `CREEP_HIT`, `CREEP_KILLED`, `CREEP_LEAKED`, `INCOME_PAYOUT`, etc.)

---

## 6. Zero-Latency Prediction & Interpolation

1. **Pending Towers (`this.pendingTowers`)**:
   - When a player clicks to build a tower, client immediately places it on `agent.grid` (0 ms latency).
   - Incoming snapshots do not erase the tower while it is pending confirmation from the server.
   - Once server snapshot includes the tower, it is removed from `pendingTowers`.
2. **Creep Interpolation**:
   - Server sends creep positions at 30 FPS.
   - Client smoothly steps creep position toward `(targetX, targetY)` every animation frame (60 FPS).
3. **Opponent Lane Visibility**:
   - Both player lane creeps and enemy lane creeps are broadcast in snapshots so players can see their attacks marching through the opponent's maze.

---

## 7. Session Handoff Format

When completing a session or passing context to another AI agent, provide a concise handoff:
1. **Current Goal**: What was requested.
2. **Files Touched**: Exact list of modified files.
3. **Decisions Made & Implemented**: Key architectural and balance choices.
4. **Verification Status**: Test results and live deployment URL on VPS.
5. **Concrete Next Steps**: Exactly what the next agent or developer should work on.
