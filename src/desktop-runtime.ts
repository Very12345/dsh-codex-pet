/** Windows companion process; the DSH host owns every window and lease. */
import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {ServerResponse} from 'node:http';
import {ANIMATIONS, type Config} from './model.ts';
import {imageVersion, type PetLibrary} from './library.ts';
import type {CompanionSnapshot} from './companion-api.ts';
import {electronPath} from './electron-path.ts';
import {createServer,type Server,type Socket} from 'node:net';
import type {SpeechOutput} from './local-speech.ts';
import {VoiceDialogue,dialogueInput,type VoiceModelServices} from './voice-dialogue.ts';

type Lease = {owner:string; token:string; stream?:ServerResponse; reconnect?:ReturnType<typeof setTimeout>};
type Reply = {resolve:(value?:unknown)=>void; reject:(error:Error)=>void; timer:ReturnType<typeof setTimeout>};
export interface SpeechHost {snapshot():{providers:{id:string;location?:'host-local'|'cloud';preparation?:{phase:string;message?:string}}[];selection:{providerId:string}};resolve(request:{audio:Buffer}):unknown;transcribe(spec:unknown,signal:AbortSignal):Promise<{text:string}>;}
export class DesktopRuntime {
  readonly supported: boolean;
  error='';
  private child?:ChildProcessWithoutNullStreams;
  private starting?:Promise<void>;
  private cancelStart?:(error:Error)=>void;
  private lease?:Lease;
  private pending=new Map<string,Reply>();
  private imageKey='';
  private image?:string;
  private sequence=0;
  private closed=false;
  private stopTimer?:ReturnType<typeof setTimeout>;
  private heartbeat?:ReturnType<typeof setInterval>;
  private speechJobs=new Set<AbortController>();
  private synthesis?:AbortController;
  private conversation?:{id:string;sessionId:string|null;dialogue:VoiceDialogue};
  private socketServer?:Server;
  private socket?:Socket;
  constructor(private library:PetLibrary, private options:{platform?:string; spawn?:typeof spawn; startupTimeoutMs?:number; reconnectMs?:number;speech?:()=>SpeechHost|undefined;output?:SpeechOutput;voiceModels?:()=>VoiceModelServices;fixture?:boolean}={}) {
    this.supported=(options.platform ?? process.platform)==='win32';
  }
  get running(){return !!this.child && !this.error;}
  private send(value:unknown){
    const child=this.child;
    const output=this.options.spawn?child?.stdin:this.socket;
    if(!child || !output || output.destroyed)throw new Error('Desktop pet process is unavailable');
    output.write(JSON.stringify(value)+'\n');
  }
  private event(type:string,value:unknown){
    const stream=this.lease?.stream;
    if(stream && !stream.destroyed)stream.write(`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`);
  }
  private start():Promise<void>{
    if(this.starting)return this.starting;
    if(this.options.spawn)return this.spawnHelper();
    const operation=(async()=>{
      const token=randomUUID();
      const server=createServer(socket=>{
        const reader=createInterface({input:socket}),timeout=setTimeout(()=>socket.destroy(),3000);
        socket.on('error',()=>{});
        reader.once('line',line=>{
          clearTimeout(timeout);let hello;try{hello=JSON.parse(line);}catch{socket.destroy();return;}
          if(hello.token!==token || this.socket || hello.pid!==this.child?.pid){socket.destroy();return;}
          this.socket=socket;
          socket.once('close',()=>{if(this.socket===socket){this.socket=undefined;if(this.child&&!this.closed){this.error='Desktop companion connection closed';this.stop();}}});
        });
      });this.socketServer=server;
      await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
      const address=server.address();if(!address||typeof address==='string')throw new Error('Desktop bridge unavailable');
      return await this.spawnHelper({DSH_FLOATING_PET_BRIDGE_PORT:String(address.port),DSH_FLOATING_PET_BRIDGE_TOKEN:token});
    })().catch(error=>{this.starting=undefined;this.socket?.destroy();this.socket=undefined;this.socketServer?.close();this.socketServer=undefined;throw error;});this.starting=operation;return operation;
  }
  private async spawnHelper(extraEnv:Record<string,string>={}){
    if(this.closed)throw new Error('Desktop pet has been unloaded');
    if(this.child)return this.starting;
    this.error='';
    const executable=this.options.spawn?'electron-fixture':electronPath();
    const script=fileURLToPath(new URL('../native/electron',import.meta.url));
    const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^DSH_/i.test(key) && !/(?:API.?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key)));
    delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
    Object.assign(env,extraEnv);
    if(this.options.fixture)env.DSH_PET_NATIVE_TEST='1';
    const child=(this.options.spawn ?? spawn)(executable,[script,'--parent-pid='+process.pid],{windowsHide:true,stdio:['pipe','pipe','pipe'],env}) as ChildProcessWithoutNullStreams;
    this.child=child;
    let stderr='';
    child.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-4096);});
    // Never print user task titles, questions or answers into process logs.
    child.stdin.on('error',()=>{});
    this.starting=new Promise<void>((resolve,reject)=>{
      let ready=false;
      const timer=setTimeout(()=>{reject(new Error('Desktop pet startup timed out'));this.stop();},this.options.startupTimeoutMs ?? 15000);
      this.cancelStart=error=>{clearTimeout(timer);if(!ready)reject(error);};
      const lines=createInterface({input:child.stdout});
      lines.on('line',line=>{
        let message:Record<string,unknown>;
        try{message=JSON.parse(line);}catch{return;}
        if(message.type==='ready'){ready=true;clearTimeout(timer);this.cancelStart=undefined;resolve();}
        else if(message.type==='command' && message.command && typeof message.command==='object')void this.dispatch(message.command,typeof message.id==='string'?message.id:undefined).catch(()=>{});
        else if(message.type==='settings')void this.dispatch({type:'settings'}).catch(()=>{});
        else if(message.type==='config')void this.changeConfig(message.value).catch(error=>{this.error=String(error);this.stop();});
        else if(message.type==='shown' && typeof message.id==='string')this.finish(message.id);
        else if(message.type==='inspection' && typeof message.id==='string')this.finish(message.id,undefined,message);
        else if(message.type==='native-error'){
          this.error=String(message.error ?? 'Desktop drawing failed');this.stop();
        }
      });
      const fail=(cause:unknown)=>{
        if(this.child!==child)return;
        clearTimeout(timer);lines.close();this.child=undefined;this.starting=undefined;this.cancelStart=undefined;
        this.imageKey='';this.image=undefined;
        this.error=String(cause ?? stderr ?? 'Desktop pet exited');
        if(!ready)reject(new Error(this.error));
        for(const [id] of this.pending)this.finish(id,this.error);
        this.event('stopped',{error:this.error});
        this.clearLease();
        this.socket?.destroy();this.socket=undefined;this.socketServer?.close();this.socketServer=undefined;
      };
      child.once('error',fail);
      child.once('exit',()=>fail(stderr || 'Desktop pet exited'));
    });
    return this.starting;
  }
  async begin(owner:unknown){
    if(!this.supported)throw new Error('Desktop pets currently require Windows');
    if(typeof owner!=='string' || !/^[a-zA-Z0-9-]{1,80}$/.test(owner))throw new Error('Invalid desktop client');
    if(!this.library.config.desktop)throw new Error('Desktop pet is disabled');
    if(this.lease?.stream && this.lease.owner!==owner)throw new Error('Another DSH window is displaying the desktop pet');
    this.clearLease();
    const lease:Lease={owner,token:randomUUID()};this.lease=lease;
    try{await this.start();}catch(error){if(this.lease===lease)this.clearLease();throw error;}
    if(this.lease!==lease)throw new Error('Desktop client was replaced during startup');
    // A client that never attaches its event stream cannot leave an orphan.
    lease.reconnect=setTimeout(()=>{if(this.lease===lease)this.stop();},this.options.reconnectMs ?? 10000);
    return {token:lease.token};
  }
  private authorized(token:unknown){
    if(typeof token!=='string' || !this.lease || token!==this.lease.token)throw new Error('Desktop display lease has expired');
    return this.lease;
  }
  attach(token:unknown,response:ServerResponse){
    const lease=this.authorized(token);
    clearTimeout(lease.reconnect);lease.stream?.end();lease.stream=response;
    response.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-accel-buffering':'no'});
    response.write(': desktop pet connected\n\n');
    clearInterval(this.heartbeat);
    this.heartbeat=setInterval(()=>{if(!response.destroyed)response.write(': heartbeat\n\n');},15000);
    response.on('close',()=>{
      if(this.lease!==lease || lease.stream!==response)return;
      lease.stream=undefined;clearInterval(this.heartbeat);
      lease.reconnect=setTimeout(()=>{if(this.lease===lease && !lease.stream)this.stop();},this.options.reconnectMs ?? 10000);
    });
  }
  private wait(id:string,timeoutMs=30000){
    return new Promise<unknown>((resolve,reject)=>{
      const timer=setTimeout(()=>this.finish(id,'DSH did not acknowledge the desktop pet action'),timeoutMs);
      this.pending.set(id,{resolve,reject,timer});
    });
  }
  private finish(id:string,error?:string,result?:unknown){
    const value=this.pending.get(id);if(!value)return;
    this.pending.delete(id);clearTimeout(value.timer);
    if(error)value.reject(new Error(error));else value.resolve(result);
  }
  acknowledge(token:unknown,id:unknown,error:unknown){
    this.authorized(token);
    if(typeof id!=='string' || !this.pending.has(id))throw new Error('Desktop action has expired');
    this.finish(id,typeof error==='string'?error.slice(0,2000):undefined);
  }
  private async dispatch(command:unknown,nativeId?:string){
    if(!this.lease?.stream){if(this.child)this.send({type:'result',id:nativeId,ok:false,error:'DSH connection is unavailable'});return;}
    const id=randomUUID(),finished=this.wait(id,['voice-toggle','call-toggle'].includes(String((command as {type?:string})?.type))?180000:30000);
    this.event('command',{id,command});
    try{await finished;this.send({type:'result',id:nativeId ?? id,ok:true});}
    catch(error){if(this.child)this.send({type:'result',id:nativeId ?? id,ok:false,error:String(error)});}
  }
  private async changeConfig(value:unknown){
    // The native helper only edits display preferences, never session policy.
    if(!value || typeof value!=='object')throw new Error('Invalid desktop preference');
    const data=value as Partial<Config>;
    await this.library.update({
      ...(data.visible!==undefined?{visible:data.visible}:{}),
      ...(data.desktop!==undefined?{desktop:data.desktop}:{}),
      ...(data.desktopPosition!==undefined?{desktopPosition:data.desktopPosition}:{})
    });
    this.event('config',{});
    if(!this.library.config.desktop)this.stop();
  }
  async publish(token:unknown,value:unknown){
    this.authorized(token);
    if(!value || typeof value!=='object')throw new Error('Invalid desktop snapshot');
    const source=value as CompanionSnapshot & {image?:string;spriteKey?:string;theme?:string};
    if(!source.notifications || !Array.isArray(source.notifications.items) || source.notifications.items.length>100)throw new Error('Invalid desktop notifications');
    const sequence=++this.sequence;
    const pet=this.library.pets.find(pet=>pet.id===this.library.config.selected);
    let image: string | undefined;
    if(pet){
      const key=pet.url;
      if(key!==this.imageKey){
        // The existing browser decodes WebP. Accept only a bounded PNG for the
        // current library revision; no native dependency or installation script.
        if(source.spriteKey!==key || typeof source.image!=='string')throw new Error('Desktop sprite revision is missing or stale');
        const bytes=Buffer.from(source.image,'base64');
        if(bytes.length>24*1024*1024 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || imageVersion(bytes)!==pet.version)throw new Error('Invalid desktop PNG sprite');
        image=source.image;
        if(sequence!==this.sequence)return;
        this.imageKey=key;this.image=image;
      }
    }
    if(sequence!==this.sequence)return;
    this.authorized(token);
    const id=randomUUID(),painted=this.wait(id,15000);
    try{
      this.send({type:'snapshot',id,image,version:pet?.version ?? 1,config:this.library.config,
        animations:ANIMATIONS,language:source.language,theme:source.theme==='dark'?'dark':'light',
        notifications:source.notifications});
    }catch(error){this.finish(id,String(error));}
    await painted;
  }
  private clearLease(){
    clearInterval(this.heartbeat);
    if(this.lease){clearTimeout(this.lease.reconnect);this.lease.stream?.end();}
    this.lease=undefined;
  }
  stop(){
    this.conversation?.dialogue.dispose();this.conversation=undefined;
    for(const job of this.speechJobs)job.abort(new Error('Desktop speech was stopped'));
    this.event('stopped',this.error?{error:this.error}:{});this.clearLease();
    const child=this.child;this.cancelStart?.(new Error('Desktop pet stopped during startup'));this.cancelStart=undefined;
    this.child=undefined;this.starting=undefined;this.imageKey='';this.image=undefined;
    const socket=this.socket;this.socket=undefined;socket?.end('{"type":"close"}\n');this.socketServer?.close();this.socketServer=undefined;
    for(const [id] of this.pending)this.finish(id,'Desktop pet stopped');
    if(!child)return;
    if(!child.stdin.destroyed)child.stdin.end('{"type":"close"}\n');
    const stopTimer=setTimeout(()=>{if(child.exitCode===null)child.kill();},3000);
    this.stopTimer=stopTimer;stopTimer.unref();
    child.once('exit',()=>clearTimeout(stopTimer));
  }
  release(token:unknown){this.authorized(token);this.stop();}
  voiceReady(token:unknown,localOnly=false){
    this.authorized(token);const speech=this.options.speech?.();
    if(!speech)throw new Error('请先在 DSH 中启用语音输入插件');
    const state=speech.snapshot(),provider=state.providers.find(provider=>provider.id===state.selection.providerId);
    if(!provider)throw new Error('当前语音识别器不可用，请在 DSH 语音设置中选择可用的识别器');
    if(localOnly&&provider.location!=='host-local')throw new Error('本地通话需要在 DSH 语音设置中选择本地识别器（SenseVoice）');
    // Match the official voice UI: cached standby and worker waking both
    // accept recording; the host owns wake-up, queuing and cancellation.
    const preparation=provider.preparation;
    if(preparation&&!['ready','standby','waking'].includes(preparation.phase)){
      if(preparation.phase==='failed')throw new Error('语音识别准备失败：'+(preparation.message?.slice(0,1000)||'请查看 DSH 语音设置中的错误详情'));
      if(['checking','loading','downloading','cancelling'].includes(preparation.phase))throw new Error(({checking:'语音识别正在检查本地资源，请稍候',loading:'语音识别正在加载模型，请稍候',downloading:'语音识别正在下载模型，请稍候',cancelling:'语音模型准备正在取消，请稍候'} as Record<string,string>)[preparation.phase]);
      throw new Error('语音识别模型尚未准备，请在 DSH 语音设置中准备识别模型');
    }
    return speech;
  }
  async transcribe(token:unknown,encoded:unknown,caller:AbortSignal,localOnly=false){
    const speech=this.voiceReady(token,localOnly);
    if(typeof encoded!=='string' || encoded.length>Math.ceil(4*1024*1024/3)*4)throw new Error('录音过大');
    const audio=Buffer.from(encoded,'base64');
    if(audio.toString('base64')!==encoded || audio.length<46 || audio.toString('ascii',0,4)!=='RIFF' || audio.toString('ascii',8,12)!=='WAVE' || audio.toString('ascii',36,40)!=='data' || audio.readUInt16LE(20)!==1 || audio.readUInt16LE(22)!==1 || audio.readUInt16LE(34)!==16 || audio.readUInt32LE(40)!==audio.length-44 || audio.readUInt32LE(24)<8000 || audio.readUInt32LE(24)>48000 || (audio.length-44)/2/audio.readUInt32LE(24)>120)throw new Error('无效的录音');
    const controller=new AbortController();this.speechJobs.add(controller);
    try{return await speech.transcribe(speech.resolve({audio}),AbortSignal.any([caller,controller.signal]));}
    finally{this.speechJobs.delete(controller);}
  }
  voices(){if(!this.options.output)throw new Error('系统语音输出不可用');return this.options.output.voices();}
  async dialogueBegin(token:unknown,value:Record<string,unknown>,caller:AbortSignal){
    this.authorized(token);if(typeof value.callId!=='string'||!/^[\w-]{8,100}$/.test(value.callId))throw new Error('语音通话标识无效');
    const input=dialogueInput({...value,mode:'progress'});if(!this.options.voiceModels)throw new Error('宿主未提供语音对话模型接口');
    this.conversation?.dialogue.dispose();const conversation={id:value.callId,sessionId:input.task.sessionId,dialogue:new VoiceDialogue(this.options.voiceModels)};this.conversation=conversation;
    try{await conversation.dialogue.ready(input.task,caller);}catch(error){conversation.dialogue.dispose();if(this.conversation===conversation)this.conversation=undefined;throw error;}
  }
  async dialogueRespond(token:unknown,value:Record<string,unknown>,caller:AbortSignal){
    this.authorized(token);const current=this.conversation;if(!current||value.callId!==current.id)throw new Error('语音通话已结束');const input=dialogueInput(value);
    if(current.sessionId!==null&&input.task.sessionId!==current.sessionId)throw new Error('语音目标会话不一致');
    if(current.sessionId===null&&input.task.sessionId!==null)current.sessionId=input.task.sessionId;
    return current.dialogue.respond(input,caller);
  }
  dialogueEnd(token:unknown,callId:unknown){this.authorized(token);const current=this.conversation;if(current&&current.id===callId){current.dialogue.dispose();this.conversation=undefined;}}
  async synthesize(token:unknown,value:Record<string,unknown>,caller:AbortSignal){
    this.authorized(token);if(!this.options.output)throw new Error('系统语音输出不可用');if(typeof value.text!=='string')throw new Error('语音输出文字无效');
    caller.throwIfAborted();this.synthesis?.abort(new Error('语音回复已被更新'));
    const controller=new AbortController();this.speechJobs.add(controller);
    this.synthesis=controller;
    try{const bytes=await this.options.output.synthesize(value.text,this.library.config.callVoice??'',this.library.config.callRate??0,value.language==='en'?'en':'zh',AbortSignal.any([caller,controller.signal]));return {audioBase64:bytes.toString('base64')};}
    finally{this.speechJobs.delete(controller);if(this.synthesis===controller)this.synthesis=undefined;}
  }
  callState(token:unknown,value:unknown){
    this.authorized(token);if(!value||typeof value!=='object')throw new Error('通话状态无效');const source=value as Record<string,unknown>;
    if(!['off','starting','listening','recognizing','thinking','working','preparing-audio','speaking','muted','error'].includes(String(source.phase)))throw new Error('通话状态无效');
    const short=(key:string,limit:number)=>typeof source[key]==='string'?source[key].slice(0,limit):'';
    this.send({type:'call-state',value:{phase:source.phase,active:source.active===true,muted:source.muted===true,title:short('title',160),sessionId:short('sessionId',100)||null,heard:short('heard',500),said:short('said',500),error:short('error',1000),level:typeof source.level==='number'&&Number.isFinite(source.level)?Math.max(0,Math.min(1,source.level)):0}});
  }
  composer(token:unknown,value:unknown){
    this.authorized(token);if(!value || typeof value!=='object')throw new Error('Invalid composer update');
    const data=value as {text?:unknown;error?:unknown;state?:unknown};
    this.send({type:'composer',text:typeof data.text==='string'?data.text.slice(0,10000):'',error:typeof data.error==='string'?data.error.slice(0,2000):'',state:['idle','recording','processing'].includes(String(data.state))?data.state:'idle'});
  }
  /** Internal diagnostics only; captures this helper's own sprite, never the desktop. */
  async inspect(){
    const id=randomUUID(),result=this.wait(id,5000);
    try{this.send({type:'inspect',id});}catch(error){this.finish(id,String(error));}
    return await result as Record<string,unknown>;
  }
  dispose(){if(this.closed)return;this.closed=true;this.stop();}
}
