'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { GameService } = require('./lib/game');

const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');
const streams = new Map();

function sseWrite(res, state) {
  try { res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`); return true; }
  catch { return false; }
}
function broadcast(room) {
  for (const client of streams.get(room.code) ?? []) {
    try { sseWrite(client.res, service.serialize(room, client.token)); }
    catch { client.res.end(); }
  }
}
const service = new GameService({ onChange: broadcast });

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
function getToken(req, url, body = {}) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : (body.token || url.searchParams.get('token'));
}
async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) throw new Error('요청이 너무 큽니다.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('잘못된 요청 형식입니다.'); }
}
function serve(res, file) {
  const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream';
  fs.readFile(file, (err, bytes) => {
    if (err) return json(res, 404, { error: '파일을 찾을 수 없습니다.' });
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(bytes);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/health') return json(res, 200, { ok: true });
    if (req.method === 'POST' && url.pathname === '/api/create') {
      const body = await readJson(req);
      const { room, player } = service.create(body.name);
      return json(res, 200, { room: room.code, token: player.token });
    }
    if (req.method === 'POST' && url.pathname === '/api/join') {
      const body = await readJson(req);
      const player = service.join(body.room, body.name);
      return json(res, 200, { room: String(body.room).toUpperCase(), token: player.token });
    }
    const match = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})(?:\/(stream|ready|start|pick|next|leave))?$/i);
    if (match) {
      const room = service.find(match[1]);
      const action = match[2] || 'state';
      if (req.method === 'GET' && action === 'stream') {
        const token = getToken(req, url);
        service.player(room, token);
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        });
        res.write('retry: 1000\n\n');
        if (!streams.has(room.code)) streams.set(room.code, new Set());
        const client = { res, token };
        streams.get(room.code).add(client);
        sseWrite(res, service.serialize(room, token));
        const keepAlive = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 15_000);
        if (keepAlive.unref) keepAlive.unref();
        req.on('close', () => {
          clearInterval(keepAlive);
          streams.get(room.code)?.delete(client);
          if (streams.get(room.code)?.size === 0) streams.delete(room.code);
        });
        return;
      }
      if (req.method === 'GET' && action === 'state') return json(res, 200, service.serialize(room, getToken(req, url)));
      if (req.method === 'POST') {
        const body = await readJson(req);
        const token = getToken(req, url, body);
        if (action === 'ready') service.ready(room, token, body.ready);
        else if (action === 'start') service.start(room, token);
        else if (action === 'pick') service.pick(room, token, body.indices);
        else if (action === 'next') service.reset(room, token);
        else if (action === 'leave') service.leave(room, token);
        else return json(res, 404, { error: '알 수 없는 작업입니다.' });
        return json(res, 200, { ok: true });
      }
    }
    if (req.method === 'GET') {
      if (url.pathname === '/app.js') return serve(res, path.join(publicDir, 'app.js'));
      if (url.pathname === '/styles.css') return serve(res, path.join(publicDir, 'styles.css'));
      if (url.pathname === '/' || /^\/r\/[A-Z2-9]{6}\/?$/i.test(url.pathname)) return serve(res, path.join(publicDir, 'index.html'));
    }
    return json(res, 404, { error: '주소를 찾을 수 없습니다.' });
  } catch (err) {
    return json(res, 400, { error: err.message || '요청 처리에 실패했습니다.' });
  }
});

const sweep = setInterval(() => {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const [code, room] of service.rooms) {
    if (room.lastTouched < cutoff) {
      if (room.timer) clearTimeout(room.timer);
      service.rooms.delete(code);
      for (const client of streams.get(code) ?? []) client.res.end();
      streams.delete(code);
    }
  }
}, 10 * 60 * 1000);
if (sweep.unref) sweep.unref();

if (require.main === module) server.listen(PORT, '0.0.0.0', () => console.log(`Memory Poker listening on http://localhost:${PORT}`));
module.exports = { server, service };
