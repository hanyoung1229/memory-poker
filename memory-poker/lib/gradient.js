'use strict';
const {randomBytes,randomInt}=require('node:crypto');

const CYLINDER_COLORS=Object.freeze(['#111419','#3d424b','#9197a0','#f3f3ee','#9197a0','#3d424b','#111419']);
const DIGITS=Object.freeze(Array.from({length:20},(_,i)=>i%10));
const REVEAL_MS=3600;
function token(){return randomBytes(24).toString('hex');}
function makeCode(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');}
function cleanName(s){return typeof s==='string'?s.trim().replace(/\s+/g,' ').slice(0,16):'';}
function sum(items){return items.reduce((v,n)=>v+n,0);}
function validateSetup(value){
 if(!Array.isArray(value)||value.length!==7)throw Error('고정 원통 7개에 숫자 블록 하나씩 배치해 주세요.');
 const usage=Array(10).fill(0),tubes=[];
 for(let i=0;i<value.length;i++){
  const v=value[i];
  if(!Number.isInteger(v)||v<0||v>9)throw Error((i+1)+'번 원통에 숫자 0~9 중 하나를 넣어 주세요.');
  if(++usage[v]>2)throw Error('각 숫자 블록은 최대 2개까지만 사용할 수 있습니다.');
  if(i>0&&v<value[i-1])throw Error('오른쪽 원통 숫자는 왼쪽 원통 숫자보다 같거나 커야 합니다.');
  tubes.push(v);
 }
 if(sum(tubes)>30)throw Error('일곱 원통의 숫자 총합은 30을 초과할 수 없습니다.');
 return tubes;
}
class GradientService {
 constructor({onChange=()=>{},now=()=>Date.now(),schedule=setTimeout,cancel=clearTimeout}={}){
  this.rooms=new Map();this.onChange=onChange;this.now=now;this.schedule=schedule;this.cancel=cancel;
 }
 changed(room){room.lastTouched=this.now();this.onChange(room);}
 find(id){const room=this.rooms.get(String(id||'').toUpperCase());if(!room)throw Error('해당 게임방을 찾지 못했습니다.');return room;}
 player(room,access){const p=room.players.find(p=>p.token===access);if(!p)throw Error('입장 정보가 올바르지 않습니다.');return p;}
 index(room,access){return room.players.indexOf(this.player(room,access));}
 create(name){
  const safe=cleanName(name);if(!safe)throw Error('닉네임을 입력해 주세요.');
  let code;do{code=makeCode();}while(this.rooms.has(code));
  const room={code,players:[],stage:'lobby',round:0,starter:null,turn:null,firstPick:null,history:[],result:null,timer:null,endsAt:null,winner:null,lastTouched:this.now()};
  this.rooms.set(code,room);
  return {room,player:this.join(code,safe)};
 }
 join(code,name){
  const room=this.find(code),safe=cleanName(name);
  if(room.stage!=='lobby')throw Error('게임 진행 중에는 참가할 수 없습니다.');
  if(room.players.length>=2)throw Error('두 명이 모두 입장했습니다.');
  if(!safe)throw Error('닉네임을 입력해 주세요.');
  if(room.players.some(p=>p.name.toLowerCase()===safe.toLowerCase()))throw Error('이미 사용 중인 닉네임입니다.');
  const player={id:token().slice(0,12),token:token(),name:safe,ready:false,prepared:false,tubes:null,used:Array(7).fill(false),points:0};
  room.players.push(player);this.changed(room);return player;
 }
 ready(room,access,value){
  if(room.stage!=='lobby')throw Error('준비실에서만 준비할 수 있습니다.');
  this.player(room,access).ready=!!value;this.changed(room);
 }
 start(room,access){
  if(this.index(room,access)!==0)throw Error('방장만 게임을 시작할 수 있습니다.');
  if(room.stage!=='lobby'||room.players.length!==2||!room.players.every(p=>p.ready))throw Error('두 명 모두 준비를 완료해야 시작할 수 있습니다.');
  if(room.timer)this.cancel(room.timer);
  room.round=0;room.starter=randomInt(2);room.history=[];room.result=null;room.winner=null;
  room.players.forEach(p=>{p.prepared=false;p.tubes=null;p.used=Array(7).fill(false);p.points=0;});
  room.stage='prepare';room.turn=null;room.firstPick=null;room.endsAt=null;
  this.changed(room);
 }
 prepare(room,access,tubes){
  if(room.stage!=='prepare')throw Error('지금은 숫자 원통을 준비하는 단계가 아닙니다.');
  const player=this.player(room,access);
  if(player.prepared)throw Error('이미 준비를 확정했습니다.');
  player.tubes=validateSetup(tubes);player.prepared=true;
  if(room.players.every(p=>p.prepared))this.beginRound(room);
  else this.changed(room);
 }
 beginRound(room){
  if(room.timer)this.cancel(room.timer);
  room.timer=null;room.round++;room.stage='pick';room.firstPick=null;room.result=null;room.endsAt=null;
  room.turn=(room.starter+room.round-1)%2;
  this.changed(room);
 }
 pick(room,access,tubeIndex){
  if(room.stage!=='pick')throw Error('지금은 원통을 제시하는 단계가 아닙니다.');
  const who=this.index(room,access);
  if(who!==room.turn)throw Error('현재는 상대방의 선택 차례입니다.');
  if(!Number.isInteger(tubeIndex)||tubeIndex<0||tubeIndex>6)throw Error('원통 번호가 올바르지 않습니다.');
  if(room.players[who].used[tubeIndex])throw Error('이미 사용한 원통은 다시 제시할 수 없습니다.');
  if(room.firstPick===null){
   room.firstPick={player:who,index:tubeIndex};
   room.turn=1-who;this.changed(room);return;
  }
  if(room.firstPick.player===who)throw Error('후플레이어만 원통을 제시할 수 있습니다.');
  const picks=Array(2).fill(null);
  picks[who]=tubeIndex;picks[room.firstPick.player]=room.firstPick.index;
  const values=picks.map((idx,i)=>room.players[i].tubes[idx]);
  const blocks=picks.map((idx,i)=>room.players[i].tubes[idx]);
  for(let i=0;i<2;i++)room.players[i].used[picks[i]]=true;
  const victor=values[0]===values[1]?null:values[0]>values[1]?0:1;
  if(victor!==null)room.players[victor].points++;
  const item={round:room.round,first:room.firstPick.player,picks,values,blocks,winner:victor};
  room.history.push(item);room.result=item;room.firstPick=null;room.turn=null;
  const enough=room.players.some(p=>p.points>=4),exhausted=room.players.every(p=>p.used.every(Boolean));
  if(enough||exhausted){
   room.stage='finished';room.winner=room.players[0].points===room.players[1].points?null:room.players[0].points>room.players[1].points?0:1;
   room.endsAt=null;this.changed(room);return;
  }
  room.stage='result';room.endsAt=this.now()+REVEAL_MS;
  const round=room.round,deadline=room.endsAt;
  room.timer=this.schedule(()=>{if(room.stage==='result'&&room.round===round&&room.endsAt===deadline)this.beginRound(room);},REVEAL_MS);
  if(room.timer?.unref)room.timer.unref();
  this.changed(room);
 }
 restart(room,access){
  if(this.index(room,access)!==0)throw Error('방장만 새 게임을 시작할 수 있습니다.');
  if(room.stage!=='finished')throw Error('결과가 나온 뒤 재경기할 수 있습니다.');
  if(room.timer)this.cancel(room.timer);
  room.timer=null;room.stage='lobby';room.turn=null;room.round=0;room.firstPick=null;room.history=[];room.result=null;room.winner=null;room.endsAt=null;
  room.players.forEach(p=>{p.ready=false;p.prepared=false;p.tubes=null;p.used=Array(7).fill(false);p.points=0;});
  this.changed(room);
 }
 leave(room,access){
  const person=this.player(room,access);
  if(room.timer)this.cancel(room.timer);
  room.timer=null;room.players=room.players.filter(p=>p!==person);
  room.stage='lobby';room.round=0;room.turn=null;room.firstPick=null;room.result=null;room.winner=null;room.endsAt=null;room.history=[];
  room.players.forEach(p=>{p.ready=false;p.prepared=false;p.tubes=null;p.used=Array(7).fill(false);p.points=0;});
  this.changed(room);
 }
 serialize(room,access){
  const player=this.player(room,access),you=room.players.indexOf(player);
  return {room:room.code,stage:room.stage,round:room.round,turn:room.turn,starter:room.starter,firstPick:room.firstPick?{player:room.firstPick.player,index:room.firstPick.index}:null,
    you,hostId:room.players[0]?.id,colors:CYLINDER_COLORS,
    players:room.players.map((p,i)=>({id:p.id,name:p.name,ready:p.ready,prepared:p.prepared,points:p.points,used:[...p.used],
      // 선택 전 타인의 블록 합과 구성은 서버에만 존재해야 합니다.
      tubes:i===you&&p.tubes?[...p.tubes]:null
    })),
    history:room.history.map(r=>({...r,picks:[...r.picks],values:[...r.values],blocks:[...r.blocks]})),
    result:room.result?{...room.result,picks:[...room.result.picks],values:[...room.result.values],blocks:[...room.result.blocks]}:null,
    winner:room.winner,endsAt:room.endsAt,serverNow:this.now()};
 }
}
module.exports={GradientService,validateSetup,CYLINDER_COLORS,DIGITS,REVEAL_MS};
