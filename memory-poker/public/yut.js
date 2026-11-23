'use strict';
const app=document.querySelector('#yutApp'),toastBox=document.querySelector('#yutToast');
const POS={0:[540,540],20:[140,460],21:[220,380],22:[300,300],23:[380,220],24:[460,140],
 25:[140,140],26:[220,220],27:[380,380],28:[460,460]};
for(let i=1;i<=5;i++)POS[i]=[540-96*i,540];
for(let i=6;i<=10;i++)POS[i]=[60,540-96*(i-5)];
for(let i=11;i<=15;i++)POS[i]=[60+96*(i-10),60];
for(let i=16;i<=19;i++)POS[i]=[540,60+96*(i-15)];
const MODE_NAMES={'1v1':'1대1','1v2':'1대2','2v2':'2대2'};
const TEAM_NAMES=['청팀','홍팀'];
let state=null,access=null,code=null,stream=null,draft=[],selectedPiece=null,notifyTimer=null;
function esc(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function notice(msg){toastBox.textContent=msg;toastBox.classList.add('show');clearTimeout(notifyTimer);notifyTimer=setTimeout(()=>toastBox.classList.remove('show'),3200);}
function topbar(info='THE WHITE TABLE'){return '<header class="yt-header"><a class="yt-logo" href="/"><span class="yt-symbol">❖</span> STRATEGY YUT</a><span class="yt-sub">'+info+'</span></header>';}
async function post(url,data={},authorized=true){
 const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer '+access}:{})},body:JSON.stringify(data)});
 let value;try{value=await res.json();}catch{throw Error('게임 서버 응답을 확인하지 못했습니다.');}
 if(!res.ok)throw Error(value.error||'요청에 실패했습니다.');return value;
}
function landing(joinCode=null){
 state=null;const nickname=esc(localStorage.getItem('yut:name')||'');
 app.innerHTML=topbar('THINK BEFORE YOU THROW')+
 '<section class="yt-card yt-hero"><div><span class="yt-kicker">THINK · PREDICT · MOVE</span><h1>운이 아닌<br><span style="color:#657e9b">선택으로 던지는 윷.</span></h1>'+
 '<p class="yt-muted">네 개의 윷을 앞면 또는 뒷면으로 선택하고, 상대의 의도를 읽어 팀의 말을 먼저 완주시키세요. 하얀 테이블에서 펼쳐지는 심리전.</p>'+
 '<p class="yt-small"><span class="yt-pill">1대1</span> <span class="yt-pill">1대2</span> <span class="yt-pill">2대2</span> <span class="yt-pill">말 2개·4개 선택</span></p></div>'+
 '<div class="yt-hero-art"><div class="yt-preview"><div>❖</div></div></div></section>'+
 '<section class="yt-card" style="max-width:620px;margin:0 auto"><span class="yt-kicker">'+(joinCode?'JOIN WHITE TABLE':'CREATE WHITE TABLE')+'</span>'+
 '<h2>'+(joinCode?'친구의 게임에 참가':'전략 윷놀이 방 만들기')+'</h2>'+
 (joinCode?'<p class="yt-muted">방 코드 <strong>'+esc(joinCode)+'</strong></p>':'')+
 '<form id="ytEntry"><label class="yt-label" for="ytName">닉네임</label><input id="ytName" class="yt-input" required maxlength="16" autocomplete="nickname" value="'+nickname+'" placeholder="닉네임">'+
 '<div class="yt-actions"><button class="yt-btn primary full" type="submit">'+(joinCode?'방에 참가하기':'새 게임방 만들기')+' →</button></div></form>'+
 (joinCode?'<a href="/yut">← 게임 선택으로 돌아가기</a>':
 '<hr style="border:0;border-top:1px solid #dde6e7;margin:20px 0"><form id="ytCodeEntry"><label for="ytJoinCode" class="yt-label">초대 코드로 참가하기</label>'+
 '<input id="ytJoinCode" class="yt-input" maxlength="6" required placeholder="6자리 코드"><div class="yt-actions"><button type="submit" class="yt-btn">코드로 참가하기</button></div></form>')+'</section>';
 document.querySelector('#ytEntry').addEventListener('submit',async e=>{
  e.preventDefault();const name=document.querySelector('#ytName').value.trim();if(!name)return notice('닉네임을 입력해 주세요.');
  try{const data=await post(joinCode?'/api/yut/join':'/api/yut/create',joinCode?{room:joinCode,name}:{name},false);
   localStorage.setItem('yut:name',name);await enter(data.room,data.token);
  }catch(err){notice(err.message);}
 });
 if(!joinCode)document.querySelector('#ytCodeEntry').addEventListener('submit',e=>{
  e.preventDefault();const raw=document.querySelector('#ytJoinCode').value.trim().toUpperCase();
  if(!/^[A-Z2-9]{6}$/.test(raw))return notice('올바른 6자리 방 코드를 입력해 주세요.');
  location.href='/yut/r/'+raw;
 });
}
async function enter(roomCode,token){
 if(stream){stream.close();stream=null;}state=null;code=roomCode;access=token;draft=[];selectedPiece=null;
 localStorage.setItem('yut:token:'+roomCode,token);history.replaceState(null,'','/yut/r/'+roomCode);
 app.innerHTML=topbar()+'<section class="yt-card">하얀 테이블에 연결 중…</section>';
 try{
  const res=await fetch('/api/yut/rooms/'+roomCode+'?token='+encodeURIComponent(token),{cache:'no-store'});
  const data=await res.json();if(!res.ok)throw Error(data.error||'방에 입장하지 못했습니다.');
  if(code!==roomCode||access!==token)return;apply(data);
 }catch(err){
  notice(err.message);localStorage.removeItem('yut:token:'+roomCode);code=null;access=null;return landing(roomCode);
 }
 stream=new EventSource('/api/yut/rooms/'+roomCode+'/stream?token='+encodeURIComponent(token));
 stream.addEventListener('state',e=>{try{apply(JSON.parse(e.data));}catch(err){console.error(err);}});
 stream.onerror=()=>{const el=document.querySelector('#ytConnection');if(el)el.textContent='재연결 중…';};
}
function apply(next){
 if(next.room!==code)return;
 const mine=next.players.find(p=>p.id===next.viewerId);
 if(!state||state.stage!==next.stage||state.round!==next.round||mine?.submitted)selectedPiece=null;
 if(!state||state.stage!==next.stage||state.round!==next.round)draft=Array(mine?.stickCount||0).fill(null);
 state=next;
 if(mine?.stickCount!==draft.length)draft=Array(mine?.stickCount||0).fill(null);
 render();
}
function lobby(){
 const host=state.viewerId===state.hostId,team0=state.players.filter(p=>p.team===0),team1=state.players.filter(p=>p.team===1),needed={'1v1':2,'1v2':3,'2v2':4}[state.mode];
 return topbar('WHITE TABLE · LOBBY')+
 '<section class="yt-card"><div class="yt-actions" style="justify-content:space-between;margin-top:0">'+
 '<div><span class="yt-kicker">INVITE CODE</span><h2 style="letter-spacing:.18em;color:#997e47">'+esc(state.room)+'</h2></div>'+
 '<div class="yt-actions"><button class="yt-btn" data-action="copy">초대 링크 복사</button><button class="yt-btn" data-action="leave">나가기</button></div></div>'+
 '<p class="yt-muted">2개 팀이 각자 윷 2개씩 선택합니다. 모든 선택이 모이면 윷 결과가 공개돼요.</p>'+
 '<div class="yt-grid"><div><span class="yt-kicker">TABLE RULES</span><h3>대전 설정</h3>'+
 '<div class="yt-input-row"><div><label for="ytMode" class="yt-label">대전 인원</label><select id="ytMode" class="yt-input" '+(host?'':'disabled')+'>'+
 Object.entries(MODE_NAMES).map(([v,n])=>'<option value="'+v+'" '+(state.mode===v?'selected':'')+'>'+n+'</option>').join('')+
 '</select></div><div><label for="ytCount" class="yt-label">팀당 말 수</label><select id="ytCount" class="yt-input" '+(host?'':'disabled')+'>'+
 [2,4].map(v=>'<option value="'+v+'" '+(state.pieceCount===v?'selected':'')+'>'+v+'개</option>').join('')+'</select></div></div>'+
 '<div class="yt-actions">'+(host?'<button class="yt-btn secondary" data-action="configure">설정 적용</button>':'<span class="yt-small">방장이 대전 규칙을 설정합니다.</span>')+'</div>'+
 '<p class="yt-muted">전략 윷 선택은 각 팀마다 2개씩, 총 4개입니다. 말은 팀 단위로 움직입니다. 도는 뒷도, 윷·모와 말 잡기는 추가 기회를 줍니다.</p></div>'+
 '<div><span class="yt-kicker">PLAYERS · '+state.players.length+' / '+needed+'</span>'+
 [team0,team1].map((team,i)=>'<h3><span class="yt-dot '+(i?'red':'')+'"></span>'+TEAM_NAMES[i]+'</h3>'+
 (team.length?team.map(p=>'<div class="yt-member"><div><b>'+esc(p.name)+(p.id===state.viewerId?' · 나':'')+'</b><div class="yt-member-team">윷 '+p.stickCount+'개 선택</div></div><small>'+(p.ready?'✓ 준비 완료':'준비 전')+'</small></div>').join(''):'<p class="yt-muted">참가 대기 중</p>')).join('')+
 '</div></div><div class="yt-actions">'+
 '<button data-action="ready" class="yt-btn '+(state.players.find(p=>p.id===state.viewerId)?.ready?'secondary':'primary')+'">'+
 (state.players.find(p=>p.id===state.viewerId)?.ready?'준비 취소':'준비 완료')+'</button>'+
 (host?'<button class="yt-btn primary" data-action="start" '+(state.players.length===needed&&state.players.every(p=>p.ready)?'':'disabled')+'>게임 시작 →</button>':'')+
 '</div></section>';
}
function boardSvg(){
 const outer=[0,...Array.from({length:19},(_,i)=>i+1),0].map(i=>POS[i].join(',')).join(' ');
 const paths=[[5,20,21,22,23,24,15],[10,25,26,22,27,28,0]];
 const background='<polyline class="yt-board-path" points="'+outer+'"></polyline>'+
 paths.map(path=>'<polyline class="yt-board-path" points="'+path.map(i=>POS[i].join(',')).join(' ')+'"></polyline>').join('');
 const nodes=Object.entries(POS).map(([id,[x,y]])=>{
  const n=Number(id),special=[0,5,10,15,22].includes(n);
  const caption=n===0?'출/골':n===22?'중앙':n===5?'①':n===10?'②':n===15?'③':'';
  return '<g transform="translate('+x+','+y+')"><circle r="'+(special?20:16)+'" class="yt-node '+(n===22?'center':special?'corner':'')+'"></circle>'+
  (caption?'<text class="yt-node-label" y="1">'+caption+'</text>':'')+'</g>';
 }).join('');
 const grouped=new Map();
 for(const piece of state.pieces.filter(p=>p.status==='board')){
  const pos=piece.path.at(-1),key=String(pos)+':'+piece.team;
  if(!grouped.has(key))grouped.set(key,[]);
  grouped.get(key).push(piece);
 }
 const figures=[...grouped.entries()].map(([key,arr])=>{
  const piece=arr[0],node=piece.path.at(-1),[x,y]=POS[node]||[0,0];
  const side=piece.team===0?-14:14,allowed=state.legalMoves.some(o=>arr.some(p=>p.id===o.pieceId));
  return '<g class="yt-piece team'+piece.team+(allowed?' clickable':'')+(arr.some(p=>p.id===selectedPiece)?' selected':'')+'" data-piece="'+piece.id+'" transform="translate('+(x+side)+','+y+')">'+
   '<circle r="17"></circle><text y="1">'+(arr.length>1?arr.length:'●')+'</text></g>';
 }).join('');
 let markers='';
 if(selectedPiece){
  const selections=state.legalMoves.filter(o=>o.pieceId===selectedPiece);
  markers=selections.map((v,i)=>{
   const [x,y]=POS[v.to]||POS[0];
   return '<g class="yt-target" data-action="move" data-piece="'+esc(selectedPiece)+'" data-route="'+esc(v.route)+'" transform="translate('+x+','+y+')">'+
    '<circle r="12"></circle><text y="1">'+(i+1)+'</text></g>';
  }).join('');
 }
 return '<svg class="yt-board-svg" viewBox="0 0 600 600" role="img" aria-label="전략 윷놀이 경로와 청·홍팀 말 위치">'+background+nodes+figures+markers+'</svg>';
}
function seatPieces(){
 return '<div class="yt-legend"><span><span class="yt-dot"></span>청팀 말</span><span><span class="yt-dot red"></span>홍팀 말</span><span>골인: '+state.pieces.filter(p=>p.status==='done').length+' / '+state.pieces.length+'</span></div>'+
 [0,1].map(team=>{
  const atHome=state.pieces.filter(p=>p.team===team&&p.status==='home');
  const done=state.pieces.filter(p=>p.team===team&&p.status==='done');
  return '<div class="yt-member"><div><span class="yt-dot '+(team?'red':'')+'"></span><b>'+TEAM_NAMES[team]+'</b> '+
   '<span class="yt-small">대기 '+atHome.length+' · 완주 '+done.length+'</span></div><div>'+
   atHome.map(p=>'<button class="yt-btn" style="padding:5px 10px;min-height:31px" data-action="piece" data-piece="'+p.id+'" '+(!state.legalMoves.some(o=>o.pieceId===p.id)?'disabled':'')+'>'+p.id+'</button>').join('')+
   '</div></div>';
 }).join('');
}
function choosePanel(){
 const me=state.players.find(p=>p.id===state.viewerId),count=me.stickCount;
 if(me.submitted)return '<section class="yt-card"><span class="yt-kicker">YOUR CHOICE</span><h2>선택 제출 완료 ✓</h2><p class="yt-muted">모든 플레이어가 제출하면 앞면·뒷면 조합을 동시에 공개합니다.</p></section>';
 return '<section class="yt-card"><span class="yt-kicker">SELECT YOUR STICKS</span><h2>윷을 선택하세요</h2>'+
 '<p class="yt-muted">'+count+'개의 윷에서 각각 앞면 또는 뒷면을 정하세요. 다른 플레이어의 선택은 공개될 때까지 볼 수 없습니다.</p>'+
 Array.from({length:count},(_,i)=>'<div class="yt-select-block"><b>윷가락 '+(i+1)+'</b><div class="yt-stick-choice">'+
 ['F','B'].map(v=>'<button class="yt-btn '+(draft[i]===v?'chosen':'')+'" data-action="choice" data-slot="'+i+'" data-value="'+v+'">'+
 (v==='F'?'앞면 ▲':'뒷면 ▬')+'</button>').join('')+'</div></div>').join('')+
 '<div class="yt-actions"><button class="yt-btn primary full" data-action="submit" '+(draft.every(v=>v==='F'||v==='B')?'':'disabled')+'>선택 확정 →</button></div></section>';
}
function movementPanel(){
 const active=state.viewerTeam===state.turnTeam,moves=state.legalMoves;
 const possiblePieces=[...new Set(moves.map(o=>o.pieceId))];
 const choices=selectedPiece?moves.filter(o=>o.pieceId===selectedPiece):[];
 return '<section class="yt-card"><span class="yt-kicker">MOVE YOUR TEAM</span><h2>팀 말을 움직이세요</h2>'+
 '<p class="yt-muted">'+(active?'움직일 말을 선택한 다음 목적지를 누르세요. 같은 칸의 우리 팀 말은 함께 이동합니다.':'상대팀이 말을 움직이고 있습니다.')+'</p>'+
 (active?'<div class="yt-move-list">'+possiblePieces.map(id=>'<button class="yt-piece-button '+(selectedPiece===id?'selected':'')+'" data-action="piece" data-piece="'+id+'">'+
 '<span>말 '+esc(id)+'</span><span>'+esc((state.pieces.find(p=>p.id===id)?.status==='home'?'출발 대기':'말판 위'))+' →</span></button>').join('')+'</div>'+
 (selectedPiece?'<div class="yt-targets">'+choices.map((opt,i)=>'<button class="yt-btn secondary" data-action="move" data-piece="'+esc(selectedPiece)+'" data-route="'+esc(opt.route)+'">'+
 (opt.to==='FINISH'?'🏁 골인':opt.to==='HOME'?'↩ 출발점 복귀':'이동 목적지 '+(i+1))+'</button>').join('')+'</div>':''):'')+'</section>';
}
function gamePage(){
 const roll=state.roll,last=state.lastRoll,team=state.turnTeam;
 return topbar('LIVE GAME · <span id="ytConnection">● 연결됨</span>')+
 '<div class="yt-game-top"><div><span class="yt-kicker">ROUND '+state.round+'</span><div class="yt-turn'+team+'"><strong>'+TEAM_NAMES[team]+'</strong> 이동 차례</div></div>'+
 '<div><span class="yt-pill">'+MODE_NAMES[state.mode]+'</span> <span class="yt-pill">팀당 '+state.pieceCount+'말</span></div>'+
 '<div class="yt-actions" style="margin-top:0"><button class="yt-btn" data-action="copy">초대 링크</button><button class="yt-btn" data-action="leave">나가기</button></div></div>'+
 '<div class="yt-grid"><section><div class="yt-tabletop"><div class="yt-board-inner">'+boardSvg()+'</div></div>'+seatPieces()+'</section>'+
 '<aside class="yt-console"><section class="yt-card"><span class="yt-kicker">STRATEGIC THROW</span>'+
 (roll?'<div class="yt-roll-panel"><div class="yt-small">현재 윷 결과</div><div class="yt-roll-name">'+roll.name+'</div>'+
 '<p class="yt-muted">'+(roll.steps===-1?'한 칸 뒤로 이동':roll.steps+'칸 이동')+(roll.bonus?' · 추가 기회!':'')+'</p></div>':
 '<h2>네 개 윷의 선택을 기다리는 중</h2>')+
 '<div class="yt-choice-status">'+state.players.map(p=>'<span class="'+(p.submitted?'done':'')+'">'+esc(p.name)+' '+(p.submitted?'✓ 확정':'미제출')+'</span>').join('')+'</div>'+
 (last&&state.stage==='choose'?'<div class="yt-history">직전 윷: <b>'+last.name+'</b> · '+last.selected.map(x=>esc(x.name)+' '+x.choice.map(c=>c==='F'?'▲':'▬').join('')).join(' / ')+'</div>':'')+
 (state.lastAction?'<p class="yt-info-line">최근 이동: '+esc(state.lastAction.message)+'</p>':'')+'</section>'+
 (state.stage==='finished'?'<section class="yt-card"><div class="yt-win"><span class="yt-kicker">WINNER</span><p>모든 말을 골인시킨 팀</p><strong>'+TEAM_NAMES[state.winner]+' 승리!</strong></div>'+
 (state.viewerId===state.hostId?'<div class="yt-actions"><button class="yt-btn primary full" data-action="restart">재경기 설정</button></div>':'<p class="yt-muted">방장이 재경기를 준비할 수 있습니다.</p>')+'</section>':
 state.stage==='choose'?choosePanel():movementPanel())+
 '<section class="yt-card"><span class="yt-kicker">QUICK RULES</span><p class="yt-muted">앞면 0개 모 · 1개 뒷도 · 2개 개 · 3개 걸 · 4개 윷. 윷 또는 모를 만들거나 상대 말을 잡으면 추가 턴입니다. 2개 또는 4개의 팀 말을 모두 골인시키면 승리!</p></section></aside></div>';
}
function render(){if(!state)return;app.innerHTML=state.stage==='lobby'?lobby():gamePage();}
async function action(name,target){
 if(!state)return;
 try{
  const api='/api/yut/rooms/'+code+'/';
  if(name==='copy'){
   const link=location.origin+'/yut/r/'+code;
   try{await navigator.clipboard.writeText(link);notice('초대 링크를 복사했습니다.');}
   catch{window.prompt('초대 주소를 복사하세요.',link);}
   return;
  }
  if(name==='leave'){
   await post(api+'leave');localStorage.removeItem('yut:token:'+code);
   if(stream){stream.close();stream=null;}
   code=null;state=null;access=null;location.href='/yut';return;
  }
  if(name==='configure'){
   const mode=document.querySelector('#ytMode')?.value,pieceCount=Number(document.querySelector('#ytCount')?.value);
   await post(api+'configure',{mode,pieceCount});notice('게임 설정이 변경되었습니다.');return;
  }
  if(name==='ready'){const me=state.players.find(p=>p.id===state.viewerId);await post(api+'ready',{ready:!me.ready});return;}
  if(name==='start'||name==='restart'){await post(api+name);return;}
  if(name==='choice'){
   const slot=Number(target.dataset.slot),value=target.dataset.value;
   if(!Number.isInteger(slot)||slot<0||slot>=draft.length||!['F','B'].includes(value))return;
   draft[slot]=value;render();return;
  }
  if(name==='submit'){
   if(draft.some(c=>!['F','B'].includes(c)))return notice('모든 윷의 앞·뒷면을 선택해 주세요.');
   await post(api+'choose',{choices:[...draft]});return;
  }
  if(name==='piece'){
   const piece=target.dataset.piece;
   selectedPiece=state.legalMoves.some(o=>o.pieceId===piece)?piece:null;render();return;
  }
  if(name==='move'){
   const pieceId=target.dataset.piece,route=target.dataset.route;
   if(!state.legalMoves.some(o=>o.pieceId===pieceId&&o.route===route))return;
   await post(api+'move',{pieceId,route});selectedPiece=null;return;
  }
 }catch(err){notice(err.message);}
}
app.addEventListener('click',e=>{
 const target=e.target.closest('[data-action],[data-piece]');
 if(!target)return;
 action(target.dataset.action||(target.dataset.piece?'piece':null),target);
});
(function init(){
 const match=location.pathname.match(/^\/yut\/r\/([A-Z2-9]{6})\/?$/i);
 if(!match)return landing();
 const joined=match[1].toUpperCase(),remember=localStorage.getItem('yut:token:'+joined);
 if(remember)enter(joined,remember);else landing(joined);
})();
