/**
 * Ultra-Fast Typed-Array Grid A* Pathfinding with Multi-Waypoint Routing
 * Flat integer indexing (zero string allocations, sub-millisecond execution).
 */

class FastMinHeap {
  constructor(capacity = 2048) {
    this.nodes = new Int32Array(capacity);
    this.keys = new Float32Array(capacity);
    this.size = 0;
  }

  clear() {
    this.size = 0;
  }

  push(node, key) {
    if (this.size >= this.nodes.length) {
      const newNodes = new Int32Array(this.nodes.length * 2);
      const newKeys = new Float32Array(this.keys.length * 2);
      newNodes.set(this.nodes);
      newKeys.set(this.keys);
      this.nodes = newNodes;
      this.keys = newKeys;
    }
    let i = this.size++;
    this.nodes[i] = node;
    this.keys[i] = key;

    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      const tmpN = this.nodes[i]; this.nodes[i] = this.nodes[p]; this.nodes[p] = tmpN;
      const tmpK = this.keys[i]; this.keys[i] = this.keys[p]; this.keys[p] = tmpK;
      i = p;
    }
  }

  pop() {
    if (this.size === 0) return -1;
    const top = this.nodes[0];
    this.size--;
    if (this.size > 0) {
      this.nodes[0] = this.nodes[this.size];
      this.keys[0] = this.keys[this.size];
      let i = 0;
      while (true) {
        let left = (i << 1) + 1;
        let right = left + 1;
        let smallest = i;
        if (left < this.size && this.keys[left] < this.keys[smallest]) smallest = left;
        if (right < this.size && this.keys[right] < this.keys[smallest]) smallest = right;
        if (smallest === i) break;
        const tmpN = this.nodes[i]; this.nodes[i] = this.nodes[smallest]; this.nodes[smallest] = tmpN;
        const tmpK = this.keys[i]; this.keys[i] = this.keys[smallest]; this.keys[smallest] = tmpK;
        i = smallest;
      }
    }
    return top;
  }
}

class PathFinder {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.nodeCount = width * height;

    this.heap = new FastMinHeap(2048);
    this.cameFrom = new Int32Array(this.nodeCount);
    this.gScore = new Float32Array(this.nodeCount);
    this.visitedToken = new Uint32Array(this.nodeCount);
    this.currentToken = 1;
  }

  // Find path from (startX, startY) to (endX, endY)
  findPath(startX, startY, endX, endY, isBlockedFn) {
    if (startX < 0 || startX >= this.width || startY < 0 || startY >= this.height) return null;
    if (endX < 0 || endX >= this.width || endY < 0 || endY >= this.height) return null;
    if (isBlockedFn(startX, startY) || isBlockedFn(endX, endY)) return null;

    const startIdx = startY * this.width + startX;
    const targetIdx = endY * this.width + endX;
    if (startIdx === targetIdx) return [{ x: startX, y: startY }];

    const token = ++this.currentToken;
    const heap = this.heap;
    heap.clear();

    const cameFrom = this.cameFrom;
    const gScore = this.gScore;
    const visited = this.visitedToken;
    const width = this.width;
    const height = this.height;

    gScore[startIdx] = 0;
    visited[startIdx] = token;
    cameFrom[startIdx] = -1;

    const h = Math.abs(startX - endX) + Math.abs(startY - endY);
    heap.push(startIdx, h);

    while (heap.size > 0) {
      const curIdx = heap.pop();
      if (curIdx === targetIdx) {
        // Reconstruct path
        const path = [];
        let curr = curIdx;
        while (curr !== -1) {
          path.push({ x: curr % width, y: (curr / width) | 0 });
          curr = cameFrom[curr];
        }
        path.reverse();
        return path;
      }

      const curX = curIdx % width;
      const curY = (curIdx / width) | 0;
      const curG = gScore[curIdx];

      // 4 cardinal neighbors
      // Up, Down, Left, Right
      for (let dir = 0; dir < 4; dir++) {
        let nx = curX;
        let ny = curY;
        if (dir === 0) ny--;
        else if (dir === 1) ny++;
        else if (dir === 2) nx--;
        else nx++;

        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        if (isBlockedFn(nx, ny)) continue;

        const nIdx = ny * width + nx;
        const nextG = curG + 1;

        if (visited[nIdx] !== token || nextG < gScore[nIdx]) {
          visited[nIdx] = token;
          gScore[nIdx] = nextG;
          cameFrom[nIdx] = curIdx;
          const f = nextG + (Math.abs(nx - endX) + Math.abs(ny - endY));
          heap.push(nIdx, f);
        }
      }
    }

    return null;
  }

  // Find chained multi-waypoint path with cached segmented outputs
  findMultiWaypointPath(points, isBlockedFn) {
    if (!points || points.length < 2) return null;

    const fullPath = [];
    const segments = [];

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const leg = this.findPath(Math.round(p1.x), Math.round(p1.y), Math.round(p2.x), Math.round(p2.y), isBlockedFn);
      if (!leg) return null; // Path broken on this leg

      segments.push(leg);

      const startIdx = (fullPath.length > 0) ? 1 : 0;
      for (let j = startIdx; j < leg.length; j++) {
        fullPath.push(leg[j]);
      }
    }

    fullPath.segments = segments;
    return fullPath;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PathFinder };
}
