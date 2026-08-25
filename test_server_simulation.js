const { WebSocket } = require('ws');
const http = require('http');

async function runTest() {
  const targetUrl = process.env.WS_URL || 'ws://46.173.18.121:3000';
  console.log(`--- Starting Authoritative Server Integration Test on ${targetUrl} ---`);
  
  // 1. Test Matchmaking (Quick Match)
  console.log('--- TEST 1: Quick 1-Click Matchmaking (FIND_MATCH) ---');
  const p1Ws = new WebSocket(targetUrl);
  const p2Ws = new WebSocket(targetUrl);
  
  await Promise.all([
    new Promise((res) => p1Ws.on('open', res)),
    new Promise((res) => p2Ws.on('open', res))
  ]);
  console.log('1. Both players connected to WebSocket server');

  const p1Messages = [];
  const p2Messages = [];

  p1Ws.on('message', (msg) => p1Messages.push(JSON.parse(msg.toString())));
  p2Ws.on('message', (msg) => p2Messages.push(JSON.parse(msg.toString())));

  // Player 1 enters matchmaking queue
  p1Ws.send(JSON.stringify({ type: 'FIND_MATCH', playerName: 'Alice' }));

  // Wait for MATCHMAKING_SEARCHING
  await new Promise((resolve) => {
    const check = setInterval(() => {
      const searching = p1Messages.find(m => m.type === 'MATCHMAKING_SEARCHING');
      if (searching) {
        clearInterval(check);
        resolve();
      }
    }, 50);
  });
  console.log('2. Player 1 in queue (MATCHMAKING_SEARCHING received)');

  // Player 2 enters matchmaking queue -> should immediately match!
  p2Ws.send(JSON.stringify({ type: 'FIND_MATCH', playerName: 'Bob' }));

  // Wait for MATCH_START on both players
  let matchedRoomId = null;
  await new Promise((resolve) => {
    const check = setInterval(() => {
      const p1Start = p1Messages.find(m => m.type === 'MATCH_START');
      const p2Start = p2Messages.find(m => m.type === 'MATCH_START');
      if (p1Start && p2Start) {
        matchedRoomId = p1Start.roomId;
        clearInterval(check);
        resolve();
      }
    }, 50);
  });
  console.log(`3. Matchmaking SUCCESS! Matched into Room #${matchedRoomId}`);

  // 2. Both vote READY
  p1Ws.send(JSON.stringify({ type: 'COMMAND', action: 'READY_VOTE', payload: { ready: true, mapId: 'classic', raceId: 'humans' } }));
  p2Ws.send(JSON.stringify({ type: 'COMMAND', action: 'READY_VOTE', payload: { ready: true, mapId: 'classic', raceId: 'elves' } }));

  // Wait for SNAPSHOT in BATTLE state
  let battleSnapshot = null;
  await new Promise((resolve) => {
    const check = setInterval(() => {
      const snap = p1Messages.find(m => m.type === 'SNAPSHOT' && m.snapshot.gameState === 'BATTLE');
      if (snap) {
        battleSnapshot = snap.snapshot;
        clearInterval(check);
        resolve();
      }
    }, 50);
  });
  console.log(`4. Match entered BATTLE state! Map: ${battleSnapshot.mapId}, Tick: ${battleSnapshot.tick}`);

  // Test Valid Build Tower
  p1Ws.send(JSON.stringify({ type: 'COMMAND', action: 'BUILD_TOWER', payload: { gx: 10, gy: 14, towerId: 'tower_base' } }));
  
  // Wait for snapshot with 1 tower
  await new Promise((resolve) => {
    const check = setInterval(() => {
      const lastSnap = p1Messages[p1Messages.length - 1];
      if (lastSnap && lastSnap.snapshot && lastSnap.snapshot.towers && lastSnap.snapshot.towers.p1.length === 1) {
        clearInterval(check);
        resolve();
      }
    }, 50);
  });
  console.log('5. Valid Tower Built and Authoritatively confirmed in server snapshot!');

  // Test Anti-Cheat
  p1Ws.send(JSON.stringify({ type: 'COMMAND', action: 'BUILD_TOWER', payload: { gx: 100, gy: 100, towerId: 'tower_base' } }));
  await new Promise((resolve) => {
    const check = setInterval(() => {
      const rejected = p1Messages.find(m => m.type === 'COMMAND_REJECTED');
      if (rejected) {
        console.log(`6. Anti-Cheat Test Passed! Server rejected illegal command: ${rejected.reason}`);
        clearInterval(check);
        resolve();
      }
    }, 50);
  });

  p1Ws.close();
  p2Ws.close();
  console.log('--- All Integration & Matchmaking Tests PASSED 100% ---');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
