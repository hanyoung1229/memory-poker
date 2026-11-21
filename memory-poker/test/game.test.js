'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeDeck, shuffle, scoreHand, compareScores } = require('../lib/poker');
const { GameService } = require('../lib/game');
const c = (r, s) => ({ rank:r, suit:s });

test('52장 덱 / 섞은 덱에서 중복 카드가 없음', () => {
  assert.equal(makeDeck().length, 52);
  const shuffled = shuffle();
  assert.equal(new Set(shuffled.map(x => `${x.rank}${x.suit}`)).size, 52);
});

test('포커 5장 표준 족보 및 스트레이트 A2345 판정', () => {
  const hands = [
    [c(14,'S'), c(13,'D'), c(9,'H'), c(7,'H'), c(2,'C')], // high
    [c(14,'S'), c(14,'H'), c(9,'D'), c(7,'H'), c(2,'C')], // pair
    [c(14,'S'), c(14,'H'), c(9,'D'), c(9,'H'), c(2,'C')], // two pairs
    [c(14,'S'), c(14,'H'), c(14,'D'), c(7,'H'), c(2,'C')], // three
    [c(5,'S'), c(4,'H'), c(3,'D'), c(2,'H'), c(14,'C')], // wheel
    [c(14,'H'), c(12,'H'), c(9,'H'), c(7,'H'), c(2,'H')], // flush
    [c(14,'S'), c(14,'H'), c(14,'D'), c(9,'H'), c(9,'C')], // full house
    [c(14,'S'), c(14,'H'), c(14,'D'), c(14,'C'), c(9,'C')], // four
    [c(9,'S'), c(8,'S'), c(7,'S'), c(6,'S'), c(5,'S')] // straight flush
  ];
  hands.forEach((hand, i) => assert.equal(scoreHand(hand).category, i));
  for(let i = 1; i < hands.length; i++) assert.ok(compareScores(scoreHand(hands[i]).score, scoreHand(hands[i-1]).score) > 0);
  assert.equal(scoreHand(hands[4]).score[1], 5);
  const aceHigh = scoreHand([c(14,'C'), c(13,'S'), c(12,'H'), c(11,'D'), c(10,'C')]);
  assert.equal(aceHigh.score[1], 14);
  assert.ok(compareScores(aceHigh.score, scoreHand(hands[4]).score) > 0);
  assert.equal(compareScores(scoreHand(hands[4]).score, scoreHand([c(5,'C'), c(4,'C'), c(3,'H'), c(2,'S'), c(14,'D')]).score), 0);
});

test('서버 동기화: 5초 대기 → 20초 공개 → 10초 선택 → 족보 공개', () => {
  let clock = 10000;
  const tasks = [];
  let changed = 0;
  const game = new GameService({
    now: () => clock,
    schedule: (cb, ms) => { const task = { cb, at:clock + ms, canceled:false }; tasks.push(task); return task; },
    cancel: task => task.canceled = true,
    onChange: () => changed++
  });
  const { room, player: host } = game.create('방장');
  const guest = game.join(room.code, '친구');
  assert.throws(() => game.start(room, host.token), /준비/);
  game.ready(room, host.token, true);
  game.ready(room, guest.token, true);
  game.start(room, host.token);
  assert.equal(room.phase, 'prepare');
  assert.equal(room.board.length, 16);
  assert.equal(room.community.length, 3);
  assert.equal(new Set([...room.board, ...room.community].map(c => `${c.rank}${c.suit}`)).size, 19);
  assert.ok(game.serialize(room, guest.token).board.every(c => c === null));
  assert.equal(game.serialize(room, guest.token).community.length, 0);
  assert.throws(() => game.pick(room, guest.token, [1,2]), /선택 시간/);
  function forward(ms) {
    const target = clock + ms;
    while(true) {
      const due = tasks.filter(t => !t.canceled && t.at <= target).sort((a,b) => a.at - b.at)[0];
      if (!due) break;
      clock = due.at; due.canceled = true; due.cb();
    }
    clock = target;
  }
  forward(5000);
  assert.equal(room.phase, 'memorize');
  assert.ok(game.serialize(room, guest.token).board.every(c => c?.rank >= 2));
  forward(20000);
  assert.equal(room.phase, 'select');
  assert.equal(game.serialize(room, guest.token).community.length, 3);
  assert.ok(game.serialize(room, guest.token).board.every(c => c === null));
  game.pick(room, host.token, [0, 15]);
  game.pick(room, guest.token, [0, 15]); // 서로 같은 카드를 선택할 수 있음
  assert.deepEqual(game.serialize(room, host.token).selected, [0, 15]);
  assert.equal(game.serialize(room, host.token).players[1].picks, undefined);
  assert.throws(() => game.pick(room, guest.token, [0, 0]), /서로 다른/);
  forward(10000);
  assert.equal(room.phase, 'result');
  const result = game.serialize(room, guest.token);
  assert.equal(result.players[0].selectedCards.length, 2);
  assert.equal(result.players[1].selectedCards.length, 2);
  assert.equal(result.players.filter(p => p.winner).length, 2); // 같은 두 장 선택, 공용도 동일
  assert.ok(changed >= 6);
  assert.throws(() => game.reset(room, guest.token), /방장/);
  game.reset(room, host.token);
  assert.equal(room.phase, 'lobby');
  assert.equal(room.board.length, 0);
  assert.ok(room.players.every(p => !p.ready));
});

test('미선택/1장 선택 플레이어에게 남은 카드 무작위 자동 선택', () => {
  const game = new GameService({ schedule: () => ({ unref(){} }), cancel: () => {} });
  const { room, player: host } = game.create('A');
  const guest = game.join(room.code, 'B');
  game.ready(room, host.token, true);
  game.ready(room, guest.token, true);
  game.start(room, host.token);
  game.advance(room, 'select');
  game.pick(room, guest.token, [2]);
  game.finish(room);
  assert.equal(guest.picked.length, 2);
  assert.equal(guest.picked[0], 2);
  assert.equal(host.picked.length, 2);
  assert.equal(new Set(guest.picked).size, 2);
});
