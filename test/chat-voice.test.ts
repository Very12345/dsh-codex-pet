import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeWave,VoiceCapture} from '../src/voice.ts';
import {sendCompanionChat} from '../src/chat.ts';
import type {CreationSessions} from '../src/creation.ts';
test('floating chat creates and prompts a DSH session only after explicit send',async()=>{
 const sent:unknown[]=[],opened:string[]=[];
 const sessions={create:async()=>{sent.push('create');return 'new';},open:(id:string)=>opened.push(id),binding:()=>undefined,
  using:async(_id:string,_opts:unknown,operation:any)=>operation({ready:Promise.resolve(),binding:{session:{prompt:async(content:unknown,mode:string)=>{sent.push({content,mode});return {ok:true};}}}})} as CreationSessions;
 await assert.rejects(sendCompanionChat(sessions,'   '));assert.deepEqual(sent,[]);
 assert.equal(await sendCompanionChat(sessions,'请阅读项目'),'new');
 assert.deepEqual(sent,['create',{content:[{type:'text',text:'请阅读项目'}],mode:'queue'}]);assert.deepEqual(opened,['new']);
});
test('canonical microphone WAV preserves mono PCM and rejects excessive duration',()=>{
 const wav=encodeWave([Float32Array.from([-1,0,1])],16000),view=new DataView(wav.buffer);
 assert.equal(Buffer.from(wav).toString('ascii',0,4),'RIFF');assert.equal(view.getUint16(22,true),1);assert.equal(view.getUint32(24,true),16000);
 assert.equal(view.getInt16(44,true),-32768);assert.equal(view.getInt16(48,true),32767);
 assert.throws(()=>encodeWave([new Float32Array(16000*120+1)],16000),/oversized/);
});
test('browser capture stops every owned microphone track and context after finish or cancellation',async()=>{
 const savedNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),savedAudio=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');
 let stopped=0,closed=0,instance:any;
 class Audio {sampleRate=16000;destination={};processor:any;constructor(){instance=this;}createMediaStreamSource(){return {connect(){},disconnect(){}};}createScriptProcessor(){return this.processor={connect(){},disconnect(){},onaudioprocess:undefined};}async resume(){}async close(){closed++;}}
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})}}});
 Object.defineProperty(globalThis,'AudioContext',{configurable:true,value:Audio});
 try{const capture=new VoiceCapture();assert.equal(capture.recording,false);await capture.start();instance.processor.onaudioprocess({inputBuffer:{getChannelData:()=>Float32Array.from([.1,.2])}});assert.equal(capture.stop().length,48);assert.equal(stopped,1);assert.equal(closed,1);await capture.start();capture.cancel();assert.equal(stopped,2);assert.equal(closed,2);}
 finally{if(savedNavigator)Object.defineProperty(globalThis,'navigator',savedNavigator);else Reflect.deleteProperty(globalThis,'navigator');if(savedAudio)Object.defineProperty(globalThis,'AudioContext',savedAudio);else Reflect.deleteProperty(globalThis,'AudioContext');}
});
