'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const raw=fs.readFileSync(path.join(__dirname,'../public/gradient.js'),'utf8');
const withoutStartup=raw.replace(/\(function init\(\)\{[\s\S]*?\}\)\(\);\s*$/,'');
assert.notEqual(withoutStartup,raw,'테스트에서만 앱 초기화 루틴 제외');
function harness(){
 const root={innerHTML:'',addEventListener(){}},toast={textContent:'',classList:{add(){},remove(){}}};
 const doc={querySelector:selector=>selector==='#gradientApp'?root:toast};
 const sent=[];
 const fetch=async(url,options)=>{sent.push({url,options});return {ok:true,json:async()=>({ok:true})};};
 const game=new Function('document','location','fetch','URLSearchParams',withoutStartup+
 '\nreturn {state(v){state=v;room=v.room;token="test-token";},render:game,preview:opponentCylinderPreview,action};')(
 doc,{search:'',origin:'https://example.test'},fetch,class URLSearchParamsStub {constructor(){}});
 return {game,root,sent};
}
const firstState={
 room:'ABCDEF',stage:'pick',round:1,turn:1,you:1,firstPick:{player:0,index:3},
 players:[
 {name:'선공',ready:true,points:0,used:Array(7).fill(false),tubes:null},
 {name:'후공',ready:true,points:0,used:Array(7).fill(false),tubes:[0,1,2,3,4,5,6]}],
 history:[],result:null,endsAt:null,serverNow:0
};
test('후공 화면에 상대의 4번 흰 원통 실물 모양을 표시하되 숫자는 비공개',()=>{
 const x=harness();x.game.state({...firstState});const view=x.game.render();
 assert.match(view,/OPPONENT SELECTED/);
 assert.match(view,/선공님의 선택/);
 assert.match(view,/4번 원통/);
 assert.match(view,/class="opponent-picked-cylinder light"/);
 assert.match(view,/style="--cup:#f0f0eb"/);
 assert.match(view,/aria-label="비공개 숫자">\?<\/span>/);
 assert.equal(x.sent.length,0);
});
test('검정·검회색·회색·흰색 원통은 고정 위치별 실제 색상을 따른다',()=>{
 const x=harness();
 for(const [i,color] of [[0,'#101218'],[1,'#383d46'],[2,'#858b93'],[3,'#f0f0eb'],[4,'#858b93'],[5,'#383d46'],[6,'#101218']]){
  x.game.state({...firstState,firstPick:{player:0,index:i}});
  const view=x.game.preview({player:0,index:i});
  assert.match(view,new RegExp('--cup:'+color));
  assert.match(view,new RegExp((i+1)+'번 원통'));
  assert.doesNotMatch(view,/>[0-9]<\/span>/);
 }
});
test('원통은 한 번 클릭하면 선택만 되고 확정 버튼을 눌러야 서버에 전송',async()=>{
 const x=harness();x.game.state({...firstState,firstPick:null});
 await x.game.action('cup',{dataset:{index:'4'}});
 assert.equal(x.sent.length,0);
 assert.match(x.root.innerHTML,/5번 원통을 제시할까요/);
 await x.game.action('confirmPick',{dataset:{}});
 assert.equal(x.sent.length,1);
 assert.equal(x.sent[0].url,'/api/gradient/rooms/ABCDEF/pick');
 assert.deepEqual(JSON.parse(x.sent[0].options.body),{index:4});
});
test('아무도 제시하지 않았으면 상대 원통 공개 카드를 표시하지 않는다',()=>{
 const x=harness();x.game.state({...firstState,firstPick:null});
 assert.doesNotMatch(x.game.render(),/opponent-pick-stage/);
});
