'use strict';
const { randomInt } = require('node:crypto');

const SUITS = ['S', 'H', 'D', 'C'];
const SUIT_NAMES = { S: '♠', H: '♥', D: '♦', C: '♣' };
const HAND_NAMES = ['하이 카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시'];

function makeDeck() {
  return SUITS.flatMap(suit => Array.from({ length: 13 }, (_, i) => ({ suit, rank: i + 2 })));
}

function shuffle(deck = makeDeck()) {
  const result = deck.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function rankSymbol(rank) {
  return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[rank] || String(rank);
}

function cardLabel(card) {
  return `${rankSymbol(card.rank)}${SUIT_NAMES[card.suit]}`;
}

function compareScores(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const delta = (a[i] || 0) - (b[i] || 0);
    if (delta) return delta;
  }
  return 0;
}

function scoreHand(cards) {
  if (!Array.isArray(cards) || cards.length !== 5) throw new Error('정확히 5장이 필요합니다.');
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const unique = [...new Set(ranks)];
  const flush = cards.every(c => c.suit === cards[0].suit);
  const straightHigh = unique.length === 5
    ? (unique[0] - unique[4] === 4 ? unique[0] :
        (unique.join(',') === '14,5,4,3,2' ? 5 : 0)) : 0;
  const groups = [...new Set(ranks)]
    .map(rank => ({ rank, count: ranks.filter(r => r === rank).length }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
  const counts = groups.map(g => g.count).join(',');
  let score;
  if (flush && straightHigh) score = [8, straightHigh];
  else if (counts === '4,1') score = [7, groups[0].rank, groups[1].rank];
  else if (counts === '3,2') score = [6, groups[0].rank, groups[1].rank];
  else if (flush) score = [5, ...ranks];
  else if (straightHigh) score = [4, straightHigh];
  else if (counts === '3,1,1') score = [3, groups[0].rank, ...groups.slice(1).map(g => g.rank)];
  else if (counts === '2,2,1') score = [2, groups[0].rank, groups[1].rank, groups[2].rank];
  else if (counts === '2,1,1,1') score = [1, groups[0].rank, ...groups.slice(1).map(g => g.rank)];
  else score = [0, ...ranks];
  return { score, category: score[0], name: HAND_NAMES[score[0]] };
}

module.exports = { makeDeck, shuffle, scoreHand, compareScores, cardLabel, rankSymbol };
