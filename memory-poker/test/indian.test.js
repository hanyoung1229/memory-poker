'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {IndianService,makeDeck,DEFAULT_COINS} = require('../lib/indian');
function setup() {
  const service = new IndianService({schedule:()=>({unref(){}}),cancel:()=>{}});
  const {room,player:a}=service.create('Alice');
  const b=service.join(room.code,'Bob');
  return {service,room,a,b};
}
function begin(service,room,a,b) {
  service.ready(room,a.token,true);
  service.ready(room,b.token,true);
  service.start(room,a.token);
  service.beginRound(room);
}
test('20장: ♦와 ♠의 A~10 각각 한 장, 시작 코인 40개',()=>{
  const deck=makeDeck();
  assert.equal(deck.length,20);
  assert.equal(new Set(deck.map(c=>c.rank+c.suit)).size,20);
  assert.equal(deck.filter(c=>c.rank===10).length,2);
  const {room}=setup();
  assert.equal(DEFAULT_COINS,40);
  assert.equal(room.startCoins,40);
  assert.deepEqual(room.players.map(p=>p.coins),[40,40]);
});
test('방장은 게임 시작 전에 시작 코인을 30~100개로 설정',()=>{
  const {service,room,a,b}=setup();
  assert.throws(()=>service.configure(room,b.token,55),/방장/);
  assert.throws(()=>service.configure(room,a.token,29),/30~100/);
  assert.throws(()=>service.configure(room,a.token,101),/30~100/);
  service.configure(room,a.token,30);
  assert.deepEqual(room.players.map(p=>p.coins),[30,30]);
  service.configure(room,a.token,100);
  assert.deepEqual(room.players.map(p=>p.coins),[100,100]);
});
test('자기 카드는 베팅 도중 서버 응답에 포함되지 않고, 상대 카드만 보인다',()=>{
  const {service,room,a,b}=setup();
  begin(service,room,a,b);
  const sa=service.serialize(room,a.token), sb=service.serialize(room,b.token);
  assert.deepEqual(sa.opponentCard,room.cards[1]);
  assert.deepEqual(sb.opponentCard,room.cards[0]);
  assert.equal(sa.revealed,null);
  assert.equal(sb.revealed,null);
  assert.equal('cards' in sa,false);
});
test('베팅, 콜, 팟 분배, 누적 코인 총합 보존',()=>{
  const {service,room,a,b}=setup();
  begin(service,room,a,b);
  const player=room.players[room.turn],respond=room.players[1-room.turn];
  assert.throws(()=>service.bet(room,respond.token,2),/상대 플레이어/);
  service.bet(room,player.token,2);
  service.call(room,respond.token);
  assert.equal(room.stage,'result');
  assert.equal(room.pot,6);
  assert.equal(room.players.reduce((sum,p)=>sum+p.coins,0),80);
  service.next(room,a.token);
  assert.equal(room.round,2);
});
test('10을 들고 포기하면 남은 코인의 1/3 또는 10개 중 높은 금액을 이전',()=>{
  const {service,room,a,b}=setup();
  begin(service,room,a,b);
  const player=room.players[room.turn];
  room.cards[room.turn]={rank:10,suit:'S'};
  service.fold(room,player.token);
  assert.equal(room.stage,'result');
  assert.equal(room.result.reason,'fold');
  assert.equal(room.result.penalty,13);
  assert.equal(room.players.reduce((sum,p)=>sum+p.coins,0),80);
});
test('남은 카드가 2장 미만이면 ♥♣ 20장으로 교체, 보유 코인 유지',()=>{
  const {service,room,a,b}=setup();
  begin(service,room,a,b);
  service.fold(room,room.players[room.turn].token);
  const balance=room.players.map(p=>p.coins);
  room.deck=[{rank:8,suit:'S'}];
  service.next(room,a.token);
  assert.equal(room.deck.length,18);
  assert.equal(room.deckCycle,2);
  assert.deepEqual(new Set(room.deck.map(c=>c.suit)),new Set(['H','C']));
  assert.equal(service.serialize(room,a.token).deckRemaining,18);
  assert.equal('deckCycle' in service.serialize(room,a.token),false);
  assert.deepEqual(room.players.map(p=>p.coins),balance.map(v=>v-1));
});

test('세 번째 뭉치는 ♦♠으로 복귀하고 코인·라운드 유지',()=>{
  const {service,room,a,b}=setup();begin(service,room,a,b);
  service.fold(room,room.players[room.turn].token);
  room.deck=[];service.next(room,a.token);
  assert.equal(room.deckCycle,2);
  assert.deepEqual(new Set(room.deck.map(c=>c.suit)),new Set(['H','C']));
  service.fold(room,room.players[room.turn].token);
  room.deck=[];service.next(room,a.token);
  assert.equal(room.deckCycle,3);
  assert.deepEqual(new Set(room.deck.map(c=>c.suit)),new Set(['D','S']));
  assert.equal(room.round,3);
  assert.equal(room.players.reduce((n,p)=>n+p.coins,0),80);
});
