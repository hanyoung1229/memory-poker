'use strict';
(function(){
const E=window.JumpEngine;
const $=id=>document.getElementById(id);
const ui={
 score:$('score'),timer:$('timer'),best:$('best'),fill:$('time-fill'),
 path:$('path'),scene:$('scene'),avatar:$('avatar'),flash:$('flash'),
 overlay:$('overlay'),overlayTitle:$('overlayTitle'),overlayIcon:$('overlayIcon'),
 overlayMessage:$('overlayMessage'),overlaySummary:$('overlaySummary'),
 play:$('play'),reset:$('reset'),left:$('goLeft'),right:$('goRight'),timeStat:document.querySelector('.time-stat')
};
const savedBest=()=>{
 try{return Math.max(0,parseInt(localStorage.getItem('game-club:split-jump-best')||'0',10)||0);}
 catch{return 0;}
};
let best=savedBest(),run=null,startedAt=0,frame=0,jumpClear=null,flashClear=null,runId=0;
const clock=()=>typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now():Date.now();
function persistBest(score){
 if(score<=best)return;
 best=score;
 try{localStorage.setItem('game-club:split-jump-best',String(best));}catch{}
 ui.best.textContent=String(best);
}
function paintPath(){
 if(!run)return;
 ui.path.innerHTML=run.queue.map((side,i)=>{
  const step=i+1,arrow=side==='left'?'←':'→';
  return '<div class="platform-row" data-step="'+step+'" data-side="'+side+'">'+
   '<div class="platform '+side+(i===0?' next':'')+'" aria-label="'+step+'번째 '+(side==='left'?'왼쪽':'오른쪽')+' 발판">'+
   '<span class="nr">'+String(step).padStart(2,'0')+'</span>'+
   '<span class="arrow" aria-hidden="true">'+arrow+'</span></div></div>';
 }).join('');
}
function paintScore(){
 ui.score.textContent=String(run?.score||0);
 ui.best.textContent=String(best);
}
function updateTime(ms){
 const left=Math.max(0,E.DURATION_MS-ms);
 ui.timer.innerHTML=(left/1000).toFixed(1)+'<small>s</small>';
 ui.fill.style.width=(left/E.DURATION_MS*100)+'%';
 const urgent=left<=10000;
 ui.fill.classList.toggle('urgent',urgent);
 ui.timeStat.classList.toggle('urgent',urgent);
}
function setControls(allowed){
 ui.left.disabled=!allowed;
 ui.right.disabled=!allowed;
}
function hideOverlay(){
 ui.overlay.hidden=true;
}
function showOverlay({title,icon,message,summary,button}){
 ui.overlayTitle.textContent=title;
 ui.overlayIcon.textContent=icon;
 ui.overlayMessage.textContent=message;
 ui.overlaySummary.hidden=!summary;
 ui.overlaySummary.textContent=summary||'';
 ui.play.innerHTML=button+' <span aria-hidden="true">→</span>';
 ui.overlay.hidden=false;
 setControls(false);
}
function clearEffects(){
 if(jumpClear!==null)clearTimeout(jumpClear);
 if(flashClear!==null)clearTimeout(flashClear);
 jumpClear=null;flashClear=null;
 ui.avatar.classList.remove('jumping','to-left','to-right');
 ui.flash.classList.remove('show','miss');
 ui.scene.classList.remove('missed');
}
function setFlash(text,miss=false){
 if(flashClear!==null)clearTimeout(flashClear);
 ui.flash.textContent=text;
 ui.flash.classList.remove('show','miss');
 void ui.flash.offsetWidth;
 if(miss)ui.flash.classList.add('miss');
 ui.flash.classList.add('show');
 flashClear=setTimeout(()=>ui.flash.classList.remove('show','miss'),400);
}
function finish(result){
 if(!run||run.ended&&run.result!==result)return;
 E.expire(run);
 if(result==='miss')run.result='miss';
 cancelAnimationFrame(frame);
 frame=0;
 persistBest(run.score);
 setControls(false);
 const score=run.score;
 const reason=result==='miss'?'발판을 놓쳤어요!':'45초 종료!';
 const desc=result==='miss'?'잘못된 방향으로 점프했어요. 다시 도전할까요?':'제한시간이 끝났어요. 더 높은 점수에 도전하세요!';
 showOverlay({title:reason,icon:result==='miss'?'💥':'🏁',message:desc,summary:'이번 기록 '+score+'점 · 최고 기록 '+best+'점',button:'다시 도전'});
}
function ticker(stamp){
 if(!run||run.ended)return;
 const elapsed=stamp-startedAt;
 updateTime(elapsed);
 if(elapsed>=E.DURATION_MS){
  finish('time');
  return;
 }
 frame=requestAnimationFrame(ticker);
}
function start(){
 runId++;
 cancelAnimationFrame(frame);frame=0;
 clearEffects();
 run=E.newRun();
 startedAt=clock();
 paintPath();paintScore();updateTime(0);hideOverlay();setControls(true);
 frame=requestAnimationFrame(ticker);
}
function hop(side){
 // 입력을 즉시 적용한다. 점프 애니메이션은 독립적이며 다음 조작을 차단하지 않는다.
 if(!run||run.ended)return false;
 if(clock()-startedAt>=E.DURATION_MS){updateTime(E.DURATION_MS);finish('time');return false;}
 const answer=E.jump(run,side);
 if(answer.reason==='invalid')return false;
 if(jumpClear!==null){clearTimeout(jumpClear);jumpClear=null;}
 ui.avatar.classList.remove('jumping','to-left','to-right');
 void ui.avatar.offsetWidth;
 ui.avatar.classList.add('jumping',side==='left'?'to-left':'to-right');
 if(answer.ok){
  paintPath();paintScore();persistBest(run.score);setFlash('+1');
 }else{
  ui.scene.classList.add('missed');
  setFlash('MISS!',true);
 }
 const current=runId;
 jumpClear=setTimeout(()=>{
  if(current!==runId)return;
  ui.avatar.classList.remove('jumping','to-left','to-right');
  jumpClear=null;
 },115);
 if(answer.ended)finish('miss');
 return answer.ok;
}
ui.play.addEventListener('click',start);
ui.reset.addEventListener('click',start);
ui.left.addEventListener('click',()=>hop('left'));
ui.right.addEventListener('click',()=>hop('right'));
document.addEventListener('keydown',event=>{
 if(event.repeat||event.altKey||event.ctrlKey||event.metaKey)return;
 const side=(event.key==='a'||event.key==='A'||event.key==='ArrowLeft')?'left':
  (event.key==='d'||event.key==='D'||event.key==='ArrowRight')?'right':null;
 if(!side)return;
 if(!ui.overlay.hidden)return;
 event.preventDefault();
 hop(side);
});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden||!run||run.ended)return;
 if(clock()-startedAt>=E.DURATION_MS)finish('time');
});
ui.best.textContent=String(best);
updateTime(0);
paintScore();
showOverlay({title:'갈림길 점프',icon:'🐸',
 message:'다가오는 발판의 방향을 보고 45초 동안 최대한 많이 점프하세요.',
 summary:null,button:'게임 시작'});
// 테스트 전용 경량 인터페이스. 실제 게임 동작에는 영향 없음.
if(typeof window!=='undefined')window.__splitJump={start,hop,getState:()=>run};
})();