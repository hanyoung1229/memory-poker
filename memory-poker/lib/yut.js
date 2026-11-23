'use strict';
const {randomBytes,randomInt}=require('node:crypto');
const MODES=Object.freeze({
 '1v1':Object.freeze({teams:[0,1],sticks:[2,2]}),
 '1v2':Object.freeze({teams:[0,1,1],sticks:[2,1,1]}),
 '2v2':Object.freeze({teams:[0,1,0,1],sticks:[1,1,1,1]})
});
const FINISH='FINISH', HOME='HOME', THROW_MS=1800;
const BOARD={
  5:[6,20],10:[11,25],19:[0],20:[21],21:[22],22:[23,27],23:[24],24:[15],
  25:[26],26:[22],27:[28],28:[0]
};
function token(){return randomBytes(24).toString('hex');}
function roomCode(){const letters='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:6},()=>letters[randomInt(letters.length)]).join('');}
function nameOf(value){return typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,16):'';}
function advance(node,path,first){
 // 도착점 0을 지나서 다시 한 걸음 더 나가야 골인; 출발 전의 0은 첫 칸으로 이동.
 if(node===0)return path.length?[FINISH]:[1];
 if(node===FINISH)return [FINISH];
 if(BOARD[node]){
  if(node===5||node===10||node===22){
    const choices=BOARD[node];
    if(node===22)return [path.at(-2)===26?27:23];
    if(first)return choices;
    // 모서리에서 정확히 멈춘 다음 턴에만 지름길을 선택합니다.
    if(node===5)return [6];
    if(node===10)return [11];
  }
  return BOARD[node];
 }
 return [node+1];
}
function moveOptionsForPiece(piece,steps){
 if(piece.status==='done')return [];
 if(steps<0){
  if(piece.status!=='board'||!piece.path.length)return [];
  const nextPath=piece.path.slice(0,-1);
  // 뒷도로 출발점에 닿아도 완주는 아니며, 이후 한 걸음 더 나가야 골인한다.
  return [{to:nextPath.length?nextPath.at(-1):0,path:nextPath.length?nextPath:[0],route:'back',trail:[nextPath.length?nextPath.at(-1):0]}];
 }
 let states=[{position:piece.status==='home'?0:piece.path.at(-1),path:[...piece.path],trail:[]}];
 for(let n=0;n<steps;n++){
   const next=[];
   for(const state of states){
     for(const dest of advance(state.position,state.path,n===0)){
       next.push({position:dest,path:dest===FINISH?[]:[...state.path,dest],trail:[...state.trail,dest]});
     }
   }
   states=next;
 }
 const unique=new Map();
 for(const state of states){
   const key=String(state.position)+':'+state.path.join('-');
   if(!unique.has(key))unique.set(key,{to:state.position,path:state.path,route:key,trail:state.trail});
 }
 return [...unique.values()];
}
function labelFor(frontCount) {
 // F = 둥근 앞면 / B = 평평한 뒷면. 앞면 3개가 뒷도, 앞면 1개가 걸.
 return [{name:'윷',steps:4},{name:'걸',steps:3},{name:'개',steps:2},{name:'뒷도',steps:-1},{name:'모',steps:5}][frontCount];
}
function teamCounts(room){
 return [0,1].map(team=>room.players.filter(p=>p.team===team).length);
}
function teamsComplete(room){
 const [blue,red]=teamCounts(room);
 if(room.mode==='1v1')return blue===1&&red===1;
 if(room.mode==='1v2')return (blue===1&&red===2)||(blue===2&&red===1);
 return blue===2&&red===2;
}
function assignSticks(room){
 const counts=teamCounts(room);
 for(const p of room.players)p.stickCount=counts[p.team]===1?2:1;
}
class YutService {
 constructor({onChange=()=>{},now=()=>Date.now(),schedule=setTimeout,cancel=clearTimeout}={}){this.rooms=new Map();this.onChange=onChange;this.now=now;this.schedule=schedule;this.cancel=cancel;}
 changed(room){room.lastTouched=this.now();this.onChange(room);}
 find(code){const room=this.rooms.get(String(code||'').toUpperCase());if(!room)throw Error('존재하지 않는 전략 윷놀이 방입니다.');return room;}
 player(room,access){const p=room.players.find(p=>p.token===access);if(!p)throw Error('입장 정보가 유효하지 않습니다.');return p;}
 index(room,access){return room.players.indexOf(this.player(room,access));}
 create(name){
  if(!nameOf(name))throw Error('닉네임을 입력해 주세요.');
  let code;do{code=roomCode();}while(this.rooms.has(code));
  const room={code,mode:'1v1',pieceCount:2,players:[],stage:'lobby',turn:0,turnTeam:0,pieces:[],
   roll:null,lastRoll:null,lastAction:null,pendingRoll:null,timer:null,winner:null,round:0,lastTouched:this.now()};
  this.rooms.set(code,room);return {room,player:this.join(code,name)};
 }
 join(code,name){
  const room=this.find(code),safe=nameOf(name);
  if(room.stage!=='lobby')throw Error('게임 진행 중에는 참가할 수 없습니다.');
  if(!safe)throw Error('닉네임을 입력해 주세요.');
  if(room.players.length>=MODES[room.mode].teams.length)throw Error('현재 설정된 인원수가 모두 찼습니다.');
  if(room.players.some(p=>p.name.toLowerCase()===safe.toLowerCase()))throw Error('같은 닉네임을 사용할 수 없습니다.');
  const i=room.players.length;
  const counts=teamCounts(room);
  // 기본 진입 순서는 청·홍·청·홍(2대2), 청·홍·홍(1대2).
  // 로비에서 자유롭게 팀 변경한 경우에는 부족한 팀을 우선 채웁니다.
  let team=MODES[room.mode].teams[i];
  if(room.mode==='1v1'&&counts[team]>counts[1-team])team=1-team;
  if(room.mode==='1v2'&&counts[team]>=2&&counts[1-team]<2)team=1-team;
  if(room.mode==='2v2'&&counts[team]>=2&&counts[1-team]<2)team=1-team;
  const player={id:token().slice(0,12),token:token(),name:safe,team,stickCount:1,ready:false,choice:null};
  room.players.push(player);assignSticks(room);room.players.forEach(p=>{p.ready=false;p.choice=null;});
  this.changed(room);return player;
 }
 configure(room,access,{mode,pieceCount}){
  if(this.index(room,access)!==0)throw Error('방장만 설정을 변경할 수 있습니다.');
  if(room.stage!=='lobby')throw Error('게임 시작 전에만 설정할 수 있습니다.');
  const selectedMode=mode??room.mode,selectedCount=pieceCount??room.pieceCount;
  if(!MODES[selectedMode])throw Error('1대1, 1대2, 2대2 중 선택해 주세요.');
  if(![2,4].includes(selectedCount))throw Error('말 개수는 팀당 2개 또는 4개만 선택할 수 있습니다.');
  if(room.players.length>MODES[selectedMode].teams.length)throw Error('현재 인원보다 적은 대전 방식은 선택할 수 없습니다.');
  const modeChanged=selectedMode!==room.mode;
  room.mode=selectedMode;room.pieceCount=selectedCount;
  if(modeChanged)room.players.forEach((p,i)=>{p.team=MODES[selectedMode].teams[i];});
  assignSticks(room);
  room.players.forEach(p=>{p.ready=false;p.choice=null;});
  this.changed(room);
 }
 changeTeam(room,access,team){
  if(room.stage!=='lobby')throw Error('팀은 준비실에서만 변경할 수 있습니다.');
  if(!Number.isInteger(team)||(team!==0&&team!==1))throw Error('청팀 또는 홍팀 중 선택해 주세요.');
  const player=this.player(room,access);
  if(player.team===team)return;
  // 일시적으로 팀 인원수가 맞지 않아도 이동할 수 있습니다.
  // 최종 인원 구성이 맞춰져야 방장이 경기를 시작할 수 있습니다.
  player.team=team;
  assignSticks(room);
  room.players.forEach(p=>{p.ready=false;p.choice=null;});
  this.changed(room);
 }
 ready(room,access,ready){
  if(room.stage!=='lobby')throw Error('로비에서만 준비할 수 있습니다.');
  this.player(room,access).ready=!!ready;this.changed(room);
 }
 start(room,access){
  if(this.index(room,access)!==0)throw Error('방장만 게임을 시작할 수 있습니다.');
  const count=MODES[room.mode].teams.length;
  if(room.stage!=='lobby'||room.players.length!==count||!teamsComplete(room)||!room.players.every(p=>p.ready))
    throw Error('인원과 팀 구성(1대1·1대2·2대2)을 맞추고 전원이 준비해야 시작할 수 있습니다.');
  room.pieces=Array.from({length:2*room.pieceCount},(_,i)=>({id:'P'+(i+1),team:Math.floor(i/room.pieceCount),status:'home',path:[]}));
  room.turnTeam=0;room.turn=0;room.winner=null;room.lastAction=null;room.lastRoll=null;
  this.beginThrow(room);
 }
 beginThrow(room){
  room.stage='choose';room.round+=1;room.roll=null;room.pendingRoll=null;
  room.players.forEach(p=>p.choice=null);
  this.changed(room);
 }
 choose(room,access,choices){
  if(room.stage!=='choose')throw Error('지금은 윷을 고르는 단계가 아닙니다.');
  const player=this.player(room,access);
  if(!Array.isArray(choices)||choices.length!==player.stickCount||!choices.every(v=>v==='F'||v==='B'))throw Error('내 윷가락만큼 앞면·뒷면을 선택해 주세요.');
  if(player.choice)throw Error('이미 선택을 확정했습니다.');
  player.choice=[...choices];
  if(room.players.every(p=>p.choice!==null))this.resolveThrow(room);
  else this.changed(room);
 }
 legalMoves(room){
  if(room.stage!=='move'||!room.roll)return [];
  const pieces=room.pieces.filter(p=>p.team===room.turnTeam&&p.status!=='done');
  const result=[];
  const seen=new Set();
  for(const piece of pieces){
   if(piece.status==='board'){
     const key='group:'+piece.path.at(-1);
     if(seen.has(key))continue;
     seen.add(key);
   }
   for(const option of moveOptionsForPiece(piece,room.roll.steps))
     result.push({pieceId:piece.id,from:piece.status==='home'?null:piece.path.at(-1),to:option.to,route:option.route,path:option.path,trail:option.trail});
  }
  return result;
 }
 resolveThrow(room){
  const fronts=room.players.flatMap(p=>p.choice).filter(x=>x==='F').length;
  if(room.players.reduce((n,p)=>n+p.choice.length,0)!==4)throw Error('네 개의 윷 선택이 필요합니다.');
  const hit=labelFor(fronts);
  room.pendingRoll={fronts,...hit,bonus:hit.steps===4||hit.steps===5,selected:room.players.map(p=>({name:p.name,team:p.team,choice:[...p.choice]}))};
  room.stage='throwing';
  const stamp=room.round;
  room.timer=this.schedule(()=>{if(room.stage==='throwing'&&room.round===stamp)this.finishThrow(room);},THROW_MS);
  if(room.timer?.unref)room.timer.unref();
  this.changed(room);
 }
 finishThrow(room){
  if(room.stage!=='throwing'||!room.pendingRoll)return;
  if(room.timer)this.cancel(room.timer);room.timer=null;
  const {selected,...result}=room.pendingRoll;
  room.pendingRoll=null;room.roll=result;
  room.lastRoll={...result,selected};
  room.stage='move';
  if(!this.legalMoves(room).length){
   room.lastAction={message:result.name+' · 움직일 수 있는 말이 없어 차례를 넘겼습니다.',type:'pass'};
   this.endTurn(room,false);
  }else this.changed(room);
 }
 move(room,access,pieceId,route){
  if(room.stage!=='move')throw Error('윷을 확정한 뒤 말을 움직일 수 있습니다.');
  if(this.player(room,access).team!==room.turnTeam)throw Error('지금은 상대편 차례입니다.');
  const option=this.legalMoves(room).find(x=>x.pieceId===pieceId&&x.route===route);
  if(!option)throw Error('해당 말이나 이동 경로를 선택할 수 없습니다.');
  const piece=room.pieces.find(p=>p.id===pieceId);
  const grouped=piece.status==='board'?room.pieces.filter(p=>p.team===room.turnTeam&&p.status==='board'&&p.path.at(-1)===piece.path.at(-1)):[piece];
  for(const p of grouped){
    p.status=option.to===FINISH?'done':option.to===HOME?'home':'board';p.path=option.to===FINISH||option.to===HOME?[]:[...option.path];
  }
  const taken=option.to===FINISH||option.to===HOME?[]:room.pieces.filter(p=>p.team!==room.turnTeam&&p.status==='board'&&p.path.at(-1)===option.to);
  for(const p of taken){p.status='home';p.path=[];}
  room.lastAction={message:'우리 팀 말 '+grouped.map(p=>p.id).join(', ')+' 이동'+(option.to===FINISH?' · 완주!':'')+(taken.length?' · 상대 말 '+taken.length+'개 잡기':''),type:taken.length?'capture':'move',from:option.from,to:option.to,team:room.turnTeam,captured:taken.length};
  if(room.pieces.filter(p=>p.team===room.turnTeam).every(p=>p.status==='done')){
    room.stage='finished';room.winner=room.turnTeam;this.changed(room);return;
  }
  this.endTurn(room,room.roll.bonus||taken.length>0);
 }
 endTurn(room,extra){
  if(!extra)room.turnTeam=1-room.turnTeam;
  this.beginThrow(room);
 }
 restart(room,access){
  if(this.index(room,access)!==0)throw Error('방장만 재경기를 설정할 수 있습니다.');
  if(room.stage!=='finished')throw Error('승부가 끝난 뒤 재경기할 수 있습니다.');
  if(room.timer)this.cancel(room.timer);room.timer=null;
  room.stage='lobby';room.round=0;room.roll=null;room.pendingRoll=null;room.lastRoll=null;room.lastAction=null;room.winner=null;room.pieces=[];
  room.players.forEach(p=>{p.ready=false;p.choice=null;});
  this.changed(room);
 }
 leave(room,access){
  const player=this.player(room,access);
  room.players=room.players.filter(p=>p!==player);
  // 빈 자리는 남은 인원의 순서대로 재배정합니다.
  assignSticks(room);
  room.players.forEach(p=>{p.ready=false;p.choice=null;});
  if(room.timer)this.cancel(room.timer);room.timer=null;
  room.stage='lobby';room.round=0;room.roll=null;room.pendingRoll=null;room.lastRoll=null;room.lastAction=null;room.winner=null;room.pieces=[];
  this.changed(room);
 }
 serialize(room,access){
  const viewer=this.player(room,access);
  return {
   room:room.code,mode:room.mode,pieceCount:room.pieceCount,teamsReady:teamsComplete(room),teamCounts:teamCounts(room),stage:room.stage,round:room.round,
   hostId:room.players[0]?.id,viewerId:viewer.id,viewerTeam:viewer.team,turnTeam:room.turnTeam,
   players:room.players.map(p=>({id:p.id,name:p.name,team:p.team,stickCount:p.stickCount,ready:p.ready,
     submitted:p.choice!==null,choice:p.id===viewer.id?p.choice:null})),
   pieces:room.pieces.map(p=>({...p,path:[...p.path]})),
   roll:room.stage==='move'?room.roll:null,lastRoll:room.lastRoll,lastAction:room.lastAction,
   legalMoves:room.stage==='move'&&viewer.team===room.turnTeam?this.legalMoves(room):[],
   winner:room.winner,throwMs:room.stage==='throwing'?THROW_MS:null,serverNow:this.now()
  };
 }
}
module.exports={YutService,MODES,FINISH,HOME,moveOptionsForPiece,labelFor,teamCounts,teamsComplete,THROW_MS};
