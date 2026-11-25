'use strict';
const {randomBytes,randomInt}=require('node:crypto');
const engine=require('./twelve-engine');
const SYMBOLS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const snapshot=game=>JSON.parse(JSON.stringify(game));
function code(){return Array.from({length:6},()=>SYMBOLS[randomInt(SYMBOLS.length)]).join('');}
function token(){return randomBytes(24).toString('hex');}
function username(s){return typeof s==='string'?s.trim().replace(/\s+/g,' ').slice(0,16):'';}
class TwelveService {
 constructor({onChange=()=>{},now=()=>Date.now()}={}){this.rooms=new Map();this.onChange=onChange;this.now=now;}
 changed(room){room.lastTouched=this.now();this.onChange(room);}
 create(name){
  const clean=username(name);if(!clean)throw Error('닉네임을 입력해 주세요.');
  let id;do{id=code()}while(this.rooms.has(id));
  const room={code:id,players:[],stage:'lobby',game:null,first:null,revision:0,history:[],undo:null,lastTouched:this.now()};
  this.rooms.set(id,room);
  return {room,player:this.join(id,clean)};
 }
 find(id){const r=this.rooms.get(String(id||'').toUpperCase());if(!r)throw Error('십이장기 방을 찾을 수 없습니다.');return r;}
 join(id,name){
  const room=this.find(id),clean=username(name);
  if(room.stage!=='lobby')throw Error('진행 중인 방에는 입장할 수 없습니다.');
  if(room.players.length>=2)throw Error('이미 두 명이 참가했습니다.');
  if(!clean)throw Error('닉네임을 입력해 주세요.');
  if(room.players.some(p=>p.name.toLowerCase()===clean.toLowerCase()))throw Error('같은 닉네임을 사용할 수 없습니다.');
  const player={id:token().slice(0,12),token:token(),name:clean,ready:false};
  room.players.push(player);this.changed(room);
  return player;
 }
 player(room,key){const p=room.players.find(p=>p.token===key);if(!p)throw Error('올바르지 않은 참가 정보입니다.');return p;}
 side(room,key){return room.players.indexOf(this.player(room,key));}
 ready(room,key,value){
  if(room.stage!=='lobby')throw Error('준비실에서만 준비할 수 있습니다.');
  this.player(room,key).ready=!!value;this.changed(room);
 }
 start(room,key){
  if(this.side(room,key)!==0)throw Error('방장만 게임을 시작할 수 있습니다.');
  if(room.stage!=='lobby'||room.players.length!==2||!room.players.every(p=>p.ready))throw Error('두 플레이어가 모두 준비해야 합니다.');
  room.first=randomInt(2);room.game=engine.fresh(room.first);room.stage='playing';room.history=[];room.undo=null;room.revision++;
  this.changed(room);
 }
 move(room,key,move){
  if(room.stage!=='playing'||!room.game)throw Error('현재 진행 중인 대국이 없습니다.');
  if(room.undo)throw Error('무르기 요청에 대한 응답을 기다리는 중입니다.');
  const side=this.side(room,key);
  if(room.game.turn!==side)throw Error('상대 차례입니다.');
  if(!move||typeof move!=='object')throw Error('이동 정보를 확인해 주세요.');
  // 서버 공통 규칙 엔진에서 유효성을 검증하고 결과를 확정합니다.
  const next=engine.apply(room.game,move);
  room.history.push(snapshot(room.game));
  room.game=next;
  room.revision++;
  if(room.game.winner!==null)room.stage='finished';
  this.changed(room);
 }
 requestUndo(room,key){
  const requester=this.side(room,key);
  if(!['playing','finished'].includes(room.stage)||!room.game||!room.history.length)
   throw Error('무를 수 있는 직전 수가 없습니다.');
  if(room.undo)throw Error('이미 무르기 요청을 기다리고 있습니다.');
  room.undo={requester,ply:room.game.ply};
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
  this.changed(room);
 }
 cancelUndo(room,key){
  if(!room.undo)throw Error('취소할 무르기 요청이 없습니다.');
  if(this.side(room,key)!==room.undo.requester)throw Error('요청한 플레이어만 취소할 수 있습니다.');
  room.undo=null;room.revision++;
  this.changed(room);
 }
 restart(room,key){
  if(this.side(room,key)!==0)throw Error('방장만 재경기를 시작할 수 있습니다.');
  if(room.stage!=='finished')throw Error('승부가 끝난 뒤 재경기할 수 있습니다.');
  room.stage='lobby';room.game=null;room.first=null;room.history=[];room.undo=null;room.revision=0;
  room.players.forEach(p=>p.ready=false);
  this.changed(room);
 }
 leave(room,key){
  const leaving=this.player(room,key);
  room.players=room.players.filter(p=>p!==leaving);
  room.players.forEach(p=>p.ready=false);
  room.stage='lobby';room.game=null;room.first=null;room.history=[];room.undo=null;room.revision=0;
  this.changed(room);
 }
 serialize(room,key){
  const side=this.side(room,key);
  return {room:room.code,side,stage:room.stage,first:room.first,revision:room.revision,canUndo:room.history.length>0,undo:room.undo?{...room.undo}:null,
   players:room.players.map((p,i)=>({id:p.id,name:p.name,ready:p.ready,side:i})),
   game:room.game?{board:room.game.board.map(p=>p?{...p}:null),
    hands:room.game.hands.map(h=>[...h]),turn:room.game.turn,winner:room.game.winner,
    last:room.game.last?{...room.game.last}:null,ply:room.game.ply}:null,
   serverNow:this.now()};
 }
}
module.exports={TwelveService};
