'use strict';
// 십이장기 AI 탐색은 별도 워커에서 실행해 모바일 말판 UI를 멈추지 않게 한다.
importScripts('/twelve-engine.js');
self.onmessage=function(event){
 const task=event.data||{};
 if(task.type!=='search')return;
 try{
  const result=self.TwelveEngine.analyzeMove(task.state,task.difficulty);
  self.postMessage({type:'result',requestId:task.requestId,result});
 }catch(e){
  self.postMessage({type:'error',requestId:task.requestId,message:String(e?.message||e)});
 }
};
