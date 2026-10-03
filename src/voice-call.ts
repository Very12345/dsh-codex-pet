import {LocalVad,type CallMicrophone} from './live-vad.ts';import type {VoiceSessions,VoiceObservation} from './voice-session.ts';
import {spokenText} from './speech-text.ts';export {spokenText} from './speech-text.ts';
export type CallPhase='off'|'starting'|'listening'|'recognizing'|'working'|'preparing-audio'|'speaking'|'muted'|'error';
export interface CallState {phase:CallPhase;active:boolean;muted:boolean;title:string;sessionId:string|null;heard:string;said:string;error:string;level:number}
type Dependencies={microphone:CallMicrophone;sessions:VoiceSessions;ready(signal:AbortSignal):Promise<void>;recognize(audio:Uint8Array,signal:AbortSignal):Promise<string>;synthesize(text:string,signal:AbortSignal):Promise<Uint8Array>;publish(state:CallState):void;silenceMs?:number};
export class LocalVoiceCall {
 private generation=0;private controller?:AbortController;private output?:AbortController;private vad:LocalVad;private pending=0;private tail=Promise.resolve();private seen='';private lastReplyKey='';private lastSpoken='';private lastLevelAt=0;private off?:()=>void;private deferred='';private captureReady=false;private waitingAnnounced=false;
 private state:CallState={phase:'off',active:false,muted:false,title:'新对话',sessionId:null,heard:'',said:'',error:'',level:0};
 constructor(private deps:Dependencies){this.vad=new LocalVad(16000,deps.silenceMs??900);}
 get active(){return this.state.active;}
 private update(patch:Partial<CallState>){this.state={...this.state,...patch};this.deps.publish({...this.state});}
 async start(){
  if(this.active)return;const generation=++this.generation,controller=new AbortController();this.controller=controller;this.captureReady=false;this.waitingAnnounced=false;this.update({active:true,phase:'starting',error:'',heard:'',said:'',muted:false});
  try{await this.deps.ready(controller.signal);if(generation!==this.generation)return;const initial=await this.deps.sessions.begin();if(generation!==this.generation)return;this.seen=JSON.stringify([initial.stamp,initial.reply,initial.running,initial.waiting,initial.error]);this.lastReplyKey=initial.replyKey;this.lastSpoken='';this.update({title:initial.title,sessionId:initial.sessionId});this.off=this.deps.sessions.subscribe(()=>this.observe());await this.deps.microphone.start(frame=>this.feed(frame));if(generation!==this.generation)return;this.vad=new LocalVad(this.deps.microphone.sampleRate??16000,this.deps.silenceMs??900);this.captureReady=true;this.update({phase:this.state.muted?'muted':'listening'});if(this.deferred){const text=this.deferred;this.deferred='';void this.say(text);}else if(initial.waiting){this.seen='';this.observe();}}
  catch(error){if(generation!==this.generation)return;this.stop();this.update({phase:'error',error:error instanceof Error?error.message:String(error)});}
 }
 private feed(frame:Float32Array){
  if(!this.active||!this.captureReady||this.state.muted)return;const result=this.vad.feed(frame),now=performance.now();if(now-this.lastLevelAt>250){this.lastLevelAt=now;this.update({level:Math.min(1,result.level*12)});}
  for(const event of result.events){
   if(event.type==='speech-start'){this.interrupt();this.update({phase:'listening',error:''});}
   else if(event.type==='too-long')this.update({error:'这一句超过 30 秒，请停顿后重新分段说。'});
   else if(event.type==='utterance')this.enqueue(event.audio);
  }
  if(!this.vad.inSpeech&&this.pending===0&&this.deferred){const text=this.deferred;this.deferred='';void this.say(text);}
 }
 private enqueue(audio:Uint8Array){
  if(this.pending>=2){this.update({error:'还有语音正在识别，请稍候再说。'});return;}
  const generation=this.generation,signal=this.controller!.signal;this.pending++;
  const job=this.tail.then(async()=>{
   if(generation!==this.generation||signal.aborted)return;this.update({phase:this.state.muted?'muted':'recognizing',error:''});const text=(await this.deps.recognize(audio,signal)).trim();if(generation!==this.generation)return;if(!text){this.update({phase:this.state.muted?'muted':'listening'});return;}
   this.update({heard:text});
   if(/^(结束通话|结束语音通话|退出语音通话|挂断|请挂断|停止通话|end call|hang up)[。.!！\s]*$/i.test(text)){this.stop();return;}
   if(/^(别说了|停止朗读|停止播报|先别说话|暂停播报|stop speaking|stop reading|be quiet)[。.!！\s]*$/i.test(text)){this.interrupt();this.update({phase:this.state.muted?'muted':'listening'});return;}
   if(/^(现在进展如何|进展怎么样|进度怎么样|查询进度|现在什么进度|现在进度怎么样|做到哪一步了|what.?s the status|status)[。?？!！\s]*$/i.test(text)){await this.say(this.progress(this.deps.sessions.snapshot()));return;}
   if(/^(停止当前任务|请停止当前任务|取消当前任务|stop the task|cancel the task)[。.!！\s]*$/i.test(text)){await this.deps.sessions.cancelTask();await this.say('已请求停止当前任务。');return;}
   if(/^(再说一遍|重复一下|repeat that)[。.!！\s]*$/i.test(text)){await this.say(this.lastSpoken||'暂时没有可重复的回复。');return;}
   this.deferred='';const result=await this.deps.sessions.send(text,signal);if(generation!==this.generation)return;this.update({phase:this.state.muted?'muted':'working',sessionId:result.sessionId,title:result.title});
  }).catch(error=>{if(generation===this.generation&&!signal.aborted)this.update({phase:'listening',error:error instanceof Error?error.message:String(error)});}).finally(()=>{if(generation===this.generation){this.pending--;if(this.pending===0&&this.deferred&&!this.vad.inSpeech){const text=this.deferred;this.deferred='';void this.say(text);}}});
  this.tail=job;
 }
 private progress(value:VoiceObservation){return value.waiting?'任务正在等待你的审批或回答，请在对话中处理。':value.error?'任务遇到问题。'+value.error:value.running?'任务仍在进行。'+(value.reply?spokenText(value.reply):'暂时没有新的结果。'):value.reply?'任务已结束。'+spokenText(value.reply):'当前没有正在运行的任务。';}
 private observe(){
  if(!this.active)return;const value=this.deps.sessions.snapshot();if(value.missing){this.stop();this.update({phase:'error',error:'原对话已关闭，本次通话已结束。'});return;}this.update({title:value.title,sessionId:value.sessionId});const key=JSON.stringify([value.stamp,value.reply,value.running,value.waiting,value.error]);if(key===this.seen)return;this.seen=key;
  if(value.error){this.update({error:value.error});return;}
  if(value.waiting){if(!this.waitingAnnounced){this.waitingAnnounced=true;void this.say('任务需要你的审批或回答，请在对话中处理。');}return;}this.waitingAnnounced=false;
  if(!value.running&&value.reply&&value.replyKey!==this.lastReplyKey){this.lastReplyKey=value.replyKey;void this.say(spokenText(value.reply));}
 }
 private async say(text:string){
  text=spokenText(text);if(!this.active||!text)return;if(!this.captureReady||this.vad.inSpeech||this.pending>0){this.deferred=text;return;}this.interrupt();const generation=this.generation,output=new AbortController();this.output=output;const signal=AbortSignal.any([output.signal,this.controller!.signal]);
  this.lastSpoken=text;this.update({phase:'preparing-audio',said:text,error:''});
  try{const wav=await this.deps.synthesize(text,signal);signal.throwIfAborted();if(generation!==this.generation)return;this.update({phase:'speaking'});await this.deps.microphone.play(wav,signal);}
  catch(error){if(!signal.aborted&&generation===this.generation)this.update({error:error instanceof Error?error.message:String(error)});}
  finally{if(generation===this.generation&&this.output===output){this.output=undefined;this.update({phase:this.state.muted?'muted':'listening'});}}
 }
 interrupt(){this.output?.abort();this.output=undefined;this.deps.microphone.stopPlayback();}
 mute(){if(!this.active)return;const muted=!this.state.muted;this.vad.reset();this.deps.microphone.mute(muted);this.update({muted,phase:muted?'muted':'listening',level:0});}
 stop(){++this.generation;this.captureReady=false;this.controller?.abort();this.controller=undefined;this.interrupt();this.off?.();this.off=undefined;this.deps.microphone.stop();this.deps.sessions.end();this.vad.reset();this.pending=0;this.deferred='';this.tail=Promise.resolve();this.update({active:false,phase:'off',muted:false,level:0,error:''});}
}
