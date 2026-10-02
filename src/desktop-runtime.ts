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

type Lease = {owner:string; token:string; stream?:ServerResponse; reconnect?:ReturnType<typeof setTimeout>};
type Reply = {resolve:(value?:unknown)=>void; reject:(error:Error)=>void; timer:ReturnType<typeof setTimeout>};
export interface SpeechHost {snapshot():{providers:{id:string;preparation?:{phase:string}}[];selection:{providerId:string}};resolve(request:{audio:Buffer}):unknown;transcribe(spec:unknown,signal:AbortSignal):Promise<{text:string}>;}
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
  constructor(private library:PetLibrary, private options:{platform?:string; spawn?:typeof spawn; startupTimeoutMs?:number; reconnectMs?:number;speech?:()=>SpeechHost|undefined}={}) {
    this.supported=(options.platform ?? process.platform)==='win32';
  }
  get running(){return !!this.child && !this.error;}
  private send(value:unknown){
    const child=this.child;
    if(!child || child.stdin.destroyed)throw new Error('Desktop pet process is unavailable');
    child.stdin.write(JSON.stringify(value)+'\n');
  }
  private event(type:string,value:unknown){
    const stream=this.lease?.stream;
    if(stream && !stream.destroyed)stream.write(`event: ${type}\ndata: ${JSON.stringify(value)}\n\n`);
  }
  private async start(){
    if(this.closed)throw new Error('Desktop pet has been unloaded');
    if(this.child)return this.starting;
    this.error='';
    const executable=join(process.env.SystemRoot ?? 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const script=fileURLToPath(new URL('../native/desktop-pet.ps1',import.meta.url));
    const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^DSH_/i.test(key) && !/(?:API.?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(key)));
    const child=(this.options.spawn ?? spawn)(executable,['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',script,'-ParentProcessId',String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','pipe'],env}) as ChildProcessWithoutNullStreams;
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
    const id=randomUUID(),finished=this.wait(id,(command as {type?:string})?.type==='voice-toggle'?180000:30000);
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
    for(const job of this.speechJobs)job.abort(new Error('Desktop speech was stopped'));
    this.event('stopped',this.error?{error:this.error}:{});this.clearLease();
    const child=this.child;this.cancelStart?.(new Error('Desktop pet stopped during startup'));this.cancelStart=undefined;
    this.child=undefined;this.starting=undefined;this.imageKey='';this.image=undefined;
    for(const [id] of this.pending)this.finish(id,'Desktop pet stopped');
    if(!child)return;
    if(!child.stdin.destroyed)child.stdin.end('{"type":"close"}\n');
    const stopTimer=setTimeout(()=>{if(child.exitCode===null)child.kill();},3000);
    this.stopTimer=stopTimer;stopTimer.unref();
    child.once('exit',()=>clearTimeout(stopTimer));
  }
  release(token:unknown){this.authorized(token);this.stop();}
  voiceReady(token:unknown){
    this.authorized(token);const speech=this.options.speech?.();
    if(!speech)throw new Error('请先在 DSH 中启用语音输入插件');
    const state=speech.snapshot(),provider=state.providers.find(provider=>provider.id===state.selection.providerId);
    if(!provider || (provider.preparation && provider.preparation.phase!=='ready'))throw new Error('语音识别尚未准备完成，请在 DSH 语音插件设置中准备识别模型');
    return speech;
  }
  async transcribe(token:unknown,encoded:unknown,caller:AbortSignal){
    const speech=this.voiceReady(token);
    if(typeof encoded!=='string' || encoded.length>Math.ceil(4*1024*1024/3)*4)throw new Error('录音过大');
    const audio=Buffer.from(encoded,'base64');
    if(audio.toString('base64')!==encoded || audio.length<46 || audio.toString('ascii',0,4)!=='RIFF' || audio.toString('ascii',8,12)!=='WAVE' || audio.toString('ascii',36,40)!=='data' || audio.readUInt16LE(20)!==1 || audio.readUInt16LE(22)!==1 || audio.readUInt16LE(34)!==16 || audio.readUInt32LE(40)!==audio.length-44 || audio.readUInt32LE(24)<8000 || audio.readUInt32LE(24)>48000 || (audio.length-44)/2/audio.readUInt32LE(24)>120)throw new Error('无效的录音');
    const controller=new AbortController();this.speechJobs.add(controller);
    try{return await speech.transcribe(speech.resolve({audio}),AbortSignal.any([caller,controller.signal]));}
    finally{this.speechJobs.delete(controller);}
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
