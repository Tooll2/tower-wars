/**
 * Tower Wars - Dedicated Authoritative Game Server
 * Provides HTTP static file hosting + 30 FPS Authoritative WebSocket Simulation Engine.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer, WebSocket } = require('ws');
const { GameMatch } = require('./core.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const TICK_RATE = 30; // 30 authoritative simulation ticks per second
const TICK_DT = 1 / TICK_RATE;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// 1. Static HTTP Server
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, reqPath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

// 2. Real-time Authoritative WebSocket Server
const wss = new WebSocketServer({ server });
const rooms = new Map();
const matchmakingQueue = [];

function sendJson(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function removeFromQueue(ws) {
  const idx = matchmakingQueue.findIndex(item => item.ws === ws);
  if (idx !== -1) {
    matchmakingQueue.splice(idx, 1);
    console.log(`[МЭТЧМЕЙКИНГ] Игрок покинул очередь (в очереди: ${matchmakingQueue.length})`);
  }
}

function startRoomSimulation(room) {
  if (room.interval) return;

  room.interval = setInterval(() => {
    if (!room.match) return;

    const effectiveDt = TICK_DT * (room.match.gameSpeed || 1);
    room.match.step(effectiveDt);

    const snapshot = room.match.getSnapshot();
    const packet = JSON.stringify({
      type: 'SNAPSHOT',
      snapshot: snapshot
    });

    if (room.hostWs && room.hostWs.readyState === WebSocket.OPEN) {
      room.hostWs.send(packet);
    }
    if (room.guestWs && room.guestWs.readyState === WebSocket.OPEN) {
      room.guestWs.send(packet);
    }
  }, 1000 / TICK_RATE);
}

function stopRoomSimulation(room) {
  if (room && room.interval) {
    clearInterval(room.interval);
    room.interval = null;
  }
}

wss.on('connection', (ws) => {
  let currentRoomId = null;
  let playerId = null; // 'p1' (host) or 'p2' (guest)

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case 'PING': {
          sendJson(ws, { type: 'PONG', timestamp: data.timestamp });
          break;
        }

        case 'FIND_MATCH': {
          // Clean disconnected clients from queue
          while (matchmakingQueue.length > 0 && matchmakingQueue[0].ws.readyState !== WebSocket.OPEN) {
            matchmakingQueue.shift();
          }

          if (matchmakingQueue.length > 0) {
            // Pair with waiting player!
            const opponent = matchmakingQueue.shift();
            if (opponent.ws === ws) {
              matchmakingQueue.push({ ws, playerName: data.playerName || 'Игрок 1', time: Date.now() });
              return;
            }

            const roomId = String(Math.floor(1000 + Math.random() * 9000));
            const p1Name = opponent.playerName || 'Игрок 1';
            const p2Name = data.playerName || 'Игрок 2';

            const match = new GameMatch({
              p1Id: 'p1',
              p1Name: p1Name,
              p2Id: 'p2',
              p2Name: p2Name
            });

            const room = {
              id: roomId,
              hostWs: opponent.ws,
              guestWs: ws,
              match: match,
              interval: null,
              created: Date.now()
            };

            rooms.set(roomId, room);

            currentRoomId = roomId;
            playerId = 'p2';

            opponent.ws._currentRoomId = roomId;
            opponent.ws._playerId = 'p1';

            console.log(`[МЭТЧМЕЙКИНГ] Игра найдена! Комната ${roomId}: ${p1Name} vs ${p2Name}`);

            sendJson(opponent.ws, {
              type: 'MATCH_START',
              role: 'host',
              playerId: 'p1',
              opponentName: p2Name,
              roomId: roomId
            });

            sendJson(ws, {
              type: 'MATCH_START',
              role: 'guest',
              playerId: 'p2',
              opponentName: p1Name,
              roomId: roomId
            });

            startRoomSimulation(room);
          } else {
            // Add to waiting queue
            removeFromQueue(ws);
            matchmakingQueue.push({
              ws: ws,
              playerName: data.playerName || 'Игрок',
              time: Date.now()
            });

            sendJson(ws, {
              type: 'MATCHMAKING_SEARCHING',
              message: 'Поиск соперника... Ожидание второго игрока'
            });

            console.log(`[МЭТЧМЕЙКИНГ] Игрок встал в очередь (в очереди: ${matchmakingQueue.length})`);
          }
          break;
        }

        case 'CANCEL_MATCHMAKING': {
          removeFromQueue(ws);
          sendJson(ws, { type: 'MATCHMAKING_CANCELLED' });
          break;
        }

        case 'CREATE_ROOM': {
          removeFromQueue(ws);
          const roomId = String(Math.floor(1000 + Math.random() * 9000));
          currentRoomId = roomId;
          playerId = 'p1';

          const match = new GameMatch({
            p1Id: 'p1',
            p1Name: data.playerName || 'Игрок 1 (Хост)',
            p2Id: 'p2',
            p2Name: 'Игрок 2 (Гость)'
          });

          const room = {
            id: roomId,
            hostWs: ws,
            guestWs: null,
            match: match,
            interval: null,
            created: Date.now()
          };

          rooms.set(roomId, room);

          sendJson(ws, {
            type: 'ROOM_CREATED',
            roomId: roomId,
            playerId: 'p1',
            role: 'host'
          });

          console.log(`[КОМНАТА СОЗДАНА] Код: ${roomId}`);
          break;
        }

        case 'JOIN_ROOM': {
          removeFromQueue(ws);
          const roomId = String(data.roomId).trim();
          const room = rooms.get(roomId);

          if (!room) {
            sendJson(ws, { type: 'ERROR', message: `Комната ${roomId} не найдена!` });
            return;
          }

          if (room.guestWs && room.guestWs.readyState === WebSocket.OPEN) {
            sendJson(ws, { type: 'ERROR', message: `Комната ${roomId} уже заполнена!` });
            return;
          }

          currentRoomId = roomId;
          playerId = 'p2';
          room.guestWs = ws;

          if (data.playerName) {
            room.match.players.p2.name = data.playerName;
          }

          console.log(`[ИГРОК ПОДКЛЮЧИЛСЯ] Гость вошел в комнату ${roomId}`);

          // Notify both players that match has initialized
          sendJson(room.hostWs, {
            type: 'MATCH_START',
            role: 'host',
            playerId: 'p1',
            opponentName: room.match.players.p2.name,
            roomId: roomId
          });

          sendJson(room.guestWs, {
            type: 'MATCH_START',
            role: 'guest',
            playerId: 'p2',
            opponentName: room.match.players.p1.name,
            roomId: roomId
          });

          // Start authoritative 30 Hz simulation loop for this room
          startRoomSimulation(room);
          break;
        }

        case 'COMMAND': {
          const rId = currentRoomId || ws._currentRoomId;
          const pId = playerId || ws._playerId;
          if (!rId || !pId) return;
          const room = rooms.get(rId);
          if (!room || !room.match) return;

          const action = data.action;
          const payload = data.payload || {};

          const result = room.match.handleAction(pId, action, payload);
          if (!result.success) {
            sendJson(ws, {
              type: 'COMMAND_REJECTED',
              action: action,
              reason: result.reason
            });
          }
          break;
        }
      }
    } catch (e) {
      console.error('[WS ERROR]', e);
    }
  });

  ws.on('close', () => {
    removeFromQueue(ws);

    const rId = currentRoomId || ws._currentRoomId;
    const pId = playerId || ws._playerId;

    if (rId && rooms.has(rId)) {
      const room = rooms.get(rId);
      stopRoomSimulation(room);

      const otherWs = (pId === 'p1') ? room.guestWs : room.hostWs;
      if (otherWs && otherWs.readyState === WebSocket.OPEN) {
        sendJson(otherWs, {
          type: 'PLAYER_DISCONNECTED',
          message: 'Соперник отключился от игры.'
        });
      }

      rooms.delete(rId);
      console.log(`[КОМНАТА ЗАКРЫТА] Код: ${rId}`);
    }
  });
});

// Helper to get all local IP addresses
function getNetworkIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, ip: iface.address });
      }
    }
  }
  return ips;
}

// 3. Start Server
server.listen(PORT, '0.0.0.0', () => {
  const ips = getNetworkIps();
  console.log('======================================================================');
  console.log(`⚔️  TOWER WARS ЗАЩИЩЕННЫЙ СЕРВЕР ЗАПУЩЕН! (30 FPS Headless Core)`);
  console.log('======================================================================');
  console.log(`👉 ВЫ ОТКРЫВАЕТЕ У СЕБЯ:   http://localhost:${PORT}`);
  console.log('----------------------------------------------------------------------');
  console.log(`👉 ДРУГ ВВОДИТ В БРАУЗЕР (Radmin VPN / Wi-Fi / Hamachi):`);
  if (ips.length > 0) {
    ips.forEach(item => {
      console.log(`   http://${item.ip}:${PORT}  (${item.name})`);
    });
  } else {
    console.log(`   http://<ВАШ_IP_В_RADMIN>:${PORT}`);
  }
  console.log('======================================================================');
  console.log('Инструкция: вы нажимаете "Создать комнату", друг вводит 4-значный код!');
  console.log('======================================================================\n');
});
