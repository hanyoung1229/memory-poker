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
function computerMove(state,difficulty='normal'){
 const options=legal(state);
 if(!options.length)return null;
 const sorted=[...options].sort((a,b)=>priority(state,b)-priority(state,a));
 if(difficulty==='easy'){
  const instant=sorted.find(m=>m.kind==='move'&&state.board[m.to]?.type==='K');
  return instant||sorted[Math.floor(Math.random()*sorted.length)];
 }
 const depth=difficulty==='hard'?3:2;
 const maxNodes=difficulty==='hard'?1100:500;
 const who=state.turn,stats={nodes:0};
 function search(position,d,alpha,beta){
  stats.nodes++;
  if(d===0||position.winner!==null||stats.nodes>=maxNodes)return evaluate(position,who);
  const moves=legal(position).sort((a,b)=>priority(position,b)-priority(position,a)).slice(0,16);
  if(!moves.length)return position.turn===who?-100000:100000;
  if(position.turn===who){
   let score=-Infinity;
   for(const m of moves){
    score=Math.max(score,search(apply(position,m),d-1,alpha,beta));
    alpha=Math.max(alpha,score);
    if(beta<=alpha||stats.nodes>=maxNodes)break;
   }
   return score;
  }
  let score=Infinity;
  for(const m of moves){
   score=Math.min(score,search(apply(position,m),d-1,alpha,beta));
   beta=Math.min(beta,score);
   if(beta<=alpha||stats.nodes>=maxNodes)break;
  }
  return score;
 }
 let best=-Infinity,bestMoves=[];
 for(const move of sorted){
  if(stats.nodes>=maxNodes&&bestMoves.length)break;
  const v=search(apply(state,move),depth-1,-Infinity,Infinity);
  if(v>best+.00001){best=v;bestMoves=[move]}
  else if(Math.abs(v-best)<.00001)bestMoves.push(move);
  if(best>=100000)break;
 }
 return bestMoves[Math.floor(Math.random()*bestMoves.length)]||sorted[0];
}
const api={W,H,N,TYPES,LABELS,fresh,dirs,legal,apply,sameMove,computerMove,evaluate,index,pos,enemyZone,forward};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(global)global.TwelveEngine=api;
})(typeof window!=='undefined'?window:null);
