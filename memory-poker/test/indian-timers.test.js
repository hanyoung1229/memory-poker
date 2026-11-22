'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {IndianService}=require('../lib/indian');
function setup(){
  let clock=100000;
  const service=new IndianService({
    now:()=>clock,
    schedule:(cb,delay)=>({cb,delay,cancelled:false,unref(){}}),
    cancel:t=>{t.cancelled=true}
  });
  const {room,player:a}=service.create('시간 은행 1');
  const b=service.join(room.code,'시간 은행 2');
  const advance=(ms)=>{
    const timer=room.timer;
    assert.ok(timer,'expected timer at stage '+room.stage);
    assert.equal(timer.delay,ms);
    clock+=ms;
    assert.equal(timer.cancelled,false);
    timer.cb();
  };
  return {service,room,a,b,advance,setTime:ms=>{clock+=ms}};
}
test('양쪽 준비 완료 뒤 5초 자동 시작',()=>{
  const x=setup();
  x.service.ready(x.room,x.a.token,true);
  assert.equal(x.room.stage,'lobby');
  x.service.ready(x.room,x.b.token,true);
  assert.equal(x.room.stage,'starting');
  x.advance(5000);
  assert.equal(x.room.stage,'opening');
  x.advance(4500);
  assert.equal(x.room.stage,'betting');
  assert.equal(x.room.round,1);
});
test('콜 직후 서버에 3초 비공개 카운트다운, 이후 공개, 결과 5초 후 다음 판',()=>{
  const x=setup();
  x.service.ready(x.room,x.a.token,true);x.service.ready(x.room,x.b.token,true);
  x.advance(5000);x.advance(4500);
  const first=x.room.players[x.room.turn];
  x.service.bet(x.room,first.token,2);
  const second=x.room.players[x.room.turn];
  x.service.call(x.room,second.token);
  assert.equal(x.room.stage,'showdown_countdown');
  for(const p of [x.a,x.b]){
    const view=x.service.serialize(x.room,p.token);
    assert.equal(view.revealed,null);
    assert.equal(view.opponentCard,null);
    assert.equal(view.result,null);
  }
  x.advance(3000);
  assert.equal(x.room.stage,'result');
  assert.equal(x.service.serialize(x.room,x.a.token).revealed.length,2);
  x.advance(5000);
  assert.equal(x.room.stage,'betting');
  assert.equal(x.room.round,2);
});
test('시간은행은 실제 베팅 차례 동안만 차감되며 누적된다',()=>{
  const x=setup();x.service.ready(x.room,x.a.token,true);x.service.ready(x.room,x.b.token,true);
  x.advance(5000);x.advance(4500);
  const first=x.room.players[x.room.turn];
  x.setTime(12000);x.service.bet(x.room,first.token,2);
  assert.equal(first.thinkMs,488000);
  const second=x.room.players[x.room.turn];
  x.setTime(9000);x.service.call(x.room,second.token);
  assert.equal(second.thinkMs,491000);
  x.advance(3000);x.advance(5000);
  assert.equal(x.room.players.reduce((sum,p)=>sum+p.thinkMs,0),979000);
});
test('500초 소진 시 자동 포기, 이후 20초 추가 판단시간',()=>{
  const x=setup();x.service.ready(x.room,x.a.token,true);x.service.ready(x.room,x.b.token,true);
  x.advance(5000);x.advance(4500);
  const firstIndex=x.room.turn;
  x.advance(500000);
  assert.equal(x.room.stage,'result');
  assert.equal(x.room.result.reason,'fold');
  assert.equal(x.room.result.timeout,true);
  assert.equal(x.room.players[firstIndex].thinkMs,0);
  x.advance(5000);
  if(x.room.turn!==firstIndex){
    const other=x.room.players[x.room.turn];
    x.service.bet(x.room,other.token,2);
  }
  assert.equal(x.room.turn,firstIndex);
  assert.equal(x.room.turnUsingOvertime,true);
  x.advance(20000);
  assert.equal(x.room.stage,'result');
  assert.equal(x.room.result.timeout,true);
  assert.equal(x.room.result.reason,'fold');
});
test('시작 대기 중 준비 취소 시 카운트다운 취소',()=>{
  const x=setup();x.service.ready(x.room,x.a.token,true);x.service.ready(x.room,x.b.token,true);
  const timer=x.room.timer;
  x.service.ready(x.room,x.a.token,false);
  assert.equal(x.room.stage,'lobby');
  assert.equal(timer.cancelled,true);
});
