'use strict';
(function(){
const E=window.JumpEngine;
const $=id=>document.getElementById(id);
const ui={
 score:$('score'),best:$('best'),jumpGauge:$('jumpGaugeFill'),
 totalTimer:$('totalTimer'),totalFill:$('total-time-fill'),totalPanel:document.querySelector('.time-stat'),
 path:$('path'),scene:$('scene'),avatar:$('avatar'),flash:$('flash'),
 overlay:$('overlay'),overlayTitle:$('overlayTitle'),overlayIcon:$('overlayIcon'),
 leader:$('globalLeader'),nickname:$('jumpNickname'),
 overlayMessage:$('overlayMessage'),overlaySummary:$('overlaySummary'),
 play:$('play'),reset:$('reset'),vibrationToggle:$('vibrationToggle'),left:$('goLeft'),right:$('goRight')
};
const savedBest=()=>{
 try{return Math.max(0,parseInt(localStorage.getItem('game-club:split-jump-best')||'0',10)||0);}
 catch{return 0;}
};
const VIBRATION_KEY='game-club:split-jump-vibration';
const vibrationAvailable=typeof navigator!=='undefined'&&typeof navigator.vibrate==='function';
let vibrationEnabled=true;
try{vibrationEnabled=localStorage.getItem(VIBRATION_KEY)!=='off';}catch{}
function paintVibrationToggle(){
 if(!ui.vibrationToggle)return;
 ui.vibrationToggle.textContent=vibrationAvailable?(vibrationEnabled?'📳 진동 ON':'🔕 진동 OFF'):'🔕 진동 미지원';
 ui.vibrationToggle.disabled=!vibrationAvailable;
 ui.vibrationToggle.setAttribute('aria-pressed',String(vibrationAvailable&&vibrationEnabled));
}
function vibrate(pattern){
 if(!vibrationEnabled||!vibrationAvailable)return;
 try{navigator.vibrate(pattern);}catch{}
}
let best=savedBest(),run=null,lastJumpAt=null,startedAt=null,frame=0,jumpClear=null,flashClear=null,runId=0;
function nickname(){
 const v=ui.nickname?.value.trim().replace(/\s+/g,' ').slice(0,12)||'개구리';
 return /^[\p{L}\p{N}_ .-]{1,12}$/u.test(v)?v:'개구리';
}
function showLeader(leader){
 if(!ui.leader)return;
 ui.leader.textContent=leader?leader.name+' · '+leader.score+'점':'아직 기록 없음 · 첫 1위에 도전!';
}
async function loadLeader(){
 if(typeof fetch!=='function'){showLeader(null);return;}
 try{
  const res=await fetch('/api/jump/leader',{cache:'no-store'});
  if(!res.ok)throw Error('랭킹 서버 응답 오류');
  const data=await res.json();
  showLeader(data.leader);
 }catch{
  if(ui.leader)ui.leader.textContent='랭킹 서버 연결 대기 중';
 }
}
async function submitLeader(score){
 if(!score||typeof fetch!=='function')return;
 try{
  const res=await fetch('/api/jump/leader',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({name:nickname(),score})
  });
  if(!res.ok)throw Error('기록 전송에 실패했습니다.');
  const data=await res.json();
  showLeader(data.leader);
 }catch{
  if(ui.leader)ui.leader.textContent='기록 저장 실패 · 재접속 후 다시 확인';
 }
}

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
function updateTime(remainingMs,limitMs=E.timeLimitMs(run?.score||0)){
 const left=Math.max(0,remainingMs);
 ui.jumpGauge.style.width=(left/limitMs*100)+'%';
 ui.jumpGauge.classList.toggle('urgent',left<=Math.min(300,limitMs*.3));
}
function updateTotalTime(remainingMs){
 const left=Math.max(0,remainingMs);
 ui.totalTimer.innerHTML=(left/1000).toFixed(1)+'<small>s</small>';
 ui.totalFill.style.width=(left/E.TOTAL_DURATION_MS*100)+'%';
 const urgent=left<=5000;
 ui.totalFill.classList.toggle('urgent',urgent);
 ui.totalPanel.classList.toggle('urgent',urgent);
}
function timeoutReason(now){
 if(startedAt!==null&&now-startedAt>=E.TOTAL_DURATION_MS)return 'total';
 if(lastJumpAt!==null&&now-lastJumpAt>=E.timeLimitMs(run.score))return 'time';
 return null;
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
 if(result==='time')vibrate([60,45,60]);
 else if(result==='total')vibrate(150);
 E.expire(run);
 if(result==='miss')run.result='miss';
 cancelAnimationFrame(frame);
 frame=0;
 persistBest(run.score);
 void submitLeader(run.score);
 setControls(false);
 const score=run.score;
 const reason=result==='miss'?'발판을 놓쳤어요!':result==='total'?'30초 종료!':'점프 시간 초과!';
 const desc=result==='miss'?'잘못된 방향으로 점프했어요. 다시 도전할까요?':result==='total'?'전체 제한시간 30초가 끝났어요.':'다음 발판으로 제시간에 이동하지 못했어요. 다시 도전하세요!';
 showOverlay({title:reason,icon:result==='miss'?'💥':'🏁',message:desc,summary:'이번 기록 '+score+'점 · 최고 기록 '+best+'점',button:'다시 도전'});
}
function ticker(){
 if(!run||run.ended||lastJumpAt===null)return;
 const limit=E.timeLimitMs(run.score);
 const now=clock();
 const remaining=limit-(now-lastJumpAt);
 const totalRemaining=E.TOTAL_DURATION_MS-(now-startedAt);
 updateTime(remaining,limit);
 updateTotalTime(totalRemaining);
 const reason=timeoutReason(now);
 if(reason){finish(reason);return;}
 frame=requestAnimationFrame(ticker);
}
function start(){
 runId++;
 cancelAnimationFrame(frame);frame=0;
 clearEffects();
 run=E.newRun();
 try{localStorage.setItem('game-club:split-jump-name',nickname());}catch{}
 lastJumpAt=null;
 startedAt=null;
 paintPath();paintScore();updateTime(E.timeLimitMs(0));updateTotalTime(E.TOTAL_DURATION_MS);hideOverlay();setControls(true);
}
function hop(side){
 // 입력을 즉시 적용한다. 점프 애니메이션은 독립적이며 다음 조작을 차단하지 않는다.
 if(!run||run.ended)return false;
 const now=clock();
 const reason=timeoutReason(now);
 if(reason){
  if(reason==='time')updateTime(0);
  if(reason==='total')updateTotalTime(0);
  finish(reason);return false;
 }
 if(side!=='left'&&side!=='right')return false;
 const answer=E.jump(run,side);
 if(answer.reason==='invalid')return false;
 if(jumpClear!==null){clearTimeout(jumpClear);jumpClear=null;}
 ui.avatar.classList.remove('jumping','to-left','to-right');
 void ui.avatar.offsetWidth;
 ui.avatar.classList.add('jumping',side==='left'?'to-left':'to-right');
 if(answer.ok){
  if(startedAt===null)startedAt=now;
  lastJumpAt=now;
  if(frame===0)frame=requestAnimationFrame(ticker);
  updateTime(E.timeLimitMs(run.score));
  updateTotalTime(E.TOTAL_DURATION_MS-(now-startedAt));
  vibrate(20);
  paintPath();paintScore();persistBest(run.score);setFlash('+1');
 }else{
  vibrate(100);
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
ui.vibrationToggle.addEventListener('click',()=>{
 if(!vibrationAvailable)return;
 vibrationEnabled=!vibrationEnabled;
 try{localStorage.setItem(VIBRATION_KEY,vibrationEnabled?'on':'off');}catch{}
 if(!vibrationEnabled)try{navigator.vibrate(0);}catch{}
 paintVibrationToggle();
});
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
 const reason=timeoutReason(clock());
 if(reason)finish(reason);
});
paintVibrationToggle();
ui.best.textContent=String(best);
try{ui.nickname.value=localStorage.getItem('game-club:split-jump-name')||'개구리';}catch{}
void loadLeader();
updateTime(E.timeLimitMs(0));
updateTotalTime(E.TOTAL_DURATION_MS);
paintScore();
showOverlay({title:'갈림길 점프',icon:'🐸',
 message:'전체 30초! 개구리 머리 위 게이지가 바닥나기 전에 다음 발판으로 점프하세요.',
 summary:null,button:'게임 시작'});
// 테스트 전용 경량 인터페이스. 실제 게임 동작에는 영향 없음.
if(typeof window!=='undefined')window.__splitJump={start,hop,getState:()=>run};
})();