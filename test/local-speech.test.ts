import test from 'node:test';import assert from 'node:assert/strict';import {WindowsSpeech} from '../src/local-speech.ts';
import {EventEmitter} from 'node:events';import {PassThrough} from 'node:stream';import type {ChildProcessWithoutNullStreams} from 'node:child_process';
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
function fakeSpeech(){
 const children:(EventEmitter&{stdout:PassThrough;stderr:PassThrough;stdin:PassThrough;killed:boolean;kill():boolean})[]=[];
 const launch=()=>{const child=Object.assign(new EventEmitter(),{stdout:new PassThrough(),stderr:new PassThrough(),stdin:new PassThrough(),killed:false,kill(){this.killed=true;return true;}});children.push(child);return child as unknown as ChildProcessWithoutNullStreams;};
 const speech=new WindowsSpeech('win32',launch),wav=Buffer.alloc(44);wav.write('RIFF');wav.write('WAVE',8);
 const complete=(index:number)=>{children[index].emit('exit',0);children[index].stdout.write(wav.toString('base64'));children[index].emit('close',0);};
 return {speech,children,complete};
}
test('a burst of four synthesis requests waits serially instead of claiming Windows is busy, and drains stdout after exit',async t=>{
 const x=fakeSpeech();t.after(()=>x.speech.dispose());const requests=Array.from({length:4},(_,i)=>x.speech.synthesize('请求'+i,'',0,'zh',new AbortController().signal));
 for(let i=0;i<4;i++){await tick();assert.equal(x.children.length,i+1);x.complete(i);assert.equal((await requests[i]).length,44);}await Promise.all(requests);
});
test('cancelled active and queued requests cannot overlap a replacement process or block later speech',async t=>{
 const x=fakeSpeech();t.after(()=>x.speech.dispose());const active=new AbortController(),queued=new AbortController();
 const first=x.speech.synthesize('旧回复','',0,'zh',active.signal),firstRejected=assert.rejects(first,/取消/);
 const second=x.speech.synthesize('旧排队','',0,'zh',queued.signal),secondRejected=assert.rejects(second,/取消/);
 const third=x.speech.synthesize('新回复','',0,'zh',new AbortController().signal);await tick();assert.equal(x.children.length,1);
 active.abort();queued.abort();await Promise.all([firstRejected,secondRejected]);await tick();assert.equal(x.children[0].killed,true);assert.equal(x.children.length,1);
 x.children[0].emit('close',null);await tick();assert.equal(x.children.length,2);x.complete(1);assert.equal((await third).length,44);
});
test('disposal cancels waiting synthesis without spawning it and rejects new requests',async()=>{
 const x=fakeSpeech();const first=x.speech.synthesize('正在生成','',0,'zh',new AbortController().signal),firstRejected=assert.rejects(first,/取消/);
 const second=x.speech.synthesize('正在排队','',0,'zh',new AbortController().signal),secondRejected=assert.rejects(second,/取消/);await tick();x.speech.dispose();await Promise.all([firstRejected,secondRejected]);
 x.children[0].emit('close',null);await tick();assert.equal(x.children.length,1);await assert.rejects(x.speech.synthesize('已关闭','',0,'zh',new AbortController().signal),/已关闭/);
});
test('Windows local synthesis produces a valid WAV without playing it or using a cloud API',{skip:process.platform!=='win32'},async t=>{
 const speech=new WindowsSpeech();t.after(()=>speech.dispose());const voices=await speech.voices();assert.ok(voices.some(voice=>voice.language.startsWith('zh')));const wav=await speech.synthesize('你好，这是本地语音验证。',voices.find(voice=>voice.language.startsWith('zh'))!.name,0,'zh',new AbortController().signal);assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');assert.ok(wav.length>1000);await assert.rejects(speech.synthesize('x'.repeat(501),'',0,'zh',new AbortController().signal),/参数/);
});
