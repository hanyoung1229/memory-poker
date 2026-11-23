'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {YutService,MODES,moveOptionsForPiece}=require('../lib/yut');
function create(mode='1v1',pieceCount=2){
 const game=new YutService();
 const {room,player:host}=game.create('호스트');
 game.configure(room,host.token,{mode,pieceCount});
 const count=MODES[mode].teams.length;
 const users=[host];
 for(let i=1;i<count;i++)users.push(game.join(room.code,'참가자'+i));
 users.forEach(p=>game.ready(room,p.token,true));
 return {game,room,users,host};
}
function start(x){x.game.start(x.room,x.host.token);}
function chooseAll(x,choices){
 x.users.forEach((p,i)=>x.game.choose(x.room,p.token,choices[i]));
 if(x.room.stage==='throwing')x.game.finishThrow(x.room);
}
test('대전 모드 1대1, 1대2, 2대2는 팀마다 윷 정확히 2개씩, 합계 4개',()=>{
 for(const mode of Object.keys(MODES)){
  const x=create(mode);
  assert.equal(x.room.players.length,MODES[mode].teams.length);
  assert.deepEqual(x.room.players.map(p=>p.team),MODES[mode].teams);
  assert.equal(x.room.players.filter(p=>p.team===0).reduce((n,p)=>n+p.stickCount,0),2);
  assert.equal(x.room.players.filter(p=>p.team===1).reduce((n,p)=>n+p.stickCount,0),2);
  assert.equal(x.room.players.reduce((n,p)=>n+p.stickCount,0),4);
 }
});
test('로비에서 팀당 말 2개 또는 4개 선택 가능, 그 외 값 거부',()=>{
 for(const pieceCount of [2,4]){
  const x=create('2v2',pieceCount);start(x);
  assert.equal(x.room.pieces.length,pieceCount*2);
  assert.equal(x.room.pieces.filter(p=>p.team===0).length,pieceCount);
  assert.equal(x.room.pieces.filter(p=>p.team===1).length,pieceCount);
 }
 const x=create();assert.throws(()=>x.game.configure(x.room,x.host.token,{pieceCount:3}),/2개 또는 4개/);
});
test('방장만 시작하고 모두 준비해야 하며, 미리 자동 시작되지 않는다',()=>{
 const x=create('1v1');
 assert.equal(x.room.stage,'lobby');
 assert.throws(()=>x.game.start(x.room,x.users[1].token),/방장/);
 start(x);assert.equal(x.room.stage,'choose');
});
test('제출한 윷은 공개 전까지 다른 플레이어가 볼 수 없다',()=>{
 const x=create();start(x);
 x.game.choose(x.room,x.users[0].token,['F','F']);
 assert.equal(x.game.serialize(x.room,x.users[1].token).players[0].choice,null);
 assert.deepEqual(x.game.serialize(x.room,x.users[0].token).players[0].choice,['F','F']);
 assert.throws(()=>x.game.choose(x.room,x.users[0].token,['B','B']),/이미 선택/);
 x.game.choose(x.room,x.users[1].token,['B','B']);
 assert.equal(x.room.stage,'throwing');
 assert.equal(x.game.serialize(x.room,x.users[1].token).roll,null);
 x.game.finishThrow(x.room);
 assert.equal(x.room.roll.name,'개');
 assert.equal(x.room.roll.steps,2);
 assert.equal(x.room.stage,'move');
 assert.equal(x.room.lastRoll.selected.length,2);
});
test('둥근 앞면 0,1,2,3,4개는 윷·걸·개·뒷도·모이며 윷·모는 추가 턴',()=>{
 const cases=[
 [['B','B'],['B','B']],'윷',
 [['F','B'],['B','B']],'걸',
 [['F','F'],['B','B']],'개',
 [['F','F'],['F','B']],'뒷도',
 [['F','F'],['F','F']],'모'
 ];
 for(let i=0;i<cases.length;i+=2){
  const x=create();start(x);chooseAll(x,cases[i]);
  if(cases[i+1]==='뒷도'){
   assert.equal(x.room.lastRoll.name,'뒷도');
   assert.equal(x.room.stage,'choose'); // 출발 전엔 뒤로 갈 말이 없어 패스
  }else{
   assert.equal(x.room.roll.name,cases[i+1]);
   assert.equal(x.room.roll.bonus,i===0||i===8);
   const move=x.game.legalMoves(x.room)[0];
   x.game.move(x.room,x.users[0].token,move.pieceId,move.route);
   assert.equal(x.room.turnTeam,i===0||i===8?0:1);
  }
 }
});
test('2대2에서 네 사람 각 1개씩 비밀 선택을 제출하면 진행된다',()=>{
 const x=create('2v2',4);start(x);
 chooseAll(x,[['B'],['B'],['F'],['B']]);
 assert.equal(x.room.roll.name,'걸');
 assert.equal(x.room.pieces.length,8);
 assert.equal(x.game.serialize(x.room,x.users[2].token).legalMoves.length>0,true);
 assert.equal(x.game.serialize(x.room,x.users[1].token).legalMoves.length,0);
});
test('1대2에서 1인팀이 2개, 2인팀은 각 1개의 윷 선택',()=>{
 const x=create('1v2');start(x);
 chooseAll(x,[['F','B'],['B'],['B']]);
 assert.equal(x.room.roll.name,'걸');
 assert.equal(x.room.lastRoll.selected[0].choice.length,2);
});
test('뒷도로 오른쪽 아래 도착칸에 돌아와도 한 칸 더 나가야 골인',()=>{
 const options=moveOptionsForPiece({status:'board',path:[1]},-1);
 assert.equal(options.length,1);assert.equal(options[0].to,0);
 const x=create();start(x);
 x.room.pieces[0].status='board';x.room.pieces[0].path=[1];
 chooseAll(x,[['F','F'],['F','B']]);
 const move=x.game.legalMoves(x.room).find(p=>p.pieceId==='P1');
 x.game.move(x.room,x.users[0].token,move.pieceId,move.route);
 assert.equal(x.room.pieces[0].status,'board');
 assert.equal(x.room.pieces[0].path.at(-1),0);
});
test('지름길 선택지가 유효한 경우 두 경로를 노출하고 외부 조작 이동은 거절',()=>{
 const options=moveOptionsForPiece({status:'board',path:[1,2,3,4,5]},1);
 assert.deepEqual(new Set(options.map(x=>x.to)),new Set([6,20]));
 const x=create();start(x);chooseAll(x,[['F','F'],['B','B']]);
 assert.throws(()=>x.game.move(x.room,x.users[0].token,'INVALID','route'),/이동 경로/);
});
test('잡기 시 상대 말은 시작 대기로 복귀하고 잡은 팀이 한 번 더 행동한다',()=>{
 const x=create();start(x);
 x.room.pieces[2].status='board';x.room.pieces[2].path=[1,2];
 chooseAll(x,[['F','F'],['B','B']]);
 const move=x.game.legalMoves(x.room)[0];
 x.game.move(x.room,x.users[0].token,move.pieceId,move.route);
 assert.equal(x.room.pieces[2].status,'home');
 assert.equal(x.room.turnTeam,0);
 assert.equal(x.room.lastAction.type,'capture');
});
test('같은 칸의 우리 말은 한 묶음으로 이동한다',()=>{
 const x=create();start(x);
 x.room.pieces[0].status='board';x.room.pieces[0].path=[1];
 x.room.pieces[1].status='board';x.room.pieces[1].path=[1];
 chooseAll(x,[['F','F'],['B','B']]);
 const move=x.game.legalMoves(x.room)[0];
 x.game.move(x.room,x.users[0].token,move.pieceId,move.route);
 assert.equal(x.room.pieces[0].path.at(-1),3);
 assert.equal(x.room.pieces[1].path.at(-1),3);
});
test('모든 말을 완주한 팀이 우승하고 방장이 재경기 설정으로 복귀',()=>{
 const x=create();start(x);
 x.room.pieces[0].status='done';x.room.pieces[0].path=[];
 x.room.pieces[1].status='board';x.room.pieces[1].path=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,0];
 chooseAll(x,[['F','B'],['F','B']]); // 도착칸 0 다음 걸음에서 골인
 const move=x.game.legalMoves(x.room).find(x=>x.pieceId==='P2'&&x.to==='FINISH');
 assert.ok(move);
 x.game.move(x.room,x.users[0].token,move.pieceId,move.route);
 assert.equal(x.room.stage,'finished');assert.equal(x.room.winner,0);
 x.game.restart(x.room,x.host.token);
 assert.equal(x.room.stage,'lobby');assert.equal(x.room.round,0);
});

test('청팀·홍팀을 준비실에서 자유롭게 바꾸고, 인원 구성이 맞으면 시작할 수 있다',()=>{
 const x=create('1v2');
 const [host,guest1,guest2]=x.users;
 // 1v2의 초기 구성은 1:2이다.
 assert.deepEqual(x.room.players.map(p=>p.team),[0,1,1]);
 assert.deepEqual(x.room.players.map(p=>p.stickCount),[2,1,1]);
 x.game.changeTeam(x.room,guest1.token,0);
 assert.deepEqual(x.room.players.map(p=>p.team),[0,0,1]);
 assert.deepEqual(x.room.players.map(p=>p.stickCount),[1,1,2]);
 assert.equal(x.game.serialize(x.room,host.token).teamsReady,true);
 assert.equal(x.room.players.every(p=>!p.ready),true);
 x.users.forEach(p=>x.game.ready(x.room,p.token,true));
 x.game.start(x.room,host.token);
 assert.equal(x.room.stage,'choose');
 assert.equal(x.room.players.filter(p=>p.team===1).reduce((n,p)=>n+p.stickCount,0),2);
 assert.throws(()=>x.game.changeTeam(x.room,guest2.token,0),/준비실/);
});
test('1대1에서 팀 구성 불일치 시 게임 시작을 막는다',()=>{
 const x=create('1v1');
 x.game.changeTeam(x.room,x.users[1].token,0);
 assert.equal(x.game.serialize(x.room,x.host.token).teamsReady,false);
 x.users.forEach(p=>x.game.ready(x.room,p.token,true));
 assert.throws(()=>x.game.start(x.room,x.host.token),/팀 구성/);
 x.game.changeTeam(x.room,x.users[1].token,1);
 assert.equal(x.game.serialize(x.room,x.host.token).teamsReady,true);
 x.users.forEach(p=>x.game.ready(x.room,p.token,true));
 x.game.start(x.room,x.host.token);
 assert.equal(x.room.stage,'choose');
});
test('앞 4개는 모 5칸, 뒤 4개는 윷 4칸 이동 및 보너스 차례',()=>{
 for(const [choices,name,steps] of [[['F','F'],'모',5],[['B','B'],'윷',4]]){
  const x=create();
  start(x);
  chooseAll(x,[choices,choices]);
  assert.equal(x.room.roll.name,name);
  assert.equal(x.room.roll.steps,steps);
  assert.equal(x.room.roll.bonus,true);
  const move=x.game.legalMoves(x.room)[0];
  x.game.move(x.room,x.host.token,move.pieceId,move.route);
  assert.equal(x.room.turnTeam,0);
 }
});
test('2대2의 팀 변경은 양 팀 2명씩 구성되어야 시작된다',()=>{
 const x=create('2v2');
 x.game.changeTeam(x.room,x.users[1].token,0);
 assert.deepEqual(x.game.serialize(x.room,x.host.token).teamCounts,[3,1]);
 assert.equal(x.game.serialize(x.room,x.host.token).teamsReady,false);
 x.game.changeTeam(x.room,x.users[2].token,1);
 assert.deepEqual(x.game.serialize(x.room,x.host.token).teamCounts,[2,2]);
 assert.equal(x.game.serialize(x.room,x.host.token).teamsReady,true);
});

test('서버는 4개 윷 셔플 완료 전 비밀 선택과 결과를 공개하지 않는다',()=>{
 let fired,delay;const game=new YutService({schedule:(fn,ms)=>{fired=fn;delay=ms;return {unref(){}};},cancel:()=>{}});
 const {room,player:a}=game.create('가'),b=game.join(room.code,'나');
 game.ready(room,a.token,true);game.ready(room,b.token,true);game.start(room,a.token);
 game.choose(room,a.token,['F','F']);game.choose(room,b.token,['F','B']);
 assert.equal(room.stage,'throwing');assert.equal(delay,1800);
 assert.equal(game.serialize(room,a.token).roll,null);
 assert.equal(game.serialize(room,b.token).lastRoll,null);
 assert.equal(game.serialize(room,b.token).players[0].choice,null);
 fired();assert.equal(room.lastRoll.name,'뒷도');assert.equal(room.lastRoll.fronts,3);
});
test('도착칸 0 다음 한 걸음에서만 골인하고 지름길도 동일 규칙 적용',()=>{
 const a=moveOptionsForPiece({status:'board',path:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19]},1);
 assert.equal(a[0].to,0);
 const b=moveOptionsForPiece({status:'board',path:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,0]},1);
 assert.equal(b[0].to,'FINISH');
 const c=moveOptionsForPiece({status:'board',path:[25,26,22,27,28]},1);
 assert.equal(c[0].to,0);
 const d=moveOptionsForPiece({status:'board',path:[25,26,22,27,28,0]},1);
 assert.equal(d[0].to,'FINISH');
});
test('말을 움직이기 전 서버는 이동 경로 trail을 제공한다',()=>{
 const x=create();start(x);chooseAll(x,[['F','F'],['B','B']]);
 const before=x.room.pieces[0].status;
 const option=x.game.legalMoves(x.room)[0];
 assert.deepEqual(option.trail,[1,2]);
 assert.equal(before,'home');
 x.game.move(x.room,x.host.token,option.pieceId,option.route);
 assert.equal(x.room.pieces[0].status,'board');
});
test('앞면은 둥근 면, 뒷면은 평평한 면: 모 뒷도 개 걸 윷 판정',()=>{
 const {labelFor}=require('../lib/yut');
 for(const [front,name,steps] of [[4,'모',5],[3,'뒷도',-1],[2,'개',2],[1,'걸',3],[0,'윷',4]]){
  const hit=labelFor(front);assert.equal(hit.name,name);assert.equal(hit.steps,steps);
 }
});
