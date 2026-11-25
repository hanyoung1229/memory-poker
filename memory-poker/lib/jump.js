'use strict';
/* 양갈래 점프 — 게임 규칙 엔진. 같은 방향 연속 생성 시 확률 +6%p,
 * 반대 방향이 나오면 연속 보너스를 초기화. 앞 4개 발판 유지. */
(function(root){
const DURATION_MS=45000;
const PREVIEW_COUNT=4;
const BONUS=.06;
function newRun({rng=Math.random}={}){
 const state={queue:[],last:null,streak:0,score:0,jumps:0,ended:false,result:null,history:[]};
 refill(state,rng);
 return state;
}
function chance(state){
 if(state.last===null)return .5;
 return .5+Math.max(0,Math.min(4,state.streak)-1)*BONUS;
}
function nextSide(state,rng=Math.random){
 const p=chance(state);
 let v=Number(rng());
 if(!Number.isFinite(v))v=.5;
 v=Math.max(0,Math.min(.999999999999,v));
 let side;
 if(state.last===null)side=v<.5?'left':'right';
 else side=v<p?state.last:(state.last==='left'?'right':'left');
 if(side===state.last)state.streak++;
 else state.streak=1;
 state.last=side;
 return side;
}
function refill(state,rng=Math.random){
 while(state.queue.length<PREVIEW_COUNT)state.queue.push(nextSide(state,rng));
 return state;
}
function jump(state,side,{rng=Math.random}={}){
 if(state.ended)return {ok:false,ended:true,reason:'finished',score:state.score};
 if(side!=='left'&&side!=='right')return {ok:false,ended:false,reason:'invalid',score:state.score};
 const expected=state.queue[0];
 state.jumps++;
 if(side!==expected){
  state.ended=true;state.result='miss';
  state.history.push({choice:side,expected,correct:false});
  return {ok:false,ended:true,reason:'miss',expected,choice:side,score:state.score};
 }
 state.score++;
 state.history.push({choice:side,expected,correct:true});
 state.queue.shift();
 refill(state,rng);
 return {ok:true,ended:false,score:state.score,expected,choice:side,preview:[...state.queue]};
}
function expire(state){
 if(!state.ended){state.ended=true;state.result='time';}
 return {ended:state.ended,result:state.result,score:state.score};
}
const api={DURATION_MS,PREVIEW_COUNT,BONUS,newRun,refill,chance,nextSide,jump,expire};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root)root.JumpEngine=api;
})(typeof window!=='undefined'?window:typeof self!=='undefined'?self:null);
