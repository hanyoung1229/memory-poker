'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {IndianService}=require('../lib/indian');
function setup(){
  let clock=100000;
  const service=new IndianService({
    now:()=>clock,
    schedule:(cb,delay)=>({cb,delay,cancelled:false,unref(){}}),
    cancel:t=>{t.cancelled=true;}
  });
  const {room,player:a}=service.create('플레이어 A');
  const b=service.join(room.code,'플레이어 B');
  const advance=(ms)=>{
    const timer=room.timer;
    assert.ok(timer,'Expected an active timer in '+room.stage);
    assert.equal(timer.delay,ms);
    assert.equal(timer.cancelled,false);
    clock+=ms;timer.cb();
  };
  return {service,room,a,b,advance,setTime:ms=>{clock+=ms;}};
}
function launch(x) {
  x.service.ready(x.room,x.a.token,true);
  x.service.ready(x.room,x.b.token,true);
  assert.equal(x.room.stage,'lobby');
  x.service.start(x.room,x.a.token);
  assert.equal(x.room.stage,'opening');
  x.advance(4500);
  assert.equal(x.room.stage,'betting');
}
test('로비 준비 완료만으로 자동 시작하지 않고 방장의 수동 시작이 필요하다',()=>{
  const x=setup();x.service.ready(x.room,x.a.token,true);x.service.ready(x.room,x.b.token,true);
  assert.equal(x.room.stage,'lobby');
  assert.equal(x.room.timer,null);
  assert.throws(()=>x.service.start(x.room,x.b.token),/방장/);
  x.service.start(x.room,x.a.token);
  assert.equal(x.room.stage,'opening');
});
test('콜 즉시 양쪽 카드 공개, 일반 결과는 3초 뒤 자동 다음 판',()=>{
  const x=setup();launch(x);
  const first=x.room.players[x.room.turn];
  x.service.bet(x.room,first.token,2);
  const second=x.room.players[x.room.turn];
  x.service.call(x.room,second.token);
  assert.equal(x.room.stage,'result');
  for(const p of [x.a,x.b])assert.equal(x.service.serialize(x.room,p.token).revealed.length,2);
  x.advance(3000);
  assert.equal(x.room.stage,'betting');
  assert.equal(x.room.round,2);
});
test('결과 팟이 20코인 이상이면 5초 후 자동 진행',()=>{
  const x=setup();launch(x);
  const first=x.room.players[x.room.turn];
  x.service.bet(x.room,first.token,10);
  x.service.call(x.room,x.room.players[x.room.turn].token);
  assert.equal(x.room.pot,22);
  assert.equal(x.room.timer.delay,5000);
  x.advance(5000);
  assert.equal(x.room.round,2);
});
test('한 차례 최대 30초: 시간은행에서 실제 사용 시간만 차감된다',()=>{
  const x=setup();launch(x);
  const firstIndex=x.room.turn,first=x.room.players[firstIndex];
  assert.equal(x.room.timer.delay,30000);
  x.setTime(12000);
  x.service.bet(x.room,first.token,2);
  assert.equal(first.thinkMs,488000);
  assert.equal(x.room.timer.delay,30000);
  x.setTime(9000);
  x.service.call(x.room,x.room.players[x.room.turn].token);
  assert.equal(x.room.players[1-firstIndex].thinkMs,491000);
});
test('30초가 지나면 자동 포기하고 남은 시간은행은 보존한다',()=>{
  const x=setup();launch(x);
  const firstIndex=x.room.turn;
  x.advance(30000);
  assert.equal(x.room.stage,'result');
  assert.equal(x.room.result.reason,'fold');
  assert.equal(x.room.result.timeout,true);
  assert.equal(x.room.players[firstIndex].thinkMs,470000);
});
test('시간은행이 0이면 이후 자신의 턴마다 20초 제공하고 초과 시 자동 포기',()=>{
  const x=setup();launch(x);
  const firstIndex=x.room.turn;
  x.room.players[firstIndex].thinkMs=5000;
  x.service.startTurn(x.room,firstIndex);
  assert.equal(x.room.timer.delay,5000);
  x.advance(5000);
  assert.equal(x.room.players[firstIndex].thinkMs,0);
  x.advance(3000);
  if(x.room.turn!==firstIndex){
    x.service.bet(x.room,x.room.players[x.room.turn].token,2);
  }
  assert.equal(x.room.turn,firstIndex);
  assert.equal(x.room.turnUsingOvertime,true);
  assert.equal(x.room.timer.delay,20000);
  x.advance(20000);
  assert.equal(x.room.result.reason,'fold');
  assert.equal(x.room.result.timeout,true);
});
test('패널티가 발생한 결과는 5초 보여주고 다음 판 시작',()=>{
  const x=setup();launch(x);
  const i=x.room.turn;
  x.room.cards[i]={rank:10,suit:'S'};
  x.service.fold(x.room,x.room.players[i].token);
  assert.equal(x.room.result.penalty,13);
  assert.equal(x.room.timer.delay,5000);
});
