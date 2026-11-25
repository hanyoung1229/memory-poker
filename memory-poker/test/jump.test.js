'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const E=require('../lib/jump');
test('새 게임은 단일 발판 방향을 5개 미리 보여주며 점수 0, 초기 점프 제한 1초',()=>{
 const g=E.newRun({rng:()=>.1});
 assert.equal(E.TOTAL_DURATION_MS,30000);
 assert.equal(E.timeLimitMs(0),1000);
 assert.equal(E.timeLimitMs(100),1000*Math.pow(.85,4));
 assert.equal(E.timeLimitMs(1000),200);
 assert.equal(E.MIN_LIMIT_MS,200);
 assert.equal(E.PREVIEW_COUNT,5);
 assert.equal(g.queue.length,5);
 assert.ok(g.queue.every(x=>x==='left'||x==='right'));
 assert.equal(g.score,0);assert.equal(g.ended,false);
});
test('첫 생성과 첫 반복은 50%, 같은 방향이 두 번 이어지면 다음 방향 확률 56%',()=>{
 const g={last:null,streak:0};
 assert.equal(E.chance(g),.5);
 assert.equal(E.nextSide(g,()=>.2),'left');
 assert.equal(E.chance(g),.5);
 assert.equal(E.nextSide(g,()=>.4),'left');
 assert.equal(g.streak,2);
 assert.equal(E.chance(g),.56);
 assert.equal(E.nextSide(g,()=>.55),'left');
 assert.equal(E.chance(g),.62);
 assert.equal(g.streak,3);
});
test('반대 방향이 나오면 연속 보너스 초기화',()=>{
 const g={last:null,streak:0};
 E.nextSide(g,()=>.0);
 E.nextSide(g,()=>.0);
 E.nextSide(g,()=>.0);
 assert.equal(g.streak,3);
 const flipped=E.nextSide(g,()=>.99);
 assert.equal(flipped,'right');
 assert.equal(g.streak,1);
 assert.equal(E.chance(g),.5);
});
test('동일 방향 4회부터는 생성 확률 최대 68%로 고정',()=>{
 const g={last:'right',streak:1};
 assert.equal(E.chance(g),.5);
 g.streak=2;assert.equal(E.chance(g),.56);
 g.streak=3;assert.equal(E.chance(g),.62);
 g.streak=4;assert.ok(Math.abs(E.chance(g)-.68)<1e-10);
 g.streak=50;assert.ok(Math.abs(E.chance(g)-.68)<1e-10);
 assert.equal(E.nextSide(g,()=>.67),'right');
 assert.equal(g.streak,51);
 assert.equal(E.nextSide(g,()=>.7),'left');
 assert.equal(g.streak,1);
 assert.equal(E.chance(g),.5);
});
test('맞는 방향으로 점프하면 1점, 앞 다섯 개의 미리보기를 유지',()=>{
 let c=0;
 const g=E.newRun({rng:()=>c++%2? .92:.05});
 const before=[...g.queue];
 const r=E.jump(g,before[0],{rng:()=>.5});
 assert.equal(r.ok,true);
 assert.equal(r.score,1);
 assert.equal(g.score,1);
 assert.equal(g.jumps,1);
 assert.equal(g.queue.length,5);
 assert.deepEqual(g.queue.slice(0,4),before.slice(1));
 assert.equal(g.history[0].correct,true);
});
test('잘못된 방향 점프는 점수 증가 없이 즉시 게임 종료',()=>{
 const g=E.newRun({rng:()=>0});
 assert.equal(g.queue[0],'left');
 const r=E.jump(g,'right',{rng:()=>0});
 assert.equal(r.ok,false);assert.equal(r.reason,'miss');
 assert.equal(g.ended,true);assert.equal(g.result,'miss');
 assert.equal(g.score,0);
 assert.equal(E.jump(g,'left').reason,'finished');
});
test('유효하지 않은 입력은 게임을 진행하지 않음',()=>{
 const g=E.newRun();
 const before=[...g.queue];
 const result=E.jump(g,'up');
 assert.equal(result.reason,'invalid');
 assert.equal(g.jumps,0);assert.equal(g.score,0);assert.deepEqual(g.queue,before);
});
test('점프 제한시간이 지나면 종료되고 점수는 보존',()=>{
 const g=E.newRun({rng:()=>0});
 E.jump(g,'left',{rng:()=>0});
 E.expire(g);
 assert.equal(g.ended,true);assert.equal(g.result,'time');
 assert.equal(g.score,1);
});
test('UI에 A/D와 좌우 화살표, 모바일 방향 버튼, 발판 다섯 개, 점수·시간이 있다',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/jump.html'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'../public/jump.js'),'utf8');
 assert.match(html,/id="goLeft"/);assert.match(html,/id="goRight"/);
 assert.match(html,/id="totalTimer"/);assert.match(html,/id="score"/);
 assert.match(html,/id="path"/);
 assert.match(js,/ArrowLeft/);assert.match(js,/ArrowRight/);
 assert.match(js,/event\.key==='a'/);assert.match(js,/event\.key==='d'/);
 assert.match(js,/run\.queue\.map/);
 assert.match(js,/E\.timeLimitMs/);
 assert.match(js,/left\/limitMs\*100/);
 assert.match(html,/게이지가 모두 소진되면 아웃/);
 assert.match(html,/id="totalTimer"/);
 assert.match(html,/id="jumpGaugeFill"/);
 assert.doesNotMatch(html,/id="timer"/);
 assert.doesNotMatch(html,/id="time-fill"/);
 assert.match(html,/id="total-time-fill"/);
 assert.match(js,/E\.TOTAL_DURATION_MS/);
});
test('게임은 아이템이나 네트워크 없이 독립된 솔로 게임으로 동작하며 게임클럽에 링크됨',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/jump.html'),'utf8');
 const hub=fs.readFileSync(path.join(__dirname,'../public/hub.html'),'utf8');
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 assert.match(html,/NO ITEMS/);
 assert.match(hub,/href="\/jump"/);
 assert.match(server,/url\.pathname === '\/jump'/);
 assert.match(server,/url\.pathname === '\/jump-engine\.js'/);
});

test('점프 입력은 애니메이션 타이머를 기다리지 않고 연속 처리된다',()=>{
 const uiCode=fs.readFileSync(path.join(__dirname,'../public/jump.js'),'utf8');
 const uiIds=['score','jumpGaugeFill','totalTimer','total-time-fill','best','path','scene','avatar','flash','overlay','overlayTitle','overlayIcon','overlayMessage','overlaySummary','play','reset','goLeft','goRight'];
 const elements=new Map();
 function el(id){
  if(!elements.has(id)){
   const listeners={},set=new Set();
   elements.set(id,{innerHTML:'',textContent:'',hidden:false,disabled:false,offsetWidth:1,style:{},
    classList:{add(...v){v.forEach(x=>set.add(x));},remove(...v){v.forEach(x=>set.delete(x));},toggle(v,on){on?set.add(v):set.delete(v);}},
    addEventListener(type,fn){listeners[type]=fn;},click(){listeners.click?.();}});
  }
  return elements.get(id);
 }
 uiIds.forEach(el);
 const document={getElementById:el,querySelector:()=>el('time-stat'),addEventListener(){}};
 const win={JumpEngine:E},storage={getItem:()=>null,setItem(){}};
 const fakeTimers=[];
 const runCode=new Function('window','document','localStorage','performance','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout',uiCode);
 runCode(win,document,storage,{now:()=>1000},()=>1,()=>{},(cb)=>{fakeTimers.push(cb);return fakeTimers.length;},()=>{});
 win.__splitJump.start();
 const state=win.__splitJump.getState();
 // setTimeout으로 설정된 이전 애니메이션 정리 콜백을 실행하지 않는다.
 for(let i=0;i<20;i++){
  const correct=state.queue[0];
  assert.equal(win.__splitJump.hop(correct),true);
 }
 assert.equal(state.score,20);
 assert.equal(state.jumps,20);
 assert.equal(state.ended,false);
 assert.equal(state.queue.length,5);
 assert.equal(elements.get('score').textContent,'20');
});

