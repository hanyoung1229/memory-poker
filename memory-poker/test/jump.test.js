'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const E=require('../lib/jump');
test('새 게임은 단일 발판 방향을 4개 미리 보여주며 점수 0, 제한 45초',()=>{
 const g=E.newRun({rng:()=>.1});
 assert.equal(E.DURATION_MS,45000);
 assert.equal(E.PREVIEW_COUNT,4);
 assert.equal(g.queue.length,4);
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
test('연속 방향 확률은 100%를 초과하지 않음',()=>{
 const g={last:'right',streak:50};
 assert.equal(E.chance(g),1);
 assert.equal(E.nextSide(g,()=>.999),'right');
 assert.equal(g.streak,51);
});
test('맞는 방향으로 점프하면 1점, 앞 네 개의 미리보기를 유지',()=>{
 let c=0;
 const g=E.newRun({rng:()=>c++%2? .92:.05});
 const before=[...g.queue];
 const r=E.jump(g,before[0],{rng:()=>.5});
 assert.equal(r.ok,true);
 assert.equal(r.score,1);
 assert.equal(g.score,1);
 assert.equal(g.jumps,1);
 assert.equal(g.queue.length,4);
 assert.deepEqual(g.queue.slice(0,3),before.slice(1));
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
test('45초 시간이 지나면 종료되고 점수는 보존',()=>{
 const g=E.newRun({rng:()=>0});
 E.jump(g,'left',{rng:()=>0});
 E.expire(g);
 assert.equal(g.ended,true);assert.equal(g.result,'time');
 assert.equal(g.score,1);
});
test('UI에 A/D와 좌우 화살표, 모바일 방향 버튼, 발판 네 개, 점수·시간이 있다',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/jump.html'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'../public/jump.js'),'utf8');
 assert.match(html,/id="goLeft"/);assert.match(html,/id="goRight"/);
 assert.match(html,/id="timer"/);assert.match(html,/id="score"/);
 assert.match(html,/id="path"/);
 assert.match(js,/ArrowLeft/);assert.match(js,/ArrowRight/);
 assert.match(js,/event\.key==='a'/);assert.match(js,/event\.key==='d'/);
 assert.match(js,/run\.queue\.map/);
 assert.match(js,/E\.DURATION_MS/);
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
