import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import type {spawn} from 'node:child_process';
import type {ServerResponse} from 'node:http';
import {DesktopRuntime} from '../src/desktop-runtime.ts';
import {PetLibrary} from '../src/library.ts';
import {DEFAULT_CONFIG,IDLE,normalizeConfig} from '../src/model.ts';
import {connectDesktop} from '../src/desktop-client.ts';
import {createCompanionProvider} from '../src/companion-api.ts';
import sharp from 'sharp';
import {encodeWave} from '../src/voice.ts';

const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
class Helper extends EventEmitter {
  stdin=new PassThrough();stdout=new PassThrough();stderr=new PassThrough();exitCode:number|null=null;
  commands:Record<string,unknown>[]=[];
  constructor(){super();let input='';this.stdin.on('data',chunk=>{
    input+=String(chunk);for(;;){const split=input.indexOf('\n');if(split<0)break;const value=JSON.parse(input.slice(0,split));input=input.slice(split+1);this.commands.push(value);
      if(value.type==='snapshot')this.message({type:'shown',id:value.id});
      if(value.type==='close')this.kill();
    }
  });}
  message(value:unknown){this.stdout.write(JSON.stringify(value)+'\n');}
  kill(){if(this.exitCode!==null)return;this.exitCode=0;this.emit('exit',0);this.stdout.end();this.stderr.end();}
}
class Events extends EventEmitter {
  destroyed=false;events:string[]=[];
  writeHead(){}write(value:string){this.events.push(value);return true;}
  end(){if(this.destroyed)return;this.destroyed=true;this.emit('close');}
}
test('desktop display validates leases, rasterizes selected assets, returns original request identity and cleans up',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'dsh-pet-native-'));
  const library=new PetLibrary(resolve('assets/codex'),dir);await library.init();
  let helper=new Helper();const spawns:unknown[][]=[];
  const runtime=new DesktopRuntime(library,{platform:'win32',spawn:((...args:unknown[])=>{spawns.push(args);setImmediate(()=>helper.message({type:'ready'}));return helper;}) as unknown as typeof spawn,reconnectMs:30});
  t.after(async()=>{runtime.dispose();await rm(dir,{recursive:true,force:true});});
  const {token}=await runtime.begin('fixture');assert.equal((spawns[0][2] as {windowsHide:boolean}).windowsHide,true);
  const stream=new Events();runtime.attach(token,stream as unknown as ServerResponse);
  await assert.rejects(runtime.publish('wrong',{}),/expired/);
  await assert.rejects(runtime.begin('other-window'),/Another DSH window/);
  const pet=library.pets.find(pet=>pet.id===library.config.selected)!;
  const image=(await sharp(await library.asset(pet.id)).png().toBuffer()).toString('base64');
  await assert.rejects(runtime.publish(token,{language:'zh-CN',notifications:{activity:IDLE,items:[],hidden:0}}),/revision/);
  await runtime.publish(token,{language:'zh-CN',config:DEFAULT_CONFIG,image,spriteKey:pet.url,notifications:{activity:IDLE,items:[],hidden:0}});
  const state=helper.commands.find(value=>value.type==='snapshot')!;
  assert.ok(Buffer.from(state.image as string,'base64').subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
  const command={type:'approve',id:'session',token:'round:request',requestKey:'original-request'};
  helper.message({type:'command',id:'native-action',command});await flush();
  const action=stream.events.find(value=>value.startsWith('event: command'))!;
  const forwarded=JSON.parse(action.split('data: ')[1]);assert.deepEqual(forwarded.command,command);
  runtime.acknowledge(token,forwarded.id,undefined);await flush();
  assert.deepEqual(helper.commands.at(-1),{type:'result',id:'native-action',ok:true});
  helper.message({type:'config',value:{desktopPosition:{screen:'DISPLAY1',x:.2,y:.3}}});await new Promise(r=>setTimeout(r,15));
  assert.deepEqual(library.config.desktopPosition,{screen:'DISPLAY1',x:.2,y:.3});
  stream.end();await new Promise(r=>setTimeout(r,45));assert.equal(helper.exitCode,0);assert.equal(runtime.running,false);
  helper=new Helper();const second=await runtime.begin('next');assert.notEqual(second.token,token);
  runtime.dispose();assert.equal(helper.exitCode,0);await assert.rejects(runtime.begin('next'),/unloaded/);
});
test('unsupported hosts and startup disposal never leave an owned native process',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'dsh-pet-cancel-'));const library=new PetLibrary(resolve('assets/codex'),dir);await library.init();
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const unsupported=new DesktopRuntime(library,{platform:'linux'});await assert.rejects(unsupported.begin('client'),/Windows/);unsupported.dispose();
  const child=new Helper(),runtime=new DesktopRuntime(library,{platform:'win32',spawn:(()=>child) as unknown as typeof spawn});
  const opening=runtime.begin('client');runtime.dispose();await assert.rejects(opening,/stopped during startup/);assert.equal(child.exitCode,0);
  for(const value of [{desktop:'yes'},{desktopPosition:{screen:'screen',x:NaN,y:0}},{desktopPosition:{screen:'screen',x:2,y:0}}])assert.throws(()=>normalizeConfig(value));
});

test('speech stays on the host-selected recognizer and sends validated audio without starting a model conversation',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'dsh-pet-speech-'));const library=new PetLibrary(resolve('assets/codex'),dir);await library.init();
 const child=new Helper();let received:Buffer|undefined;
 const speech={snapshot:()=>({providers:[{id:'configured',preparation:{phase:'ready'}}],selection:{providerId:'configured'}}),resolve:({audio}:{audio:Buffer})=>{received=audio;return {audio};},transcribe:async()=>({text:'识别结果'})};
 const runtime=new DesktopRuntime(library,{platform:'win32',speech:()=>speech,spawn:(()=>{setImmediate(()=>child.message({type:'ready'}));return child;}) as unknown as typeof spawn});
 t.after(async()=>{runtime.dispose();await rm(dir,{recursive:true,force:true});});
 const {token}=await runtime.begin('speech-fixture');
 const wav=Buffer.from(encodeWave([Float32Array.from([.1,.2])],16000));
 assert.deepEqual(await runtime.transcribe(token,wav.toString('base64'),new AbortController().signal),{text:'识别结果'});assert.ok(received?.equals(wav));
 await assert.rejects(runtime.transcribe(token,'not-wave',new AbortController().signal),/无效/);
});
test('installed recognizer may be in standby or waking; transcription remains host-owned without preparing or downloading again',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'dsh-pet-standby-')),library=new PetLibrary(resolve('assets/codex'),dir);await library.init();
 const child=new Helper();let phase='standby',calls=0;
 const speech={snapshot:()=>({providers:[{id:'local',preparation:{phase}}],selection:{providerId:'local'}}),resolve:({audio}:{audio:Buffer})=>({audio}),transcribe:async()=>{calls++;return {text:'宿主自动唤醒后识别的文字'};}};
 const runtime=new DesktopRuntime(library,{platform:'win32',speech:()=>speech,spawn:(()=>{setImmediate(()=>child.message({type:'ready'}));return child;}) as unknown as typeof spawn});
 t.after(async()=>{runtime.dispose();await rm(dir,{recursive:true,force:true});});const {token}=await runtime.begin('standby-fixture');
 const wav=Buffer.from(encodeWave([Float32Array.from([.1,.2])],16000));
 for(phase of ['standby','waking']){assert.equal(runtime.voiceReady(token),speech);assert.deepEqual(await runtime.transcribe(token,wav.toString('base64'),new AbortController().signal),{text:'宿主自动唤醒后识别的文字'});}
 assert.equal(calls,2);
 for(phase of ['unprepared','checking','loading','downloading','failed','cancelled'])assert.throws(()=>runtime.voiceReady(token),/语音/);
 assert.equal(calls,2,'unusable states must not start transcription');
});

test('client bridge claims display only after paint, handles minimized-window actions and releases on disconnect',async()=>{
  const commands:unknown[]=[],display:boolean[]=[],posts:{path:string;data:any}[]=[];
  const provider=createCompanionProvider({command:async command=>{commands.push(command);},updateConfig:async()=>{},openSettings(){commands.push('settings');},externalDisplay:value=>display.push(value)});
  provider.publish({pet:null,config:DEFAULT_CONFIG,language:'en',notifications:{items:[],activity:IDLE,hidden:0}});
  class Stream extends EventTarget {static current:Stream;closed=false;constructor(){super();Stream.current=this;setImmediate(()=>this.dispatchEvent(new Event('open')));}close(){this.closed=true;}}
  const connection=connectDesktop(provider.api,async()=>{},()=>{}, {
    owner:'browser',eventSource:Stream as unknown as typeof EventSource,
    fetch:(async(url:unknown,options:any)=>{
      const path=String(url).split('/').at(-1)!;posts.push({path,data:JSON.parse(options.body)});
      return {ok:true,json:async()=>path==='begin'?{token:'lease'}:{}};
    }) as typeof fetch
  });
  await connection.ready;await flush();await flush();assert.equal(display.at(-1),true);
  const command={type:'approve',id:'target',token:'original-round',requestKey:'original-key'};
  Stream.current.dispatchEvent(new MessageEvent('command',{data:JSON.stringify({id:'reply',command})}));await flush();
  assert.deepEqual(commands,[command]);assert.deepEqual(posts.at(-1),{path:'ack',data:{token:'lease',id:'reply'}});
  Stream.current.dispatchEvent(new Event('error'));assert.equal(display.at(-1),false);
  Stream.current.dispatchEvent(new Event('open'));await flush();await flush();assert.equal(display.at(-1),true);
  Stream.current.dispatchEvent(new MessageEvent('stopped',{data:'{}'}));assert.equal(display.at(-1),false);
  connection.dispose();provider.dispose();assert.equal(Stream.current.closed,true);assert.equal(posts.at(-1)?.path,'end');
});
