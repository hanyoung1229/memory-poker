'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../lib/twelve-engine');
const {TwelveService}=require('../lib/twelve');
test('말판은 4×3 총 12칸이며 왕·장·상·자가 좌우 대칭으로 시작',()=>{
 const g=E.fresh(0);
 assert.equal(g.board.length,12);
 assert.equal(g.board.filter(Boolean).length,8);
 assert.deepEqual(g.hands,[[],[]]);
 assert.equal(g.board[E.index(0,1)].type,'K');
 assert.equal(g.board[E.index(3,1)].type,'K');
 assert.equal(g.board[E.index(1,1)].type,'P');
 assert.equal(g.board[E.index(2,1)].type,'P');
});
test('장·상·왕·자·후의 이동 방향이 서로 다르다',()=>{
 assert.equal(E.dirs({type:'J',owner:0}).length,4);
 assert.equal(E.dirs({type:'S',owner:0}).length,4);
 assert.equal(E.dirs({type:'K',owner:0}).length,8);
 assert.deepEqual(E.dirs({type:'P',owner:0}),[[1,0]]);
 assert.deepEqual(E.dirs({type:'P',owner:1}),[[-1,0]]);
 assert.equal(E.dirs({type:'H',owner:0}).length,6);
 assert.ok(E.dirs({type:'H',owner:0}).some(v=>v[0]===1&&v[1]===1));
 assert.ok(!E.dirs({type:'H',owner:0}).some(v=>v[0]===-1&&v[1]===1));
});
test('자는 상대 끝 진영에 도착하면 자동으로 후로 뒤집힌다',()=>{
 const game=E.fresh(0);
 game.board[E.index(1,0)]=null;
 game.board[E.index(2,0)]={owner:0,type:'P'};
 game.board[E.index(3,0)]=null;
 const m=E.legal(game).find(m=>m.from===E.index(2,0)&&m.to===E.index(3,0));
 assert.ok(m);
 assert.equal(m.promote,true);
 const after=E.apply(game,m);
 assert.equal(after.board[E.index(3,0)].type,'H');
 assert.equal(after.board[E.index(3,0)].owner,0);
});
test('후를 잡으면 상대 손에는 자로 돌아오며 원하는 빈 칸에 내려놓을 수 있다',()=>{
 const game=E.fresh(0);
 game.board=Array(12).fill(null);
 game.board[E.index(0,0)]={owner:0,type:'K'};
 game.board[E.index(3,2)]={owner:1,type:'K'};
 game.board[E.index(2,1)]={owner:0,type:'J'};
 game.board[E.index(3,1)]={owner:1,type:'H'};
 game.turn=0;
 const capture=E.legal(game).find(m=>m.from===E.index(2,1)&&m.to===E.index(3,1));
 assert.ok(capture);
 const next=E.apply(game,capture);
 assert.deepEqual(next.hands[0],['P']);
 next.turn=0;
 const drop=E.legal(next).find(m=>m.kind==='drop'&&m.type==='P'&&m.to===E.index(1,0));
 assert.ok(drop);
 assert.equal(E.legal(next).some(m=>m.kind==='drop'&&m.to===E.index(3,0)),false);
 const played=E.apply(next,drop);
 assert.equal(played.board[E.index(1,0)].type,'P');
 assert.equal(played.board[E.index(1,0)].owner,0);
 assert.deepEqual(played.hands[0],[]);
});
test('상대 왕을 잡으면 즉시 승리',()=>{
 const game=E.fresh(0);
 game.board=Array(12).fill(null);
 game.board[E.index(1,1)]={owner:0,type:'J'};
 game.board[E.index(2,1)]={owner:1,type:'K'};
 game.board[E.index(0,0)]={owner:0,type:'K'};
 const move=E.legal(game).find(m=>m.from===E.index(1,1)&&m.to===E.index(2,1));
 assert.ok(move);
 const result=E.apply(game,move);
 assert.equal(result.winner,0);
});
test('왕이 적 진영에 들어가고 적 한 턴을 살아남으면 승리',()=>{
 const g=E.fresh(0);
 g.board=Array(12).fill(null);
 g.board[E.index(2,0)]={owner:0,type:'K'};
 g.board[E.index(3,2)]={owner:1,type:'K'};
 g.board[E.index(0,2)]={owner:0,type:'J'};
 const step=E.legal(g).find(m=>m.from===E.index(2,0)&&m.to===E.index(3,0));
 assert.ok(step);
 const b=E.apply(g,step);
 assert.equal(b.winner,null);
 const reply=E.legal(b).find(m=>m.from===E.index(3,2)&&m.to===E.index(2,2));
 assert.ok(reply);
 const result=E.apply(b,reply);
 assert.equal(result.winner,0);
});
test('쉬움·보통·어려움 컴퓨터가 합법적인 수를 선택한다',()=>{
 for(const difficulty of ['easy','normal','hard']){
  const g=E.fresh(0),choice=E.computerMove(g,difficulty);
  assert.ok(choice);
  assert.ok(E.legal(g).some(m=>E.sameMove(m,choice)));
 }
});
function match(){
 const actions=[];const service=new TwelveService({onChange:r=>actions.push(r.revision)});
 const {room,player:a}=service.create('A'),b=service.join(room.code,'B');
 service.ready(room,a.token,true);service.ready(room,b.token,true);
 return {service,room,a,b,actions};
}
test('1대1은 모두 준비한 뒤 방장만 시작할 수 있고 참가자별 진영이 다르다',()=>{
 const {service,room,a,b}=match();
 assert.equal(room.stage,'lobby');
 assert.throws(()=>service.start(room,b.token),/방장/);
 service.start(room,a.token);
 assert.equal(room.stage,'playing');
 assert.equal(service.serialize(room,a.token).side,0);
 assert.equal(service.serialize(room,b.token).side,1);
 assert.equal(room.game.board.length,12);
});
test('서버는 실제 차례 외 플레이어와 불법 이동을 거절하며 합법 이동만 허용',()=>{
 const {service,room,a,b}=match();
 service.start(room,a.token);
 const mover=room.game.turn===0?a:b,opponent=room.game.turn===0?b:a;
 const move=E.legal(room.game)[0];
 assert.throws(()=>service.move(room,opponent.token,move),/상대 차례/);
 assert.throws(()=>service.move(room,mover.token,{kind:'move',from:999,to:999}),/움직일 수/);
 const before=room.revision;
 service.move(room,mover.token,move);
 assert.equal(room.revision,before+1);
 assert.equal(room.game.ply,1);
});
test('온라인 대국에선 다른 방의 토큰을 사용하거나 방장 아닌 재경기 조작을 거절',()=>{
 const {service,room,a,b}=match();
 const another=service.create('C');
 assert.throws(()=>service.serialize(room,another.player.token),/참가 정보/);
 service.start(room,a.token);room.stage='finished';
 assert.throws(()=>service.restart(room,b.token),/방장/);
 service.restart(room,a.token);
 assert.equal(room.stage,'lobby');
});

test('왕이 상대 말의 이동 범위 안에 있으면 위협 판정, 아니면 안전 판정',()=>{
 const g=E.fresh(0);g.board=Array(12).fill(null);
 g.board[E.index(1,1)]={type:'K',owner:0};
 g.board[E.index(2,1)]={type:'J',owner:1};
 assert.equal(E.kingThreatened(g,0),true);
 assert.equal(E.kingThreatened(g,1),false);
 g.board[E.index(2,1)]=null;
 g.board[E.index(3,2)]={type:'J',owner:1};
 assert.equal(E.kingThreatened(g,0),false);
 g.board[E.index(2,2)]={type:'S',owner:1};
 assert.equal(E.kingThreatened(g,0),true);
});
test('온라인 무르기 요청 중 이동 잠금, 상대 거절 시 유지, 수락 시 직전 수 복원',()=>{
 const {service,room,a,b}=match();
 service.start(room,a.token);
 const firstMover=room.game.turn===0?a:b;
 const other=firstMover===a?b:a;
 const original=JSON.parse(JSON.stringify(room.game));
 const move=E.legal(room.game)[0];
 service.move(room,firstMover.token,move);
 assert.equal(room.game.ply,1);
 service.requestUndo(room,firstMover.token);
 const visible=service.serialize(room,other.token);
 assert.deepEqual(visible.undo,{requester:room.players.indexOf(firstMover),ply:1});
 assert.equal(visible.canUndo,true);
 assert.throws(()=>service.move(room,other.token,E.legal(room.game)[0]),/무르기 요청/);
 assert.throws(()=>service.respondUndo(room,firstMover.token,true),/상대방/);
 service.respondUndo(room,other.token,false);
 assert.equal(room.game.ply,1);
 assert.equal(room.undo,null);
 service.requestUndo(room,other.token);
 assert.throws(()=>service.cancelUndo(room,firstMover.token),/요청한 플레이어/);
 service.respondUndo(room,firstMover.token,true);
 assert.equal(room.game.ply,0);
 assert.deepEqual(room.game,original);
 assert.equal(room.stage,'playing');
 assert.equal(room.undo,null);
 assert.equal(room.history.length,0);
});
test('온라인 무르기 요청자는 자기 요청을 취소할 수 있다',()=>{
 const {service,room,a,b}=match();service.start(room,a.token);
 const first=room.game.turn===0?a:b;
 service.move(room,first.token,E.legal(room.game)[0]);
 service.requestUndo(room,first.token);
 service.cancelUndo(room,first.token);
 assert.equal(room.undo,null);
 assert.equal(room.game.ply,1);
});
test('종료된 대국도 상대가 무르기 수락하면 직전 수부터 재개 가능',()=>{
 const {service,room,a,b}=match();service.start(room,a.token);
 const mover=room.game.turn===0?a:b,other=mover===a?b:a;
 room.game.board=Array(12).fill(null);
 const mine=room.game.turn,enemy=1-mine;
 room.game.board[E.index(0,0)]={type:'K',owner:mine};
 room.game.board[E.index(1,1)]={type:'J',owner:mine};
 room.game.board[E.index(2,1)]={type:'K',owner:enemy};
 service.move(room,mover.token,{kind:'move',from:E.index(1,1),to:E.index(2,1)});
 assert.equal(room.stage,'finished');
 service.requestUndo(room,other.token);
 service.respondUndo(room,mover.token,true);
 assert.equal(room.stage,'playing');
 assert.equal(room.game.winner,null);
 assert.equal(room.game.ply,0);
});
test('세로 말판은 원래 4×3 엔진의 좌표를 바꾸지 않고 3열×4행으로 표시한다',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const src=fs.readFileSync(path.join(__dirname,'../public/twelve.js'),'utf8');
 const withoutInit=src.replace(/\(function init\(\)\{[\s\S]*?\}\)\(\);\s*$/,'');
 assert.notEqual(withoutInit,src);
 const root={innerHTML:'',addEventListener(){}},toast={textContent:'',classList:{add(){},remove(){}}};
 const document={querySelector:q=>q==='#twelveApp'?root:toast};
 const app=new Function('window','document','setTimeout','clearTimeout',withoutInit+
 '\nreturn {start:(g,me)=>{mode="solo";human=me;state=g;thinking=false;soloHistory=[];render();},board,square,action,getGame:()=>state,historyLength:()=>soloHistory.length};')(
 {TwelveEngine:E},document,()=>17,()=>{});
 app.start(E.fresh(0),0);
 const indices=[...app.board().matchAll(/data-index="(\d+)"/g)].map(m=>Number(m[1]));
 assert.deepEqual(indices,[3,7,11,2,6,10,1,5,9,0,4,8]);
 assert.match(root.innerHTML,/viewer-side0/);
 assert.match(root.innerHTML,/>상<\/div>/);
 assert.match(root.innerHTML,/>장<\/div>/);
 assert.match(root.innerHTML,/>자<\/div>/);
 app.start(E.fresh(0),1);
 const swapped=[...app.board().matchAll(/data-index="(\d+)"/g)].map(m=>Number(m[1]));
 assert.deepEqual(swapped,[8,4,0,9,5,1,10,6,2,11,7,3]);
});
test('목적지 첫 클릭은 미리보기만, 같은 목적지 재클릭에 이동, 솔로 무르기는 즉시 복원',async()=>{
 const fs=require('node:fs'),path=require('node:path');
 const src=fs.readFileSync(path.join(__dirname,'../public/twelve.js'),'utf8');
 const code=src.replace(/\(function init\(\)\{[\s\S]*?\}\)\(\);\s*$/,'');
 const root={innerHTML:'',addEventListener(){}},toast={textContent:'',classList:{add(){},remove(){}}};
 const document={querySelector:q=>q==='#twelveApp'?root:toast};
 const app=new Function('window','document','setTimeout','clearTimeout',code+
 '\nreturn {start:g=>{mode="solo";human=0;state=g;thinking=false;soloHistory=[];render();},square,action,getGame:()=>state,historyLength:()=>soloHistory.length};')(
 {TwelveEngine:E},document,()=>23,()=>{});
 app.start(E.fresh(0));
 const move=E.legal(app.getGame())[0];
 app.square(move.from);
 app.square(move.to);
 assert.equal(app.getGame().ply,0);
 assert.match(root.innerHTML,/다시 누르면 이동 확정/);
 app.square(move.to);
 assert.equal(app.getGame().ply,1);
 assert.equal(app.historyLength(),1);
 await app.action('undo',{dataset:{}});
 assert.equal(app.getGame().ply,0);
 assert.equal(app.historyLength(),0);
});

test('컴퓨터가 선공할 때 AI가 오류 없이 첫 수를 두며 착수 효과음은 선택 사항',()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/twelve.js'),'utf8');
 const content=source.replace(/\(function init\(\)\{[\s\S]*?\}\)\(\);\s*$/,'');
 assert.notEqual(content,source);
 let scheduled=null;
 const root={innerHTML:'',addEventListener(){}},toast={textContent:'',classList:{add(){},remove(){}}};
 const document={querySelector:q=>{
  if(q==='#twelveApp')return root;
  if(q==='#twelveToast')return toast;
  if(q==='#side')return {value:'1'};
  if(q==='#difficulty')return {value:'easy'};
  return null;
 },addEventListener(){}};
 const stubWindow={TwelveEngine:E};
 const app=new Function('window','document','setTimeout','clearTimeout','history',content+
 '\nreturn {startSolo,getGame:()=>state,isThinking:()=>thinking,view:()=>root.innerHTML};')(
 stubWindow,document,fn=>{scheduled=fn;return 10;},()=>{}, {replaceState(){}});
 app.startSolo();
 assert.equal(app.getGame().turn,0);
 assert.equal(app.isThinking(),true);
 assert.equal(typeof scheduled,'function');
 scheduled();
 assert.equal(app.getGame().ply,1);
 assert.equal(app.getGame().turn,1);
 assert.equal(app.isThinking(),false);
});
test('승리 왕에게 황금 테두리가 보이고 위험 경고 빨강보다 우선',()=>{
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../public/twelve.js'),'utf8');
 const code=source.replace(/\(function init\(\)\{[\s\S]*?\}\)\(\);\s*$/,'');
 const root={innerHTML:'',addEventListener(){}},toast={textContent:'',classList:{add(){},remove(){}}};
 const document={querySelector:q=>q==='#twelveApp'?root:toast,addEventListener(){}};
 const app=new Function('window','document',code+
 '\nreturn {setGame:s=>{mode="solo";human=0;state=s;thinking=false;},board};')({TwelveEngine:E},document);
 const s=E.fresh(0);
 s.winner=0;
 app.setGame(s);
 const markup=app.board();
 assert.match(markup,/king-victorious/);
 assert.match(markup,/piece owner0 victorious/);
 const winningCell=markup.match(/class="cell[^"]*king-victorious[^"]*"[^>]*>[\s\S]*?<\/button>/);
 assert.ok(winningCell);
 assert.doesNotMatch(winningCell[0],/king-under-threat/);
});

test('청팀이 선공, 홍팀이 후공이며 팀 변경 시 기존 두 선수가 자리를 교환한다',()=>{
 const {service,room,a,b}=match();
 service.changeTeam(room,b.token,0);
 assert.equal(service.serialize(room,a.token).side,1);
 assert.equal(service.serialize(room,b.token).side,0);
 assert.equal(room.players.every(p=>!p.ready),true);
 assert.throws(()=>service.start(room,a.token),/준비/);
 service.ready(room,a.token,true);service.ready(room,b.token,true);
 assert.throws(()=>service.start(room,b.token),/방장/);
 service.start(room,a.token);
 assert.equal(room.game.turn,0);
 assert.equal(room.first,0);
 assert.equal(room.stage,'playing');
 const first=E.legal(room.game)[0];
 assert.throws(()=>service.move(room,a.token,first),/상대 차례/);
 service.move(room,b.token,first);
 assert.equal(room.game.turn,1);
 assert.throws(()=>service.changeTeam(room,a.token,0),/준비실/);
});
test('혼자 대기하는 선수도 빈 팀으로 이동하고 진영 변경 즉시 준비 취소',()=>{
 const service=new TwelveService();
 const {room,player:a}=service.create('방장');
 service.changeTeam(room,a.token,1);
 assert.equal(room.players[0].side,1);
 const b=service.join(room.code,'새 참가자');
 assert.equal(service.serialize(room,b.token).side,0);
 service.ready(room,a.token,true);service.ready(room,b.token,true);
 service.changeTeam(room,a.token,0);
 assert.deepEqual(room.players.map(p=>p.side),[0,1]);
 assert.equal(room.players.every(p=>!p.ready),true);
});
test('관전석은 선수 두 명과 별개로 정확히 3명이며 게임 진행 중에도 입장 가능',()=>{
 const {service,room,a,b}=match();
 const watchers=[0,1,2].map(i=>service.join(room.code,'관전자'+i,'spectator'));
 assert.equal(room.spectators.length,3);
 assert.equal(room.players.length,2);
 assert.throws(()=>service.join(room.code,'4번째','spectator'),/3자리/);
 service.start(room,a.token);
 const spectator=service.serialize(room,watchers[0].token);
 assert.equal(spectator.side,null);
 assert.equal(spectator.role,'spectator');
 assert.equal(spectator.players.length,2);
 assert.equal(spectator.spectators.length,3);
 assert.equal(spectator.game.board.length,12);
 assert.throws(()=>service.join(room.code,'진행중 방 입장','player'),/진행 중/);
});
test('진행 중 관전자 입장과 관전자 권한 제어, 관전자 퇴장 시 대국 유지',()=>{
 const {service,room,a,b}=match();
 service.start(room,a.token);
 const watcher=service.join(room.code,'모니터','spectator');
 const revision=room.revision,board=JSON.stringify(room.game);
 assert.throws(()=>service.changeTeam(room,watcher.token,0),/준비실/);
 assert.throws(()=>service.ready(room,watcher.token,true),/준비실/);
 assert.throws(()=>service.move(room,watcher.token,E.legal(room.game)[0]),/관전자|상대 차례/);
 assert.throws(()=>service.requestUndo(room,watcher.token),/관전자/);
 assert.throws(()=>service.restart(room,watcher.token),/방장/);
 assert.throws(()=>service.start(room,watcher.token),/방장/);
 assert.equal(JSON.stringify(room.game),board);
 service.leave(room,watcher.token);
 assert.equal(room.stage,'playing');
 assert.equal(room.players.length,2);
 assert.equal(room.spectators.length,0);
 assert.equal(room.revision,revision);
});
test('관전자는 준비실에서도 팀·준비 및 무르기 응답에 개입할 수 없다',()=>{
 const {service,room,a,b}=match();
 const w=service.join(room.code,'관중','spectator');
 assert.throws(()=>service.ready(room,w.token,true),/관전자/);
 assert.throws(()=>service.changeTeam(room,w.token,0),/선수가|빈 자리/);
 service.start(room,a.token);
 const mover=room.players.find(p=>p.side===room.game.turn);
 service.move(room,mover.token,E.legal(room.game)[0]);
 service.requestUndo(room,mover.token);
 assert.throws(()=>service.respondUndo(room,w.token,true),/관전자/);
 assert.throws(()=>service.cancelUndo(room,w.token),/관전자/);
});
test('관전자 접속화면에 말판·관전자 명단은 표시하고 착수 버튼은 제공하지 않는다',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const original=fs.readFileSync(path.join(__dirname,'../public/twelve.js'),'utf8');
 const code=original.replace(/\(function init\(\)\{[\s\S]*?\}\)\(\);\s*$/,'');
 assert.notEqual(original,code);
 const root={innerHTML:'',addEventListener(){}},toast={textContent:'',classList:{add(){},remove(){}}};
 const doc={querySelector:q=>q==='#twelveApp'?root:toast,addEventListener(){}};
 const ui=new Function('window','document',code+
 '\nreturn {load:s=>{mode="online";state=s;room=s.room;thinking=false;render();},html:()=>root.innerHTML,canMove,view};')(
 {TwelveEngine:E},doc);
 const {service,room,a,b}=match();
 service.start(room,a.token);
 const watcher=service.join(room.code,'보는사람','spectator');
 ui.load(service.serialize(room,watcher.token));
 const html=ui.html();
 assert.match(html,/관전 중/);
 assert.match(html,/보는사람/);
 assert.match(html,/class="board viewer-side0"/);
 assert.doesNotMatch(html,/data-action="undo"/);
 assert.doesNotMatch(html,/data-action="ready"/);
 assert.doesNotMatch(html,/data-action="team"/);
 assert.doesNotMatch(html,/data-action="restart"/);
 assert.equal(ui.canMove(),false);
});

test('AI 난이도별 목표 탐색 수는 쉬움 3수·중간 5수·어려움 8수',()=>{
 assert.deepEqual(E.DEPTHS,{easy:3,normal:5,hard:8});
 const g=E.fresh(0);
 for(const [level,depth] of Object.entries(E.DEPTHS)){
  const result=E.analyzeMove(g,level,{nodeLimit:5000,timeLimitMs:350});
  assert.equal(result.targetDepth,depth);
  assert.ok(result.completedDepth>=0&&result.completedDepth<=depth);
  assert.ok(E.legal(g).some(m=>E.sameMove(result.move,m)));
  assert.ok(result.nodes>=0);
 }
});
test('탐색이 제한을 만나더라도 반드시 합법 수를 제시하고 완료된 깊이만 기록',()=>{
 const g=E.fresh(0);
 const result=E.analyzeMove(g,'hard',{nodeLimit:1,timeLimitMs:1});
 assert.equal(result.targetDepth,8);
 assert.equal(result.limited,true);
 assert.equal(result.completedDepth,0);
 assert.ok(E.legal(g).some(m=>E.sameMove(result.move,m)));
});
test('각 선수의 서버 제한시간 30초: 만료 직전에 둔 수는 유효하고 만료 후는 패배',()=>{
 let now=1000;const timers=[];
 const service=new TwelveService({now:()=>now,schedule:(fn,ms)=>{const t={fn,ms,unref(){}};timers.push(t);return t;},cancel:()=>{}});
 const {room,player:a}=service.create('시작 선수'),b=service.join(room.code,'상대 선수');
 service.ready(room,a.token,true);service.ready(room,b.token,true);service.start(room,a.token);
 assert.equal(room.deadline,31000);
 assert.equal(timers.at(-1).ms,30000);
 now=30999;
 service.move(room,a.token,E.legal(room.game)[0]);
 assert.equal(room.stage,'playing');
 assert.equal(room.deadline,60999);
 const side=room.game.turn,loser=room.players.find(p=>p.side===side);
 now=61000;
 assert.throws(()=>service.move(room,loser.token,E.legal(room.game)[0]),/30초/);
 assert.equal(room.stage,'finished');
 assert.equal(room.game.winner,1-side);
 assert.equal(room.game.last.kind,'timeout');
 assert.equal(room.deadline,null);
});
test('서버 자동 타이머도 30초에 패배 처리하며 관전자에게 마감 시각 공유',()=>{
 let now=0,task=null;
 const service=new TwelveService({now:()=>now,schedule:(fn,ms)=>{task={fn,ms,unref(){}};return task;},cancel:()=>{}});
 const {room,player:a}=service.create('A'),b=service.join(room.code,'B');
 const watcher=service.join(room.code,'관전자','spectator');
 service.ready(room,a.token,true);service.ready(room,b.token,true);service.start(room,a.token);
 assert.equal(service.serialize(room,watcher.token).deadline,30000);
 assert.equal(service.serialize(room,watcher.token).turnMs,30000);
 now=30000;task.fn();
 assert.equal(room.stage,'finished');
 assert.equal(room.game.winner,1);
});
test('무르기 응답을 기다리는 동안 30초 시계 중지, 응답 후 초기화',()=>{
 let now=0;const service=new TwelveService({now:()=>now,schedule:(fn,ms)=>({fn,ms,unref(){}}),cancel:()=>{}});
 const {room,player:a}=service.create('A'),b=service.join(room.code,'B');
 service.ready(room,a.token,true);service.ready(room,b.token,true);service.start(room,a.token);
 service.move(room,a.token,E.legal(room.game)[0]);
 now=9000;service.requestUndo(room,a.token);
 assert.equal(room.deadline,null);
 now=40000;service.respondUndo(room,b.token,false);
 assert.equal(room.deadline,70000);
 assert.equal(room.game.winner,null);
});

test('말판 보조 이름 삭제와 난이도 쉬움·중간·어려움 표기',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const src=fs.readFileSync(path.join(__dirname,'../public/twelve.js'),'utf8');
 assert.ok(!src.includes("E.LABELS[p.type]+'</small>"));
 assert.ok(src.includes('<option value="easy">쉬움</option>'));
 assert.ok(src.includes('<option value="normal" selected>중간</option>'));
 assert.ok(src.includes('<option value="hard">어려움</option>'));
 assert.ok(!src.includes('AI 분석: 목표'));
});

test('초대 코드 자동 입장은 청팀 → 홍팀 → 관전석 3자리 순서',()=>{
 const service=new TwelveService();
 const {room,player:first}=service.create('처음');
 const second=service.join(room.code,'두번째');
 const third=service.join(room.code,'세번째');
 const fourth=service.join(room.code,'네번째');
 const fifth=service.join(room.code,'다섯번째');
 assert.equal(service.serialize(room,first.token).side,0);
 assert.equal(service.serialize(room,second.token).side,1);
 for(const viewer of [third,fourth,fifth]){
  assert.equal(service.serialize(room,viewer.token).role,'spectator');
  assert.equal(service.serialize(room,viewer.token).side,null);
 }
 assert.equal(room.spectators.length,3);
 assert.throws(()=>service.join(room.code,'여섯번째'),/관전석 3자리/);
});
test('혼자 청팀에서 홍팀으로 바꿨다면 신규 입장자는 빈 청팀 자동 배정',()=>{
 const service=new TwelveService();
 const {room,player:first}=service.create('처음');
 service.changeTeam(room,first.token,1);
 const second=service.join(room.code,'두번째');
 assert.equal(service.serialize(room,second.token).side,0);
 assert.equal(service.serialize(room,first.token).side,1);
});
test('관전자가 빈 홍팀으로 이동하고 선수가 관전석으로 이동할 수 있다',()=>{
 const service=new TwelveService();
 const {room,player:a}=service.create('방장');
 const b=service.join(room.code,'두번째');
 const watcher=service.join(room.code,'세번째');
 service.ready(room,a.token,true);service.ready(room,b.token,true);
 service.changeSeat(room,b.token,'spectator');
 assert.equal(service.serialize(room,b.token).role,'spectator');
 assert.equal(service.serialize(room,b.token).side,null);
 service.changeSeat(room,watcher.token,1);
 assert.equal(service.serialize(room,watcher.token).role,'player');
 assert.equal(service.serialize(room,watcher.token).side,1);
 assert.equal(room.players.every(p=>!p.ready),true);
 assert.equal(room.players.length,2);
 assert.equal(room.spectators.length,1);
 assert.equal(service.serialize(room,b.token).role,'spectator');
});
test('관전자는 다른 사람이 차지한 팀으로 이동해 선수를 강제로 밀어낼 수 없다',()=>{
 const service=new TwelveService();
 const {room,player:a}=service.create('방장');
 const b=service.join(room.code,'상대');
 const watcher=service.join(room.code,'관중');
 assert.throws(()=>service.changeSeat(room,watcher.token,0),/선수가/);
 assert.throws(()=>service.changeSeat(room,watcher.token,1),/선수가/);
 assert.equal(service.serialize(room,a.token).side,0);
 assert.equal(service.serialize(room,b.token).side,1);
 assert.equal(service.serialize(room,watcher.token).role,'spectator');
});
test('관전석이 3명 모두 사용 중이면 선수의 관전석 이동을 거절',()=>{
 const service=new TwelveService();
 const {room,player:a}=service.create('방장');
 const b=service.join(room.code,'상대');
 for(let i=0;i<3;i++)service.join(room.code,'관중'+i);
 assert.throws(()=>service.changeSeat(room,a.token,'spectator'),/3자리/);
 assert.equal(service.serialize(room,a.token).side,0);
 assert.equal(room.spectators.length,3);
});
test('방장도 관전석으로 옮길 수 있으며 권한은 남은 선수에게 이전된다',()=>{
 const service=new TwelveService();
 const {room,player:a}=service.create('방장');
 const b=service.join(room.code,'상대');
 service.changeSeat(room,a.token,'spectator');
 assert.equal(service.serialize(room,b.token).hostId,b.id);
 assert.throws(()=>service.start(room,a.token),/방장/);
 service.changeSeat(room,a.token,0);
 assert.equal(service.serialize(room,a.token).side,0);
 assert.equal(service.serialize(room,a.token).hostId,b.id);
});
test('선수가 모두 관전석으로 이동하면 새로 입장한 선수가 방장이 된다',()=>{
 const service=new TwelveService();
 const {room,player:a}=service.create('방장');
 service.changeSeat(room,a.token,'spectator');
 assert.equal(room.hostId,null);
 const newcomer=service.join(room.code,'후속 참가자');
 assert.equal(service.serialize(room,newcomer.token).side,0);
 assert.equal(room.hostId,newcomer.id);
});
test('경기 중 새 참가자는 자동으로 관전자이며 팀 이동은 게임 종료 후 준비실에서만 가능',()=>{
 const service=new TwelveService();
 const {room,player:a}=service.create('방장'),b=service.join(room.code,'상대');
 service.ready(room,a.token,true);service.ready(room,b.token,true);
 service.start(room,a.token);
 const viewer=service.join(room.code,'진행 중 관전');
 assert.equal(service.serialize(room,viewer.token).role,'spectator');
 assert.throws(()=>service.changeSeat(room,viewer.token,0),/준비실/);
});
test('초대 링크 UI에서 선수·관전자 역할 선택 메뉴는 숨기고 자동 배정 안내',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'../public/twelve.js'),'utf8');
 assert.ok(!source.includes('id="joinRole"'));
 assert.ok(source.includes('빈 청팀 → 빈 홍팀 → 관전석'));
 assert.ok(source.includes('data-action="seat"'));
});

test('준비실 UI는 관전자에게 비어 있는 팀 입장 버튼, 선수에게 관전석 이동 버튼을 제공',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const original=fs.readFileSync(path.join(__dirname,'../public/twelve.js'),'utf8');
 const code=original.replace(/\(function init\(\)\{[\s\S]*?\}\)\(\);\s*$/,'');
 const root={innerHTML:'',addEventListener(){}},toast={textContent:'',classList:{add(){},remove(){}}};
 const doc={querySelector:q=>q==='#twelveApp'?root:toast,addEventListener(){}};
 const ui=new Function('window','document',code+
 '\nreturn {load:s=>{mode="online";state=s;room=s.room;render();},html:()=>root.innerHTML};')(
 {TwelveEngine:E},doc);
 const service=new TwelveService();
 const {room,player:a}=service.create('처음');
 const watcher=service.join(room.code,'빈 팀 대기','spectator');
 ui.load(service.serialize(room,watcher.token));
 assert.match(ui.html(),/data-action="seat" data-seat="1"/);
 assert.match(ui.html(),/관전 중/);
 assert.doesNotMatch(ui.html(),/data-action="ready"/);
 ui.load(service.serialize(room,a.token));
 assert.match(ui.html(),/data-action="seat" data-seat="spectator"/);
 assert.match(ui.html(),/data-action="ready"/);
});
