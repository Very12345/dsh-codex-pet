import {encodeWave} from './voice.ts';
export type VadEvent={type:'speech-start'}|{type:'utterance';audio:Uint8Array}|{type:'too-long'};
export class LocalVad {
 private prefix:Float32Array[]=[];private parts:Float32Array[]=[];private talking=false;private length=0;private voiced=0;private silence=0;private overflow=false;private loudFrames=0;
 constructor(private sampleRate=16000,private silenceMs=900){}
 get inSpeech(){return this.talking;}
 reset(){this.prefix=[];this.parts=[];this.talking=false;this.length=0;this.voiced=0;this.silence=0;this.overflow=false;this.loudFrames=0;}
 feed(frame:Float32Array):{level:number;events:VadEvent[]}{
  const rms=Math.sqrt(frame.reduce((sum,value)=>sum+value*value,0)/Math.max(1,frame.length)),speech=rms>=.018,events:VadEvent[]=[];
  if(!this.talking){this.prefix.push(frame.slice());while(this.prefix.length>2)this.prefix.shift();this.loudFrames=speech?this.loudFrames+1:0;if(this.loudFrames<2)return {level:rms,events};this.talking=true;this.parts=this.prefix;this.prefix=[];this.length=this.parts.reduce((sum,part)=>sum+part.length,0);this.voiced=this.length;events.push({type:'speech-start'});}
  else{if(!this.overflow){this.parts.push(frame.slice());this.length+=frame.length;}if(speech)this.voiced+=frame.length;}
  this.silence=speech?0:this.silence+frame.length;
  if(this.length>this.sampleRate*30&&!this.overflow){this.overflow=true;this.parts=[];events.push({type:'too-long'});}
  if(this.silence>=this.sampleRate*this.silenceMs/1000){if(!this.overflow&&this.voiced>=this.sampleRate*.35)events.push({type:'utterance',audio:encodeWave(this.parts,this.sampleRate)});this.reset();}
  return {level:rms,events};
 }
}
export interface CallMicrophone {readonly sampleRate?:number;start(frame:(value:Float32Array)=>void):Promise<void>;mute(value:boolean):void;play(wav:Uint8Array,signal:AbortSignal):Promise<void>;stopPlayback():void;stop():void}
export class LiveMicrophone implements CallMicrophone {
 private context?:AudioContext;private stream?:MediaStream;private input?:MediaStreamAudioSourceNode;private processor?:ScriptProcessorNode;private output?:AudioBufferSourceNode;private playbackEnd?:(cause?:Error)=>void;private epoch=0;private muted=false;
 get sampleRate(){return this.context?.sampleRate??16000;}
 async start(frame:(value:Float32Array)=>void){
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('当前环境不支持麦克风');const epoch=++this.epoch;
  const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,sampleRate:16000,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  if(epoch!==this.epoch){stream.getTracks().forEach(track=>track.stop());return;}
  this.stream=stream;stream.getAudioTracks().forEach(track=>track.enabled=!this.muted);try{const context=new AudioContext({sampleRate:16000});this.context=context;this.input=context.createMediaStreamSource(stream);this.processor=context.createScriptProcessor(4096,1,1);this.processor.onaudioprocess=event=>{if(!this.muted)frame(event.inputBuffer.getChannelData(0));};this.input.connect(this.processor);this.processor.connect(context.destination);await context.resume();}catch(error){this.stop();throw error;}
 }
 mute(value:boolean){this.muted=value;this.stream?.getAudioTracks().forEach(track=>track.enabled=!value);}
 async play(wav:Uint8Array,signal:AbortSignal){
  const context=this.context;if(!context)throw new Error('通话已结束');signal.throwIfAborted();this.stopPlayback();const audio=await context.decodeAudioData(wav.slice().buffer as ArrayBuffer);signal.throwIfAborted();
  return await new Promise<void>((resolve,reject)=>{const source=context.createBufferSource();source.buffer=audio;this.output=source;
   const finish=(error?:Error)=>{if(this.output!==source)return;this.output=undefined;this.playbackEnd=undefined;signal.removeEventListener('abort',abort);source.onended=null;try{source.stop();source.disconnect();}catch{}error?reject(error):resolve();};
   const abort=()=>finish(new Error('语音播放已打断'));this.playbackEnd=finish;signal.addEventListener('abort',abort,{once:true});source.onended=()=>finish();source.connect(context.destination);source.start();if(signal.aborted)abort();});
 }
 stopPlayback(){this.playbackEnd?.(new Error('语音播放已打断'));}
 stop(){++this.epoch;this.stopPlayback();this.processor?.disconnect();this.input?.disconnect();this.stream?.getTracks().forEach(track=>track.stop());if(this.context)void this.context.close().catch(()=>{});this.context=undefined;this.stream=undefined;this.processor=undefined;this.input=undefined;this.muted=false;}
}
