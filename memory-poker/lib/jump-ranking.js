'use strict';
const fs=require('node:fs');
const path=require('node:path');

// 단일 서버의 최고점 저장소. Render 무료 인스턴스의 임시 디스크에서는
// 배포/재시작 시 값이 초기화될 수 있으므로 영구 DB가 필요한 경우 교체해야 한다.
class JumpRanking {
 constructor({file=process.env.JUMP_RANKING_FILE||path.join(__dirname,'..','.data','jump-ranking.json'),fsModule=fs}={}){
  this.file=file;this.fs=fsModule;this.leader=null;
  try{
   const saved=JSON.parse(this.fs.readFileSync(this.file,'utf8'));
   if(saved&&Number.isSafeInteger(saved.score)&&saved.score>0&&saved.score<=10000&&
      typeof saved.name==='string'&&saved.name.length<=16)this.leader={name:saved.name,score:saved.score,at:saved.at||null};
  }catch{}
 }
 get(){return this.leader?{...this.leader}:null;}
 submit(name,score){
  const clean=typeof name==='string'?name.trim().replace(/\s+/g,' ').slice(0,12):'';
  if(!clean||!/^[\p{L}\p{N}_ .-]{1,12}$/u.test(clean))throw Error('닉네임은 1~12자의 문자·숫자로 입력해 주세요.');
  if(!Number.isSafeInteger(score)||score<0||score>10000)throw Error('점수를 확인해 주세요.');
  if(score===0)return {leader:this.get(),newRecord:false};
  if(this.leader&&this.leader.score>=score)return {leader:this.get(),newRecord:false};
  const next={name:clean,score,at:new Date().toISOString()};
  // 쓰기 실패 시 기록을 저장했다고 주장하지 않음.
  this.fs.mkdirSync(path.dirname(this.file),{recursive:true});
  const tmp=this.file+'.tmp';
  this.fs.writeFileSync(tmp,JSON.stringify(next)+'\n',{encoding:'utf8',mode:0o600});
  this.fs.renameSync(tmp,this.file);
  this.leader=next;
  return {leader:this.get(),newRecord:true};
 }
}
module.exports={JumpRanking};
