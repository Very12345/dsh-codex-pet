import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
type SpeechSpawn=(command:string,args:string[],options:{windowsHide:boolean;stdio:['pipe','pipe','pipe']})=>ChildProcessWithoutNullStreams;
export interface SystemVoice {name:string;language:string}
export interface SpeechOutput {voices():Promise<SystemVoice[]>;synthesize(text:string,voice:string,rate:number,language:string,signal:AbortSignal):Promise<Buffer>;dispose():void}
export class WindowsSpeech implements SpeechOutput {
 private jobs=new Set<AbortController>();private catalog?:Promise<SystemVoice[]>;private tail=Promise.resolve();private disposed=false;
 constructor(private platform=process.platform,private launch:SpeechSpawn=spawn){}
 private run(mode:'voices'|'synthesize',input:unknown,signal:AbortSignal):Promise<string>{
  if(this.platform!=='win32')return Promise.reject(new Error('本地通话语音输出当前支持 Windows'));
  if(this.disposed)return Promise.reject(new Error('系统语音服务已关闭'));
  signal.throwIfAborted();const controller=new AbortController();this.jobs.add(controller);
  const previous=this.tail;let release!:()=>void;this.tail=new Promise<void>(resolve=>{release=resolve;});
  return new Promise<string>((resolve,reject)=>{
   const combined=AbortSignal.any([signal,controller.signal]);let output='',settled=false,child:ChildProcessWithoutNullStreams|undefined,timer:ReturnType<typeof setTimeout>|undefined;
   const abort=()=>finish(new Error('语音输出已取消'));
   function finish(error?:Error){if(settled)return;settled=true;clearTimeout(timer);combined.removeEventListener('abort',abort);if(error){child?.kill();reject(error);}else resolve(output);}
   combined.addEventListener('abort',abort,{once:true});if(combined.aborted)abort();
   void previous.then(()=>{
    if(settled){release();return;}
    try{
     child=this.launch(join(process.env.SystemRoot||'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('../native/voice/speech.ps1',import.meta.url)),'-Mode',mode],{windowsHide:true,stdio:['pipe','pipe','pipe']});
     timer=setTimeout(()=>finish(new Error('系统语音合成超时')),20000);
     child.stdout.setEncoding('utf8');child.stdout.on('data',part=>{output+=part;if(output.length>6*1024*1024)finish(new Error('系统语音输出过大'));});child.stderr.resume();child.stdin.on('error',()=>{});
     child.on('error',()=>finish(new Error('无法启动 Windows 系统语音')));
     // Wait for stdout to drain and the owned process to actually close,
     // including after cancellation, before starting the next synthesis.
     child.once('close',code=>{finish(code===0?undefined:new Error('Windows 系统语音失败，请检查所选声音是否可用'));release();});
     child.stdin.end(input?JSON.stringify(input):'');
    }catch{finish(new Error('无法启动 Windows 系统语音'));release();}
   });
  }).finally(()=>this.jobs.delete(controller));
 }
 voices(){return this.catalog??=this.run('voices',null,new AbortController().signal).then(text=>{const list:unknown=JSON.parse(text);if(!Array.isArray(list)||list.some(voice=>!voice||typeof voice.name!=='string'||typeof voice.language!=='string'))throw new Error('系统声音列表无效');return list as SystemVoice[];}).catch(error=>{this.catalog=undefined;throw error;});}
 async synthesize(text:string,voice:string,rate:number,language:string,signal:AbortSignal){
  if(typeof text!=='string'||!text.trim()||text.length>500||typeof voice!=='string'||voice.length>160||!Number.isInteger(rate)||rate<-5||rate>5||!['zh','en'].includes(language))throw new Error('语音输出参数无效');
  const base64=await this.run('synthesize',{text,voice,rate,language},signal),bytes=Buffer.from(base64,'base64');
  if(bytes.length<44||bytes.length>4*1024*1024||bytes.toString('base64')!==base64||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw new Error('系统语音音频无效');return bytes;
 }
 dispose(){this.disposed=true;for(const job of this.jobs)job.abort();this.jobs.clear();}
}
