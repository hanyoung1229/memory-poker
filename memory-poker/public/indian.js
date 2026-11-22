'use strict';
const root=document.querySelector('#indianApp'),toastBox=document.querySelector('#indianToast'),SUIT={S:'♠',H:'♥',D:'♦',C:'♣'};
let state=null,room=null,token=null,stream=null,offset=0,draft=0,toastTimer=null;

const IP_BGM=Object.freeze({
 lobby:{name:'Bossa Antigua',src:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Bossa%20Antigua.mp3'},
 game:{name:'The Escalation',src:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/The%20Escalation.mp3'}
});
let ipAudio=null,ipAudioOn=false,ipAudioKey=null;
let ipVol=Number(localStorage.getItem('ip:bgm:volume')??25);
ipVol=Number.isFinite(ipVol)?Math.min(100,Math.max(0,ipVol)):25;
function ipMusicKey(){return !state||state.stage==='lobby'?'lobby':'game';}
function ipMusicLabel(){
 const label=document.querySelector('#ipMusicName'),btn=document.querySelector('#ipMusicToggle');
 if(label)label.textContent=IP_BGM[ipMusicKey()].name;
 if(btn){btn.textContent=ipAudioOn?'🔊 음악 끄기':'🎵 음악 켜기';btn.setAttribute('aria-pressed',String(ipAudioOn));}
}
async function ipMusicSync(){
 ipMusicLabel();if(!ipAudioOn)return;
 if(!ipAudio){ipAudio=new Audio();ipAudio.loop=true;ipAudio.preload='none';
  ipAudio.addEventListener('error',()=>{const n=document.querySelector('#ipMusicName');if(n)n.textContent='음원을 불러오지 못했습니다';});
 }
 const key=ipMusicKey();ipAudio.volume=ipVol/100;
 if(ipAudioKey!==key){ipAudio.pause();ipAudio.src=IP_BGM[key].src;ipAudioKey=key;}
 if(ipAudio.paused){try{await ipAudio.play();}catch{const n=document.querySelector('#ipMusicName');if(n)n.textContent='재생 버튼을 다시 눌러 주세요';}}
}
function ipMusicSetup(){
 const btn=document.querySelector('#ipMusicToggle'),slider=document.querySelector('#ipMusicVolume'),value=document.querySelector('#ipMusicVolumeLabel');
 if(!btn||!slider||!value)return;
 slider.value=String(ipVol);value.textContent=ipVol+'%';ipMusicLabel();
 btn.addEventListener('click',()=>{
  ipAudioOn=!ipAudioOn;
  if(ipAudioOn)ipMusicSync();else{ipAudio?.pause();ipMusicLabel();}
 });
 slider.addEventListener('input',()=>{
  ipVol=Number(slider.value);value.textContent=ipVol+'%';
  localStorage.setItem('ip:bgm:volume',String(ipVol));if(ipAudio)ipAudio.volume=ipVol/100;
 });
}

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function toast(v){toastBox.textContent=v;toastBox.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastBox.classList.remove('show'),3200);}
function head(v){return '<header class="ip-top"><a class="ip-mark" href="/"><span class="emblem">♠</span><span>INDIAN POKER</span></a><span class="ip-meta">'+(v||'2 PLAYER · BLUE TABLE')+'</span></header>';}
function face(c){return '<div class="ip-face '+('HD'.includes(c.suit)?'red':'')+'"><span class="rank">'+(c.rank===1?'A':c.rank)+'</span><span class="suit">'+SUIT[c.suit]+'</span></div>';}
function back(){return '<div class="ip-back" aria-label="비공개 카드">♠</div>';}
async function post(url,data={},auth=true){
 const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
 let answer;try{answer=await res.json();}catch{throw Error('서버 응답을 확인하지 못했습니다.');}
 if(!res.ok)throw Error(answer.error||'요청 실패');return answer;
}
function landing(code){
 state=null;const join=!!code,saved=esc(localStorage.getItem('ip:name')||'');
 root.innerHTML=head('A GAME OF BLUFF & MEMORY')+
 '<section class="ip-card ip-hero"><div><span class="ip-kicker">♠ 20 CARDS · 2 PLAYERS</span>'+
 '<h1>상대 카드는 보인다.<br><span style="color:var(--ice)">내 카드는 모른다.</span></h1>'+
 '<p class="ip-muted">상대 카드만 보고 베팅하세요. 지금까지 공개된 카드를 기억하는 것이 승부의 열쇠입니다. 10을 들고 포기하면 특별 패널티가 적용됩니다.</p>'+
 '<div class="ip-actions"><span class="ip-pill">2인 실시간</span><span class="ip-pill">기본 40코인</span><span class="ip-pill">30~100 설정</span></div></div>'+
 '<div class="ip-hero-art">'+face({rank:10,suit:'H'})+back()+'</div></section>'+
 '<section class="ip-card" style="max-width:640px;margin:0 auto"><span class="ip-kicker">'+(join?'JOIN TABLE':'CREATE TABLE')+'</span>'+
 '<h2>'+(join?'친구 테이블 참가':'새 인디언포커 테이블')+'</h2>'+(join?'<p class="ip-muted">초대 코드 '+esc(code)+'</p>':'')+
 '<form id="ipJoin"><label class="ip-label" for="ipName">닉네임</label><input class="ip-input" id="ipName" maxlength="16" required autocomplete="nickname" value="'+saved+'" placeholder="닉네임">'+
 '<div class="ip-actions"><button class="ip-btn primary full" type="submit">'+(join?'참가하기':'테이블 만들기')+' →</button></div></form>'+
 (join?'<a href="/indian">← 테이블 입장 화면으로</a>':
 '<hr class="ip-divider"><form id="ipCodeForm"><label class="ip-label" for="ipCode">초대 코드로 참가</label>'+
 '<input class="ip-input" id="ipCode" maxlength="6" required placeholder="6자리 코드"><div class="ip-actions"><button class="ip-btn" type="submit">참가하기</button></div></form>')+'</section>';
 document.querySelector('#ipJoin').addEventListener('submit',async e=>{
   e.preventDefault();const name=document.querySelector('#ipName').value.trim();
   if(!name)return toast('닉네임을 입력해 주세요.');
   try{const d=await post(join?'/api/indian/join':'/api/indian/create',join?{room:code,name}:{name},false);
     localStorage.setItem('ip:name',name);enter(d.room,d.token);}
   catch(err){toast(err.message);}
 });
 if(!join)document.querySelector('#ipCodeForm').addEventListener('submit',e=>{
   e.preventDefault();const c=document.querySelector('#ipCode').value.toUpperCase().trim();
   if(!/^[A-Z2-9]{6}$/.test(c))return toast('올바른 6자리 코드를 입력해 주세요.');
   location.href='/indian/r/'+c;
 });
}
async function enter(code,access){
 if(stream)stream.close();stream=null;room=code;token=access;state=null;
 localStorage.setItem('ip:token:'+code,access);history.replaceState(null,'','/indian/r/'+code);
 root.innerHTML=head()+'<section class="ip-card">게임 서버에 연결하고 있습니다…</section>';
 try{
   const res=await fetch('/api/indian/rooms/'+code+'?token='+encodeURIComponent(access),{cache:'no-store'});
   const d=await res.json();if(!res.ok)throw Error(d.error||'방을 찾지 못했습니다.');
   if(code!==room||token!==access)return;apply(d);
 }catch(err){
   toast(err.message);localStorage.removeItem('ip:token:'+code);room=null;token=null;return landing(code);
 }
 stream=new EventSource('/api/indian/rooms/'+code+'/stream?token='+encodeURIComponent(access));
 stream.addEventListener('state',e=>{try{apply(JSON.parse(e.data));}catch(err){console.error(err);}});
 stream.onerror=()=>{const el=document.querySelector('#ipConnection');if(el)el.textContent='연결 재시도 중';};
}
function apply(s){
 if(s.room!==room)return;
 if(!state||state.round!==s.round||state.stage!==s.stage||(!state.turnIsMine&&s.turnIsMine)||state.turn!==s.turn||state.toCall!==s.toCall||state.maxBet!==s.maxBet)draft=0;
 offset=Date.now()-s.serverNow;state=s;
 if(s.turnIsMine)draft=Math.min(Math.max(0,s.maxBet-s.toCall),Math.max(0,draft));
 render();ipMusicSync();
}
function bar(){
 return '<section class="ip-room-strip"><div class="ip-room-identity"><span>PRIVATE TABLE</span><strong>'+esc(state.room)+'</strong></div>'+
 '<div class="ip-room-players">'+state.players.map((p,i)=>
 '<div class="ip-room-player '+(state.turn===i?'acting':'')+'"><span class="ip-room-dot"></span><strong>'+esc(p.name)+'</strong>'+
 '<small>'+(i===state.you?'YOU':i===0?'HOST':'OPPONENT')+'</small><b>🪙 '+p.coins+'</b></div>').join('')+'</div>'+
 '<div class="ip-room-links"><button class="ip-btn" data-act="copy">초대 링크</button><button class="ip-btn ghost" data-act="leave">나가기</button></div></section>';
}
function lobby(){
 const host=state.you===0,ready=state.players[state.you].ready,all=state.players.length===2&&state.players.every(p=>p.ready);
 return bar()+'<div class="ip-grid"><section class="ip-card"><span class="ip-kicker">TABLE SETTINGS</span><h2>인디언포커 대기실</h2>'+
 '<p class="ip-muted">먼저 카드 한 장씩 공개하여 선플레이어를 결정합니다. 승부가 시작되면 상대방의 카드만 볼 수 있습니다.</p>'+
 '<div class="ip-stake-control"><label class="ip-label" for="ipStartCoins">시작 코인 · 30~100개</label><div class="ip-actions" style="margin:0">'+
 '<button class="ip-btn" data-act="coinMinus" '+(!host?'disabled':'')+'>−10</button>'+
 '<input class="ip-input" id="ipStartCoins" type="number" min="30" max="100" step="1" value="'+state.startCoins+'" '+(!host?'disabled':'')+' style="width:110px;text-align:center">'+
 '<button class="ip-btn" data-act="coinPlus" '+(!host?'disabled':'')+'>+10</button>'+
 '<button class="ip-btn primary" data-act="configure" '+(!host?'disabled':'')+'>설정 적용</button></div>'+
 '<p class="ip-help">'+(host?'변경하면 두 사람의 준비 상태가 초기화됩니다.':'방장만 시작 코인을 설정할 수 있습니다.')+'</p></div>'+
 '<div class="ip-actions"><button class="ip-btn '+(ready?'ghost':'primary')+'" data-act="ready">'+(ready?'✓ 준비 취소':'준비 완료')+'</button>'+
 (host?'<button class="ip-btn gold" data-act="start" '+(!all?'disabled':'')+'>게임 시작</button>':'')+'</div>'+
 '<p class="ip-help">'+(host?'두 사람이 준비되면 게임 시작 버튼을 누르세요.':'두 사람이 준비되면 방장이 직접 시작합니다.')+'</p></section>'+
 '<aside class="ip-card"><span class="ip-kicker">HOW TO PLAY</span><h3>게임 규칙</h3>'+
 '<p class="ip-muted">① A=1, 10이 가장 높음<br>② 매 판 양쪽 기본 1코인<br>③ 선플레이어가 먼저 베팅<br>④ 상대가 콜 · 레이즈 · 포기 중 결정<br>⑤ 콜하면 높은 숫자가 팟을 획득<br>⑥ 10으로 포기하면 남은 코인 ⅓ 또는 10개 중 큰 수를 추가 이전</p>'+
 '<p class="ip-help">20장씩 사용하고 소진하면 새로운 뭉치로 전환합니다. 실제 돈을 사용하지 않습니다.</p></aside></div>';
}
function opening(){
 return bar()+'<section class="ip-card" style="text-align:center"><span class="ip-kicker">OPENING DRAW</span><h2>선플레이어 결정</h2>'+
 '<p class="ip-muted">카드를 동시에 공개합니다. 같은 숫자가 나오면 다시 뽑습니다.</p><p class="ip-small">🂠 남은 카드 '+state.deckRemaining+'장</p>'+
 state.opening.map((pair,i)=>'<div class="ip-pair" style="margin:13px 0">'+pair.map((c,j)=>
 '<div class="ip-pair-item"><div class="ip-card-caption">'+esc(state.players[j].name)+'</div>'+face(c)+'</div>').join('')+'</div>'+
 (i<state.opening.length-1?'<div class="ip-help">동점 · 다시 공개</div>':'')).join('')+
 '<div class="ip-result"><span>첫 번째 선플레이어</span><strong>'+esc(state.players[state.first].name)+'</strong>'+
 '<span class="ip-small">이후 매 판 선플레이어가 번갈아 진행됩니다.</span></div><p class="ip-muted" id="ipCount"></p></section>';
}
function betPage(){
 const me=state.you,op=1-me,active=state.turnIsMine,coins=state.players[me].coins;
 const toCall=state.toCall,limit=Math.max(0,state.maxBet-toCall),amount=Math.min(limit,Math.max(0,draft));
 const raiseAllowed=active&&state.maxBet>=state.minBet&&limit>=1,canCall=active&&toCall>0;
 const turnPlayer=state.players[state.turn];
 const seconds=Math.max(0,Math.ceil((state.endsAt-(Date.now()-offset))/1000));
 return bar()+'<section class="ip-table-screen">'+
 '<div class="ip-table-toolbar"><div><span class="ip-kicker">BLUE TABLE</span><h2>ROUND <b>'+state.round+'</b><small> · '+(active?'당신 차례':'상대 차례')+'</small></h2></div>'+
 '<div class="ip-table-clock"><span>'+(state.turnUsingOvertime?'추가 판단시간':'이번 차례 · 최대 30초')+'</span><strong id="ipThinkSeconds">'+seconds+'</strong><span>초</span></div>'+
 '<div class="ip-table-count">남은 카드 <strong>'+state.deckRemaining+'</strong>장</div></div>'+
 '<div class="ip-casino-table"><div class="ip-table-felt">'+
 '<div class="ip-seat ip-seat-opponent"><div class="ip-seat-label"><span>OPPONENT</span><b>'+esc(state.players[op].name)+'</b></div>'+face(state.opponentCard)+'</div>'+
 '<div class="ip-table-pot"><span class="ip-kicker">TABLE POT</span><strong>🪙 '+state.pot+'</strong><small>추가 베팅 · 나 '+state.bets[me]+' / 상대 '+state.bets[op]+'</small></div>'+
 '<div class="ip-seat ip-seat-self"><div class="ip-seat-label"><span>MY CARD · HIDDEN</span><b>내 카드는 비공개</b></div>'+back()+'</div>'+
 '</div></div>'+
 '<div class="ip-table-info"><span>선플레이어 · <strong>'+esc(state.players[state.first].name)+'</strong></span>'+
 '<span>누적 남은 판단시간 · '+state.players.map((p,i)=>'<b>'+esc(p.name)+'</b> <strong'+(i===state.turn?' id="ipBankNow"':'')+'>'+Math.ceil(p.thinkMs/1000)+'</strong>초').join(' / ')+'</span></div>'+
 (active?'<div class="ip-table-betdock"><div class="ip-raise-heading"><span class="ip-kicker">YOUR DECISION</span><span class="ip-small">보유 코인 '+coins+'개</span></div>'+
 '<div class="ip-raise-summary"><div><span>콜 금액</span><strong>'+toCall+'</strong></div><div><span>추가 레이즈</span><strong id="ipDraftNumber">'+amount+'</strong></div><div><span>총 투입</span><strong id="ipTotalAmount">'+(toCall+amount)+'</strong></div></div>'+
 '<div class="ip-adjust-controls">'+[-10,-5,-1,1,5,10].map(n=>'<button class="ip-btn ip-adjust" data-act="adjust" data-step="'+n+'">'+(n>0?'+':'')+n+'</button>').join('')+'</div>'+
 '<div class="ip-actions ip-bet-actions">'+
 '<button class="ip-btn gold" data-act="call" '+(!canCall?'disabled':'')+'>콜 · '+(canCall?Math.min(toCall,coins):0)+'개 · 즉시 공개</button>'+
 '<button class="ip-btn" data-act="allin" '+(!raiseAllowed?'disabled':'')+'>올인</button>'+
 '<button class="ip-btn primary" id="ipRaise" data-act="bet" '+(!raiseAllowed||amount<=0?'disabled':'')+'>레이즈 확정 · '+(toCall+amount)+'개</button>'+
 '<button class="ip-btn alert" data-act="fold">포기</button></div></div>':
 '<div class="ip-table-wait"><span class="ip-table-wait-dot"></span>'+esc(turnPlayer.name)+'님의 결정을 기다립니다. 콜하면 즉시 공개됩니다.</div>')+
 '<p class="ip-table-rule">10을 들고 포기하면 남은 코인의 ⅓ 또는 10코인 중 큰 수를 추가 이전합니다.</p></section>';
}
function resultPage(){
 const r=state.result,me=state.you,other=1-me,p=state.players;
 const outcome=r.winner===null?'무승부':r.winner===me?'승리!':'패배';
 const selfOutcome=r.winner===null?'draw':r.winner===me?'win':'loss';
 const who=r.reason==='fold'?esc(p[r.loser].name)+' 님이 포기했습니다.':
 r.winner===null?'숫자가 같아 중앙 코인을 나눕니다.':esc(p[r.winner].name)+' 님의 숫자가 더 높습니다.';
 return bar()+'<section class="ip-card ip-result-screen" style="text-align:center"><span class="ip-kicker">SHOWDOWN · ROUND '+state.round+'</span>'+
 '<h2>'+outcome+'</h2><div class="ip-showdown-table ip-result-table">'+
 '<div class="ip-pair-item ip-result-opponent" data-seat="opponent"><div class="ip-card-caption">'+esc(p[other].name)+' · 상대 카드</div>'+face(state.revealed[other])+'</div>'+
 '<div class="ip-result-vs">VS</div>'+
 '<div class="ip-pair-item ip-result-self ip-result-self-'+selfOutcome+'" data-seat="self"><div class="ip-card-caption">'+esc(p[me].name)+' · 내 카드</div>'+face(state.revealed[me])+'</div></div>'+
 '<div class="ip-result"><span>'+who+'</span><strong>🪙 팟 '+r.pot+'개</strong>'+
 (r.penalty?'<div style="color:var(--red);font-weight:900">⚠ 10 포기 패널티 '+r.penalty+'코인 추가 이전</div>':'')+'</div>'+
 '<p class="ip-muted">남은 코인: '+p.map(x=>esc(x.name)+' '+x.coins+'개').join(' · ')+'</p>'+
 '<p class="ip-auto-next">다음 판까지 <strong id="ipCount">'+Math.ceil((state.endsAt-state.serverNow)/1000)+'</strong>초 · 자동 시작</p>'+
 (me===0?'<div class="ip-actions" style="justify-content:center"><button class="ip-btn ghost" data-act="restart">새 경기 설정</button></div>':'')+'</section>';
}
function finished(){
 const p=state.players,winner=p.slice().sort((a,b)=>b.coins-a.coins)[0];
 return bar()+'<section class="ip-card" style="text-align:center"><span class="ip-kicker">GAME OVER</span>'+
 '<h2>경기 종료</h2><div class="ip-result"><span>최종 코인 1위</span><strong>'+esc(winner?.name||'')+'</strong>'+
 '<span>🪙 '+(winner?.coins||0)+'개</span></div>'+
 (state.you===0?'<button class="ip-btn gold" data-act="restart">새 경기 준비</button>':
 '<p class="ip-muted">방장이 새 경기를 준비할 수 있습니다.</p>')+'</section>';
}
function render(){
 if(!state)return;
 const sections={lobby,opening,betting:betPage,result:resultPage,finished};
 root.innerHTML=head('● 온라인 · ROUND '+state.round)+(sections[state.stage]?.()||'<section class="ip-card">상태를 확인하고 있습니다…</section>');
 updateCount();
}
function updateCount(){
 if(!state?.endsAt)return;
 const seconds=Math.max(0,Math.ceil((state.endsAt-(Date.now()-offset))/1000));
 const el=document.querySelector('#ipCount');
 if(el)el.textContent=state.stage==='opening'?'카드 배부까지 '+seconds+'초':String(Math.max(1,seconds));
 const timer=document.querySelector('#ipThinkSeconds');
 if(timer)timer.textContent=String(seconds);
 const bank=document.querySelector('#ipBankNow');
 if(bank&&state.stage==='betting'&&!state.turnUsingOvertime&&state.turn!==null){
   const passed=Math.max(0,Date.now()-offset-state.serverNow);
   bank.textContent=String(Math.max(0,Math.ceil((state.players[state.turn].thinkMs-passed)/1000)));
 }
}
function redrawBet(){
 const maxExtra=Math.max(0,state.maxBet-state.toCall);
 draft=Math.min(maxExtra,Math.max(0,draft));
 const count=document.querySelector('#ipDraftNumber');if(count)count.textContent=draft;
 const total=document.querySelector('#ipTotalAmount');if(total)total.textContent=state.toCall+draft;
 const confirm=document.querySelector('#ipRaise');
 if(confirm){confirm.textContent='레이즈 확정 · '+(state.toCall+draft)+'개';confirm.disabled=draft<1||state.maxBet<state.minBet;}
}
async function action(which){
 if(!state)return;const base='/api/indian/rooms/'+room+'/';
 try{
   if(which==='copy'){
     const url=location.origin+'/indian/r/'+room;
     try{await navigator.clipboard.writeText(url);toast('초대 링크 복사 완료');}
     catch{window.prompt('주소를 복사하세요.',url);}return;
   }
   if(which==='leave'){
     await post(base+'leave');localStorage.removeItem('ip:token:'+room);
     if(stream)stream.close();stream=null;state=null;token=null;room=null;location.href='/indian';return;
   }
   if(which==='coinMinus'||which==='coinPlus'){
     const input=document.querySelector('#ipStartCoins');
     if(input)input.value=String(Math.min(100,Math.max(30,Number(input.value)+(which==='coinMinus'?-10:10))));
     return;
   }
   if(which==='configure'){
     const count=Number(document.querySelector('#ipStartCoins')?.value);
     if(!Number.isInteger(count)||count<30||count>100)return toast('30~100 사이로 설정해 주세요.');
     await post(base+'configure',{count});toast('시작 코인을 변경했습니다.');return;
   }
   if(which==='adjust'){
     const step=Number(document.querySelector('[data-act="adjust"]:focus')?.dataset.step||0);
     if(!Number.isFinite(step))return;
     draft=Math.max(0,Math.min(Math.max(0,state.maxBet-state.toCall),draft+step));
     redrawBet();return;
   }
   if(which==='allin'){
     draft=Math.max(0,state.maxBet-state.toCall);redrawBet();return;
   }
   if(which==='ready')return await post(base+'ready',{ready:!state.players[state.you].ready});
   if(['start','next','restart','call','fold'].includes(which))return await post(base+which);
   if(which==='bet'){
     const total=state.toCall+draft;
     if(!state.turnIsMine||draft<1||total<state.minBet||total>state.maxBet)return toast('레이즈할 코인 수를 확인해 주세요.');
     return await post(base+'bet',{amount:total});
   }
 }catch(e){toast(e.message);}
}
root.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b){if(b.dataset.act==='adjust'){const delta=Number(b.dataset.step);if(state?.turnIsMine&&Number.isFinite(delta)){draft=Math.max(0,Math.min(Math.max(0,state.maxBet-state.toCall),draft+delta));redrawBet();}return;}action(b.dataset.act);}});
window.addEventListener('popstate',()=>location.reload());
setInterval(updateCount,150);
(function init(){
 ipMusicSetup();
 const match=location.pathname.match(/^\/indian\/r\/([A-Z2-9]{6})\/?$/i);
 if(!match)return landing();
 const code=match[1].toUpperCase(),saved=localStorage.getItem('ip:token:'+code);
 if(saved)enter(code,saved);else landing(code);
})();
