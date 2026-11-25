'use strict';
/* 더 지니어스 십이장기 공통 규칙 엔진. 4×3. 왼쪽=청/0, 오른쪽=홍/1. */
(function(global){
const W=4,H=3,N=12;
const TYPES={K:'王',J:'將',S:'相',P:'子',H:'侯'};
const LABELS={K:'왕',J:'장',S:'상',P:'자',H:'후'};
const VALUE={K:1000,J:5,S:5,P:2.8,H:7};
const D4=[[1,0],[-1,0],[0,1],[0,-1]];
const DIAG=[[1,1],[1,-1],[-1,1],[-1,-1]];
const ALL=[...D4,...DIAG];
const index=(x,y)=>y*W+x;
const pos=i=>({x:i%W,y:Math.floor(i/W)});
const enemyZone=side=>side===0?3:0;
const forward=side=>side===0?1:-1;
const inside=(x,y)=>x>=0&&x<W&&y>=0&&y<H;
const clone=p=>p?{owner:p.owner,type:p.type}:null;
function fresh(first=0){
 const board=Array(N).fill(null);
 const put=(x,y,owner,type)=>{board[index(x,y)]={owner,type}};
 put(0,0,0,'S');put(0,1,0,'K');put(0,2,0,'J');put(1,1,0,'P');
 put(3,0,1,'J');put(3,1,1,'K');put(3,2,1,'S');put(2,1,1,'P');
 return {board,hands:[[],[]],turn:first,winner:null,ply:0,last:null};
}
function dirs(piece){
 switch(piece.type){
  case 'K':return ALL;
  case 'J':return D4;
  case 'S':return DIAG;
  case 'P':return [[forward(piece.owner),0]];
  case 'H':{
   const f=forward(piece.owner);
   return [[f,0],[0,1],[0,-1],[-f,0],[f,1],[f,-1]];
  }
 }
 return [];
}
function legal(state,side=state.turn){
 if(state.winner!==null)return [];
 const moves=[];
 for(let from=0;from<N;from++){
  const piece=state.board[from];if(!piece||piece.owner!==side)continue;
  const {x,y}=pos(from);
  for(const [dx,dy] of dirs(piece)){
   const nx=x+dx,ny=y+dy;
   if(!inside(nx,ny))continue;
   const to=index(nx,ny),target=state.board[to];
   if(target&&target.owner===side)continue;
   moves.push({kind:'move',from,to,capture:!!target,promote:piece.type==='P'&&nx===enemyZone(side)});
  }
 }
 const kinds=[...new Set(state.hands[side])];
 for(const type of kinds){
  for(let to=0;to<N;to++){
   if(state.board[to]||pos(to).x===enemyZone(side))continue;
   moves.push({kind:'drop',type,to});
  }
 }
 return moves;
}
function sameMove(a,b){
 return !!a&&!!b&&a.kind===b.kind&&a.to===b.to&&(
 a.kind==='move'?a.from===b.from:a.type===b.type);
}
function apply(state,move){
 if(state.winner!==null)throw Error('이미 승부가 종료됐습니다.');
 const side=state.turn,valid=legal(state).find(m=>sameMove(m,move));
 if(!valid)throw Error('해당 말은 그 위치로 움직일 수 없습니다.');
 const next={board:state.board.map(clone),hands:state.hands.map(h=>[...h]),turn:1-side,winner:null,ply:state.ply+1,last:null};
 let piece,captured=null;
 if(valid.kind==='move'){
  piece=next.board[valid.from];
  captured=next.board[valid.to];
  next.board[valid.from]=null;
  if(captured){
   if(captured.type==='K')next.winner=side;
   else next.hands[side].push(captured.type==='H'?'P':captured.type);
  }
  if(piece.type==='P'&&pos(valid.to).x===enemyZone(side))piece.type='H';
  next.board[valid.to]=piece;
 }else{
  const i=next.hands[side].indexOf(valid.type);
  if(i<0)throw Error('포로 말이 없습니다.');
  next.hands[side].splice(i,1);
  piece={owner:side,type:valid.type};
  next.board[valid.to]=piece;
 }
 next.last={...valid,side,piece:piece.type,captured:captured?.type||null};
 if(next.winner===null){
  // 적 진영에 들어간 왕이 상대의 한 수를 버티고 자신의 다음 차례를 맞으면 승리.
  const nextSide=next.turn;
  if(next.board.some((p,i)=>p&&p.owner===nextSide&&p.type==='K'&&pos(i).x===enemyZone(nextSide)))next.winner=nextSide;
  else if(!legal(next,nextSide).length)next.winner=side; // 합법 수 없음: 패배 처리
 }
 return next;
}
// 왕이 상대의 현재 말에 의해 즉시 잡힐 수 있는지 (차례와 무관하게) 판정.
function kingThreatened(state,side){
 const king=state.board.findIndex(p=>p&&p.owner===side&&p.type==='K');
 if(king<0)return false;
 const target=pos(king);
 for(let i=0;i<N;i++){
  const p=state.board[i];if(!p||p.owner===side)continue;
  const from=pos(i);
  if(dirs(p).some(([dx,dy])=>from.x+dx===target.x&&from.y+dy===target.y))return true;
 }
 return false;
}
function priority(state,move){
 if(move.kind==='drop')return (VALUE[move.type]||1)*1.2;
 const victim=state.board[move.to],piece=state.board[move.from];
 return (victim?(VALUE[victim.type]||1)*20:0)+(move.promote?15:0)+
 (piece?.type==='K'&&pos(move.to).x===enemyZone(piece.owner)?10:0);
}
function evaluate(state,side){
 if(state.winner!==null)return state.winner===side?100000:-100000;
 let score=0;
 for(let i=0;i<N;i++){
  const piece=state.board[i];if(!piece)continue;
  const sign=piece.owner===side?1:-1,px=pos(i).x;
  score+=sign*(VALUE[piece.type]+
    (piece.type==='K'&&px===enemyZone(piece.owner)?12:0)+
    (piece.type==='P'||piece.type==='H'?(piece.owner===0?px:W-1-px)*.3:0));
 }
 for(let owner=0;owner<2;owner++){
  const sign=owner===side?1:-1;
  for(const piece of state.hands[owner])score+=sign*(VALUE[piece]*.83);
 }
 return score;
}
const DEPTHS=Object.freeze({easy:3,normal:5,hard:8});
const BUDGETS=Object.freeze({easy:{ms:500,nodes:18000},normal:{ms:1700,nodes:90000},hard:{ms:4500,nodes:240000}});
function positionKey(s){
 const board=s.board.map(p=>p?p.owner+':'+p.type:'.').join(',');
 const hands=s.hands.map(h=>h.slice().sort().join('')).join('/');
 return s.turn+'|'+board+'|'+hands+'|'+(s.winner??'-');
}
/* 실제 합법 수 트리를 한 수씩 탐색한다. 시간/노드 제한 시 마지막으로 완료된
   깊이의 결과만 사용하여 중간에 끊긴 탐색의 부정확한 점수는 버린다. */
function analyzeMove(state,difficulty='normal',options={}){
 const level=Object.hasOwn(DEPTHS,difficulty)?difficulty:'normal';
 const targetDepth=DEPTHS[level],defaults=BUDGETS[level];
 const timeLimit=Number.isFinite(options.timeLimitMs)?Math.max(1,options.timeLimitMs):defaults.ms;
 const nodeLimit=Number.isFinite(options.nodeLimit)?Math.max(1,options.nodeLimit):defaults.nodes;
 const clock=typeof options.now==='function'?options.now:Date.now;
 const start=clock(),deadline=start+timeLimit;
 const rootMoves=legal(state);
 if(!rootMoves.length)return {move:null,targetDepth,completedDepth:0,nodes:0,positions:0,limited:false,elapsedMs:0};
 const side=state.turn;
 const stats={nodes:0,positions:0,limited:false};
 const table=new Map();
 const killers=Array.from({length:targetDepth+2},()=>[]);
 const abortToken={};
 const order=(p,moves,ply,preferred)=>{
  const killer=killers[ply]||[];
  return moves.sort((a,b)=>{
   const rate=m=>(preferred&&sameMove(m,preferred)?1000000:0)+
     (killer.some(x=>sameMove(x,m))?500:0)+priority(p,m);
   return rate(b)-rate(a);
  });
 };
 function testBudget(){
  if(stats.nodes>=nodeLimit||clock()>=deadline){
   stats.limited=true;throw abortToken;
  }
 }
 function search(position,depth,alpha,beta,ply){
  stats.nodes++;
  if((stats.nodes&127)===0)testBudget();
  if(position.winner!==null)return position.winner===side?100000-ply:-100000+ply;
  if(depth===0){stats.positions++;return evaluate(position,side);}
  const key=positionKey(position),cache=table.get(key);
  const originalAlpha=alpha,originalBeta=beta;
  if(cache&&cache.depth>=depth){
   if(cache.flag==='exact')return cache.score;
   if(cache.flag==='lower')alpha=Math.max(alpha,cache.score);
   if(cache.flag==='upper')beta=Math.min(beta,cache.score);
   if(alpha>=beta)return cache.score;
  }
  const available=order(position,legal(position),ply,cache?.best);
  if(!available.length)return position.turn===side?-100000+ply:100000-ply;
  const maximize=position.turn===side;
  let bestScore=maximize?-Infinity:Infinity,bestMove=null;
  for(const move of available){
   const score=search(apply(position,move),depth-1,alpha,beta,ply+1);
   if((maximize&&score>bestScore)||(!maximize&&score<bestScore)){
    bestScore=score;bestMove=move;
   }
   if(maximize)alpha=Math.max(alpha,bestScore);else beta=Math.min(beta,bestScore);
   if(alpha>=beta){
    const arr=killers[ply];if(!arr.some(x=>sameMove(x,move))){arr.unshift(move);if(arr.length>2)arr.pop();}
    break;
   }
  }
  if(table.size>150000)table.clear();
  table.set(key,{depth,score:bestScore,best:bestMove,flag:bestScore<=originalAlpha?'upper':bestScore>=originalBeta?'lower':'exact'});
  return bestScore;
 }
 // 최소 한 수는 항상 확보. 깊이별 전체 루트 탐색이 끝난 결과만 확정한다.
 let chosen=order(state,[...rootMoves],0,null)[0],completedDepth=0;
 let rootScore=null;
 for(let d=1;d<=targetDepth;d++){
  try{
   testBudget();
   const sorted=order(state,[...rootMoves],0,chosen);
   let localBest=null,localScore=-Infinity;
   for(const move of sorted){
    testBudget();
    const score=search(apply(state,move),d-1,-Infinity,Infinity,1);
    if(score>localScore){localBest=move;localScore=score;}
   }
   if(localBest){chosen=localBest;rootScore=localScore;completedDepth=d;}
   if(Math.abs(rootScore)>=99999)break;
  }catch(err){if(err!==abortToken)throw err;break;}
 }
 return {move:chosen,targetDepth,completedDepth,nodes:stats.nodes,positions:stats.positions,
  limited:stats.limited,elapsedMs:Math.max(0,clock()-start),score:rootScore};
}
function computerMove(state,difficulty='normal',options={}){
 return analyzeMove(state,difficulty,options).move;
}
const api={W,H,N,TYPES,LABELS,fresh,dirs,legal,apply,sameMove,computerMove,analyzeMove,DEPTHS,BUDGETS,evaluate,index,pos,enemyZone,forward,kingThreatened};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(global)global.TwelveEngine=api;
})(typeof window!=='undefined'?window:typeof self!=='undefined'?self:null);
