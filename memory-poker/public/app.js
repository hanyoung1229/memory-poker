'use strict';
const app = document.querySelector('#app');
const toastBox = document.querySelector('#toast');
const PHASES = {
  lobby: { eyebrow: 'WAITING ROOM', title: '게임 준비', detail: '모든 참가자가 준비를 완료하면 방장이 시작할 수 있습니다.' },
  prepare: { eyebrow: 'GET READY', title: '카드 배치 중', detail: '16장의 카드가 펼쳐집니다. 잠시 후 공개돼요.' },
  memorize: { eyebrow: 'MEMORIZE', title: '카드를 기억하세요', detail: '20초 동안 16장의 카드 위치를 외워 보세요.' },
  select: { eyebrow: 'CHOOSE YOUR HAND', title: '카드 2장을 고르세요', detail: '카드가 뒤집혔습니다. 기억한 위치에서 원하는 2장을 선택하세요.' },
  result: { eyebrow: 'SHOWDOWN', title: '승부 결과', detail: '공용 카드 3장 + 선택한 카드 2장으로 포커 족보를 비교합니다.' }
};
const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
let state = null;
let room = null;
let accessToken = null;
let stream = null;
let offsetMs = 0;
let draftPicks = [];
let lastPhaseKey = '';
let pickSending = false;
let pickQueued = false;
let toastTimeout = null;

// v1.5.2 — 카드 배치·암기·선택 동안 Covert Affair 연속 재생
const MUSIC_TRACKS = Object.freeze({
  bossa: { name: 'Bossa Antigua', src: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Bossa%20Antigua.mp3' },
  covert: { name: 'Covert Affair', src: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Covert%20Affair.mp3' },
  night: { name: 'Night on the Docks - Trumpet', src: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Night%20on%20the%20Docks%20-%20Trumpet.mp3' }
});
const MUSIC_PHASE = Object.freeze({ lobby:'bossa', prepare:'covert', memorize:'covert', select:'covert', result:'night' });
let musicAudio = null;
let musicEnabled = false;
let musicChoice = localStorage.getItem('mp:bgm:track') || 'auto';
if (musicChoice !== 'auto' && !MUSIC_TRACKS[musicChoice]) musicChoice = 'auto';
let musicVolume = Number(localStorage.getItem('mp:bgm:volume') ?? '25');
musicVolume = Number.isFinite(musicVolume) ? Math.min(100, Math.max(0, musicVolume)) : 25;
let musicLoop = localStorage.getItem('mp:bgm:loop') !== 'false';
let musicLoadedKey = null;
let musicFinished = false;

function musicKeyForPhase() {
  return musicChoice === 'auto' ? (MUSIC_PHASE[state?.phase || 'lobby'] || 'bossa') : musicChoice;
}
function musicLabel() {
  const now = document.querySelector('#musicNow');
  const toggle = document.querySelector('#musicToggle');
  if (toggle) {
    toggle.textContent = musicEnabled ? '🔊 음악 끄기' : '🎵 음악 켜기';
    toggle.setAttribute('aria-pressed', String(musicEnabled));
  }
  if (now) now.textContent = (musicChoice === 'auto' ? '자동 · ' : '') + MUSIC_TRACKS[musicKeyForPhase()].name + (musicEnabled ? '' : ' · 대기');
}
async function syncMusic() {
  musicLabel();
  if (!musicEnabled) return;
  if (!musicAudio) {
    musicAudio = new Audio();
    musicAudio.preload = 'none';
    musicAudio.addEventListener('ended', () => { if (!musicLoop) musicFinished = true; });
    musicAudio.addEventListener('error', () => {
      const now = document.querySelector('#musicNow');
      if (now && musicEnabled) now.textContent = '음원 접속 실패 · 연결 상태를 확인해 줘.';
    });
  }
  const key = musicKeyForPhase();
  musicAudio.volume = musicVolume / 100;
  musicAudio.loop = musicLoop;
  if (musicLoadedKey !== key) {
    musicAudio.pause();
    musicAudio.src = MUSIC_TRACKS[key].src;
    musicLoadedKey = key;
    musicFinished = false;
  }
  if (musicAudio.paused && !musicFinished) {
    try { await musicAudio.play(); }
    catch {
      const now = document.querySelector('#musicNow');
      if (now && musicEnabled) now.textContent = '재생 제한됨 · 음악 버튼을 다시 눌러 줘.';
    }
  }
}
function initMusicControls() {
  const toggle = document.querySelector('#musicToggle');
  const configure = document.querySelector('#musicSettingsToggle');
  const panel = document.querySelector('#musicSettings');
  const track = document.querySelector('#musicTrack');
  const volume = document.querySelector('#musicVolume');
  const value = document.querySelector('#musicVolumeValue');
  const loop = document.querySelector('#musicLoop');
  if (!toggle || !configure || !panel || !track || !volume || !value || !loop) return;
  track.value = musicChoice;
  volume.value = String(musicVolume);
  value.textContent = musicVolume + '%';
  loop.checked = musicLoop;
  musicLabel();
  toggle.addEventListener('click', () => {
    musicEnabled = !musicEnabled;
    if (!musicEnabled) {
      musicAudio?.pause();
      musicLabel();
    } else {
      musicFinished = false;
      if (musicAudio?.ended) musicAudio.currentTime = 0;
      syncMusic();
    }
  });
  configure.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    configure.setAttribute('aria-expanded', String(!panel.hidden));
  });
  track.addEventListener('change', () => {
    musicChoice = track.value;
    localStorage.setItem('mp:bgm:track', musicChoice);
    musicLoadedKey = null;
    musicFinished = false;
    if (musicEnabled) syncMusic();
    else musicLabel();
  });
  volume.addEventListener('input', () => {
    musicVolume = Number(volume.value);
    value.textContent = musicVolume + '%';
    localStorage.setItem('mp:bgm:volume', String(musicVolume));
    if (musicAudio) musicAudio.volume = musicVolume / 100;
  });
  loop.addEventListener('change', () => {
    musicLoop = loop.checked;
    localStorage.setItem('mp:bgm:loop', String(musicLoop));
    if (musicAudio) musicAudio.loop = musicLoop;
  });
}


function escapeHtml(v) { return String(v ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s])); }
function cardLabel(card) { return `${RANK[card.rank] || card.rank}${SUIT[card.suit]}`; }
function isRed(card) { return card.suit === 'H' || card.suit === 'D'; }
function toast(message) {
  toastBox.textContent = message;
  toastBox.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toastBox.classList.remove('show'), 3000);
}
function header(right) {
  return `<header class="topbar"><a href="/" class="brand" data-home><span class="brandmark">♠</span><span><span class="brandname">MEMORY POKER</span><span class="brandsub">REMEMBER. PICK. WIN.</span></span></a><div class="top-meta">${right || '기억력으로 완성하는<br><strong>5 CARD SHOWDOWN</strong>'}</div></header>`;
}
function entryPage(code = null) {
  const savedName = escapeHtml(localStorage.getItem('mp:name') || '');
  const joining = !!code;
  app.innerHTML = header() + `
    <section class="card-panel entry">
      <div class="entry-hero">
        <div><span class="eyebrow">A GAME OF MEMORY AND LUCK</span><h1>기억하고.<br>고르고.<br><span>승부하라.</span></h1><p>16장의 카드를 외우고, 나만의 2장을 선택해<br>공개된 3장과 최고의 포커 패를 완성하세요.</p></div>
        <div class="hero-cards" aria-hidden="true"><div class="hero-card">A♠</div><div class="hero-card">K♥</div><div class="hero-card">Q♣</div></div>
      </div>
      <div class="entry-actions">
        <span class="eyebrow">${joining ? 'JOIN GAME' : 'PLAY TOGETHER'}</span>
        <h2>${joining ? '친구의 방에 참가' : '친구들과 한 판!'}</h2>
        <p class="subtext">${joining ? `초대 코드 <strong style="color:var(--gold)">${escapeHtml(code)}</strong>로 들어갑니다. 닉네임만 입력해 주세요.` : '방을 만들고 링크를 공유하세요. 모두 준비하면 게임을 시작할 수 있습니다.'}</p>
        <form id="joinForm">
          <label class="field" for="playerName">닉네임</label>
          <input id="playerName" maxlength="16" value="${savedName}" placeholder="예: 포커왕" required autocomplete="nickname" />
          ${joining ? `<button class="btn btn-primary full mt24" type="submit">방 참가하기 →</button>` : `<button class="btn btn-primary full mt24" type="submit">새 게임 방 만들기 →</button>`}
        </form>
        ${joining ? `<button type="button" class="btn btn-ghost full mt12" data-home>메인으로 돌아가기</button>` : `<div class="or">이미 초대 코드를 받으셨나요?</div><form id="codeForm"><label class="field" for="joinCode">초대 코드 6자리</label><input id="joinCode" maxlength="6" placeholder="예: AB3XYZ" autocapitalize="characters" required /><button type="submit" class="btn btn-muted full mt12">코드로 참가하기</button></form>`}
        <div class="notes"><span>무료로 플레이</span><span>최대 16명</span><span>모바일 지원</span></div>
      </div>
    </section><footer class="foot">기억력 포커 · 금전 베팅 없는 친구용 게임</footer>`;
  document.querySelector('#joinForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.querySelector('#playerName').value.trim();
    if (!name) return toast('닉네임을 입력해 주세요.');
    try {
      const result = await post(joining ? '/api/join' : '/api/create', joining ? { name, room: code } : { name }, false);
      localStorage.setItem('mp:name', name);
      enterRoom(result.room, result.token);
    } catch (err) { toast(err.message); }
  });
  if (!joining) document.querySelector('#codeForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const value = document.querySelector('#joinCode').value.toUpperCase().replace(/\s/g, '');
    if (!/^[A-Z2-9]{6}$/.test(value)) return toast('6자리 초대 코드를 입력해 주세요.');
    history.pushState(null, '', `/r/${value}`);
    entryPage(value);
  });
}

async function post(url, payload, authorized = true) {
  const response = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify(payload)
  });
  let body;
  try { body = await response.json(); } catch { throw new Error('서버 연결에 실패했습니다.'); }
  if (!response.ok) throw new Error(body.error || '요청이 실패했습니다.');
  return body;
}
function applyState(incoming) {
  offsetMs = Date.now() - incoming.serverNow;
  const phaseKey = `${incoming.round}:${incoming.phase}`;
  if (phaseKey !== lastPhaseKey) {
    draftPicks = [...incoming.selected];
    lastPhaseKey = phaseKey;
  } else if (incoming.phase === 'select' && !pickSending && !pickQueued) {
    draftPicks = [...incoming.selected];
  }
  state = incoming;
  renderRoom();
  syncMusic();
}
async function enterRoom(code, token) {
  if (stream) { stream.close(); stream = null; }
  room = code;
  accessToken = token;
  state = null;
  lastPhaseKey = '';
  localStorage.setItem(`mp:token:${room}`, token);
  history.replaceState(null, '', `/r/${code}`);
  app.innerHTML = '<div class="loading">게임 방에 연결하고 있습니다...</div>';
  try {
    const check = await fetch(`/api/rooms/${room}?token=${encodeURIComponent(token)}`);
    if (!check.ok) throw new Error((await check.json()).error || '방을 찾을 수 없습니다.');
    if (room !== code || accessToken !== token) return;
    applyState(await check.json());
  } catch (err) {
    if (room !== code || accessToken !== token) return;
    localStorage.removeItem(`mp:token:${code}`);
    accessToken = null;
    state = null;
    toast(err.message);
    return entryPage(code);
  }
  if (room !== code || accessToken !== token) return;
  stream = new EventSource(`/api/rooms/${room}/stream?token=${encodeURIComponent(token)}`);
  stream.addEventListener('state', event => applyState(JSON.parse(event.data)));
  stream.onerror = async () => {
    if (state) {
      const label = document.querySelector('#connectionState');
      if (label) label.textContent = '연결 재시도 중';
    }
    try {
      const check = await fetch(`/api/rooms/${code}?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
      if (check.ok || room !== code || accessToken !== token) return;
      if (stream) stream.close();
      stream = null; state = null; accessToken = null;
      localStorage.removeItem(`mp:token:${code}`);
      entryPage(code);
      toast('방 정보가 만료되었습니다. 다시 참가해 주세요.');
    } catch { /* 일시적인 네트워크 장애인 경우 SSE가 자동 재연결됩니다. */ }
  };
}
function face(card, index, extraClass = '') {
  return `<div class="playing-card ${isRed(card) ? 'red' : ''} ${extraClass}" ${index !== null ? `data-index="${index}"` : ''} aria-label="${cardLabel(card)}">
    <span class="corner">${RANK[card.rank] || card.rank}<br>${SUIT[card.suit]}</span><span class="suit">${SUIT[card.suit]}</span><span class="corner corner-bottom">${RANK[card.rank] || card.rank}<br>${SUIT[card.suit]}</span>
    ${index !== null ? `<span class="num">${index + 1}</span>` : ''}</div>`;
}
function back(index, opts = {}) {
  const selected = opts.selected ? ' selected' : '';
  const pickable = opts.pickable ? ' pickable' : '';
  const slot = index !== null ? `data-index="${index}"` : '';
  return `<div class="playing-card back${selected}${pickable}" ${slot} ${opts.pickable ? `role="button" tabindex="0" aria-pressed="${!!opts.selected}"` : ''} aria-label="${index !== null ? `${index + 1}번 카드` : '뒷면'}"><div class="card-back-center">♠</div>${index !== null ? `<span class="num">${index + 1}</span>` : ''}${opts.selected ? '<span class="pick-check">✓</span>' : ''}</div>`;
}
function rules() {
  return `<div class="rules"><div class="rule"><div class="rule-number">01 · PREPARE</div><div class="rule-desc">16장 카드 뒷면 배치<br>5초 대기</div></div><div class="rule"><div class="rule-number">02 · MEMORIZE</div><div class="rule-desc">모든 카드를 공개<br>20초 암기</div></div><div class="rule"><div class="rule-number">03 · SHOWDOWN</div><div class="rule-desc">공용 3장 공개 · 15초 선택<br>5장 족보로 승부</div></div></div>`;
}
function roomHeader() {
  return `<section class="card-panel room-header"><div><div class="room-code-label">INVITE CODE · 친구 초대</div><div class="room-code">${escapeHtml(state.room)}</div></div><div class="room-actions"><button class="btn btn-sm btn-primary" data-action="copy">🔗 초대 링크 복사</button><button class="btn btn-sm btn-muted" data-action="leave">나가기</button></div></section>`;
}
function playerStatus(player) {
  if (state.phase === 'lobby') return `<span class="status ${player.ready ? 'ready' : ''}">${player.ready ? '✓ 준비 완료' : '준비 중'}</span>`;
  if (state.phase === 'result') return player.spectator ? '<span class="status">관전</span>' : `<span class="status ${player.winner ? 'win' : ''}">${player.winner ? '★ 승리' : escapeHtml(player.handName || '결과')}</span>`;
  if (player.spectator) return '<span class="status">관전 중</span>';
  if (state.phase === 'select') return `<span class="status ${player.selectedCount === 2 ? 'ready' : ''}">${player.selectedCount}/2 선택</span>`;
  return '<span class="status">참가 중</span>';
}
function playersPanel() {
  const ranked = [...state.players].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'ko') || b.played - a.played || a.name.localeCompare(b.name, 'ko'));
  return `<section class="card-panel sidebar-panel players-panel compact-rank-panel"><div class="section-top"><div class="section-title">⭐ 누적 점수 순위</div><span class="count-label">${state.players.length} / 16명</span></div><div class="players">${ranked.map((player, i) => `<div class="player ${state.you === player.id ? 'me' : ''}"><div class="player-detail"><div class="player-name"><span class="rank-number">${ranked.findIndex(p => p.points === player.points) + 1}</span>${escapeHtml(player.name)}${state.you === player.id ? '<span class="player-you">나</span>' : ''}${state.hostId === player.id ? ' 👑' : ''}</div><div class="player-substatus">${playerStatus(player)} · ${player.played}판 참가</div></div><div class="score-total"><strong>${player.points}</strong><span>점</span></div></div>`).join('')}</div><p class="sidebar-note">승리 +1점 · BEST 적중 추가 +2점 · 점수가 같으면 공동 순위입니다.</p></section>`;
}
function communityPanel() {
  return `<section class="card-panel sidebar-panel community-panel large-community-panel"><div class="section-top"><div class="section-title">공용 카드</div><span class="count-label">COMMUNITY · 3장</span></div><div class="share-cards">${state.community.length ? state.community.map(c => face(c, null)).join('') : Array.from({ length: 3 }, () => back(null)).join('')}</div><p class="sidebar-note">모든 플레이어가 이 카드 3장에 자신이 선택한 2장을 더해 족보를 완성합니다.</p></section>`;
}
function lobby() {
  const me = state.players.find(p => p.id === state.you);
  const amHost = state.hostId === state.you;
  const everyoneReady = state.players.length >= 2 && state.players.every(p => p.ready);
  return `${roomHeader()}<div class="lobby-main"><section class="card-panel lobby-left"><span class="eyebrow">ROOM ${escapeHtml(state.room)}</span><h2>함께할 친구를 초대하세요</h2><p class="subtext">상단의 초대 링크를 친구에게 보내세요. 모두 접속해 준비를 마치면 방장이 게임을 시작합니다.</p><div class="lobby-banner"><div class="lobby-banner-icon">♣</div><strong>플레이어 대기 중</strong><p>2명 이상부터 시작할 수 있습니다.<br>원하는 만큼 친구를 초대하세요.</p></div><div class="lobby-action"><button class="btn ${me.ready ? 'btn-muted' : 'btn-primary'}" data-action="ready">${me.ready ? '✓ 준비 취소하기' : '준비 완료'}</button>${amHost ? `<button class="btn btn-primary" data-action="start" ${everyoneReady ? '' : 'disabled'}>게임 시작 →</button>` : ''}</div>${amHost && !everyoneReady ? '<p class="sidebar-note">시작하려면 2명 이상이 들어오고 모두 준비해야 합니다.</p>' : ''}${rules()}</section><aside class="sidebar">${playersPanel()}<section class="card-panel sidebar-panel"><div class="section-title">게임 방법</div><p class="sidebar-note">52장을 섞고, 맨 위의 16장을 4×4로 놓습니다. 5초 뒤 20초 동안 카드를 공개한 후 뒤집습니다. 다음 3장을 공용 카드로 공개하고, 각자 15초 동안 두 위치를 고릅니다.</p><p class="sidebar-note">다른 플레이어와 같은 위치를 선택해도 됩니다. 미선택 카드는 시간 종료 시 무작위로 채워집니다.</p></section></aside></div>`;
}
function boardPanel() {
  const canPick = state.phase === 'select' && !state.players.find(p => p.id === state.you)?.spectator;
  const bestPositions = state.phase === 'result' ? (state.bestPossible?.indices ?? []) : [];
  const boardHtml = state.board.map((card, i) => card
    ? face(card, i, bestPositions.includes(i) ? 'best-memory-pick' : '')
    : back(i, { pickable: canPick, selected: draftPicks.includes(i) })).join('');
  const hints = {
    prepare: '카드가 <strong>5초 뒤</strong> 공개됩니다.',
    memorize: '카드의 <strong>숫자 · 문양 · 위치</strong>를 기억하세요.',
    select: canPick ? `선택한 카드: <strong>${draftPicks.length} / 2장</strong> · 다시 누르면 선택 취소` : '이번 라운드는 <strong>관전 모드</strong>입니다.',
    result: '카드 전체를 공개했습니다. <strong>금색으로 표시된 2장</strong>이 공용 카드와 가장 좋은 족보를 만들 수 있는 조합입니다.'
  };
  return `<section class="card-panel main-board"><div class="section-top"><div class="section-title">기억 카드 · 4×4</div><div class="count-label">16 CARDS · ${state.phase === 'memorize' || state.phase === 'result' ? 'FACE UP' : 'FACE DOWN'}</div></div>${state.phase === 'select' ? `<div class="phase-guidance">${canPick ? '⏳ 기억한 위치의 카드를 2장 클릭하세요. 가장 마지막 선택이 적용됩니다.' : '이 라운드는 시작 후 입장해 관전 중입니다.'} <strong>남은 시간에 유의하세요.</strong></div>` : ''}<div class="board" id="board">${boardHtml}</div><div class="board-foot" id="pickHint">${hints[state.phase] || ''}</div></section>`;
}
function bestPossiblePanel() {
  const best = state.bestPossible;
  if (!best || !Array.isArray(best.cards) || best.cards.length !== 2) return '';
  return `<section class="optimal-panel" aria-label="기억 카드 중 최상 조합">
    <div class="section-top"><div class="section-title">✨ 기억 카드 최상의 2장</div><span class="count-label">16장 중 120가지 조합 비교</span></div>
    <div class="optimal-content">
      <div class="optimal-pair">${best.cards.map((card, i) => `<div class="optimal-card"><div class="optimal-position">${best.indices[i] + 1}번 위치</div>${face(card, null, 'optimal-face')}</div>`).join('')}</div>
      <div class="optimal-info"><span class="room-code-label">THE BEST POSSIBLE HAND</span><strong class="optimal-hand-name">${escapeHtml(best.name)}</strong><p class="optimal-explain">공용 카드 3장과 이 두 장으로 만들 수 있는 가장 강한 포커 패야.</p><div class="optimal-community">${state.community.map(c => `<span class="mini-card ${isRed(c) ? 'red' : ''}">${cardLabel(c)}</span>`).join('')}<span class="optimal-plus">+</span>${best.cards.map(c => `<span class="mini-card mine ${isRed(c) ? 'red' : ''}">${cardLabel(c)}</span>`).join('')}</div></div>
    </div>
    <p class="sidebar-note">아래 4×4 기억 카드판에서도 금색으로 표시했어. 같은 점수의 다른 조합도 정답이야. 직접 고르면 추가 +2점을 받아.</p>
  </section>`;
}
function resultPanel() {
  const active = state.players.filter(p => !p.spectator);
  const sorted = [...active].sort((a, b) => {
    const x = a.score || [], y = b.score || [];
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((y[i] || 0) !== (x[i] || 0)) return (y[i] || 0) - (x[i] || 0);
    return 0;
  });
  const winners = sorted.filter(p => p.winner);
  return `<section class="card-panel results results-above-board" id="roundResults"><div class="section-top"><div class="section-title">🏆 SHOWDOWN · ${state.round}라운드</div><span class="count-label">5 CARD POKER</span></div>${state.you === state.hostId ? `<div class="replay-actions"><button class="btn btn-primary full" data-action="replay">↻ 로비 없이 바로 다음 판 시작</button><button class="btn btn-muted full" data-action="next">대기실로 돌아가기</button></div><p class="sidebar-note">바로 시작하면 모두의 준비 확인 없이 5초 카드 배치부터 자동 진행됩니다. 누적 승리는 유지됩니다.</p>` : '<div class="replay-wait">↻ 방장이 「바로 다음 판 시작」을 누르면 이 방에서 곧바로 재경기가 시작됩니다.</div>'}<div class="winner"><span class="trophy">🏆</span><div><div class="room-code-label">WINNER${winners.length > 1 ? 'S · 공동 우승' : ''}</div><div class="winner-name">${escapeHtml(winners.map(p => p.name).join(', '))}</div><div class="subtext">${escapeHtml(winners[0]?.handName || '')}</div></div></div>${bestPossiblePanel()}<div class="result-list">${sorted.map(p => `<div class="result-player ${p.winner ? 'is-winner' : ''}"><div><div class="result-player-title">${p.winner ? '🏅 ' : ''}${escapeHtml(p.name)}${p.id === state.you ? ' · 나' : ''}</div><div class="result-player-hand">${escapeHtml(p.handName)} · 선택 ${p.picks.map(n => n + 1).join(', ')}번</div><div class="result-win-count">⭐ 누적 ${p.points}점</div>${p.winner ? '<div class="best-bonus-earned">🏅 승리 +1점!</div>' : ''}${p.bonusThisRound ? '<div class="best-bonus-earned">✨ BEST 적중 추가 +2점!</div>' : ''}</div><div class="mini-cards">${[...state.community, ...p.selectedCards].map((c, idx) => `<span class="mini-card ${isRed(c) ? 'red' : ''} ${idx >= 3 ? 'mine' : ''}" title="${idx >= 3 ? '선택 카드' : '공용 카드'}">${cardLabel(c)}</span>`).join('')}</div></div>`).join('')}</div><p class="sidebar-note">우승 기준: 표준 5장 포커 족보 → 같은 족보라면 높은 카드 순서로 비교. 무늬끼리 우열은 없습니다. 금색 테두리는 직접 선택한 카드입니다.</p></section>`;
}
function renderRoom() {
  if (!state) return;
  if (state.phase === 'lobby') {
    app.innerHTML = header(`<span id="connectionState">온라인 방</span><strong>ROUND ${state.round + 1}</strong>`) + lobby() + `<footer class="foot">다른 플레이어와 같은 카드 위치를 선택할 수 있습니다.</footer>`;
    return;
  }
  const p = PHASES[state.phase];
  app.innerHTML = header(`<span id="connectionState">실시간 플레이</span><strong>ROUND ${state.round}</strong>`) + roomHeader() + `<div class="phase-head"><div class="phase-title"><span class="phase-pill"><span class="dot"></span> ${p.eyebrow}</span><h2>${p.title}</h2><p>${p.detail}</p></div><div class="timer" id="timer">${state.phase === 'result' ? '✓' : '--'}<span class="timer-label">${state.phase === 'result' ? 'COMPLETE' : 'SECONDS LEFT'}</span></div></div>${state.phase === 'result' ? resultPanel() : ''}<div class="layout">${boardPanel()}<aside class="sidebar">${communityPanel()}${playersPanel()}</aside></div><footer class="foot">${state.phase === 'select' ? '시간 안에 2장을 고르지 않으면 나머지는 무작위로 결정됩니다.' : 'MEMORY POKER · 승리 +1점 · BEST 추가 +2점 · 금전 베팅 없음'}</footer>`;
  updateTimer();
}
function updateTimer() {
  const el = document.querySelector('#timer');
  if (!el || !state || !state.phaseEndsAt) return;
  const seconds = Math.max(0, Math.ceil((state.phaseEndsAt - (Date.now() - offsetMs)) / 1000));
  el.innerHTML = `${String(seconds).padStart(2, '0')}<span class="timer-label">SECONDS LEFT</span>`;
  el.classList.toggle('urgent', seconds <= 5);
}
function updatePickDisplay() {
  const board = document.querySelector('#board');
  if (!board) return;
  board.querySelectorAll('[data-index]').forEach(el => {
    const picked = draftPicks.includes(Number(el.dataset.index));
    el.classList.toggle('selected', picked);
    el.setAttribute('aria-pressed', String(picked));
    const check = el.querySelector('.pick-check');
    if (picked && !check) el.insertAdjacentHTML('beforeend', '<span class="pick-check">✓</span>');
    if (!picked && check) check.remove();
  });
  const hint = document.querySelector('#pickHint');
  if (hint) hint.innerHTML = `선택한 카드: <strong>${draftPicks.length} / 2장</strong> · 다시 누르면 선택 취소`;
}
async function sendPicks() {
  if (pickSending) { pickQueued = true; return; }
  pickSending = true;
  try {
    do {
      pickQueued = false;
      const indices = [...draftPicks];
      await post(`/api/rooms/${room}/pick`, { indices });
    } while (pickQueued);
  } catch (err) { toast(err.message); }
  finally { pickSending = false; }
}
function clickCard(index) {
  if (state?.phase !== 'select') return;
  const self = state.players.find(p => p.id === state.you);
  if (self.spectator) return;
  if (draftPicks.includes(index)) draftPicks = draftPicks.filter(i => i !== index);
  else if (draftPicks.length < 2) draftPicks = [...draftPicks, index];
  else draftPicks = [draftPicks[1], index];
  updatePickDisplay();
  sendPicks();
}
async function leaveRoom() {
  if (!room) return;
  const prevRoom = room;
  try { await post(`/api/rooms/${prevRoom}/leave`, {}); } catch { /* Server may have already expired the room. */ }
  if (stream) stream.close();
  stream = null;
  localStorage.removeItem(`mp:token:${prevRoom}`);
  state = null; room = null; accessToken = null; lastPhaseKey = '';
  history.pushState(null, '', '/'); entryPage();
}
async function performAction(action) {
  if (action === 'copy') {
    const link = `${location.origin}/r/${state.room}`;
    try { await navigator.clipboard.writeText(link); toast('친구 초대 링크를 복사했어요!'); }
    catch { window.prompt('아래 링크를 복사해 친구에게 보내세요.', link); }
    return;
  }
  if (action === 'leave') return leaveRoom();
  const routes = { ready: 'ready', start: 'start', replay: 'replay', next: 'next' };
  if (!routes[action]) return;
  try {
    if (action === 'ready') {
      const player = state.players.find(p => p.id === state.you);
      await post(`/api/rooms/${room}/ready`, { ready: !player.ready });
    } else await post(`/api/rooms/${room}/${routes[action]}`, {});
  } catch (err) { toast(err.message); }
}
app.addEventListener('click', event => {
  const home = event.target.closest('[data-home]');
  if (home) { event.preventDefault(); if (state) { toast('방을 나가려면 나가기 버튼을 눌러 주세요.'); } else { history.pushState(null, '', '/'); entryPage(); } return; }
  const action = event.target.closest('[data-action]');
  if (action) { performAction(action.dataset.action); return; }
  const card = event.target.closest('#board .pickable');
  if (card) clickCard(Number(card.dataset.index));
});
app.addEventListener('keydown', event => {
  const card = event.target.closest('#board .pickable');
  if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); clickCard(Number(card.dataset.index)); }
});
window.addEventListener('popstate', () => {
  const code = location.pathname.match(/^\/r\/([A-Z2-9]{6})\/?$/i)?.[1]?.toUpperCase();
  if (stream) stream.close();
  stream = null; state = null; room = null; accessToken = null; lastPhaseKey = '';
  if (code) {
    const token = localStorage.getItem(`mp:token:${code}`);
    if (token) enterRoom(code, token);
    else entryPage(code);
  } else entryPage();
});
setInterval(updateTimer, 150);
// 클라우드 무료 서버의 장시간 유휴 종료를 줄이기 위한 가벼운 접속 확인.
setInterval(() => {
  if (room && accessToken && document.visibilityState === 'visible') {
    fetch('/health', { cache: 'no-store' }).catch(() => {});
  }
}, 3 * 60 * 1000);
(function init() {
  initMusicControls();
  const code = location.pathname.match(/^\/r\/([A-Z2-9]{6})\/?$/i)?.[1]?.toUpperCase();
  if (!code) return entryPage();
  const token = localStorage.getItem(`mp:token:${code}`);
  if (token) enterRoom(code, token);
  else entryPage(code);
})();
