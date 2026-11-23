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
 assert.equal(x.room.roll.name,'개');
 assert.equal(x.room.roll.steps,2);
 assert.equal(x.room.stage,'move');
 assert.equal(x.room.lastRoll.selected.length,2);
});
test('앞면 0,1,2,3,4개는 윷·뒷도·개·걸·모이며 윷·모는 추가 턴',()=>{
 const cases=[
 [['B','B'],['B','B']],'윷',
 [['F','B'],['B','B']],'뒷도',
 [['F','F'],['B','B']],'개',
 [['F','F'],['F','B']],'걸',
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
 chooseAll(x,[['F'],['B'],['F'],['F']]);
 assert.equal(x.room.roll.name,'걸');
 assert.equal(x.room.pieces.length,8);
 assert.equal(x.game.serialize(x.room,x.users[2].token).legalMoves.length>0,true);
 assert.equal(x.game.serialize(x.room,x.users[1].token).legalMoves.length,0);
});
test('1대2에서 1인팀이 2개, 2인팀은 각 1개의 윷 선택',()=>{
 const x=create('1v2');start(x);
 chooseAll(x,[['F','F'],['B'],['F']]);
 assert.equal(x.room.roll.name,'걸');
 assert.equal(x.room.lastRoll.selected[0].choice.length,2);
});
test('원작 뒷도 특수 규칙: 출발 직전 칸에서 뒷도로 되돌아가면 완주',()=>{
 const options=moveOptionsForPiece({status:'board',path:[1]},-1);
 assert.equal(options.length,1);assert.equal(options[0].to,'FINISH');
 const x=create();start(x);
 x.room.pieces[0].status='board';x.room.pieces[0].path=[1];
 chooseAll(x,[['F','B'],['B','B']]);
 const move=x.game.legalMoves(x.room).find(p=>p.pieceId==='P1');
 x.game.move(x.room,x.users[0].token,move.pieceId,move.route);
 assert.equal(x.room.pieces[0].status,'done');
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
 x.room.pieces[1].status='board';x.room.pieces[1].path=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19];
 chooseAll(x,[['F','B'],['F','B']]); // 개: 19에서 한 칸으로도 완주, 초과 이동은 FINISH 유지
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
