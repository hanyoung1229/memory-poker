'use strict';
const { randomBytes, randomInt } = require('node:crypto');
const SUIT_PAIRS = Object.freeze([Object.freeze(['D','S']),Object.freeze(['H','C'])]);
function suitsForCycle(n){return SUIT_PAIRS[(Math.max(1,n)-1)%2];}
const DEFAULT_COINS = 40, MIN_COINS = 30, MAX_COINS = 100, ANTE = 1, OPENING_MS = 4500;
function token() { return randomBytes(24).toString('hex'); }
function roomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({length:6}, () => letters[randomInt(letters.length)]).join('');
}
function cleanName(v) { return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0,16) : ''; }
function makeDeck(suits=SUIT_PAIRS[0]) { return suits.flatMap(suit => Array.from({length:10}, (_,i)=>({rank:i+1,suit}))); }
function shuffle(deck=makeDeck()) {
  const cards=deck.slice();
  for(let i=cards.length-1;i>0;i--) { const j=randomInt(i+1);[cards[i],cards[j]]=[cards[j],cards[i]]; }
  return cards;
}
class IndianService {
  constructor({onChange=()=>{},now=()=>Date.now(),schedule=setTimeout,cancel=clearTimeout}={}) {
    this.rooms=new Map();this.onChange=onChange;this.now=now;this.schedule=schedule;this.cancel=cancel;
  }
  changed(room) {room.lastTouched=this.now();this.onChange(room);}
  create(name) {
    const safe=cleanName(name);if(!safe)throw Error('닉네임을 입력해 주세요.');
    let code;do{code=roomCode();}while(this.rooms.has(code));
    const room={code,stage:'lobby',players:[],startCoins:DEFAULT_COINS,round:0,deck:[],
      opening:[],first:0,turn:null,cards:[],bets:[0,0],pot:0,deckCycle:0,timer:null,endsAt:null,result:null,lastTouched:this.now()};
    this.rooms.set(code,room);
    const player=this.join(code,safe);return {room,player};
  }
  find(code) {
    const room=this.rooms.get(String(code||'').toUpperCase());
    if(!room)throw Error('존재하지 않는 인디언포커 방입니다.');
    return room;
  }
  player(room,accessToken) {
    const p=room.players.find(p=>p.token===accessToken);
    if(!p)throw Error('입장 정보가 올바르지 않습니다.');
    return p;
  }
  index(room,accessToken) {return room.players.indexOf(this.player(room,accessToken));}
  join(code,name) {
    const room=this.find(code);
    if(room.stage!=='lobby')throw Error('게임 진행 중에는 참가할 수 없습니다.');
    if(room.players.length>=2)throw Error('인디언포커는 2명만 참가할 수 있습니다.');
    const safe=cleanName(name);
    if(!safe)throw Error('닉네임을 입력해 주세요.');
    if(room.players.some(p=>p.name.toLocaleLowerCase()===safe.toLocaleLowerCase()))throw Error('이미 사용 중인 닉네임입니다.');
    const player={name:safe,id:token().slice(0,12),token:token(),coins:room.startCoins,ready:false};
    room.players.push(player);this.changed(room);return player;
  }
  configure(room,accessToken,count) {
    if(this.index(room,accessToken)!==0)throw Error('방장만 코인을 설정할 수 있습니다.');
    if(room.stage!=='lobby')throw Error('게임 시작 전에만 변경할 수 있습니다.');
    if(!Number.isInteger(count)||count<MIN_COINS||count>MAX_COINS)throw Error('시작 코인은 30~100개 사이의 정수여야 합니다.');
    room.startCoins=count;
    room.players.forEach(p=>{p.coins=count;p.ready=false;});
    this.changed(room);
  }
  ready(room,accessToken,isReady) {
    if(room.stage!=='lobby')throw Error('대기실에서만 준비할 수 있습니다.');
    this.player(room,accessToken).ready=!!isReady;this.changed(room);
  }
  refillDeck(room) {
    room.deckCycle++;
    room.deck=shuffle(makeDeck(suitsForCycle(room.deckCycle)));
  }
  start(room,accessToken) {
    if(this.index(room,accessToken)!==0)throw Error('방장만 시작할 수 있습니다.');
    if(room.stage!=='lobby'||room.players.length!==2||!room.players.every(p=>p.ready))
      throw Error('2명 모두 준비해야 시작할 수 있습니다.');
    room.deckCycle=0;this.refillDeck(room);room.round=0;room.opening=[];room.result=null;
    let a,b;
    do {
      if(room.deck.length<2)this.refillDeck(room);
      a=room.deck.shift();b=room.deck.shift();
      room.opening.push([a,b]);
    } while(a.rank===b.rank);
    room.first=a.rank>b.rank?0:1;
    room.stage='opening';room.turn=null;room.endsAt=this.now()+OPENING_MS;
    if(room.timer)this.cancel(room.timer);
    room.timer=this.schedule(()=>{if(room.stage==='opening')this.beginRound(room);},OPENING_MS);
    if(room.timer?.unref)room.timer.unref();
    this.changed(room);
  }
  beginRound(room) {
    if(room.timer)this.cancel(room.timer);room.timer=null;room.endsAt=null;
    if(room.players.length!==2){room.stage='lobby';this.changed(room);return;}
    if(room.players.some(p=>p.coins<ANTE)){this.finishMatch(room);return;}
    if(room.round>0)room.first=1-room.first;
    room.round++;
    if(room.deck.length<2)this.refillDeck(room);
    room.cards=[room.deck.shift(),room.deck.shift()];
    room.players.forEach(p=>{p.coins-=ANTE;});
    room.pot=2*ANTE;room.bets=[0,0];room.turn=room.first;room.stage='betting';room.result=null;
    if(room.players.some(p=>p.coins===0)){this.settle(room,'showdown');return;}
    this.changed(room);
  }
  legal(room,index) {
    if(room.stage!=='betting')throw Error('현재 베팅 중인 라운드가 아닙니다.');
    if(room.turn!==index)throw Error('상대 플레이어 차례입니다.');
    const other=1-index;
    const toCall=Math.max(...room.bets)-room.bets[index];
    // 자기 잔액 전부를 올인할 수 있습니다. 상대가 이미 올인했다면 추가 레이즈는 불가합니다.
    return {toCall,minBet:toCall+1,maxBet:room.players[other].coins>0?room.players[index].coins:Math.min(room.players[index].coins,toCall)};
  }
  bet(room,accessToken,amount) {
    const i=this.index(room,accessToken),rule=this.legal(room,i);
    if(!Number.isSafeInteger(amount)||amount<rule.minBet||amount>rule.maxBet)
      throw Error('배팅 가능한 코인 수를 확인해 주세요.');
    room.players[i].coins-=amount;room.bets[i]+=amount;room.pot+=amount;room.turn=1-i;
    this.changed(room);
  }
  call(room,accessToken) {
    const i=this.index(room,accessToken),rule=this.legal(room,i);
    if(rule.toCall<=0)throw Error('상대방이 먼저 배팅해야 합니다.');
    // 상대의 올인에 코인이 부족해도 남은 코인 전부를 내고 콜할 수 있습니다.
    // 상대가 콜할 수 없는 초과 베팅은 원래 베팅한 플레이어에게 돌려줍니다.
    const paid=Math.min(rule.toCall,room.players[i].coins);
    room.players[i].coins-=paid;room.bets[i]+=paid;room.pot+=paid;
    const unmatched=Math.max(0,room.bets[1-i]-room.bets[i]);
    if(unmatched>0){
      room.players[1-i].coins+=unmatched;
      room.bets[1-i]-=unmatched;
      room.pot-=unmatched;
    }
    this.settle(room,'showdown');
  }
  fold(room,accessToken) {
    const i=this.index(room,accessToken);this.legal(room,i);
    this.settle(room,'fold',1-i);
  }
  settle(room,reason,forcedWinner=null) {
    if(room.stage!=='betting')return;
    const ranks=room.cards.map(card=>card.rank);
    const winner=reason==='fold'?forcedWinner:(ranks[0]===ranks[1]?null:ranks[0]>ranks[1]?0:1);
    const pot=room.pot;
    if(winner===null){
      const share=Math.floor(pot/2);
      room.players[0].coins+=share;room.players[1].coins+=pot-share;
    }else room.players[winner].coins+=pot;
    let penalty=0;
    const loser=reason==='fold'?1-winner:null;
    if(loser!==null&&ranks[loser]===10){
      const remaining=room.players[loser].coins;
      penalty=Math.min(remaining,Math.max(10,Math.ceil(remaining/3)));
      room.players[loser].coins-=penalty;
      room.players[winner].coins+=penalty;
    }
    room.stage='result';room.turn=null;room.endsAt=null;
    room.result={reason,winner,penalty,loser,pot,ranks:[...ranks]};
    this.changed(room);
  }
  next(room,accessToken) {
    if(this.index(room,accessToken)!==0)throw Error('방장만 다음 판을 시작할 수 있습니다.');
    if(room.stage!=='result')throw Error('결과 발표 후 다음 판을 시작할 수 있습니다.');
    this.beginRound(room);
  }
  finishMatch(room) {room.stage='finished';room.turn=null;room.endsAt=null;room.timer=null;this.changed(room);}
  restart(room,accessToken) {
    if(this.index(room,accessToken)!==0)throw Error('방장만 경기를 다시 준비할 수 있습니다.');
    if(room.stage!=='finished'&&room.stage!=='result')throw Error('게임 결과 공개 후 다시 시작할 수 있습니다.');
    if(room.players.length!==2)throw Error('참가자 2명이 필요합니다.');
    room.players.forEach(p=>{p.coins=room.startCoins;p.ready=false;});
    room.stage='lobby';room.round=0;room.opening=[];room.deck=[];room.deckCycle=0;room.cards=[];room.bets=[0,0];
    room.pot=0;room.result=null;room.turn=null;room.endsAt=null;this.changed(room);
  }
  leave(room,accessToken) {
    const p=this.player(room,accessToken);
    room.players=room.players.filter(x=>x!==p);
    if(room.timer)this.cancel(room.timer);room.timer=null;
    room.stage='lobby';room.round=0;room.opening=[];room.deck=[];room.deckCycle=0;room.cards=[];room.bets=[0,0];
    room.pot=0;room.result=null;room.turn=null;room.endsAt=null;
    room.players.forEach(p=>{p.ready=false;p.coins=room.startCoins;});
    this.changed(room);
  }
  serialize(room,accessToken) {
    const viewer=this.index(room,accessToken),other=1-viewer,betting=room.stage==='betting';
    const legal=betting&&room.turn===viewer?this.legal(room,viewer):null;
    return {
      room:room.code,stage:room.stage,round:room.round,you:viewer,host:0,
      startCoins:room.startCoins,players:room.players.map(p=>({id:p.id,name:p.name,coins:p.coins,ready:p.ready})),
      opening:room.stage==='opening'?room.opening:[],
      first:room.first,turn:room.turn,endsAt:room.endsAt,serverNow:this.now(),
      pot:room.pot,bets:[...room.bets],deckRemaining:room.deck.length,
      // 배팅 중 자기 카드 정보는 브라우저로 전달하지 않습니다.
      opponentCard:betting?room.cards[other]:null,
      revealed:room.stage==='result'?room.cards:null,
      result:room.stage==='result'?room.result:null,
      toCall:legal?.toCall??0,minBet:legal?.minBet??0,maxBet:legal?.maxBet??0,
      turnIsMine:!!legal
    };
  }
}
module.exports={IndianService,makeDeck,shuffle,DEFAULT_COINS,MIN_COINS,MAX_COINS};
