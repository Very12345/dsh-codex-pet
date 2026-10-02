import test from 'node:test';import assert from 'node:assert/strict';import {LocalVad,LiveMicrophone} from '../src/live-vad.ts';
const frame=(value:number)=>new Float32Array(4096).fill(value);
test('continuous silence does not submit audio; a speech turn submits one valid bounded WAV after a pause',()=>{
 const vad=new LocalVad();for(let i=0;i<100;i++)assert.equal(vad.feed(frame(0)).events.length,0);
 assert.equal(vad.feed(frame(.1)).events.length,0);assert.equal(vad.feed(frame(.1)).events[0]?.type,'speech-start');let clips:any[]=[];for(let i=0;i<6;i++)clips.push(...vad.feed(frame(0)).events);assert.equal(clips.length,1);assert.equal(clips[0].type,'utterance');assert.equal(Buffer.from(clips[0].audio).toString('ascii',0,4),'RIFF');assert.equal(vad.inSpeech,false);
});
test('a click-sized noise pulse is discarded and overlong speech is never sent as a truncated instruction',()=>{
 const vad=new LocalVad();vad.feed(frame(.2));for(let i=0;i<6;i++)assert.ok(vad.feed(frame(0)).events.every(event=>event.type!=='utterance'));
 let overflow=0;for(let i=0;i<130;i++)overflow+=vad.feed(frame(.1)).events.filter(event=>event.type==='too-long').length;assert.equal(overflow,1);for(let i=0;i<6;i++)assert.ok(vad.feed(frame(0)).events.every(event=>event.type!=='utterance'));assert.equal(vad.inSpeech,false);
});
test('late microphone permission after hangup stops every returned track instead of starting capture',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');let resolve!:(value:unknown)=>void,stops=0;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>new Promise(done=>{resolve=done;})}}});
 try{const microphone=new LiveMicrophone(),pending=microphone.start(()=>{throw new Error('must not record');});microphone.stop();resolve({getTracks:()=>[{stop(){stops++;}}]});await pending;assert.equal(stops,1);}finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete (globalThis as any).navigator;}
});
test('utterance WAV metadata reflects the actual capture sample rate',()=>{
 const vad=new LocalVad(48000);for(let i=0;i<5;i++)vad.feed(frame(.1));const output:any[]=[];for(let i=0;i<12;i++)output.push(...vad.feed(frame(0)).events);assert.equal(output.length,1);assert.equal(Buffer.from(output[0].audio).readUInt32LE(24),48000);
});
