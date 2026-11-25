'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {JumpRanking}=require('../lib/jump-ranking');
const engine=require('../lib/jump');
test('그린 테이블 1등 점수: 최초 기록 저장 후 낮은 점수는 갱신하지 않는다',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jump-rank-'));
 try{
  const file=path.join(dir,'leader.json');
  const ranks=new JumpRanking({file});
  assert.equal(ranks.get(),null);
  assert.equal(ranks.submit('푸른 개구리',12).newRecord,true);
  assert.equal(ranks.get().score,12);
  assert.equal(ranks.get().name,'푸른 개구리');
  assert.equal(ranks.submit('초록',10).newRecord,false);
  assert.equal(ranks.submit('동점',12).newRecord,false);
  assert.equal(ranks.submit('점프왕',18).newRecord,true);
  assert.equal(new JumpRanking({file}).get().score,18);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('점수나 닉네임이 올바르지 않으면 순위 등록을 막는다',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jump-rank-'));
 try{
  const ranking=new JumpRanking({file:path.join(dir,'leader.json')});
  assert.throws(()=>ranking.submit('',3),/닉네임/);
  assert.throws(()=>ranking.submit('악성<>',3),/닉네임/);
  assert.throws(()=>ranking.submit('개구리',-1),/점수/);
  assert.throws(()=>ranking.submit('개구리',1.2),/점수/);
  assert.equal(ranking.submit('개구리',0).newRecord,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('게임 시작 버튼을 누른 후 첫 방향 입력 전에는 45초 타이머가 시작하지 않는다',()=>{
 const script=fs.readFileSync(path.join(__dirname,'../public/jump.js'),'utf8');
 const elements=new Map();
 const el=id=>{
  if(!elements.has(id)){
   const listeners={},classes=new Set();
   elements.set(id,{innerHTML:'',textContent:'',hidden:false,disabled:false,offsetWidth:1,style:{},
    classList:{add(...v){v.forEach(x=>classes.add(x));},remove(...v){v.forEach(x=>classes.delete(x));},toggle(x,enabled){enabled?classes.add(x):classes.delete(x);}},
    addEventListener(name,cb){listeners[name]=cb;},click(){listeners.click?.();}});
  }
  return elements.get(id);
 };
 for(const name of ['score','timer','best','time-fill','path','scene','avatar','flash','overlay','overlayTitle','overlayIcon','overlayMessage','overlaySummary','play','reset','goLeft','goRight','globalLeader','jumpNickname'])el(name);
 let now=1000,animationCalls=0,animationFn=null;
 const window={JumpEngine:engine};
 const document={getElementById:el,querySelector:()=>el('time-stat'),addEventListener(){}};
 const localStorage={getItem:()=>null,setItem(){}};
 new Function('window','document','localStorage','performance','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout','fetch',script)(
  window,document,localStorage,{now:()=>now},fn=>{animationCalls++;animationFn=fn;return animationCalls;},()=>{},()=>1,()=>{},undefined);
 const game=window.__splitJump;
 game.start();
 assert.equal(el('timer').innerHTML,'45.0<small>s</small>');
 assert.equal(animationCalls,0);
 now=30000; // 시작 후 29초 동안 기다려도 시간은 45초
 assert.equal(el('timer').innerHTML,'45.0<small>s</small>');
 assert.equal(animationCalls,0);
 const right=game.getState().queue[0];
 assert.equal(game.hop(right),true);
 assert.equal(animationCalls,1);
 assert.equal(game.getState().score,1);
 now=31000;animationFn(now);
 assert.equal(el('timer').innerHTML,'44.0<small>s</small>');
 now=76000;animationFn(now);
 assert.equal(game.getState().result,'time');
});
test('연못 배경에 연잎, 갈대, 수면 반사 요소가 있고 1등 점수 영역이 표시된다',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/jump.html'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../public/jump.css'),'utf8');
 const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
 assert.match(html,/pond-decor/);assert.match(html,/reeds-left/);
 assert.match(html,/lily-one/);assert.match(css,/\.pond-ripple/);
 assert.match(html,/id="globalLeader"/);
 assert.match(html,/id="jumpNickname"/);
 assert.match(server,/\/api\/jump\/leader/);
});
