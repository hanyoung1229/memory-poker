'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {GradientService,validateSetup}=require('../lib/gradient');
const valid=[0,1,2,3,4,5,6];
function setup(){
 const tasks=[];
 const service=new GradientService({schedule:(fn,ms)=>{const t={fn,ms,unref(){}};tasks.push(t);return t;},cancel:()=>{}});
 const {room,player:a}=service.create('A'),b=service.join(room.code,'B');
 service.ready(room,a.token,true);service.ready(room,b.token,true);service.start(room,a.token);
 service.prepare(room,a.token,valid);service.prepare(room,b.token,valid);
 return {service,room,a,b,tasks};
}
test('원통 7개, 원통당 블록 정확히 1개, 비내림차순, 합계 30 이하',()=>{
 assert.deepEqual(validateSetup(valid),valid);
 assert.deepEqual(validateSetup([0,0,1,1,2,2,9]),[0,0,1,1,2,2,9]);
 assert.throws(()=>validateSetup(valid.slice(1)),/7개/);
 assert.throws(()=>validateSetup([0,0,0,1,2,3,4]),/최대 2개/);
 assert.throws(()=>validateSetup([0,1,3,2,4,5,6]),/왼쪽/);
 assert.throws(()=>validateSetup([2,4,5,6,7,8,9]),/30/);
 assert.throws(()=>validateSetup([0,1,2,3,4,5,[6]]),/0~9/);
});
test('첫 원통에는 0~9 중 어느 숫자든 들어가며 0도 허용',()=>{
 assert.deepEqual(validateSetup([0,0,0+1,1,2,2,3]),[0,0,1,1,2,2,3]);
 assert.deepEqual(validateSetup([1,2,3,4,5,6,7]),[1,2,3,4,5,6,7]);
});
test('상대 원통은 대결 전까지 전부 비밀이며 자신의 숫자만 확인 가능',()=>{
 const x=setup();
 const a=x.service.serialize(x.room,x.a.token);
 assert.deepEqual(a.players[0].tubes,valid);
 assert.equal(a.players[1].tubes,null);
 assert.equal(a.stage,'pick');
});
test('선공이 1개 원통을 제시하면 후공은 해당 번호만 확인한다',()=>{
 const x=setup(),first=x.room.turn,second=1-first;
 x.service.pick(x.room,x.room.players[first].token,0);
 const v=x.service.serialize(x.room,x.room.players[second].token);
 assert.deepEqual(v.firstPick,{player:first,index:0});
 assert.equal(v.players[first].tubes,null);
 assert.throws(()=>x.service.pick(x.room,x.room.players[first].token,1),/상대방/);
 x.service.pick(x.room,x.room.players[second].token,6);
 assert.equal(x.room.result.values[first],0);
 assert.equal(x.room.result.values[second],6);
 assert.equal(x.room.players[second].points,1);
 assert.equal(x.room.result.blocks[first],0);
 assert.equal(x.room.result.blocks[second],6);
});
test('같은 숫자의 무승부는 점수가 없고 사용 원통은 재사용할 수 없다',()=>{
 const x=setup(),first=x.room.turn;
 x.service.pick(x.room,x.room.players[first].token,0);
 x.service.pick(x.room,x.room.players[1-first].token,0);
 assert.equal(x.room.result.winner,null);
 assert.deepEqual(x.room.players.map(p=>p.points),[0,0]);
 assert.equal(x.room.timer.ms,3600);
 x.room.timer.fn();
 assert.equal(x.room.round,2);
 assert.equal(x.room.turn,1-first);
 assert.throws(()=>x.service.pick(x.room,x.room.turn===first?x.room.players[first].token:x.room.players[1-first].token,0),/이미 사용/);
});
test('4점을 먼저 얻으면 7개 원통을 다 쓰기 전이어도 승리',()=>{
 const x=setup();
 const win=0;
 x.room.players[1].tubes=[0,0,1,1,2,2,3];
 // 첫 번째 플레이어는 큰 수부터, 두 번째 플레이어는 작은 수부터 제시한다.
 for(let round=0;round<4;round++){
   const aIndex=6-round,bIndex=round;
   const turn=x.room.turn;
   const picks=[aIndex,bIndex];
   x.service.pick(x.room,x.room.players[turn].token,picks[turn]);
   x.service.pick(x.room,x.room.players[1-turn].token,picks[1-turn]);
   if(x.room.stage==='result')x.room.timer.fn();
 }
 assert.equal(x.room.stage,'finished');
 assert.equal(x.room.players[win].points,4);
 assert.equal(x.room.winner,win);
 assert.equal(x.room.history.length,4);
});
test('종료 후 방장만 재경기 준비로 복귀 가능',()=>{
 const x=setup();
 x.room.stage='finished';
 assert.throws(()=>x.service.restart(x.room,x.b.token),/방장/);
 x.service.restart(x.room,x.a.token);
 assert.equal(x.room.stage,'lobby');
 assert.equal(x.room.players[0].points,0);
});
