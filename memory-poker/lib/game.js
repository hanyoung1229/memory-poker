'use strict';
const { randomBytes, randomInt } = require('node:crypto');
const { shuffle, scoreHand, compareScores } = require('./poker');

const PHASE_DURATIONS = Object.freeze({ prepare: 5000, memorize: 20000, select: 10000 });
const MAX_PLAYERS = 16;

function roomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => letters[randomInt(letters.length)]).join('');
}
function token() { return randomBytes(24).toString('hex'); }
function cleanName(name) {
  if (typeof name !== 'string') return '';
  return name.trim().replace(/\s+/g, ' ').slice(0, 16);
}

class GameService {
  constructor({ onChange = () => {}, now = () => Date.now(), schedule = setTimeout, cancel = clearTimeout } = {}) {
    this.rooms = new Map();
    this.onChange = onChange;
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
  }

  create(name) {
    name = cleanName(name);
    if (!name) throw new Error('닉네임을 입력해 주세요.');
    let code;
    do { code = roomCode(); } while (this.rooms.has(code));
    const room = { code, phase: 'lobby', round: 0, deadline: null, board: [], community: [], players: [], activeIds: [], timer: null, lastTouched: this.now() };
    this.rooms.set(code, room);
    const player = this.join(code, name);
    return { room, player };
  }

  find(code) {
    const room = this.rooms.get(String(code || '').toUpperCase());
    if (!room) throw new Error('존재하지 않는 방입니다.');
    return room;
  }

  player(room, accessToken) {
    const player = room.players.find(p => p.token === accessToken);
    if (!player) throw new Error('입장 정보가 올바르지 않습니다. 다시 참가해 주세요.');
    return player;
  }

  join(code, rawName) {
    const room = this.find(code);
    if (room.players.length >= MAX_PLAYERS) throw new Error('방의 정원이 찼습니다. (최대 16명)');
    const name = cleanName(rawName);
    if (!name) throw new Error('닉네임을 입력해 주세요.');
    if (room.players.some(p => p.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('같은 닉네임이 이미 있습니다.');
    const player = { id: token().slice(0, 12), token: token(), name, ready: false, picked: [], spectator: room.phase !== 'lobby' };
    room.players.push(player);
    this.changed(room);
    return player;
  }

  changed(room) {
    room.lastTouched = this.now();
    this.onChange(room);
  }

  ready(room, accessToken, isReady) {
    if (room.phase !== 'lobby') throw new Error('준비는 대기실에서만 변경할 수 있습니다.');
    const player = this.player(room, accessToken);
    player.ready = Boolean(isReady);
    this.changed(room);
  }

  start(room, accessToken) {
    const host = this.player(room, accessToken);
    if (room.players[0] !== host) throw new Error('방장만 시작할 수 있습니다.');
    if (room.phase !== 'lobby') throw new Error('이미 게임 중입니다.');
    if (room.players.length < 2) throw new Error('최소 2명이 필요합니다.');
    if (!room.players.every(p => p.ready)) throw new Error('모든 플레이어가 준비해야 합니다.');
    const deck = shuffle();
    room.board = deck.slice(0, 16);
    room.community = deck.slice(16, 19);
    room.activeIds = room.players.map(p => p.id);
    room.round++;
    for (const player of room.players) { player.picked = []; player.spectator = false; }
    this.advance(room, 'prepare');
  }

  advance(room, nextPhase) {
    if (room.timer) this.cancel(room.timer);
    room.phase = nextPhase;
    const length = PHASE_DURATIONS[nextPhase];
    room.deadline = length ? this.now() + length : null;
    if (length) {
      const round = room.round;
      room.timer = this.schedule(() => {
        if (room.round !== round || room.phase !== nextPhase) return;
        if (nextPhase === 'prepare') this.advance(room, 'memorize');
        else if (nextPhase === 'memorize') this.advance(room, 'select');
        else this.finish(room);
      }, length);
      if (room.timer?.unref) room.timer.unref();
    } else room.timer = null;
    this.changed(room);
  }

  pick(room, accessToken, rawIndices) {
    const player = this.player(room, accessToken);
    if (room.phase !== 'select' || this.now() >= room.deadline) throw new Error('카드 선택 시간이 종료되었습니다.');
    if (!room.activeIds.includes(player.id)) throw new Error('다음 라운드부터 참여할 수 있습니다.');
    if (!Array.isArray(rawIndices) || rawIndices.length > 2 || rawIndices.some(i => !Number.isInteger(i) || i < 0 || i > 15) || new Set(rawIndices).size !== rawIndices.length) {
      throw new Error('서로 다른 카드 2장을 골라 주세요.');
    }
    player.picked = rawIndices;
    this.changed(room);
  }

  finish(room) {
    for (const player of room.players.filter(p => room.activeIds.includes(p.id))) {
      while (player.picked.length < 2) {
        let index;
        do { index = randomInt(16); } while (player.picked.includes(index));
        player.picked.push(index);
      }
    }
    this.advance(room, 'result');
  }

  reset(room, accessToken) {
    if (room.players[0] !== this.player(room, accessToken)) throw new Error('방장만 다음 판을 준비할 수 있습니다.');
    if (room.phase !== 'result') throw new Error('결과 발표 후 다음 판을 준비할 수 있습니다.');
    room.board = [];
    room.community = [];
    room.activeIds = [];
    for (const p of room.players) { p.picked = []; p.ready = false; p.spectator = false; }
    this.advance(room, 'lobby');
  }

  leave(room, accessToken) {
    const player = this.player(room, accessToken);
    room.players = room.players.filter(p => p !== player);
    room.activeIds = room.activeIds.filter(id => id !== player.id);
    if (room.players.length === 0) {
      if (room.timer) this.cancel(room.timer);
      this.rooms.delete(room.code);
    } else this.changed(room);
  }

  serialize(room, accessToken) {
    const viewer = this.player(room, accessToken);
    const exposed = room.phase === 'memorize' || room.phase === 'result';
    const scored = room.phase === 'result'
      ? room.players.filter(p => room.activeIds.includes(p.id)).map(p => ({ id: p.id, ...scoreHand([...room.community, ...p.picked.map(i => room.board[i])]) }))
      : [];
    const best = scored.reduce((current, item) => !current || compareScores(item.score, current.score) > 0 ? item : current, null);
    const winnerIds = best ? scored.filter(s => compareScores(s.score, best.score) === 0).map(s => s.id) : [];
    return {
      room: room.code,
      round: room.round,
      phase: room.phase,
      phaseEndsAt: room.deadline,
      serverNow: this.now(),
      you: viewer.id,
      hostId: room.players[0]?.id ?? null,
      board: exposed ? room.board : Array(16).fill(null),
      community: ['select', 'result'].includes(room.phase) ? room.community : [],
      selected: viewer.picked,
      players: room.players.map(p => {
        const hand = scored.find(s => s.id === p.id);
        return {
          id: p.id,
          name: p.name,
          ready: p.ready,
          spectator: !room.activeIds.includes(p.id) && room.phase !== 'lobby',
          selectedCount: p.picked.length,
          picks: room.phase === 'result' && hand ? p.picked : undefined,
          selectedCards: room.phase === 'result' && hand ? p.picked.map(i => room.board[i]) : undefined,
          handName: hand?.name,
          score: hand?.score,
          winner: winnerIds.includes(p.id)
        };
      })
    };
  }
}

module.exports = { GameService, PHASE_DURATIONS, cleanName };
