'use strict';
const {randomBytes,randomInt}=require('node:crypto');
const engine=require('./twelve-engine');
const SYMBOLS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_SPECTATORS=3;
const TURN_MS=30000;
const snapshot=game=>JSON.parse(JSON.stringify(game));
function code(){return Array.from({length:6},()=>SYMBOLS[randomInt(SYMBOLS.length)]).join('');}
function token(){return randomBytes(24).toString('hex');}
function username(s){return typeof s==='string'?s.trim().replace(/\s+/g,' ').slice(0,16):'';}
class TwelveService {
 constructor({onChange=()=>{},now=()=>Date.now(),schedule=setTimeout,cancel=clearTimeout}={}){this.rooms=new Map();this.onChange=onChange;this.now=now;this.schedule=schedule;this.cancel=cancel;}
 changed(room){room.lastTouched=this.now();this.onChange(room);}
 stopClock(room){if(room.turnTimer!==null)this.cancel(room.turnTimer);room.turnTimer=null;room.deadline=null;}
 startClock(room){
  this.stopClock(room);
  if(room.stage!=='playing'||room.undo||!room.game||room.game.winner!==null)return;
  room.deadline=this.now()+TURN_MS;
  const deadline=room.deadline;
  room.turnTimer=this.schedule(()=>{
   if(room.stage==='playing'&&!room.undo&&room.deadline===deadline&&this.now()>=deadline)this.timeOut(room);
  },TURN_MS);
  if(room.turnTimer?.unref)room.turnTimer.unref();
 }
 timeOut(room){
  if(room.stage!=='playing'||room.undo||!room.game||room.deadline===null||this.now()<room.deadline)return false;
  const loser=room.game.turn;this.stopClock(room);
  room.game.winner=1-loser;room.game.last={kind:'timeout',side:loser};
  room.stage='finished';room.revision++;this.changed(room);return true;
 }
 create(name){
  const clean=username(name);if(!clean)throw Error('닉네임을 입력해 주세요.');
  let id;do{id=code()}while(this.rooms.has(id));
  const room={code:id,players:[],spectators:[],hostId:null,stage:'lobby',game:null,first:null,revision:0,history:[],undo:null,deadline:null,turnTimer:null,lastTouched:this.now()};
  this.rooms.set(id,room);
  return {room,player:this.join(id,clean)};
 }
 find(id){const r=this.rooms.get(String(id||'').toUpperCase());if(!r)throw Error('십이장기 방을 찾을 수 없습니다.');return r;}
 join(id,name,role='player'){
  const room=this.find(id),clean=username(name);
  if(!clean)throw Error('닉네임을 입력해 주세요.');
  if(!['player','spectator'].includes(role))throw Error('참가 방식이 올바르지 않습니다.');
  const all=[...room.players,...room.spectators];
  if(all.some(p=>p.name.toLowerCase()===clean.toLowerCase()))throw Error('이미 사용 중인 닉네임입니다.');
  if(role==='spectator'){
   if(room.spectators.length>=MAX_SPECTATORS)throw Error('관전석 3자리가 모두 찼습니다.');
   const viewer={id:token().slice(0,12),token:token(),name:clean,role:'spectator'};
   room.spectators.push(viewer);this.changed(room);return viewer;
  }
  if(room.stage!=='lobby')throw Error('진행 중인 방에는 선수로 입장할 수 없습니다. 관전으로 입장해 주세요.');
  if(room.players.length>=2)throw Error('선수 두 자리가 모두 찼습니다. 관전으로 입장해 주세요.');
  const side=room.players.some(p=>p.side===0)?1:0;
  const player={id:token().slice(0,12),token:token(),name:clean,role:'player',side,ready:false};
  room.players.push(player);
  if(room.hostId===null)room.hostId=player.id;
  this.changed(room);return player;
 }
 player(room,key){
  const p=[...room.players,...room.spectators].find(p=>p.token===key);
  if(!p)throw Error('올바르지 않은 참가 정보입니다.');
  return p;
 }
 side(room,key){
  const member=this.player(room,key);
  if(member.role==='spectator')throw Error('관전자는 대국을 조작할 수 없습니다.');
  return member.side;
 }
 host(room,key){
  const member=this.player(room,key);
  if(member.role!=='player'||member.id!==room.hostId)throw Error('방장만 이 기능을 사용할 수 있습니다.');
  return member;
 }
 ready(room,key,value){
  if(room.stage!=='lobby')throw Error('준비실에서만 준비할 수 있습니다.');
  const player=this.player(room,key);
  if(player.role!=='player')throw Error('관전자는 준비할 수 없습니다.');
  player.ready=!!value;this.changed(room);
 }
 changeTeam(room,key,side){
  if(room.stage!=='lobby')throw Error('준비실에서만 진영을 변경할 수 있습니다.');
  if(side!==0&&side!==1)throw Error('청팀 또는 홍팀을 선택해 주세요.');
  const member=this.player(room,key);
  if(member.role!=='player')throw Error('관전자는 진영을 변경할 수 없습니다.');
  if(member.side===side)return;
  const occupied=room.players.find(p=>p.side===side);
  if(occupied)occupied.side=member.side;
  member.side=side;
  room.players.forEach(p=>p.ready=false);
  room.revision++;this.changed(room);
 }
 start(room,key){
  this.host(room,key);
  if(room.stage!=='lobby'||room.players.length!==2||!room.players.every(p=>p.ready)||
    !room.players.some(p=>p.side===0)||!room.players.some(p=>p.side===1))
   throw Error('청팀·홍팀 두 플레이어가 모두 준비해야 합니다.');
  // 청팀이 선공, 홍팀이 후공. 준비실에서 서로 진영을 바꿔 순서를 조정합니다.
  room.first=0;room.game=engine.fresh(0);room.stage='playing';room.history=[];room.undo=null;room.revision++;
  this.startClock(room);this.changed(room);
 }
 move(room,key,move){
  if(room.stage!=='playing'||!room.game)throw Error('현재 진행 중인 대국이 없습니다.');
  if(this.timeOut(room))throw Error('30초 착수 시간이 초과되었습니다.');
  if(room.undo)throw Error('무르기 요청에 대한 응답을 기다리는 중입니다.');
  const side=this.side(room,key);
  if(room.game.turn!==side)throw Error('상대 차례입니다.');
  if(!move||typeof move!=='object')throw Error('이동 정보를 확인해 주세요.');
  // 서버 공통 규칙 엔진에서 유효성을 검증하고 결과를 확정합니다.
  const next=engine.apply(room.game,move);
  room.history.push(snapshot(room.game));
  room.game=next;
  room.revision++;
  if(room.game.winner!==null){room.stage='finished';this.stopClock(room);}
  else this.startClock(room);
  this.changed(room);
 }
 requestUndo(room,key){
  const requester=this.side(room,key);
  if(!['playing','finished'].includes(room.stage)||!room.game||!room.history.length)
   throw Error('무를 수 있는 직전 수가 없습니다.');
  if(room.undo)throw Error('이미 무르기 요청을 기다리고 있습니다.');
  if(this.timeOut(room))throw Error('30초 착수 시간이 초과되었습니다.');
  room.undo={requester,ply:room.game.ply};
  this.stopClock(room);
  room.revision++;
  this.changed(room);
 }
 respondUndo(room,key,accept){
  const responder=this.side(room,key);
  if(!room.undo)throw Error('진행 중인 무르기 요청이 없습니다.');
  if(responder===room.undo.requester)throw Error('상대방만 무르기 요청에 응답할 수 있습니다.');
  if(typeof accept!=='boolean')throw Error('무르기 수락 여부를 선택해 주세요.');
  if(room.undo.ply!==room.game.ply)throw Error('무르기 대상 수가 달라졌습니다.');
  if(accept){
   const previous=room.history.pop();
   if(!previous)throw Error('복원할 수가 없습니다.');
   room.game=snapshot(previous);
   room.stage='playing';
  }
  room.undo=null;room.revision++;
  if(room.stage==='playing')this.startClock(room);
  this.changed(room);
 }
 cancelUndo(room,key){
  if(!room.undo)throw Error('취소할 무르기 요청이 없습니다.');
  if(this.side(room,key)!==room.undo.requester)throw Error('요청한 플레이어만 취소할 수 있습니다.');
  room.undo=null;room.revision++;
  if(room.stage==='playing')this.startClock(room);
  this.changed(room);
 }
 restart(room,key){
  this.host(room,key);
  if(room.stage!=='finished')throw Error('승부가 끝난 뒤 재경기할 수 있습니다.');
  this.stopClock(room);
  room.stage='lobby';room.game=null;room.first=null;room.history=[];room.undo=null;room.revision=0;
  room.players.forEach(p=>p.ready=false);
  this.changed(room);
 }
 leave(room,key){
  const leaving=this.player(room,key);
  if(leaving.role==='spectator'){
   room.spectators=room.spectators.filter(p=>p!==leaving);
   this.changed(room);return;
  }
  this.stopClock(room);
  room.players=room.players.filter(p=>p!==leaving);
  if(room.hostId===leaving.id)room.hostId=room.players[0]?.id||null;
  room.players.forEach(p=>p.ready=false);
  this.stopClock(room);
  room.stage='lobby';room.game=null;room.first=null;room.history=[];room.undo=null;room.revision=0;
  this.changed(room);
 }
 serialize(room,key){
  const member=this.player(room,key),side=member.role==='player'?member.side:null;
  return {
   room:room.code,side,role:member.role,memberId:member.id,hostId:room.hostId,
   stage:room.stage,first:room.first,revision:room.revision,canUndo:room.history.length>0,deadline:room.deadline,turnMs:TURN_MS,
   undo:room.undo?{...room.undo}:null,spectatorLimit:MAX_SPECTATORS,
   players:room.players.map(p=>({id:p.id,name:p.name,ready:p.ready,side:p.side})),
   spectators:room.spectators.map(p=>({id:p.id,name:p.name})),
   game:room.game?{board:room.game.board.map(p=>p?{...p}:null),
    hands:room.game.hands.map(h=>[...h]),turn:room.game.turn,winner:room.game.winner,
    last:room.game.last?{...room.game.last}:null,ply:room.game.ply}:null,
   serverNow:this.now()
  };
 }

}
module.exports={TwelveService,MAX_SPECTATORS,TURN_MS};
