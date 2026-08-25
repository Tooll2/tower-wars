# Global Rules & Developer Specification — Tower Wars

> **Project**: Tower Wars (2D 1v1 PvP Real-Time Strategy)  
> **Repository**: [https://github.com/Tooll2/tower-wars](https://github.com/Tooll2/tower-wars)  
> **Production Live URL**: [https://tooll2.github.io/tower-wars/](https://tooll2.github.io/tower-wars/)  
> **OS Environment**: Windows (PowerShell)  
> **Network Protocol**: Public MQTT over WebSockets (`wss://broker.emqx.io:8084/mqtt` / `wss://broker.hivemq.com:8884/mqtt`)

---

## 1. Language & Output Formatting

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

## 2. Engineering Principles & Code Discipline

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

## 3. Subagent & Orchestration Discipline

- **No Double Work**: When delegating work to a subagent, end the turn and do not inspect the same files in parallel.
- **Direct Execution for Small Tasks**: If a task requires < 3 tool calls, do it directly instead of spawning a subagent.
- **Confirmatory Checks Only**: When a subagent reports back, do at most 1–2 targeted verification checks rather than re-doing the whole search.

---

## 4. Terminal & Workspace Rules (Windows)

- Operating System: **Windows** (PowerShell / `pwsh`).
- When searching files with `grep_search` / `rg` or `find_by_name`, always exclude heavy folders:
  `node_modules`, `.git`, `.netlify`, `dist`, `vendor`, `brain`.
- Before committing, always run a JS syntax check:
  ```bash
  node -c game.js; node -c balance.js; node -c pathfinding.js
  ```

---

## 5. Deployment & CI/CD Pipeline

### Production Deployment (GitHub Pages)
The site is hosted on GitHub Pages and automatically deploys on every push:
```bash
git add .
git commit -m "Descriptive message"
git push origin master
```
- **Production URL**: [https://tooll2.github.io/tower-wars/](https://tooll2.github.io/tower-wars/)
- **Build Duration**: ~15–25 seconds.
- **Status Check**: Run `gh run list` in terminal to monitor the GitHub Actions workflow.

### Fallback Deployment (Surge.sh)
If GitHub Pages is ever throttled or unavailable:
```bash
npx --yes surge . shango-tower-wars-pvp.surge.sh
```

---

## 6. Architecture & Core Systems

### File Layout
| File | Responsibilities |
|---|---|
| [`index.html`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/index.html) | DOM hierarchy, HUD, speed controls, modal popups, Canvas wrapper. |
| [`style.css`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/style.css) | Responsive layout, dark theme, radial clockwise cooldowns (`conic-gradient`), lane tabs. |
| [`game.js`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/game.js) | Main loop (60 FPS), collision/combat, audio, mouse coordinates scaling, MQTT network manager. |
| [`balance.js`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/balance.js) | Map metrics (70×66), 4 equal zones (11×11), wall (18×42), tower stats, 12 creep tiers, armor formula. |
| [`pathfinding.js`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/pathfinding.js) | High-speed Grid A* algorithm with multi-point chained route calculation. |
| [`.github/workflows/deploy.yml`](file:///C:/Users/А/.gemini/antigravity/scratch/tower_wars_prototype/.github/workflows/deploy.yml) | GitHub Actions workflow for automatic Pages publication. |

### Map Coordinates & Scaling
- **Internal Resolution**: 840 × 792 pixels (70 cells wide × 66 cells high, 12px cell size).
- **Coordinate Scaling**: Always scale mouse input using:
  `scaleX = 840 / canvas.getBoundingClientRect().width`
  `scaleY = 792 / canvas.getBoundingClientRect().height`
- **4 Symmetrical Waypoint Zones (11 × 11 Cells)**:
  - Spawn (Bottom-Right): `{ x: 59, y: 55, w: 11, h: 11 }`
  - Waypoint 1 (Top-Right): `{ x: 59, y: 0, w: 11, h: 11 }`
  - Waypoint 2 (Top-Left): `{ x: 0, y: 0, w: 11, h: 11 }`
  - Exit Base (Bottom-Left): `{ x: 0, y: 55, w: 11, h: 11 }`
- **Central Wall**: `{ x: 26, y: 24, w: 18, h: 42 }`

### Harmonized Game Speed
- Speed is always: `effectiveSpeed = Math.min(player1Vote, player2Vote)`.
- Choices: `1x`, `2x`, `4x`.

---

## 7. Network Protocol (MQTT WebSockets)

Room topic format: `shangotw/room/{ROOM_ID}` (4-digit room code).

| Action | Direction | Payload Example | Description |
|---|---|---|---|
| `GUEST_JOINED` | Guest → Host | `{ guestId: "p_123" }` | Guest informs host of room entry. |
| `MATCH_START` | Host → Guest | `{ hostId: "p_456" }` | Host triggers match start on both ends. |
| `BUILD_TOWER` | Either → Opponent | `{ gx: 10, gy: 14, towerId: "basic" }` | Syncs tower placement. |
| `UPGRADE_TOWER` | Either → Opponent | `{ gx: 10, gy: 14, nextDefId: "gun_t1" }` | Syncs tower upgrade. |
| `SELL_TOWER` | Either → Opponent | `{ gx: 10, gy: 14 }` | Syncs tower sale and path recalculation. |
| `SEND_CREEP` | Either → Opponent | `{ tier: 1, slotIndex: 2 }` | Spawns creep in opponent's lane. |
| `TIER_UPGRADE` | Either → Opponent | `{ tier: 2 }` | Syncs player tier. |
| `LIVES_SYNC` | Either → Opponent | `{ lives: 48 }` | Syncs remaining base lives. |
| `SPEED_VOTE` | Either → Opponent | `{ speed: 4 }` | Syncs speed vote. |

---

## 8. Session Handoff Format

When completing a session or passing context to another AI agent, provide a concise handoff:
1. **Current Goal**: What was requested.
2. **Files Touched**: Exact list of modified files.
3. **Decisions Made & Implemented**: Key architectural and balance choices.
4. **Verification Status**: Test results and live deployment URL.
5. **Concrete Next Steps**: Exactly what the next agent or developer should work on.
