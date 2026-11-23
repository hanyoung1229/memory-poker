'use strict';
const { randomBytes, randomInt } = require('node:crypto');
const { shuffle, scoreHand, compareScores } = require('./poker');

const PHASE_DURATIONS = Object.freeze({ prepare: 5000, memorize: 20000, select: 15000 });
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

// 공용 카드 3장에 기억 카드 16장 중 서로 다른 두 장을 더하는 120개 조합을 모두 비교합니다.
// 비교 기준은 실제 대전과 동일한 표준 5장 포커 족보/키커입니다.
// 동률일 경우 첫 번째 조합을 대표 조합으로 사용합니다.
function findBestMemoryPair(board, community) {
  if (!Array.isArray(board) || board.length !== 16 || !Array.isArray(community) || community.length !== 3) {
    throw new Error('최상 조합을 계산하려면 기억 카드 16장과 공용 카드 3장이 필요합니다.');
  }
  let best = null;
  for (let a = 0; a < board.length - 1; a++) {
    for (let b = a + 1; b < board.length; b++) {
      const hand = scoreHand([...community, board[a], board[b]]);
      if (!best || compareScores(hand.score, best.score) > 0) {
        best = { indices: [a, b], cards: [board[a], board[b]], score: hand.score, name: hand.name };
      }
    }
  }
  return best;
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
    const room = { code, phase: 'lobby', round: 0, deadline: null, board: [], community: [], players: [], activeIds: [], timer: null, lastResult: null, lastTouched: this.now() };
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
    const player = { id: token().slice(0, 12), token: token(), name, ready: false, picked: [], wins: 0, played: 0, points: 0, bonusThisRound: 0, spectator: room.phase !== 'lobby' };
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
    this.beginRound(room);
  }

  // 결과 화면에서 로비를 거치지 않고 같은 참가자로 바로 다음 판을 시작합니다.
  replay(room, accessToken) {
    const host = this.player(room, accessToken);
    if (room.players[0] !== host) throw new Error('방장만 바로 다음 판을 시작할 수 있습니다.');
    if (room.phase !== 'result') throw new Error('결과 발표 후에만 다시 시작할 수 있습니다.');
    if (room.players.length < 2) throw new Error('다음 판을 시작하려면 최소 2명이 필요합니다.');
    this.beginRound(room);
  }

  beginRound(room) {
    const deck = shuffle();
    room.board = deck.slice(0, 16);
    room.community = deck.slice(16, 19);
    room.activeIds = room.players.map(p => p.id);
    room.lastResult = null;
    room.round++;
    for (const player of room.players) { player.picked = []; player.spectator = false; player.bonusThisRound = 0; }
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
    // 중복 콜백/요청이 발생해도 같은 판의 승리가 두 번 기록되지 않습니다.
    if (room.phase !== 'select') return;
    const participants = room.players.filter(p => room.activeIds.includes(p.id));
    // 두 장을 직접 골랐는지 자동 보충 이전에 확정합니다.
    const manualPicks = new Set(participants.filter(p => p.picked.length === 2).map(p => p.id));
    for (const player of participants) {
      while (player.picked.length < 2) {
        let index;
        do { index = randomInt(16); } while (player.picked.includes(index));
        player.picked.push(index);
      }
    }
    const scored = participants.map(p => ({ id: p.id, ...scoreHand([...room.community, ...p.picked.map(i => room.board[i])]) }));
    const bestPossible = findBestMemoryPair(room.board, room.community);
    const best = scored.reduce((current, item) => !current || compareScores(item.score, current.score) > 0 ? item : current, null);
    const winnerIds = best ? scored.filter(s => compareScores(s.score, best.score) === 0).map(s => s.id) : [];
    for (const p of participants) {
      p.played += 1;
      const isWinner = winnerIds.includes(p.id);
      if (isWinner) p.wins += 1;
      const hand = scored.find(s => s.id === p.id);
      // 우승(공동 우승 포함) +1점, BEST 직접 적중 추가 +2점(합계 최대 +3점).
      // 키커까지 동점인 다른 두 장의 BEST 조합도 정답으로 인정합니다.
      p.bonusThisRound = manualPicks.has(p.id) && hand && compareScores(hand.score, bestPossible.score) === 0 ? 2 : 0;
      p.points += (isWinner ? 1 : 0) + p.bonusThisRound;
    }
    room.lastResult = { scored, winnerIds, bestPossible };
    this.advance(room, 'result');
  }

  reset(room, accessToken) {
    if (room.players[0] !== this.player(room, accessToken)) throw new Error('방장만 다음 판을 준비할 수 있습니다.');
    if (room.phase !== 'result') throw new Error('결과 발표 후 다음 판을 준비할 수 있습니다.');
    room.board = [];
    room.community = [];
    room.activeIds = [];
    room.lastResult = null;
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
    const scored = room.phase === 'result' ? (room.lastResult?.scored ?? []) : [];
    const winnerIds = room.phase === 'result' ? (room.lastResult?.winnerIds ?? []) : [];
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
      bestPossible: room.phase === 'result' ? (room.lastResult?.bestPossible ?? null) : null,
      players: room.players.map(p => {
        const hand = scored.find(s => s.id === p.id);
        return {
          id: p.id,
          name: p.name,
          ready: p.ready,
          wins: p.wins,
          played: p.played,
          points: p.points,
          bonusThisRound: room.phase === 'result' ? p.bonusThisRound : 0,
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

module.exports = { GameService, PHASE_DURATIONS, cleanName, findBestMemoryPair };
