import {LocalVad,type CallMicrophone} from './live-vad.ts';
import type {VoiceSessions,VoiceObservation} from './voice-session.ts';
import type {DialogueInput,VoiceDialogueClient} from './voice-dialogue.ts';
import {spokenText} from './speech-text.ts';export {spokenText} from './speech-text.ts';
export type CallPhase='off'|'starting'|'listening'|'recognizing'|'thinking'|'working'|'preparing-audio'|'speaking'|'muted'|'error';
export interface CallState {phase:CallPhase;active:boolean;muted:boolean;title:string;sessionId:string|null;heard:string;said:string;error:string;level:number}
type Dependencies={microphone:CallMicrophone;sessions:VoiceSessions;dialogue:VoiceDialogueClient;ready(signal:AbortSignal):Promise<void>;recognize(audio:Uint8Array,signal:AbortSignal):Promise<string>;synthesize(text:string,signal:AbortSignal):Promise<Uint8Array>;publish(state:CallState):void;silenceMs?:number};
export class LocalVoiceCall {
 private generation=0;private controller?:AbortController;private output?:AbortController;private intent?:AbortController;private answer?:AbortController;private answerInput?:DialogueInput;
 private vad:LocalVad;private pending=0;private tail=Promise.resolve();private seen='';private lastReplyKey='';private lastSpoken='';private lastLevelAt=0;private off?:()=>void;private deferred='';private deferredTask?:DialogueInput;private captureReady=false;private waitingAnnounced=false;private utterances:string[]=[];
 private suppressed=false;private state:CallState={phase:'off',active:false,muted:false,title:'新对话',sessionId:null,heard:'',said:'',error:'',level:0};
 constructor(private deps:Dependencies){this.vad=new LocalVad(16000,deps.silenceMs??900);}
 get active(){return this.state.active;}
 private update(patch:Partial<CallState>){this.state={...this.state,...patch};this.deps.publish({...this.state});}
 async start(){
  if(this.active)return;const generation=++this.generation,controller=new AbortController();this.controller=controller;this.captureReady=false;this.waitingAnnounced=false;this.suppressed=false;this.update({active:true,phase:'starting',error:'',heard:'',said:'',muted:false});
  try{
   await this.deps.ready(controller.signal);if(generation!==this.generation)return;
   const initial=await this.deps.sessions.begin();if(generation!==this.generation)return;
   await this.deps.dialogue.start(initial,controller.signal);if(generation!==this.generation)return;
   this.seen=JSON.stringify([initial.stamp,initial.reply,initial.running,initial.waiting,initial.error,initial.outcome]);this.lastReplyKey=JSON.stringify([initial.replyKey,initial.outcome]);this.lastSpoken='';this.update({title:initial.title,sessionId:initial.sessionId});
   this.off=this.deps.sessions.subscribe(()=>this.observe());await this.deps.microphone.start(frame=>this.feed(frame));if(generation!==this.generation)return;
   this.vad=new LocalVad(this.deps.microphone.sampleRate??16000,this.deps.silenceMs??900);this.captureReady=true;this.update({phase:this.state.muted?'muted':'listening'});this.flush();
   if(initial.waiting){this.seen='';this.observe();}
  }catch(error){if(generation!==this.generation)return;this.stop();this.update({phase:'error',error:error instanceof Error?error.message:String(error)});}
 }
 private feed(frame:Float32Array){
  if(!this.active||!this.captureReady||this.state.muted)return;const result=this.vad.feed(frame),now=performance.now();if(now-this.lastLevelAt>250){this.lastLevelAt=now;this.update({level:Math.min(1,result.level*12)});}
  for(const event of result.events){
   if(event.type==='speech-start'){this.interrupt();this.update({phase:'listening',error:''});}
   else if(event.type==='too-long')this.update({error:'这一句超过 30 秒，请停顿后重新分段说。'});
   else if(event.type==='utterance')this.enqueue(event.audio);
  }
  this.flush();
 }
 private flush(){
  if(!this.active||!this.captureReady||this.vad.inSpeech||this.pending>0||this.intent||this.answer)return;
  if(this.deferredTask){const input=this.deferredTask;this.deferredTask=undefined;this.deferred='';void this.answerTask(input);}
  else if(this.deferred){const text=this.deferred;this.deferred='';void this.say(text);}
 }
 private enqueue(audio:Uint8Array){
  if(this.pending>=2){this.update({error:'还有语音正在识别，请稍候再说。'});return;}
  const generation=this.generation,signal=this.controller!.signal;this.pending++;
  this.tail=this.tail.then(async()=>{
   if(generation!==this.generation||signal.aborted)return;this.update({phase:this.state.muted?'muted':'recognizing',error:''});
   const text=(await this.deps.recognize(audio,signal)).trim();if(generation!==this.generation)return;if(!text){this.update({phase:this.state.muted?'muted':'listening'});return;}this.update({heard:text});
   if(/^(结束通话|结束语音通话|退出语音通话|挂断|请挂断|停止通话|end call|hang up)[。.!！\s]*$/i.test(text)){this.stop();return;}
   if(/^(别说了|停止朗读|停止播报|先别说话|暂停播报|stop speaking|stop reading|be quiet)[。.!！\s]*$/i.test(text)){this.suppressed=true;this.interrupt(true);this.update({phase:this.state.muted?'muted':'listening'});return;}
   this.suppressed=false;
   if(/^(现在进展如何|进展怎么样|进度怎么样|查询进度|现在什么进度|现在进度怎么样|做到哪一步了|what.?s the status|status)[。?？!！\s]*$/i.test(text)){this.deferredTask={mode:'progress',task:this.deps.sessions.snapshot()};return;}
   if(/^(停止当前任务|请停止当前任务|取消当前任务|stop the task|cancel the task)[。.!！\s]*$/i.test(text)){
    this.intent?.abort();this.intent=undefined;this.utterances=[];this.interrupt(true);await this.deps.sessions.cancelTask();if(generation===this.generation)await this.say('好，已经请求停止了。');return;
   }
   if(/^(再说一遍|重复一下|repeat that)[。.!！\s]*$/i.test(text)){await this.say(this.lastSpoken||'我们还没有新的回复。');return;}
   // Recognition stays independent of the model, so corrections and hangup
   // can arrive while the spoken-conversation model is still thinking.
   void this.routeText(text,generation);
  }).catch(error=>{if(generation===this.generation&&!signal.aborted)this.update({phase:'listening',error:error instanceof Error?error.message:String(error)});}).finally(()=>{if(generation===this.generation){this.pending--;this.flush();}});
 }
 private async routeText(text:string,generation:number){
  this.intent?.abort();this.interrupt(true);this.deferred='';this.utterances.push(text);const words=this.utterances.join('\n');
  if(words.length>10000){this.utterances=[];this.intent=undefined;this.update({error:'这次补充较长，请分开说。'});return;}
  const intent=new AbortController();this.intent=intent;const signal=AbortSignal.any([intent.signal,this.controller!.signal]);this.update({phase:'thinking'});
  try{
   const plan=await this.deps.dialogue.respond({mode:'utterance',text:words,task:this.deps.sessions.snapshot()},signal);signal.throwIfAborted();if(generation!==this.generation||this.intent!==intent)return;
   if(plan.action==='delegate'){
    const result=await this.deps.sessions.send(words,signal,plan.context);signal.throwIfAborted();if(generation!==this.generation||this.intent!==intent)return;
    this.utterances=[];this.update({sessionId:result.sessionId,title:result.title,phase:this.state.muted?'muted':'working'});
    if(result.running)this.deferred='好，我来处理。有结果就告诉你。';
   }else{this.utterances=[];this.deferred=plan.reply;}
  }catch(error){if(!signal.aborted&&generation===this.generation){this.utterances=[];this.update({error:error instanceof Error?error.message:String(error)});this.deferred='刚才没能整理好回答，你再说一句试试。';}}
  finally{if(this.intent===intent){this.intent=undefined;this.flush();}}
 }
 private observe(){
  if(!this.active)return;const value=this.deps.sessions.snapshot();if(value.missing){this.stop();this.update({phase:'error',error:'原对话已关闭，本次通话已结束。'});return;}
  this.update({title:value.title,sessionId:value.sessionId});const key=JSON.stringify([value.stamp,value.reply,value.running,value.waiting,value.error,value.outcome]);if(key===this.seen)return;this.seen=key;
  if(value.error){this.update({error:value.error});if(!this.waitingAnnounced){this.waitingAnnounced=true;this.deferredTask={mode:'progress',task:value};this.flush();}return;}
  if(value.waiting){if(!this.waitingAnnounced){this.waitingAnnounced=true;void this.say('这一步需要你确认一下，请在对话里处理。');}return;}this.waitingAnnounced=false;
  const replyKey=JSON.stringify([value.replyKey,value.outcome]);if(!value.running&&(value.reply||value.outcome)&&replyKey!==this.lastReplyKey){this.lastReplyKey=replyKey;this.deferredTask={mode:'result',task:value};if(this.answer)this.interrupt();this.flush();}
 }
 private async answerTask(input:DialogueInput){
  const generation=this.generation,answer=new AbortController();this.answer=answer;this.answerInput=input;const signal=AbortSignal.any([answer.signal,this.controller!.signal]);this.update({phase:'thinking'});
  try{
   const reply=await this.deps.dialogue.respond(input,signal);signal.throwIfAborted();if(generation!==this.generation||this.answer!==answer)return;
   this.answer=undefined;this.answerInput=undefined;await this.say(reply.reply);
  }catch(error){if(!signal.aborted&&generation===this.generation){this.update({error:error instanceof Error?error.message:String(error)});this.answer=undefined;this.answerInput=undefined;await this.say(input.task.waiting?'这一步需要你确认一下，请在对话里处理。':input.task.error?'这一步遇到了问题，具体情况留在对话里了。':input.task.running?'还在处理，有新的进展我会告诉你。':input.task.reply?'结果已经回来，详细内容留在对话里了。':'现在还没有新的结果，你可以告诉我想做什么。');}}
  finally{if(this.answer===answer){this.answer=undefined;this.answerInput=undefined;}this.flush();}
 }
 private async say(text:string){
  text=spokenText(text,500);if(!this.active)return;if(!text||this.suppressed){this.update({phase:this.state.muted?'muted':'listening'});return;}if(!this.captureReady||this.vad.inSpeech||this.pending>0||this.intent){this.deferred=text;return;}
  this.output?.abort();this.deps.microphone.stopPlayback();const generation=this.generation,output=new AbortController();this.output=output;const signal=AbortSignal.any([output.signal,this.controller!.signal]);this.update({phase:'preparing-audio',said:text,error:''});
  try{const wav=await this.deps.synthesize(text,signal);signal.throwIfAborted();if(generation!==this.generation)return;this.lastSpoken=text;this.update({phase:'speaking'});await this.deps.microphone.play(wav,signal);}
  catch(error){if(!signal.aborted&&generation===this.generation)this.update({error:error instanceof Error?error.message:String(error)});}
  finally{if(generation===this.generation&&this.output===output){this.output=undefined;this.update({phase:this.state.muted?'muted':'listening'});}}
 }
 interrupt(clear=false){
  this.output?.abort();this.output=undefined;this.deps.microphone.stopPlayback();
  if(this.answer){if(!clear&&!this.deferredTask&&this.answerInput)this.deferredTask=this.answerInput;this.answerInput=undefined;this.answer.abort();this.answer=undefined;}
  if(clear){this.deferredTask=undefined;this.deferred='';}
 }
 mute(){if(!this.active)return;const muted=!this.state.muted;this.vad.reset();this.deps.microphone.mute(muted);this.update({muted,phase:muted?'muted':'listening',level:0});}
 stop(){++this.generation;this.captureReady=false;this.controller?.abort();this.controller=undefined;this.intent?.abort();this.intent=undefined;this.utterances=[];this.interrupt(true);this.off?.();this.off=undefined;this.deps.microphone.stop();this.deps.dialogue.end();this.deps.sessions.end();this.vad.reset();this.pending=0;this.tail=Promise.resolve();this.update({active:false,phase:'off',muted:false,level:0,error:''});}
}
