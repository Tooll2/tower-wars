const { WebSocket } = require('ws');
const http = require('http');

async function runTest() {
  const targetUrl = process.env.WS_URL || 'ws://46.173.18.121:3000';
  console.log(`--- Starting Authoritative Server Integration Test on ${targetUrl} ---`);
  
  // Connect Host
  const hostWs = new WebSocket(targetUrl);
  
  await new Promise((resolve) => hostWs.on('open', resolve));
  console.log('1. Host connected to ws://localhost:3000');
  
  let roomId = null;
  
  const hostMessages = [];
  const guestMessages = [];
  
  hostWs.on('message', (msg) => {
    hostMessages.push(JSON.parse(msg.toString()));
  });

  // Host creates room
  hostWs.send(JSON.stringify({ type: 'CREATE_ROOM', playerName: 'PlayerHost' }));
  
  // Wait for ROOM_CREATED
  await new Promise((resolve) => {
    const check = setInterval(() => {
      const found = hostMessages.find(m => m.type === 'ROOM_CREATED');
      if (found) {
        roomId = found.roomId;
        clearInterval(check);
        resolve();
      }
    }, 50);
  });
  
  console.log(`2. Room created with Code: ${roomId}`);

  // Connect Guest
  const guestWs = new WebSocket(targetUrl);
  await new Promise((resolve) => guestWs.on('open', resolve));
  console.log('3. Guest connected');
  
  guestWs.on('message', (msg) => {
    guestMessages.push(JSON.parse(msg.toString()));
  });

  guestWs.send(JSON.stringify({ type: 'JOIN_ROOM', roomId: roomId, playerName: 'PlayerGuest' }));

  // Wait for MATCH_START on both
  await new Promise((resolve) => {
    const check = setInterval(() => {
      const hStart = hostMessages.find(m => m.type === 'MATCH_START');
      const gStart = guestMessages.find(m => m.type === 'MATCH_START');
      if (hStart && gStart) {
        clearInterval(check);
        resolve();
      }
    }, 50);
  });

  console.log('4. MATCH_START received by both Host and Guest');

  // Both vote READY
  hostWs.send(JSON.stringify({ type: 'COMMAND', action: 'READY_VOTE', payload: { ready: true, mapId: 'classic', raceId: 'humans' } }));
  guestWs.send(JSON.stringify({ type: 'COMMAND', action: 'READY_VOTE', payload: { ready: true, mapId: 'classic', raceId: 'elves' } }));

  // Wait for SNAPSHOT in BATTLE state
  let battleSnapshot = null;
  await new Promise((resolve) => {
    const check = setInterval(() => {
      const snap = hostMessages.find(m => m.type === 'SNAPSHOT' && m.snapshot.gameState === 'BATTLE');
      if (snap) {
        battleSnapshot = snap.snapshot;
        clearInterval(check);
        resolve();
      }
    }, 50);
  });

  console.log(`5. Match entered BATTLE state! Map: ${battleSnapshot.mapId}, Tick: ${battleSnapshot.tick}`);

  // Test Valid Build Tower
  hostWs.send(JSON.stringify({ type: 'COMMAND', action: 'BUILD_TOWER', payload: { gx: 10, gy: 14, towerId: 'tower_base' } }));
  
  // Wait for snapshot with 1 tower
  await new Promise((resolve) => {
    const check = setInterval(() => {
      const lastSnap = hostMessages[hostMessages.length - 1];
      if (lastSnap && lastSnap.snapshot && lastSnap.snapshot.towers && lastSnap.snapshot.towers.p1.length === 1) {
        clearInterval(check);
        resolve();
      }
    }, 50);
  });

  console.log('6. Valid Tower Built and Authoritatively confirmed in server snapshot!');

  // Test Cheat Attempt: Build with invalid coordinates (out of bounds)
  hostWs.send(JSON.stringify({ type: 'COMMAND', action: 'BUILD_TOWER', payload: { gx: 100, gy: 100, towerId: 'tower_base' } }));

  await new Promise((resolve) => {
    const check = setInterval(() => {
      const rejected = hostMessages.find(m => m.type === 'COMMAND_REJECTED');
      if (rejected) {
        console.log(`7. Anti-Cheat Test Passed! Server rejected illegal command: ${rejected.reason}`);
        clearInterval(check);
        resolve();
      }
    }, 50);
  });

  hostWs.close();
  guestWs.close();
  console.log('--- Integration Test PASSED 100% ---');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
