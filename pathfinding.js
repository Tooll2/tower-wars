/**
 * Fast Grid A* Pathfinding with Multi-Waypoint Routing
 */

class PathFinder {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }

  // Find path from (startX, startY) to (endX, endY)
  findPath(startX, startY, endX, endY, isBlockedFn) {
    if (isBlockedFn(startX, startY) || isBlockedFn(endX, endY)) {
      return null;
    }

    const openSet = [];
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    const nodeKey = (x, y) => `${x},${y}`;
    const parseKey = (key) => key.split(',').map(Number);
    const heuristic = (x1, y1, x2, y2) => Math.abs(x1 - x2) + Math.abs(y1 - y2);

    const startK = nodeKey(startX, startY);

    gScore.set(startK, 0);
    fScore.set(startK, heuristic(startX, startY, endX, endY));
    openSet.push({ x: startX, y: startY, f: fScore.get(startK) });

    const openSetLookup = new Set([startK]);
    const closedSet = new Set();

    const neighbors = [
      { dx: 0, dy: -1 }, // Up
      { dx: 0, dy: 1 },  // Down
      { dx: -1, dy: 0 }, // Left
      { dx: 1, dy: 0 }   // Right
    ];

    while (openSet.length > 0) {
      let minIdx = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < openSet[minIdx].f) {
          minIdx = i;
        }
      }

      const current = openSet.splice(minIdx, 1)[0];
      const curK = nodeKey(current.x, current.y);
      openSetLookup.delete(curK);

      if (current.x === endX && current.y === endY) {
        const path = [];
        let curr = curK;
        while (curr) {
          const [cx, cy] = parseKey(curr);
          path.unshift({ x: cx, y: cy });
          curr = cameFrom.get(curr);
        }
        return path;
      }

      closedSet.add(curK);

      for (const n of neighbors) {
        const nx = current.x + n.dx;
        const ny = current.y + n.dy;

        if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;

        const nextK = nodeKey(nx, ny);
        if (closedSet.has(nextK)) continue;
        if (isBlockedFn(nx, ny)) continue;

        const tentativeG = gScore.get(curK) + 1;

        if (!gScore.has(nextK) || tentativeG < gScore.get(nextK)) {
          cameFrom.set(nextK, curK);
          gScore.set(nextK, tentativeG);
          const f = tentativeG + heuristic(nx, ny, endX, endY);
          fScore.set(nextK, f);

          if (!openSetLookup.has(nextK)) {
            openSet.push({ x: nx, y: ny, f });
            openSetLookup.add(nextK);
          }
        }
      }
    }

    return null;
  }

  // Find chained multi-waypoint path
  findMultiWaypointPath(points, isBlockedFn) {
    if (!points || points.length < 2) return null;

    const fullPath = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const leg = this.findPath(Math.round(p1.x), Math.round(p1.y), Math.round(p2.x), Math.round(p2.y), isBlockedFn);
      if (!leg) return null; // Path broken on this leg

      // Append leg (skip first node if already in fullPath)
      const startIdx = (fullPath.length > 0) ? 1 : 0;
      for (let j = startIdx; j < leg.length; j++) {
        fullPath.push(leg[j]);
      }
    }

    return fullPath;
  }
}
