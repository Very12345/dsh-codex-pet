/** Push snapshots and receive actions over SSE even when DSH is minimized. */
import {BASE} from './model.ts';
import type {CompanionApi,CompanionSnapshot} from './companion-api.ts';
import {VoiceCapture,waveBase64} from './voice.ts';
import {LiveMicrophone} from './live-vad.ts';import {LocalVoiceCall} from './voice-call.ts';
import type {CallState} from './voice-call.ts';

export function connectDesktop(api:CompanionApi, refresh:()=>Promise<void>, failed:(error:string)=>void,
  options:{fetch?:typeof fetch; eventSource?:typeof EventSource; owner?:string}={}){
  const fetcher=options.fetch ?? fetch, Events=options.eventSource ?? EventSource;
  let active=true,token:string|undefined,stream:EventSource|undefined,release:(()=>void)|undefined;
  let connected=false,ended=false;
  let spriteKey='',spriteImage='',paintedKey='';
  let pending:CompanionSnapshot|null=null,sending=false;
  const voice=new VoiceCapture();let processing=false,startingVoice=false,recordingTimer:ReturnType<typeof setTimeout>|undefined,speechAbort:AbortController|undefined;
  const request=async(path:string,data:unknown,signal?:AbortSignal)=>{
    const response=await fetcher(`${BASE}/api/desktop/${path}`,{method:'POST',headers:{'content-type':'application/json','x-dsh-pet':'1'},body:JSON.stringify(data),signal:AbortSignal.any([AbortSignal.timeout(path==='transcribe'||path==='tts'?120000:path.startsWith('dialogue')?60000:20000),...(signal?[signal]:[])])});
    const result=await response.json();if(!response.ok)throw new Error(result.error ?? 'Desktop pet connection failed');return result;
  };
  let callPending:CallState|undefined,callSending=false;
  const publishCall=(value:CallState)=>{callPending=value;if(callSending)return;void (async()=>{callSending=true;try{while(callPending&&active&&token&&!ended){const state=callPending;callPending=undefined;await request('call-state',{token,value:state}).catch(()=>{});}}finally{callSending=false;}})();};
  let callId:string|undefined;
  const call=api.voice?new LocalVoiceCall({microphone:new LiveMicrophone(),sessions:api.voice,
    dialogue:{
      start:async(task,signal)=>{callId=crypto.randomUUID();await request('dialogue-begin',{token,callId,task},signal);},
      respond:async(input,signal)=>await request('dialogue',{token,callId,...input},signal),
      end:()=>{const endedId=callId;callId=undefined;if(endedId&&active&&!ended)void request('dialogue-end',{token,callId:endedId}).catch(()=>{});}
    },
    ready:async signal=>{await request('voice-ready',{token,localOnly:true},signal);const response=await fetcher(`${BASE}/api/desktop/tts-voices`,{signal});const value=await response.json();if(!response.ok||!value.voices?.length)throw new Error(value.error||'没有可用的 Windows 系统声音');},
    recognize:async(audio,signal)=>{const result=await request('transcribe',{token,audioBase64:waveBase64(audio),localOnly:true},signal);return result.text||'';},
    synthesize:async(text,signal)=>{const result=await request('tts',{token,text,language:String(api.getSnapshot()?.language||'zh').startsWith('en')?'en':'zh'},signal);return Uint8Array.from(atob(result.audioBase64),character=>character.charCodeAt(0));},
    publish:publishCall
  }):undefined;
  const updateComposer=async(value:unknown)=>{if(active && !ended)await request('composer',{token,value});};
  const toggleVoice=async()=>{
    if(call?.active)call.stop();
    if(processing)throw new Error('正在转写录音，请稍候');
    if(startingVoice)throw new Error('正在等待麦克风授权，请稍候');
    if(!voice.recording){
      startingVoice=true;
      try{await request('voice-ready',{token});await voice.start();}finally{startingVoice=false;}
      if(!active || ended){voice.cancel();return;}
      await updateComposer({state:'recording'});recordingTimer=setTimeout(()=>{void toggleVoice().catch(error=>updateComposer({state:'idle',error:String(error)}));},120000);return;
    }
    clearTimeout(recordingTimer);const audio=voice.stop();processing=true;speechAbort=new AbortController();const controller=speechAbort;
    try{await updateComposer({state:'processing'});const result=await request('transcribe',{token,audioBase64:waveBase64(audio)},controller.signal);if(controller.signal.aborted)return;if(typeof result.text!=='string' || !result.text.trim())throw new Error('没有识别到文字，请重试');await updateComposer({state:'idle',text:result.text});}
    catch(error){if(!controller.signal.aborted)throw error;}
    finally{processing=false;speechAbort=undefined;}
  };
  const imageFor=async(snapshot:CompanionSnapshot)=>{
    const url=snapshot.pet?.url;if(!url)return {};
    if(!url.startsWith(`${BASE}/asset/`))throw new Error('Desktop sprite must belong to the local pet library');
    if(spriteKey!==url){
      spriteImage=await new Promise<string>((resolve,reject)=>{
        const image=new Image();
        const timer=setTimeout(()=>{image.src='';reject(new Error('Desktop sprite decoding timed out'));},10000);
        image.onerror=()=>{clearTimeout(timer);reject(new Error('Desktop sprite could not be decoded'));};
        image.onload=()=>{
          clearTimeout(timer);
          try{
            if(image.naturalWidth!==1536 || ![1872,2288].includes(image.naturalHeight))throw new Error('Invalid desktop sprite dimensions');
            const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
            const context=canvas.getContext('2d');if(!context)throw new Error('Canvas is unavailable');
            context.drawImage(image,0,0);resolve(canvas.toDataURL('image/png').split(',')[1]);
          }catch(error){reject(error);}
        };image.src=url;
      });
      spriteKey=url;
    }
    return spriteKey===paintedKey?{spriteKey}:{spriteKey,image:spriteImage};
  };
  const flush=async()=>{
    if(!active || ended || !token || sending || !pending)return;
    const snapshot=pending;pending=null;sending=true;
    try{
      const sprite=await imageFor(snapshot);
      if(!active || ended)return;
      const dark=(typeof document!=='undefined' && (document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme==='dark')) || (typeof matchMedia==='function' && matchMedia('(prefers-color-scheme: dark)').matches);
      await request('snapshot',{token,snapshot:{...snapshot,...sprite,theme:dark?'dark':'light'}});
      paintedKey=snapshot.pet?.url ?? '';
      if(active && connected && !ended){release ??= api.acquireDisplay();failed('');}
    }catch(error){if(active){release?.();release=undefined;failed(String(error));}}
    finally{sending=false;if(pending && active)void flush();}
  };
  const off=api.subscribe(snapshot=>{pending=snapshot;void flush();});
  const ready=(async()=>{
    const result=await request('begin',{owner:options.owner ?? crypto.randomUUID()});token=result.token;
    if(!active){await request('end',{token}).catch(()=>{});return;}
    stream=new Events(`${BASE}/api/desktop/events?token=${encodeURIComponent(token!)}`);
    stream.addEventListener('command',event=>{
      const value=JSON.parse((event as MessageEvent).data);
      void (async()=>{
        let error:string|undefined;
        try{
          if(value.command.type==='call-toggle'){if(!call)throw new Error('当前宿主未提供通话接口');voice.cancel();clearTimeout(recordingTimer);speechAbort?.abort();await updateComposer({state:'idle'});if(call.active)call.stop();else await call.start();}
          else if(value.command.type==='call-mute')call?.mute();
          else if(value.command.type==='call-end')call?.stop();
          else if(value.command.type==='voice-toggle')await toggleVoice();
          else if(value.command.type==='voice-cancel'){voice.cancel();clearTimeout(recordingTimer);speechAbort?.abort();}
          else if(value.command.type==='settings')api.openSettings();else await api.command(value.command);
        }
        catch(cause){error=cause instanceof Error?cause.message:String(cause);}
        if(error && value.command.type==='voice-toggle')await updateComposer({state:'idle',error}).catch(()=>{});
        if(active)await request('ack',{token,id:value.id,error}).catch(()=>{});
      })();
    });
    stream.addEventListener('config',()=>{void refresh().catch(()=>{});});
    stream.addEventListener('stopped',event=>{
      ended=true;connected=false;
      voice.cancel();clearTimeout(recordingTimer);speechAbort?.abort();
      call?.stop();
      release?.();release=undefined;stream?.close();
      const value=JSON.parse((event as MessageEvent).data);failed(value.error ?? '');
    });
    stream.addEventListener('error',()=>{connected=false;voice.cancel();clearTimeout(recordingTimer);speechAbort?.abort();call?.stop();release?.();release=undefined;});
    stream.addEventListener('open',()=>{connected=true;pending=api.getSnapshot();void flush();});
    pending=api.getSnapshot();await flush();
  })().catch(error=>{if(active)failed(error instanceof Error?error.message:String(error));});
  return {ready,dispose(){if(!active)return;active=false;call?.stop();voice.cancel();clearTimeout(recordingTimer);speechAbort?.abort();off();stream?.close();release?.();release=undefined;if(token)void request('end',{token}).catch(()=>{});}};
}
