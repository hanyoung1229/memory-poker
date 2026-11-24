'use strict';
const root=document.querySelector('#gradientApp'),toast=document.querySelector('#gradientToast');
const TINTS=['#101218','#383d46','#858b93','#f0f0eb','#858b93','#383d46','#101218'];
let room=null,token=null,state=null,stream=null,setup=Array(7).fill(null),current=0,selectedNumber=null,pendingCup=null,toastTimeout=null,submitted=false;
const html=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sum=items=>items.reduce((a,b)=>a+b,0);
const params=new URLSearchParams(location.search);
function message(s){toast.textContent=s;toast.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>toast.classList.remove('show'),3300);}
function header(){return '<header class="head"><a href="/" class="brand">◉ GRADIENT SEVEN</a><small>SILVER TABLE · 1 VS 1</small></header>';}
async function post(path,data={},auth=true){
 const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
 let output=await res.json();
 if(!res.ok)throw Error(output.error||'요청에 실패했습니다.');return output;
}
function landing(join=null){
 state=null;root.innerHTML=header()+
 '<section class="panel"><span class="kicker">THE SILVER TABLE</span><h1>일곱 개의 원통.<br>단 하나의 선택.</h1><p>검정에서 흰색으로, 다시 검정으로. 두 플레이어가 비밀리에 숫자 원통을 구성한 뒤 서로의 선택을 읽고 대결합니다.</p>'+
 '<div class="cylinders">'+TINTS.map((color,i)=>'<div class="cylinder '+(i===3?'light':'')+'"><div class="cup" style="--cup:'+color+'"><span class="hidden">?</span></div><label>'+(i+1)+'</label></div>').join('')+'</div>'+
 '<p><span class="badge">1대1</span> <span class="badge">7라운드</span> <span class="badge gold">4점 먼저 획득하면 승리</span></p></section>'+
 '<section class="panel" style="max-width:600px;margin:auto"><span class="kicker">JOIN THE TABLE</span><h2>'+(join?'초대받은 방에 참가':'실버 테이블 만들기')+'</h2>'+
 (join?'<p>초대 코드 <b>'+html(join)+'</b></p>':'')+
 '<form id="newGame"><label>닉네임</label><input class="field" id="playerName" maxlength="16" required placeholder="닉네임" value="'+html(localStorage.getItem('gradient:name')||'')+'"><div class="actions"><button class="btn primary" type="submit">'+(join?'방 입장':'방 만들기')+'</button></div></form>'+
 (!join?'<form id="joinGame" style="margin-top:24px"><label>6자리 초대 코드</label><input class="field" id="joinCode" maxlength="6" required placeholder="ABC123"><div class="actions"><button class="btn" type="submit">코드로 참가</button></div></form>':'')+'</section>';
 document.querySelector('#newGame').onsubmit=async e=>{e.preventDefault();try{const name=document.querySelector('#playerName').value.trim();const data=await post(join?'/api/gradient/join':'/api/gradient/create',join?{room:join,name}:{name},false);localStorage.setItem('gradient:name',name);enter(data.room,data.token);}catch(e){message(e.message);}};
 const form=document.querySelector('#joinGame');if(form)form.onsubmit=e=>{e.preventDefault();location.href='/gradient/r/'+document.querySelector('#joinCode').value.trim().toUpperCase();};
}
async function enter(id,key){
 if(stream){stream.close();stream=null;}
 room=id;token=key;state=null;setup=Array(7).fill(null);current=0;selectedNumber=null;pendingCup=null;submitted=false;
 localStorage.setItem('gradient:token:'+room,token);history.replaceState(null,'','/gradient/r/'+room);
 root.innerHTML=header()+'<section class="panel">실버 테이블에 연결 중…</section>';
 try{
  const response=await fetch('/api/gradient/rooms/'+room+'?token='+encodeURIComponent(token),{cache:'no-store'});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'게임 방을 찾을 수 없습니다.');
  apply(data);
 }catch(e){message(e.message);localStorage.removeItem('gradient:token:'+room);return landing(room);}
 stream=new EventSource('/api/gradient/rooms/'+room+'/stream?token='+encodeURIComponent(token));
 stream.addEventListener('state',e=>{try{apply(JSON.parse(e.data));}catch(err){console.error(err);}});
 stream.onerror=()=>{};
}
function apply(value){
 if(value.room!==room)return;
 const oldStage=state?.stage;
 if(!state||oldStage!==value.stage||state.round!==value.round||state.turn!==value.turn||!!state.firstPick!==!!value.firstPick)pendingCup=null;
 state=value;
 if(oldStage!==value.stage&&value.stage==='prepare')setup=Array(7).fill(null);
 const myself=value.players[value.you];
 if(value.stage==='prepare'&&myself?.tubes&&!submitted){
  setup=[...myself.tubes];submitted=true;
 }
 render();
}
function topLine(){
 return '<section class="panel"><div class="actions" style="justify-content:space-between;margin:0"><div><span class="kicker">PRIVATE TABLE</span><h2 style="margin:5px 0;letter-spacing:.15em">'+html(state.room)+'</h2></div><div class="actions"><button class="btn" data-act="copy">초대 링크</button><button class="btn" data-act="leave">나가기</button></div></div></section>';
}
function score(){
 return '<div class="players">'+state.players.map((p,i)=>'<div class="player '+(state.turn===i?'active':'')+'"><strong>'+html(p.name)+(i===state.you?' · 나':'')+'</strong><b>'+p.points+'점</b><div class="muted">'+(p.ready?'준비 완료':'준비 전')+'</div></div>').join('')+'</div>';
}
function lobby(){
 const me=state.players[state.you],host=state.you===0,all=state.players.length===2&&state.players.every(p=>p.ready);
 return header()+topLine()+'<section class="panel"><span class="kicker">MATCH LOBBY</span><h2>플레이어 준비</h2>'+score()+
 '<p>각 플레이어는 0~9 숫자 블록을 두 장씩 받아 일곱 원통에 배치합니다. 각 원통에는 숫자 하나만 넣으며 왼쪽보다 같거나 커야 합니다. 일곱 숫자의 총합은 30 이하여야 합니다.</p>'+
 '<div class="actions"><button class="btn '+(me.ready?'':'primary')+'" data-act="ready">'+(me.ready?'준비 취소':'준비 완료')+'</button>'+
 (host?'<button class="btn primary" data-act="start" '+(!all?'disabled':'')+'>게임 시작</button>':'<span class="muted">방장이 게임을 시작합니다.</span>')+'</div></section>';
}
function cups(view,clickable,used=[],show=true){
 return '<div class="cylinders">'+TINTS.map((color,i)=>{
 const n=view?.[i],exists=Number.isInteger(n);
 return '<button class="cylinder '+(i>=2&&i<=4?'light':'')+((state?.stage==='pick'?pendingCup:current)===i&&clickable?' selected':'')+(used[i]?' used':'')+'" '+
 (clickable&&!used[i]?'data-act="cup" data-index="'+i+'"':'disabled')+'>'+
 '<div class="cup" style="--cup:'+color+'">'+(show&&view?'<span class="sum">'+(exists?n:'·')+'</span>':'<span class="hidden">?</span>')+'</div>'+
 '<label>'+(i+1)+'번</label>'+(used[i]?'<small>사용 완료</small>':clickable?'<small>'+(exists?'배치 완료':'비어 있음')+'</small>':'')+'</button>';
 }).join('')+'</div>';
}
function prepare(){
 const me=state.players[state.you],counts=Array(10).fill(0);setup.forEach(n=>{if(Number.isInteger(n))counts[n]++});
 const total=setup.reduce((v,n)=>v+(n??0),0);
 const ordered=setup.every((n,i)=>!i||n===null||setup[i-1]===null||n>=setup[i-1]);
 const valid=setup.every(Number.isInteger)&&counts.every(v=>v<=2)&&total<=30&&ordered;
 return header()+topLine()+score()+'<section class="panel"><span class="kicker">SECRET SETUP</span>'+
 '<h2>원통마다 숫자 하나씩 배치</h2><p>0~9 숫자 블록은 각각 2개씩 있습니다. 7개 원통에 한 개씩 넣고 <strong>왼쪽 숫자 ≤ 오른쪽 숫자</strong>여야 합니다. <strong>전체 합계는 30 이하</strong>입니다. 사용하지 않은 13개 블록은 남습니다.</p>'+
 cups(setup,!me.prepared)+(me.prepared?'<p class="status">배치 확정 ✓ · 상대 배치를 기다립니다.</p>':
 '<div class="grid"><div><h3>'+(current+1)+'번 원통 숫자 선택</h3><div class="tiles">'+Array.from({length:10},(_,n)=>
 '<button class="tile '+(selectedNumber===n?'active':'')+'" data-act="tile" data-number="'+n+'" '+(counts[n]>=2&&setup[current]!==n?'disabled':'')+'>'+n+'</button>').join('')+'</div>'+
 '<p class="muted">원통을 누르고 숫자를 누르면 그 자리에 한 개만 배치하거나 교체합니다.</p>'+
 '<div class="actions"><button class="btn" data-act="undo" '+(setup[current]===null?'disabled':'')+'>숫자 빼기</button><button class="btn warn" data-act="reset">초기화</button></div></div>'+
 '<div><h3>배치 현황</h3><p class="status">'+setup.filter(Number.isInteger).length+' / 7개 · 총합 '+total+' / 30</p>'+
 '<p class="selected-summary">'+(ordered?'✓ 숫자 순서 올바름':'⚠ 오른쪽 숫자가 왼쪽보다 작습니다.')+'</p>'+
 '<p class="muted">남은 블록 '+counts.map((n,i)=>i+'×'+(2-n)).join(' · ')+'</p>'+
 '<button class="btn primary" data-act="submit" '+(!valid?'disabled':'')+'>배치 확정</button></div></div>')+'</section>';
}
// 선택된 상대 원통의 색상·모양과 고정 위치만 보여주며 숫자는 절대 공개하지 않습니다.
function opponentCylinderPreview(first){
 const index=first.index,other=first.player!==state.you;
 const person=state.players[first.player],shade=TINTS[index];
 return '<div class="opponent-pick-stage" role="status" aria-label="'+(other?'상대방':'나')+'의 '+(index+1)+'번 원통 제시">'+
 '<div class="opponent-pick-copy"><span class="kicker">'+(other?'OPPONENT SELECTED':'YOUR PICK LOCKED')+'</span>'+
 '<h3>'+html(person.name)+'님의 선택</h3>'+
 '<p><strong>'+(index+1)+'번 원통</strong>을 제시했습니다.'+
 (other?' 상대 원통의 색상과 모양은 확인할 수 있지만, 안에 있는 숫자는 아직 공개되지 않습니다.':' 상대방이 원통을 고르는 동안 기다려 주세요.')+'</p>'+
 '<span class="badge gold">숫자 비공개 · 승부 후 공개</span></div>'+
 '<div class="opponent-pick-visual"><div class="opponent-picked-cylinder '+(index>=2&&index<=4?'light':'')+'">'+
 '<div class="cup" style="--cup:'+shade+'"><span class="hidden" aria-label="비공개 숫자">?</span></div>'+
 '<span class="opponent-picked-number">'+(index+1)+'번 원통</span></div></div>'+
 '</div>';
}
function game(){
 const me=state.players[state.you],enemy=state.players[1-state.you],myTurn=state.turn===state.you;
 const first=state.firstPick;
 const phase=state.stage;
 const myCups=me.tubes||setup;
 const canPick=phase==='pick'&&myTurn;
 return header()+topLine()+score()+'<section class="panel"><span class="kicker">ROUND '+state.round+' / 7</span><h2>'+(phase==='finished'?'최종 승부 결과':phase==='result'?'원통 공개 결과':'원통 제시 차례')+'</h2>'+
 (phase==='pick'?'<p class="status">'+(myTurn?'당신 차례입니다. 상대의 제시를 확인하고 원통을 고르세요.':'상대가 원통을 고르는 중입니다.')+'</p>':'')+
 (first&&phase==='pick'?opponentCylinderPreview(first):'')+
 cups(myCups,canPick,me.used,true)+
 (phase==='pick'?(canPick?'<div class="pick-confirm-strip">'+
 '<p class="selected-summary">'+(pendingCup===null?'제시할 원통을 하나 선택하세요.':(pendingCup+1)+'번 원통을 제시할까요?')+'</p>'+
 '<button class="btn primary" data-act="confirmPick" '+(pendingCup===null?'disabled':'')+'>원통 확정</button></div>':
 '<p class="muted">상대의 선택을 기다리고 있습니다.</p>'):'')+
 (phase==='result'||phase==='finished'?resultPanel():'')+
 '</section>'+historyPanel();
}
function resultPanel(){
 const r=state.result;if(!r)return '';
 const winner=r.winner===null?'동점 · 점수 없음':state.players[r.winner].name+' +1점';
 return '<div class="panel" style="margin:16px 0"><span class="kicker">REVEALED · ROUND '+r.round+'</span><h2>'+html(winner)+'</h2><div class="result">'+
 r.values.map((v,i)=>'<div><span class="muted">'+html(state.players[i].name)+' · '+(r.picks[i]+1)+'번 원통</span><div class="value">'+v+'</div><div class="muted">'+r.blocks[i]+'</div></div>').join('<div class="vs">VS</div>')+'</div>'+
 (state.stage==='result'?'<p class="muted">다음 판 자동 시작까지 '+Math.max(0,Math.ceil((state.endsAt-state.serverNow)/1000))+'초</p>':
 '<p class="status">최종 결과: '+(state.winner===null?'무승부':html(state.players[state.winner].name)+' 승리!')+'</p>'+
 (state.you===0?'<button class="btn primary" data-act="restart">새 게임 준비</button>':''))+'</div>';
}
function historyPanel(){
 return '<section class="panel"><span class="kicker">PREVIOUS ROUNDS</span><h2>지난 대결</h2><div class="list">'+(state.history.length?state.history.slice().reverse().map(r=>'<div>'+r.round+'라운드 · '+html(state.players[0].name)+' '+r.values[0]+' : '+r.values[1]+' '+html(state.players[1].name)+' · '+(r.winner===null?'동점':'승자 '+html(state.players[r.winner].name))+'</div>').join(''):'<p class="muted">아직 공개된 대결이 없습니다.</p>')+'</div></section>';
}
function render(){if(!state)return;root.innerHTML=state.stage==='lobby'?lobby():state.stage==='prepare'?prepare():game();}
async function action(name,target){
 if(!state)return;
 const api='/api/gradient/rooms/'+room+'/';
 try{
  if(name==='copy'){const link=location.origin+'/gradient/r/'+room;try{await navigator.clipboard.writeText(link);message('초대 링크를 복사했습니다.');}catch{prompt('초대 주소',link);}return;}
  if(name==='leave'){
   await post(api+'leave');localStorage.removeItem('gradient:token:'+room);if(stream)stream.close();location.href='/gradient';return;
  }
  if(name==='ready'){await post(api+'ready',{ready:!state.players[state.you].ready});return;}
  if(name==='start'||name==='restart'){await post(api+name);return;}
  if(name==='cup'){
   const number=Number(target.dataset.index);
   if(state.stage==='prepare'){current=number;selectedNumber=null;render();return;}
   if(state.stage==='pick'&&state.turn===state.you){
    if(state.players[state.you].used[number])return;
    pendingCup=number;render();return;
   }
  }
  if(name==='confirmPick'){
   if(state.stage!=='pick'||state.turn!==state.you||!Number.isInteger(pendingCup)||state.players[state.you].used[pendingCup])return;
   const index=pendingCup;
   await post(api+'pick',{index});pendingCup=null;return;
  }
  if(name==='tile'){
   const number=Number(target.dataset.number);
   const count=setup.flat().filter(n=>n===number).length;
   if(count>=2&&setup[current]!==number)return message('같은 숫자 블록은 최대 두 개만 가능합니다.');
   const next=[...setup];next[current]=number;
   if(next.reduce((v,n)=>v+(n??0),0)>30)return message('일곱 원통의 숫자 합계는 30 이하여야 합니다.');
   setup=next;selectedNumber=number;render();return;
  }
  if(name==='undo'){setup[current]=null;render();return;}
  if(name==='reset'){setup=Array(7).fill(null);current=0;render();return;}
  if(name==='submit'){await post(api+'prepare',{tubes:[...setup]});submitted=true;return;}
 }catch(e){message(e.message);}
}
root.addEventListener('click',e=>{const target=e.target.closest('[data-act]');if(target)action(target.dataset.act,target);});
(function init(){
 const match=location.pathname.match(/^\/gradient\/r\/([A-Z2-9]{6})\/?$/i);
 if(!match)return landing();
 const code=match[1].toUpperCase(),remember=localStorage.getItem('gradient:token:'+code);
 if(remember)enter(code,remember);else landing(code);
})();
