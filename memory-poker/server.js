'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { GameService } = require('./lib/game');
const { IndianService } = require('./lib/indian');
const { YutService } = require('./lib/yut');
const { GradientService } = require('./lib/gradient');
const { TwelveService } = require('./lib/twelve');

const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');
// 모든 HTML에 공통 배포 버전을 서버에서 주입: 단일 관리 지점(package.json).
const APP_VERSION = require('./package.json').version;
const VERSION_TOKEN = '__GAME_CLUB_VERSION__';
const streams = new Map();
const indianStreams = new Map();
const yutStreams = new Map();
const gradientStreams = new Map();
const twelveStreams = new Map();

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
const indian = new IndianService({ onChange: room => {
  for (const client of indianStreams.get(room.code) ?? []) {
    try { sseWrite(client.res, indian.serialize(room, client.token)); }
    catch { client.res.end(); }
  }
} });

const yut = new YutService({onChange:room=>{
  for(const client of yutStreams.get(room.code)??[]){
    try{sseWrite(client.res,yut.serialize(room,client.token));}
    catch{client.res.end();}
  }
}});
const gradient = new GradientService({onChange:room=>{
  for(const c of gradientStreams.get(room.code)??[]){
    if(!sseWrite(c.res,gradient.serialize(room,c.token)))c.res.end();
  }
}});
const twelve = new TwelveService({onChange:room=>{
  for(const client of twelveStreams.get(room.code)??[]){
    try {
      if(!sseWrite(client.res,twelve.serialize(room,client.token))){
        client.res.end();twelveStreams.get(room.code)?.delete(client);
      }
    } catch {
      // 떠난 관전자/선수의 연결은 정리하고 남은 구독자에게 정상 전달.
      client.res.end();twelveStreams.get(room.code)?.delete(client);
    }
  }
}});
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
    const html = path.extname(file) === '.html';
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': html ? 'no-store' : 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    // HTML 제목, 버전 표기, JS/CSS 캐시 키 모두 같은 버전을 사용합니다.
    res.end(html ? bytes.toString('utf8').replaceAll(VERSION_TOKEN, APP_VERSION) : bytes);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/health') return json(res, 200, { ok: true, version: APP_VERSION });
    if (req.method === 'GET' && url.pathname === '/api/version')
      return json(res, 200, { version: APP_VERSION, commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || null });
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
    const match = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})(?:\/(stream|ready|start|replay|pick|next|leave))?$/i);
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
        else if (action === 'replay') service.replay(room, token);
        else if (action === 'pick') service.pick(room, token, body.indices);
        else if (action === 'next') service.reset(room, token);
        else if (action === 'leave') service.leave(room, token);
        else return json(res, 404, { error: '알 수 없는 작업입니다.' });
        return json(res, 200, { ok: true });
      }
    }
    // 인디언포커: 기존 기억포커 방과 완전히 분리된 2인 전용 API
    if (req.method==='POST' && url.pathname==='/api/indian/create') {
      const data=await readJson(req);const {room,player}=indian.create(data.name);
      return json(res,200,{room:room.code,token:player.token});
    }
    if (req.method==='POST' && url.pathname==='/api/indian/join') {
      const data=await readJson(req);const p=indian.join(data.room,data.name);
      return json(res,200,{room:String(data.room).toUpperCase(),token:p.token});
    }
    const iMatch=url.pathname.match(/^\/api\/indian\/rooms\/([A-Z2-9]{6})(?:\/(stream|ready|configure|start|bet|call|fold|next|restart|leave))?$/i);
    if (iMatch) {
      const game=indian.find(iMatch[1]),operation=iMatch[2]||'state';
      if(req.method==='GET'&&operation==='stream'){
        const token=getToken(req,url);indian.player(game,token);
        res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
        res.write('retry: 1000\n\n');
        if(!indianStreams.has(game.code))indianStreams.set(game.code,new Set());
        const client={res,token};indianStreams.get(game.code).add(client);
        sseWrite(res,indian.serialize(game,token));
        const keep=setInterval(()=>{try{res.write(': ping\n\n');}catch{}},15000);if(keep.unref)keep.unref();
        req.on('close',()=>{clearInterval(keep);indianStreams.get(game.code)?.delete(client);if(indianStreams.get(game.code)?.size===0)indianStreams.delete(game.code);});
        return;
      }
      if(req.method==='GET'&&operation==='state')return json(res,200,indian.serialize(game,getToken(req,url)));
      if(req.method==='POST'){
        const data=await readJson(req),token=getToken(req,url,data);
        if(operation==='ready')indian.ready(game,token,data.ready);
        else if(operation==='configure')indian.configure(game,token,data.count);
        else if(operation==='start')indian.start(game,token);
        else if(operation==='bet')indian.bet(game,token,data.amount);
        else if(operation==='call')indian.call(game,token);
        else if(operation==='fold')indian.fold(game,token);
        else if(operation==='next')indian.next(game,token);
        else if(operation==='restart')indian.restart(game,token);
        else if(operation==='leave')indian.leave(game,token);
        else return json(res,404,{error:'알 수 없는 작업입니다.'});
        return json(res,200,{ok:true});
      }
    }
    // 전략 윷놀이: 별도 실시간 팀 대전 방 (1대1 / 1대2 / 2대2)
    if(req.method==='POST'&&url.pathname==='/api/yut/create'){
      const body=await readJson(req);
      const {room,player}=yut.create(body.name);
      return json(res,200,{room:room.code,token:player.token});
    }
    if(req.method==='POST'&&url.pathname==='/api/yut/join'){
      const body=await readJson(req);
      const player=yut.join(body.room,body.name);
      return json(res,200,{room:String(body.room).toUpperCase(),token:player.token});
    }
    const yutMatch=url.pathname.match(/^\/api\/yut\/rooms\/([A-Z2-9]{6})(?:\/(stream|ready|configure|team|start|choose|move|restart|leave))?$/i);
    if(yutMatch){
      const room=yut.find(yutMatch[1]),action=yutMatch[2]||'state';
      if(req.method==='GET'&&action==='stream'){
        const access=getToken(req,url);yut.player(room,access);
        res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
        res.write('retry: 1000\n\n');
        if(!yutStreams.has(room.code))yutStreams.set(room.code,new Set());
        const client={res,token:access};yutStreams.get(room.code).add(client);
        sseWrite(res,yut.serialize(room,access));
        const keep=setInterval(()=>{try{res.write(': ping\n\n');}catch{}},15000);
        if(keep.unref)keep.unref();
        req.on('close',()=>{
          clearInterval(keep);
          yutStreams.get(room.code)?.delete(client);
          if(yutStreams.get(room.code)?.size===0)yutStreams.delete(room.code);
        });
        return;
      }
      if(req.method==='GET'&&action==='state')return json(res,200,yut.serialize(room,getToken(req,url)));
      if(req.method==='POST'){
        const body=await readJson(req),access=getToken(req,url,body);
        if(action==='ready')yut.ready(room,access,body.ready);
        else if(action==='configure')yut.configure(room,access,body);
        else if(action==='team')yut.changeTeam(room,access,body.team);
        else if(action==='start')yut.start(room,access);
        else if(action==='choose')yut.choose(room,access,body.choices);
        else if(action==='move')yut.move(room,access,body.pieceId,body.route);
        else if(action==='restart')yut.restart(room,access);
        else if(action==='leave')yut.leave(room,access);
        else return json(res,404,{error:'잘못된 윷놀이 요청입니다.'});
        return json(res,200,{ok:true});
      }
    }
    // 그라데이션 7: 실버 테이블 1대1 원통 숫자 심리전
    if(req.method==='POST'&&url.pathname==='/api/gradient/create'){
      const input=await readJson(req),data=gradient.create(input.name);
      return json(res,200,{room:data.room.code,token:data.player.token});
    }
    if(req.method==='POST'&&url.pathname==='/api/gradient/join'){
      const input=await readJson(req),player=gradient.join(input.room,input.name);
      return json(res,200,{room:String(input.room).toUpperCase(),token:player.token});
    }
    const gradientMatch=url.pathname.match(/^\/api\/gradient\/rooms\/([A-Z2-9]{6})(?:\/(stream|ready|start|prepare|pick|restart|leave))?$/i);
    if(gradientMatch){
      const game=gradient.find(gradientMatch[1]),action=gradientMatch[2]||'state';
      if(req.method==='GET'&&action==='stream'){
        const key=getToken(req,url);gradient.player(game,key);
        res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
        res.write('retry: 1000\n\n');
        if(!gradientStreams.has(game.code))gradientStreams.set(game.code,new Set());
        const client={res,token:key};gradientStreams.get(game.code).add(client);
        sseWrite(res,gradient.serialize(game,key));
        const interval=setInterval(()=>{try{res.write(': ping\n\n');}catch{}},15000);
        if(interval.unref)interval.unref();
        req.on('close',()=>{
          clearInterval(interval);
          gradientStreams.get(game.code)?.delete(client);
          if(gradientStreams.get(game.code)?.size===0)gradientStreams.delete(game.code);
        });
        return;
      }
      if(req.method==='GET'&&action==='state')return json(res,200,gradient.serialize(game,getToken(req,url)));
      if(req.method==='POST'){
        const data=await readJson(req),key=getToken(req,url,data);
        if(action==='ready')gradient.ready(game,key,data.ready);
        else if(action==='start')gradient.start(game,key);
        else if(action==='prepare')gradient.prepare(game,key,data.tubes);
        else if(action==='pick')gradient.pick(game,key,data.index);
        else if(action==='restart')gradient.restart(game,key);
        else if(action==='leave')gradient.leave(game,key);
        else return json(res,404,{error:'올바르지 않은 요청입니다.'});
        return json(res,200,{ok:true});
      }
    }
    // 십이장기: 브라운 테이블, 컴퓨터 대전은 클라이언트에서 동일 엔진 사용
    // 온라인 1대1은 서버가 유효 수를 검증하는 독립 대국 방
    if(req.method==='POST'&&url.pathname==='/api/twelve/create'){
      const data=await readJson(req),match=twelve.create(data.name);
      return json(res,200,{room:match.room.code,token:match.player.token});
    }
    if(req.method==='POST'&&url.pathname==='/api/twelve/join'){
      const data=await readJson(req),player=twelve.join(data.room,data.name,data.role||'player');
      return json(res,200,{room:String(data.room).toUpperCase(),token:player.token});
    }
    const twelveMatch=url.pathname.match(/^\/api\/twelve\/rooms\/([A-Z2-9]{6})(?:\/(stream|ready|team|start|move|undo-request|undo-response|undo-cancel|restart|leave))?$/i);
    if(twelveMatch){
      const game=twelve.find(twelveMatch[1]),action=twelveMatch[2]||'state';
      if(req.method==='GET'&&action==='stream'){
        const access=getToken(req,url);twelve.player(game,access);
        res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
        res.write('retry: 1000\n\n');
        if(!twelveStreams.has(game.code))twelveStreams.set(game.code,new Set());
        const client={res,token:access};twelveStreams.get(game.code).add(client);
        sseWrite(res,twelve.serialize(game,access));
        const keep=setInterval(()=>{try{res.write(': ping\n\n');}catch{}},15000);
        if(keep.unref)keep.unref();
        req.on('close',()=>{
          clearInterval(keep);twelveStreams.get(game.code)?.delete(client);
          if(twelveStreams.get(game.code)?.size===0)twelveStreams.delete(game.code);
        });
        return;
      }
      if(req.method==='GET'&&action==='state')return json(res,200,twelve.serialize(game,getToken(req,url)));
      if(req.method==='POST'){
        const data=await readJson(req),access=getToken(req,url,data);
        if(action==='ready')twelve.ready(game,access,data.ready);
        else if(action==='team')twelve.changeTeam(game,access,data.side);
        else if(action==='start')twelve.start(game,access);
        else if(action==='move')twelve.move(game,access,data.move);
        else if(action==='undo-request')twelve.requestUndo(game,access);
        else if(action==='undo-response')twelve.respondUndo(game,access,data.accept);
        else if(action==='undo-cancel')twelve.cancelUndo(game,access);
        else if(action==='restart')twelve.restart(game,access);
        else if(action==='leave')twelve.leave(game,access);
        else return json(res,404,{error:'십이장기 요청이 올바르지 않습니다.'});
        return json(res,200,{ok:true});
      }
    }
    if (req.method === 'GET') {
      if (url.pathname === '/app.js') return serve(res, path.join(publicDir, 'app.js'));
      if (url.pathname === '/styles.css') return serve(res, path.join(publicDir, 'styles.css'));
      if (url.pathname === '/indian.js') return serve(res, path.join(publicDir, 'indian.js'));
      if (url.pathname === '/indian.css') return serve(res, path.join(publicDir, 'indian.css'));
      if (url.pathname === '/yut.js') return serve(res, path.join(publicDir, 'yut.js'));
      if (url.pathname === '/yut.css') return serve(res, path.join(publicDir, 'yut.css'));
      if (url.pathname === '/gradient.js') return serve(res, path.join(publicDir, 'gradient.js'));
      if (url.pathname === '/gradient.css') return serve(res, path.join(publicDir, 'gradient.css'));
      if (url.pathname === '/twelve.js') return serve(res, path.join(publicDir, 'twelve.js'));
      if (url.pathname === '/twelve.css') return serve(res, path.join(publicDir, 'twelve.css'));
      if (url.pathname === '/twelve-engine.js') return serve(res, path.join(__dirname,'lib','twelve-engine.js'));
      if (url.pathname === '/twelve-ai-worker.js') return serve(res, path.join(publicDir, 'twelve-ai-worker.js'));
      if (url.pathname === '/twelve' || /^\/twelve\/r\/[A-Z2-9]{6}\/?$/i.test(url.pathname)) return serve(res,path.join(publicDir,'twelve.html'));
      if (url.pathname === '/gradient' || /^\/gradient\/r\/[A-Z2-9]{6}\/?$/i.test(url.pathname)) return serve(res,path.join(publicDir,'gradient.html'));
      if (url.pathname === '/yut' || /^\/yut\/r\/[A-Z2-9]{6}\/?$/i.test(url.pathname)) return serve(res,path.join(publicDir,'yut.html'));
      if (url.pathname === '/indian' || /^\/indian\/r\/[A-Z2-9]{6}\/?$/i.test(url.pathname)) return serve(res,path.join(publicDir,'indian.html'));
      if (url.pathname === '/') return serve(res, path.join(publicDir,'hub.html'));
      if (url.pathname === '/memory' || /^\/r\/[A-Z2-9]{6}\/?$/i.test(url.pathname)) return serve(res, path.join(publicDir, 'index.html'));
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
  for(const [code,room] of twelve.rooms){
    if(room.lastTouched<cutoff){
      twelve.stopClock(room);
      twelve.rooms.delete(code);
      for(const client of twelveStreams.get(code)??[])client.res.end();
      twelveStreams.delete(code);
    }
  }
  for(const [code,room] of gradient.rooms){
    if(room.lastTouched<cutoff){
      if(room.timer)clearTimeout(room.timer);
      gradient.rooms.delete(code);
      for(const client of gradientStreams.get(code)??[])client.res.end();
      gradientStreams.delete(code);
    }
  }
  for(const [code,room] of yut.rooms){
    if(room.lastTouched<cutoff){
      yut.rooms.delete(code);
      for(const client of yutStreams.get(code)??[])client.res.end();
      yutStreams.delete(code);
    }
  }
  for (const [code,room] of indian.rooms) {
    if (room.lastTouched < cutoff) {
      if(room.timer)clearTimeout(room.timer);
      indian.rooms.delete(code);
      for(const client of indianStreams.get(code)??[])client.res.end();
      indianStreams.delete(code);
    }
  }
}, 10 * 60 * 1000);
if (sweep.unref) sweep.unref();

if (require.main === module) server.listen(PORT, '0.0.0.0', () => console.log(`Memory Poker listening on http://localhost:${PORT}`));
module.exports = { server, service, indian, yut, gradient, twelve };
