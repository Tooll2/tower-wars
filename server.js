/**
 * Tower Wars - Dedicated Multiplayer Game Server
 * Provides HTTP static file hosting + real-time WebSocket Room Synchronization.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

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

// 2. Real-time WebSocket Server
const wss = new WebSocketServer({ server });
const rooms = new Map();

function sendJson(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

wss.on('connection', (ws) => {
  let currentRoomId = null;
  let playerRole = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case 'CREATE_ROOM': {
          const roomId = String(Math.floor(1000 + Math.random() * 9000));
          currentRoomId = roomId;
          playerRole = 'host';

          rooms.set(roomId, {
            id: roomId,
            hostWs: ws,
            guestWs: null,
            created: Date.now()
          });

          sendJson(ws, {
            type: 'ROOM_CREATED',
            roomId: roomId
          });
          console.log(`[КОМНАТА СОЗДАНА] Код: ${roomId}`);
          break;
        }

        case 'JOIN_ROOM': {
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
          playerRole = 'guest';
          room.guestWs = ws;

          console.log(`[ИГРОК ПОДКЛЮЧИЛСЯ] Гость вошел в комнату ${roomId}`);

          sendJson(room.hostWs, {
            type: 'MATCH_START',
            role: 'host',
            roomId: roomId
          });

          sendJson(room.guestWs, {
            type: 'MATCH_START',
            role: 'guest',
            roomId: roomId
          });
          break;
        }

        case 'GAME_ACTION': {
          if (!currentRoomId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;

          const targetWs = (playerRole === 'host') ? room.guestWs : room.hostWs;
          if (targetWs) {
            sendJson(targetWs, {
              type: 'GAME_ACTION',
              action: data.action,
              payload: data.payload
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
    if (currentRoomId && rooms.has(currentRoomId)) {
      const room = rooms.get(currentRoomId);
      const otherWs = (playerRole === 'host') ? room.guestWs : room.hostWs;
      if (otherWs) {
        sendJson(otherWs, { type: 'PLAYER_DISCONNECTED', message: 'Соперник отключился от игры.' });
      }
      rooms.delete(currentRoomId);
      console.log(`[КОМНАТА ЗАКРЫТА] Код: ${currentRoomId}`);
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
  console.log(`⚔️  TOWER WARS СЕРВЕР ЗАПУЩЕН!`);
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
