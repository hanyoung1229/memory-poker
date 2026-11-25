'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../lib/twelve-engine');
const {TwelveService}=require('../lib/twelve');
test('말판은 4×3 총 12칸이며 왕·장·상·자가 좌우 대칭으로 시작',()=>{
 const g=E.fresh(0);
 assert.equal(g.board.length,12);
 assert.equal(g.board.filter(Boolean).length,8);
 assert.deepEqual(g.hands,[[],[]]);
 assert.equal(g.board[E.index(0,1)].type,'K');
 assert.equal(g.board[E.index(3,1)].type,'K');
 assert.equal(g.board[E.index(1,1)].type,'P');
 assert.equal(g.board[E.index(2,1)].type,'P');
});
test('장·상·왕·자·후의 이동 방향이 서로 다르다',()=>{
 assert.equal(E.dirs({type:'J',owner:0}).length,4);
 assert.equal(E.dirs({type:'S',owner:0}).length,4);
 assert.equal(E.dirs({type:'K',owner:0}).length,8);
 assert.deepEqual(E.dirs({type:'P',owner:0}),[[1,0]]);
 assert.deepEqual(E.dirs({type:'P',owner:1}),[[-1,0]]);
 assert.equal(E.dirs({type:'H',owner:0}).length,6);
 assert.ok(E.dirs({type:'H',owner:0}).some(v=>v[0]===1&&v[1]===1));
 assert.ok(!E.dirs({type:'H',owner:0}).some(v=>v[0]===-1&&v[1]===1));
});
test('자는 상대 끝 진영에 도착하면 자동으로 후로 뒤집힌다',()=>{
 const game=E.fresh(0);
 game.board[E.index(1,0)]=null;
 game.board[E.index(2,0)]={owner:0,type:'P'};
 game.board[E.index(3,0)]=null;
 const m=E.legal(game).find(m=>m.from===E.index(2,0)&&m.to===E.index(3,0));
 assert.ok(m);
 assert.equal(m.promote,true);
 const after=E.apply(game,m);
 assert.equal(after.board[E.index(3,0)].type,'H');
 assert.equal(after.board[E.index(3,0)].owner,0);
});
test('후를 잡으면 상대 손에는 자로 돌아오며 원하는 빈 칸에 내려놓을 수 있다',()=>{
 const game=E.fresh(0);
 game.board=Array(12).fill(null);
 game.board[E.index(0,0)]={owner:0,type:'K'};
 game.board[E.index(3,2)]={owner:1,type:'K'};
 game.board[E.index(2,1)]={owner:0,type:'J'};
 game.board[E.index(3,1)]={owner:1,type:'H'};
 game.turn=0;
 const capture=E.legal(game).find(m=>m.from===E.index(2,1)&&m.to===E.index(3,1));
 assert.ok(capture);
 const next=E.apply(game,capture);
 assert.deepEqual(next.hands[0],['P']);
 next.turn=0;
 const drop=E.legal(next).find(m=>m.kind==='drop'&&m.type==='P'&&m.to===E.index(1,0));
 assert.ok(drop);
 assert.equal(E.legal(next).some(m=>m.kind==='drop'&&m.to===E.index(3,0)),false);
 const played=E.apply(next,drop);
 assert.equal(played.board[E.index(1,0)].type,'P');
 assert.equal(played.board[E.index(1,0)].owner,0);
 assert.deepEqual(played.hands[0],[]);
});
test('상대 왕을 잡으면 즉시 승리',()=>{
 const game=E.fresh(0);
 game.board=Array(12).fill(null);
 game.board[E.index(1,1)]={owner:0,type:'J'};
 game.board[E.index(2,1)]={owner:1,type:'K'};
 game.board[E.index(0,0)]={owner:0,type:'K'};
 const move=E.legal(game).find(m=>m.from===E.index(1,1)&&m.to===E.index(2,1));
 assert.ok(move);
 const result=E.apply(game,move);
 assert.equal(result.winner,0);
});
test('왕이 적 진영에 들어가고 적 한 턴을 살아남으면 승리',()=>{
 const g=E.fresh(0);
 g.board=Array(12).fill(null);
 g.board[E.index(2,0)]={owner:0,type:'K'};
 g.board[E.index(3,2)]={owner:1,type:'K'};
 g.board[E.index(0,2)]={owner:0,type:'J'};
 const step=E.legal(g).find(m=>m.from===E.index(2,0)&&m.to===E.index(3,0));
 assert.ok(step);
 const b=E.apply(g,step);
 assert.equal(b.winner,null);
 const reply=E.legal(b).find(m=>m.from===E.index(3,2)&&m.to===E.index(2,2));
 assert.ok(reply);
 const result=E.apply(b,reply);
 assert.equal(result.winner,0);
});
test('쉬움·보통·어려움 컴퓨터가 합법적인 수를 선택한다',()=>{
 for(const difficulty of ['easy','normal','hard']){
  const g=E.fresh(0),choice=E.computerMove(g,difficulty);
  assert.ok(choice);
  assert.ok(E.legal(g).some(m=>E.sameMove(m,choice)));
 }
});
function match(){
 const actions=[];const service=new TwelveService({onChange:r=>actions.push(r.revision)});
 const {room,player:a}=service.create('A'),b=service.join(room.code,'B');
 service.ready(room,a.token,true);service.ready(room,b.token,true);
 return {service,room,a,b,actions};
}
test('1대1은 모두 준비한 뒤 방장만 시작할 수 있고 참가자별 진영이 다르다',()=>{
 const {service,room,a,b}=match();
 assert.equal(room.stage,'lobby');
 assert.throws(()=>service.start(room,b.token),/방장/);
 service.start(room,a.token);
 assert.equal(room.stage,'playing');
 assert.equal(service.serialize(room,a.token).side,0);
 assert.equal(service.serialize(room,b.token).side,1);
 assert.equal(room.game.board.length,12);
});
test('서버는 실제 차례 외 플레이어와 불법 이동을 거절하며 합법 이동만 허용',()=>{
 const {service,room,a,b}=match();
 service.start(room,a.token);
 const mover=room.game.turn===0?a:b,opponent=room.game.turn===0?b:a;
 const move=E.legal(room.game)[0];
 assert.throws(()=>service.move(room,opponent.token,move),/상대 차례/);
 assert.throws(()=>service.move(room,mover.token,{kind:'move',from:999,to:999}),/움직일 수/);
 const before=room.revision;
 service.move(room,mover.token,move);
 assert.equal(room.revision,before+1);
 assert.equal(room.game.ply,1);
});
test('온라인 대국에선 다른 방의 토큰을 사용하거나 방장 아닌 재경기 조작을 거절',()=>{
 const {service,room,a,b}=match();
 const another=service.create('C');
 assert.throws(()=>service.serialize(room,another.player.token),/참가 정보/);
 service.start(room,a.token);room.stage='finished';
 assert.throws(()=>service.restart(room,b.token),/방장/);
 service.restart(room,a.token);
 assert.equal(room.stage,'lobby');
});

test('왕이 상대 말의 이동 범위 안에 있으면 위협 판정, 아니면 안전 판정',()=>{
 const g=E.fresh(0);g.board=Array(12).fill(null);
 g.board[E.index(1,1)]={type:'K',owner:0};
 g.board[E.index(2,1)]={type:'J',owner:1};
 assert.equal(E.kingThreatened(g,0),true);
 assert.equal(E.kingThreatened(g,1),false);
 g.board[E.index(2,1)]=null;
 g.board[E.index(3,2)]={type:'J',owner:1};
 assert.equal(E.kingThreatened(g,0),false);
 g.board[E.index(2,2)]={type:'S',owner:1};
 assert.equal(E.kingThreatened(g,0),true);
});
test('온라인 무르기 요청 중 이동 잠금, 상대 거절 시 유지, 수락 시 직전 수 복원',()=>{
 const {service,room,a,b}=match();
 service.start(room,a.token);
 const firstMover=room.game.turn===0?a:b;
 const other=firstMover===a?b:a;
 const original=JSON.parse(JSON.stringify(room.game));
 const move=E.legal(room.game)[0];
 service.move(room,firstMover.token,move);
 assert.equal(room.game.ply,1);
 service.requestUndo(room,firstMover.token);
 const visible=service.serialize(room,other.token);
 assert.deepEqual(visible.undo,{requester:room.players.indexOf(firstMover),ply:1});
 assert.equal(visible.canUndo,true);
 assert.throws(()=>service.move(room,other.token,E.legal(room.game)[0]),/무르기 요청/);
 assert.throws(()=>service.respondUndo(room,firstMover.token,true),/상대방/);
 service.respondUndo(room,other.token,false);
 assert.equal(room.game.ply,1);
 assert.equal(room.undo,null);
 service.requestUndo(room,other.token);
 assert.throws(()=>service.cancelUndo(room,firstMover.token),/요청한 플레이어/);
 service.respondUndo(room,firstMover.token,true);
 assert.equal(room.game.ply,0);
 assert.deepEqual(room.game,original);
 assert.equal(room.stage,'playing');
 assert.equal(room.undo,null);
 assert.equal(room.history.length,0);
});
test('온라인 무르기 요청자는 자기 요청을 취소할 수 있다',()=>{
 const {service,room,a,b}=match();service.start(room,a.token);
 const first=room.game.turn===0?a:b;
 service.move(room,first.token,E.legal(room.game)[0]);
 service.requestUndo(room,first.token);
 service.cancelUndo(room,first.token);
 assert.equal(room.undo,null);
 assert.equal(room.game.ply,1);
});
test('종료된 대국도 상대가 무르기 수락하면 직전 수부터 재개 가능',()=>{
 const {service,room,a,b}=match();service.start(room,a.token);
 const mover=room.game.turn===0?a:b,other=mover===a?b:a;
 room.game.board=Array(12).fill(null);
 const mine=room.game.turn,enemy=1-mine;
 room.game.board[E.index(0,0)]={type:'K',owner:mine};
 room.game.board[E.index(1,1)]={type:'J',owner:mine};
 room.game.board[E.index(2,1)]={type:'K',owner:enemy};
 service.move(room,mover.token,{kind:'move',from:E.index(1,1),to:E.index(2,1)});
 assert.equal(room.stage,'finished');
 service.requestUndo(room,other.token);
 service.respondUndo(room,mover.token,true);
 assert.equal(room.stage,'playing');
 assert.equal(room.game.winner,null);
 assert.equal(room.game.ply,0);
});
test('세로 말판은 원래 4×3 엔진의 좌표를 바꾸지 않고 3열×4행으로 표시한다',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const src=fs.readFileSync(path.join(__dirname,'../public/twelve.js'),'utf8');
 const withoutInit=src.replace(/\(function init\(\)\{[\s\S]*?\}\)\(\);\s*$/,'');
 assert.notEqual(withoutInit,src);
 const root={innerHTML:'',addEventListener(){}},toast={textContent:'',classList:{add(){},remove(){}}};
 const document={querySelector:q=>q==='#twelveApp'?root:toast};
 const app=new Function('window','document','setTimeout','clearTimeout',withoutInit+
 '\nreturn {start:(g,me)=>{mode="solo";human=me;state=g;thinking=false;soloHistory=[];render();},board,square,action,getGame:()=>state,historyLength:()=>soloHistory.length};')(
 {TwelveEngine:E},document,()=>17,()=>{});
 app.start(E.fresh(0),0);
 const indices=[...app.board().matchAll(/data-index="(\d+)"/g)].map(m=>Number(m[1]));
 assert.deepEqual(indices,[3,7,11,2,6,10,1,5,9,0,4,8]);
 assert.match(root.innerHTML,/viewer-side0/);
 assert.match(root.innerHTML,/>상<small>상<\/small>/);
 assert.match(root.innerHTML,/>장<small>장<\/small>/);
 assert.match(root.innerHTML,/>자<small>자<\/small>/);
 app.start(E.fresh(0),1);
 const swapped=[...app.board().matchAll(/data-index="(\d+)"/g)].map(m=>Number(m[1]));
 assert.deepEqual(swapped,[8,4,0,9,5,1,10,6,2,11,7,3]);
});
test('목적지 첫 클릭은 미리보기만, 같은 목적지 재클릭에 이동, 솔로 무르기는 즉시 복원',async()=>{
 const fs=require('node:fs'),path=require('node:path');
 const src=fs.readFileSync(path.join(__dirname,'../public/twelve.js'),'utf8');
 const code=src.replace(/\(function init\(\)\{[\s\S]*?\}\)\(\);\s*$/,'');
 const root={innerHTML:'',addEventListener(){}},toast={textContent:'',classList:{add(){},remove(){}}};
 const document={querySelector:q=>q==='#twelveApp'?root:toast};
 const app=new Function('window','document','setTimeout','clearTimeout',code+
 '\nreturn {start:g=>{mode="solo";human=0;state=g;thinking=false;soloHistory=[];render();},square,action,getGame:()=>state,historyLength:()=>soloHistory.length};')(
 {TwelveEngine:E},document,()=>23,()=>{});
 app.start(E.fresh(0));
 const move=E.legal(app.getGame())[0];
 app.square(move.from);
 app.square(move.to);
 assert.equal(app.getGame().ply,0);
 assert.match(root.innerHTML,/다시 누르면 이동 확정/);
 app.square(move.to);
 assert.equal(app.getGame().ply,1);
 assert.equal(app.historyLength(),1);
 await app.action('undo',{dataset:{}});
 assert.equal(app.getGame().ply,0);
 assert.equal(app.historyLength(),0);
});
