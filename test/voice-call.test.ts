import test from 'node:test';import assert from 'node:assert/strict';import {LocalVoiceCall,spokenText,type CallState} from '../src/voice-call.ts';import type {VoiceObservation,VoiceSessions} from '../src/voice-session.ts';import type {DialogueInput,DialogueReply} from '../src/voice-dialogue.ts';import type {CallMicrophone} from '../src/live-vad.ts';
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
function fixture(){
 let frame!:(value:Float32Array)=>void,listener=()=>{},state!:CallState,recognized='执行测试任务',sends=0,cancels=0,micStops=0,outputStops=0;const spoken:string[]=[];
 let observation:VoiceObservation={sessionId:'a',title:'A',running:false,waiting:false,error:null,reply:'以前的回复',replyKey:'old',stamp:'1'};
 const sessions:VoiceSessions={async begin(){return observation;},async send(){sends++;observation={...observation,running:true};return observation;},snapshot:()=>observation,subscribe(fn){listener=fn;return()=>{listener=()=>{};};},async cancelTask(){cancels++;},end(){},dispose(){}};
 const microphone:CallMicrophone={async start(fn){frame=fn;},mute(){},async play(){},stopPlayback(){outputStops++;},stop(){micStops++;}};
 const deps={sessions,microphone,dialogue:{async start(){},async respond(input:DialogueInput):Promise<DialogueReply>{return {action:input.mode==='utterance'?'delegate':'reply',reply:input.task.reply};},end(){}},async ready(){},async recognize(){return recognized;},async synthesize(text:string){spoken.push(text);return new Uint8Array(44);},publish(next:CallState){state=next;}};
 const call=new LocalVoiceCall(deps);
 return {call,deps,spoken,get state(){return state;},get sends(){return sends;},get cancels(){return cancels;},get stops(){return micStops;},get outputStops(){return outputStops;},setRecognized(text:string){recognized=text;},utterance(){frame(new Float32Array(4096).fill(.1));frame(new Float32Array(4096).fill(.1));for(let i=0;i<5;i++)frame(new Float32Array(4096));},speechStart(){frame(new Float32Array(4096).fill(.1));frame(new Float32Array(4096).fill(.1));},observe(value:Partial<VoiceObservation>){observation={...observation,...value};listener();}};
}
test('local call auto-submits utterances to the pinned session, reads new final output once and leaves tasks running on hangup',async()=>{
 const x=fixture();await x.call.start();assert.equal(x.state.phase,'listening');assert.equal(x.spoken.length,0);x.utterance();await flush();await flush();assert.equal(x.sends,1);x.observe({running:false,reply:'新的任务结果',replyKey:'new',stamp:'2'});await flush();await flush();assert.deepEqual(x.spoken,['好，我来处理。有结果就告诉你。','新的任务结果']);x.observe({stamp:'3'});await flush();assert.equal(x.spoken.length,2);x.call.stop();assert.equal(x.cancels,0);assert.equal(x.stops,1);assert.equal(x.state.active,false);
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
test('ordinary spoken chat and follow-up do not submit or steer a native task',async()=>{
 const x=fixture();const inputs:DialogueInput[]=[];x.deps.dialogue.respond=async input=>{inputs.push(input);return {action:'reply',reply:input.text==='你好'?'你好，我在。':'我刚才是在和你打招呼。'};};await x.call.start();x.setRecognized('你好');x.utterance();await flush();await flush();x.setRecognized('你刚才说什么');x.utterance();await flush();await flush();assert.equal(x.sends,0);assert.equal(x.cancels,0);assert.deepEqual(x.spoken,['你好，我在。','我刚才是在和你打招呼。']);assert.equal(inputs.length,2);x.call.stop();
});
test('long backend results are summarized before synthesis, with no directory name read aloud',async()=>{
 const x=fixture();let raw='';x.deps.dialogue.respond=async input=>{raw=input.task.reply;return {action:'reply',reply:'已经保存了改动，但还缺一项依赖，检查没有通过。'};};await x.call.start();x.observe({reply:'directory-name/'.repeat(200)+'检查失败，缺少依赖。',replyKey:'full',stamp:'2'});await flush();await flush();assert.ok(raw.endsWith('缺少依赖。'));assert.deepEqual(x.spoken,['已经保存了改动，但还缺一项依赖，检查没有通过。']);x.call.stop();
});
test('recognition continues while the conversation model waits; latest correction cancels stale delegation',async()=>{
 const x=fixture();const waiting:{input:DialogueInput;resolve:(reply:DialogueReply)=>void}[]=[];x.deps.dialogue.respond=input=>new Promise(resolve=>waiting.push({input,resolve}));await x.call.start();x.setRecognized('整理第一个项目');x.utterance();await flush();x.setRecognized('不对，整理第二个');x.utterance();await flush();assert.equal(waiting.length,2);assert.equal(waiting[1].input.text,'整理第一个项目\n不对，整理第二个');waiting[0].resolve({action:'delegate',reply:'好的。'});await flush();assert.equal(x.sends,0);waiting[1].resolve({action:'delegate',reply:'好的。'});await flush();await flush();assert.equal(x.sends,1);x.call.stop();
});
test('hangup while the spoken model thinks prevents late delegation and audio playback',async()=>{
 const x=fixture();let resolve!:(value:DialogueReply)=>void;x.deps.dialogue.respond=()=>new Promise(done=>{resolve=done;});await x.call.start();x.utterance();await flush();x.call.stop();resolve({action:'delegate',reply:'好的。'});await flush();assert.equal(x.sends,0);assert.equal(x.spoken.length,0);
});
test('dialogue failure speaks a short status without reading the backend directory listing or claiming success',async()=>{
 const x=fixture();x.deps.dialogue.respond=async()=>{throw new Error('model unavailable');};await x.call.start();x.observe({reply:'C:\\very-long-project\\file.ts',replyKey:'failed-rewrite',stamp:'2',error:'检查失败'});await flush();await flush();assert.deepEqual(x.spoken,['这一步遇到了问题，具体情况留在对话里了。']);assert.equal(x.sends,0);x.call.stop();
});
test('a completed marker arriving after the same reply does not summarize or speak it twice; cancellation remains a new fact',async()=>{
 const x=fixture(),inputs:DialogueInput[]=[];x.deps.dialogue.respond=async input=>{inputs.push(input);return {action:'reply',reply:input.task.outcome==='cancelled'?'任务已停止，尚未完成。':'当前就在这个工作目录。'};};await x.call.start();
 x.observe({reply:'当前工作目录是测试项目。',replyKey:'directory',stamp:'2'});await flush();await flush();
 x.observe({outcome:'completed',stamp:'3'});await flush();await flush();assert.equal(inputs.length,1);assert.deepEqual(x.spoken,['当前就在这个工作目录。']);
 x.observe({outcome:'cancelled',stamp:'4'});await flush();await flush();assert.equal(inputs.length,2);assert.equal(x.spoken.at(-1),'任务已停止，尚未完成。');x.call.stop();
});
test('modern task output waits for its terminal event and distinct turns can report identical text',async()=>{
 const x=fixture(),inputs:DialogueInput[]=[];x.deps.dialogue.respond=async input=>{inputs.push(input);return {action:'reply',reply:'这是本轮结果。'};};await x.call.start();
 x.observe({reply:'相同的任务事实',replyKey:'same',resultKey:'turn-one',settled:false,stamp:'2'});await flush();assert.equal(inputs.length,0);
 x.observe({outcome:'completed',settled:true,stamp:'3'});await flush();await flush();assert.equal(inputs.length,1);assert.equal(inputs[0].task.outcome,'completed');
 x.observe({stamp:'4'});await flush();assert.equal(inputs.length,1);
 x.observe({running:true,outcome:undefined,settled:false,resultKey:'turn-two',stamp:'5'});x.observe({running:false,outcome:'completed',settled:true,stamp:'6'});await flush();await flush();assert.equal(inputs.length,2);x.call.stop();
});
