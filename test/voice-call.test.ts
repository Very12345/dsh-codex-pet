import test from 'node:test';import assert from 'node:assert/strict';import {LocalVoiceCall,spokenText,type CallState} from '../src/voice-call.ts';import type {VoiceObservation,VoiceSessions} from '../src/voice-session.ts';import type {CallMicrophone} from '../src/live-vad.ts';
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function fixture(){
 let frame!:(value:Float32Array)=>void,listener=()=>{},state!:CallState,recognized='执行测试任务',sends=0,cancels=0,micStops=0,outputStops=0;const spoken:string[]=[];
 let observation:VoiceObservation={sessionId:'a',title:'A',running:false,waiting:false,error:null,reply:'以前的回复',replyKey:'old',stamp:'1'};
 const sessions:VoiceSessions={async begin(){return observation;},async send(){sends++;observation={...observation,running:true};return observation;},snapshot:()=>observation,subscribe(fn){listener=fn;return()=>{listener=()=>{};};},async cancelTask(){cancels++;},end(){},dispose(){}};
 const microphone:CallMicrophone={async start(fn){frame=fn;},mute(){},async play(){},stopPlayback(){outputStops++;},stop(){micStops++;}};
 const deps={sessions,microphone,async ready(){},async recognize(){return recognized;},async synthesize(text:string){spoken.push(text);return new Uint8Array(44);},publish(next:CallState){state=next;}};
 const call=new LocalVoiceCall(deps);
 return {call,deps,spoken,get state(){return state;},get sends(){return sends;},get cancels(){return cancels;},get stops(){return micStops;},get outputStops(){return outputStops;},setRecognized(text:string){recognized=text;},utterance(){frame(new Float32Array(4096).fill(.1));frame(new Float32Array(4096).fill(.1));for(let i=0;i<5;i++)frame(new Float32Array(4096));},speechStart(){frame(new Float32Array(4096).fill(.1));frame(new Float32Array(4096).fill(.1));},observe(value:Partial<VoiceObservation>){observation={...observation,...value};listener();}};
}
test('local call auto-submits utterances to the pinned session, reads new final output once and leaves tasks running on hangup',async()=>{
 const x=fixture();await x.call.start();assert.equal(x.state.phase,'listening');assert.equal(x.spoken.length,0);x.utterance();await flush();await flush();assert.equal(x.sends,1);x.observe({running:false,reply:'新的任务结果',replyKey:'new',stamp:'2'});await flush();await flush();assert.deepEqual(x.spoken,['新的任务结果']);x.observe({stamp:'3'});await flush();assert.equal(x.spoken.length,1);x.call.stop();assert.equal(x.cancels,0);assert.equal(x.stops,1);assert.equal(x.state.active,false);
});
test('status and explicit stop commands are local controls; interrupting audio does not cancel work',async()=>{
 const x=fixture();await x.call.start();x.setRecognized('查询进度');x.utterance();await flush();await flush();assert.equal(x.sends,0);assert.ok(x.spoken[0].includes('以前的回复'));const before=x.outputStops;x.speechStart();assert.ok(x.outputStops>before);assert.equal(x.cancels,0);x.call.mute();x.call.mute();x.setRecognized('停止当前任务');x.utterance();await flush();await flush();assert.equal(x.cancels,1);assert.equal(x.sends,0);x.call.stop();
});
test('hangup while recognition is pending prevents a late transcript from starting work',async()=>{
 const x=fixture();let resolve!:(value:string)=>void;x.deps.recognize=()=>new Promise<string>(done=>{resolve=done;});await x.call.start();x.utterance();await flush();x.call.stop();resolve('迟到的任务');await flush();assert.equal(x.sends,0);assert.equal(x.state.phase,'off');
});
test('permission failure cleans up the call without activating microphone capture',async()=>{
 const x=fixture();x.deps.ready=async()=>{throw new Error('local recognizer missing');};await x.call.start();assert.equal(x.state.phase,'error');assert.equal(x.state.active,false);assert.equal(x.stops,1);
 assert.equal(spokenText('说明\n```js\nsecret_code()\n```\n[链接](https://example.com)'), '说明 代码内容请查看对话。 链接');
});
test('new speech interrupts pending audio playback while the backend task continues',async()=>{
 const x=fixture();let interrupted=false;x.deps.microphone.play=async(_wav,signal)=>await new Promise<void>((_resolve,reject)=>{signal.addEventListener('abort',()=>{interrupted=true;reject(new Error('interrupted'));},{once:true});});await x.call.start();x.observe({reply:'正在播放的回复',replyKey:'playing',stamp:'2'});await flush();assert.equal(x.state.phase,'speaking');x.speechStart();await flush();assert.equal(interrupted,true);assert.equal(x.cancels,0);assert.equal(x.state.phase,'listening');x.call.stop();
});
test('removing the pinned target ends microphone capture without creating a replacement task',async()=>{
 const x=fixture();await x.call.start();x.observe({missing:true,stamp:'closed'});assert.equal(x.state.active,false);assert.equal(x.state.phase,'error');assert.equal(x.stops,1);assert.equal(x.sends,0);
});
test('reply and repeat playback use the same filtered prose, and emoji-only replies stay silent',async()=>{
 const x=fixture();await x.call.start();x.observe({reply:'✅ **已完成**，路径 `C:\\test\\a.txt`。👩🏽‍💻',replyKey:'filtered',stamp:'2'});await flush();await flush();assert.deepEqual(x.spoken,['已完成，路径 本地路径。']);assert.equal(x.state.said,x.spoken[0]);
 x.setRecognized('再说一遍');x.utterance();await flush();await flush();assert.deepEqual(x.spoken,['已完成，路径 本地路径。','已完成，路径 本地路径。']);
 x.observe({reply:'✅ 👍🏽',replyKey:'decoration',stamp:'3'});await flush();assert.equal(x.spoken.length,2);x.call.stop();
});
test('results arriving during microphone preparation wait for capture readiness, and request notices are not repeated',async()=>{
 const x=fixture();let ready!:()=>void;const start=x.deps.microphone.start;x.deps.microphone.start=async fn=>{await start(fn);await new Promise<void>(resolve=>{ready=resolve;});};const pending=x.call.start();await flush();x.observe({reply:'准备期间的结果',replyKey:'late-result',stamp:'2'});await flush();assert.equal(x.spoken.length,0);ready();await pending;await flush();assert.deepEqual(x.spoken,['准备期间的结果']);x.observe({waiting:true,stamp:'3'});await flush();const count=x.spoken.length;x.observe({waiting:true,stamp:'4'});await flush();assert.equal(x.spoken.length,count);x.call.stop();
});
