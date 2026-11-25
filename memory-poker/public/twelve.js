'use strict';
const E=window.TwelveEngine,root=document.querySelector('#twelveApp'),toast=document.querySelector('#twelveToast');
let mode=null,state=null,room=null,token=null,stream=null,difficulty='normal',human=0,selected=null,pending=null,thinking=false,cpuTimer=null,soloHistory=[];
let soundEnabled=true,stoneAudio=null,stoneNoise=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const name=i=>i===0?'청팀':'홍팀';
// 브라우저가 지원하면 실제 돌 장기알이 나무판에 닿는 짧은 합성 타격음을 재생.
function audioContext(){
 if(!soundEnabled)return null;
 const A=window.AudioContext||window.webkitAudioContext;
 if(!A)return null;
 if(!stoneAudio)stoneAudio=new A();
 if(stoneAudio.state==='suspended'&&stoneAudio.resume){
  const ready=stoneAudio.resume();if(ready?.catch)ready.catch(()=>{});
 }
 return stoneAudio;
}
function unlockSound(){try{audioContext();}catch{}}
function playStoneSound(){
 if(!soundEnabled)return;
 try{
  const ac=audioContext();if(!ac)return;
  const t=ac.currentTime+.005;
  if(!stoneNoise){
   const length=Math.max(1,Math.floor(ac.sampleRate*.085));
   stoneNoise=ac.createBuffer(1,length,ac.sampleRate);
   const samples=stoneNoise.getChannelData(0);
   for(let i=0;i<length;i++)samples[i]=(Math.random()*2-1)*Math.pow(1-i/length,2);
  }
  const noise=ac.createBufferSource(),band=ac.createBiquadFilter(),gain=ac.createGain();
  band.type='bandpass';band.frequency.value=1450;band.Q.value=.9;
  gain.gain.setValueAtTime(.0001,t);
  gain.gain.exponentialRampToValueAtTime(.24,t+.003);
  gain.gain.exponentialRampToValueAtTime(.0001,t+.064);
  noise.buffer=stoneNoise;noise.connect(band);band.connect(gain);gain.connect(ac.destination);
  noise.start(t);noise.stop(t+.068);
  const resonance=ac.createOscillator(),low=ac.createGain();
  resonance.type='triangle';resonance.frequency.setValueAtTime(275,t);
  resonance.frequency.exponentialRampToValueAtTime(125,t+.045);
  low.gain.setValueAtTime(.065,t);low.gain.exponentialRampToValueAtTime(.0001,t+.052);
  resonance.connect(low);low.connect(ac.destination);resonance.start(t);resonance.stop(t+.055);
 }catch{/* 오디오 미지원 또는 차단 상태에서도 대국 진행 */}
}
function warn(m){toast.textContent=m;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),3300);}
function head(){return '<header class="header"><a class="brand" href="/">♜ TWELVE SHOGI</a><small>BROWN TABLE · 3 × 4</small></header>';}
function clearChoice(){selected=null;pending=null;}
function game(){return mode==='solo'?state:state?.game;}
function side(){return mode==='solo'?human:state?.side;}
function canMove(){const s=game();return !!s&&s.winner===null&&s.turn===side()&&!thinking&&(mode!=='online'||!state?.undo);}
async function request(path,data={},auth=true){
 const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
 const result=await res.json();if(!res.ok)throw Error(result.error||'요청에 실패했습니다.');return result;
}
function landing(join=null){
 mode=null;state=null;clearChoice();thinking=false;soloHistory=[];
 root.innerHTML=head()+'<section class="card hero"><div><span class="kicker">THE BROWN TABLE</span>'+
 '<h1>열두 칸 위의<br><span style="color:#eec78b">지략 대결.</span></h1>'+
 '<p class="muted">왕·장·상·자, 그리고 승격되는 후. 작은 말판에서 벌어지는 치열한 두뇌 대결.</p>'+
 '<div class="intro-items"><span class="pill">4 × 3 말판</span><span class="pill">자 → 후 승격</span><span class="pill">포로 말 다시 놓기</span></div></div>'+
 '<div class="mini-board" aria-hidden="true">'+['상','王','장','','','자','','','','','',''].map(c=>'<span>'+c+'</span>').join('')+'</div></section>'+
 '<div class="home-options"><section class="card"><span class="kicker">SOLO MODE</span><h2>컴퓨터와 대결</h2>'+
 '<p class="muted">난이도와 선공·후공을 선택할 수 있어요.</p>'+
 '<label for="difficulty">컴퓨터 난이도</label><select id="difficulty" class="field">'+
 '<option value="easy">쉬움</option><option value="normal" selected>보통</option><option value="hard">어려움</option></select>'+
 '<label for="side">내 진영</label><select id="side" class="field"><option value="0">청팀 · 선공</option><option value="1">홍팀 · 후공</option></select>'+
 '<button class="btn primary" data-action="soloStart">혼자 하기 →</button></section>'+
 '<section class="card"><span class="kicker">ONLINE 1 VS 1</span><h2>친구와 대결</h2>'+
 '<p class="muted">6자리 초대 코드로 친구와 실시간 대국을 즐겨요.</p>'+
 '<form id="roomForm"><label>닉네임</label><input id="nick" class="field" maxlength="16" required value="'+esc(localStorage.getItem('twelve:name')||'')+'">'+
 (join?'<p class="muted">참가할 방 '+esc(join)+'</p>':'')+
 '<button class="btn primary" type="submit">'+(join?'초대 방 참가':'새 게임방 만들기')+'</button></form>'+
 (!join?'<form id="codeForm"><label>방 코드 입력</label><input id="code" class="field" maxlength="6" required>'+
 '<button class="btn" type="submit">코드로 참가하기</button></form>':'')+'</section></div>';
 document.querySelector('#roomForm').onsubmit=async e=>{
  e.preventDefault();const nickname=document.querySelector('#nick').value.trim();
  try{const data=await request(join?'/api/twelve/join':'/api/twelve/create',join?{room:join,name:nickname}:{name:nickname},false);
   localStorage.setItem('twelve:name',nickname);await enter(data.room,data.token);
  }catch(err){warn(err.message);}
 };
 const form=document.querySelector('#codeForm');
 if(form)form.onsubmit=e=>{e.preventDefault();const id=document.querySelector('#code').value.trim().toUpperCase();
  if(!/^[A-Z2-9]{6}$/.test(id))return warn('6자리 코드를 입력해 주세요.');
  location.href='/twelve/r/'+id;
 };
}
function startSolo(){
 if(stream){stream.close();stream=null;}clearTimeout(cpuTimer);
 mode='solo';human=Number(document.querySelector('#side').value);difficulty=document.querySelector('#difficulty').value;
 soloHistory=[];state=E.fresh(0);room=null;token=null;thinking=false;clearChoice();
 history.replaceState(null,'','/twelve');render();cpuMove();
}
async function enter(code,key){
 if(stream){stream.close();stream=null;}clearTimeout(cpuTimer);
 mode='online';state=null;room=code;token=key;thinking=false;clearChoice();
 localStorage.setItem('twelve:token:'+code,key);
 history.replaceState(null,'','/twelve/r/'+code);
 root.innerHTML=head()+'<section class="card">온라인 방에 연결 중…</section>';
 try{const res=await fetch('/api/twelve/rooms/'+code+'?token='+encodeURIComponent(key),{cache:'no-store'});
  const data=await res.json();if(!res.ok)throw Error(data.error||'방을 찾지 못했습니다.');
  accept(data);
 }catch(err){warn(err.message);localStorage.removeItem('twelve:token:'+code);return landing(code);}
 stream=new EventSource('/api/twelve/rooms/'+code+'/stream?token='+encodeURIComponent(key));
 stream.addEventListener('state',e=>{try{accept(JSON.parse(e.data));}catch(err){console.error(err);}});
}
function accept(value){
 if(value.room!==room)return;
 // 무르기·준비 변경 및 중복 이벤트에는 착수 소리를 내지 않는다.
 const committed=!!state?.game&&!!value.game&&value.game.ply>state.game.ply;
 if(!state||state.revision!==value.revision||state.stage!==value.stage)clearChoice();
 state=value;render();
 if(committed)playStoneSound();
}
function auxiliaryButtons(){
 return mode==='online'?'<button class="btn" data-action="copy">초대 링크</button><button class="btn alert" data-action="leave">방 나가기</button>':
 '<button class="btn" data-action="home">모드 선택</button><button class="btn" data-action="soloNew">새 대국</button>';
}
function lobby(){
 const p=state.players,full=p.length===2&&p.every(x=>x.ready);
 return head()+'<section class="card"><span class="kicker">INVITE CODE</span><h2>'+esc(state.room)+'</h2>'+
 '<div class="actions">'+auxiliaryButtons()+'</div><p class="muted">두 사람 모두 준비한 뒤 방장이 시작합니다.</p>'+
 '<div class="home-options">'+[0,1].map(i=>'<div class="card" style="margin:0"><span class="kicker">'+name(i)+'</span>'+
 '<h3>'+esc(p[i]?.name||'참가 대기 중')+'</h3><p class="muted">'+(p[i]?.ready?'✓ 준비 완료':'준비 전')+'</p></div>').join('')+'</div>'+
 '<div class="actions"><button class="btn" data-action="ready">'+(p[state.side]?.ready?'준비 취소':'준비 완료')+'</button>'+
 (state.side===0?'<button class="btn primary" data-action="start" '+(!full?'disabled':'')+'>대국 시작</button>':'<span class="muted">방장의 시작을 기다리는 중</span>')+
 '</div></section>';
}
function moves(){
 const s=game(),me=side();if(!selected||!s||s.turn!==me)return [];
 return E.legal(s,me).filter(m=>selected.kind==='move'?m.kind==='move'&&m.from===selected.from:m.kind==='drop'&&m.type===selected.type);
}
function board(){
 const s=game(),targets=new Set(moves().map(m=>m.to));
 // 규칙상의 4열×3행을 화면에서는 90도 돌려 3열×4행으로 배치.
 // 어느 진영이든 자기 말을 아래쪽에서 바라보도록 진영에 따라 180도 추가 회전.
 const viewer=side();
 const indices=Array.from({length:E.N},(_,slot)=>{
  const row=Math.floor(slot/E.H),col=slot%E.H;
  return E.index(viewer===1?row:E.W-1-row,viewer===1?E.H-1-col:col);
 });
 return '<div class="table-area"><div class="board viewer-side'+viewer+'" role="grid" aria-label="짧은 변에서 바라보는 세로 3열 4행 십이장기 말판">'+indices.map(i=>{
  const p=s.board[i];
  const isSelected=selected?.kind==='move'&&selected.from===i,possible=targets.has(i);
  const victorious=!!p&&p.type==='K'&&s.winner===p.owner;
  const threatened=!!p&&p.type==='K'&&!victorious&&E.kingThreatened(s,p.owner);
  return '<button class="cell '+(i%4===0?'camp0 ':i%4===3?'camp1 ':'')+(isSelected?'selected ':'')+
   (possible?'legal ':'')+(pending?.to===i?'move-preview ':'')+(threatened?'king-under-threat ':'')+(victorious?'king-victorious ':'')+(s.last&&(s.last.to===i||s.last.from===i)?'last ':'')+
   '" data-action="square" data-index="'+i+'" role="gridcell" aria-label="'+(i+1)+'번 칸'+(p?' '+name(p.owner)+' '+E.LABELS[p.type]:'')+(pending?.to===i?' · 다시 누르면 이동 확정':'')+'">'+
   (p?'<div class="piece owner'+p.owner+(p.type==='H'?' promoted':'')+(isSelected?' selectedPiece':'')+(threatened?' danger':'')+(victorious?' victorious':'')+'">'+
   (p.type==='K'?E.TYPES.K:E.LABELS[p.type])+'<small>'+E.LABELS[p.type]+'</small></div>':'')+
   (possible&&!p?'<span class="dot"></span>':'')+'</button>';
 }).join('')+'</div>'+
 '<div class="table-legend"><span style="color:#a5d9e7">● 청팀</span><span>자 → 후 자동 승격</span>'+
 '<span style="color:#fac5b7">● 홍팀</span></div></div>';
}
function hand(sideIndex){
 const s=game(),unique=[...new Set(s.hands[sideIndex])];
 return '<div class="hands">'+(unique.length?unique.map(type=>{
  const count=s.hands[sideIndex].filter(x=>x===type).length;
  return '<button class="hand '+(selected?.kind==='drop'&&selected.type===type?'selected':'')+
   '" data-action="hand" data-type="'+type+'" data-side="'+sideIndex+'" '+
   (!canMove()||sideIndex!==side()?'disabled':'')+'>'+(type==='K'?E.TYPES.K:E.LABELS[type])+(count>1?' ×'+count:'')+'</button>';
 }).join(''):'<span class="muted">잡은 말 없음</span>')+'</div>';
}
function soundControls(){
 return '<div class="actions"><button class="btn sound-toggle" data-action="toggleSound" aria-pressed="'+soundEnabled+'">'+
 (soundEnabled?'🔊 착수 효과음 켜짐':'🔇 착수 효과음 꺼짐')+'</button></div>';
}
function undoControls(){
 if(mode==='solo'){
  return '<div class="actions undo-actions"><button class="btn" data-action="undo" '+(soloHistory.length?'':'disabled')+'>↩ 무르기 · 자동 수락</button></div>';
 }
 if(!state)return '';
 const req=state.undo;
 if(req){
  if(req.requester===state.side)return '<div class="undo-prompt"><strong>무르기 요청을 보냈습니다.</strong><p class="muted">상대가 수락하면 직전 수로 돌아갑니다.</p><button class="btn" data-action="undoCancel">요청 취소</button></div>';
  return '<div class="undo-prompt"><strong>상대가 직전 수 무르기를 요청했습니다.</strong><p class="muted">수락하면 직전 수가 취소되고 그 수를 둔 플레이어 차례로 돌아갑니다.</p><div class="actions"><button class="btn primary" data-action="undoAccept">수락</button><button class="btn alert" data-action="undoDecline">거절</button></div></div>';
 }
 return '<div class="actions undo-actions"><button class="btn" data-action="undo" '+(state.canUndo?'':'disabled')+'>↩ 상대에게 무르기 요청</button></div>';
}
function view(){
 const s=game(),me=side(),winner=s.winner;
 const names=mode==='online'?state.players.map(x=>x.name):human===0?['나','컴퓨터']:['컴퓨터','나'];
 const banner=state?.undo&&mode==='online'?'무르기 요청을 확인하는 중입니다':winner!==null?(winner===me?'🏆 승리!':'패배'):thinking?'컴퓨터가 수를 고민 중입니다':s.turn===me?'내 차례 · 말을 선택하세요':'상대 차례입니다';
 return head()+'<div class="status '+(s.turn===0?'blue':'red')+'">'+esc(banner)+
 '<span style="float:right;font-size:12px">제 '+(s.ply+1)+'수</span></div>'+
 '<div class="game-layout"><section>'+board()+'</section><aside class="panel-side"><section class="card">'+
 '<span class="kicker">MATCH INFO</span><h2>'+(mode==='solo'?'컴퓨터 · '+({easy:'쉬움',normal:'보통',hard:'어려움'}[difficulty]):'온라인 1대1')+'</h2>'+
 [0,1].map(i=>'<div class="scoreline"><b style="color:'+(i===0?'#a5d9e7':'#fac5b7')+'">'+name(i)+'</b>'+
 '<span>'+esc(names[i]||name(i))+(me===i?' · 나':'')+'</span></div><h3>'+name(i)+'의 잡은 말</h3>'+hand(i)).join('')+
 (pending?'<div class="pending-move"><span>'+(pending.kind==='drop'?'포로 말 내려놓기':'말 이동')+' · <b>노란 목적지 칸을 한 번 더 누르면 확정됩니다.</b></span><button class="btn" data-action="cancel">선택 취소</button></div>':'')+undoControls()+
 '</section><section class="card"><span class="kicker">QUICK RULES</span>'+
 '<p class="muted">왕: 모든 방향, 장: 상하좌우, 상: 대각선, 자: 앞으로 한 칸. 자가 상대 진영에 도착하면 후로 승격됩니다.</p>'+
 '<p class="muted">상대 왕을 잡거나 자신의 왕이 상대 진영에서 한 턴 버티면 승리. 잡은 말은 빈 칸에 다시 놓을 수 있습니다. 빨간 테두리는 왕이 공격받는 상태입니다.</p><p class="muted">말 선택 → 목적지 클릭(예상 표시) → 같은 목적지 다시 클릭(이동 확정). 무르기는 온라인 상대 수락 시, 혼자 하기에서는 즉시 적용됩니다.</p>'+
 soundControls()+'<div class="actions">'+auxiliaryButtons()+'</div>'+
 (winner!==null?'<div class="winner"><strong>'+(winner===me?'내가 승리했습니다!':'상대방 승리')+'</strong>'+
 (mode==='solo'?'<div class="actions"><button class="btn primary" data-action="soloNew">다시 하기</button></div>':
 state.side===0?'<div class="actions"><button class="btn primary" data-action="restart">재경기 준비</button></div>':'')+'</div>':'')+
 '</section></aside></div>';
}
function render(){
 if(mode==='online'&&state?.stage==='lobby')root.innerHTML=lobby();
 else if(game())root.innerHTML=view();
}
function cpuMove(){
 clearTimeout(cpuTimer);
 if(mode!=='solo'||!state||state.winner!==null||state.turn===human)return;
 thinking=true;render();
 cpuTimer=setTimeout(()=>{
  if(mode!=='solo'||state.winner!==null||state.turn===human)return;
  try{const choice=E.computerMove(state,difficulty);if(choice){state=E.apply(state,choice);playStoneSound();}
   thinking=false;clearChoice();render();if(state.winner===null&&state.turn!==human)cpuMove();
  }catch(err){thinking=false;warn(err.message);}
 },440);
}
function square(i){
 const s=game();if(!canMove())return;
 const target=moves().find(m=>m.to===i);
 if(target){
  if(pending&&E.sameMove(pending,target))return confirm();
  pending=target;render();return;
 }
 if(s.board[i]?.owner===side()){selected={kind:'move',from:i};pending=null;render();return;}
 clearChoice();render();
}
async function confirm(){
 if(!pending||!canMove())return;
 const move={...pending};clearChoice();
 try{
  if(mode==='solo'){
   const next=E.apply(state,move);
   soloHistory.push(JSON.parse(JSON.stringify(state)));
   state=next;render();playStoneSound();cpuMove();
  }
  else await request('/api/twelve/rooms/'+room+'/move',{move});
 }catch(err){warn(err.message);render();}
}
async function action(type,el){
 try{
  if(type==='soloStart')return startSolo();
  if(type==='soloNew'){clearTimeout(cpuTimer);soloHistory=[];state=E.fresh(0);thinking=false;clearChoice();render();return cpuMove();}
  if(type==='home'){clearTimeout(cpuTimer);if(stream){stream.close();stream=null;}mode=null;state=null;history.replaceState(null,'','/twelve');return landing();}
  if(type==='square')return square(Number(el.dataset.index));
  if(type==='hand'){if(!canMove()||Number(el.dataset.side)!==side())return;
   selected={kind:'drop',type:el.dataset.type};pending=null;return render();}
  if(type==='toggleSound'){soundEnabled=!soundEnabled;if(soundEnabled)unlockSound();return render();}
  if(type==='cancel'){clearChoice();return render();}
  if(type==='undo'&&mode==='solo'){
   if(!soloHistory.length)return;
   clearTimeout(cpuTimer);
   state=soloHistory.pop();thinking=false;clearChoice();render();return;
  }
  if(mode!=='online')return;
  const api='/api/twelve/rooms/'+room+'/';
  if(type==='copy'){
   const link=location.origin+'/twelve/r/'+room;
   try{await navigator.clipboard.writeText(link);warn('초대 링크 복사 완료');}catch{prompt('초대 링크',link);}
   return;
  }
  if(type==='leave'){await request(api+'leave');localStorage.removeItem('twelve:token:'+room);stream?.close();location.href='/twelve';return;}
  if(type==='undo')return await request(api+'undo-request');
  if(type==='undoCancel')return await request(api+'undo-cancel');
  if(type==='undoAccept'||type==='undoDecline')return await request(api+'undo-response',{accept:type==='undoAccept'});
  if(type==='ready')return await request(api+'ready',{ready:!state.players[state.side].ready});
  if(type==='start'||type==='restart')return await request(api+type);
 }catch(err){warn(err.message);}
}
root.addEventListener('pointerdown',unlockSound,{passive:true});
if(typeof document.addEventListener==='function')document.addEventListener('keydown',unlockSound,{passive:true});
root.addEventListener('click',e=>{
 const target=e.target.closest('[data-action]');
 if(target)action(target.dataset.action,target);
 else if(selected||pending){clearChoice();render();}
});
(function init(){
 const match=location.pathname.match(/^\/twelve\/r\/([A-Z2-9]{6})\/?$/i);
 if(!match)return landing();
 const id=match[1].toUpperCase(),key=localStorage.getItem('twelve:token:'+id);
 if(key)enter(id,key);else landing(id);
})();
