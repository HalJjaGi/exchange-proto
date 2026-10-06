'use strict';
const express = require('express');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const { World } = require('./src/world');

const PORT = process.env.PORT || 3100;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const world = new World();

app.get('/api/snapshot', (req, res) => res.json(world.snapshot()));

// 주문 (지정가)
app.post('/api/order', (req, res) => {
  const { side, price, qty } = req.body || {};
  const r = world.place('user', side, Number(price), Number(qty));
  if (r.error) return res.status(400).json(r);
  broadcast();
  res.json({ ok: true, fills: r.fills.length, resting: !!r.resting, orderId: r.resting?.id ?? null });
});

// 미체결 주문 취소
app.post('/api/orders/:id/cancel', (req, res) => {
  const ok = world.cancelOrder(Number(req.params.id));
  broadcast();
  res.json({ ok });
});

// 커뮤니티 글 작성 (봇들이 댓글 달 수 있음)
app.post('/api/post', (req, res) => {
  const text = String(req.body?.text || '').slice(0, 300).trim();
  if (!text) return res.status(400).json({ error: '내용을 입력하세요' });
  world.userPost(text);
  broadcast();
  res.json({ ok: true });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast() {
  const msg = JSON.stringify(world.snapshot());
  for (const c of wss.clients) {
    if (c.readyState === 1) c.send(msg);
  }
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify(world.snapshot()));
});

setInterval(() => {
  world.tick();
  broadcast();
}, 1000);

server.listen(PORT, () => {
  console.log(`📈 exchange proto → http://localhost:${PORT}`);
});
