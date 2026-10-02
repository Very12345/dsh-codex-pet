/** Actual browser bundle + local host + native helper, isolated from user DSH. */
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {createHost} from '../lib/index.js';
if(process.platform!=='win32'){console.log('Desktop client smoke requires Windows');process.exit(0);}
const dir=await mkdtemp(join(tmpdir(),'dsh-pet-floating-'));
let recognizedAudio;
const host=await createHost({dataRoot:dir,fixture:true,speech:()=>({snapshot:()=>({providers:[{id:'fixture-local',location:'host-local',preparation:{phase:'standby'}}],selection:{providerId:'fixture-local'}}),resolve:({audio})=>{recognizedAudio=audio;return {audio};},transcribe:async()=>({text:'本地通话验证'})})});
const server=createServer((req,res)=>void host.handler(req,res));
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try{
 browser=await chromium.launch({headless:true,channel:process.env.DSH_PET_BROWSER_CHANNEL || 'msedge'});
 const page=await browser.newPage({viewport:{width:900,height:700}});
 await page.addInitScript(()=>{
  const NativeAudio=window.AudioContext;window.voiceFixture={stops:0,played:0,durations:[],processor:null};
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{async getUserMedia(){const track=voiceFixture.track={enabled:true,stop(){voiceFixture.stops++;}};return {getTracks:()=>[track],getAudioTracks:()=>[track]};}}});
  window.AudioContext=class {sampleRate=16000;destination={};async resume(){}async close(){}createMediaStreamSource(){return {connect(){},disconnect(){}};}createScriptProcessor(){return voiceFixture.processor={connect(){},disconnect(){},onaudioprocess:null};}async decodeAudioData(bytes){const decoder=new NativeAudio({sampleRate:16000});try{const buffer=await decoder.decodeAudioData(bytes);voiceFixture.durations.push(buffer.duration);return buffer;}finally{await decoder.close();}}createBufferSource(){return {connect(){},disconnect(){},start(){voiceFixture.played++;setTimeout(()=>this.onended?.(),800);},stop(){},onended:null};}};
  window.feedVoice=(value,count)=>{for(let i=0;i<count;i++)voiceFixture.processor.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(4096).fill(value)}});};
 });
 const prelude=await build({stdin:{contents:`import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as ReactDOM from 'react-dom';import {createRoot} from 'react-dom/client';
 window.__ModuleLoader__={load({factory}){window.petPlugin=factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?ReactDOM:{createRoot});}};
 window.renderPet=Component=>{window.root=createRoot(document.getElementById('root'));root.render(React.createElement(Component));};`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife'});
 await page.goto(`http://127.0.0.1:${server.address().port}/dsh-codex-pet/api/state`);
 await page.evaluate(`document.body.innerHTML='<div id="root"></div>';${prelude.outputFiles[0].text}`);
 await page.evaluate(await readFile('lib/client.js','utf8'));
 await page.evaluate(()=>{
  const store=value=>({value,listeners:new Set(),getSnapshot(){return this.value},subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);},set(value){this.value=value;for(const fn of [...this.listeners])fn();}});
  window.fixtureStatus=store(new Map());window.list=store({ids:['fixture'],byId:{fixture:{id:'fixture',title:'独立桌面测试任务',running:true,retainedBy:{mainView:1}}}});
  window.live=store({running:true,lastAgentError:null});window.events=store({revision:0,change:{kind:'replace',entries:[]}});
  window.disposers=[];window.locale=store({active:'zh-CN'});window.approved=[];window.replies=[];window.cancels=0;live.cancel=async()=>{cancels++;return {ok:true};};live.prompt=async(content,mode)=>{replies.push({content,mode});return {ok:true};};
  petPlugin.apply({effect(fn){disposers.push(fn());},locale,sessions:{list,binding:()=>({session:live,eventSource:events})},uiWorkspace:{openSession(id){window.opened=id;}},uiSession:{sessionStatus:fixtureStatus},slots:{inject(name,fn){fn();},register(options,Component){if(options.name==='shell.overlay')renderPet(Component);return()=>{};}}});
 });
 const deadline=Date.now()+20000;
 while(!host.desktop.running || await page.locator('.dcp-pet-button').count()){if(Date.now()>deadline)throw new Error('Desktop ownership timed out');await new Promise(r=>setTimeout(r,100));}
 const state=await host.desktop.inspect();assert.equal(state.visible,true);assert.equal(state.noticesVisible,true);assert.equal(state.focused,false);
 // A hidden/minimized document must not govern the native window's lifetime.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await new Promise(r=>setTimeout(r,2700));assert.equal((await host.desktop.inspect()).visible,true);
 await page.evaluate(()=>fixtureStatus.set(new Map([['fixture',{running:true,pendingInteraction:{kind:'approval',key:'permission-fixture',toolName:'test_tool',reason:'Harmless fixture approval',answer:async answer=>{approved.push(answer);}}}]])));
 await page.waitForFunction(()=>window.dshPet?.getSnapshot()?.notifications.items[0]?.request?.key==='permission-fixture');
 const item=await page.evaluate(()=>dshPet.getSnapshot().notifications.items[0]);
 // Inject one owned helper event to exercise SSE -> actual DSH adapter -> ACK.
 host.desktop.child.stdout.emit('data',Buffer.from(JSON.stringify({type:'command',id:'fixture-click',command:{type:'approve',id:item.id,token:item.token,requestKey:item.request.key}})+'\n'));
 await page.waitForFunction(()=>approved.length===1);assert.deepEqual(await page.evaluate(()=>approved),['allowed-once']);
 await page.evaluate(()=>{fixtureStatus.set(new Map());events.set({revision:1,entries:[{type:'event',event:{type:'assistant/message',data:{message:{content:[{type:'text',text:'Owned fixture assistant reply'}]}}}}],change:{kind:'append',entries:[]}});});
 await page.waitForFunction(()=>dshPet.getSnapshot()?.notifications.items[0]?.preview==='Owned fixture assistant reply');
 const previewDeadline=Date.now()+5000;while(!(await host.desktop.inspect()).noticePreview.includes('Owned fixture assistant reply')){if(Date.now()>previewDeadline)throw new Error('Reply preview bridge timed out');await new Promise(resolve=>setTimeout(resolve,100));}
 host.desktop['send']({type:'fixture-ui',action:'reply',id:'fixture'});await new Promise(resolve=>setTimeout(resolve,150));
 host.desktop['send']({type:'fixture-ui',action:'reply-text',id:'fixture',text:'Fixture follow-up, not a real session'});await new Promise(resolve=>setTimeout(resolve,100));
 host.desktop['send']({type:'fixture-ui',action:'reply-send',id:'fixture'});await page.waitForFunction(()=>replies.length===1);
 assert.deepEqual(await page.evaluate(()=>replies),[{content:[{type:'text',text:'Fixture follow-up, not a real session'}],mode:'queue'}]);
 const nativeCommand=type=>host.desktop.child.stdout.emit('data',Buffer.from(JSON.stringify({type:'command',id:'voice-fixture-'+type,command:{type}})+'\n'));
 nativeCommand('call-toggle');await page.waitForFunction(()=>!!voiceFixture.processor,{timeout:20000});
 const callDeadline=Date.now()+5000;while((await host.desktop.inspect()).callPhase!=='listening'){if(Date.now()>callDeadline)throw new Error('Call UI did not become ready');await new Promise(resolve=>setTimeout(resolve,100));}
 nativeCommand('call-mute');await page.waitForFunction(()=>voiceFixture.track.enabled===false);await page.evaluate(()=>{feedVoice(.1,2);feedVoice(0,5);});await new Promise(resolve=>setTimeout(resolve,150));assert.equal(await page.evaluate(()=>replies.length),1,'muted input is not submitted');nativeCommand('call-mute');await page.waitForFunction(()=>voiceFixture.track.enabled===true);
 await page.evaluate(()=>{feedVoice(.1,2);feedVoice(0,5);});await page.waitForFunction(()=>replies.length===2);assert.deepEqual(await page.evaluate(()=>replies[1]),{content:[{type:'text',text:'本地通话验证'}],mode:'steer'});assert.equal(recognizedAudio.toString('ascii',0,4),'RIFF');
 await page.evaluate(()=>{live.set({running:false,lastAgentError:null});list.set({ids:['fixture'],byId:{fixture:{id:'fixture',title:'独立桌面测试任务',running:false,retainedBy:{mainView:1}}}});events.set({revision:2,entries:[{type:'event',event:{type:'turn/start',seq:10,data:{turn:2}}},{type:'event',event:{type:'assistant/message',seq:11,data:{turn:2,step:1,message:{content:[{type:'text',text:'本地通话测试完成。'}]}}}},{type:'event',event:{type:'turn/end',seq:12,data:{reason:{kind:'completed'}}}}],change:{kind:'append',entries:[]}});});
 await page.waitForFunction(()=>voiceFixture.played>=1,{timeout:20000});assert.ok((await page.evaluate(()=>voiceFixture.durations[0]))>.2,'actual Windows speech WAV decodes in the browser');
 const callState=await host.desktop.inspect();assert.equal(callState.callVisible,true);assert.equal(callState.callTitle,'独立桌面测试任务');await writeFile('.preview/electron-local-call.png',Buffer.from(callState.image,'base64'));
 nativeCommand('call-end');await page.waitForFunction(()=>voiceFixture.stops===1);await new Promise(resolve=>setTimeout(resolve,150));assert.equal((await host.desktop.inspect()).callVisible,false);assert.equal(await page.evaluate(()=>cancels),0,'hangup does not cancel the background session');
 await host.library.update({desktop:false});host.desktop.stop();
 await page.waitForSelector('.dcp-pet-button');assert.equal(host.desktop.running,false);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 console.log('real browser/host/native display ownership, approvals, follow-up, continuous local call, automatic steering, real Windows WAV decoding, mute/hangup cleanup and page fallback PASS');
}finally{
 await browser?.close();host.dispose();server.closeAllConnections();await new Promise(done=>server.close(done));await rm(dir,{recursive:true,force:true});
}
